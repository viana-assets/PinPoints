-- =====================================================================
-- Migration 86 – „Alle Daten löschen“: Neuigkeiten neu, Chat-Fotos, klare Übersicht (09.10.2026, v142).
--
-- Wunsch Vitali 09.10.2026: Nach „Alle Daten löschen“ soll die App wirklich wie neu sein:
--   1. Chat, Zeiterfassung (Stempelzeiten, Pausen, Korrekturen, Urlaub, Heimfahrten) und die
--      Stempel-Erinnerungen gehen mit. Das taten sie schon – Migration 72 leert JEDE Tabelle in
--      public außer `alle_daten_behalten()`. Neu ist, dass die Übersicht sie einzeln nennt
--      (Oberfläche) und die Chat-Fotos dort mitzählt (`chat_fotos` in `alle_daten_umfang()`).
--   2. „Was gibt es Neues“ beginnt neu: Die Fassungen bis einschließlich der, mit der gelöscht
--      wurde, erscheinen danach nicht mehr. Die Liste selbst steht im Programm (lib/version.ts),
--      nicht in der Datenbank – gespeichert wird hier nur, AB WELCHER Fassung sie gilt
--      (`app_stand.neuigkeiten_ab`). Die Tabelle übersteht das Löschen (`alle_daten_behalten()`).
--   3. Chat-Fotos verschwinden sofort: Die Dateien löscht die App nach dem Löschen über
--      app/api/alle-daten/fotos (Dienstschlüssel, nur Superadmin). SQL darf Storage nicht löschen
--      (Migration 65); vorgemerkt werden sie wie bisher vom TRUNCATE-Trigger aus Migration 84.
--
-- `alle_daten_loeschen()` bekommt dafür einen zweiten, freiwilligen Wert `p_fassung` (z. B. 'v142').
-- Die alte Form mit nur einem Wert entfällt; ein Aufruf mit nur `p_bestaetigung` (App vor v142)
-- trifft weiter dieselbe Funktion (Vorgabe null = Neuigkeiten bleiben).
--
-- Reihenfolge: nach 84 (85 empfohlen vorher), SQL zuerst, dann die Dateien von v142. Zweiter Lauf
-- folgenlos. Gelöscht wird hier NICHTS.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.alle_daten_umfang()') is null then
    raise exception 'Zuerst Migration 72 (Alle Daten löschen) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('public.chat_gelesen_direkt') is null then
    raise exception 'Zuerst Migration 84 (Chat: Einzelchats, Bearbeiten, Fotos) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- =====================================================================
-- 1. Der Stand der App, der das Löschen übersteht – genau eine Zeile.
-- =====================================================================
create table if not exists public.app_stand (
  id                 boolean primary key default true,
  neuigkeiten_ab     text,
  alles_geloescht_am timestamptz,
  constraint app_stand_eine_zeile check (id),
  constraint app_stand_fassung check (neuigkeiten_ab is null or neuigkeiten_ab ~ '^v[0-9]+$')
);
comment on table public.app_stand is
  'Migration 86: Stand der App, der „Alle Daten löschen“ übersteht. neuigkeiten_ab = „Was gibt es Neues“ zeigt nur Fassungen NACH dieser.';
alter table public.app_stand enable row level security;
-- Lesen dürfen alle Angemeldeten (die Neuigkeiten sieht jeder Admin); geschrieben wird nur aus
-- alle_daten_loeschen() (security definer) – keine Schreibrichtlinie.
drop policy if exists "App-Stand lesen" on public.app_stand;
create policy "App-Stand lesen" on public.app_stand for select to authenticated using (true);
revoke all on public.app_stand from anon;
revoke insert, update, delete, truncate on public.app_stand from authenticated;
grant select on public.app_stand to authenticated;

-- =====================================================================
-- 2. Was erhalten bleibt: dazu app_stand.
-- =====================================================================
create or replace function public.alle_daten_behalten()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['profiles', 'module_permissions', 'user_settings', 'push_geraete', 'app_stand']::text[] $$;

-- =====================================================================
-- 3. Umfang: dazu die Chat-Fotos.
-- =====================================================================
create or replace function public.alle_daten_umfang()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  n bigint;
  tabellen jsonb := '{}'::jsonb;
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Alle Daten löschen darf nur der Superadmin.';
  end if;
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and not (tablename = any(public.alle_daten_behalten()))
     order by tablename
  loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    tabellen := tabellen || jsonb_build_object(t.tablename, n);
  end loop;
  return jsonb_build_object(
    'tabellen', tabellen,
    'zugaenge_weg', (select count(*) from public.profiles p where coalesce(p.role, '') not in ('admin', 'superadmin')),
    'zugaenge_bleiben', (select count(*) from public.profiles p where p.role in ('admin', 'superadmin')),
    'belege', (select count(*) from public.auftrag_belege),
    'rechnungen_echt', (select count(*) from public.rechnungen r where r.nummer > 0),
    -- Migration 86: Fotos im Chat (auch in Einzelchats, die der Superadmin nicht lesen darf –
    -- gezählt wird nur, nicht gezeigt).
    'chat_fotos', (select count(*) from public.chat_nachrichten c where c.foto_pfad is not null)
  );
end;
$$;

-- =====================================================================
-- 4. Löschen: mit Fassung für „Was gibt es Neues“.
-- =====================================================================
drop function if exists public.alle_daten_loeschen(text);

create or replace function public.alle_daten_loeschen(p_bestaetigung text, p_fassung text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  umfang jsonb;
  liste text;
  s record;
  zugaenge integer;
  fassung text := nullif(trim(coalesce(p_fassung, '')), '');
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Alle Daten löschen darf nur der Superadmin.';
  end if;
  if p_bestaetigung is distinct from 'löschen' then
    raise exception 'Zum Bestätigen genau das Wort „löschen“ eintippen (klein geschrieben).';
  end if;
  if fassung is not null and fassung !~ '^v[0-9]+$' then
    raise exception 'Die Fassung muss wie „v142“ aussehen.';
  end if;

  umfang := public.alle_daten_umfang();

  -- 1. Zugänge außer Admin und Superadmin. Mit dem Benutzer gehen Profil, Einstellungen und
  --    angemeldete Geräte (Fremdschlüssel mit Kaskade).
  delete from auth.users u
   where u.id <> (select auth.uid())
     and not exists (select 1 from public.profiles p where p.id = u.id and p.role in ('admin', 'superadmin'));
  get diagnostics zugaenge = row_count;

  -- 2. Alle übrigen Tabellen in EINER Anweisung, Zähler auf Anfang. Darunter seit Migration 80–85
  --    Chat (Nachrichten, Reaktionen, Lesestände) und Zeiterfassung (Schichten, Pausen,
  --    Korrekturen, Urlaub, Heimfahrten, Stempel-Erinnerungen). Der TRUNCATE-Trigger am Chat
  --    (Migration 84) merkt die Fotopfade in private.chat_fotos_weg vor.
  select string_agg(format('public.%I', tablename), ', ' order by tablename) into liste
    from pg_tables
   where schemaname = 'public' and not (tablename = any(public.alle_daten_behalten()));
  if liste is not null then
    execute 'truncate table ' || liste || ' restart identity';
  end if;

  -- 3. Alle Nummernkreise (Aufträge, Testaufträge, Testrechnungen, Artikel, Protokoll) neu.
  for s in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('alter sequence public.%I restart', s.sequencename);
  end loop;

  -- 4. Der Betrieb ist genau eine Zeile (Migration 38) – leer neu anlegen.
  insert into public.betrieb (id) values (true) on conflict (id) do nothing;

  -- 5. „Was gibt es Neues“ beginnt neu (Migration 86). Ohne Fassung (App vor v142) bleibt
  --    der bisherige Stand.
  insert into public.app_stand (id, neuigkeiten_ab, alles_geloescht_am)
  values (true, fassung, now())
  on conflict (id) do update
    set neuigkeiten_ab = coalesce(excluded.neuigkeiten_ab, public.app_stand.neuigkeiten_ab),
        alles_geloescht_am = excluded.alles_geloescht_am;

  -- 6. Ein einziger Protokolleintrag: dass, wann und von wem – ohne Inhalte.
  truncate table public.audit_log restart identity;
  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values ('betrieb', 'alle', 'DELETE',
          jsonb_build_object('alle_daten_geloescht', true, 'zugaenge_geloescht', zugaenge),
          null, (select auth.uid()));

  return umfang || jsonb_build_object('zugaenge_geloescht', zugaenge, 'neuigkeiten_ab', fassung);
end;
$$;

comment on function public.alle_daten_loeschen(text, text) is
  'Migration 72/86: löscht alle Daten außer Admin-/Superadmin-Zugängen, ihren Einstellungen und Geräten, der Rechtetabelle und app_stand. Nur Superadmin, nur mit dem Wort „löschen“. p_fassung: „Was gibt es Neues“ beginnt nach dieser Fassung.';
comment on function public.alle_daten_umfang() is 'Migration 72/86: Zeilen je Tabelle, die „Alle Daten löschen“ entfernen würde, dazu Zugänge, Fotos, Chat-Fotos. Nur Superadmin.';

revoke all on function public.alle_daten_umfang() from public, anon;
revoke all on function public.alle_daten_loeschen(text, text) from public, anon;
revoke all on function public.alle_daten_behalten() from public, anon;
grant execute on function public.alle_daten_umfang() to authenticated;
grant execute on function public.alle_daten_loeschen(text, text) to authenticated;

-- =====================================================================
-- 5. Kontrolle – eine Ergebnistabelle. Gelöscht wird hier NICHTS.
-- =====================================================================
select 'Funktion alle_daten_loeschen(Bestätigung, Fassung)' as pruefung,
       (to_regprocedure('public.alle_daten_loeschen(text,text)') is not null
        and to_regprocedure('public.alle_daten_loeschen(text)') is null)::text as ergebnis
union all
select 'Tabelle app_stand (RLS an)',
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end
                   from pg_class c where c.oid = to_regclass('public.app_stand')), 'fehlt')
union all
select 'Tabellen, die erhalten bleiben', array_to_string(public.alle_daten_behalten(), ', ')
union all
select 'Richtlinien auf app_stand',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p
                  where p.schemaname = 'public' and p.tablename = 'app_stand'), 'keine');

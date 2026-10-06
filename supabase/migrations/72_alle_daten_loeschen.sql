-- =====================================================================
-- Migration 72 – „Alle Daten löschen“ für den Superadmin (06.10.2026, v117).
--
-- Wunsch 06.10.2026: Der Superadmin soll die Datenbank mit einem Befehl auf null stellen
-- können – als wäre es ein frisches Unternehmen. Entschieden (Rückfrage 06.10.2026):
--   - Es wird WIRKLICH ALLES gelöscht, auch ausgestellte Rechnungen, Artikel, Preise, Lager und
--     Plätze, Mitarbeiter, Transporter, der Briefkopf; die Nummernkreise beginnen neu.
--   - Übrig bleiben nur die Zugänge mit der Rolle Admin oder Superadmin (mit ihren Einstellungen
--     und angemeldeten Geräten) und die Rechtetabelle. Alle anderen Zugänge werden gelöscht.
--   - Eine Sicherung wird angeboten, ist aber keine Pflicht (`alle_daten_sicherung()`).
--
-- Rechtlicher Hinweis, der auch im Fenster steht: Ausgestellte Rechnungen unterliegen der
-- Aufbewahrungspflicht. Wer echte Rechnungen löscht, muss sie anderswo aufbewahren.
--
-- Drei Funktionen, alle nur für den Superadmin:
--   alle_daten_umfang()              wie viel gelöscht würde (für das Fenster)
--   alle_daten_sicherung()           alle Tabellen als eine JSON-Datei
--   alle_daten_loeschen('löschen')   löscht – nur mit genau diesem Wort
--
-- Gelöscht werden ALLE Tabellen im Schema public außer der Liste `behalten` unten – eine später
-- hinzukommende Tabelle wird also mitgelöscht. Wer eine neue EINSTELLUNGS-Tabelle anlegt, die
-- erhalten bleiben soll, trägt sie dort ein (CLAUDE.md, Abschnitt 2).
--
-- Gelöscht wird mit TRUNCATE in einer Anweisung: Ein Funktionsaufruf ist eine Anweisung, also
-- ganz oder gar nicht. TRUNCATE löst die Zeilen-Trigger nicht aus (Rechnungsschutz, Löschrechte,
-- Protokoll) – das ist hier gewollt; am Ende steht ein einziger Protokolleintrag „alle Daten
-- gelöscht“. Die Bilddateien (Fotos, Unterschriften) löscht die App VORHER über die
-- Storage-Schnittstelle; SQL darf das in Supabase nicht (Migration 65).
--
-- Reihenfolge: nach 71, SQL zuerst, dann die Dateien von v117.
-- =====================================================================
begin;

-- Die Tabellen, die erhalten bleiben. Eine Funktion statt einer Konstanten, damit alle drei
-- Funktionen dieselbe Liste lesen.
create or replace function public.alle_daten_behalten()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['profiles', 'module_permissions', 'user_settings', 'push_geraete']::text[] $$;

-- Wie viele Zeilen je Tabelle gelöscht würden, und wie viele Zugänge.
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
    'rechnungen_echt', (select count(*) from public.rechnungen r where r.nummer > 0)
  );
end;
$$;

-- Alle Tabellen des Schemas public als ein JSON-Dokument – die Sicherung vor dem Löschen. Die
-- Bilder selbst stecken nicht darin, nur ihre Liste (`auftrag_belege`).
create or replace function public.alle_daten_sicherung()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  zeilen jsonb;
  tabellen jsonb := '{}'::jsonb;
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Die Sicherung aller Daten erstellt nur der Superadmin.';
  end if;
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.tablename) into zeilen;
    tabellen := tabellen || jsonb_build_object(t.tablename, zeilen);
  end loop;
  return jsonb_build_object(
    'art', 'MR Assistent – Sicherung aller Daten',
    'erstellt', now(),
    'erstellt_von', (select auth.uid()),
    'datenbank', current_database(),
    'tabellen', tabellen
  );
end;
$$;

-- Löscht alle Daten. Nur der Superadmin, nur mit dem Wort „löschen“ (klein).
create or replace function public.alle_daten_loeschen(p_bestaetigung text)
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
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Alle Daten löschen darf nur der Superadmin.';
  end if;
  if p_bestaetigung is distinct from 'löschen' then
    raise exception 'Zum Bestätigen genau das Wort „löschen“ eintippen (klein geschrieben).';
  end if;

  umfang := public.alle_daten_umfang();

  -- 1. Zugänge außer Admin und Superadmin. Mit dem Benutzer gehen Profil, Einstellungen und
  --    angemeldete Geräte (Fremdschlüssel mit Kaskade).
  delete from auth.users u
   where u.id <> (select auth.uid())
     and not exists (select 1 from public.profiles p where p.id = u.id and p.role in ('admin', 'superadmin'));
  get diagnostics zugaenge = row_count;

  -- 2. Alle übrigen Tabellen in EINER Anweisung, Zähler auf Anfang.
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

  -- 4. Der Betrieb ist genau eine Zeile (Migration 38) – leer neu anlegen. Damit beginnen auch
  --    Rechnungs- und Kundennummern wieder bei ihrem Anfangswert.
  insert into public.betrieb (id) values (true) on conflict (id) do nothing;

  -- 5. Ein einziger Protokolleintrag: dass, wann und von wem – ohne Inhalte. (Der Eintrag aus
  --    Schritt 4 wird dafür wieder entfernt.)
  truncate table public.audit_log restart identity;
  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values ('betrieb', 'alle', 'DELETE',
          jsonb_build_object('alle_daten_geloescht', true, 'zugaenge_geloescht', zugaenge),
          null, (select auth.uid()));

  return umfang || jsonb_build_object('zugaenge_geloescht', zugaenge);
end;
$$;

comment on function public.alle_daten_loeschen(text) is
  'Migration 72: löscht alle Daten außer Admin-/Superadmin-Zugängen, ihren Einstellungen und Geräten und der Rechtetabelle. Nur Superadmin, nur mit dem Wort „löschen“.';
comment on function public.alle_daten_sicherung() is 'Migration 72: alle Tabellen als JSON (Sicherung vor dem Löschen). Nur Superadmin.';
comment on function public.alle_daten_umfang() is 'Migration 72: Zeilen je Tabelle, die „Alle Daten löschen“ entfernen würde. Nur Superadmin.';

revoke all on function public.alle_daten_umfang() from public, anon;
revoke all on function public.alle_daten_sicherung() from public, anon;
revoke all on function public.alle_daten_loeschen(text) from public, anon;
revoke all on function public.alle_daten_behalten() from public, anon;
grant execute on function public.alle_daten_umfang() to authenticated;
grant execute on function public.alle_daten_sicherung() to authenticated;
grant execute on function public.alle_daten_loeschen(text) to authenticated;

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen. Gelöscht
-- wird hier NICHTS; das geht nur über die App.
select 'Funktion alle_daten_loeschen' as pruefung,
       (to_regprocedure('public.alle_daten_loeschen(text)') is not null)::text as ergebnis
union all
select 'Funktion alle_daten_sicherung', (to_regprocedure('public.alle_daten_sicherung()') is not null)::text
union all
select 'Tabellen, die erhalten bleiben', array_to_string(public.alle_daten_behalten(), ', ');

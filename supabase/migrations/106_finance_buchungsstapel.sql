-- =====================================================================
-- Migration 106 – Finance, Stufe C (Teil 1): Buchungsstapel (30.10.2026, v180).
--
-- docs/finance.md Abschnitt 12. Wie bei DATEV: Buchungen werden erst in einem STAPEL erfasst – vorläufig, änderbar,
-- löschbar – und mit „Stapel buchen“ auf einmal ins Journal geschrieben. Erst dann bekommen sie eine Nummer und
-- sind nach GoBD unveränderlich (Korrektur nur per Storno). So lässt sich ein Monat Belege in Ruhe abtippen und
-- vor dem Buchen gegen die Summe auf dem Kontoauszug prüfen.
--
--   1. `fin_stapel` (Bezeichnung, Wirtschaftsjahr, Zustand offen/gebucht) und `fin_stapel_zeilen` (Datum, Beleg,
--      Soll, Haben, Betrag, Steuerschlüssel, Text – genau ein Posten von `fin_buchen()`).
--   2. Geschrieben nur über Funktionen mit Klartext-Prüfung: `fin_stapel_anlegen()`, `fin_stapel_zeile_speichern()`,
--      `fin_stapel_zeile_loeschen()`, `fin_stapel_loeschen()`. Ein gebuchter Stapel ändert sich nicht mehr.
--   3. `fin_stapel_buchen()`: bucht jede Zeile über `fin_buchen()` (dieselben Regeln, dieselbe Steuer, dieselbe
--      Festschreibungsprüfung) – ALLE ODER KEINE: Scheitert eine Zeile, bleibt der Stapel offen, und der Fehler
--      nennt die Zeile. Die Buchungen bekommen fortlaufende Nummern in der Reihenfolge Datum, dann Erfassung.
--
-- Rechte wie das Journal: lesen mit „Finance › Buchungen“ lesen, alles andere mit „Finance › Buchungen“ schreiben.
-- Stapel sind Fachdaten: „Alle Daten löschen“ (Migration 72) leert sie mit. PILOT wie alles in Finance.
-- Reihenfolge: nach 105, SQL zuerst, dann v180. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.fin_buchen(date,text,text,jsonb)') is null or to_regclass('public.fin_planposten') is null then
    raise exception 'Zuerst die Finance-Migrationen 88 bis 100 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.fin_stapel (
  id           uuid primary key default gen_random_uuid(),
  jahr         integer not null,
  bezeichnung  text not null,
  zustand      text not null default 'offen',
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  gebucht_am   timestamptz,
  gebucht_von  uuid,
  constraint fin_stapel_jahr check (jahr between 2000 and 2100),
  constraint fin_stapel_bez check (length(btrim(bezeichnung)) between 1 and 80),
  constraint fin_stapel_zustand check (zustand in ('offen', 'gebucht'))
);
create index if not exists fin_stapel_jahr_idx on public.fin_stapel (jahr, zustand);

create table if not exists public.fin_stapel_zeilen (
  id           uuid primary key default gen_random_uuid(),
  stapel_id    uuid not null references public.fin_stapel (id) on delete cascade,
  -- Reihenfolge der Erfassung (bei gleichem Datum bucht die zuerst erfasste zuerst).
  lfd          bigint generated always as identity,
  datum        date not null,
  beleg        text,
  text         text not null,
  soll         integer not null,
  haben        integer not null,
  betrag       numeric(14,2) not null,
  steuer       text,
  buchung_id   uuid references public.fin_buchungen (id),
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  constraint fin_sz_text check (length(btrim(text)) between 1 and 200),
  constraint fin_sz_beleg check (beleg is null or length(beleg) <= 60),
  constraint fin_sz_konten check (soll > 0 and haben > 0 and soll <> haben),
  constraint fin_sz_betrag check (betrag > 0 and betrag <= 10000000)
);
create index if not exists fin_sz_stapel on public.fin_stapel_zeilen (stapel_id, datum, lfd);

alter table public.fin_stapel enable row level security;
alter table public.fin_stapel_zeilen enable row level security;
drop policy if exists "Finance-Stapel lesen" on public.fin_stapel;
create policy "Finance-Stapel lesen" on public.fin_stapel for select to authenticated using (public.darf('finance.buchen', 'lesen'));
drop policy if exists "Finance-Stapelzeilen lesen" on public.fin_stapel_zeilen;
create policy "Finance-Stapelzeilen lesen" on public.fin_stapel_zeilen for select to authenticated using (public.darf('finance.buchen', 'lesen'));
revoke all on public.fin_stapel, public.fin_stapel_zeilen from anon, authenticated;
grant select on public.fin_stapel, public.fin_stapel_zeilen to authenticated;
comment on table public.fin_stapel is
  'Migration 106: Buchungsstapel (offen = vorläufig erfasst, gebucht = ins Journal übernommen). Geschrieben nur über fin_stapel_*(). docs/finance.md Abschnitt 12.';
comment on table public.fin_stapel_zeilen is
  'Migration 106: Zeilen eines Buchungsstapels, je ein Posten von fin_buchen(). Nach dem Buchen mit buchung_id.';

-- ---------------------------------------------------------------------
-- 2. Erfassen
-- ---------------------------------------------------------------------
create or replace function public.fin_stapel_recht()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Erfassen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
end;
$$;

-- Sperrt den Stapel für die Dauer der Anweisung und lehnt einen gebuchten ab.
create or replace function public.fin_stapel_offen(p_stapel uuid)
returns public.fin_stapel
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
begin
  select * into st from public.fin_stapel where id = p_stapel for update;
  if st.id is null then raise exception 'Diesen Stapel gibt es nicht (mehr).'; end if;
  if st.zustand <> 'offen' then raise exception 'Der Stapel „%“ ist schon gebucht – er ändert sich nicht mehr.', st.bezeichnung; end if;
  return st;
end;
$$;

create or replace function public.fin_stapel_anlegen(p_jahr integer, p_bezeichnung text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
begin
  perform public.fin_stapel_recht();
  if p_jahr is null or p_jahr not between 2000 and 2100 then raise exception 'Das Wirtschaftsjahr fehlt.'; end if;
  if coalesce(btrim(p_bezeichnung), '') = '' or length(btrim(p_bezeichnung)) > 80 then
    raise exception 'Die Bezeichnung fehlt (höchstens 80 Zeichen).';
  end if;
  insert into public.fin_stapel (jahr, bezeichnung) values (p_jahr, btrim(p_bezeichnung)) returning id into neu;
  return neu;
end;
$$;

-- Neu (p_id null) oder ändern. Geprüft wird hier nur, was ohne Buchen klar ist; die Buchungsregeln (Konto da,
-- Steuerschlüssel passt, Monat offen) prüft `fin_buchen()` beim Buchen – die App zeigt sie vorher an
-- (`stapelPruefung`, lib/finance/stapel.ts).
create or replace function public.fin_stapel_zeile_speichern(p_id uuid, p_stapel uuid, p_datum date, p_beleg text, p_text text,
  p_soll integer, p_haben integer, p_betrag numeric, p_steuer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  neu uuid;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_datum is null then raise exception 'Das Datum fehlt.'; end if;
  if extract(year from p_datum)::integer <> st.jahr then
    raise exception 'Das Datum % liegt nicht im Wirtschaftsjahr % des Stapels.', to_char(p_datum, 'DD.MM.YYYY'), st.jahr;
  end if;
  if coalesce(btrim(p_text), '') = '' or length(btrim(p_text)) > 200 then raise exception 'Der Buchungstext fehlt (höchstens 200 Zeichen).'; end if;
  if p_beleg is not null and length(btrim(p_beleg)) > 60 then raise exception 'Die Belegnummer ist zu lang (höchstens 60 Zeichen).'; end if;
  if p_soll is null or p_haben is null or p_soll <= 0 or p_haben <= 0 then raise exception 'Soll- und Haben-Konto angeben.'; end if;
  if p_soll = p_haben then raise exception 'Soll und Haben sind dasselbe Konto.'; end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag > 10000000 or p_betrag <> round(p_betrag, 2) then
    raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).';
  end if;

  if p_id is null then
    insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer)
    values (p_stapel, p_datum, nullif(btrim(coalesce(p_beleg, '')), ''), btrim(p_text), p_soll, p_haben, p_betrag,
            nullif(btrim(coalesce(p_steuer, '')), ''))
    returning id into neu;
    return neu;
  end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), soll = p_soll, haben = p_haben,
         betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), geaendert_am = now()
   where id = p_id and stapel_id = p_stapel;
  if not found then raise exception 'Diese Zeile gibt es in dem Stapel nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_stapel_zeile_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  perform public.fin_stapel_recht();
  select stapel_id into s from public.fin_stapel_zeilen where id = p_id;
  if s is null then raise exception 'Diese Zeile gibt es nicht (mehr).'; end if;
  perform public.fin_stapel_offen(s);
  delete from public.fin_stapel_zeilen where id = p_id;
end;
$$;

create or replace function public.fin_stapel_loeschen(p_stapel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fin_stapel_recht();
  perform public.fin_stapel_offen(p_stapel);
  delete from public.fin_stapel where id = p_stapel;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Buchen – alle oder keine
-- ---------------------------------------------------------------------
create or replace function public.fin_stapel_buchen(p_stapel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  z record;
  r jsonb;
  i integer := 0;
  erste integer;
  letzte integer;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if not exists (select 1 from public.fin_stapel_zeilen where stapel_id = p_stapel) then
    raise exception 'Der Stapel „%“ ist leer.', st.bezeichnung;
  end if;
  for z in select * from public.fin_stapel_zeilen where stapel_id = p_stapel order by datum, lfd loop
    i := i + 1;
    begin
      r := public.fin_buchen(z.datum, z.text, z.beleg,
        jsonb_build_array(jsonb_build_object('soll', z.soll, 'haben', z.haben, 'betrag', z.betrag, 'steuer', z.steuer)));
    exception when others then
      -- Die ganze Anweisung bricht ab: Nichts aus diesem Stapel ist gebucht, der Stapel bleibt offen.
      raise exception 'Zeile % (% · %): % – nichts gebucht, der Stapel bleibt offen.', i, to_char(z.datum, 'DD.MM.'), left(z.text, 40), sqlerrm;
    end;
    update public.fin_stapel_zeilen set buchung_id = (r ->> 'id')::uuid where id = z.id;
    erste := coalesce(erste, (r ->> 'nr')::integer);
    letzte := (r ->> 'nr')::integer;
  end loop;
  update public.fin_stapel set zustand = 'gebucht', gebucht_am = now(), gebucht_von = auth.uid() where id = p_stapel;
  return jsonb_build_object('anzahl', i, 'jahr', st.jahr, 'von', erste, 'bis', letzte);
end;
$$;

revoke all on function public.fin_stapel_recht() from public, anon, authenticated;
revoke all on function public.fin_stapel_offen(uuid) from public, anon, authenticated;
revoke all on function public.fin_stapel_anlegen(integer, text) from public, anon;
revoke all on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text) from public, anon;
revoke all on function public.fin_stapel_zeile_loeschen(uuid) from public, anon;
revoke all on function public.fin_stapel_loeschen(uuid) from public, anon;
revoke all on function public.fin_stapel_buchen(uuid) from public, anon;
grant execute on function public.fin_stapel_anlegen(integer, text) to authenticated;
grant execute on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text) to authenticated;
grant execute on function public.fin_stapel_zeile_loeschen(uuid) to authenticated;
grant execute on function public.fin_stapel_loeschen(uuid) to authenticated;
grant execute on function public.fin_stapel_buchen(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabellen fin_stapel / fin_stapel_zeilen (RLS)' as pruefung,
       case when (select bool_and(c.relrowsecurity) from pg_class c
                   where c.oid in (to_regclass('public.fin_stapel'), to_regclass('public.fin_stapel_zeilen'))) then 'da, RLS an'
            else 'fehlt oder RLS AUS' end as ergebnis
union all
select 'Richtlinien',
       coalesce((select string_agg(p.tablename || ': ' || p.cmd || ' · ' || p.policyname, ', ' order by p.tablename)
                   from pg_policies p where p.schemaname = 'public' and p.tablename in ('fin_stapel', 'fin_stapel_zeilen')), 'keine')
union all
select 'Funktionen (anlegen, Zeile speichern/löschen, Stapel löschen, buchen)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('fin_stapel_anlegen', 'fin_stapel_zeile_speichern', 'fin_stapel_zeile_loeschen',
                                                      'fin_stapel_loeschen', 'fin_stapel_buchen')) || ' von 5'
union all
select 'Offene Stapel', (select count(*)::text from public.fin_stapel where zustand = 'offen');

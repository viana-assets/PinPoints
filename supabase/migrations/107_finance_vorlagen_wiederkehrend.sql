-- =====================================================================
-- Migration 107 – Finance, Stufe C (Teil 2): Buchungsvorlagen und wiederkehrende Buchungen (30.10.2026, v181).
--
-- docs/finance.md Abschnitt 13. Was jeden Monat gleich gebucht wird (Miete, Leasing, Versicherung, Kontoführung),
-- soll niemand neu abtippen:
--
--   1. VORLAGEN `fin_vorlagen`: Kurzname, Soll, Haben, Steuerschlüssel, Text, Betrag (frei lassen = jedes Mal neu).
--      Im Buchungsstapel wählt man die Vorlage, und die Erfassungszeile ist ausgefüllt.
--   2. WIEDERKEHRENDE BUCHUNGEN `fin_wiederkehrend`: dieselben Felder mit festem Betrag, dazu Rhythmus (monatlich,
--      vierteljährlich, halbjährlich, jährlich – dieselben Werte wie die Planposten, Migration 100), erster Termin,
--      optional „bis“, aktiv ja/nein. Termine wie bei den Planposten: gleicher Tag im Monat, am Monatsende
--      abgeschnitten (31.01. → 28.02. → 31.03.), immer vom ersten Termin aus gerechnet.
--   3. `fin_wiederkehrend_holen(stapel, bis)`: legt jeden fälligen Termin bis zum Stichtag als Zeile in einen OFFENEN
--      Stapel – nur Termine im Jahr des Stapels und nur solche, die noch in keinem Stapel stehen. Gebucht wird
--      NICHTS automatisch: Die Zeilen stehen im Stapel, man sieht sie durch und bucht wie jede andere Zeile.
--      Wird eine geholte Zeile (oder der ganze offene Stapel) gelöscht, ist der Termin wieder offen.
--
-- Dafür bekommt `fin_stapel_zeilen` zwei Spalten: `wiederkehrend_id` und `termin` (eindeutig je Termin).
-- Rechte wie das Journal: lesen mit „Finance › Buchungen“ lesen, schreiben mit „Finance › Buchungen“ schreiben.
-- Fachdaten: „Alle Daten löschen“ leert sie mit. Reihenfolge: nach 106, SQL zuerst, dann v181. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_stapel_zeilen') is null or to_regprocedure('public.fin_stapel_buchen(uuid)') is null then
    raise exception 'Zuerst Migration 106 (Finance: Buchungsstapel) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Vorlagen
-- ---------------------------------------------------------------------
create table if not exists public.fin_vorlagen (
  id           uuid primary key default gen_random_uuid(),
  kurz         text not null,
  text         text not null,
  soll         integer not null,
  haben        integer not null,
  betrag       numeric(14,2),
  steuer       text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  constraint fin_vl_kurz check (length(btrim(kurz)) between 1 and 40),
  constraint fin_vl_text check (length(btrim(text)) between 1 and 200),
  constraint fin_vl_konten check (soll > 0 and haben > 0 and soll <> haben),
  constraint fin_vl_betrag check (betrag is null or (betrag > 0 and betrag <= 10000000))
);
create unique index if not exists fin_vorlagen_kurz on public.fin_vorlagen (lower(btrim(kurz)));

-- ---------------------------------------------------------------------
-- 2. Wiederkehrende Buchungen
-- ---------------------------------------------------------------------
create table if not exists public.fin_wiederkehrend (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  soll         integer not null,
  haben        integer not null,
  betrag       numeric(14,2) not null,
  steuer       text,
  rhythmus     text not null,
  ab           date not null,
  bis          date,
  aktiv        boolean not null default true,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  constraint fin_wk_text check (length(btrim(text)) between 1 and 180),
  constraint fin_wk_konten check (soll > 0 and haben > 0 and soll <> haben),
  constraint fin_wk_betrag check (betrag > 0 and betrag <= 10000000),
  constraint fin_wk_rhythmus check (rhythmus in ('monat', 'quartal', 'halbjahr', 'jahr')),
  constraint fin_wk_bis check (bis is null or bis >= ab)
);

alter table public.fin_stapel_zeilen add column if not exists wiederkehrend_id uuid references public.fin_wiederkehrend (id) on delete set null;
alter table public.fin_stapel_zeilen add column if not exists termin date;
-- Ein Termin steht in höchstens einem Stapel. Wird die Zeile gelöscht, ist er wieder offen.
create unique index if not exists fin_sz_termin on public.fin_stapel_zeilen (wiederkehrend_id, termin) where wiederkehrend_id is not null;

alter table public.fin_vorlagen enable row level security;
alter table public.fin_wiederkehrend enable row level security;
drop policy if exists "Finance-Vorlagen lesen" on public.fin_vorlagen;
create policy "Finance-Vorlagen lesen" on public.fin_vorlagen for select to authenticated using (public.darf('finance.buchen', 'lesen'));
drop policy if exists "Finance-Wiederkehrend lesen" on public.fin_wiederkehrend;
create policy "Finance-Wiederkehrend lesen" on public.fin_wiederkehrend for select to authenticated using (public.darf('finance.buchen', 'lesen'));
revoke all on public.fin_vorlagen, public.fin_wiederkehrend from anon, authenticated;
grant select on public.fin_vorlagen, public.fin_wiederkehrend to authenticated;
comment on table public.fin_vorlagen is
  'Migration 107: Buchungsvorlagen für den Stapel (Betrag leer = jedes Mal neu). Geschrieben nur über fin_vorlage_*(). docs/finance.md Abschnitt 13.';
comment on table public.fin_wiederkehrend is
  'Migration 107: wiederkehrende Buchungen; fin_wiederkehrend_holen() legt fällige Termine als Zeilen in einen offenen Stapel. Nichts wird automatisch gebucht.';

-- Gemeinsame Prüfung der Buchungsfelder (Klartext wie beim Stapel).
create or replace function public.fin_felder_pruefen(p_text text, p_soll integer, p_haben integer, p_betrag numeric, p_textmax integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(btrim(p_text), '') = '' or length(btrim(p_text)) > p_textmax then raise exception 'Der Buchungstext fehlt (höchstens % Zeichen).', p_textmax; end if;
  if p_soll is null or p_haben is null or p_soll <= 0 or p_haben <= 0 then raise exception 'Soll- und Haben-Konto angeben.'; end if;
  if p_soll = p_haben then raise exception 'Soll und Haben sind dasselbe Konto.'; end if;
  if p_betrag is not null and (p_betrag <= 0 or p_betrag > 10000000 or p_betrag <> round(p_betrag, 2)) then
    raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).';
  end if;
end;
$$;

create or replace function public.fin_vorlage_speichern(p_id uuid, p_kurz text, p_text text, p_soll integer, p_haben integer,
  p_betrag numeric, p_steuer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
begin
  perform public.fin_stapel_recht();
  if coalesce(btrim(p_kurz), '') = '' or length(btrim(p_kurz)) > 40 then raise exception 'Der Kurzname fehlt (höchstens 40 Zeichen).'; end if;
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 200);
  if exists (select 1 from public.fin_vorlagen v where lower(btrim(v.kurz)) = lower(btrim(p_kurz)) and v.id is distinct from p_id) then
    raise exception 'Eine Vorlage „%“ gibt es schon.', btrim(p_kurz);
  end if;
  if p_id is null then
    insert into public.fin_vorlagen (kurz, text, soll, haben, betrag, steuer)
    values (btrim(p_kurz), btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''))
    returning id into neu;
    return neu;
  end if;
  update public.fin_vorlagen
     set kurz = btrim(p_kurz), text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag,
         steuer = nullif(btrim(coalesce(p_steuer, '')), ''), geaendert_am = now()
   where id = p_id;
  if not found then raise exception 'Diese Vorlage gibt es nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_vorlage_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fin_stapel_recht();
  delete from public.fin_vorlagen where id = p_id;
  if not found then raise exception 'Diese Vorlage gibt es nicht (mehr).'; end if;
end;
$$;

-- Der erste Termin steht fest, sobald ein Termin in einem Stapel steht – sonst verschöben sich die Termine unter den
-- schon geholten weg (und derselbe Monat käme zweimal).
create or replace function public.fin_wiederkehrend_speichern(p_id uuid, p_text text, p_soll integer, p_haben integer, p_betrag numeric,
  p_steuer text, p_rhythmus text, p_ab date, p_bis date, p_aktiv boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt public.fin_wiederkehrend%rowtype;
  neu uuid;
begin
  perform public.fin_stapel_recht();
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 180);
  if p_betrag is null then raise exception 'Eine wiederkehrende Buchung braucht einen festen Betrag.'; end if;
  if p_rhythmus is null or p_rhythmus not in ('monat', 'quartal', 'halbjahr', 'jahr') then raise exception 'Unbekannter Rhythmus.'; end if;
  if p_ab is null then raise exception 'Der erste Termin fehlt.'; end if;
  if p_bis is not null and p_bis < p_ab then raise exception '„Bis“ liegt vor dem ersten Termin.'; end if;
  if p_id is null then
    insert into public.fin_wiederkehrend (text, soll, haben, betrag, steuer, rhythmus, ab, bis, aktiv)
    values (btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''), p_rhythmus, p_ab, p_bis, coalesce(p_aktiv, true))
    returning id into neu;
    return neu;
  end if;
  select * into alt from public.fin_wiederkehrend where id = p_id for update;
  if alt.id is null then raise exception 'Diese wiederkehrende Buchung gibt es nicht (mehr).'; end if;
  if (alt.ab <> p_ab or alt.rhythmus <> p_rhythmus)
     and exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = p_id) then
    raise exception 'Erster Termin und Rhythmus stehen fest, seit Termine geholt wurden – für einen neuen Rhythmus diese beenden („bis“) und eine neue anlegen.';
  end if;
  update public.fin_wiederkehrend
     set text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''),
         rhythmus = p_rhythmus, ab = p_ab, bis = p_bis, aktiv = coalesce(p_aktiv, true), geaendert_am = now()
   where id = p_id;
  return p_id;
end;
$$;

create or replace function public.fin_wiederkehrend_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fin_stapel_recht();
  delete from public.fin_wiederkehrend where id = p_id;
  if not found then raise exception 'Diese wiederkehrende Buchung gibt es nicht (mehr).'; end if;
end;
$$;

-- Fällige Termine bis zum Stichtag als Zeilen in einen offenen Stapel. Gleiche Terminrechnung wie `planTermine`
-- (lib/finance/liquiditaet.ts) und `wiederkehrendOffen` (lib/finance/vorlagen.ts): ab + k × Rhythmus Monate,
-- Postgres schneidet am Monatsende ab wie dort.
create or replace function public.fin_wiederkehrend_holen(p_stapel uuid, p_bis date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  w public.fin_wiederkehrend%rowtype;
  schritt integer;
  k integer;
  d date;
  von date;
  ende date;
  n integer := 0;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_bis is null then raise exception 'Der Stichtag fehlt.'; end if;
  von := make_date(st.jahr, 1, 1);
  for w in select * from public.fin_wiederkehrend where aktiv order by ab, id loop
    schritt := case w.rhythmus when 'monat' then 1 when 'quartal' then 3 when 'halbjahr' then 6 else 12 end;
    ende := least(p_bis, make_date(st.jahr, 12, 31), coalesce(w.bis, p_bis));
    k := 0;
    loop
      d := (w.ab + make_interval(months => k * schritt))::date;
      exit when d > ende or k > 1200;
      if d >= von and not exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = w.id and z.termin = d) then
        insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer, wiederkehrend_id, termin)
        values (p_stapel, d, null, left(w.text || ' ' || to_char(d, 'MM/YYYY'), 200), w.soll, w.haben, w.betrag, w.steuer, w.id, d);
        n := n + 1;
      end if;
      k := k + 1;
    end loop;
  end loop;
  return jsonb_build_object('anzahl', n);
end;
$$;

revoke all on function public.fin_felder_pruefen(text, integer, integer, numeric, integer) from public, anon, authenticated;
revoke all on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text) from public, anon;
revoke all on function public.fin_vorlage_loeschen(uuid) from public, anon;
revoke all on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean) from public, anon;
revoke all on function public.fin_wiederkehrend_loeschen(uuid) from public, anon;
revoke all on function public.fin_wiederkehrend_holen(uuid, date) from public, anon;
grant execute on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text) to authenticated;
grant execute on function public.fin_vorlage_loeschen(uuid) to authenticated;
grant execute on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean) to authenticated;
grant execute on function public.fin_wiederkehrend_loeschen(uuid) to authenticated;
grant execute on function public.fin_wiederkehrend_holen(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabellen fin_vorlagen / fin_wiederkehrend (RLS)' as pruefung,
       case when (select bool_and(c.relrowsecurity) from pg_class c
                   where c.oid in (to_regclass('public.fin_vorlagen'), to_regclass('public.fin_wiederkehrend'))) then 'da, RLS an'
            else 'fehlt oder RLS AUS' end as ergebnis
union all
select 'Richtlinien',
       coalesce((select string_agg(p.tablename || ': ' || p.cmd || ' · ' || p.policyname, ', ' order by p.tablename)
                   from pg_policies p where p.schemaname = 'public' and p.tablename in ('fin_vorlagen', 'fin_wiederkehrend')), 'keine')
union all
select 'Stapelzeilen mit Termin (wiederkehrend_id, termin)',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_stapel_zeilen' and column_name = 'termin')
             and exists (select 1 from pg_indexes where indexname = 'fin_sz_termin') then 'ja' else 'nein' end
union all
select 'Funktionen (Vorlage, Wiederkehrend, holen)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('fin_vorlage_speichern', 'fin_vorlage_loeschen', 'fin_wiederkehrend_speichern',
                                                      'fin_wiederkehrend_loeschen', 'fin_wiederkehrend_holen')) || ' von 5';

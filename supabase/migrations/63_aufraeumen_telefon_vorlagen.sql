-- =====================================================================
-- Migration 63 – Aufräumen und Kleinkram aus dem Fahrplan (02.10.2026, v102).
--
-- 1. D8  – `mit_steuer` an alten Rechnungen festschreiben statt raten.
-- 2. D10 – Telefonnummern in einer Vergleichsform (Grundlage für Suche und Dublettenprüfung E1).
-- 3. C1  – die tote Spalte `articles.braucht_lagerplatz` entfernen.
-- 4. E6  – Auftragsvorlagen: mehrere Leistungen mit einem Tipp.
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Abschnitt
-- steht für sich und ist wiederholbar. Reihenfolge SQL/Dateien: **SQL zuerst** – die neue
-- Oberfläche liest `auftragsvorlagen`; ohne die Tabelle bleibt nur der Knopf „+ Vorlage" leer.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.rechnungen') is null or to_regclass('public.customers') is null
     or to_regprocedure('public.darf(text,text)') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 42/48 fehlt: Hier gibt es kein public.rechnungen / public.customers / public.darf(). Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. D8 – `mit_steuer` an alten Rechnungen
-- ---------------------------------------------------------------------
-- Frühe Belege tragen in `texte` kein `mit_steuer`. Die Druckansicht riet dann über
-- `steuer <> 0`. Hier wird GENAU DIESER Wert festgeschrieben – nicht ein „besserer": Ein
-- ausgestellter Beleg muss so aussehen wie bisher. Damit ändert sich auf keinem Papier etwas,
-- aber im Code entfällt das Raten (RechnungDokument liest nur noch das Feld).
--
-- `rechnung_unveraenderlich()` sperrt jede Änderung an `texte`. Für genau diese eine Anweisung
-- wird der Trigger aus- und wieder eingeschaltet – in EINEM do-Block, also auch im SQL-Editor
-- ganz oder gar nicht. Bricht etwas, bleibt der Trigger an.
do $$
begin
  alter table public.rechnungen disable trigger trg_rechnung_unveraenderlich;
  update public.rechnungen
     set texte = texte || jsonb_build_object('mit_steuer', steuer <> 0)
   where not (texte ? 'mit_steuer');
  alter table public.rechnungen enable trigger trg_rechnung_unveraenderlich;
end $$;

-- ---------------------------------------------------------------------
-- 2. D10 – Telefonnummern in Vergleichsform
-- ---------------------------------------------------------------------
-- „0911 12345", „0911/12345" und „+49 911 12345" sind dieselbe Nummer. Die Vergleichsform ist
-- immer „+<Ländervorwahl><Rest>", nur Ziffern: führende 00 → +, führende 0 → +49, „+49 (0)"
-- → +49. Eine Nummer ohne Vorwahl (nur „12345") bleibt, wie sie ist.
-- Dieselbe Regel steht in lib/telefon.ts (`telefonVergleich`) – wer eine Stelle ändert, ändert
-- beide. Gespeichert wird zusätzlich, die eingetippte Schreibweise bleibt unberührt.
create or replace function public.telefon_vergleich(t text)
returns text
language sql
immutable
as $$
  select case
    when z = '' or z = '+' then null
    when z like '+490%' then '+49' || substr(z, 5)
    when z like '+%' then z
    when z like '00%' then '+' || substr(z, 3)
    when z like '0%' then '+49' || substr(z, 2)
    else z
  end
  from (
    select case when left(btrim(coalesce(t, '')), 1) = '+'
                then '+' || regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g')
                else regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') end as z
  ) x
$$;

alter table public.customers
  add column if not exists mobil_vergleich text generated always as (public.telefon_vergleich(phone_mobile)) stored;
alter table public.customers
  add column if not exists festnetz_vergleich text generated always as (public.telefon_vergleich(phone_landline)) stored;
create index if not exists idx_customers_mobil_vergleich on public.customers (mobil_vergleich) where mobil_vergleich is not null;
create index if not exists idx_customers_festnetz_vergleich on public.customers (festnetz_vergleich) where festnetz_vergleich is not null;

comment on column public.customers.mobil_vergleich is
  'Mobilnummer in Vergleichsform (+49…, nur Ziffern), berechnet aus phone_mobile. Migration 63, D10.';
comment on column public.customers.festnetz_vergleich is
  'Festnetznummer in Vergleichsform (+49…, nur Ziffern), berechnet aus phone_landline. Migration 63, D10.';

-- ---------------------------------------------------------------------
-- 3. C1 – tote Spalte
-- ---------------------------------------------------------------------
-- Seit Migration 46 ohne Wirkung und im Code nirgends gelesen. Ihre Werte stehen weiter im
-- Protokoll (audit_log), die Beschriftung im Protokoll bleibt deshalb stehen.
alter table public.articles drop column if exists braucht_lagerplatz;

-- ---------------------------------------------------------------------
-- 4. E6 – Auftragsvorlagen
-- ---------------------------------------------------------------------
-- Eine Vorlage ist eine benannte Liste von Leistungen mit Menge: „Saisonwechsel mobil" =
-- Räderwechsel + Auswuchten 4× + Ventile 4×. Eingetragen wird sie als ganz normale Positionen
-- (mit dem Preis des Tages) – die Vorlage selbst kennt keine Preise.
create table if not exists public.auftragsvorlagen (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- [{ "article_id": "…", "quantity": 4 }, …]
  positionen  jsonb not null default '[]'::jsonb,
  sortierung  integer not null default 0,
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auftragsvorlagen_name_gefuellt') then
    alter table public.auftragsvorlagen add constraint auftragsvorlagen_name_gefuellt check (btrim(name) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'auftragsvorlagen_positionen_liste') then
    alter table public.auftragsvorlagen add constraint auftragsvorlagen_positionen_liste check (jsonb_typeof(positionen) = 'array');
  end if;
end $$;
create unique index if not exists auftragsvorlagen_name_einmalig on public.auftragsvorlagen (lower(btrim(name)));

alter table public.auftragsvorlagen enable row level security;

-- Lesen darf, wer Leistungen eintragen darf (auch der Techniker vor Ort); pflegen, wer Artikel
-- pflegen darf. Löschen entscheidet wie überall seit Migration 42 der Trigger.
drop policy if exists "Vorlagen lesen" on public.auftragsvorlagen;
create policy "Vorlagen lesen" on public.auftragsvorlagen
  for select to authenticated using (public.darf('auftraege.leistungen', 'lesen') or public.darf('artikel', 'lesen'));
drop policy if exists "Vorlagen anlegen" on public.auftragsvorlagen;
create policy "Vorlagen anlegen" on public.auftragsvorlagen
  for insert to authenticated with check (public.darf('artikel', 'schreiben'));
drop policy if exists "Vorlagen aendern" on public.auftragsvorlagen;
create policy "Vorlagen aendern" on public.auftragsvorlagen
  for update to authenticated using (public.darf('artikel', 'schreiben')) with check (public.darf('artikel', 'schreiben'));
drop policy if exists "Vorlagen loeschen" on public.auftragsvorlagen;
create policy "Vorlagen loeschen" on public.auftragsvorlagen
  for delete to authenticated using (public.darf('artikel', 'lesen'));

drop trigger if exists trg_loeschrecht on public.auftragsvorlagen;
create trigger trg_loeschrecht
  before delete on public.auftragsvorlagen
  for each row execute procedure public.pruefe_loeschrecht('artikel');
drop trigger if exists trg_stamp_row on public.auftragsvorlagen;
create trigger trg_stamp_row
  before insert or update on public.auftragsvorlagen
  for each row execute procedure public.stamp_row();
drop trigger if exists trg_audit_row on public.auftragsvorlagen;
create trigger trg_audit_row
  after insert or update or delete on public.auftragsvorlagen
  for each row execute procedure public.audit_row();

grant select, insert, update, delete on public.auftragsvorlagen to authenticated;
grant all on public.auftragsvorlagen to service_role;

comment on table public.auftragsvorlagen is
  'Auftragsvorlagen: benannte Leistungspakete, eingetragen als normale Positionen. Migration 63, E6.';

commit;

-- Zur Kontrolle (Ergebnistabelle – der SQL-Editor zeigt keine Meldungen):
select 'Rechnungen ohne mit_steuer' as pruefung,
  (select count(*)::text from public.rechnungen where not (texte ? 'mit_steuer')) as ergebnis
union all
select 'Unveränderlichkeit der Rechnungen aktiv',
  (select (tgenabled <> 'D')::text from pg_trigger where tgname = 'trg_rechnung_unveraenderlich')
union all
select 'Kunden mit Telefon in Vergleichsform',
  (select count(*)::text from public.customers where mobil_vergleich is not null or festnetz_vergleich is not null)
union all
select 'Spalte articles.braucht_lagerplatz entfernt',
  (not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'braucht_lagerplatz'))::text
union all
select 'Tabelle auftragsvorlagen', (to_regclass('public.auftragsvorlagen') is not null)::text
union all
select 'Richtlinien auftragsvorlagen', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'auftragsvorlagen');

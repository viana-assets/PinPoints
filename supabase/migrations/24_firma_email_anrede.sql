-- =====================================================================
-- Viana PinPoints – 24: Firma, Ansprechpartner, E-Mail und Anrede am Kunden
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01.
--
-- Anlass ist der Import der bestehenden Kundenliste (supabase/import/): darin stehen Zeilen
-- wie „Firma Degen" mit „Sven Heidenreich" in der E-Mail-Spalte. Gemeint ist eine Firma mit
-- einem Ansprechpartner – ein Fall, für den das Datenmodell bislang kein Feld hatte, weshalb
-- die Information in irgendeine freie Spalte gerutscht ist.
--
-- Drei Spalten, alle optional:
--   `company`  – Firmenname. Leer bei Privatpersonen. `name` bleibt der Anzeigename und trägt
--                bei Firmen den Ansprechpartner.
--   `email`    – gab es bisher überhaupt nicht. Die Kundenliste enthält 15 echte Adressen,
--                die sonst in der Notiz landen würden: nicht durchsuchbar, nicht verwendbar,
--                wenn später Rechnungen verschickt werden.
--   `anrede`   – „Herr" / „Frau". In der Altliste steht die Anrede bei 30 Kunden im Namensfeld
--                („Frau Graf"). Das gehört dort nicht hin: es verfälscht die alphabetische
--                Sortierung, und spätestens bei den Rechnungen aus Roadmap-Phase 5 braucht
--                ein Anschreiben die Anrede getrennt vom Namen.
--
-- Bewusst KEINE eigene Firmen-Tabelle. Sie wäre die sauberere Modellierung, sobald mehrere
-- Ansprechpartner je Firma vorkommen – das ist hier aber nicht der Fall (vier Firmen, je ein
-- Ansprechpartner), und eine Tabelle mit vier Zeilen und einer zusätzlichen Verknüpfung in
-- jeder Abfrage kostet mehr, als sie einbringt. Kommt der Fall, ist der Weg dorthin offen:
-- `company` wird dann zum Fremdschlüssel.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/24_rollback.sql
-- =====================================================================

alter table public.customers
  add column if not exists company text,
  add column if not exists email text,
  add column if not exists anrede text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_anrede_check') then
    alter table public.customers
      add constraint customers_anrede_check
      check (anrede is null or anrede in ('Herr', 'Frau'));
  end if;
end $$;

comment on column public.customers.company is
  'Firmenname. Leer bei Privatpersonen; `name` trägt dann die Person, bei Firmen den Ansprechpartner.';
comment on column public.customers.email is 'E-Mail-Adresse des Kunden bzw. des Ansprechpartners.';
comment on column public.customers.anrede is 'Herr oder Frau – getrennt vom Namen, damit die Sortierung stimmt.';

-- Suche über den Firmennamen: die Kundenliste wird vollständig in den Browser geladen und dort
-- gefiltert (siehe docs/kunden-und-karte.md), ein Index brächte dafür nichts. Er steht hier
-- trotzdem NICHT – lieber keiner als einer, den niemand benutzt.

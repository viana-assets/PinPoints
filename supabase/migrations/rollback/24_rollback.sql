-- Rücknahme von 24_firma_email_anrede.sql.
--
-- Reihenfolge: erst den Anwendungscode zurückdrehen, dann dieses Skript.
--
-- Verloren gehen Firmenname, E-Mail-Adresse und Anrede aller Kunden. Bei importierten
-- Datensätzen sind das Angaben, die es nur hier gibt – die Quelldatei Mappe1.xlsx hat sie in
-- anderen Spalten stehen, aber niemand will den Import ein zweites Mal aufbereiten. Vorher
-- sichern:
--
--   create table public.customers_firma_sicherung as
--     select id, company, email, anrede from public.customers
--      where company is not null or email is not null or anrede is not null;

alter table public.customers drop constraint if exists customers_anrede_check;
alter table public.customers drop column if exists company;
alter table public.customers drop column if exists email;
alter table public.customers drop column if exists anrede;

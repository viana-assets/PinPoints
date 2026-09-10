-- Rücknahme von 23_kontaktergebnis.sql.
--
-- Reihenfolge: erst den Anwendungscode zurückdrehen, dann dieses Skript. Sonst zeigt die
-- Oberfläche einen Kontaktdialog mit Ausgängen an, die es in der Datenbank nicht mehr gibt.
--
-- Verloren gehen dabei alle Kontaktergebnisse und Wiedervorlage-Termine. Die Kontakt-Historie
-- (`contact_history`) bleibt vollständig erhalten – dort steht weiterhin, wann telefoniert
-- wurde und mit welchem Ergebnis, nur eben als Text statt als auswertbare Spalte. Wer die
-- Spalten retten will, sichert sie vorher:
--
--   create table public.customers_kontaktergebnis_sicherung as
--     select id, kontakt_ergebnis, wiedervorlage_am from public.customers
--      where kontakt_ergebnis is not null or wiedervorlage_am is not null;

alter table public.customers drop constraint if exists customers_kontakt_ergebnis_check;
alter table public.customers drop column if exists kontakt_ergebnis;
alter table public.customers drop column if exists wiedervorlage_am;

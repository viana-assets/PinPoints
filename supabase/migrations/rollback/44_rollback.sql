-- Rücknahme von Migration 44.
--
-- ACHTUNG: Mit der Tabelle verschwinden alle Kilometerstände und alle Zuordnungen von
-- ZUSÄTZLICHEN Fahrzeugen. Das übernommene Erstfahrzeug steht weiterhin in
-- `orders.vehicle_id` – die Spalte wurde nicht angetastet.
--
-- Vorher sichern, falls Kilometerstände gebraucht werden:
--
--   create table if not exists public.sicherung_44 as
--     select * from public.auftrag_fahrzeuge;
--
-- Zuerst den Anwendungscode zurückdrehen: Die neue Fassung liest die Tabelle beim Öffnen
-- eines Auftrags.

begin;

drop trigger if exists trg_pruefe_rechnungsdaten on public.orders;
drop function if exists public.pruefe_rechnungsdaten();
drop table if exists public.auftrag_fahrzeuge;

commit;

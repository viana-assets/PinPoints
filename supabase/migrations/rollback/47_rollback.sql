-- Rücknahme von Migration 47.
--
-- Entfernt den Trigger. Die bereits geschriebenen Kontaktstände und Historien-Zeilen bleiben
-- stehen: Sie sind nicht falsch – die Aufträge WURDEN abgeschlossen. Wer sie loswerden will,
-- erkennt sie an der Notiz und löscht sie von Hand (Abfrage unten, auskommentiert).

begin;

drop trigger if exists trg_kontakt_aus_abschluss on public.orders;
drop function if exists public.kontakt_aus_abschluss();

commit;

-- Falls die erzeugten Historien-Zeilen doch weg sollen – ERST ansehen, DANN löschen:
--
-- select * from public.contact_history where note like 'Auftrag % abgeschlossen';
-- delete from public.contact_history where note like 'Auftrag % abgeschlossen';

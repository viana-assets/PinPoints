-- Rücknahme von 27_push_versand.sql.
--
-- Achtung: Vorher den Zeitgeber aus 28 abschalten (`select cron.unschedule('pinpoints-terminerinnerung');`),
-- sonst läuft der Versand jede Minute in eine fehlende Tabelle. Ohne das Protokoll gibt es
-- außerdem keine Doppelmeldungssperre mehr.
--
-- Kostet nur die Information, was schon verschickt wurde – keine fachlichen Daten.

drop table if exists public.push_versand;

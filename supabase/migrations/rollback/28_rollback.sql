-- Rücknahme von 28_terminerinnerung_zeitgeber.sql.
--
-- Danach werden keine Terminerinnerungen mehr verschickt. Die angemeldeten Geräte (26) und das
-- Versandprotokoll (27) bleiben unberührt – die Testnachricht aus den Einstellungen
-- funktioniert weiter.
--
-- Das Geheimnis wird mit entfernt. Wer nur pausieren will, nimmt statt dieses Skripts nur die
-- erste Zeile und lässt die Konfiguration stehen.

select cron.unschedule('pinpoints-terminerinnerung')
 where exists (select 1 from cron.job where jobname = 'pinpoints-terminerinnerung');

drop table if exists private.push_konfiguration;
-- Das Schema bleibt bestehen: es kostet nichts und könnte inzwischen anderes enthalten.

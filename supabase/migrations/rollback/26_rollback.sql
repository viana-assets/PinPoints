-- Rücknahme von 26_push_geraete.sql.
--
-- Kostet die angemeldeten Geräte: Nach dem Zurücknehmen muss jeder sein Gerät neu anmelden,
-- weil die Adressen weg sind. Es gehen keine fachlichen Daten verloren – nur der Zugang zum
-- Sperrbildschirm, und der ist jederzeit neu herstellbar.
--
-- Der Anwendungscode muss vorher zurück, sonst schreiben die Routen unter app/api/push/ in
-- eine Tabelle, die es nicht mehr gibt.

drop table if exists public.push_geraete;

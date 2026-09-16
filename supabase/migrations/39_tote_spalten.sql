-- Migration 39: tote Spalten entfernen
--
-- Drei Spalten, die niemand mehr schreibt. Sie stehen nicht im Weg – sie sind schlimmer als
-- das: Eine Spalte, die dasteht, wird irgendwann für eine Aussage gehalten. `discount_percent`
-- enthält heute den Rabatt von vorgestern, und wer in einem halben Jahr eine Auswertung darauf
-- baut, bekommt Zahlen, die einmal gestimmt haben.
--
-- Reihenfolge: Der Code kam ZUERST. Fassung v25 schreibt keine der drei Spalten mehr und läuft
-- bereits. Diese Migration entfernt nur, was danach niemand mehr anfasst.
--
--   orders.assigned_employee_id   – abgelöst von `order_employees` (Migration 11). Ein Auftrag
--                                   kann mehreren Mitarbeitern gehören; eine einzelne Spalte
--                                   konnte das nie ausdrücken.
--   order_articles.discount_percent – abgelöst vom Endpreis (Migration 38). Ein Prozentwert war
--                                   eine Ableitung, die als Eingabe verkleidet war.
--   user_settings.theme           – nie benutzt; die Anzeigeeinstellungen kennen kein Thema.
--
-- WAS DIESE MIGRATION NICHT ANFASST: das Protokoll. `audit_log` hält die alten Werte als jsonb
-- fest, und die bleiben lesbar – deshalb behalten auch die Beschriftungen in lib/constants.ts
-- ihre Einträge für `discount_percent` und `assigned_employee_id`. Wer einen Eintrag von
-- letzter Woche aufschlägt, soll dort „Rabatt %" lesen und nicht den rohen Spaltennamen.
--
-- Rücknahme: 39_rollback.sql. Sie legt die Spalten leer wieder an – die Werte sind mit dem
-- `drop column` weg. Eine Sicherung vorher steht im Kopf der Rücknahmedatei.

begin;

-- `if exists` bei allen dreien: Diese Migration soll ein zweites Mal laufen können, ohne zu
-- meckern. `drop column` ohne `cascade` ist Absicht – hängt wider Erwarten doch eine Sicht
-- daran, soll die Migration abbrechen und es sagen, statt die Sicht stillschweigend
-- mitzulöschen.
alter table public.orders        drop column if exists assigned_employee_id;
alter table public.order_articles drop column if exists discount_percent;
alter table public.user_settings  drop column if exists theme;

commit;

-- Kontrolle nach dem Lauf: muss drei leere Ergebnisse liefern.
--
-- select column_name, table_name
--   from information_schema.columns
--  where table_schema = 'public'
--    and (   (table_name = 'orders'         and column_name = 'assigned_employee_id')
--         or (table_name = 'order_articles' and column_name = 'discount_percent')
--         or (table_name = 'user_settings'  and column_name = 'theme'));

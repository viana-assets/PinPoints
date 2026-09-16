-- =====================================================================
-- Viana PinPoints – 37: Termin von–bis
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 07 (orders.time).
--
-- Konzept: claude/fahrplan-phase-5.md, Block B.
--
-- WARUM ZWEI UHRZEITEN UND NICHT „UHRZEIT + DAUER"
--
-- Weil ein Mensch sagt „von acht bis halb zehn", nicht „um acht für neunzig Minuten". Die
-- Dauer ist die Ableitung, nicht die Aussage. Und der Kalender rechnet mit zwei Uhrzeiten
-- direkt: Die Höhe eines Blocks ist Ende minus Anfang, nicht Anfang plus ein zweites Feld,
-- das jemand vergessen haben könnte.
--
-- `text` und nicht `time`, weil `orders.time` seit Migration 07 ebenfalls Text ist. Zwei
-- verschiedene Typen für Anfang und Ende desselben Termins wären eine Einladung für
-- Vergleiche, die in der einen Richtung funktionieren und in der anderen nicht. Die Prüfregel
-- unten erzwingt dafür die Form HH:MM – und in dieser Form vergleicht sich Text richtig
-- ("09:00" < "10:00"), weil die Stunde immer zweistellig ist.
--
-- DER BESTAND
--
-- Vorhandene Aufträge haben nur eine Uhrzeit. Sie bekommen eine angenommene Dauer von
-- 60 MINUTEN. Diese Zahl steht auch im Code (STANDARD_DAUER_MIN in lib/constants.ts) und ist
-- dort die Vorgabe für neue Termine – wer sie ändern will, ändert sie an beiden Stellen.
--
-- Das ist ausdrücklich eine ANNAHME und keine Messung: In der Tages- und Wochenansicht
-- bekommt ein Termin ohne gepflegtes Ende eine gestrichelte Unterkante, damit niemand die
-- angenommene Stunde für eine Zusage hält.
-- =====================================================================

alter table public.orders add column if not exists end_time text;

-- ---------------------------------------------------------------------
-- Schritt 1: Anfangszeiten auf zwei Stellen bringen.
--
-- Klingt nach Kosmetik, ist aber die Voraussetzung für alles Weitere: Text vergleicht sich
-- zeichenweise, und "9:15" ist größer als "10:00". Eine Regel „Ende nach Anfang" wäre auf
-- einstelligen Stunden schlicht falsch, und der Kalender sortierte solche Termine ans
-- Tagesende. Die Anwendung hat einstellige Eingaben bisher geschluckt – deshalb gibt es sie.
-- ---------------------------------------------------------------------
update public.orders
   set time = lpad(split_part(time, ':', 1), 2, '0') || ':' || split_part(time, ':', 2)
 where time ~ '^\d:[0-5][0-9]$';

-- ---------------------------------------------------------------------
-- Schritt 2: Bestand mit einem angenommenen Ende versehen.
--
-- `case` statt `least`: „least" vergleicht hier Text, und "00:30" ist kleiner als "23:59" –
-- ein Termin um 23:30 hätte damit als Ende halb eins IN DER NACHT bekommen, also vor seinem
-- eigenen Anfang. Die richtige Frage ist nicht „welches ist kleiner", sondern „ist das
-- Ergebnis überhaupt noch am selben Tag".
-- ---------------------------------------------------------------------
update public.orders
   set end_time = case
         when to_char(time::time + interval '60 minutes', 'HH24:MI') > time
           then to_char(time::time + interval '60 minutes', 'HH24:MI')
         when time < '23:59' then '23:59'
         else null
       end
 where end_time is null
   and time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

-- ---------------------------------------------------------------------
-- Schritt 3: Die Prüfregel kommt ZULETZT – sonst müsste der Bestand sie erfüllen, bevor er
-- sie erfüllen kann.
--
-- Der Stundenteil ist bewusst `([01][0-9]|2[0-3])` und nicht `[0-2][0-9]`: Letzteres ließe
-- "29:00" durch. Eine Prüfregel, die Unmögliches erlaubt, prüft nicht.
-- ---------------------------------------------------------------------
do $$
begin
  alter table public.orders
    add constraint orders_end_time_sinnvoll
    check (
      end_time is null
      or (
        time is not null
        and end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and time     ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and end_time > time
      )
    );
exception when duplicate_object then
  null;
end $$;

-- Die Tages- und Wochenansicht holt die Aufträge eines Datumsbereichs. Ohne Index ist das bei
-- jedem Blättern ein voller Durchlauf durch alle Aufträge.
create index if not exists orders_datum_idx on public.orders (order_date, time);

-- Gegenprobe.
select
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='orders' and column_name='end_time') as spalte_da,
  exists (select 1 from pg_constraint where conname = 'orders_end_time_sinnvoll')          as regel_da,
  (select count(*) from public.orders where time is not null)                             as mit_uhrzeit,
  (select count(*) from public.orders where end_time is not null)                         as davon_mit_ende,
  (select count(*) from public.orders where time is not null and end_time is null)        as ohne_ende_geblieben,
  (select count(*) from public.orders where time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and time is not null) as uhrzeit_unlesbar;

-- =====================================================================
-- Viana PinPoints – 29: Doppelmeldungssperre gilt je TERMIN, nicht je Auftrag
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 27 (push_versand).
--
-- Der Befund vom 09.09.2026: Wird ein Termin verschoben, kommt keine zweite Erinnerung mehr.
-- Der eindeutige Schlüssel aus 27 lautete (Auftrag, Person) – einmal gesendet, nie wieder.
--
-- Beim Testen fällt das sofort auf. Im Betrieb wäre es schlimmer und viel später aufgefallen:
-- Ein Kunde verschiebt von 10:00 auf 14:00, der Techniker hat seine Erinnerung längst um 09:55
-- bekommen – und um 13:55 kommt nichts. Genau dann, wenn eine Erinnerung am nötigsten wäre.
--
-- Die Lösung ist der Schlüssel selbst: Er bekommt den Terminzeitpunkt dazu. Ein verschobener
-- Termin ist damit ein neuer Eintrag und bekommt seine eigene Erinnerung; derselbe Termin
-- bleibt genauso zuverlässig gesperrt wie vorher. Die alten Zeilen bleiben als Verlauf stehen –
-- man sieht, dass zu 10:00 schon einmal erinnert wurde.
-- =====================================================================

alter table public.push_versand
  add column if not exists termin timestamp;

-- Bestehende Zeilen bekommen den Zeitpunkt ihres Auftrags nachgetragen.
update public.push_versand v
   set termin = (o.order_date + coalesce(o.time, '00:00')::time)
  from public.orders o
 where o.id = v.order_id
   and v.termin is null;

-- Zeilen ohne zugehörigen Auftrag (theoretisch unmöglich wegen Fremdschlüssel, praktisch
-- billig abzusichern) bekommen den Sendezeitpunkt, damit die Spalte nicht leer bleibt.
update public.push_versand set termin = gesendet_am::timestamp where termin is null;

alter table public.push_versand alter column termin set not null;

alter table public.push_versand drop constraint if exists push_versand_einmalig;
alter table public.push_versand
  add constraint push_versand_einmalig unique (order_id, profile_id, termin);

comment on column public.push_versand.termin is
  'Für welchen Terminzeitpunkt diese Erinnerung galt. Teil des eindeutigen Schlüssels: ein verschobener Termin bekommt eine neue Erinnerung.';

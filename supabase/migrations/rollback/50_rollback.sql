-- Rücknahme von Migration 50.
--
-- Entfernt den Haken. Die Texte selbst bleiben stehen: Sie liegen in `order_articles.note`,
-- gehören zu den Aufträgen und sind älter als diese Migration. Ohne den Haken erscheinen sie
-- auf der Rechnung wieder als Zusatzzeile UNTER der Bezeichnung statt an ihrer Stelle.

begin;

alter table public.articles drop column if exists freitext;

commit;

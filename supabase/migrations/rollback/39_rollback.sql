-- Rücknahme von Migration 39.
--
-- ACHTUNG: Die Werte sind weg. `drop column` löscht die Daten mit, nicht nur die Spalte.
-- Diese Rücknahme stellt die Spalten LEER wieder her – sie ist dafür gedacht, dass eine alte
-- Fassung des Anwendungscodes wieder startet, nicht dafür, Daten zurückzuholen.
--
-- Wer vor Migration 39 sichern will, macht das VORHER:
--
--   create table if not exists public.sicherung_39 as
--     select id, discount_percent from public.order_articles where discount_percent is not null;
--
-- Zuerst den Anwendungscode zurückdrehen, dann diese Datei ausführen – sonst schreibt die
-- laufende Fassung weiter ohne diese Spalten und die alte Fassung findet sie leer vor.

begin;

alter table public.orders         add column if not exists assigned_employee_id uuid references public.employees(id) on delete set null;
alter table public.order_articles add column if not exists discount_percent numeric(5,2) not null default 0;
alter table public.user_settings  add column if not exists theme text;

commit;

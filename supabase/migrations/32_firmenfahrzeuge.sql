-- =====================================================================
-- Viana PinPoints – 32: Firmenfahrzeuge als eigene Stammdaten, am Auftrag zuordenbar
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 03 (orders), 05 (current_user_role),
-- 18 (stamp_row/audit_row).
--
-- Konzept: docs/lager-ausbaukonzept.md, Block C (C1 und C2) – Schritt 3 der vereinbarten
-- Reihenfolge.
--
-- WARUM EINE EIGENE TABELLE UND NICHT `vehicles`: „Fahrzeug" heißt in dieser Anwendung an
-- zwei Stellen etwas Verschiedenes – im Kundenkontext das Auto des Kunden (mit Halter,
-- Reifengröße, eingelagertem Satz), im Einsatzkontext der eigene Transporter (mit Ladung und
-- Tagesplan). Eine Tabelle mit zwei Bedeutungen wird an fünfzig Stellen zu zwei Bedeutungen:
-- jede Abfrage bräuchte ab dann einen Zusatzfilter, und der wird irgendwo vergessen.
--
-- Der Transporter ist außerdem der Ort, an dem später der rollende Bestand hängt (Block C3):
-- morgens Umlagerung Regal → Fahrzeug, abends der Rest zurück. Diese Tabelle ist die
-- Grundlage dafür, auch wenn heute nur Kennzeichen und Bezeichnung darin stehen.
-- =====================================================================

create table if not exists public.firmenfahrzeuge (
  id          uuid primary key default gen_random_uuid(),
  -- Das Kennzeichen ist die Bezeichnung, die im Betrieb tatsächlich benutzt wird.
  kennzeichen text not null,
  -- „Sprinter weiß", „Kastenwagen klein" – wofür man das Fahrzeug im Kopf hält.
  bezeichnung text,
  notiz       text,
  -- Ausgemustert statt gelöscht: An alten Aufträgen hängt das Fahrzeug weiter, und die Frage
  -- „womit waren wir letzten Herbst unterwegs" soll beantwortbar bleiben.
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

-- Ein Kennzeichen gibt es genau einmal – unabhängig von Groß-/Kleinschreibung und
-- Leerzeichen. Zwei Zeilen für denselben Wagen sind kein Schönheitsfehler: Die halbe Flotte
-- steht dann in der einen, die andere Hälfte in der zweiten, und keine Auswertung stimmt.
create unique index if not exists firmenfahrzeuge_kennzeichen_eindeutig
  on public.firmenfahrzeuge (upper(replace(kennzeichen, ' ', '')));

alter table public.firmenfahrzeuge enable row level security;

-- Lesen darf jeder Angemeldete: Der Techniker muss sehen, mit welchem Wagen sein Auftrag
-- gefahren wird. Pflegen nur Admin/Superadmin – es sind Stammdaten, wie der Artikelstamm.
create policy "Firmenfahrzeuge lesen" on public.firmenfahrzeuge
  for select using (auth.role() = 'authenticated');
create policy "Firmenfahrzeuge pflegen" on public.firmenfahrzeuge
  for all using (public.current_user_role() in ('admin', 'superadmin'))
  with check (public.current_user_role() in ('admin', 'superadmin'));

-- Änderungsprotokoll und Wer-hat-wann wie bei allen Geschäftstabellen (Migration 18).
drop trigger if exists trg_stamp_row on public.firmenfahrzeuge;
create trigger trg_stamp_row before insert or update on public.firmenfahrzeuge
  for each row execute procedure public.stamp_row();

drop trigger if exists trg_audit_row on public.firmenfahrzeuge;
create trigger trg_audit_row after insert or update or delete on public.firmenfahrzeuge
  for each row execute procedure public.audit_row();

-- ---------------------------------------------------------------------
-- Das Fahrzeug am Auftrag
-- ---------------------------------------------------------------------
-- `on delete set null`: Wird ein Fahrzeug doch einmal gelöscht, verliert der Auftrag die
-- Angabe – aber er bleibt. Ein Auftrag ist ein Beleg; er darf nicht mit einem Stammdatensatz
-- verschwinden.
alter table public.orders
  add column if not exists firmenfahrzeug_id uuid references public.firmenfahrzeuge(id) on delete set null;

create index if not exists idx_orders_firmenfahrzeug on public.orders (firmenfahrzeug_id);

-- Hinweis zum Techniker-Spaltenschutz (Migration 20/22): Der prüft über eine Positivliste
-- änderbarer Spalten. Eine neue Spalte ist damit für Techniker automatisch gesperrt – genau
-- richtig, die Einteilung der Fahrzeuge macht das Büro.

comment on table public.firmenfahrzeuge is
  'Eigene Transporter (Betriebsfahrzeuge). Bewusst getrennt von `vehicles` (Kundenfahrzeuge). Siehe docs/lager-ausbaukonzept.md, Block C.';

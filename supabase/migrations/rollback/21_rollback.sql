-- Rücknahme von 21_appointments_entfernen.sql.
--
-- Stellt die leere Tabellenstruktur wieder her, NICHT ihren Inhalt. Das ist keine Lücke im
-- Skript, sondern die Lage: die Zeilen lebten seit Migration 07 nur noch als Kopie neben
-- `orders`. Wer sie wirklich braucht, holt sie aus einer Datensicherung – ein Rollback-Skript
-- kann keine Daten erfinden.
--
-- Die Anwendung greift auf diese Tabelle seit Migration 07 nicht mehr zu. Nach dieser Rücknahme
-- ist sie also wieder da, aber weiterhin ohne Funktion. Sinnvoll ist das Skript nur, wenn ein
-- Fremdsystem oder eine Auswertung wider Erwarten doch auf sie zeigte.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  date date not null,
  time text,
  description text,
  created_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

-- Bewusst OHNE Policy, also für niemanden lesbar oder beschreibbar – so, wie Migration 16 die
-- Tabelle hinterlassen hat. Die alte Alles-erlaubt-Policy war eine offene Schreibfläche ohne
-- Nutzen und kommt nicht zurück.

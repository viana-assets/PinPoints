-- =====================================================================
-- Viana PinPoints – 07: Termine & Aufträge zusammenlegen + Mitarbeiter
-- Noch auszuführen.
--
-- Termine und Aufträge sind ab jetzt ein Modul: ein "Termin" ist einfach ein
-- Auftrag mit Datum (order_date, gab es schon) und Uhrzeit (time, neu). Die
-- App legt Termine deshalb nicht mehr in der alten `appointments`-Tabelle an,
-- sondern immer als Zeile in `orders`. Bestehende Termine werden unten einmalig
-- nach `orders` übernommen, damit nichts verloren geht. Die `appointments`-
-- Tabelle selbst wird NICHT gelöscht (falls noch irgendwas darauf zeigt), sie
-- wird von der App danach einfach nicht mehr benutzt.
--
-- Zusätzlich: Mitarbeiter-Stammdaten für die neue Einsatzplanung. Bewusst als
-- einfache Namensliste, unabhängig vom Login-System – so können auch nicht
-- registrierte Mitarbeiter mit echtem Namen einem Auftrag zugeordnet werden,
-- nicht nur eingeladene Techniker-Accounts.
-- =====================================================================

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "Eingeloggte Nutzer verwalten Mitarbeiter" on public.employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table public.orders add column if not exists time text;
alter table public.orders add column if not exists assigned_employee_id uuid references public.employees(id) on delete set null;

-- Bestehende Termine als Aufträge übernehmen (Titel generisch "Termin", da
-- appointments keinen eigenen Titel hatte).
insert into public.orders (customer_id, title, description, status, order_date, time)
select customer_id, 'Termin', description, 'offen', date, time
from public.appointments;

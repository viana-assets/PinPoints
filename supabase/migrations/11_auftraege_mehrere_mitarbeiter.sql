-- =====================================================================
-- Viana PinPoints – 11: Mehrere Mitarbeiter je Auftrag + Einsatzplanung-Kalender
-- Noch auszuführen. Braucht `public.orders` (03) und `public.employees` (07).
--
-- Bisher konnte einem Auftrag nur genau ein Mitarbeiter zugeordnet werden
-- (Spalte `orders.assigned_employee_id`). Manche Aufträge sind aber so
-- umfangreich, dass mehrere Mitarbeiter gemeinsam eingeteilt werden müssen.
-- Neue Verknüpfungstabelle `order_employees` (ein Auftrag ↔ viele Mitarbeiter,
-- ein Mitarbeiter ↔ viele Aufträge). Die App liest/schreibt Zuordnungen ab
-- sofort ausschließlich über diese Tabelle.
--
-- Die alte Spalte `orders.assigned_employee_id` wird NICHT gelöscht (falls
-- noch irgendwo referenziert) – sie wird unten einmalig nach `order_employees`
-- übernommen, damit keine bestehende Zuordnung verloren geht, bleibt danach
-- aber einfach ungenutzt liegen.
-- =====================================================================

create table if not exists public.order_employees (
  order_id uuid not null references public.orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (order_id, employee_id)
);

alter table public.order_employees enable row level security;

create policy "Eingeloggte Nutzer verwalten Auftrags-Mitarbeiter" on public.order_employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bestehende Einzel-Zuordnungen übernehmen.
insert into public.order_employees (order_id, employee_id)
select id, assigned_employee_id from public.orders
where assigned_employee_id is not null
on conflict (order_id, employee_id) do nothing;

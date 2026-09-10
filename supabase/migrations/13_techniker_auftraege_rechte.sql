-- =====================================================================
-- Viana PinPoints – 13: Echte Techniker-Rechte auf Aufträge
-- Noch auszuführen. Braucht `orders`/`order_employees` (03, 11) und
-- `public.current_user_role()` (05).
--
-- Bisher hatte die Rolle "Techniker" keinerlei eigenen Datenzugriff – sie
-- konnte (wie "Nutzer") alle Aufträge sehen und vollständig bearbeiten/löschen.
-- Ab dieser Migration gilt für die Rolle "Techniker" per Row-Level-Security
-- (nicht nur in der Oberfläche versteckt, sondern in der Datenbank erzwungen):
--
--   - SELECT auf `orders`: nur Aufträge, denen der eigene Mitarbeiter-Datensatz
--     (über `employees.profile_id = auth.uid()`) in `order_employees`
--     zugeordnet ist.
--   - INSERT/DELETE auf `orders`: nicht erlaubt (kein Auftrag anlegen/löschen).
--   - UPDATE auf `orders`: nur für einen eigenen zugeordneten Auftrag, und
--     dabei ausschließlich die Spalten `status` und die neue `techniker_notiz`
--     (ein Trigger lehnt jede Änderung an anderen Spalten – Titel, Kunde,
--     Termin, Beschreibung, Mitarbeiter-Zuordnung – ab).
--
-- Admin/Superadmin/Nutzer sind von alldem unberührt (weiterhin voller Zugriff
-- wie bisher). Bewusst NICHT verändert in dieser Migration: `customers`,
-- `vehicles`, `order_employees`, `order_articles` bleiben für Techniker lesbar
-- bzw. wie bisher (siehe Begründung in docs/roadmap.md, Phase 4) – die
-- Einschränkung "kein Zugriff auf Kunden-Stammdaten" wird stattdessen über die
-- bestehende Modulverwaltung (`module_permissions`, Tab "Kunden" ausblenden)
-- gelöst, nicht per RLS, damit z. B. die Kundenadresse eines eigenen Auftrags
-- (Navigation) und die Lager-Kundensuche für Techniker weiterhin funktionieren.
-- =====================================================================

-- Freitext-Notiz, die ausschließlich die zugeordnete Techniker-Rolle selbst
-- pflegt (getrennt von `description`, das der Admin/Büro-seitige Auftragstext
-- bleibt).
alter table public.orders add column if not exists techniker_notiz text;

-- Liefert die employees.id des Mitarbeiter-Datensatzes, der mit dem aktuell
-- eingeloggten Account verknüpft ist (Admin-Panel, siehe app-seitige
-- updateEmployeeProfileId()) – oder null, falls keiner verknüpft ist.
-- security definer wie public.current_user_role(), aus demselben Grund
-- (keine rekursiven RLS-Auswertungen auf employees selbst).
create or replace function public.current_employee_id()
returns uuid
language sql
security definer
stable
as $$
  select id from public.employees where profile_id = auth.uid() limit 1;
$$;

-- Bisherige Alles-oder-nichts-Policy ersetzen durch: Nicht-Techniker wie
-- gehabt, Techniker nur lesend/status-ändernd auf eigene Aufträge.
drop policy if exists "Eingeloggte Nutzer verwalten Aufträge" on public.orders;

create policy "Nicht-Techniker verwalten Aufträge" on public.orders
  for all
  using (public.current_user_role() <> 'techniker')
  with check (public.current_user_role() <> 'techniker');

create policy "Techniker sieht eigene Aufträge" on public.orders
  for select
  using (
    public.current_user_role() = 'techniker'
    and exists (
      select 1 from public.order_employees oe
      where oe.order_id = orders.id and oe.employee_id = public.current_employee_id()
    )
  );

create policy "Techniker aktualisiert eigene Aufträge" on public.orders
  for update
  using (
    public.current_user_role() = 'techniker'
    and exists (
      select 1 from public.order_employees oe
      where oe.order_id = orders.id and oe.employee_id = public.current_employee_id()
    )
  )
  with check (
    public.current_user_role() = 'techniker'
    and exists (
      select 1 from public.order_employees oe
      where oe.order_id = orders.id and oe.employee_id = public.current_employee_id()
    )
  );

-- Spalten-Schutz: selbst mit der obigen UPDATE-Policy könnte ein Techniker
-- technisch jede Spalte in seinem eigenen UPDATE-Aufruf mitschicken. Der
-- Trigger lehnt das explizit ab, wenn sich etwas außer status/techniker_notiz
-- ändert.
create or replace function public.restrict_techniker_order_update()
returns trigger as $$
begin
  if public.current_user_role() = 'techniker' then
    if new.customer_id is distinct from old.customer_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.order_date is distinct from old.order_date
       or new.time is distinct from old.time
       or new.assigned_employee_id is distinct from old.assigned_employee_id then
      raise exception 'Techniker dürfen an einem Auftrag nur Status und Techniker-Notiz ändern.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_restrict_techniker_order_update on public.orders;
create trigger trg_restrict_techniker_order_update
  before update on public.orders
  for each row execute procedure public.restrict_techniker_order_update();

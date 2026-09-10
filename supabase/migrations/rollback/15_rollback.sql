-- =====================================================================
-- Rücknahme von 15_rls_haertung.sql
-- Nur im Notfall ausführen: stellt den Stand VOR der Härtung wieder her,
-- inklusive der bekannten Sicherheitslücken (A1/A3). Danach bitte
-- zeitnah eine korrigierte Fassung von 15 einspielen.
-- Die angelegten Indizes bleiben bewusst bestehen – sie sind harmlos und
-- nur von Vorteil. Bereinigte Doppelbelegungen im Lager lassen sich nicht
-- automatisch zurückholen (die Historie zeigt sie weiterhin).
-- =====================================================================

drop trigger if exists trg_restrict_profile_role_change on public.profiles;
drop function if exists public.restrict_profile_role_change();

drop policy if exists "Nicht-Techniker verwalten Auftrags-Mitarbeiter" on public.order_employees;
drop policy if exists "Techniker liest Zuordnungen eigener Auftraege" on public.order_employees;
create policy "Eingeloggte Nutzer verwalten Auftrags-Mitarbeiter" on public.order_employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Nicht-Techniker verwalten Auftrags-Artikel" on public.order_articles;
drop policy if exists "Techniker liest Artikel eigener Auftraege" on public.order_articles;
create policy "Eingeloggte Nutzer verwalten Auftrags-Artikel" on public.order_articles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Nicht-Techniker verwalten Auftraege" on public.orders;
drop policy if exists "Techniker sieht eigene Auftraege" on public.orders;
drop policy if exists "Techniker aktualisiert eigene Auftraege" on public.orders;

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

drop index if exists public.tire_storage_ein_aktiver_satz_je_platz;
drop function if exists public.is_own_order(uuid);

-- Die Denylist-Fassung des Techniker-Triggers wiederherstellen.
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

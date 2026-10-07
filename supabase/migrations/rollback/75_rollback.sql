-- Rollback zu Migration 75 (alte Richtlinien aufräumen, Transporter beim Büro).
--
-- Stellt die 39 alten Richtlinien wieder her – genau so, wie sie am 07.10.2026 in der
-- Produktivdatenbank standen (aus pg_policies abgeschrieben, Funktionen mit „public.“) –, entfernt
-- „Artikel für Leistungen lesen“ und gibt dem Techniker den Transporter in der Datenbank zurück.
-- Damit gelten die alten, zu weiten Rechte wieder (siehe Kopf von Migration 75). Zweimal lauffähig.
-- Reihenfolge: zuerst die Dateien von v120 hochladen, dann dieses Skript.
begin;

drop policy if exists "Artikelpreise lesen" on public.article_prices;
create policy "Artikelpreise lesen" on public.article_prices as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Artikelpreise pflegen" on public.article_prices;
create policy "Artikelpreise pflegen" on public.article_prices as PERMISSIVE for ALL to authenticated using (( SELECT public.is_admin() AS is_admin)) with check (( SELECT public.is_admin() AS is_admin));
drop policy if exists "Artikel lesen" on public.articles;
create policy "Artikel lesen" on public.articles as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Artikel pflegen" on public.articles;
create policy "Artikel pflegen" on public.articles as PERMISSIVE for ALL to authenticated using (( SELECT public.is_admin() AS is_admin)) with check (( SELECT public.is_admin() AS is_admin));
drop policy if exists "Kontakthistorie aendern" on public.contact_history;
create policy "Kontakthistorie aendern" on public.contact_history as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Kontakthistorie lesen" on public.contact_history;
create policy "Kontakthistorie lesen" on public.contact_history as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Kontakthistorie loeschen" on public.contact_history;
create policy "Kontakthistorie loeschen" on public.contact_history as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Kontakthistorie schreiben" on public.contact_history;
create policy "Kontakthistorie schreiben" on public.contact_history as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Kunden aendern" on public.customers;
create policy "Kunden aendern" on public.customers as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Kunden anlegen" on public.customers;
create policy "Kunden anlegen" on public.customers as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('view.neuer_kunde'::text) AS has_module_permission));
drop policy if exists "Kunden lesen" on public.customers;
create policy "Kunden lesen" on public.customers as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Kunden loeschen" on public.customers;
create policy "Kunden loeschen" on public.customers as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Eingeloggte Nutzer verwalten eingelagerte Räder" on public.eingelagerte_raeder;
create policy "Eingeloggte Nutzer verwalten eingelagerte Räder" on public.eingelagerte_raeder as PERMISSIVE for ALL to public using ((auth.role() = 'authenticated'::text)) with check ((auth.role() = 'authenticated'::text));
drop policy if exists "Mitarbeiter aendern" on public.employees;
create policy "Mitarbeiter aendern" on public.employees as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('action.admin.employee_manage'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('action.admin.employee_manage'::text) AS has_module_permission));
drop policy if exists "Mitarbeiter anlegen" on public.employees;
create policy "Mitarbeiter anlegen" on public.employees as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('action.admin.employee_manage'::text) AS has_module_permission));
drop policy if exists "Mitarbeiter lesen" on public.employees;
create policy "Mitarbeiter lesen" on public.employees as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Mitarbeiter loeschen" on public.employees;
create policy "Mitarbeiter loeschen" on public.employees as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('action.admin.employee_manage'::text) AS has_module_permission));
drop policy if exists "Firmenfahrzeuge lesen" on public.firmenfahrzeuge;
create policy "Firmenfahrzeuge lesen" on public.firmenfahrzeuge as PERMISSIVE for SELECT to public using ((auth.role() = 'authenticated'::text));
drop policy if exists "Firmenfahrzeuge pflegen" on public.firmenfahrzeuge;
create policy "Firmenfahrzeuge pflegen" on public.firmenfahrzeuge as PERMISSIVE for ALL to public using ((public.current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))) with check ((public.current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])));
drop policy if exists "Techniker liest Zuordnungen eigener Auftraege" on public.order_employees;
create policy "Techniker liest Zuordnungen eigener Auftraege" on public.order_employees as PERMISSIVE for SELECT to authenticated using (((public.current_user_role() = 'techniker'::text) AND public.is_own_order(order_id)));
drop policy if exists "Nicht-Techniker verwalten Auftraege" on public.orders;
create policy "Nicht-Techniker verwalten Auftraege" on public.orders as PERMISSIVE for ALL to authenticated using ((COALESCE(public.current_user_role(), ''::text) <> 'techniker'::text)) with check ((COALESCE(public.current_user_role(), ''::text) <> 'techniker'::text));
drop policy if exists "Techniker aktualisiert eigene Auftraege" on public.orders;
create policy "Techniker aktualisiert eigene Auftraege" on public.orders as PERMISSIVE for UPDATE to authenticated using (((public.current_user_role() = 'techniker'::text) AND public.is_own_order(id))) with check (((public.current_user_role() = 'techniker'::text) AND public.is_own_order(id)));
drop policy if exists "Techniker sieht eigene Auftraege" on public.orders;
create policy "Techniker sieht eigene Auftraege" on public.orders as PERMISSIVE for SELECT to authenticated using (((public.current_user_role() = 'techniker'::text) AND public.is_own_order(id)));
drop policy if exists "Lagerplaetze aendern" on public.storage_slots;
create policy "Lagerplaetze aendern" on public.storage_slots as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('action.lager.slot_create'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('action.lager.slot_create'::text) AS has_module_permission));
drop policy if exists "Lagerplaetze anlegen" on public.storage_slots;
create policy "Lagerplaetze anlegen" on public.storage_slots as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('action.lager.slot_create'::text) AS has_module_permission));
drop policy if exists "Lagerplaetze lesen" on public.storage_slots;
create policy "Lagerplaetze lesen" on public.storage_slots as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_module_permission('view.lager'::text) AS has_module_permission));
drop policy if exists "Lagerplaetze loeschen" on public.storage_slots;
create policy "Lagerplaetze loeschen" on public.storage_slots as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('action.lager.slot_delete'::text) AS has_module_permission));
drop policy if exists "Einlagerungen aendern" on public.tire_storage;
create policy "Einlagerungen aendern" on public.tire_storage as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('action.lager.tire_assign'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('action.lager.tire_assign'::text) AS has_module_permission));
drop policy if exists "Einlagerungen anlegen" on public.tire_storage;
create policy "Einlagerungen anlegen" on public.tire_storage as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('action.lager.tire_assign'::text) AS has_module_permission));
drop policy if exists "Einlagerungen lesen" on public.tire_storage;
create policy "Einlagerungen lesen" on public.tire_storage as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_module_permission('view.lager'::text) AS has_module_permission));
drop policy if exists "Einlagerungen loeschen" on public.tire_storage;
create policy "Einlagerungen loeschen" on public.tire_storage as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('action.lager.tire_assign'::text) AS has_module_permission));
drop policy if exists "Fahrzeuge aendern" on public.vehicles;
create policy "Fahrzeuge aendern" on public.vehicles as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Fahrzeuge lesen" on public.vehicles;
create policy "Fahrzeuge lesen" on public.vehicles as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "Fahrzeuge loeschen" on public.vehicles;
create policy "Fahrzeuge loeschen" on public.vehicles as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Fahrzeuge schreiben" on public.vehicles;
create policy "Fahrzeuge schreiben" on public.vehicles as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('view.kunden'::text) AS has_module_permission));
drop policy if exists "Lager anlegen" on public.warehouses;
create policy "Lager anlegen" on public.warehouses as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_module_permission('action.lager.warehouse_create'::text) AS has_module_permission));
drop policy if exists "Lager bearbeiten" on public.warehouses;
create policy "Lager bearbeiten" on public.warehouses as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_module_permission('action.lager.warehouse_edit'::text) AS has_module_permission)) with check (( SELECT public.has_module_permission('action.lager.warehouse_edit'::text) AS has_module_permission));
drop policy if exists "Lager lesen" on public.warehouses;
create policy "Lager lesen" on public.warehouses as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_module_permission('view.lager'::text) AS has_module_permission));
drop policy if exists "Lager loeschen" on public.warehouses;
create policy "Lager loeschen" on public.warehouses as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_module_permission('action.lager.warehouse_delete'::text) AS has_module_permission));

drop policy if exists "Artikel für Leistungen lesen" on public.articles;
drop policy if exists "Artikel für Leistungen lesen" on public.article_prices;

create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  gesperrt constant text[] := array[
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    'cancelled_at', 'cancelled_by', 'cancel_reason', 'deleted_at',
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht stornieren, löschen, wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$f$;

commit;

select 'Alte Richtlinien wiederhergestellt' as pruefung,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.policyname not like 'Bereich %'
           and p.tablename = any (array['article_prices', 'articles', 'contact_history', 'customers', 'eingelagerte_raeder', 'employees', 'firmenfahrzeuge', 'order_employees', 'orders', 'storage_slots', 'tire_storage', 'vehicles', 'warehouses'])
           and p.policyname <> 'Techniker legt Fahrzeug eigener Kunden an')::text || ' von 39' as ergebnis;

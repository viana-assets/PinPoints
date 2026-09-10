-- =====================================================================
-- Rücknahme von 16_rechte_in_der_datenbank.sql
-- Stellt den Stand VOR der Rechteverlagerung wieder her: jede Tabelle
-- wieder auf "jeder Eingeloggte darf alles" (Review-Befund A2), Artikel
-- wieder auf Admin/Superadmin. Nur im Notfall – danach bitte zeitnah eine
-- korrigierte Fassung von 16 einspielen.
-- Der Katalog-Abgleich (neue Schlüssel, entfernte Techniker-Haken) wird
-- NICHT zurückgedreht: er entspricht dem gewollten Stand aus Phase 4.
-- =====================================================================

drop policy if exists "Kunden lesen" on public.customers;
drop policy if exists "Kunden anlegen" on public.customers;
drop policy if exists "Kunden aendern" on public.customers;
drop policy if exists "Kunden loeschen" on public.customers;
create policy "Eingeloggte Nutzer lesen Kunden" on public.customers
  for select using (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer legen Kunden an" on public.customers
  for insert with check (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer aktualisieren Kunden" on public.customers
  for update using (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer löschen Kunden" on public.customers
  for delete using (auth.role() = 'authenticated');

drop policy if exists "Kontakthistorie lesen" on public.contact_history;
drop policy if exists "Kontakthistorie schreiben" on public.contact_history;
drop policy if exists "Kontakthistorie aendern" on public.contact_history;
drop policy if exists "Kontakthistorie loeschen" on public.contact_history;
create policy "Eingeloggte Nutzer verwalten Historie" on public.contact_history
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Fahrzeuge lesen" on public.vehicles;
drop policy if exists "Fahrzeuge schreiben" on public.vehicles;
drop policy if exists "Fahrzeuge aendern" on public.vehicles;
drop policy if exists "Fahrzeuge loeschen" on public.vehicles;
create policy "Eingeloggte Nutzer verwalten Fahrzeuge" on public.vehicles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Lager lesen" on public.warehouses;
drop policy if exists "Lager anlegen" on public.warehouses;
drop policy if exists "Lager bearbeiten" on public.warehouses;
drop policy if exists "Lager loeschen" on public.warehouses;
create policy "Eingeloggte Nutzer verwalten Lager" on public.warehouses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Lagerplaetze lesen" on public.storage_slots;
drop policy if exists "Lagerplaetze anlegen" on public.storage_slots;
drop policy if exists "Lagerplaetze aendern" on public.storage_slots;
drop policy if exists "Lagerplaetze loeschen" on public.storage_slots;
create policy "Eingeloggte Nutzer verwalten Lagerplätze" on public.storage_slots
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Einlagerungen lesen" on public.tire_storage;
drop policy if exists "Einlagerungen anlegen" on public.tire_storage;
drop policy if exists "Einlagerungen aendern" on public.tire_storage;
drop policy if exists "Einlagerungen loeschen" on public.tire_storage;
create policy "Eingeloggte Nutzer verwalten Reifenlagerung" on public.tire_storage
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Mitarbeiter lesen" on public.employees;
drop policy if exists "Mitarbeiter anlegen" on public.employees;
drop policy if exists "Mitarbeiter aendern" on public.employees;
drop policy if exists "Mitarbeiter loeschen" on public.employees;
create policy "Eingeloggte Nutzer verwalten Mitarbeiter" on public.employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Artikel lesen" on public.articles;
drop policy if exists "Artikel pflegen" on public.articles;
create policy "Eingeloggte Nutzer lesen Artikelstammdaten" on public.articles
  for select using (auth.role() = 'authenticated');
create policy "Nur Admin/Superadmin pflegen Artikelstammdaten" on public.articles
  for all using (public.current_user_role() in ('admin', 'superadmin'))
  with check (public.current_user_role() in ('admin', 'superadmin'));

drop policy if exists "Artikelpreise lesen" on public.article_prices;
drop policy if exists "Artikelpreise pflegen" on public.article_prices;
create policy "Eingeloggte Nutzer lesen Artikelpreise" on public.article_prices
  for select using (auth.role() = 'authenticated');
create policy "Nur Admin/Superadmin pflegen Artikelpreise" on public.article_prices
  for all using (public.current_user_role() in ('admin', 'superadmin'))
  with check (public.current_user_role() in ('admin', 'superadmin'));

drop policy if exists "Modulrechte lesen" on public.module_permissions;
drop policy if exists "Modulrechte aendern" on public.module_permissions;
create policy "Eingeloggte Nutzer lesen Modul-Berechtigungen" on public.module_permissions
  for select using (auth.role() = 'authenticated');
create policy "Nur Superadmin aendert Modul-Berechtigungen" on public.module_permissions
  for all using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

drop policy if exists "Eigene Einstellungen" on public.user_settings;
create policy "Nutzer verwaltet eigene Einstellungen" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigenes Profil lesen" on public.profiles;
drop policy if exists "Eigenes Profil aendern" on public.profiles;
drop policy if exists "Superadmin liest alle Profile" on public.profiles;
drop policy if exists "Superadmin aendert alle Profile" on public.profiles;
create policy "Nutzer sieht eigenes Profil" on public.profiles
  for select using (auth.uid() = id);
create policy "Nutzer aktualisiert eigenes Profil" on public.profiles
  for update using (auth.uid() = id);
create policy "Superadmin liest alle Profile" on public.profiles
  for select using (public.current_user_role() = 'superadmin');
create policy "Superadmin aktualisiert alle Profile" on public.profiles
  for update using (public.current_user_role() = 'superadmin');

create policy "Eingeloggte Nutzer verwalten Termine" on public.appointments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop function if exists public.has_module_permission(text);
drop function if exists public.is_admin();

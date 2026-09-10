-- =====================================================================
-- Viana PinPoints – 09: Modul-Berechtigungen
-- Noch auszuführen. Braucht `public.current_user_role()` aus Migration 05
-- (falls 05 noch nicht lief: bitte vorher ausführen).
--
-- Bisher konnte jede eingeloggte Person Lager anlegen/löschen und Lagerplätze
-- anlegen/löschen. Das soll steuerbar werden: pro Modul wird hinterlegt,
-- welche Rollen dort strukturelle Änderungen vornehmen dürfen. Superadmin
-- darf in der App immer alles, unabhängig vom Inhalt dieser Tabelle.
-- Nur der Superadmin darf diese Zuordnung ändern (Governance-Entscheidung).
-- =====================================================================

create table if not exists public.module_permissions (
  module_key text primary key,
  edit_roles text[] not null default '{admin,superadmin}'::text[]
);

alter table public.module_permissions enable row level security;

create policy "Eingeloggte Nutzer lesen Modul-Berechtigungen" on public.module_permissions
  for select using (auth.role() = 'authenticated');

create policy "Nur Superadmin aendert Modul-Berechtigungen" on public.module_permissions
  for all using (public.current_user_role() = 'superadmin') with check (public.current_user_role() = 'superadmin');

-- Startwert: Lager darf zunächst nur von Admin/Superadmin strukturell verändert werden
-- (Lager anlegen/löschen, Lagerplätze anlegen/löschen) – Reifen zuordnen bleibt für alle
-- offen, die das Modul sehen, und ist davon unabhängig geregelt (nicht Teil dieser Tabelle).
insert into public.module_permissions (module_key, edit_roles)
values ('lager', '{admin,superadmin}')
on conflict (module_key) do nothing;

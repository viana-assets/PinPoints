-- =====================================================================
-- Viana PinPoints – 05: Rollen (Superadmin/Admin/Techniker) + Nutzerverwaltung
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor.
--
-- Erweitert die Rollen um "superadmin" und "techniker" und erlaubt dem
-- Superadmin, alle Profile zu lesen und deren Rolle zu ändern (für die
-- neue Nutzerverwaltungs-Seite /admin/users). Der bisherige einzelne
-- Admin-Account wird zum Superadmin befördert.
-- =====================================================================

-- Rollen-Constraint erweitern
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin','admin','techniker','user'));

-- Trigger für neue Nutzer: der in ADMIN_EMAIL hinterlegte Account wird
-- künftig direkt als Superadmin angelegt (statt Admin).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(current_setting('app.admin_email', true))
         then 'superadmin' else 'user' end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Hilfsfunktion, die die Rolle des aktuell eingeloggten Nutzers liefert,
-- ohne die RLS-Policies auf public.profiles rekursiv erneut auszulösen
-- (security definer läuft mit den Rechten des Funktionseigentümers).
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Superadmin darf alle Profile lesen und deren Rolle ändern (für die
-- Nutzerverwaltungs-Seite). Bestehende Policies ("Nutzer sieht/aktualisiert
-- eigenes Profil") bleiben zusätzlich bestehen.
create policy "Superadmin liest alle Profile" on public.profiles
  for select using (public.current_user_role() = 'superadmin');

create policy "Superadmin aktualisiert alle Profile" on public.profiles
  for update using (public.current_user_role() = 'superadmin');

-- Einmalig: bestehenden Admin-Account zum Superadmin befördern.
-- E-Mail bei Bedarf anpassen, falls ein anderer Account der ADMIN_EMAIL
-- aus den Vercel-Umgebungsvariablen entspricht.
update public.profiles set role = 'superadmin' where email = 'vitali.hermann@outlook.com';

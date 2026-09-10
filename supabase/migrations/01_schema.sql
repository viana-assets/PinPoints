-- =====================================================================
-- Viana PinPoints – 01: Basis-Schema
-- Bereits erledigt / einmalig im Supabase SQL-Editor ausgeführt.
-- Vorher: Projekt in einer EU-Region anlegen (z.B. Frankfurt).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Profiles: ein Datensatz pro eingeladenem Nutzer, Rolle admin/user
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Nutzer sieht eigenes Profil" on public.profiles
  for select using (auth.uid() = id);

create policy "Nutzer aktualisiert eigenes Profil" on public.profiles
  for update using (auth.uid() = id);

-- Trigger: bei jedem neuen Auth-Nutzer automatisch ein Profil anlegen.
-- Die im Server gesetzte ADMIN_EMAIL bekommt automatisch role='admin'.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(current_setting('app.admin_email', true))
         then 'admin' else 'user' end
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Hinweis: current_setting('app.admin_email') ist standardmäßig leer.
-- Am einfachsten: nach dem ersten Login mit vitali.hermann@outlook.com
-- einmalig manuell ausführen:
--   update public.profiles set role = 'admin' where email = 'vitali.hermann@outlook.com';

-- ---------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  phone_mobile text,
  phone_landline text,
  note text,
  lat double precision,
  lng double precision,
  status text not null default 'offen' check (status in ('offen','kontaktiert')),
  last_contact date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Eingeloggte Nutzer lesen Kunden" on public.customers
  for select using (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer legen Kunden an" on public.customers
  for insert with check (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer aktualisieren Kunden" on public.customers
  for update using (auth.role() = 'authenticated');
create policy "Eingeloggte Nutzer löschen Kunden" on public.customers
  for delete using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Termine
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  date date not null,
  time text,
  description text,
  created_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

create policy "Eingeloggte Nutzer verwalten Termine" on public.appointments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Kontakt-Historie
-- ---------------------------------------------------------------------
create table if not exists public.contact_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.contact_history enable row level security;

create policy "Eingeloggte Nutzer verwalten Historie" on public.contact_history
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Persönliche Einstellungen (Kartenstil, Wiedervorlage-Zeitraum, Zeilenanzeige)
-- Die Spalte "theme" ist historisch (Dark Mode wurde wieder entfernt und
-- wird von der App nicht mehr gelesen/geschrieben) – kann einfach stehen
-- bleiben, muss nicht gelöscht werden.
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  period_months int not null default 3,
  map_style text not null default 'strasse',
  theme text not null default 'light',
  row_display text not null default 'datum' check (row_display in ('datum','status','tage'))
);

alter table public.user_settings enable row level security;

create policy "Nutzer verwaltet eigene Einstellungen" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

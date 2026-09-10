-- =====================================================================
-- Viana PinPoints – 04: Fahrzeuge je Kunde
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor.
--
-- Ein Kunde kann mehrere Fahrzeuge haben. Jedes Fahrzeug trägt optional
-- einfache "aktuell montiert"-Reifenfelder sowie eine optionale
-- Verknüpfung zu einem eingelagerten Reifensatz aus dem Lager-Modul –
-- nur wenn für dieses Fahrzeug tatsächlich ein Satz eingelagert ist.
-- =====================================================================

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  license_plate text,
  make_model text,
  tire_size text,
  tire_dot_date text,
  tire_profile_mm numeric(4,1),
  stored_tire_storage_id uuid references public.tire_storage(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

create policy "Eingeloggte Nutzer verwalten Fahrzeuge" on public.vehicles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

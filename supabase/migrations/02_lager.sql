-- =====================================================================
-- Viana PinPoints – 02: Lager-Modul
-- Bereits erledigt / einmalig im Supabase SQL-Editor ausgeführt.
-- Lager, Lagerplätze, Reifen-Einlagerung.
-- =====================================================================

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.warehouses enable row level security;

create policy "Eingeloggte Nutzer verwalten Lager" on public.warehouses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists public.storage_slots (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.storage_slots enable row level security;

create policy "Eingeloggte Nutzer verwalten Lagerplätze" on public.storage_slots
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Ein Lagerplatz kann über die Zeit mehrfach belegt werden (alter Kunde holt
-- Reifen ab, neuer Kunde lagert ein); die App zeigt je Lagerplatz immer nur
-- die zuletzt angelegte/aktualisierte Zeile als "aktuelle Belegung" an.
create table if not exists public.tire_storage (
  id uuid primary key default gen_random_uuid(),
  storage_slot_id uuid not null references public.storage_slots(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  dot_date text,
  profiltiefe_mm numeric(4,1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tire_storage enable row level security;

create policy "Eingeloggte Nutzer verwalten Reifenlagerung" on public.tire_storage
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

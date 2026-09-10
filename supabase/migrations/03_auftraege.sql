-- =====================================================================
-- Viana PinPoints – 03: Aufträge-Modul
-- Bereits erledigt / einmalig im Supabase SQL-Editor ausgeführt.
-- =====================================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'offen' check (status in ('offen','in_arbeit','erledigt')),
  order_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Eingeloggte Nutzer verwalten Aufträge" on public.orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

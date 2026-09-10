-- Rücknahme von 18_audit_und_integritaet.sql.
-- Entfernt Protokoll, Urheber-Spalten und die neuen Constraints. Achtung: das
-- Änderungsprotokoll geht dabei unwiderruflich verloren.

do $$
declare
  t text;
  tabellen text[] := array[
    'customers', 'contact_history', 'orders', 'order_articles', 'articles', 'article_prices',
    'vehicles', 'tire_storage', 'warehouses', 'storage_slots', 'employees',
    'module_permissions', 'profiles'
  ];
begin
  foreach t in array tabellen loop
    execute format('drop trigger if exists trg_stamp_row on public.%I', t);
    execute format('drop trigger if exists trg_audit_row on public.%I', t);
    execute format('alter table public.%I drop column if exists created_by', t);
    execute format('alter table public.%I drop column if exists updated_by', t);
  end loop;
end $$;
-- updated_at bleibt bewusst stehen: einige Tabellen (orders, customers, vehicles,
-- tire_storage) hatten die Spalte schon vorher, und die Anwendung liest sie.

drop function if exists public.stamp_row();
drop function if exists public.audit_row();
drop table if exists public.audit_log;

drop index if exists public.storage_slots_code_je_lager;
alter table public.article_prices drop constraint if exists article_prices_kein_ueberlapp;

-- Techniker-Spaltenschutz auf die Fassung ohne updated_by zurücksetzen.
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array['status', 'techniker_notiz', 'updated_at'];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    if (to_jsonb(old) - aenderbar) is distinct from (to_jsonb(new) - aenderbar) then
      raise exception 'Techniker dürfen an einem Auftrag nur Status und Techniker-Notiz ändern.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

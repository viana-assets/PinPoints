-- Rücknahme von 20_auftragsablauf.sql.
--
-- Achtung, Reihenfolge: erst den Anwendungscode auf den Stand VOR dem Auftragsablauf
-- zurückdrehen, danach dieses Skript. Sonst zeigt die Oberfläche Schaltflächen für Zustände an,
-- die es in der Datenbank nicht mehr gibt.
--
-- Bereits stornierte Aufträge werden auf "offen" zurückgesetzt, weil der Zustand nach der
-- Rücknahme nicht mehr erlaubt ist. Auftragsnummer und Fahrzeugbezug bleiben bewusst erhalten –
-- sie stören nicht und ihr Verlust wäre schmerzhafter als ihr Verbleib.

drop trigger if exists trg_enforce_order_status_transition on public.orders;
drop function if exists public.enforce_order_status_transition();

drop trigger if exists trg_freeze_order_articles on public.order_articles;
drop function if exists public.freeze_order_articles();

update public.orders set status = 'offen' where status = 'storniert';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('offen', 'in_arbeit', 'erledigt'));

-- Spaltenschutz für Techniker auf die Fassung ohne die Abschluss-Felder zurücksetzen.
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array['status', 'techniker_notiz', 'updated_at', 'updated_by'];
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

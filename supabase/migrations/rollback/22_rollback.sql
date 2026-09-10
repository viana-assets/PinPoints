-- Rücknahme von 22_lagerplatz_am_auftrag.sql.
--
-- Reihenfolge: erst den Anwendungscode zurückdrehen, dann dieses Skript. Sonst zeigt die
-- Oberfläche einen Einlagerungs-Block und ein Artikel-Kennzeichen an, die es in der Datenbank
-- nicht mehr gibt.
--
-- Die Zuordnung Lagerplatz ↔ Auftrag geht dabei verloren; die Einlagerungen selbst bleiben
-- vollständig erhalten (Lagerplatz, Kunde, DOT, Profiltiefe, Historie). Das ist der Preis
-- dafür, die Spalte zu entfernen – wer sie retten will, sichert sie vorher:
--
--   create table public.tire_storage_auftragsbezug_sicherung as
--     select id, order_id from public.tire_storage where order_id is not null;

-- 1. Statuswechsel-Trigger auf den Stand von Migration 20 zurücksetzen (ohne Lagerplatzprüfung).
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  wer uuid := (select auth.uid());
  rolle text := coalesce(public.current_user_role(), '');
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status, new.status) in (
       ('offen', 'in_arbeit'), ('offen', 'erledigt'), ('offen', 'storniert'),
       ('in_arbeit', 'offen'), ('in_arbeit', 'erledigt'), ('in_arbeit', 'storniert')
     ) then
    null;
  elsif old.status in ('erledigt', 'storniert') and new.status in ('offen', 'in_arbeit') then
    if rolle not in ('admin', 'superadmin') then
      raise exception 'Nur Admin oder Superadmin dürfen einen abgeschlossenen oder stornierten Auftrag wiedereröffnen.';
    end if;
    if coalesce(btrim(new.reopen_reason), '') = '' then
      raise exception 'Zum Wiedereröffnen wird eine Begründung benötigt.';
    end if;
  else
    raise exception 'Dieser Statuswechsel ist nicht vorgesehen (% → %).', old.status, new.status;
  end if;

  if new.status = 'erledigt' then
    new.completed_at := now();
    new.completed_by := wer;
  elsif old.status = 'erledigt' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'storniert' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Für eine Stornierung wird ein Grund benötigt.';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := wer;
  elsif old.status = 'storniert' then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

-- 2. Spalten entfernen.
drop index if exists public.idx_tire_storage_order_id;
alter table public.tire_storage drop column if exists order_id;
alter table public.articles drop column if exists braucht_lagerplatz;

-- =====================================================================
-- Viana PinPoints – 20: Auftragsablauf (Zustände, Abschluss, Fahrzeug, Auftragsnummer)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 15, 18, 19.
--
-- Konzept und Begründung: docs/auftragsablauf.md.
--
-- Kurz: der Status eines Auftrags war bisher ein Auswahlfeld mit drei erlaubten Werten. Er
-- setzte nichts durch und löste nichts aus – man konnte beliebig hin- und herspringen, und ein
-- "erledigter" Auftrag blieb so veränderbar wie ein offener. Damit war "Erledigt" eine
-- Behauptung, keine Tatsache, und als Grundlage für eine Rechnung (Roadmap Phase 5) unbrauchbar.
--
-- Ab hier gilt: Zustände werden nicht ausgewählt, sondern durch Handlungen erreicht, die Übergänge
-- sind geregelt, und ein Abschluss friert die Positionen ein.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/20_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auftragsnummer: für Menschen lesbar, fortlaufend. Gleiches Muster wie
-- articles.article_number (Migration 14). Ohne sie lässt sich weder eine Rechnung noch ein
-- Telefonat mit dem Kunden eindeutig führen ("zu Auftrag 143").
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq;
alter table public.orders add column if not exists order_number int;

with nummeriert as (
  select id, row_number() over (order by created_at, id) as rn
  from public.orders
  where order_number is null
)
update public.orders o set order_number = nummeriert.rn
from nummeriert where o.id = nummeriert.id;

select setval('public.order_number_seq', coalesce((select max(order_number) from public.orders), 0));

alter table public.orders alter column order_number set default nextval('public.order_number_seq');
alter table public.orders alter column order_number set not null;

do $$
begin
  alter table public.orders add constraint orders_order_number_unique unique (order_number);
exception when duplicate_table or duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Fahrzeugbezug: bisher hingen Fahrzeuge nur am Kunden. Bei einem Kunden mit zwei Autos musste
-- der Techniker vor Ort nachfragen, um welches es geht – bei einem Reifenservice die eigentlich
-- zentrale Angabe.
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists idx_orders_vehicle on public.orders (vehicle_id);

-- ---------------------------------------------------------------------
-- Neuer Zustand "storniert" + Felder, die einen Abschluss zu einer Tatsache machen.
-- ---------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('offen', 'in_arbeit', 'erledigt', 'storniert'));

alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists completed_by uuid;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists reopen_reason text;

-- ---------------------------------------------------------------------
-- Die Zustandsmaschine. Erlaubt sind nur die Übergänge aus docs/auftragsablauf.md:
--
--   offen      → in_arbeit | erledigt | storniert
--   in_arbeit  → offen | erledigt | storniert
--   erledigt   → offen | in_arbeit   (nur Admin/Superadmin, nur mit Begründung)
--   storniert  → offen | in_arbeit   (dito)
--
-- Die Zeitstempel setzt die Datenbank selbst, nicht der Client: sonst wäre "abgeschlossen am"
-- eine Angabe, die sich jeder Aufrufer aussuchen kann.
-- ---------------------------------------------------------------------
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

drop trigger if exists trg_enforce_order_status_transition on public.orders;
create trigger trg_enforce_order_status_transition
  before update on public.orders
  for each row execute procedure public.enforce_order_status_transition();

-- ---------------------------------------------------------------------
-- Einfrieren: die Positionen eines erledigten oder stornierten Auftrags sind unveränderlich.
-- Durchgesetzt in der Datenbank, nicht in der Oberfläche – eine ausgeblendete Schaltfläche ist
-- keine Zusicherung (dasselbe Prinzip wie bei den Modul-Berechtigungen, Migration 16).
--
-- security definer, weil die Abfrage auf orders sonst an den Zeilenrechten eines Technikers
-- scheitern könnte, obwohl der Auftrag existiert.
--
-- Wichtige Ausnahme: die Kettenwirkung des Soft-Deletes aus Migration 19 setzt `deleted_at` auf
-- den Positionen eines gelöschten Auftrags. Ändert sich AUSSCHLIESSLICH dieses Feld, ist das
-- keine inhaltliche Änderung und muss durchgelassen werden – sonst ließe sich ein erledigter
-- Auftrag nicht mehr löschen.
-- ---------------------------------------------------------------------
create or replace function public.freeze_order_articles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auftrag uuid;
  zustand text;
begin
  if tg_op = 'DELETE' then
    auftrag := old.order_id;
  else
    auftrag := new.order_id;
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'deleted_at') is not distinct from (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;

  select status into zustand from public.orders where id = auftrag;

  if zustand in ('erledigt', 'storniert') then
    raise exception 'Der Auftrag ist abgeschlossen – seine Leistungen lassen sich nicht mehr ändern.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_order_articles on public.order_articles;
create trigger trg_freeze_order_articles
  before insert or update or delete on public.order_articles
  for each row execute procedure public.freeze_order_articles();

-- ---------------------------------------------------------------------
-- Der Spaltenschutz für Techniker (Migration 15, erweitert in 18) arbeitet mit einer
-- Positivliste. Der Übergangs-Trigger oben setzt beim Abschließen zusätzlich completed_at und
-- completed_by – ohne diese Ergänzung würde der Spaltenschutz JEDEN Abschluss durch einen
-- Techniker ablehnen.
--
-- Bewusst NICHT in der Liste: die Storno-Felder. Dadurch kann ein Techniker einen Auftrag
-- abschließen, aber nicht stornieren – ohne dass das eigens geprüft werden müsste.
-- ---------------------------------------------------------------------
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array[
    'status', 'techniker_notiz', 'updated_at', 'updated_by', 'completed_at', 'completed_by'
  ];
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

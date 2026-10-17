-- =====================================================================
-- Migration 101 – Kundengruppen: Hauptkunde mit Unterdebitoren (17.10.2026, v165).
--
-- Wunsch Vitali (17.10.2026): Drei Firmen mit derselben Anschrift gehören zu einem Hauptkunden, sind steuerlich
-- aber drei Rechnungsempfänger. Ein Auftrag läuft auf den Hauptkunden, die Fahrzeuge gehören den Unterdebitoren;
-- Etikett, Einlagerung und (Runde 2) Rechnung folgen dem Halter des Fahrzeugs. docs/kunden-und-karte.md
-- „Kundengruppen“. Entschieden: eigener Gruppen-Kunde als Hauptkunde, Zuordnung am Fahrzeug (im Auftrag änderbar),
-- je Unterdebitor eine Rechnung (Runde 2), jede Firma zahlt selbst.
--
--   1. `customers.haupt_kunde_id`: Verweis auf den Hauptkunden, genau eine Ebene (ein Unterdebitor hat keine eigenen
--      Unterdebitoren, ein Hauptkunde hängt nicht selbst unter einem). Laufkundschaft und Einmalkunden gehören in
--      keine Gruppe, Testkunden nur zu Testkunden. Ein Hauptkunde mit Unterdebitoren lässt sich nicht löschen.
--   2. `kunde_gruppe(id)`: die Gruppe eines Kunden (= der Hauptkunde, sonst er selbst).
--   3. Einlagerung: Bekommt ein Satz ein Fahrzeug eines anderen Kunden DERSELBEN Gruppe, übernimmt er dessen Halter
--      als Kunden (`tire_storage_fahrzeug_passt`); Vormerken und Tausch vergleichen die Gruppe statt des Kunden.
--   4. `fahrzeug_kunde_wechseln()`: ein Fahrzeug einem anderen Kunden der Gruppe zuordnen – mit seinen Sätzen im
--      Lager. `satz_kunde_wechseln()`: einen Satz ohne Fahrzeug einem anderen Kunden der Gruppe zuordnen (Etikett).
--   5. `ist_eigener_kunde()`: Der Techniker auf einem Auftrag des Hauptkunden sieht auch dessen Unterdebitoren.
--
-- Ausgestellte Rechnungen bleiben unberührt (Snapshot). Reihenfolge: nach 100, SQL zuerst, dann v165. Zweiter Lauf
-- folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.tire_storage_tausch_pruefen()') is null or to_regprocedure('public.ist_eigener_kunde(uuid)') is null then
    raise exception 'Zuerst die Migrationen 45 und 69 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Verweis und seine Regeln
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists haupt_kunde_id uuid references public.customers (id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_haupt_nicht_selbst') then
    alter table public.customers add constraint customers_haupt_nicht_selbst check (haupt_kunde_id is distinct from id);
  end if;
end $$;
create index if not exists customers_haupt_kunde on public.customers (haupt_kunde_id) where haupt_kunde_id is not null;
comment on column public.customers.haupt_kunde_id is
  'Migration 101: Hauptkunde dieses Unterdebitors (eine Ebene). Rechnungen gehen an den Unterdebitor, der Auftrag darf auf den Hauptkunden laufen. docs/kunden-und-karte.md „Kundengruppen“.';

create or replace function public.kunde_gruppe_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  haupt public.customers%rowtype;
begin
  if new.haupt_kunde_id is not null then
    select * into haupt from public.customers c where c.id = new.haupt_kunde_id;
    if not found or haupt.deleted_at is not null then
      raise exception 'Den Hauptkunden gibt es nicht (mehr).';
    end if;
    if haupt.haupt_kunde_id is not null then
      raise exception 'Der gewählte Hauptkunde ist selbst Unterdebitor – es gibt nur eine Ebene.';
    end if;
    if exists (select 1 from public.customers k where k.haupt_kunde_id = new.id and k.deleted_at is null) then
      raise exception 'Dieser Kunde hat selbst Unterdebitoren und kann deshalb nicht unter einen anderen Hauptkunden.';
    end if;
    if new.laufkundschaft or new.einmalkunde or haupt.laufkundschaft or haupt.einmalkunde then
      raise exception 'Laufkundschaft und Einmalkunden gehören in keine Kundengruppe.';
    end if;
    if coalesce(new.testkunde, false) is distinct from coalesce(haupt.testkunde, false) then
      raise exception 'Ein Testkunde und ein echter Kunde lassen sich nicht in einer Gruppe verbinden.';
    end if;
  end if;
  -- Ein Hauptkunde mit (nicht gelöschten) Unterdebitoren: nicht löschen, nicht zur Laufkundschaft/zum Einmalkunden.
  if tg_op = 'UPDATE' and exists (select 1 from public.customers k where k.haupt_kunde_id = new.id and k.deleted_at is null) then
    if new.deleted_at is not null and old.deleted_at is null then
      raise exception 'Dieser Kunde ist Hauptkunde von Unterdebitoren. Erst die Unterdebitoren lösen oder einem anderen Hauptkunden zuordnen.';
    end if;
    if (new.laufkundschaft and not old.laufkundschaft) or (new.einmalkunde and not old.einmalkunde) then
      raise exception 'Ein Hauptkunde mit Unterdebitoren kann nicht Laufkundschaft oder Einmalkunde sein.';
    end if;
    if coalesce(new.testkunde, false) is distinct from coalesce(old.testkunde, false) then
      raise exception 'Ein Hauptkunde mit Unterdebitoren kann nicht zum Testkunden werden (oder umgekehrt).';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kunde_gruppe_pruefen on public.customers;
create trigger trg_kunde_gruppe_pruefen
  before insert or update of haupt_kunde_id, laufkundschaft, einmalkunde, testkunde, deleted_at on public.customers
  for each row execute procedure public.kunde_gruppe_pruefen();

-- ---------------------------------------------------------------------
-- 2. Die Gruppe eines Kunden
-- ---------------------------------------------------------------------
create or replace function public.kunde_gruppe(p_kunde uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.haupt_kunde_id, c.id) from public.customers c where c.id = p_kunde;
$$;
revoke all on function public.kunde_gruppe(uuid) from public, anon;
grant execute on function public.kunde_gruppe(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Einlagerung: Halter übernehmen, Gruppe statt Kunde vergleichen
-- ---------------------------------------------------------------------
-- Wie Migration 30, dazu: Gehört das Fahrzeug einem anderen Kunden derselben Gruppe, wird der Satz dessen Satz
-- (Etikett und Lagerliste zeigen den Halter). Ein Fahrzeug außerhalb der Gruppe bleibt ein Fehler.
create or replace function public.tire_storage_fahrzeug_passt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  halter uuid;
begin
  if new.vehicle_id is null then
    return new;
  end if;
  select customer_id into halter from public.vehicles where id = new.vehicle_id;
  if halter is null then
    raise exception 'Das angegebene Fahrzeug gibt es nicht.';
  end if;
  if halter <> new.customer_id then
    if public.kunde_gruppe(halter) is not distinct from public.kunde_gruppe(new.customer_id) then
      new.customer_id := halter;
    else
      raise exception 'Dieses Fahrzeug gehört einem anderen Kunden. Bitte Kunde und Fahrzeug prüfen.';
    end if;
  end if;
  return new;
end;
$$;

-- Wie Migration 69, nur `kunde_gruppe()` beim Kundenvergleich.
create or replace function public.tire_storage_tausch_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt record;
  auftrag record;
begin
  -- Wirksam werden (kommt_rein → false) darf nur das Abschließen.
  if tg_op = 'UPDATE' and old.kommt_rein and not new.kommt_rein and new.removed_at is null
     and pg_trigger_depth() = 1 then
    raise exception 'Ein Tausch wird beim Abschließen des Auftrags wirksam.';
  end if;
  if tg_op = 'UPDATE' and new.kommt_rein and not old.kommt_rein then
    raise exception 'Ein Satz, der schon im Regal liegt, lässt sich nicht nachträglich zum Tausch machen.';
  end if;
  if not new.kommt_rein or new.removed_at is not null then
    return new;
  end if;

  select ts.storage_slot_id, ts.customer_id, ts.entnahme_order_id, ts.removed_at into alt
    from public.tire_storage ts where ts.id = new.tausch_fuer;
  if not found or alt.removed_at is not null or alt.entnahme_order_id is null
     or alt.entnahme_order_id is distinct from new.order_id then
    raise exception 'Getauscht wird nur gegen einen Satz, der für diesen Auftrag zum Auslagern vorgemerkt ist.';
  end if;
  if alt.storage_slot_id is distinct from new.storage_slot_id then
    raise exception 'Beim Tausch kommt der neue Satz auf den Platz des alten.';
  end if;
  if public.kunde_gruppe(alt.customer_id) is distinct from public.kunde_gruppe(new.customer_id) then
    raise exception 'Getauscht wird nur zwischen Sätzen desselben Kunden (bzw. derselben Kundengruppe).';
  end if;
  select o.status, o.deleted_at into auftrag from public.orders o where o.id = new.order_id;
  if not found or auftrag.deleted_at is not null or auftrag.status not in ('offen', 'in_arbeit') then
    raise exception 'Ein Tausch lässt sich nur an einem offenen Auftrag anlegen.';
  end if;
  return new;
end;
$$;

create or replace function public.tire_storage_vormerkung_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auftrag record;
  bisher record;
begin
  -- Neu in Migration 69: Auf diesem vorgemerkten Satz steht ein Tausch.
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1
     and old.entnahme_order_id is not null and old.removed_at is null
     and new.entnahme_order_id is null and new.removed_at is null
     and exists (select 1 from public.tire_storage k where k.tausch_fuer = old.id and k.kommt_rein and k.removed_at is null) then
    raise exception 'Für diesen Satz ist ein Tausch angelegt. Erst den neuen Satz im Auftrag entfernen, dann die Vormerkung zurücknehmen.';
  end if;

  -- Ab hier wie Migration 67.
  if new.entnahme_order_id is null or new.removed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entnahme_order_id is not distinct from old.entnahme_order_id
     and old.removed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.entnahme_order_id is not null and old.removed_at is null
     and old.entnahme_order_id is distinct from new.entnahme_order_id then
    select o.order_number into bisher from public.orders o where o.id = old.entnahme_order_id;
    raise exception 'Dieser Satz ist schon für Auftrag % vorgemerkt. Erst dort die Vormerkung zurücknehmen.', coalesce(bisher.order_number::text, '?');
  end if;

  select o.customer_id, o.status, o.deleted_at, o.order_number into auftrag
    from public.orders o where o.id = new.entnahme_order_id;
  if not found or auftrag.deleted_at is not null then
    raise exception 'Der Auftrag zum Vormerken gibt es nicht (mehr).';
  end if;
  -- Seit Migration 101: dieselbe Kundengruppe genügt (Auftrag beim Hauptkunden, Satz beim Unterdebitor).
  if public.kunde_gruppe(auftrag.customer_id) is distinct from public.kunde_gruppe(new.customer_id) then
    raise exception 'Ein Satz lässt sich nur für einen Auftrag desselben Kunden (bzw. derselben Kundengruppe) vormerken.';
  end if;
  if auftrag.status not in ('offen', 'in_arbeit') then
    raise exception 'Auftrag % ist abgeschlossen oder storniert – dafür lässt sich nichts mehr vormerken.', auftrag.order_number;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Fahrzeug bzw. Satz einem anderen Kunden der Gruppe zuordnen
-- ---------------------------------------------------------------------
create or replace function public.fahrzeug_kunde_wechseln(p_fahrzeug uuid, p_kunde uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  halter uuid;
  ziel public.customers%rowtype;
  saetze integer;
begin
  select v.customer_id into halter from public.vehicles v where v.id = p_fahrzeug for update;
  if not found then raise exception 'Das Fahrzeug wurde nicht gefunden.'; end if;
  if not public.darf('kunden.fahrzeuge', 'schreiben')
     or (coalesce(public.current_user_role(), '') = 'techniker' and not public.ist_eigener_kunde(halter)) then
    raise exception 'Fahrzeuge zuordnen ist für deine Rolle nicht freigeschaltet (Admin › Rechte › Kunden › Fahrzeuge anlegen und ändern).';
  end if;
  select * into ziel from public.customers c where c.id = p_kunde;
  if not found or ziel.deleted_at is not null then raise exception 'Diesen Kunden gibt es nicht (mehr).'; end if;
  if halter = p_kunde then return 0; end if;
  if public.kunde_gruppe(halter) is distinct from public.kunde_gruppe(p_kunde) then
    raise exception 'Ein Fahrzeug lässt sich nur einem Kunden derselben Kundengruppe zuordnen.';
  end if;
  update public.vehicles set customer_id = p_kunde where id = p_fahrzeug;
  -- Die Sätze im Lager gehen mit (Etikett, Lagerliste); ausgelagerte bleiben, wie sie waren.
  update public.tire_storage set customer_id = p_kunde where vehicle_id = p_fahrzeug and removed_at is null;
  get diagnostics saetze = row_count;
  return saetze;
end;
$$;

create or replace function public.satz_kunde_wechseln(p_satz uuid, p_kunde uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz public.tire_storage%rowtype;
  ziel public.customers%rowtype;
begin
  select * into satz from public.tire_storage t where t.id = p_satz for update;
  if not found or satz.removed_at is not null then raise exception 'Diesen Satz gibt es im Lager nicht (mehr).'; end if;
  if not public.darf('lager.einlagerung', 'schreiben')
     or (coalesce(public.current_user_role(), '') = 'techniker' and not public.ist_eigener_kunde(satz.customer_id)) then
    raise exception 'Einlagerungen ändern ist für deine Rolle nicht freigeschaltet (Admin › Rechte › Lager › Reifen einlagern).';
  end if;
  if satz.vehicle_id is not null then
    raise exception 'Dieser Satz gehört zu einem Fahrzeug – das Fahrzeug selbst dem anderen Kunden zuordnen.';
  end if;
  select * into ziel from public.customers c where c.id = p_kunde;
  if not found or ziel.deleted_at is not null then raise exception 'Diesen Kunden gibt es nicht (mehr).'; end if;
  if satz.customer_id = p_kunde then return; end if;
  if public.kunde_gruppe(satz.customer_id) is distinct from public.kunde_gruppe(p_kunde) then
    raise exception 'Ein Satz lässt sich nur einem Kunden derselben Kundengruppe zuordnen.';
  end if;
  update public.tire_storage set customer_id = p_kunde where id = p_satz;
end;
$$;

revoke all on function public.fahrzeug_kunde_wechseln(uuid, uuid) from public, anon;
revoke all on function public.satz_kunde_wechseln(uuid, uuid) from public, anon;
grant execute on function public.fahrzeug_kunde_wechseln(uuid, uuid) to authenticated;
grant execute on function public.satz_kunde_wechseln(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Der Techniker sieht die Unterdebitoren „seines“ Hauptkunden
-- ---------------------------------------------------------------------
create or replace function public.ist_eigener_kunde(p_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.orders o
      join public.order_employees oe on oe.order_id = o.id
     where (o.customer_id = p_customer_id
            or o.customer_id = (select c.haupt_kunde_id from public.customers c where c.id = p_customer_id))
       and oe.employee_id = public.current_employee_id()
  );
$$;

select 'Spalte customers.haupt_kunde_id' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'haupt_kunde_id')
            then 'da' else 'fehlt' end as ergebnis
union all
select 'Funktionen', (select count(*)::text || ' von 4' from unnest(array['kunde_gruppe(uuid)', 'fahrzeug_kunde_wechseln(uuid,uuid)',
         'satz_kunde_wechseln(uuid,uuid)', 'kunde_gruppe_pruefen()']) x where to_regprocedure('public.' || x) is not null)
union all
select 'Gruppen bisher', (select count(distinct haupt_kunde_id)::text || ' Hauptkunden, ' || count(*)::text || ' Unterdebitoren'
                            from public.customers where haupt_kunde_id is not null);

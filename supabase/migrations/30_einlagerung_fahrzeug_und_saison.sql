-- =====================================================================
-- Viana PinPoints – 30: Die Einlagerung gehört zum Fahrzeug und hat eine Saison
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 02 (tire_storage), 04 (vehicles),
-- 20/22 (Auftragsablauf).
--
-- Konzept: docs/lager-ausbaukonzept.md, Schritte A2 und A3 – die beiden ersten Punkte der
-- vereinbarten Reihenfolge.
--
-- WARUM JETZT: Im Lager liegen derzeit 0 Sätze (Stand 10.09.2026). Dieselbe Änderung kostet
-- bei 300 eingelagerten Sätzen Tage an Nacharbeit, weil dann jemand für jeden Satz
-- nachschlagen müsste, zu welchem Auto er gehört. Der billigste Zeitpunkt ist jetzt.
--
-- WAS SICH ÄNDERT
--
-- 1. `tire_storage.vehicle_id` – der Satz hängt am KUNDENFAHRZEUG, nicht mehr nur am Kunden.
--    Ein Kunde mit zwei Autos hat zwei Sätze; bisher stand an beiden nur derselbe Name, und
--    welcher Satz auf A-12 liegt, wusste nur, wer dabei war.
--
-- 2. `tire_storage.saison` – Sommer, Winter oder Ganzjahr. Ein Feld, aus dem die Saisonliste
--    entsteht: „Welche Kunden haben Winterreifen bei uns liegen, die sie in sechs Wochen
--    brauchen?" Das ist keine Lagerfrage, das ist die Terminplanung fürs Halbjahr.
--
-- 3. `vehicles.stored_tire_storage_id` entfällt. Das war der Rückweg vom Fahrzeug zum Satz –
--    optional, von Hand zu pflegen und damit eine zweite Wahrheit neben der ersten. Ab jetzt
--    zeigt genau eine Richtung: Satz → Fahrzeug.
--
-- Der Kunde bleibt zusätzlich am Satz gespeichert. Nicht aus Bequemlichkeit: ein Fahrzeug kann
-- den Halter wechseln, und die Einlagerung gehört dann trotzdem noch der Person, die sie
-- gebracht hat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Neue Spalten
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists saison text;

create index if not exists idx_tire_storage_vehicle on public.tire_storage (vehicle_id);
create index if not exists idx_tire_storage_saison  on public.tire_storage (saison) where removed_at is null;

-- Feste Werteliste statt Freitext. Der Code kennt genau diese drei (lib/constants.ts,
-- SAISON_LABEL) – ohne die Prüfregel stünde irgendwann „Winterr" in der Datenbank und fiele
-- aus jeder Auswertung heraus, ohne dass es jemandem auffällt.
do $$
begin
  alter table public.tire_storage
    add constraint tire_storage_saison_gueltig
    check (saison is null or saison in ('sommer', 'winter', 'ganzjahr'));
exception when duplicate_object then
  null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Bestehende Sätze übernehmen, soweit es eindeutig ist
-- ---------------------------------------------------------------------
-- a) Wo der alte Rückweg gepflegt war, wird er übernommen.
update public.tire_storage ts
   set vehicle_id = v.id
  from public.vehicles v
 where v.stored_tire_storage_id = ts.id
   and ts.vehicle_id is null;

-- b) Hat der Kunde genau EIN Fahrzeug, ist die Zuordnung eindeutig – dann übernehmen wir sie.
--    Bei zwei Fahrzeugen wird bewusst NICHT geraten: eine falsche Zuordnung ist schlechter als
--    eine fehlende, weil sie später niemand mehr nachprüft. Solche Sätze bleiben leer und
--    fallen beim nächsten Anfassen auf.
update public.tire_storage ts
   set vehicle_id = (select v.id from public.vehicles v where v.customer_id = ts.customer_id)
 where ts.vehicle_id is null
   and (select count(*) from public.vehicles v where v.customer_id = ts.customer_id) = 1;

-- ---------------------------------------------------------------------
-- 3. Das Fahrzeug muss dem Kunden der Einlagerung gehören
-- ---------------------------------------------------------------------
-- Eine Fremdschlüsselbeziehung allein lässt zu, dass an Kunde Müllers Satz das Auto von Frau
-- Schmidt hängt – zwei gültige Verweise, zusammen sinnlos. Die Oberfläche bietet zwar nur die
-- Fahrzeuge des gewählten Kunden an, aber die Regel gehört dorthin, wo sie nicht umgangen
-- werden kann.
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
    raise exception 'Dieses Fahrzeug gehört einem anderen Kunden. Bitte Kunde und Fahrzeug prüfen.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tire_storage_fahrzeug_passt on public.tire_storage;
create trigger trg_tire_storage_fahrzeug_passt
  before insert or update of vehicle_id, customer_id on public.tire_storage
  for each row execute function public.tire_storage_fahrzeug_passt();

-- ---------------------------------------------------------------------
-- 4. Vollständig beim Abschließen – nicht beim Öffnen
-- ---------------------------------------------------------------------
-- Dieselbe Linie wie die Lagerplatz-Pflicht aus Migration 22: wenige, scharfe Regeln, jeweils
-- im Moment des Abschließens. Zwanzig Pflichtfelder beim Anlegen erzeugen zuverlässig einen
-- Eintrag, nicht zuverlässig einen richtigen – wer unter Zeitdruck vor einer Einfahrt steht,
-- trägt sonst „xxx" ein, und dann sieht die Lücke aus wie eine Angabe.
--
-- Bewusst ein EIGENER Trigger statt einer Erweiterung von
-- `enforce_order_status_transition` (Migration 20/22): Diese Funktion wurde schon einmal
-- komplett ersetzt, um eine Prüfung zu ergänzen. Ein zweites Mal hundert Zeilen zu kopieren,
-- um drei hinzuzufügen, ist die Art von Änderung, bei der irgendwann eine Zeile verlorengeht.
create or replace function public.einlagerung_vollstaendig()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  unvollstaendig int;
begin
  select count(*) into unvollstaendig
    from public.tire_storage ts
   where ts.order_id = new.id
     and ts.removed_at is null
     and (ts.vehicle_id is null or ts.saison is null);

  if unvollstaendig > 0 then
    raise exception 'Zur Einlagerung fehlen noch Fahrzeug und/oder Saison. Bitte im Auftragsfenster im Abschnitt „Einlagerung" ergänzen.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_einlagerung_vollstaendig on public.orders;
create trigger trg_einlagerung_vollstaendig
  before update on public.orders
  for each row
  when (new.status = 'erledigt' and old.status is distinct from 'erledigt')
  execute function public.einlagerung_vollstaendig();

-- ---------------------------------------------------------------------
-- 5. Der alte Rückweg verschwindet
-- ---------------------------------------------------------------------
-- Erst hier, nach der Übernahme in Schritt 2. Der Anwendungscode dieser Auslieferung liest die
-- Spalte nicht mehr; wer die Migration ohne den passenden Code ausführt, bekommt beim Speichern
-- eines Fahrzeugs einen Fehler.
alter table public.vehicles drop column if exists stored_tire_storage_id;

-- ---------------------------------------------------------------------
-- Zur Kontrolle nach dem Ausführen:
--   select count(*) filter (where vehicle_id is null) as ohne_fahrzeug,
--          count(*) filter (where saison is null)     as ohne_saison,
--          count(*)                                   as aktive_saetze
--     from public.tire_storage where removed_at is null;
-- ---------------------------------------------------------------------

-- Migration 44: Fahrzeuge am Auftrag, mit Kilometerstand
--
-- Bisher hängt an einem Auftrag GENAU EIN Fahrzeug (`orders.vehicle_id`, Migration 20). Im
-- Betrieb betrifft ein Auftrag aber oft mehrere Autos – ein Kunde mit zwei Wagen lässt beide
-- am selben Termin wechseln –, und für eine Rechnung braucht jedes davon zwei Angaben, die
-- der Auftrag heute nirgends hat: das Kennzeichen und den Kilometerstand.
--
-- WARUM DER KILOMETERSTAND NICHT AN DAS FAHRZEUG GEHÖRT: Er ist keine Eigenschaft des Autos,
-- sondern eine Messung an einem Tag. Am Fahrzeug stünde nach dem zweiten Besuch eine Zahl,
-- die zum ersten Besuch nicht mehr passt – derselbe Fehler wie DOT-Datum und Profiltiefe am
-- Auto statt am Reifensatz, den Migration 34 wieder ausbauen musste. Er gehört an die
-- VERBINDUNG von Auftrag und Fahrzeug, und genau die ist diese neue Tabelle.
--
-- ============================================================================
-- EINE WAHRHEIT, NICHT ZWEI
-- ============================================================================
-- `orders.vehicle_id` bleibt in dieser Migration bestehen und wird HIERHER übernommen – aber
-- nur als Übergang. Die neue Tabelle ist ab sofort die Quelle; der Anwendungscode liest sie.
-- Die alte Spalte fällt in einer späteren Migration, sobald die neue Fassung überall läuft.
--
-- Das ist dieselbe Reihenfolge wie bei `discount_percent` (Migration 38 → 39): erst
-- hinzufügen und umstellen, dann in Ruhe entfernen. Eine Migration, die eine Spalte löscht,
-- die der laufende Code noch schreibt, nimmt die Anwendung mit.
--
-- WICHTIG: Solange beide existieren, schreibt der Code NUR die neue Tabelle. Zwei Orte für
-- dieselbe Aussage laufen auseinander – hier ist das bewusst in Kauf genommen und zeitlich
-- begrenzt, nicht übersehen.
--
-- ============================================================================
-- DIE VOLLSTÄNDIGKEITSPRÜFUNG STEHT IN DER DATENBANK
-- ============================================================================
-- Ist am Auftrag „Rechnung benötigt" gesetzt, braucht es zum Abschließen: Name und Adresse
-- des Kunden, seine E-Mail-Adresse, und je beteiligtem Fahrzeug ein Kennzeichen und einen
-- Kilometerstand.
--
-- Die Maske führt das als Liste zum Abhaken – aber durchgesetzt wird es hier. Eine
-- ausgegraute Schaltfläche ist keine Zusicherung: Sie verhindert den Fehler nur bei dem, der
-- sie sieht. Und eine Rechnung, der die Anschrift fehlt, merkt man erst im ERP.

begin;

-- ---------------------------------------------------------------------
-- PROJEKTWACHE
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.auftrag_fahrzeuge (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  vehicle_id     uuid not null references public.vehicles(id) on delete restrict,
  -- Null heißt „noch nicht abgelesen". Pflicht wird er erst beim Abschließen eines Auftrags
  -- mit Rechnung – vor Ort trägt man ihn ein, wenn man am Auto steht, nicht vorher.
  kilometerstand integer,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  -- Ein Auto steht einmal an einem Auftrag. Zweimal hieße zwei Kilometerstände für
  -- denselben Wagen am selben Tag, und welcher gilt, könnte niemand sagen.
  constraint auftrag_fahrzeuge_einmal unique (order_id, vehicle_id),
  -- Ein Tachostand ist nicht negativ, und über zehn Millionen Kilometer ist ein Tippfehler.
  constraint auftrag_fahrzeuge_km_plausibel check (kilometerstand is null or (kilometerstand >= 0 and kilometerstand <= 10000000))
);

create index if not exists auftrag_fahrzeuge_order_idx   on public.auftrag_fahrzeuge (order_id);
create index if not exists auftrag_fahrzeuge_vehicle_idx on public.auftrag_fahrzeuge (vehicle_id);

comment on table public.auftrag_fahrzeuge is
  'Welche Fahrzeuge betrifft dieser Auftrag, und mit welchem Kilometerstand? Ersetzt orders.vehicle_id (das nur EINES zuließ).';
comment on column public.auftrag_fahrzeuge.kilometerstand is
  'Abgelesen am Tag des Auftrags. Gehört hierher und nicht ans Fahrzeug: Es ist eine Messung, keine Eigenschaft.';

-- ---------------------------------------------------------------------
-- 2. Der Bestand
--
-- Jeder Auftrag, der bisher ein Fahrzeug trug, bekommt genau diesen Eintrag. Ohne
-- Kilometerstand – den gab es nie, und eine erfundene Zahl wäre schlimmer als eine leere.
-- ---------------------------------------------------------------------
insert into public.auftrag_fahrzeuge (order_id, vehicle_id)
select o.id, o.vehicle_id
  from public.orders o
 where o.vehicle_id is not null
on conflict (order_id, vehicle_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Protokoll und Urheber – wie bei jeder Geschäftstabelle (Migration 18/36)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.stamp_row()') is not null then
    execute 'drop trigger if exists trg_stamp_row on public.auftrag_fahrzeuge';
    execute 'create trigger trg_stamp_row before insert or update on public.auftrag_fahrzeuge
               for each row execute procedure public.stamp_row()';
  end if;
  if to_regprocedure('public.audit_row()') is not null then
    execute 'drop trigger if exists trg_audit_row on public.auftrag_fahrzeuge';
    execute 'create trigger trg_audit_row after insert or update or delete on public.auftrag_fahrzeuge
               for each row execute procedure public.audit_row()';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Rechte – sie folgen dem Auftrag
--
-- Kein eigener Bereich in der Rechtematrix: Ein Fahrzeug am Auftrag ist Teil des Auftrags,
-- nicht ein Ding für sich. Wer den Auftrag bearbeiten darf, trägt auch ein, welche Autos
-- dran waren. Und der Techniker sieht auch hier nur seine eigenen Aufträge.
-- ---------------------------------------------------------------------
alter table public.auftrag_fahrzeuge enable row level security;

drop policy if exists "Auftragsfahrzeuge lesen" on public.auftrag_fahrzeuge;
drop policy if exists "Auftragsfahrzeuge schreiben" on public.auftrag_fahrzeuge;

create policy "Auftragsfahrzeuge lesen" on public.auftrag_fahrzeuge
  for select to authenticated
  using (
    public.darf('auftraege.auftrag','lesen')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  );

-- Eintragen und wieder entfernen gehört zusammen: Wer ein falsches Auto eingetragen hat, muss
-- es korrigieren können. Dieselbe Überlegung wie bei den Leistungen (Migration 42).
create policy "Auftragsfahrzeuge schreiben" on public.auftrag_fahrzeuge
  for all to authenticated
  using (
    public.darf('auftraege.auftrag','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  )
  with check (
    public.darf('auftraege.auftrag','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  );

-- ---------------------------------------------------------------------
-- 5. Die Vollständigkeitsprüfung beim Abschließen
--
-- Sie hängt am Statuswechsel nach 'erledigt' und nur dann, wenn „Rechnung benötigt" gesetzt
-- ist. Ohne Rechnung wird nichts verlangt – ein Barverkauf braucht keine Anschrift.
--
-- Die Meldung nennt ALLES, was fehlt, nicht nur das erste. Wer dreimal hintereinander eine
-- Fehlermeldung bekommt, die jeweils einen weiteren Mangel nennt, hält das Programm für
-- schikanös – zu Recht.
-- ---------------------------------------------------------------------
create or replace function public.pruefe_rechnungsdaten()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `array_append` und nicht `fehlt || '…'`: Bei einem Textliteral ohne Typangabe hält
  -- Postgres das `||` für eine Array-Verkettung und versucht, den Satz als Array zu lesen
  -- („malformed array literal"). Beim Prüfen gegen ein echtes Postgres aufgefallen.
  fehlt text[] := '{}';
  kunde public.customers%rowtype;
  ohne_kennzeichen int;
  ohne_km int;
  anzahl int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'erledigt' then return new; end if;
  if not coalesce(new.rechnung_noetig, false) then return new; end if;

  select * into kunde from public.customers c where c.id = new.customer_id;

  if coalesce(btrim(kunde.name), '') = '' then
    fehlt := array_append(fehlt, 'Name des Kunden');
  end if;
  if coalesce(btrim(kunde.address), '') = '' then
    fehlt := array_append(fehlt, 'Anschrift des Kunden');
  end if;
  if coalesce(btrim(kunde.email), '') = '' then
    fehlt := array_append(fehlt, 'E-Mail-Adresse des Kunden');
  end if;

  select count(*) into anzahl
    from public.auftrag_fahrzeuge af where af.order_id = new.id;
  if anzahl = 0 then
    fehlt := array_append(fehlt, 'mindestens ein Fahrzeug am Auftrag');
  else
    select count(*) into ohne_kennzeichen
      from public.auftrag_fahrzeuge af
      join public.vehicles v on v.id = af.vehicle_id
     where af.order_id = new.id
       and coalesce(btrim(v.license_plate), '') = '';
    if ohne_kennzeichen > 0 then
      fehlt := array_append(fehlt, ohne_kennzeichen || ' Fahrzeug(e) ohne Kennzeichen');
    end if;

    select count(*) into ohne_km
      from public.auftrag_fahrzeuge af
     where af.order_id = new.id and af.kilometerstand is null;
    if ohne_km > 0 then
      fehlt := array_append(fehlt, ohne_km || ' Fahrzeug(e) ohne Kilometerstand');
    end if;
  end if;

  if array_length(fehlt, 1) > 0 then
    raise exception 'Für die Rechnung fehlt noch: %. Entweder ergänzen oder den Haken "Rechnung benötigt" entfernen.',
      array_to_string(fehlt, ', ');
  end if;

  return new;
end;
$$;

-- Der Name beginnt mit „trg_p", damit dieser Trigger NACH
-- `trg_enforce_order_status_transition` läuft: Postgres ruft gleichartige Trigger in
-- alphabetischer Reihenfolge auf, und zuerst muss feststehen, dass der Statuswechsel
-- überhaupt erlaubt ist. Andernfalls bekäme jemand, der gar nicht abschließen darf, zuerst
-- eine Liste fehlender Rechnungsdaten zu lesen.
drop trigger if exists trg_pruefe_rechnungsdaten on public.orders;
create trigger trg_pruefe_rechnungsdaten
  before update on public.orders
  for each row execute procedure public.pruefe_rechnungsdaten();

commit;

-- Kontrolle nach dem Lauf:
--
-- select count(*) as uebernommen from public.auftrag_fahrzeuge;
-- select count(*) as erwartet from public.orders where vehicle_id is not null;

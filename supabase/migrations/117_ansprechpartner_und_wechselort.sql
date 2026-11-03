-- =====================================================================
-- Migration 117 – Ansprechpartner je Kunde, Wechselort am Auftrag (03.11.2026, v189).
--
-- Wunsch Vitali (03.11.2026): Eine Firma hat ihre Rechnungsadresse (etwa in Hamburg), gewechselt wird aber bei
-- Ansprechpartnern mit eigener Adresse (etwa in Nürnberg) – oder in der Firma selbst, oder bei beiden. Entschieden
-- (docs/kunden-und-karte.md, „Ansprechpartner und Wechselort“):
--
--   1. `kunden_ansprechpartner`: beliebig viele Ansprechpartner unter jedem Kunden (Firma, Hauptkunde, Unterdebitor)
--      mit Anrede, Name, Funktion, Telefon, E-Mail, eigener Adresse (freiwillig), Notiz und dem Schalter „Auf der
--      Karte“. Die Rechnung geht nie an einen Ansprechpartner, sondern immer an den Kunden.
--   2. `customers.auf_karte`: Auch die Firma selbst lässt sich von der Karte nehmen – dann ist ihre Adresse nur die
--      Rechnungsadresse (eine Nadel gibt es dort nur, solange ein Termin an dieser Adresse ansteht).
--   3. Wechselort am Auftrag: leer = Adresse des Kunden; `ansprechpartner` = Adresse eines Ansprechpartners des
--      Kunden oder seiner Gruppe; `einmalig` = eine Adresse nur für diesen Termin. Adresse und Koordinaten stehen als
--      Kopie am Auftrag (`einsatz_*`) – Kalender, Karte, Route, Erinnerung brauchen so keinen zweiten Blick. Ändert
--      sich die Adresse eines Ansprechpartners, ziehen seine offenen Aufträge mit; erledigte behalten ihren Ort.
--   4. `vehicles.ansprechpartner_id`: Das Fahrzeug gehört weiter dem Kunden, kann aber einem Ansprechpartner
--      (derselben Gruppe) zugeordnet werden – Etikett und Einlagerung nennen ihn mit.
--   5. Bestand: Bei Firmen wird der bisherige Ansprechpartner (Name, Anrede, Telefon, E-Mail) Ansprechpartner 1 ohne
--      eigene Adresse und ohne Nadel; am Kunden bleiben Firma, Telefon und E-Mail (für Rechnungen), Name und Anrede
--      werden leer. Das Leeren steht in DERSELBEN Anweisung wie die Prüfung, dass die Übernahme da ist (der
--      SQL-Editor ist nicht atomar – „erst retten, dann löschen“ darf nicht auseinanderfallen).
--   6. Zusammenführen nimmt die Ansprechpartner mit, der Auskunftsauszug nennt sie und die Wechselorte, das Schwärzen
--      des Protokolls kennt die neuen Felder; „Kunde endgültig löschen“ nimmt sie per Kaskade mit (das Protokoll dazu
--      räumt es über `kunde_id` schon ab).
--
-- Reihenfolge: nach 116 (unabhängig von 108–116, nur nach 105), SQL zuerst, dann die Dateien von v189. Zweiter Lauf
-- folgenlos. Rücknahme: rollback/117_rollback.sql.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.customers') is null or to_regclass('public.vehicles') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.customers / public.vehicles. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.kunde_gruppe(uuid)') is null or to_regprocedure('public.kunden_zusammenfuehren_grund(uuid,uuid)') is null
     or to_regprocedure('public.kunde_auskunft_grund(uuid)') is null then
    raise exception 'Zuerst die Migrationen 101 und 105 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die Firma auf der Karte – oder nur Rechnungsadresse
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists auf_karte boolean not null default true;
comment on column public.customers.auf_karte is
  'Migration 117: Nadel an der Adresse des Kunden. Aus = nur Rechnungsadresse (Nadel nur, solange ein Termin an dieser Adresse ansteht).';

-- ---------------------------------------------------------------------
-- 2. Ansprechpartner
-- ---------------------------------------------------------------------
create table if not exists public.kunden_ansprechpartner (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  anrede          text,
  name            text not null,
  funktion        text,
  telefon         text,
  email           text,
  -- Leer = keine eigene Adresse (er sitzt in der Firma oder organisiert nur).
  address         text,
  lat             double precision,
  lng             double precision,
  geo_genauigkeit text,
  auf_karte       boolean not null default false,
  notiz           text,
  sortierung      integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  constraint kap_anrede   check (anrede is null or anrede in ('Herr', 'Frau')),
  constraint kap_name     check (length(btrim(name)) between 1 and 120),
  constraint kap_laengen  check (coalesce(length(funktion), 0) <= 80 and coalesce(length(telefon), 0) <= 40
                                 and coalesce(length(email), 0) <= 200 and coalesce(length(address), 0) <= 300
                                 and coalesce(length(notiz), 0) <= 1000),
  constraint kap_geo      check (geo_genauigkeit is null or geo_genauigkeit in ('exakt', 'ungefaehr', 'hand')),
  -- Eine Nadel braucht eine Adresse.
  constraint kap_karte    check (not auf_karte or coalesce(btrim(address), '') <> '')
);
create index if not exists kunden_ansprechpartner_kunde_idx on public.kunden_ansprechpartner (customer_id, sortierung, name);
comment on table public.kunden_ansprechpartner is
  'Migration 117: Ansprechpartner je Kunde mit eigener Adresse (freiwillig) und Schalter „Auf der Karte“. Rechnungsempfänger bleibt der Kunde.';

drop trigger if exists trg_stamp_row on public.kunden_ansprechpartner;
create trigger trg_stamp_row before insert or update on public.kunden_ansprechpartner
  for each row execute procedure public.stamp_row();
drop trigger if exists trg_audit_row on public.kunden_ansprechpartner;
create trigger trg_audit_row after insert or update or delete on public.kunden_ansprechpartner
  for each row execute procedure public.audit_row();
-- Löschen begründet der Trigger aus Migration 42 im Klartext; die Richtlinie prüft nur `lesen` (CLAUDE.md, Abschnitt 2).
drop trigger if exists trg_loeschrecht on public.kunden_ansprechpartner;
create trigger trg_loeschrecht before delete on public.kunden_ansprechpartner
  for each row execute procedure public.pruefe_loeschrecht('kunden');

alter table public.kunden_ansprechpartner enable row level security;
drop policy if exists "Ansprechpartner lesen" on public.kunden_ansprechpartner;
create policy "Ansprechpartner lesen" on public.kunden_ansprechpartner
  for select to authenticated
  using (public.darf('kunden', 'lesen')
         or (coalesce(public.current_user_role(), '') = 'techniker' and public.ist_eigener_kunde(customer_id)));
drop policy if exists "Ansprechpartner anlegen" on public.kunden_ansprechpartner;
create policy "Ansprechpartner anlegen" on public.kunden_ansprechpartner
  for insert to authenticated
  with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Ansprechpartner aendern" on public.kunden_ansprechpartner;
create policy "Ansprechpartner aendern" on public.kunden_ansprechpartner
  for update to authenticated
  using (public.darf('kunden', 'schreiben'))
  with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Ansprechpartner loeschen" on public.kunden_ansprechpartner;
create policy "Ansprechpartner loeschen" on public.kunden_ansprechpartner
  for delete to authenticated
  using (public.darf('kunden', 'lesen'));
grant select, insert, update, delete on public.kunden_ansprechpartner to authenticated;

-- ---------------------------------------------------------------------
-- 3. Wechselort am Auftrag
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists wechselort text,
  add column if not exists ansprechpartner_id uuid references public.kunden_ansprechpartner (id) on delete set null,
  add column if not exists einsatz_name text,
  add column if not exists einsatz_adresse text,
  add column if not exists einsatz_lat double precision,
  add column if not exists einsatz_lng double precision,
  add column if not exists einsatz_geo_genauigkeit text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_wechselort_werte') then
    alter table public.orders add constraint orders_wechselort_werte
      check (wechselort is null or wechselort in ('ansprechpartner', 'einmalig'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_einsatz_laengen') then
    alter table public.orders add constraint orders_einsatz_laengen
      check (coalesce(length(einsatz_name), 0) <= 140 and coalesce(length(einsatz_adresse), 0) <= 300
             and (einsatz_geo_genauigkeit is null or einsatz_geo_genauigkeit in ('exakt', 'ungefaehr', 'hand')));
  end if;
end $$;
create index if not exists orders_ansprechpartner_idx on public.orders (ansprechpartner_id) where ansprechpartner_id is not null;
comment on column public.orders.wechselort is
  'Migration 117: leer = Adresse des Kunden, ansprechpartner = Adresse eines Ansprechpartners (Kopie in einsatz_*), einmalig = Adresse nur für diesen Termin.';

-- Die Daten eines Ansprechpartners für die Prüfungen unten – unabhängig davon, ob der Aufrufer ihn lesen darf
-- (der Techniker auf einem Auftrag, dessen Kunde er nicht sieht, soll trotzdem eine klare Meldung bekommen).
create or replace function public.ansprechpartner_daten(p_id uuid)
returns table (customer_id uuid, gruppe uuid, anzeige text, address text, lat double precision, lng double precision, geo_genauigkeit text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.customer_id, public.kunde_gruppe(k.customer_id),
         btrim(coalesce(k.anrede || ' ', '') || k.name), nullif(btrim(coalesce(k.address, '')), ''), k.lat, k.lng, k.geo_genauigkeit
    from public.kunden_ansprechpartner k where k.id = p_id;
$$;
revoke all on function public.ansprechpartner_daten(uuid) from public, anon;
grant execute on function public.ansprechpartner_daten(uuid) to authenticated;

-- Ohne `security definer` (wie `kunde_kontakt_pruefen()`, Migration 78): `current_user` zeigt dann, ob die Änderung
-- direkt aus der App kommt. Die Kopie der Adresse kommt immer aus der Datenbank, nie aus der App.
create or replace function public.auftrag_wechselort()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  a record;
  weiter boolean;
begin
  -- Der Ansprechpartner wurde gelöscht (Fremdschlüssel setzt null): Der Ort bleibt als einmalige Adresse stehen.
  if new.wechselort = 'ansprechpartner' and new.ansprechpartner_id is null and tg_op = 'UPDATE'
     and old.ansprechpartner_id is not null and pg_trigger_depth() > 1 then
    new.wechselort := 'einmalig';
    return new;
  end if;

  if new.wechselort is null then
    new.ansprechpartner_id := null;
    new.einsatz_name := null; new.einsatz_adresse := null; new.einsatz_lat := null; new.einsatz_lng := null; new.einsatz_geo_genauigkeit := null;
    return new;
  end if;

  if new.wechselort = 'einmalig' then
    new.ansprechpartner_id := null;
    if coalesce(btrim(new.einsatz_adresse), '') = '' then
      raise exception 'Für eine einmalige Adresse die Adresse eintragen – oder den Wechselort auf die Adresse des Kunden stellen.';
    end if;
    new.einsatz_adresse := btrim(new.einsatz_adresse);
    new.einsatz_name := nullif(btrim(coalesce(new.einsatz_name, '')), '');
    return new;
  end if;

  if new.wechselort <> 'ansprechpartner' then
    raise exception 'Unbekannter Wechselort „%“ – erlaubt sind die Adresse des Kunden, ein Ansprechpartner oder eine einmalige Adresse.', new.wechselort;
  end if;
  if new.ansprechpartner_id is null then
    raise exception 'Beim Wechselort „Ansprechpartner“ fehlt der Ansprechpartner.';
  end if;
  select * into a from public.ansprechpartner_daten(new.ansprechpartner_id);
  if a.customer_id is null then
    raise exception 'Diesen Ansprechpartner gibt es nicht (mehr).';
  end if;
  if a.gruppe is distinct from public.kunde_gruppe(new.customer_id) then
    raise exception 'Der Ansprechpartner % gehört nicht zum Kunden dieses Auftrags (auch nicht zu seiner Gruppe).', a.anzeige;
  end if;
  weiter := tg_op = 'INSERT' or new.ansprechpartner_id is distinct from old.ansprechpartner_id
            or new.wechselort is distinct from old.wechselort;
  if weiter then
    if a.address is null then
      raise exception 'Der Ansprechpartner % hat keine eigene Adresse – dort eine eintragen oder die Adresse des Kunden wählen.', a.anzeige;
    end if;
    new.einsatz_name := a.anzeige; new.einsatz_adresse := a.address; new.einsatz_lat := a.lat; new.einsatz_lng := a.lng;
    new.einsatz_geo_genauigkeit := a.geo_genauigkeit;
  elsif pg_trigger_depth() <= 1 then
    -- Unverändert: Die Kopie bleibt, wie die Datenbank sie gesetzt hat (aus dem Nachziehen unten kommt depth > 1).
    new.einsatz_name := old.einsatz_name; new.einsatz_adresse := old.einsatz_adresse; new.einsatz_lat := old.einsatz_lat;
    new.einsatz_lng := old.einsatz_lng; new.einsatz_geo_genauigkeit := old.einsatz_geo_genauigkeit;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_auftrag_wechselort on public.orders;
create trigger trg_auftrag_wechselort
  before insert or update of wechselort, ansprechpartner_id, einsatz_name, einsatz_adresse, einsatz_lat, einsatz_lng, einsatz_geo_genauigkeit, customer_id
  on public.orders
  for each row execute procedure public.auftrag_wechselort();

-- Adresse eines Ansprechpartners geändert: seine offenen Aufträge ziehen mit; erledigte und stornierte behalten den Ort,
-- an dem gewechselt wurde. Eine Adresse, an der noch offene Termine hängen, lässt sich nicht einfach leeren.
create or replace function public.ansprechpartner_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if tg_op = 'UPDATE' and coalesce(btrim(new.address), '') = '' and coalesce(btrim(old.address), '') <> '' then
    select count(*) into n from public.orders o
     where o.ansprechpartner_id = new.id and o.wechselort = 'ansprechpartner' and o.status in ('offen', 'in_arbeit') and o.deleted_at is null;
    if n > 0 then
      raise exception 'Bei % ist % offene% Auftrag als Wechselort eingetragen – erst dort den Ort ändern, dann die Adresse leeren.',
        new.name, n, case when n = 1 then 'r' else '' end;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.address, new.lat, new.lng, new.geo_genauigkeit, new.name, new.anrede)
                          is distinct from (old.address, old.lat, old.lng, old.geo_genauigkeit, old.name, old.anrede) then
    update public.orders o
       set einsatz_name = btrim(coalesce(new.anrede || ' ', '') || new.name), einsatz_adresse = btrim(new.address),
           einsatz_lat = new.lat, einsatz_lng = new.lng, einsatz_geo_genauigkeit = new.geo_genauigkeit
     where o.ansprechpartner_id = new.id and o.wechselort = 'ansprechpartner' and o.status in ('offen', 'in_arbeit') and o.deleted_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ansprechpartner_nachziehen on public.kunden_ansprechpartner;
create trigger trg_ansprechpartner_nachziehen
  after update on public.kunden_ansprechpartner
  for each row execute procedure public.ansprechpartner_nachziehen();

-- ---------------------------------------------------------------------
-- 4. Fahrzeug einem Ansprechpartner zuordnen
-- ---------------------------------------------------------------------
alter table public.vehicles add column if not exists ansprechpartner_id uuid references public.kunden_ansprechpartner (id) on delete set null;
create index if not exists vehicles_ansprechpartner_idx on public.vehicles (ansprechpartner_id) where ansprechpartner_id is not null;
comment on column public.vehicles.ansprechpartner_id is
  'Migration 117: bei welchem Ansprechpartner (derselben Kundengruppe) das Fahrzeug steht. Halter bleibt customer_id.';

create or replace function public.fahrzeug_ansprechpartner_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  a record;
begin
  if new.ansprechpartner_id is null then return new; end if;
  select * into a from public.ansprechpartner_daten(new.ansprechpartner_id);
  if a.customer_id is null then
    raise exception 'Diesen Ansprechpartner gibt es nicht (mehr).';
  end if;
  if a.gruppe is distinct from public.kunde_gruppe(new.customer_id) then
    -- Wechselt das Fahrzeug in eine andere Gruppe, löst sich die Zuordnung (aus einer Funktion heraus, etwa beim
    -- Zusammenführen); direkt aus der App ist es ein Fehler.
    if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id and current_user not in ('authenticated', 'anon') then
      new.ansprechpartner_id := null;
      return new;
    end if;
    raise exception 'Der Ansprechpartner % gehört nicht zum Halter dieses Fahrzeugs (auch nicht zu seiner Gruppe).', a.anzeige;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fahrzeug_ansprechpartner on public.vehicles;
create trigger trg_fahrzeug_ansprechpartner
  before insert or update of ansprechpartner_id, customer_id on public.vehicles
  for each row execute procedure public.fahrzeug_ansprechpartner_pruefen();

-- ---------------------------------------------------------------------
-- 5. Bestand: der bisherige Ansprechpartner einer Firma wird Ansprechpartner 1
-- ---------------------------------------------------------------------
insert into public.kunden_ansprechpartner (customer_id, anrede, name, telefon, email, auf_karte, sortierung)
select c.id, c.anrede, left(btrim(c.name), 120),
       left(coalesce(nullif(btrim(c.phone_mobile), ''), nullif(btrim(c.phone_landline), '')), 40),
       left(nullif(btrim(c.email), ''), 200), false, 0
  from public.customers c
 where coalesce(btrim(c.company), '') <> '' and coalesce(btrim(c.name), '') <> '' and not c.laufkundschaft
   and not exists (select 1 from public.kunden_ansprechpartner k where k.customer_id = c.id);

-- Name und Anrede am Kunden leeren – nur, wo die Übernahme nachweislich da ist (dieselbe Anweisung).
update public.customers c
   set name = '', anrede = null
 where coalesce(btrim(c.company), '') <> '' and coalesce(btrim(c.name), '') <> ''
   and exists (select 1 from public.kunden_ansprechpartner k
                where k.customer_id = c.id and k.name = left(btrim(c.name), 120) and k.anrede is not distinct from c.anrede);

-- ---------------------------------------------------------------------
-- 6. Zusammenführen, Auskunft, Schwärzen
-- ---------------------------------------------------------------------
-- Die Ansprechpartner wandern VOR dem Zusammenführen: Dann prüfen die Trigger an Fahrzeugen und Aufträgen gegen den
-- Kunden, der bleibt. Scheitert das Zusammenführen, nimmt die Datenbank auch das Umhängen zurück (ein Aufruf).
create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kunden_ansprechpartner k set customer_id = p_behalten where k.customer_id = p_weg and p_behalten <> p_weg;
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit (Migration 105).
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Migration 64/78/105/117: zwei Kunden zusammenführen; Ansprechpartner und Bestellwünsche wandern mit.';
revoke all on function public.kunden_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid) to authenticated;

-- Stand von Migration 105 plus Ansprechpartner und Wechselorte (ohne Namen von Mitarbeitern).
create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ergebnis jsonb;
begin
  -- Prüft Rolle und Laufkundschaft selbst und bricht sonst ab.
  ergebnis := public.kunde_auskunft_grund(p_kunde);
  return ergebnis
    || jsonb_build_object('belege', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                             'aufgenommen', b.created_at) order by b.created_at, b.id)
           from public.auftrag_belege b join public.orders o on o.id = b.order_id
          where o.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 71
    || jsonb_build_object('reifen_notizen', coalesce((
         select jsonb_agg(jsonb_build_object('eingelagert', t.created_at, 'platz', s.code, 'position', n.pos, 'notiz', n.txt)
                          order by t.created_at, t.id, n.ord)
           from public.tire_storage t
           left join public.storage_slots s on s.id = t.storage_slot_id
           cross join lateral (values (1, 'VL', t.notiz_vl), (2, 'VR', t.notiz_vr), (3, 'HL', t.notiz_hl), (4, 'HR', t.notiz_hr)) as n(ord, pos, txt)
          where t.customer_id = p_kunde and coalesce(btrim(n.txt), '') <> ''), '[]'::jsonb))
    -- Migration 105
    || jsonb_build_object('bestellungen', coalesce((
         select jsonb_agg(jsonb_build_object('eingetragen', w.created_at, 'text', w.text, 'menge', w.menge, 'status', w.status,
                                             'notiz', w.notiz, 'grund', w.grund, 'foto', w.foto_pfad is not null)
                          order by w.created_at, w.id)
           from public.bestellwuensche w
          where w.kunde_id = p_kunde
             or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde)), '[]'::jsonb))
    -- Migration 117
    || jsonb_build_object('ansprechpartner', coalesce((
         select jsonb_agg(jsonb_build_object('anrede', k.anrede, 'name', k.name, 'funktion', k.funktion, 'telefon', k.telefon,
                                             'email', k.email, 'adresse', k.address, 'auf_karte', k.auf_karte, 'notiz', k.notiz,
                                             'angelegt', k.created_at) order by k.sortierung, k.name, k.id)
           from public.kunden_ansprechpartner k where k.customer_id = p_kunde), '[]'::jsonb))
    || jsonb_build_object('wechselorte', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'datum', o.order_date, 'bei', o.einsatz_name, 'adresse', o.einsatz_adresse)
                          order by o.order_date, o.order_number)
           from public.orders o where o.customer_id = p_kunde and o.wechselort is not null), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105/117: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen, Bestellwünschen, Ansprechpartnern und Wechselorten. Admin und Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- Unverändert gegenüber Migration 57 bis auf die neuen Einträge in `felder` und `tabellen`.
create or replace function public.protokoll_schwaerzen(frist interval default interval '36 months')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  felder constant text[] := array[
    'name', 'company', 'anrede', 'address', 'email', 'phone_mobile', 'phone_landline',
    'lat', 'lng', 'license_plate', 'kennzeichen',
    'note', 'notiz', 'bemerkung', 'description', 'techniker_notiz',
    'cancel_reason', 'reopen_reason', 'kontakt_notiz',
    -- Migration 57: der Laufkunde am Auftrag
    'laufkunde_name', 'laufkunde_telefon', 'laufkunde_ort',
    -- Migration 117: Ansprechpartner und Wechselort
    'telefon', 'funktion', 'einsatz_name', 'einsatz_adresse', 'einsatz_lat', 'einsatz_lng'
  ];
  tabellen constant text[] := array[
    'customers', 'vehicles', 'contact_history', 'orders', 'order_articles',
    'tire_storage', 'eingelagerte_raeder', 'auftrag_fahrzeuge', 'employees', 'profiles',
    'kunden_ansprechpartner'
  ];
  anzahl integer;
begin
  update public.audit_log a
     set alt = case when a.alt is null then null else (
                 select coalesce(jsonb_object_agg(e.key,
                          case when e.key = any(felder) and e.value <> 'null'::jsonb
                               then to_jsonb('geschwärzt'::text) else e.value end), '{}'::jsonb)
                   from jsonb_each(a.alt) e) end,
         neu = case when a.neu is null then null else (
                 select coalesce(jsonb_object_agg(e.key,
                          case when e.key = any(felder) and e.value <> 'null'::jsonb
                               then to_jsonb('geschwärzt'::text) else e.value end), '{}'::jsonb)
                   from jsonb_each(a.neu) e) end,
         geschwaerzt_am = now()
   where a.geschwaerzt_am is null
     and a.geaendert_am < now() - frist
     and a.tabelle = any(tabellen);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
revoke all on function public.protokoll_schwaerzen(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Ergebnis
-- ---------------------------------------------------------------------
select 'Tabelle kunden_ansprechpartner' as pruefung,
       case when to_regclass('public.kunden_ansprechpartner') is not null then 'da' else 'fehlt' end as ergebnis
union all
select 'Spalten customers.auf_karte, orders.wechselort, vehicles.ansprechpartner_id',
       (select count(*)::text || ' von 3' from information_schema.columns
         where table_schema = 'public' and ((table_name = 'customers' and column_name = 'auf_karte')
            or (table_name = 'orders' and column_name = 'wechselort') or (table_name = 'vehicles' and column_name = 'ansprechpartner_id')))
union all
select 'Richtlinien auf kunden_ansprechpartner',
       (select coalesce(string_agg(policyname, ', ' order by policyname), 'keine') from pg_policies
         where schemaname = 'public' and tablename = 'kunden_ansprechpartner')
union all
select 'Ansprechpartner übernommen (Firmen)', (select count(*)::text from public.kunden_ansprechpartner)
union all
select 'Firmen mit Namen am Kunden (sollte 0 sein)',
       (select count(*)::text from public.customers where coalesce(btrim(company), '') <> '' and coalesce(btrim(name), '') <> '' and not laufkundschaft);

-- =====================================================================
-- Migration 64 – Fahrplan Runde 2 (02.10.2026, v103).
--
-- 1. E1  – Dubletten: „keine Dublette"-Vermerk und Zusammenführen zweier Kunden.
-- 2. E10 – Auskunft je Kunde: alles Gespeicherte in einem Abruf (für den Auszug nach Art. 15 DSGVO).
-- 3. E12 – Fachgröße am Lagerplatz: „normal" oder „groß" (SUV, 20 Zoll).
-- 4. E17 – Ein eingelagerter Satz wird zum Verkaufsposten (der Kunde lässt die Reifen da).
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Abschnitt
-- steht für sich und ist wiederholbar. Reihenfolge SQL/Dateien: **SQL zuerst** – die neue
-- Oberfläche ruft die Funktionen auf und liest `storage_slots.groesse`.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.customers') is null or to_regclass('public.verkaufsreifen') is null
     or to_regprocedure('public.darf(text,text)') is null
     or to_regprocedure('public.telefon_vergleich(text)') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 61/63 fehlt: Hier gibt es kein public.customers / public.verkaufsreifen / public.telefon_vergleich(). Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. E1 – Dubletten
-- ---------------------------------------------------------------------
-- Gesucht werden Dubletten in der Anwendung (lib/dubletten.ts: gleiche Telefonnummer, gleiche
-- E-Mail, gleicher Name mit gleicher PLZ). Gespeichert wird hier nur das, was ein Mensch
-- entschieden hat: „diese zwei sind verschiedene Leute" – das Ehepaar mit demselben Festnetz.
-- Ohne diesen Vermerk stünde das Paar bei jedem Öffnen wieder in der Liste.
--
-- Das Paar steht immer in derselben Reihenfolge (kleinere Kennung zuerst), sonst gäbe es
-- dasselbe Paar zweimal.
create table if not exists public.kunden_keine_dublette (
  kunde_a     uuid not null references public.customers(id) on delete cascade,
  kunde_b     uuid not null references public.customers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  primary key (kunde_a, kunde_b),
  constraint kunden_keine_dublette_reihenfolge check (kunde_a < kunde_b)
);

alter table public.kunden_keine_dublette enable row level security;

-- Wer Kunden löschen darf (Admin), pflegt die Liste – derselbe Kreis, der zusammenführen darf.
drop policy if exists "Keine Dublette lesen" on public.kunden_keine_dublette;
create policy "Keine Dublette lesen" on public.kunden_keine_dublette
  for select to authenticated using (public.darf('kunden', 'lesen'));
drop policy if exists "Keine Dublette anlegen" on public.kunden_keine_dublette;
create policy "Keine Dublette anlegen" on public.kunden_keine_dublette
  for insert to authenticated with check (public.darf('kunden', 'loeschen'));
drop policy if exists "Keine Dublette entfernen" on public.kunden_keine_dublette;
create policy "Keine Dublette entfernen" on public.kunden_keine_dublette
  for delete to authenticated using (public.darf('kunden', 'loeschen'));

grant select, insert, delete on public.kunden_keine_dublette to authenticated;
grant all on public.kunden_keine_dublette to service_role;

comment on table public.kunden_keine_dublette is
  'Kundenpaare, die die Dublettenprüfung findet, die aber verschiedene Personen sind. Migration 64, E1.';

-- Zusammenführen: Alles vom Kunden `p_weg` geht an `p_behalten` – Aufträge, Fahrzeuge,
-- Reifensätze, Kontakte, Rechnungsverweise. Leere Felder des bleibenden Kunden werden aus dem
-- anderen gefüllt, nichts Vorhandenes überschrieben. Der andere kommt danach leer in den
-- Papierkorb, mit einem Vermerk in der Notiz.
--
-- Eine Funktion, weil es ganz oder gar nicht laufen muss: ein halb umgezogener Kunde ist
-- schlimmer als eine Dublette.
--
-- Fahrzeuge mit demselben Kennzeichen bei beiden (dasselbe Auto zweimal angelegt) werden zu
-- EINEM: Satz und Auftragszuordnung zeigen danach auf das Fahrzeug des bleibenden Kunden. Der
-- Kennzeichen-Vergleich ist der aus lib/kennzeichen.ts (`kennzeichenSchluessel`) – ohne
-- Leerzeichen, Bindestriche und Punkte, ohne Groß/klein. Wer eine Stelle ändert, ändert beide.
--
-- Rechnungen: Nur der Verweis `customer_id` zieht um. Empfänger und Kundennummer auf dem Beleg
-- bleiben, wie sie ausgestellt wurden – die Unveränderlichkeit (Migration 48) sperrt genau diese
-- Felder, den Verweis nicht.
create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer,
               reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.customers%rowtype;
  w public.customers%rowtype;
  alt_ids uuid[] := '{}';
  neu_ids uuid[] := '{}';
  fz record;
  ziel public.vehicles%rowtype;
  n_auftraege integer;
  n_fahrzeuge integer;
  n_saetze integer;
  n_kontakte integer;
  n_rechnungen integer;
  vermerk text;
  schluessel text;
begin
  if not public.darf('kunden', 'loeschen') then
    raise exception 'Zusammenführen darf nur, wer Kunden löschen darf (Admin).';
  end if;
  if p_behalten is null or p_weg is null or p_behalten = p_weg then
    raise exception 'Bitte zwei verschiedene Kunden angeben.';
  end if;

  -- Beide Zeilen sperren, in fester Reihenfolge – zwei gleichzeitige Läufe warten aufeinander.
  perform 1 from public.customers c where c.id in (p_behalten, p_weg) order by c.id for update;
  select * into b from public.customers c where c.id = p_behalten;
  if not found or b.deleted_at is not null then
    raise exception 'Der Kunde, der bleiben soll, ist nicht (mehr) da.';
  end if;
  select * into w from public.customers c where c.id = p_weg;
  if not found or w.deleted_at is not null then
    raise exception 'Der Kunde, der aufgehen soll, ist nicht (mehr) da.';
  end if;
  if b.laufkundschaft or w.laufkundschaft then
    raise exception 'Die Laufkundschaft ist ein Sammelkunde und wird nicht zusammengeführt.';
  end if;
  if b.testkunde is distinct from w.testkunde then
    raise exception 'Ein Testkunde und ein echter Kunde werden nicht zusammengeführt.';
  end if;

  -- 1. Fahrzeuge: gleiches Kennzeichen → vereinen, sonst umziehen.
  select count(*) into n_fahrzeuge from public.vehicles v where v.customer_id = p_weg;
  for fz in select * from public.vehicles v where v.customer_id = p_weg order by v.created_at, v.id loop
    schluessel := regexp_replace(upper(coalesce(fz.license_plate, '')), '[[:space:]–.·-]', '', 'g');
    ziel := null;
    if schluessel <> '' then
      select * into ziel from public.vehicles v
       where v.customer_id = p_behalten
         and regexp_replace(upper(coalesce(v.license_plate, '')), '[[:space:]–.·-]', '', 'g') = schluessel
       order by v.created_at, v.id
       limit 1;
    end if;
    if ziel.id is not null then
      alt_ids := alt_ids || fz.id;
      neu_ids := neu_ids || ziel.id;
      update public.vehicles v
         set make_model = coalesce(nullif(btrim(v.make_model), ''), fz.make_model),
             tire_size  = coalesce(nullif(btrim(v.tire_size), ''), fz.tire_size),
             note       = case when coalesce(btrim(fz.note), '') = '' or v.note is not distinct from fz.note then v.note
                               when coalesce(btrim(v.note), '') = '' then fz.note
                               else v.note || E'\n' || fz.note end
       where v.id = ziel.id;
    else
      update public.vehicles v set customer_id = p_behalten where v.id = fz.id;
    end if;
  end loop;

  -- 2. Aufträge (auch gelöschte – sie gehören zum Verlauf).
  update public.orders o set customer_id = p_behalten where o.customer_id = p_weg;
  get diagnostics n_auftraege = row_count;

  -- 3. Fahrzeuge am Auftrag auf das vereinte Fahrzeug.
  if cardinality(alt_ids) > 0 then
    update public.auftrag_fahrzeuge af set vehicle_id = m.neu
      from unnest(alt_ids, neu_ids) as m(alt, neu)
     where af.vehicle_id = m.alt;
  end if;

  -- 4. Reifensätze – Kunde und, wo vereint, das Fahrzeug in EINER Anweisung, damit die Prüfung
  --    „Fahrzeug gehört dem Kunden" (Migration 30) nie einen halben Stand sieht.
  update public.tire_storage t
     set customer_id = p_behalten,
         vehicle_id = coalesce((select m.neu from unnest(alt_ids, neu_ids) as m(alt, neu) where m.alt = t.vehicle_id), t.vehicle_id)
   where t.customer_id = p_weg;
  get diagnostics n_saetze = row_count;

  -- 5. Die doppelten Fahrzeuge sind jetzt ohne Verweis.
  if cardinality(alt_ids) > 0 then
    delete from public.vehicles v where v.id = any(alt_ids);
  end if;

  -- 6. Kontakte, Rechnungsverweise, alte Termine (Tabelle seit Migration 16 gesperrt, aber da).
  update public.contact_history h set customer_id = p_behalten where h.customer_id = p_weg;
  get diagnostics n_kontakte = row_count;
  update public.rechnungen r set customer_id = p_behalten where r.customer_id = p_weg;
  get diagnostics n_rechnungen = row_count;
  if to_regclass('public.appointments') is not null then
    update public.appointments a set customer_id = p_behalten where a.customer_id = p_weg;
  end if;

  -- 7. Leere Felder füllen. Die Telefonnummer, die beim bleibenden Kunden schon steht, wird nicht
  --    doppelt eingetragen; eine zweite, andere Mobilnummer wandert ins Festnetzfeld, wenn das
  --    frei ist, sonst in die Notiz – verloren geht keine.
  vermerk := 'Zusammengeführt am ' || to_char(now() at time zone 'Europe/Berlin', 'DD.MM.YYYY')
             || ' mit ' || coalesce('Kd.-Nr. ' || w.kundennummer::text, 'einem Kunden ohne Kundennummer') || '.';
  update public.customers c set
    company        = coalesce(nullif(btrim(c.company), ''), nullif(btrim(w.company), '')),
    anrede         = coalesce(c.anrede, w.anrede),
    email          = coalesce(nullif(btrim(c.email), ''), nullif(btrim(w.email), '')),
    address        = coalesce(nullif(btrim(c.address), ''), w.address),
    lat            = case when c.lat is null then w.lat else c.lat end,
    lng            = case when c.lat is null then w.lng else c.lng end,
    geo_genauigkeit = case when c.lat is null then w.geo_genauigkeit else c.geo_genauigkeit end,
    phone_mobile   = coalesce(nullif(btrim(c.phone_mobile), ''), nullif(btrim(w.phone_mobile), '')),
    phone_landline = coalesce(
                       nullif(btrim(c.phone_landline), ''),
                       case when coalesce(btrim(c.phone_mobile), '') <> ''
                                 and public.telefon_vergleich(w.phone_mobile) is distinct from public.telefon_vergleich(c.phone_mobile)
                                 and public.telefon_vergleich(w.phone_mobile) is not null
                            then w.phone_mobile end,
                       nullif(btrim(w.phone_landline), '')),
    note           = concat_ws(E'\n', nullif(btrim(c.note), ''),
                       case when coalesce(btrim(w.note), '') <> '' and w.note is distinct from c.note then w.note end,
                       -- Eine Nummer, die in keinem Feld mehr Platz fand.
                       case when public.telefon_vergleich(w.phone_landline) is not null
                                 and coalesce(btrim(c.phone_landline), '') <> ''
                                 and public.telefon_vergleich(w.phone_landline) is distinct from public.telefon_vergleich(c.phone_landline)
                                 and public.telefon_vergleich(w.phone_landline) is distinct from public.telefon_vergleich(c.phone_mobile)
                            then 'Weitere Nummer: ' || w.phone_landline end,
                       vermerk),
    -- Der jüngere Kontakt gilt – samt Ergebnis und Wiedervorlage.
    last_contact     = case when w.last_contact > coalesce(c.last_contact, '0001-01-01') then w.last_contact else c.last_contact end,
    status           = case when w.last_contact > coalesce(c.last_contact, '0001-01-01') then w.status else c.status end,
    kontakt_ergebnis = case when w.last_contact > coalesce(c.last_contact, '0001-01-01') then w.kontakt_ergebnis else c.kontakt_ergebnis end,
    wiedervorlage_am = case when w.last_contact > coalesce(c.last_contact, '0001-01-01') then w.wiedervorlage_am else c.wiedervorlage_am end,
    -- Ein normaler Kunde bleibt normal, ein aktiver aktiv.
    einmalkunde    = c.einmalkunde and w.einmalkunde,
    active         = c.active or w.active
  where c.id = p_behalten;

  -- 8. Der andere geht leer in den Papierkorb. Seine Aufträge sind schon umgezogen; die
  --    Weitergabe des Löschens (Migration 19) findet nichts mehr.
  update public.customers c set
    note = concat_ws(E'\n', nullif(btrim(c.note), ''),
             'Zusammengeführt am ' || to_char(now() at time zone 'Europe/Berlin', 'DD.MM.YYYY')
             || ' in ' || coalesce('Kd.-Nr. ' || b.kundennummer::text, 'einen Kunden ohne Kundennummer') || '.'),
    active = false,
    deleted_at = now()
  where c.id = p_weg;

  delete from public.kunden_keine_dublette k where k.kunde_a = p_weg or k.kunde_b = p_weg;

  return query select w.kundennummer, n_auftraege, n_fahrzeuge, cardinality(alt_ids), n_saetze, n_kontakte, n_rechnungen;
end;
$$;

comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Fahrplan E1 (Migration 64): zieht alles von p_weg zu p_behalten um, füllt leere Felder, legt p_weg leer in den Papierkorb. Nur wer Kunden löschen darf.';
revoke all on function public.kunden_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. E10 – Auskunft je Kunde
-- ---------------------------------------------------------------------
-- Alles, was zu einem Kunden gespeichert ist, in EINEM Abruf und damit in einem Stand: Stammdaten,
-- Kontakte, Fahrzeuge, Aufträge mit Positionen und Fahrzeugen, Reifensätze mit Rädern und Platz,
-- Rechnungen, und wie viel das Änderungsprotokoll über ihn enthält. Die Anwendung setzt daraus
-- den Auszug zusammen (components/kunden/AuskunftFenster.tsx).
--
-- Nur für Admin und Superadmin: Ein Auszug ist die vollständigste Sammlung von Personendaten,
-- die die App erzeugen kann – er gehört nicht in jede Hand, die Kunden lesen darf.
create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.customers%rowtype;
  auftrag_ids uuid[];
  satz_ids uuid[];
  fahrzeug_ids uuid[];
  kontakt_ids uuid[];
  ergebnis jsonb;
begin
  if coalesce(public.current_user_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Den Auskunftsauszug erstellen nur Admin und Superadmin.';
  end if;
  select * into k from public.customers c where c.id = p_kunde;
  if not found then
    raise exception 'Diesen Kunden gibt es nicht (mehr).';
  end if;
  if k.laufkundschaft then
    raise exception 'Die Laufkundschaft ist ein Sammelkunde für viele Personen – eine Auskunft gilt einer Person. Die Aufträge mit ihrem Namen stehen am Auftrag (Feld „Name des Laufkunden").';
  end if;

  select coalesce(array_agg(o.id), '{}') into auftrag_ids from public.orders o where o.customer_id = p_kunde;
  select coalesce(array_agg(t.id), '{}') into satz_ids from public.tire_storage t where t.customer_id = p_kunde;
  select coalesce(array_agg(v.id), '{}') into fahrzeug_ids from public.vehicles v where v.customer_id = p_kunde;
  select coalesce(array_agg(h.id), '{}') into kontakt_ids from public.contact_history h where h.customer_id = p_kunde;

  select jsonb_build_object(
    'erstellt_am', now(),
    'kunde', to_jsonb(k) - 'mobil_vergleich' - 'festnetz_vergleich',
    'betrieb', (select jsonb_build_object('firma', b.firma, 'inhaber', b.inhaber, 'strasse', b.strasse, 'plz', b.plz,
                                          'ort', b.ort, 'telefon', b.telefon, 'email', b.email)
                  from public.betrieb b limit 1),
    'kontakte', coalesce((select jsonb_agg(jsonb_build_object('datum', h.date, 'notiz', h.note) order by h.date, h.id)
                            from public.contact_history h where h.customer_id = p_kunde), '[]'::jsonb),
    'fahrzeuge', coalesce((select jsonb_agg(jsonb_build_object('kennzeichen', v.license_plate, 'modell', v.make_model,
                                                               'reifengroesse', v.tire_size, 'notiz', v.note, 'angelegt', v.created_at)
                                            order by v.created_at, v.id)
                             from public.vehicles v where v.customer_id = p_kunde), '[]'::jsonb),
    'auftraege', coalesce((select jsonb_agg(jsonb_build_object(
                    'nummer', o.order_number, 'datum', o.order_date, 'uhrzeit', o.time, 'titel', o.title,
                    'beschreibung', o.description, 'status', o.status, 'notiz', o.techniker_notiz,
                    'storno_grund', o.cancel_reason, 'geloescht', o.deleted_at is not null,
                    'rechnung_noetig', o.rechnung_noetig,
                    'positionen', coalesce((select jsonb_agg(jsonb_build_object(
                                      'menge', oa.quantity, 'artikel', a.short_name, 'text', oa.note,
                                      'netto', oa.net_price, 'endpreis', oa.endpreis_netto)
                                      order by oa.created_at, oa.id)
                                    from public.order_articles oa left join public.articles a on a.id = oa.article_id
                                   where oa.order_id = o.id and oa.deleted_at is null), '[]'::jsonb),
                    'fahrzeuge', coalesce((select jsonb_agg(jsonb_build_object('kennzeichen', v.license_plate, 'kilometerstand', af.kilometerstand)
                                                            order by af.created_at, af.id)
                                    from public.auftrag_fahrzeuge af join public.vehicles v on v.id = af.vehicle_id
                                   where af.order_id = o.id), '[]'::jsonb))
                    order by o.order_date, o.order_number, o.id)
                    from public.orders o where o.customer_id = p_kunde), '[]'::jsonb),
    'reifensaetze', coalesce((select jsonb_agg(jsonb_build_object(
                    'eingelagert', t.created_at, 'ausgelagert', t.removed_at, 'saison', t.saison,
                    'lager', w.name, 'platz', s.code, 'fahrzeug', v.license_plate,
                    'dot', t.dot_date, 'profil_mm', t.profiltiefe_mm, 'anzahl_raeder', t.anzahl_raeder, 'notiz', t.note,
                    'raeder', coalesce((select jsonb_agg(jsonb_build_object('position', r.position, 'groesse', r.reifengroesse,
                                                         'dot', r.dot_date, 'profil_mm', r.profiltiefe_mm, 'felge', r.felge,
                                                         'bemerkung', r.bemerkung) order by r.position, r.id)
                                         from public.eingelagerte_raeder r where r.tire_storage_id = t.id), '[]'::jsonb))
                    order by t.created_at, t.id)
                    from public.tire_storage t
                    left join public.storage_slots s on s.id = t.storage_slot_id
                    left join public.warehouses w on w.id = s.warehouse_id
                    left join public.vehicles v on v.id = t.vehicle_id
                   where t.customer_id = p_kunde), '[]'::jsonb),
    'rechnungen', coalesce((select jsonb_agg(jsonb_build_object('nummer', r.nummer_text, 'art', r.art, 'datum', r.datum,
                                                                'netto', r.netto, 'brutto', r.brutto, 'empfaenger', r.empfaenger)
                                             order by r.datum, r.nummer)
                              from public.rechnungen r where r.customer_id = p_kunde or r.order_id = any(auftrag_ids)), '[]'::jsonb),
    -- Das Protokoll enthält frühere Fassungen derselben Daten. Gezählt wird, was über diesen
    -- Kunden darin steht – die Einträge selbst gehören nicht in einen Brief an den Kunden.
    'protokoll', (select jsonb_build_object('eintraege', count(*), 'aeltester', min(a.geaendert_am), 'neuester', max(a.geaendert_am))
                    from public.audit_log a
                   where a.kunde_id = p_kunde
                      or a.auftrag_id = any(auftrag_ids)
                      or (a.tabelle = 'vehicles'        and a.datensatz_id = any(fahrzeug_ids::text[]))
                      or (a.tabelle = 'tire_storage'    and a.datensatz_id = any(satz_ids::text[]))
                      or (a.tabelle = 'contact_history' and a.datensatz_id = any(kontakt_ids::text[])))
  ) into ergebnis;

  return ergebnis;
end;
$$;

comment on function public.kunde_auskunft(uuid) is
  'Fahrplan E10 (Migration 64): alles zu einem Kunden Gespeicherte als jsonb, für den Auskunftsauszug. Nur Admin/Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. E12 – Fachgröße am Lagerplatz
-- ---------------------------------------------------------------------
-- „normal" oder „groß" (SUV, 20 Zoll, breite Reifen). Welcher Reifen ein großes Fach braucht,
-- rechnet die Anwendung aus der Reifengröße (lib/lagerAnsicht.ts, `brauchtGrossesFach`) und
-- warnt – sie sperrt nicht: Wer weiß, dass es passt, darf.
alter table public.storage_slots add column if not exists groesse text not null default 'normal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storage_slots_groesse_bekannt') then
    alter table public.storage_slots add constraint storage_slots_groesse_bekannt check (groesse in ('normal', 'gross'));
  end if;
end $$;
comment on column public.storage_slots.groesse is
  'Fachgröße: normal oder gross (SUV/20 Zoll). Migration 64, E12.';

-- ---------------------------------------------------------------------
-- 4. E17 – Aus dem Satz wird ein Verkaufsposten
-- ---------------------------------------------------------------------
-- Woher ein Posten stammt, wenn er aus einem eingelagerten Satz kam. Nur Auskunft; der Satz bleibt
-- als ausgelagerte Zeile im Verlauf des Platzes und des Kunden.
alter table public.verkaufsreifen add column if not exists herkunft_satz_id uuid references public.tire_storage(id) on delete set null;
comment on column public.verkaufsreifen.herkunft_satz_id is
  'Aus welchem eingelagerten Satz der Posten stammt (der Kunde hat die Reifen dagelassen). Migration 64, E17.';

-- Satz auslagern und die Posten auf denselben Platz legen – in einem Zug. Nacheinander aus der
-- Anwendung ginge es nicht: Ein Platz hält entweder einen Kundensatz oder Verkaufsreifen
-- (Migration 61), dazwischen wäre er entweder doppelt belegt oder kurz frei für jemand anderen.
--
-- `security invoker`: Es gelten die Rechte des Aufrufers – Einlagerung schreiben (auslagern) und
-- Reifenverkauf schreiben (Posten anlegen). Die Posten kommen als Liste; Platz, Lager und Herkunft
-- setzt diese Funktion, nicht der Aufrufer.
create or replace function public.satz_zum_verkauf(p_satz uuid, p_posten jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.tire_storage%rowtype;
  p jsonb;
  neu uuid;
  ids uuid[] := '{}';
begin
  -- Vorab geprüft statt erst beim Einfügen: Sonst lagerte der Satz aus, und erst der Posten
  -- scheiterte an einer Richtlinie mit einer Meldung, die niemand versteht.
  if not public.darf('lager.verkauf', 'schreiben') then
    raise exception 'Zum Übernehmen in den Reifenverkauf fehlt das Recht „Lager · Reifenverkauf schreiben".';
  end if;
  if jsonb_typeof(p_posten) <> 'array' or jsonb_array_length(p_posten) = 0 then
    raise exception 'Mindestens ein Posten ist nötig.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_posten) e where btrim(coalesce(e ->> 'hersteller', '')) = '') then
    raise exception 'Bitte bei jedem Posten den Hersteller angeben.';
  end if;
  select * into s from public.tire_storage t where t.id = p_satz for update;
  if not found then
    raise exception 'Diesen Reifensatz gibt es nicht (oder er ist nicht sichtbar).';
  end if;
  if s.removed_at is not null then
    raise exception 'Der Satz ist schon ausgelagert.';
  end if;

  update public.tire_storage t set removed_at = now() where t.id = p_satz;
  if not found then
    raise exception 'Zum Auslagern fehlt die Berechtigung.';
  end if;

  for p in select * from jsonb_array_elements(p_posten) loop
    insert into public.verkaufsreifen (
      zustand, breite, querschnitt, zoll, kennung, hersteller, modell, saison, dot, profiltiefe_mm,
      felge, runflat, xl, eprel, preis_netto, ek_netto, bestand, storage_slot_id, notiz, herkunft_satz_id)
    values (
      coalesce(p ->> 'zustand', 'gebraucht'),
      (p ->> 'breite')::integer,
      nullif(p ->> 'querschnitt', '')::integer,
      (p ->> 'zoll')::numeric,
      nullif(btrim(p ->> 'kennung'), ''),
      coalesce(p ->> 'hersteller', ''),
      nullif(btrim(p ->> 'modell'), ''),
      p ->> 'saison',
      nullif(btrim(p ->> 'dot'), ''),
      nullif(p ->> 'profiltiefe_mm', '')::numeric,
      nullif(p ->> 'felge', ''),
      coalesce((p ->> 'runflat')::boolean, false),
      coalesce((p ->> 'xl')::boolean, false),
      null,
      (p ->> 'preis_netto')::numeric,
      nullif(p ->> 'ek_netto', '')::numeric,
      (p ->> 'bestand')::integer,
      s.storage_slot_id,
      nullif(btrim(p ->> 'notiz'), ''),
      s.id)
    returning id into neu;
    ids := ids || neu;
  end loop;
  return ids;
end;
$$;

comment on function public.satz_zum_verkauf(uuid, jsonb) is
  'Fahrplan E17 (Migration 64): lagert einen Satz aus und legt die Posten auf denselben Platz – ganz oder gar nicht. Rechte des Aufrufers.';
revoke all on function public.satz_zum_verkauf(uuid, jsonb) from public, anon;
grant execute on function public.satz_zum_verkauf(uuid, jsonb) to authenticated;

commit;

-- Zur Kontrolle (Ergebnistabelle – der SQL-Editor zeigt keine Meldungen):
select 'Tabelle kunden_keine_dublette' as pruefung, (to_regclass('public.kunden_keine_dublette') is not null)::text as ergebnis
union all
select 'Funktion kunden_zusammenfuehren', (to_regprocedure('public.kunden_zusammenfuehren(uuid,uuid)') is not null)::text
union all
select 'Funktion kunde_auskunft', (to_regprocedure('public.kunde_auskunft(uuid)') is not null)::text
union all
select 'Spalte storage_slots.groesse',
  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'storage_slots' and column_name = 'groesse'))::text
union all
select 'Funktion satz_zum_verkauf', (to_regprocedure('public.satz_zum_verkauf(uuid,jsonb)') is not null)::text;

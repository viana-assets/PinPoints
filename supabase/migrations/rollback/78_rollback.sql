-- =====================================================================
-- Rücknahme von Migration 78 (Rechtematrix, Schritt 3: zehn Unterrechte).
--
-- Stellt den Stand nach Migration 77 wieder her: Richtlinien, Trigger und Funktionen wie vorher,
-- die zehn Zeilen in `module_permissions` entfernt. Aufträge, die ein Techniker in der Zwischenzeit
-- angelegt hat, bleiben stehen (mit ihm als Eingeteiltem). Zweimal lauffähig.
-- Erst die Dateien von v125 wieder hochladen, dann dieses Skript.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

drop trigger if exists trg_auftrag_handlungen_pruefen on public.orders;
drop trigger if exists trg_auftrag_techniker_einteilen on public.orders;
drop trigger if exists trg_lager_handlungen_pruefen on public.tire_storage;
drop trigger if exists trg_lagergebuehr_pruefen on public.order_articles;
drop trigger if exists trg_rechnung_storno_pruefen on public.rechnungen;
drop trigger if exists trg_kunde_kontakt_pruefen on public.customers;
drop function if exists public.auftrag_handlungen_pruefen();
drop function if exists public.auftrag_techniker_einteilen();
drop function if exists public.lager_handlungen_pruefen();
drop function if exists public.lagergebuehr_pruefen();
drop function if exists public.lagergebuehr_gepflegt();
drop function if exists public.lager_monate(timestamptz, date);
drop function if exists public.rechnung_storno_pruefen();
drop function if exists public.kunde_kontakt_pruefen();

-- Aufträge anlegen: wie Migration 42 („Aufträge schreiben“, Techniker nie).
drop policy if exists "Bereich auftraege schreiben" on public.orders;
create policy "Bereich auftraege schreiben" on public.orders
  for insert to authenticated
  with check (public.darf('auftraege.auftrag', 'schreiben') and coalesce(public.current_user_role(), '') <> 'techniker');

-- Belege löschen: wie Migration 65.
drop trigger if exists trg_loeschrecht on public.auftrag_belege;
create trigger trg_loeschrecht
  before delete on public.auftrag_belege
  for each row execute procedure public.pruefe_loeschrecht('auftraege.auftrag');
drop policy if exists "MR Belege loeschen" on storage.objects;
create policy "MR Belege loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'auftrag-belege' and public.darf('auftraege.auftrag', 'loeschen'));

-- Kunden und Kontakthistorie: wie Migration 42.
drop policy if exists "Bereich kunden aendern" on public.customers;
create policy "Bereich kunden aendern" on public.customers
  for update to authenticated
  using (public.darf('kunden', 'schreiben')) with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Bereich kunden schreiben" on public.contact_history;
create policy "Bereich kunden schreiben" on public.contact_history
  for insert to authenticated
  with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Bereich kunden aendern" on public.contact_history;
create policy "Bereich kunden aendern" on public.contact_history
  for update to authenticated
  using (public.darf('kunden', 'schreiben')) with check (public.darf('kunden', 'schreiben'));

-- Dubletten: wie Migration 64.
drop policy if exists "Keine Dublette anlegen" on public.kunden_keine_dublette;
create policy "Keine Dublette anlegen" on public.kunden_keine_dublette
  for insert to authenticated
  with check (public.darf('kunden', 'loeschen'));
drop policy if exists "Keine Dublette entfernen" on public.kunden_keine_dublette;
create policy "Keine Dublette entfernen" on public.kunden_keine_dublette
  for delete to authenticated
  using (public.darf('kunden', 'loeschen'));

-- Die drei Funktionen im Stand von Migration 77.
create or replace function public.restrict_techniker_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    -- Wiedereröffnen ist Admin-Sache (Migration 20); ohne diesen Grund geht es ohnehin nicht.
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    -- Migration 75: Den Transporter teilt das Büro ein.
    if old.firmenfahrzeug_id is distinct from new.firmenfahrzeug_id then
      raise exception 'Den Transporter teilt das Büro ein.';
    end if;
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.enforce_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
 RETURNS TABLE(kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

delete from public.module_permissions
 where module_key in ('auftraege.anlegen', 'auftraege.wiedereroeffnen', 'auftraege.transporter', 'auftraege.belege',
                      'lager.auslagern', 'lager.gebuehr', 'lager.tausch', 'rechnungen.storno',
                      'kunden.kontakte', 'kunden.dubletten');

select 'Zeilen aus Migration 78 noch da (sollte 0 sein)' as pruefung,
       (select count(*) from public.module_permissions
         where module_key in ('auftraege.anlegen', 'auftraege.wiedereroeffnen', 'auftraege.transporter', 'auftraege.belege',
                              'lager.auslagern', 'lager.gebuehr', 'lager.tausch', 'rechnungen.storno',
                              'kunden.kontakte', 'kunden.dubletten'))::text as ergebnis
union all
select 'Trigger aus Migration 78 noch da (sollte 0 sein)',
       (select count(*) from pg_trigger
         where not tgisinternal and tgname in ('trg_auftrag_handlungen_pruefen', 'trg_auftrag_techniker_einteilen',
               'trg_lager_handlungen_pruefen', 'trg_lagergebuehr_pruefen', 'trg_rechnung_storno_pruefen', 'trg_kunde_kontakt_pruefen'))::text;

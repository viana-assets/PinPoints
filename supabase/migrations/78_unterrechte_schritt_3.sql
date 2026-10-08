-- =====================================================================
-- Migration 78 – Rechtematrix, Schritt 3: zehn weitere Unterrechte (08.10.2026, v126).
--
-- Vitali hat am 08.10.2026 ausgewählt, welche fest geregelten Handlungen einen eigenen Haken
-- bekommen, und „alles in einer Runde“ gewählt:
--
--   auftraege.anlegen          schreiben  Aufträge anlegen – bisher „Aufträge schreiben“, für den
--                                         Techniker fest gesperrt
--   auftraege.wiedereroeffnen  schreiben  abgeschlossene/stornierte Aufträge wiedereröffnen – bisher
--                                         fest: nur Admin
--   auftraege.transporter      schreiben  den Transporter einteilen – bisher „Aufträge schreiben“,
--                                         für den Techniker fest gesperrt (75)
--   auftraege.belege           löschen    Fotos und Unterschrift löschen – bisher „Aufträge löschen“
--   lager.auslagern            schreiben  Reifen auslagern oder zum Auslagern vormerken – bisher
--                                         „Reifen ein- und auslagern“
--   lager.gebuehr              schreiben  die Lagergebühr beim Auslagern anpassen (Monate ändern,
--                                         ohne Gebühr) – bisher jeder, der auslagern durfte
--   lager.tausch               schreiben  Reifentausch anlegen und verwerfen – bisher „Reifen ein-
--                                         und auslagern“
--   rechnungen.storno          schreiben  Rechnungen stornieren – bisher „Rechnungen schreiben“
--   kunden.kontakte            schreiben  Kontakte eintragen (kontaktiert/offen, Wiedervorlage,
--                                         Kontakthistorie) – bisher „Kunden schreiben“
--   kunden.dubletten           schreiben  Dubletten zusammenführen, „keine Dublette“ vermerken –
--                                         bisher „Kunden löschen“
--
-- **Niemand verliert oder gewinnt durch diese Migration ein Recht:** Die neuen Zeilen in
-- `module_permissions` werden aus dem übernommen, was bisher galt (die Zeile, an der die Handlung
-- hing, beim Wiedereröffnen „nur Admin“). Wer danach etwas anders haben will, setzt den Haken.
--
-- Durchgesetzt wird jeweils in der Datenbank (BEFORE-Trigger begründen im Klartext):
--   - Anlegen: Richtlinie „Bereich auftraege schreiben“ (INSERT) fragt `auftraege.anlegen`; die feste
--     Sperre für den Techniker fällt. Legt ein Techniker an, trägt ihn `auftrag_techniker_einteilen()`
--     selbst ein – sonst sähe er den eigenen Auftrag nicht. Ohne verknüpften Mitarbeiter lehnt
--     `auftrag_handlungen_pruefen()` ab.
--   - Wiedereröffnen: `enforce_order_status_transition()` fragt den Haken statt der Rolle;
--     `restrict_techniker_order_update()` sperrt `reopen_reason` nicht mehr fest.
--   - Transporter: `auftrag_handlungen_pruefen()` für alle Rollen (vorher fest nur für den Techniker
--     in `restrict_techniker_order_update()`).
--   - Belege: Löschtrigger auf `auftrag_belege` und Speicher-Richtlinie „MR Belege loeschen“.
--   - Auslagern, Tausch, Gebühr: `lager_handlungen_pruefen()` auf `tire_storage`,
--     `lagergebuehr_pruefen()` auf `order_articles`. Ohne „Lagergebühr anpassen“ steht die Menge
--     fest (`lager_monate()`, wie `lagermonate()` in lib/lagerdauer.ts) und Vormerken verlangt die
--     Gebühr auf dem Auftrag, sofern ein Lagergebühr-Artikel mit gültigem Preis gepflegt ist.
--     Ein heute selbst eingelagerter Satz lässt sich ohne „Auslagern“ wieder herausnehmen (Korrektur).
--   - Rechnung stornieren: `rechnung_storno_pruefen()` auf `rechnungen`.
--   - Kontakte: Richtlinie „Bereich kunden aendern“ lässt auch „Kontakte eintragen“ zu,
--     `kunde_kontakt_pruefen()` trennt die Spalten; Kontakthistorie schreiben fragt den Haken.
--   - Dubletten: `kunden_zusammenfuehren()` und die Richtlinien auf `kunden_keine_dublette`.
--
-- Ohne angemeldeten Nutzer (Service-Schlüssel) und aus anderen Triggern heraus
-- (`pg_trigger_depth() > 1`) greifen die neuen Prüfungen nicht.
--
-- Reihenfolge: nach 77, SQL zuerst, dann die Dateien von v126.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.auftrag_storno_pruefen()') is null then
    raise exception 'Migration 77 fehlt noch – bitte zuerst 77 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die neuen Zeilen der Rechtematrix – übernommen aus dem, was bisher galt.
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select x.schluessel, '{}'::text[], x.schreiben, x.loeschen
  from (values
    ('auftraege.anlegen',
       array_remove(coalesce((select edit_roles from public.module_permissions where module_key = 'auftraege.auftrag'), array['admin', 'user']), 'techniker'),
       '{}'::text[]),
    ('auftraege.wiedereroeffnen', array['admin'], '{}'::text[]),
    ('auftraege.transporter',
       array_remove(coalesce((select edit_roles from public.module_permissions where module_key = 'auftraege.auftrag'), array['admin', 'user']), 'techniker'),
       '{}'::text[]),
    ('auftraege.belege', '{}'::text[],
       coalesce((select delete_roles from public.module_permissions where module_key = 'auftraege.auftrag'), array['admin', 'user'])),
    ('lager.auslagern',
       coalesce((select edit_roles from public.module_permissions where module_key = 'lager.einlagerung'), array['admin', 'techniker', 'user']),
       '{}'::text[]),
    ('lager.gebuehr',
       coalesce((select edit_roles from public.module_permissions where module_key = 'lager.einlagerung'), array['admin', 'techniker', 'user']),
       '{}'::text[]),
    ('lager.tausch',
       coalesce((select edit_roles from public.module_permissions where module_key = 'lager.einlagerung'), array['admin', 'techniker', 'user']),
       '{}'::text[]),
    ('rechnungen.storno',
       coalesce((select edit_roles from public.module_permissions where module_key = 'rechnungen'), array['admin']),
       '{}'::text[]),
    ('kunden.kontakte',
       coalesce((select edit_roles from public.module_permissions where module_key = 'kunden'), array['admin', 'user']),
       '{}'::text[]),
    ('kunden.dubletten',
       coalesce((select delete_roles from public.module_permissions where module_key = 'kunden'), array['admin']),
       '{}'::text[])
  ) as x(schluessel, schreiben, loeschen)
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Aufträge: anlegen, Transporter, Wiedereröffnen
-- ---------------------------------------------------------------------
drop policy if exists "Bereich auftraege schreiben" on public.orders;
create policy "Bereich auftraege schreiben" on public.orders
  for insert to authenticated
  with check (public.darf('auftraege.anlegen', 'schreiben'));

create or replace function public.auftrag_handlungen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  -- Der Techniker sieht nur Aufträge, auf denen er steht. Ohne Mitarbeiter-Verknüpfung könnte er
  -- ihn nicht eintragen – der Auftrag wäre für ihn sofort verschwunden.
  if tg_op = 'INSERT' and coalesce(public.current_user_role(), '') = 'techniker' and public.current_employee_id() is null then
    raise exception 'Dein Zugang ist mit keinem Mitarbeiter verknüpft – so kannst du keinen Auftrag anlegen (Admin › Mitarbeiter).';
  end if;
  if ((tg_op = 'INSERT' and new.firmenfahrzeug_id is not null)
      or (tg_op = 'UPDATE' and new.firmenfahrzeug_id is distinct from old.firmenfahrzeug_id))
     and not public.darf('auftraege.transporter', 'schreiben') then
    raise exception 'Den Transporter einzuteilen ist für diese Rolle nicht freigegeben (Admin › Rechte › Aufträge › Transporter einteilen).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_auftrag_handlungen_pruefen on public.orders;
create trigger trg_auftrag_handlungen_pruefen
  before insert or update on public.orders
  for each row execute procedure public.auftrag_handlungen_pruefen();

-- Legt ein Techniker den Auftrag an, steht er danach selbst darauf.
create or replace function public.auftrag_techniker_einteilen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ich uuid;
begin
  if (select auth.uid()) is null or coalesce(public.current_user_role(), '') <> 'techniker' then return null; end if;
  ich := public.current_employee_id();
  if ich is not null then
    insert into public.order_employees (order_id, employee_id) values (new.id, ich) on conflict do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_auftrag_techniker_einteilen on public.orders;
create trigger trg_auftrag_techniker_einteilen
  after insert on public.orders
  for each row execute procedure public.auftrag_techniker_einteilen();

-- Ohne die feste Transporter-Sperre (jetzt oben, für alle Rollen) und ohne `reopen_reason`
-- (Wiedereröffnen prüft jetzt `enforce_order_status_transition()` mit dem Haken).
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber keinem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- Wiedereröffnen: der Haken statt der Rolle. Sonst unverändert (Migration 20).
create or replace function public.enforce_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  wer uuid := (select auth.uid());
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
    -- Migration 78: statt „nur Admin/Superadmin“ der eigene Haken in der Rechtematrix.
    if not public.darf('auftraege.wiedereroeffnen', 'schreiben') then
      raise exception 'Wiedereröffnen ist für diese Rolle nicht freigegeben (Admin › Rechte › Aufträge › Wiedereröffnen).';
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


-- ---------------------------------------------------------------------
-- 3. Fotos und Unterschrift löschen
-- ---------------------------------------------------------------------
drop trigger if exists trg_loeschrecht on public.auftrag_belege;
create trigger trg_loeschrecht
  before delete on public.auftrag_belege
  for each row execute procedure public.pruefe_loeschrecht('auftraege.belege');

drop policy if exists "MR Belege loeschen" on storage.objects;
create policy "MR Belege loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'auftrag-belege' and public.darf('auftraege.belege', 'loeschen'));

-- ---------------------------------------------------------------------
-- 4. Lager: auslagern, Tausch, Lagergebühr
-- ---------------------------------------------------------------------

-- Lagermonate wie `lagermonate()` in lib/lagerdauer.ts: angefangene Monate zählen voll, mindestens
-- einer. Gezählt wird vom Tag der Einlagerung (deutsche Zeit) bis `p_bis`.
create or replace function public.lager_monate(p_von timestamptz, p_bis date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1,
    (extract(year from p_bis)::int - extract(year from (p_von at time zone 'Europe/Berlin'))::int) * 12
    + (extract(month from p_bis)::int - extract(month from (p_von at time zone 'Europe/Berlin'))::int)
    + case when extract(day from p_bis) > extract(day from (p_von at time zone 'Europe/Berlin')) then 1 else 0 end);
$$;

-- Ist eine Lagergebühr zu berechnen? Nur, wenn ein aktiver Lagergebühr-Artikel heute einen gültigen
-- Preis hat – sonst zeigt die App auch nichts zum Berechnen an.
create or replace function public.lagergebuehr_gepflegt()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.articles a
      join public.article_prices p on p.article_id = a.id
     where a.active and a.abrechnungsart = 'lagergebuehr'
       and p.valid_from <= (now() at time zone 'Europe/Berlin')::date
       and (p.valid_to is null or p.valid_to >= (now() at time zone 'Europe/Berlin')::date)
  );
$$;

create or replace function public.lager_handlungen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;

  if tg_op = 'INSERT' then
    if new.kommt_rein and not public.darf('lager.tausch', 'schreiben') then
      raise exception 'Einen Reifentausch anzulegen ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Reifentausch).';
    end if;
    return new;
  end if;

  -- Herausnehmen.
  if old.removed_at is null and new.removed_at is not null then
    if old.kommt_rein then
      if not public.darf('lager.tausch', 'schreiben') then
        raise exception 'Einen Reifentausch zu verwerfen ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Reifentausch).';
      end if;
    elsif not public.darf('lager.auslagern', 'schreiben')
          -- Korrektur: einen heute selbst eingelagerten Satz wieder herausnehmen.
          and not (old.created_by = (select auth.uid()) and (old.created_at at time zone 'Europe/Berlin')::date = heute) then
      raise exception 'Auslagern ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Reifen auslagern).';
    end if;
    return new;
  end if;

  -- Vormerken und Vormerkung zurücknehmen (Migration 67).
  if old.removed_at is null and new.removed_at is null and new.entnahme_order_id is distinct from old.entnahme_order_id then
    if not public.darf('lager.auslagern', 'schreiben') then
      raise exception 'Auslagern ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Reifen auslagern).';
    end if;
    if new.entnahme_order_id is not null and not public.darf('lager.gebuehr', 'schreiben')
       and public.lagergebuehr_gepflegt()
       and not exists (select 1 from public.order_articles oa
                        where oa.order_id = new.entnahme_order_id and oa.lager_satz_id = new.id and oa.deleted_at is null) then
      raise exception 'Ohne Lagergebühr auszulagern ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Lagergebühr anpassen).';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lager_handlungen_pruefen on public.tire_storage;
create trigger trg_lager_handlungen_pruefen
  before insert or update on public.tire_storage
  for each row execute procedure public.lager_handlungen_pruefen();

-- Die Lagergebühr eines Satzes (`lager_satz_id`, Migration 67) ohne „Lagergebühr anpassen“: Menge
-- wie berechnet, kein Sonderpreis, nicht ändern; entfernen nur mit der zurückgenommenen Vormerkung.
create or replace function public.lagergebuehr_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz record;
  termin date;
  soll integer;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if public.darf('lager.gebuehr', 'schreiben') then return new; end if;

  if tg_op = 'INSERT' then
    if new.lager_satz_id is null then return new; end if;
    select t.created_at into satz from public.tire_storage t where t.id = new.lager_satz_id;
    select o.order_date into termin from public.orders o where o.id = new.order_id;
    soll := public.lager_monate(satz.created_at, greatest((now() at time zone 'Europe/Berlin')::date, coalesce(termin, '-infinity'::date)));
    if new.quantity is distinct from soll or new.endpreis_netto is not null then
      raise exception 'Die Lagergebühr steht für diese Rolle fest: % Monate zum Artikelpreis (Admin › Rechte › Lager › Lagergebühr anpassen).', soll;
    end if;
    return new;
  end if;

  if old.lager_satz_id is null then return new; end if;
  if new.quantity is distinct from old.quantity or new.endpreis_netto is distinct from old.endpreis_netto
     or new.net_price is distinct from old.net_price then
    raise exception 'Die Lagergebühr zu ändern ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Lagergebühr anpassen).';
  end if;
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.tire_storage t
                  where t.id = old.lager_satz_id and t.entnahme_order_id = old.order_id and t.removed_at is null) then
    raise exception 'Die Lagergebühr geht nur zusammen mit der Vormerkung vom Auftrag (Admin › Rechte › Lager › Lagergebühr anpassen).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lagergebuehr_pruefen on public.order_articles;
create trigger trg_lagergebuehr_pruefen
  before insert or update on public.order_articles
  for each row execute procedure public.lagergebuehr_pruefen();

-- ---------------------------------------------------------------------
-- 5. Rechnung stornieren
-- ---------------------------------------------------------------------
create or replace function public.rechnung_storno_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if new.hebt_auf is not null and not public.darf('rechnungen.storno', 'schreiben') then
    raise exception 'Rechnungen zu stornieren ist für diese Rolle nicht freigegeben (Admin › Rechte › Rechnungen › Stornieren).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_rechnung_storno_pruefen on public.rechnungen;
create trigger trg_rechnung_storno_pruefen
  before insert on public.rechnungen
  for each row execute procedure public.rechnung_storno_pruefen();

-- ---------------------------------------------------------------------
-- 6. Kunden: Kontakte eintragen
-- ---------------------------------------------------------------------
-- Ändern darf, wer Kunden schreiben ODER Kontakte eintragen darf (der Techniker Letzteres nur bei
-- Kunden seiner Aufträge). Welche Spalten wer ändert, trennt der Trigger darunter.
drop policy if exists "Bereich kunden aendern" on public.customers;
create policy "Bereich kunden aendern" on public.customers
  for update to authenticated
  using (public.darf('kunden', 'schreiben')
         or (public.darf('kunden.kontakte', 'schreiben')
             and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(id))))
  with check (public.darf('kunden', 'schreiben')
         or (public.darf('kunden.kontakte', 'schreiben')
             and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(id))));

-- Bewusst OHNE security definer: So zeigt `current_user`, ob die Änderung direkt aus der App kommt
-- (`authenticated`) oder aus einer Funktion, die selbst prüft (etwa `kunde_email_ergaenzen()`,
-- Migration 74/77, oder `kunden_zusammenfuehren()`) – dann läuft sie als Eigentümer und wird hier
-- nicht ein zweites Mal geprüft.
create or replace function public.kunde_kontakt_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kontakt constant text[] := array['status', 'last_contact', 'kontakt_ergebnis', 'wiedervorlage_am'];
  -- Zeitstempel und die beiden berechneten Spalten (im BEFORE-Trigger noch nicht neu berechnet).
  nebenbei constant text[] := array['updated_at', 'updated_by', 'mobil_vergleich', 'festnetz_vergleich'];
  a jsonb;
  n jsonb;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or current_user not in ('authenticated', 'anon') then return new; end if;
  a := to_jsonb(old);
  n := to_jsonb(new);
  if exists (select 1 from unnest(kontakt) k where a -> k is distinct from n -> k)
     and not public.darf('kunden.kontakte', 'schreiben') then
    raise exception 'Kontakte einzutragen ist für diese Rolle nicht freigegeben (Admin › Rechte › Kunden › Kontakte eintragen).';
  end if;
  if exists (select 1 from jsonb_object_keys(n) k
              where k <> all (kontakt) and k <> all (nebenbei) and a -> k is distinct from n -> k)
     and not public.darf('kunden', 'schreiben') then
    raise exception 'Kundendaten zu ändern ist für diese Rolle nicht freigegeben – nur Kontakte eintragen.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kunde_kontakt_pruefen on public.customers;
create trigger trg_kunde_kontakt_pruefen
  before update on public.customers
  for each row execute procedure public.kunde_kontakt_pruefen();

drop policy if exists "Bereich kunden schreiben" on public.contact_history;
create policy "Bereich kunden schreiben" on public.contact_history
  for insert to authenticated
  with check (public.darf('kunden.kontakte', 'schreiben')
              and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(customer_id)));
drop policy if exists "Bereich kunden aendern" on public.contact_history;
create policy "Bereich kunden aendern" on public.contact_history
  for update to authenticated
  using (public.darf('kunden.kontakte', 'schreiben'))
  with check (public.darf('kunden.kontakte', 'schreiben'));

-- ---------------------------------------------------------------------
-- 7. Kunden: Dubletten
-- ---------------------------------------------------------------------
drop policy if exists "Keine Dublette anlegen" on public.kunden_keine_dublette;
create policy "Keine Dublette anlegen" on public.kunden_keine_dublette
  for insert to authenticated
  with check (public.darf('kunden.dubletten', 'schreiben'));
drop policy if exists "Keine Dublette entfernen" on public.kunden_keine_dublette;
create policy "Keine Dublette entfernen" on public.kunden_keine_dublette
  for delete to authenticated
  using (public.darf('kunden.dubletten', 'schreiben'));

-- Zusammenführen: eigener Haken, „Kunden löschen“ weiter nötig. Sonst unverändert (Migration 64).
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
  -- Migration 78: eigener Haken „Dubletten zusammenführen“. Kunden löschen braucht es weiter –
  -- der zweite Kunde geht dabei in den Papierkorb, und das prüft `pruefe_loeschrecht()`.
  if not public.darf('kunden.dubletten', 'schreiben') then
    raise exception 'Zusammenführen ist für diese Rolle nicht freigegeben (Admin › Rechte › Kunden › Dubletten zusammenführen).';
  end if;
  if not public.darf('kunden', 'loeschen') then
    raise exception 'Zum Zusammenführen braucht es zusätzlich „Kunden löschen“ – der zweite Kunde geht dabei in den Papierkorb.';
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

-- ---------------------------------------------------------------------
-- 8. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Neue Zeilen in der Rechtematrix' as pruefung,
       (select count(*) from public.module_permissions
         where module_key in ('auftraege.anlegen', 'auftraege.wiedereroeffnen', 'auftraege.transporter', 'auftraege.belege',
                              'lager.auslagern', 'lager.gebuehr', 'lager.tausch', 'rechnungen.storno',
                              'kunden.kontakte', 'kunden.dubletten'))::text || ' von 10' as ergebnis
union all
select 'Neue Prüfungen (Trigger)',
       (select count(*) from pg_trigger
         where not tgisinternal and tgname in ('trg_auftrag_handlungen_pruefen', 'trg_auftrag_techniker_einteilen',
               'trg_lager_handlungen_pruefen', 'trg_lagergebuehr_pruefen', 'trg_rechnung_storno_pruefen', 'trg_kunde_kontakt_pruefen'))::text || ' von 6'
union all
select 'Wiedereröffnen fragt die Matrix',
       (position('auftraege.wiedereroeffnen' in pg_get_functiondef('public.enforce_order_status_transition()'::regprocedure)) > 0)::text
union all
select 'Belege löschen fragt die Matrix',
       (coalesce((select pg_get_triggerdef(oid) from pg_trigger
                   where tgrelid = 'public.auftrag_belege'::regclass and tgname = 'trg_loeschrecht'), '') like '%auftraege.belege%')::text;

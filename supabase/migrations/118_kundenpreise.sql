-- =====================================================================
-- Migration 118 – Kundenpreise: eigene Preise je Kunde und Artikel (19.11.2026, v191).
--
-- Wunsch Vitali (17.11.2026): Bestimmte Kunden bekommen bestimmte Leistungen immer günstiger („Radwechsel 20 €,
-- Reifen aufziehen 10 €“) – ohne dass man es bei jedem Auftrag von Hand eintippt und ohne dass andere Kunden es sehen.
-- Entschieden (docs/artikelstammdaten.md, „Kundenpreise“):
--
--   1. `kunden_preise`: je Kunde und Artikel ein Netto-Preis je Einheit, wahlweise mit „gültig ab/bis“. Zeiträume
--      desselben Artikels beim selben Kunden dürfen sich nicht überschneiden (`kunden_preis_pruefen()`).
--   2. Kommt der Artikel in einen Auftrag dieses Kunden, setzt die Datenbank beim Anlegen der Position den
--      Kundenpreis als Preis je Einheit ein und merkt den Listenpreis in `order_articles.listenpreis_netto`
--      (`position_kundenpreis()`). Maßgeblich ist das Datum des Auftrags. Danach ist es ein Schnappschuss wie jeder
--      Preis an einer Position – ändert sich der Kundenpreis später, bleibt die Position, wie sie ist.
--   3. Kundengruppe (Migration 101): Ein Kundenpreis am Hauptkunden gilt auch für seine Unterdebitoren; ein eigener
--      Kundenpreis am Unterdebitor geht vor.
--   4. Sehen und pflegen nur mit „Endpreis überschreiben“ (`auftraege.preis` schreiben) und Kunden lesen. Wer das
--      Recht nicht hat (etwa der Techniker), bekommt den Preis trotzdem – die Datenbank setzt ihn ein.
--   5. Nicht für Laufkundschaft und nicht für Reifenverkauf (dort kommt der Preis vom Reifen).
--   6. Zusammenführen nimmt die Kundenpreise mit, der Auskunftsauszug nennt sie, das Schwärzen des Protokolls kennt
--      die Tabelle (Notiz). „Kunde endgültig löschen“ nimmt sie per Kaskade mit, das Protokoll dazu räumt es über
--      `audit_log.kunde_id` ab. „Alle Daten löschen“ leert die Tabelle von selbst.
--
-- Reihenfolge: nach 117, SQL zuerst, dann die Dateien von v191. Zweiter Lauf folgenlos. Rücknahme:
-- rollback/118_rollback.sql.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.customers') is null or to_regclass('public.order_articles') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.customers / public.order_articles. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.kunden_ansprechpartner') is null then
    raise exception 'Zuerst die Migration 117 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Kundenpreise
-- ---------------------------------------------------------------------
create table if not exists public.kunden_preise (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  article_id  uuid not null references public.articles (id) on delete cascade,
  net_price   numeric(10,2) not null,
  valid_from  date,
  valid_to    date,
  notiz       text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  constraint kp_preis    check (net_price >= 0 and net_price <= 99999),
  constraint kp_zeitraum check (valid_from is null or valid_to is null or valid_to >= valid_from),
  constraint kp_notiz    check (coalesce(length(notiz), 0) <= 300)
);
create index if not exists kunden_preise_kunde_idx on public.kunden_preise (customer_id, article_id);
comment on table public.kunden_preise is
  'Migration 118: eigener Netto-Preis je Kunde und Artikel (wahlweise mit Zeitraum). Wird beim Anlegen einer Position übernommen (position_kundenpreis).';

drop trigger if exists trg_stamp_row on public.kunden_preise;
create trigger trg_stamp_row before insert or update on public.kunden_preise
  for each row execute procedure public.stamp_row();
drop trigger if exists trg_audit_row on public.kunden_preise;
create trigger trg_audit_row after insert or update or delete on public.kunden_preise
  for each row execute procedure public.audit_row();

-- Prüft im Klartext, was eine Richtlinie nur still ablehnen könnte. Dieselben Regeln stehen in
-- `kundenpreisMaengel()` (lib/kundenpreise.ts).
create or replace function public.kunden_preis_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k record;
  art text;
begin
  select c.laufkundschaft into k from public.customers c where c.id = new.customer_id;
  if coalesce(k.laufkundschaft, false) then
    raise exception 'Für die Laufkundschaft gibt es keine Kundenpreise – dort gilt der Listenpreis.';
  end if;
  select a.abrechnungsart into art from public.articles a where a.id = new.article_id;
  if art in ('reifenverkauf_neu', 'reifenverkauf_gebraucht') then
    raise exception 'Beim Reifenverkauf kommt der Preis vom Reifen – dafür gibt es keinen Kundenpreis.';
  end if;
  -- Vor dem Überschneidungsvergleich: Ein umgedrehter Zeitraum wäre sonst ein technischer Fehler statt einer Meldung.
  if new.valid_from is not null and new.valid_to is not null and new.valid_to < new.valid_from then
    raise exception 'Das Ende (gültig bis) liegt vor dem Anfang (gültig ab).';
  end if;
  if exists (select 1 from public.kunden_preise p
              where p.customer_id = new.customer_id and p.article_id = new.article_id and p.id <> new.id
                and daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]')
                 && daterange(coalesce(new.valid_from, '-infinity'::date), coalesce(new.valid_to, 'infinity'::date), '[]')) then
    raise exception 'Für diesen Artikel hat der Kunde im selben Zeitraum schon einen Kundenpreis. Den anderen zuerst beenden (gültig bis) oder ändern.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kunden_preis_pruefen on public.kunden_preise;
create trigger trg_kunden_preis_pruefen before insert or update on public.kunden_preise
  for each row execute procedure public.kunden_preis_pruefen();

alter table public.kunden_preise enable row level security;
drop policy if exists "Kundenpreise lesen" on public.kunden_preise;
create policy "Kundenpreise lesen" on public.kunden_preise
  for select to authenticated
  using (public.darf('auftraege.preis', 'schreiben') and public.darf('kunden', 'lesen'));
drop policy if exists "Kundenpreise anlegen" on public.kunden_preise;
create policy "Kundenpreise anlegen" on public.kunden_preise
  for insert to authenticated
  with check (public.darf('auftraege.preis', 'schreiben') and public.darf('kunden', 'lesen'));
drop policy if exists "Kundenpreise aendern" on public.kunden_preise;
create policy "Kundenpreise aendern" on public.kunden_preise
  for update to authenticated
  using (public.darf('auftraege.preis', 'schreiben') and public.darf('kunden', 'lesen'))
  with check (public.darf('auftraege.preis', 'schreiben') and public.darf('kunden', 'lesen'));
-- Wer sie lesen darf, darf sie auch löschen: Ein Kundenpreis ist eine Absprache, kein Beleg – das Protokoll hält fest,
-- was gelöscht wurde.
drop policy if exists "Kundenpreise loeschen" on public.kunden_preise;
create policy "Kundenpreise loeschen" on public.kunden_preise
  for delete to authenticated
  using (public.darf('auftraege.preis', 'schreiben') and public.darf('kunden', 'lesen'));
grant select, insert, update, delete on public.kunden_preise to authenticated;

-- ---------------------------------------------------------------------
-- 2. Der Kundenpreis an der Position
-- ---------------------------------------------------------------------
alter table public.order_articles add column if not exists listenpreis_netto numeric(10,2);
comment on column public.order_articles.listenpreis_netto is
  'Migration 118: Listenpreis je Einheit, wenn beim Anlegen ein Kundenpreis eingesetzt wurde (net_price ist dann der Kundenpreis). Leer = Listenpreis.';

-- `security definer`: Der Techniker liest `kunden_preise` nicht, soll den Preis aber bekommen. Läuft bei jedem Anlegen,
-- auch aus Funktionen heraus – der Preis hängt am Kunden, nicht daran, wer die Position anlegt.
create or replace function public.position_kundenpreis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kunde uuid;
  haupt uuid;
  tag date;
  preis numeric;
begin
  -- Reifen aus dem Lager haben ihren Preis vom Reifen; schon gesetzt heißt: schon übernommen.
  if new.verkaufsreifen_id is not null or new.listenpreis_netto is not null then return new; end if;
  select o.customer_id, coalesce(o.order_date, (now() at time zone 'Europe/Berlin')::date) into kunde, tag
    from public.orders o where o.id = new.order_id;
  if kunde is null then return new; end if;
  select c.haupt_kunde_id into haupt from public.customers c where c.id = kunde;
  select p.net_price into preis
    from public.kunden_preise p
   where p.article_id = new.article_id
     and (p.customer_id = kunde or (haupt is not null and p.customer_id = haupt))
     and (p.valid_from is null or p.valid_from <= tag)
     and (p.valid_to is null or p.valid_to >= tag)
   order by (p.customer_id = kunde) desc
   limit 1;
  if preis is not null then
    new.listenpreis_netto := new.net_price;
    new.net_price := preis;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_position_kundenpreis on public.order_articles;
create trigger trg_position_kundenpreis before insert on public.order_articles
  for each row execute procedure public.position_kundenpreis();

-- ---------------------------------------------------------------------
-- 3. Zusammenführen, Auskunft, Schwärzen (Stand von Migration 117 plus Kundenpreise)
-- ---------------------------------------------------------------------
create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kunden_ansprechpartner k set customer_id = p_behalten where k.customer_id = p_weg and p_behalten <> p_weg;
  -- Migration 118: Kundenpreise wandern mit, soweit der verbleibende Kunde für denselben Artikel und Zeitraum nicht
  -- schon einen eigenen hat (der bleibt dann maßgeblich; der andere geht mit dem zweiten Kunden).
  update public.kunden_preise p set customer_id = p_behalten
   where p.customer_id = p_weg and p_behalten <> p_weg
     and not exists (select 1 from public.kunden_preise q
                      where q.customer_id = p_behalten and q.article_id = p.article_id
                        and daterange(coalesce(q.valid_from, '-infinity'::date), coalesce(q.valid_to, 'infinity'::date), '[]')
                         && daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]'));
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit (Migration 105).
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Migration 64/78/105/117/118: zwei Kunden zusammenführen; Ansprechpartner, Kundenpreise und Bestellwünsche wandern mit.';
revoke all on function public.kunden_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid) to authenticated;

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
           from public.orders o where o.customer_id = p_kunde and o.wechselort is not null), '[]'::jsonb))
    -- Migration 118
    || jsonb_build_object('kundenpreise', coalesce((
         select jsonb_agg(jsonb_build_object('artikel', a.short_name, 'preis_netto', p.net_price, 'ab', p.valid_from, 'bis', p.valid_to,
                                             'notiz', p.notiz, 'angelegt', p.created_at) order by a.short_name, p.valid_from nulls first, p.id)
           from public.kunden_preise p join public.articles a on a.id = p.article_id
          where p.customer_id = p_kunde), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105/117/118: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen, Bestellwünschen, Ansprechpartnern, Wechselorten und Kundenpreisen. Admin und Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

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
    'kunden_ansprechpartner',
    -- Migration 118 (die Notiz am Kundenpreis)
    'kunden_preise'
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
select 'Tabelle kunden_preise' as pruefung,
       case when to_regclass('public.kunden_preise') is not null then 'da' else 'fehlt' end as ergebnis
union all
select 'Spalte order_articles.listenpreis_netto',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_articles'
                          and column_name = 'listenpreis_netto') then 'da' else 'fehlt' end
union all
select 'Richtlinien auf kunden_preise',
       (select coalesce(string_agg(policyname, ', ' order by policyname), 'keine') from pg_policies
         where schemaname = 'public' and tablename = 'kunden_preise')
union all
select 'Trigger an order_articles (Kundenpreis)',
       case when exists (select 1 from pg_trigger where tgname = 'trg_position_kundenpreis' and not tgisinternal) then 'da' else 'fehlt' end;

-- =====================================================================
-- Migration 119 – Kundenartikel: Artikel, die nur bei einem Kunden auftauchen (21.11.2026, v192).
--
-- Wunsch Vitali (21.11.2026): Neben den Kundenpreisen (Migration 118) eigene Leistungen für bestimmte Kunden – etwa
-- „Flottencheck Kunterbunt“ oder „Hol- und Bringservice“ –, gepflegt im Kundenfenster, mit Übersicht im Artikelstamm.
-- Entschieden (docs/artikelstammdaten.md, „Kundenartikel“):
--
--   1. Ein Kundenartikel ist ein ganz normaler Artikel mit `articles.customer_id`. So laufen Rechnung, Steuer,
--      Auswertung, Finance-Leistungsart, Protokoll ohne Umbau weiter. Leer = Artikel für alle.
--   2. In einen Auftrag kommt er nur bei diesem Kunden oder einem Mitglied seiner Kundengruppe (Migration 101) –
--      `position_kundenartikel_pruefen()` (BEFORE INSERT/UPDATE OF article_id auf order_articles).
--   3. Nur Abrechnungsart „normal“, nicht für die Laufkundschaft (`artikel_kunde_pruefen()`). Kein Kundenpreis auf einen
--      Kundenartikel – sein Preis steht am Artikel (`kunden_preis_pruefen()` erweitert).
--   4. `on delete set null` am Kunden; „Kunde endgültig löschen“ und „Testkunde restlos löschen“ löschen seine
--      Kundenartikel danach selbst samt Protokoll (Hüllen um `kunde_endgueltig_loeschen_grund()` und das neue
--      `testkunde_loeschen_grund()`). Benutzt ein anderer Kunde einen davon noch, bricht das Löschen mit Klartext ab.
--   5. Zusammenführen nimmt die Kundenartikel mit, der Auskunftsauszug nennt sie.
--   Rechte: wie jeder Artikel – pflegen mit „Artikel“ schreiben, eintragen mit „Leistungen“.
--
-- Reihenfolge: nach 118, SQL zuerst, dann die Dateien von v192. Zweiter Lauf folgenlos. Rücknahme:
-- rollback/119_rollback.sql.
-- =====================================================================

do $$
begin
  if to_regclass('public.articles') is null or to_regclass('public.customers') is null or to_regclass('public.order_articles') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.articles / public.customers / public.order_articles. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.kunden_preise') is null or to_regprocedure('public.testkunde_loeschen(uuid)') is null then
    raise exception 'Zuerst die Migration 118 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Kunde am Artikel
-- ---------------------------------------------------------------------
alter table public.articles add column if not exists customer_id uuid references public.customers (id) on delete set null;
create index if not exists articles_kunde_idx on public.articles (customer_id) where customer_id is not null;
comment on column public.articles.customer_id is
  'Migration 119: Kundenartikel – nur in Aufträgen dieses Kunden (und seiner Kundengruppe) wählbar. Leer = Artikel für alle.';

-- Dieselben Regeln stehen in `kundenartikelMaengel()` (lib/kundenartikel.ts).
create or replace function public.artikel_kunde_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lauf boolean;
begin
  if new.customer_id is null then return new; end if;
  select c.laufkundschaft into lauf from public.customers c where c.id = new.customer_id;
  if coalesce(lauf, false) then
    raise exception 'Für die Laufkundschaft gibt es keine Kundenartikel.';
  end if;
  if new.abrechnungsart <> 'normal' then
    raise exception 'Ein Kundenartikel ist eine normale Leistung – Lagergebühr und Reifenverkauf bleiben Artikel für alle.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_artikel_kunde_pruefen on public.articles;
create trigger trg_artikel_kunde_pruefen before insert or update of customer_id, abrechnungsart on public.articles
  for each row execute procedure public.artikel_kunde_pruefen();

-- ---------------------------------------------------------------------
-- 2. Nur beim eigenen Kunden in den Auftrag
-- ---------------------------------------------------------------------
create or replace function public.position_kundenartikel_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  besitzer uuid;
  kunde uuid;
begin
  select a.customer_id into besitzer from public.articles a where a.id = new.article_id;
  if besitzer is null then return new; end if;
  select o.customer_id into kunde from public.orders o where o.id = new.order_id;
  if kunde is null or public.kunde_gruppe(kunde) is distinct from public.kunde_gruppe(besitzer) then
    raise exception 'Dieser Kundenartikel gehört zu einem anderen Kunden und lässt sich hier nicht eintragen.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_position_kundenartikel_pruefen on public.order_articles;
create trigger trg_position_kundenartikel_pruefen before insert or update of article_id on public.order_articles
  for each row execute procedure public.position_kundenartikel_pruefen();

-- Kein Kundenpreis auf einen Kundenartikel (Stand von Migration 118 plus diese Regel).
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
  -- Migration 119: Ein Kundenartikel hat seinen Preis am Artikel – kein Kundenpreis dazu.
  if exists (select 1 from public.articles a where a.id = new.article_id and a.customer_id is not null) then
    raise exception 'Ein Kundenartikel hat seinen Preis am Artikel – dafür gibt es keinen Kundenpreis.';
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

-- ---------------------------------------------------------------------
-- 3. Kunde löschen nimmt seine Kundenartikel mit
-- ---------------------------------------------------------------------
-- Vor dem Löschen: welche, und ob ein anderer Kunde einen davon noch in einem Auftrag hat. Danach (der Fremdschlüssel hat
-- `customer_id` geleert) diese Artikel löschen – ihre Positionen sind mit den Aufträgen des Kunden schon fort – und das
-- Protokoll dazu, denn der Name eines Kundenartikels nennt oft den Kunden.
create or replace function public.kundenartikel_vor_loeschen(p_kunde uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  n integer;
begin
  select coalesce(array_agg(a.id), '{}') into ids from public.articles a where a.customer_id = p_kunde;
  select count(*) into n from public.order_articles p join public.orders o on o.id = p.order_id
   where p.article_id = any(ids) and o.customer_id <> p_kunde;
  if n > 0 then
    raise exception 'Kundenartikel dieses Kunden stehen noch in % Leistung(en) anderer Kunden (Kundengruppe). Diese Leistungen zuerst entfernen oder die Kundenartikel einem anderen Kunden geben. Es wurde nichts gelöscht.', n;
  end if;
  return ids;
end;
$$;
revoke all on function public.kundenartikel_vor_loeschen(uuid) from public, anon, authenticated;

create or replace function public.kundenartikel_nach_loeschen(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(p_ids) = 0 then return; end if;
  delete from public.articles a where a.id = any(p_ids);
  delete from public.audit_log l
   where (l.tabelle = 'articles' and l.datensatz_id = any(p_ids::text[]))
      or (l.tabelle in ('article_prices', 'fin_artikel_kost', 'kunden_preise')
          and coalesce(l.alt ->> 'article_id', l.neu ->> 'article_id') = any(p_ids::text[]));
end;
$$;
revoke all on function public.kundenartikel_nach_loeschen(uuid[]) from public, anon, authenticated;

create or replace function public.kunde_endgueltig_loeschen(p_kunde uuid)
returns table (kundennummer integer, auftraege integer, fahrzeuge integer, protokolleintraege integer, rechnungen_bleiben integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  wunsch_ids uuid[];
  artikel_ids uuid[];
begin
  -- Migration 119: Kundenartikel vorher einsammeln (bricht ab, wenn ein anderer Kunde einen noch benutzt).
  artikel_ids := public.kundenartikel_vor_loeschen(p_kunde);
  -- Vorher einsammeln: Nach dem Löschen sind Kunde und Aufträge an den Wünschen schon leer.
  select coalesce(array_agg(w.id), '{}') into wunsch_ids
    from public.bestellwuensche w
   where w.kunde_id = p_kunde
      or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde);
  -- Prüft Rolle, Papierkorb, Reifen im Regal … und bricht sonst ab – dann bleibt auch hier alles.
  return query select * from public.kunde_endgueltig_loeschen_grund(p_kunde);
  -- Text und Notiz nennen oft den Kunden; das Foto zeigt womöglich sein Auto. Die Datei merkt
  -- `bestellwunsch_nachlauf()` vor.
  delete from public.bestellwuensche w where w.id = any(wunsch_ids);
  perform public.kundenartikel_nach_loeschen(artikel_ids);
end;
$$;
comment on function public.kunde_endgueltig_loeschen(uuid) is
  'Migration 56/60/105/119: Kunde aus dem Papierkorb endgültig löschen, samt Bestellwünschen und Kundenartikeln. Nur Superadmin.';
revoke all on function public.kunde_endgueltig_loeschen(uuid) from public, anon;
grant execute on function public.kunde_endgueltig_loeschen(uuid) to authenticated;

-- „Testkunde restlos löschen“ (Migration 60) bekommt dieselbe Hülle.
do $$
begin
  if to_regprocedure('public.testkunde_loeschen_grund(uuid)') is null then
    alter function public.testkunde_loeschen(uuid) rename to testkunde_loeschen_grund;
  end if;
end $$;
revoke all on function public.testkunde_loeschen_grund(uuid) from public, anon, authenticated;

create or replace function public.testkunde_loeschen(p_kunde uuid)
returns table (auftraege integer, rechnungen integer, fahrzeuge integer, reifensaetze integer, protokolleintraege integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  artikel_ids uuid[];
begin
  artikel_ids := public.kundenartikel_vor_loeschen(p_kunde);
  -- Prüft Rolle und Testkunde selbst und bricht sonst ab.
  return query select * from public.testkunde_loeschen_grund(p_kunde);
  perform public.kundenartikel_nach_loeschen(artikel_ids);
end;
$$;
comment on function public.testkunde_loeschen(uuid) is
  'Migration 60/119: löscht einen Testkunden restlos – Aufträge, Rechnungen (nur T-Nummern), Fahrzeuge, Reifen, Kontakte, Kundenartikel, Protokoll. Nur Superadmin.';
revoke all on function public.testkunde_loeschen(uuid) from public, anon;
grant execute on function public.testkunde_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Zusammenführen, Auskunft (Stand von Migration 118 plus Kundenartikel)
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
  -- Migration 119: Kundenartikel wandern mit.
  update public.articles a set customer_id = p_behalten where a.customer_id = p_weg and p_behalten <> p_weg;
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit (Migration 105).
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Migration 64/78/105/117/118/119: zwei Kunden zusammenführen; Ansprechpartner, Kundenpreise, Kundenartikel und Bestellwünsche wandern mit.';
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
          where p.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 119
    || jsonb_build_object('kundenartikel', coalesce((
         select jsonb_agg(jsonb_build_object('nummer', a.article_number, 'artikel', a.short_name, 'bezeichnung', a.long_name,
                                             'aktiv', a.active, 'angelegt', a.created_at) order by a.article_number)
           from public.articles a where a.customer_id = p_kunde), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105/117/118/119: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen, Bestellwünschen, Ansprechpartnern, Wechselorten, Kundenpreisen und Kundenartikeln. Admin und Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ergebnis
-- ---------------------------------------------------------------------
select 'Spalte articles.customer_id' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles'
                          and column_name = 'customer_id') then 'da' else 'fehlt' end as ergebnis
union all
select 'Prüfungen (Artikel, Position)',
       (select count(*)::text || ' von 2' from pg_trigger where not tgisinternal
         and tgname in ('trg_artikel_kunde_pruefen', 'trg_position_kundenartikel_pruefen'))
union all
select 'Löschen mit Kundenartikeln (Kunde, Testkunde)',
       case when to_regprocedure('public.testkunde_loeschen_grund(uuid)') is not null
             and to_regprocedure('public.kundenartikel_nach_loeschen(uuid[])') is not null then 'da' else 'fehlt' end
union all
select 'Kundenartikel', (select count(*)::text from public.articles where customer_id is not null);

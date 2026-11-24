-- =====================================================================
-- Migration 120 – Reklamationsauftrag (24.11.2026, v193).
--
-- Wunsch Vitali (24.11.2026): Ruft ein Kunde nach einem Reifenwechsel an („das Lenkrad vibriert“), entsteht ein
-- Reklamationsauftrag – mit Bezug auf den erledigten Auftrag von damals oder, im Sonderfall, ohne. Er hat einen Termin
-- wie jeder Auftrag; die Auswertung zählt Reklamationen und rechnet den Schaden. Entschieden
-- (docs/auftraege.md, „Reklamation“):
--
--   1. Eine Reklamation ist ein Auftrag mit `orders.art = 'reklamation'`. So laufen Termin, Team, Karte, Push,
--      Leistungen, Fotos, Protokoll und Offline ohne Umbau weiter. Ob ein Auftrag eine ist, steht beim Anlegen fest.
--   2. Bezug: `reklamation_von` auf einen ERLEDIGTEN Auftrag desselben Kunden oder seiner Kundengruppe (Migration 101).
--      Ohne Bezug ist eine kurze Begründung Pflicht (`reklamation_ohne_bezug`).
--   3. Schnappschuss `reklamation_bezug` (jsonb): Nummer, Datum, Leistungen, Techniker, Fahrzeuge und Notiz des
--      Bezugsauftrags – wie jeder Beleg hier ein Schnappschuss. Der Techniker sieht damit, was damals gemacht wurde,
--      auch wenn er den alten Auftrag selbst nicht lesen darf (nur eigene Aufträge), und die Auswertung je Techniker
--      hängt nicht am Zeitraum der geladenen Aufträge.
--   4. Grund aus einer festen Liste (`REKLAMATION_GRUENDE`, lib/reklamation.ts) plus Freitext.
--   5. Abrechnung: Vorgabe ohne Rechnung. Beim Abschließen ist das Ergebnis Pflicht – berechtigt, Kulanz, nicht
--      berechtigt. „Rechnung nötig“ nur bei „nicht berechtigt“.
--   6. Schaden: `betrieb.stundensatz_intern` (netto je Technikerstunde) für die Kosten; der entgangene Umsatz wird in
--      der App aus den Aufträgen gerechnet (lib/reklamation.ts).
--   Rechte: wie jeder Auftrag – anlegen mit „Aufträge › Anlegen“, abschließen mit „Aufträge“ schreiben.
--
-- Reihenfolge: nach 119, SQL zuerst, dann die Dateien von v193. Zweiter Lauf folgenlos. Rücknahme:
-- rollback/120_rollback.sql.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.betrieb') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.betrieb. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.testkunde_loeschen_grund(uuid)') is null or to_regprocedure('public.kunde_gruppe(uuid)') is null then
    raise exception 'Zuerst die Migration 119 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Spalten am Auftrag
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists art text not null default 'auftrag';
alter table public.orders add column if not exists reklamation_von uuid references public.orders (id) on delete set null;
alter table public.orders add column if not exists reklamation_grund text;
alter table public.orders add column if not exists reklamation_text text;
alter table public.orders add column if not exists reklamation_ohne_bezug text;
alter table public.orders add column if not exists reklamation_ergebnis text;
alter table public.orders add column if not exists reklamation_bezug jsonb;

alter table public.orders drop constraint if exists orders_art_werte;
alter table public.orders add constraint orders_art_werte check (art in ('auftrag', 'reklamation'));
-- Dieselbe Liste steht in REKLAMATION_GRUENDE (lib/reklamation.ts).
alter table public.orders drop constraint if exists orders_reklamation_grund_werte;
alter table public.orders add constraint orders_reklamation_grund_werte check (reklamation_grund is null
  or reklamation_grund in ('vibration', 'radmutter', 'luftdruck', 'beschaedigung', 'falsche_montage', 'sonstiges'));
alter table public.orders drop constraint if exists orders_reklamation_ergebnis_werte;
alter table public.orders add constraint orders_reklamation_ergebnis_werte check (reklamation_ergebnis is null
  or reklamation_ergebnis in ('berechtigt', 'kulanz', 'nicht_berechtigt'));
alter table public.orders drop constraint if exists orders_reklamation_laengen;
alter table public.orders add constraint orders_reklamation_laengen check (
  coalesce(length(reklamation_text), 0) <= 1000 and coalesce(length(reklamation_ohne_bezug), 0) <= 300);
-- Ein gewöhnlicher Auftrag trägt keine Reklamationsangaben; eine Reklamation immer einen Grund.
alter table public.orders drop constraint if exists orders_reklamation_felder;
alter table public.orders add constraint orders_reklamation_felder check (
  case when art = 'reklamation' then reklamation_grund is not null
       else reklamation_von is null and reklamation_grund is null and reklamation_text is null
            and reklamation_ohne_bezug is null and reklamation_ergebnis is null and reklamation_bezug is null end);

create index if not exists orders_reklamation_von_idx on public.orders (reklamation_von) where reklamation_von is not null;
create index if not exists orders_reklamation_idx on public.orders (order_date) where art = 'reklamation';

comment on column public.orders.art is 'Migration 120: auftrag | reklamation. Steht beim Anlegen fest.';
comment on column public.orders.reklamation_von is 'Migration 120: der erledigte Auftrag, auf den sich die Reklamation bezieht.';
comment on column public.orders.reklamation_bezug is
  'Migration 120: Schnappschuss des Bezugsauftrags (nummer, datum, titel, leistungen, techniker, fahrzeuge, notiz).';
comment on column public.orders.reklamation_ergebnis is 'Migration 120: berechtigt | kulanz | nicht_berechtigt – Pflicht beim Abschließen.';

-- ---------------------------------------------------------------------
-- 2. Interner Stundensatz für den Schaden
-- ---------------------------------------------------------------------
alter table public.betrieb add column if not exists stundensatz_intern numeric(8, 2);
alter table public.betrieb drop constraint if exists betrieb_stundensatz_intern;
alter table public.betrieb add constraint betrieb_stundensatz_intern check (stundensatz_intern is null
  or (stundensatz_intern >= 0 and stundensatz_intern <= 9999));
comment on column public.betrieb.stundensatz_intern is
  'Migration 120: interne Kosten je Technikerstunde (netto) – für den Schaden einer Reklamation in der Auswertung.';

-- ---------------------------------------------------------------------
-- 3. Schnappschuss des Bezugsauftrags
-- ---------------------------------------------------------------------
create or replace function public.reklamation_bezug_schnappschuss(p_auftrag uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nummer', o.order_number, 'datum', o.order_date, 'titel', o.title,
    'abgeschlossen', o.completed_at, 'notiz', o.techniker_notiz,
    'leistungen', coalesce((select jsonb_agg(jsonb_build_object('menge', oa.quantity, 'artikel', a.short_name, 'text', oa.note)
                                             order by oa.created_at, oa.id)
                              from public.order_articles oa left join public.articles a on a.id = oa.article_id
                             where oa.order_id = o.id and oa.deleted_at is null), '[]'::jsonb),
    'techniker', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name, e.id)
                             from public.order_employees oe join public.employees e on e.id = oe.employee_id
                            where oe.order_id = o.id), '[]'::jsonb),
    'fahrzeuge', coalesce((select jsonb_agg(jsonb_build_object('kennzeichen', v.license_plate, 'kilometerstand', af.kilometerstand)
                                            order by af.created_at, af.id)
                             from public.auftrag_fahrzeuge af join public.vehicles v on v.id = af.vehicle_id
                            where af.order_id = o.id), '[]'::jsonb))
  from public.orders o where o.id = p_auftrag;
$$;
revoke all on function public.reklamation_bezug_schnappschuss(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Prüfung
-- ---------------------------------------------------------------------
-- Dieselben Regeln stehen in `reklamationMaengel()` und `abschlussMaengel()` (lib/reklamation.ts).
-- `security definer`, weil der Bezugsauftrag gelesen werden muss, auch wenn die anlegende Person ihn nicht sehen darf
-- (Techniker sehen nur eigene Aufträge). Sie fragt nicht nach `current_user` – keine Weiche nötig.
create or replace function public.auftrag_reklamation_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  if tg_op = 'UPDATE' and new.art is distinct from old.art then
    raise exception 'Ob ein Auftrag eine Reklamation ist, steht beim Anlegen fest. Bei Bedarf eine neue Reklamation anlegen.';
  end if;
  if new.art is distinct from 'reklamation' then return new; end if;

  -- Löschfolge: Der Bezugsauftrag wurde endgültig gelöscht (Fremdschlüssel setzt null). Die Reklamation bleibt, ihr
  -- Schnappschuss behält Nummer, Datum und Leistungen – Kennzeichen und Notiz des gelöschten Auftrags nicht.
  if pg_trigger_depth() > 1 then
    if tg_op = 'UPDATE' and new.reklamation_von is null and old.reklamation_von is not null and new.reklamation_bezug is not null then
      new.reklamation_bezug := new.reklamation_bezug - 'fahrzeuge' - 'notiz';
    end if;
    return new;
  end if;

  -- Vorgabe ohne Rechnung (Entscheidung 24.11.2026).
  if tg_op = 'INSERT' then
    new.rechnung_noetig := false;
    new.reklamation_ergebnis := null;
  end if;

  new.reklamation_text := nullif(btrim(coalesce(new.reklamation_text, '')), '');
  new.reklamation_ohne_bezug := nullif(btrim(coalesce(new.reklamation_ohne_bezug, '')), '');
  if new.reklamation_grund is null then
    raise exception 'Den Grund der Reklamation wählen.';
  end if;

  if tg_op = 'INSERT' or new.reklamation_von is distinct from old.reklamation_von then
    if new.reklamation_von is null then
      if new.reklamation_ohne_bezug is null then
        raise exception 'Ohne Bezugsauftrag kurz begründen, warum es keinen gibt (zum Beispiel „Arbeit vor Einführung der App“).';
      end if;
      new.reklamation_bezug := null;
    else
      if new.reklamation_von = new.id then
        raise exception 'Eine Reklamation kann sich nicht auf sich selbst beziehen.';
      end if;
      select o.id, o.status, o.deleted_at, o.customer_id into u from public.orders o where o.id = new.reklamation_von;
      if not found or u.deleted_at is not null then
        raise exception 'Der Bezugsauftrag ist nicht mehr vorhanden.';
      end if;
      if u.status <> 'erledigt' then
        raise exception 'Eine Reklamation bezieht sich auf einen erledigten Auftrag.';
      end if;
      if public.kunde_gruppe(u.customer_id) is distinct from public.kunde_gruppe(new.customer_id) then
        raise exception 'Der Bezugsauftrag gehört zu einem anderen Kunden.';
      end if;
      new.reklamation_ohne_bezug := null;
      new.reklamation_bezug := public.reklamation_bezug_schnappschuss(u.id);
    end if;
  end if;

  if new.status = 'erledigt' and new.reklamation_ergebnis is null then
    raise exception 'Beim Abschließen einer Reklamation das Ergebnis wählen: berechtigt, Kulanz oder nicht berechtigt.';
  end if;
  if new.rechnung_noetig and new.reklamation_ergebnis is distinct from 'nicht_berechtigt' then
    raise exception 'Eine Reklamation wird nur berechnet, wenn sie nicht berechtigt war – das wird beim Abschließen gewählt.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_auftrag_reklamation_pruefen on public.orders;
create trigger trg_auftrag_reklamation_pruefen before insert or update on public.orders
  for each row execute procedure public.auftrag_reklamation_pruefen();

-- ---------------------------------------------------------------------
-- 5. Auskunftsauszug (Art. 15 DSGVO): Grund und Texte gehören zum Kunden
-- ---------------------------------------------------------------------
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
           from public.articles a where a.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 120
    || jsonb_build_object('reklamationen', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'datum', o.order_date, 'grund', o.reklamation_grund,
                                             'text', o.reklamation_text, 'ohne_bezug', o.reklamation_ohne_bezug,
                                             'bezug_auftrag', o.reklamation_bezug -> 'nummer', 'ergebnis', o.reklamation_ergebnis)
                          order by o.order_date, o.order_number)
           from public.orders o where o.customer_id = p_kunde and o.art = 'reklamation'), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105/117/118/119/120: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen, Bestellwünschen, Ansprechpartnern, Wechselorten, Kundenpreisen, Kundenartikeln und Reklamationen. Admin und Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ergebnis
-- ---------------------------------------------------------------------
select 'Spalten am Auftrag (art, reklamation_*)' as pruefung,
       (select count(*)::text || ' von 7' from information_schema.columns where table_schema = 'public' and table_name = 'orders'
         and column_name in ('art', 'reklamation_von', 'reklamation_grund', 'reklamation_text', 'reklamation_ohne_bezug',
                             'reklamation_ergebnis', 'reklamation_bezug')) as ergebnis
union all
select 'Prüfung der Reklamation',
       case when exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_auftrag_reklamation_pruefen') then 'da' else 'fehlt' end
union all
select 'Interner Stundensatz (Betriebsdaten)',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'betrieb'
                          and column_name = 'stundensatz_intern') then 'da – in den Betriebsdaten eintragen' else 'fehlt' end
union all
select 'Reklamationen', (select count(*)::text from public.orders where art = 'reklamation');

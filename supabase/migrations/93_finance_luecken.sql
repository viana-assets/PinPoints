-- =====================================================================
-- Migration 93 – Finance: Lücken aus F2–F5 (14.10.2026, v151).
--
--   1. TEILZAHLUNGEN im Bankabgleich (`fin_teilzahlungen`): Ein Umsatz darf kleiner sein als der offene Rest
--      einer Rechnung oder eines Belegs. Bezahlt ist erst, wenn der Rest null ist. „Bar bezahlt“ / „Überweisung“
--      an Rechnung und Beleg buchen jetzt den offenen Rest. Wird eine Teilzahlung storniert (Aufheben, Zahlung
--      zurücknehmen), ist sie raus und der Posten wieder offen (Trigger `fin_teilzahlung_nach_storno`).
--   2. IST-VERSTEUERUNG mit Teilzahlungen: Rechnungen aus FSM zählen in der Voranmeldung anteilig je Zahlung.
--   3. KASSENSTURZ (`fin_kassenstuerze`, `fin_kassensturz()`): gezählter gegen gebuchten Bestand, Differenz auf
--      Wunsch ausgebucht (Fehlbetrag 4900/6300, Überschuss 2700/4830), Quelle `kasse`.
--   4. § 13b ABS. 2 (z. B. Bauleistungen, Gebäudereinigung): Steuerschlüssel `r13b2_19`, Kz 84/85, Konto 3120/5920.
--   5. FRISTERINNERUNG: `fin_steuer_erinnerungen` – welche Erinnerung an die Voranmeldung schon an wen ging
--      (Versand: lib/steuerErinnerungVersand.ts im Minutenlauf von app/api/push/senden).
--
-- PILOT wie alles in Finance. Reihenfolge: nach 92, SQL zuerst, dann v151. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_voranmeldungen') is null then
    raise exception 'Zuerst Migration 92 (Finance: Steuern) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse'));

-- ---------------------------------------------------------------------
-- 1. Teilzahlungen
-- ---------------------------------------------------------------------
create table if not exists public.fin_teilzahlungen (
  id          uuid primary key default gen_random_uuid(),
  art         text not null,
  ziel_id     uuid not null,
  datum       date not null,
  betrag      numeric(14,2) not null,
  buchung_id  uuid not null references public.fin_buchungen (id),
  umsatz_id   uuid references public.fin_bankumsaetze (id) on delete set null,
  storniert   boolean not null default false,
  erstellt_am timestamptz not null default now(),
  constraint fin_tz_art check (art in ('rechnung', 'beleg')),
  constraint fin_tz_betrag check (betrag > 0)
);
create index if not exists fin_teilzahlungen_ziel on public.fin_teilzahlungen (art, ziel_id) where not storniert;
create unique index if not exists fin_teilzahlungen_buchung on public.fin_teilzahlungen (buchung_id);
alter table public.fin_teilzahlungen enable row level security;
drop policy if exists "Finance-Teilzahlungen lesen" on public.fin_teilzahlungen;
create policy "Finance-Teilzahlungen lesen" on public.fin_teilzahlungen for select to authenticated using (
  (art = 'rechnung' and public.darf('finance.rechnungen', 'lesen')) or (art = 'beleg' and public.darf('finance.belege', 'lesen'))
  or public.darf('finance.bank', 'lesen'));
revoke all on public.fin_teilzahlungen from anon, authenticated;
grant select on public.fin_teilzahlungen to authenticated;

create or replace function public.fin_teilbezahlt(p_art text, p_ziel uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(t.betrag), 0) from public.fin_teilzahlungen t where t.art = p_art and t.ziel_id = p_ziel and not t.storniert;
$$;
revoke all on function public.fin_teilbezahlt(text, uuid) from public, anon, authenticated;

-- Bank → Rechnung: bis zum offenen Rest; ist er erreicht, gilt die Rechnung als bezahlt.
create or replace function public.fin_bank_zu_rechnung(p_umsatz uuid, p_rechnung uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  rest numeric;
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag <= 0 then raise exception 'Eine Rechnung wird mit einem Zahlungseingang ausgeglichen, nicht mit einer Abbuchung.'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Die Rechnung ist in Finance nicht gebucht.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon als bezahlt erfasst.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  rest := r.brutto - public.fin_teilbezahlt('rechnung', p_rechnung);
  if (h.u).betrag > rest then
    raise exception 'Betrag zu hoch: offen sind noch % €, der Zahlungseingang ist % €.', rest, (h.u).betrag;
  end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left(case when (h.u).betrag < rest then 'Teilzahlung ' else 'Zahlungseingang ' end || r.nummer_text, 200), r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', h.sachkonto, (h.u).betrag), (neu, 1, 'H', public.fin_rechnung_konto((h.e).kontenrahmen, 'forderung'), (h.u).betrag);
  insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id, umsatz_id)
  values ('rechnung', p_rechnung, (h.u).datum, (h.u).betrag, neu, p_umsatz);
  if (h.u).betrag = rest then
    update public.fin_rechnungen set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu, aktualisiert_am = now()
     where rechnung_id = p_rechnung;
  end if;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'rechnung', zuordnung_id = p_rechnung, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n, 'rest', rest - (h.u).betrag);
end;
$$;

create or replace function public.fin_bank_zu_beleg(p_umsatz uuid, p_beleg uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  b public.fin_belege%rowtype;
  rest numeric; betrag numeric;
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag >= 0 then raise exception 'Ein Beleg wird mit einer Abbuchung bezahlt, nicht mit einem Zahlungseingang.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Der Beleg ist nicht gebucht.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  betrag := -(h.u).betrag;
  rest := b.brutto - public.fin_teilbezahlt('beleg', p_beleg);
  if betrag > rest then raise exception 'Betrag zu hoch: offen sind noch % €, die Abbuchung ist % €.', rest, betrag; end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left(case when betrag < rest then 'Teilzahlung: ' else 'Überweisung: ' end || coalesce(nullif(b.belegnummer, ''), 'Beleg')
               || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', public.fin_rechnung_konto((h.e).kontenrahmen, 'verbindlichkeit'), betrag), (neu, 1, 'H', h.sachkonto, betrag);
  insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id, umsatz_id)
  values ('beleg', p_beleg, (h.u).datum, betrag, neu, p_umsatz);
  if betrag = rest then
    update public.fin_belege set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu where id = b.id;
  end if;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'beleg', zuordnung_id = p_beleg, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n, 'rest', rest - betrag);
end;
$$;

-- „Bar bezahlt“ / „Überweisung“ an der Rechnung: der offene Rest (bisher immer der ganze Betrag).
create or replace function public.fin_rechnung_bezahlt(p_rechnung uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  e public.fin_einstellungen%rowtype;
  geld integer;
  forderung integer;
  rest numeric;
  neu uuid;
  n integer;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Zahlungen erfassen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  if p_art is null or p_art not in ('bar', 'bank') then raise exception 'Bar oder Überweisung angeben.'; end if;
  if p_datum is null then raise exception 'Das Datum der Zahlung fehlt.'; end if;
  if p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Eine Zahlung in der Zukunft wird nicht erfasst.'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Erst die Rechnung buchen, dann die Zahlung.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon als bezahlt erfasst.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  if p_datum < r.datum then raise exception 'Die Zahlung liegt vor dem Rechnungsdatum.'; end if;
  rest := r.brutto - public.fin_teilbezahlt('rechnung', p_rechnung);
  if rest <= 0 then raise exception 'Zu dieser Rechnung ist nichts mehr offen.'; end if;
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  forderung := public.fin_rechnung_konto(e.kontenrahmen, 'forderung');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt ' else 'Zahlungseingang ' end || r.nummer_text
          || case when rest < r.brutto then ' (Rest)' else '' end, 200), r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', geld, rest), (neu, 1, 'H', forderung, rest);
  update public.fin_rechnungen set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

create or replace function public.fin_beleg_zahlung_schreiben(p_beleg uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  e public.fin_einstellungen%rowtype;
  geld integer; verb integer; neu uuid; n integer; rest numeric;
begin
  if p_art is null or p_art not in ('bar', 'bank') then raise exception 'Bar oder Überweisung angeben.'; end if;
  if p_datum is null then raise exception 'Das Datum der Zahlung fehlt.'; end if;
  if p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Eine Zahlung in der Zukunft wird nicht erfasst.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Erst den Beleg buchen, dann die Zahlung.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  rest := b.brutto - public.fin_teilbezahlt('beleg', p_beleg);
  if rest <= 0 then raise exception 'Zu diesem Beleg ist nichts mehr offen.'; end if;
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  verb := public.fin_rechnung_konto(e.kontenrahmen, 'verbindlichkeit');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt: ' else 'Überweisung: ' end ||
          coalesce(nullif(b.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), '')
          || case when rest < b.brutto then ' (Rest)' else '' end, 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', verb, rest), (neu, 1, 'H', geld, rest);
  update public.fin_belege set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu where id = b.id;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

create or replace function public.fin_beleg_stornieren(p_beleg uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  g jsonb;
begin
  if not public.darf('finance.belege', 'schreiben') then
    raise exception 'Belege stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Belege“ schreiben).';
  end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null then raise exception 'Diesen Beleg gibt es nicht.'; end if;
  if b.status <> 'gebucht' then raise exception 'Storniert wird nur ein gebuchter Beleg – einen Entwurf verwirft man.'; end if;
  if b.bezahlt_am is not null then raise exception 'Erst die Zahlung zurücknehmen, dann den Beleg stornieren.'; end if;
  if public.fin_teilbezahlt('beleg', p_beleg) > 0 then
    raise exception 'Zu diesem Beleg gibt es Teilzahlungen – erst unter Bank & Kasse die Zuordnungen aufheben.';
  end if;
  g := public.fin_gegenbuchung(b.buchung_id, p_grund, null, null);
  update public.fin_belege set status = 'storniert', storno_buchung_id = (g ->> 'id')::uuid where id = b.id;
  return g;
end;
$$;

-- Wird eine Teilzahlung storniert (Aufheben im Bankabgleich, „Zahlung zurücknehmen“), ist sie raus. War der
-- Posten bezahlt, ist er wieder offen; eine Restzahlung von Hand (bar/Überweisung) wird dabei selbst zur
-- Teilzahlung, damit ihr Geld weiter zählt.
create or replace function public.fin_teilzahlung_nach_storno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  fr public.fin_rechnungen%rowtype;
  b public.fin_belege%rowtype;
  rest_betrag numeric;
begin
  if new.storniert_durch is null or old.storniert_durch is not null then return null; end if;
  for t in update public.fin_teilzahlungen set storniert = true where buchung_id = new.id and not storniert returning art, ziel_id loop
    if t.art = 'rechnung' then
      select * into fr from public.fin_rechnungen where rechnung_id = t.ziel_id for update;
      if fr.bezahlt_am is not null then
        if fr.zahlung_buchung_id is not null and fr.zahlung_buchung_id <> new.id
           and not exists (select 1 from public.fin_teilzahlungen x where x.buchung_id = fr.zahlung_buchung_id) then
          select z.betrag into rest_betrag from public.fin_buchungszeilen z where z.buchung_id = fr.zahlung_buchung_id and z.seite = 'S' limit 1;
          insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id) values ('rechnung', t.ziel_id, fr.bezahlt_am, rest_betrag, fr.zahlung_buchung_id);
        end if;
        update public.fin_rechnungen set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null, aktualisiert_am = now() where rechnung_id = t.ziel_id;
      end if;
    else
      select * into b from public.fin_belege where id = t.ziel_id for update;
      if b.bezahlt_am is not null then
        if b.zahlung_buchung_id is not null and b.zahlung_buchung_id <> new.id
           and not exists (select 1 from public.fin_teilzahlungen x where x.buchung_id = b.zahlung_buchung_id) then
          select z.betrag into rest_betrag from public.fin_buchungszeilen z where z.buchung_id = b.zahlung_buchung_id and z.seite = 'S' limit 1;
          insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id) values ('beleg', t.ziel_id, b.bezahlt_am, rest_betrag, b.zahlung_buchung_id);
        end if;
        update public.fin_belege set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null where id = t.ziel_id;
      end if;
    end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists fin_teilzahlung_nach_storno on public.fin_buchungen;
create trigger fin_teilzahlung_nach_storno after update of storniert_durch on public.fin_buchungen
  for each row execute function public.fin_teilzahlung_nach_storno();
revoke all on function public.fin_teilzahlung_nach_storno() from public, anon, authenticated;

-- Finance › Rechnungen (Migration 89) – jetzt mit dem schon bezahlten Teil je Rechnung.
create or replace function public.fin_rechnungen_stand(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.rechnungen', 'lesen') then
    raise exception 'Finance › Rechnungen ist für deine Rolle nicht freigeschaltet.';
  end if;
  return jsonb_build_object(
    'vorgaenge', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'order_number', o.order_number, 'datum', o.order_date, 'zeit', o.time, 'status', o.status,
               'kunde', coalesce(nullif(btrim(c.company), ''), nullif(btrim(c.name), ''), nullif(btrim(o.laufkunde_name), ''), 'ohne Kunde'),
               'kundennummer', c.kundennummer,
               'betrag', (select round(coalesce(sum(coalesce(a.endpreis_netto, a.quantity * a.net_price) * (1 + a.vat_rate / 100.0)), 0), 2)
                            from public.order_articles a where a.order_id = o.id and a.deleted_at is null))
               order by o.order_date, o.order_number)
        from public.orders o left join public.customers c on c.id = o.customer_id
       where o.rechnung_noetig and o.deleted_at is null and o.order_number > 0
         and o.rechnung_erstellt_am is null and o.status in ('offen', 'in_arbeit', 'erledigt')), '[]'::jsonb),
    'rechnungen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rechnung_id', r.id, 'nummer_text', r.nummer_text, 'datum', r.datum, 'brutto', r.brutto, 'order_id', r.order_id,
               'order_number', o.order_number,
               'kunde', coalesce(nullif(btrim(r.empfaenger ->> 'company'), ''), nullif(btrim(r.empfaenger ->> 'name'), ''), 'ohne Name'),
               'storniert', r.storniert_durch is not null,
               'storno_nummer', (select s.nummer_text from public.rechnungen s where s.id = r.storniert_durch),
               'status', coalesce(f.status, 'offen'), 'fehler', f.fehler, 'faellig_am', f.faellig_am,
               'bezahlt_am', f.bezahlt_am, 'bezahlt_art', f.bezahlt_art,
               'teilbezahlt', public.fin_teilbezahlt('rechnung', r.id),
               'buchung_nr', (select b.nr from public.fin_buchungen b where b.id = f.buchung_id))
               order by r.nummer desc)
        from public.rechnungen r
        left join public.orders o on o.id = r.order_id
        left join public.fin_rechnungen f on f.rechnung_id = r.id
       where r.art = 'rechnung' and r.nummer > 0 and extract(year from r.datum)::integer = p_jahr
         and (f.rechnung_id is not null or coalesce(o.rechnung_noetig, false))), '[]'::jsonb),
    'anderswo', coalesce((
      select jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'datum', o.order_date,
               'kunde', coalesce(nullif(btrim(c.company), ''), nullif(btrim(c.name), ''), nullif(btrim(o.laufkunde_name), ''), 'ohne Kunde'),
               'rechnung_nummer', o.rechnung_nummer) order by o.order_date desc)
        from public.orders o left join public.customers c on c.id = o.customer_id
       where o.rechnung_noetig and coalesce(o.rechnung_extern, false) and o.deleted_at is null and o.order_number > 0
         and extract(year from o.order_date)::integer = p_jahr), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Voranmeldung: Ist-Versteuerung anteilig je Zahlung, § 13b Abs. 2
-- ---------------------------------------------------------------------
-- Zahlungen einer Rechnung als Anteile am Bruttobetrag: jede Teilzahlung, dazu eine Restzahlung von Hand.
create or replace function public.fin_rechnung_zahlungsanteile(p_rechnung uuid)
returns table (datum date, anteil numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select x.id, x.brutto from public.rechnungen x where x.id = p_rechnung and x.brutto > 0),
       f as (select * from public.fin_rechnungen where rechnung_id = p_rechnung),
       t as (select z.datum, z.betrag, z.buchung_id from public.fin_teilzahlungen z where z.art = 'rechnung' and z.ziel_id = p_rechnung and not z.storniert)
  select t.datum, t.betrag / r.brutto from t, r
  union all
  select f.bezahlt_am, (r.brutto - coalesce((select sum(betrag) from t), 0)) / r.brutto
    from f, r
   where f.bezahlt_am is not null and not exists (select 1 from t where t.buchung_id = f.zahlung_buchung_id);
$$;
revoke all on function public.fin_rechnung_zahlungsanteile(uuid) from public, anon, authenticated;

create or replace function public.fin_ust_kennzahlen(p_von date, p_bis date, p_rahmen text, p_ist boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    -- Wirksames Datum und Anteil. Soll: Buchungsdatum, ganz. Ist: Rechnungen aus FSM je Zahlung anteilig; ihr
    -- Storno an seinem Tag mit dem Anteil, der bezahlt war (unbezahlt: zählen beide nie).
    select b.id, b.datum as wirksam, 1::numeric as faktor
      from public.fin_buchungen b where not p_ist or b.quelle <> 'rechnung'
    union all
    select b.id, a.datum, a.anteil
      from public.fin_buchungen b
      join public.fin_rechnungen r on r.buchung_id = b.id
      cross join lateral public.fin_rechnung_zahlungsanteile(r.rechnung_id) a
     where p_ist and b.quelle = 'rechnung' and b.storno_von is null
    union all
    select b.id, b.datum, s.anteil
      from public.fin_buchungen b
      join public.fin_rechnungen r on r.storno_buchung_id = b.id
      cross join lateral (select sum(a.anteil) as anteil from public.fin_rechnung_zahlungsanteile(r.rechnung_id) a) s
     where p_ist and b.quelle = 'rechnung' and b.storno_von is not null and coalesce(s.anteil, 0) > 0
  ), bw as (
    select id, wirksam, sum(faktor) as faktor from b where wirksam between p_von and p_bis group by id, wirksam
  ), posten as (
    select z.buchung_id, z.posten, z.steuerschluessel as schl, s.art, bw.wirksam,
           coalesce(sum(case when not z.ist_steuer and (k.kategorie = 'erloes' or (s.art <> 'ohne' and k.kategorie in ('aufwand', 'anlage')))
                             then case z.seite when 'H' then z.betrag else -z.betrag end end), 0) * max(bw.faktor) as erfolg_h,
           coalesce(sum(case when z.ist_steuer and z.konto = s.ust_konto then case z.seite when 'H' then z.betrag else -z.betrag end end), 0) * max(bw.faktor) as ust,
           coalesce(sum(case when z.ist_steuer and z.konto = s.vst_konto then case z.seite when 'S' then z.betrag else -z.betrag end end), 0) * max(bw.faktor) as vst
      from public.fin_buchungszeilen z
      join bw on bw.id = z.buchung_id
      join public.fin_steuerschluessel s on s.kontenrahmen = p_rahmen and s.schluessel = z.steuerschluessel
      left join public.fin_konten k on k.kontenrahmen = p_rahmen and k.nummer = z.konto
     where z.steuerschluessel is not null
     group by z.buchung_id, z.posten, z.steuerschluessel, s.art, bw.wirksam
  ), kz as (
    select case schl when 'ust19' then '81' when 'ust7' then '86' when 'igl' then '41' when 'frei' then '48' end as kz,
           erfolg_h as b, case when art = 'ust' then ust else 0 end as s
      from posten where art in ('ust', 'ohne') and schl in ('ust19', 'ust7', 'igl', 'frei')
    union all
    select '66', 0, vst from posten where art = 'vst'
    -- § 13b und ig. Erwerb: Aufwand im Soll (netto, beim Kleinunternehmer brutto) – zurück auf netto.
    union all
    select case when schl = 'r13b2_19' then '84' when art = 'r13b' then '46' else '89' end, -erfolg_h - ust + vst, ust from posten where art in ('r13b', 'ige')
    union all
    select case art when 'r13b' then '67' else '61' end, 0, vst from posten where art in ('r13b', 'ige') and vst <> 0
  )
  select coalesce(jsonb_object_agg(kz, case when kz in ('66', '61', '67') then jsonb_build_object('s', s)
                                            when kz in ('41', '48') then jsonb_build_object('b', b)
                                            else jsonb_build_object('b', b, 's', s) end), '{}'::jsonb)
    from (select kz, round(sum(b), 2) as b, round(sum(s), 2) as s from kz where kz is not null group by kz
          having round(sum(b), 2) <> 0 or round(sum(s), 2) <> 0) x;
$$;
revoke all on function public.fin_ust_kennzahlen(date, date, text, boolean) from public, anon, authenticated;

insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr03', 3120, 'Bauleistungen u. a. nach § 13b Abs. 2 19 %', 'aufwand'),
  ('skr04', 5920, 'Bauleistungen u. a. nach § 13b Abs. 2 19 %', 'aufwand'),
  ('skr03', 2700, 'Sonstige Erträge (z. B. Kassenüberschuss)', 'erloes'),
  ('skr04', 4830, 'Sonstige betriebliche Erträge (z. B. Kassenüberschuss)', 'erloes')
on conflict (kontenrahmen, nummer) do nothing;

insert into public.fin_steuerschluessel (kontenrahmen, schluessel, bezeichnung, satz, art, ust_konto, vst_konto) values
  ('skr03', 'r13b2_19', '§ 13b Abs. 2 (z. B. Bauleistungen, Gebäudereinigung) – Steuer schuldet der Empfänger, 19 %', 19, 'r13b', 1787, 1577),
  ('skr04', 'r13b2_19', '§ 13b Abs. 2 (z. B. Bauleistungen, Gebäudereinigung) – Steuer schuldet der Empfänger, 19 %', 19, 'r13b', 3837, 1407)
on conflict (kontenrahmen, schluessel) do nothing;
update public.fin_steuerschluessel set bezeichnung = '§ 13b Abs. 1 – Leistung aus dem EU-Ausland, Steuer schuldet der Empfänger, 19 %'
 where schluessel = 'r13b19' and bezeichnung = '§ 13b – Steuer schuldet der Empfänger, 19 %';

-- ---------------------------------------------------------------------
-- 3. Kassensturz
-- ---------------------------------------------------------------------
create table if not exists public.fin_kassenstuerze (
  id           uuid primary key default gen_random_uuid(),
  datum        date not null,
  gezaehlt     numeric(14,2) not null,
  buchbestand  numeric(14,2) not null,
  differenz    numeric(14,2) not null,
  notiz        text,
  buchung_id   uuid references public.fin_buchungen (id),
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_ks_gezaehlt check (gezaehlt >= 0)
);
alter table public.fin_kassenstuerze enable row level security;
drop policy if exists "Finance-Kassenstürze lesen" on public.fin_kassenstuerze;
create policy "Finance-Kassenstürze lesen" on public.fin_kassenstuerze for select to authenticated using (public.darf('finance.bank', 'lesen'));
revoke all on public.fin_kassenstuerze from anon, authenticated;
grant select on public.fin_kassenstuerze to authenticated;

create or replace function public.fin_kassensturz(p_datum date, p_gezaehlt numeric, p_notiz text, p_ausgleichen boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  kasse integer; gegen integer;
  bestand numeric; diff numeric;
  neu uuid; n integer;
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Den Kassensturz festhalten ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  if p_datum is null or p_datum > heute then raise exception 'Der Kassensturz braucht ein Datum, nicht in der Zukunft.'; end if;
  if p_gezaehlt is null or p_gezaehlt < 0 then raise exception 'Den gezählten Bestand eintragen (0 € oder mehr).'; end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = extract(year from p_datum)::integer;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen noch nicht gespeichert.', extract(year from p_datum)::integer; end if;
  kasse := public.fin_rechnung_konto(e.kontenrahmen, 'kasse');
  select coalesce(sum(case z.seite when 'S' then z.betrag else -z.betrag end), 0) into bestand
    from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
   where z.konto = kasse and b.datum <= p_datum;
  diff := round(p_gezaehlt, 2) - bestand;
  if p_ausgleichen and diff <> 0 then
    e := public.fin_buchbar(p_datum);
    gegen := case when diff < 0 then case e.kontenrahmen when 'skr03' then 4900 else 6300 end
                  else case e.kontenrahmen when 'skr03' then 2700 else 4830 end end;
    if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = gegen and k.aktiv) then
      raise exception 'Das Konto % ist ausgeblendet.', gegen;
    end if;
    n := public.fin_naechste_nr(e.wirtschaftsjahr);
    insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle)
    values (e.wirtschaftsjahr, n, p_datum, case when diff < 0 then 'Kassenfehlbetrag (Kassensturz)' else 'Kassenüberschuss (Kassensturz)' end, null, 'kasse')
    returning id into neu;
    insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
      (neu, 1, 'S', case when diff < 0 then gegen else kasse end, abs(diff)),
      (neu, 1, 'H', case when diff < 0 then kasse else gegen end, abs(diff));
  end if;
  insert into public.fin_kassenstuerze (datum, gezaehlt, buchbestand, differenz, notiz, buchung_id)
  values (p_datum, round(p_gezaehlt, 2), bestand, diff, left(nullif(btrim(coalesce(p_notiz, '')), ''), 200), neu);
  return jsonb_build_object('buchbestand', bestand, 'differenz', diff, 'nr', n);
end;
$$;
revoke all on function public.fin_kassensturz(date, numeric, text, boolean) from public, anon;
grant execute on function public.fin_kassensturz(date, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Erinnerung an die Voranmeldung (nur der Versand mit Dienstschlüssel liest und schreibt)
-- ---------------------------------------------------------------------
create table if not exists public.fin_steuer_erinnerungen (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  jahr        integer not null,
  zeitraum    text not null,
  stufe       text not null,
  gesendet_am timestamptz not null default now(),
  primary key (profile_id, jahr, zeitraum, stufe),
  constraint fin_se_stufe check (stufe in ('bald', 'heute'))
);
alter table public.fin_steuer_erinnerungen enable row level security;
comment on table public.fin_steuer_erinnerungen is
  'Migration 93: Welche Erinnerung an eine Voranmeldungsfrist (3 Tage vorher, am Tag) schon an wen ging – einmal je Zeitraum und Stufe.';

-- ---------------------------------------------------------------------
-- 5. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabellen' as pruefung,
       (select string_agg(t, ', ') from unnest(array['fin_teilzahlungen', 'fin_kassenstuerze', 'fin_steuer_erinnerungen']) t
         where to_regclass('public.' || t) is not null) as ergebnis
union all
select 'Funktionen', (select count(*)::text || ' von 11' from unnest(array['fin_teilbezahlt(text,uuid)', 'fin_bank_zu_rechnung(uuid,uuid)',
         'fin_bank_zu_beleg(uuid,uuid)', 'fin_rechnung_bezahlt(uuid,text,date)', 'fin_beleg_zahlung_schreiben(uuid,text,date)',
         'fin_beleg_stornieren(uuid,text)', 'fin_teilzahlung_nach_storno()', 'fin_rechnungen_stand(integer)',
         'fin_rechnung_zahlungsanteile(uuid)', 'fin_ust_kennzahlen(date,date,text,boolean)',
         'fin_kassensturz(date,numeric,text,boolean)']) x where to_regprocedure('public.' || x) is not null)
union all
select 'Schlüssel § 13b Abs. 2, neue Konten', (select count(*)::text from public.fin_steuerschluessel where schluessel = 'r13b2_19') || ' Schlüssel, '
       || (select count(*)::text from public.fin_konten where (kontenrahmen, nummer) in (('skr03', 3120), ('skr04', 5920), ('skr03', 2700), ('skr04', 4830))) || ' Konten'
union all
select 'Richtlinien', (select count(*)::text || ' (erwartet 2)' from pg_policies
         where schemaname = 'public' and tablename in ('fin_teilzahlungen', 'fin_kassenstuerze'));

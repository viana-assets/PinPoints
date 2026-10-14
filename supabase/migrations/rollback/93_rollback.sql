-- =====================================================================
-- Rücknahme Migration 93 – Finance: Teilzahlungen, Kassensturz, § 13b Abs. 2, Fristerinnerung wieder entfernen.
--
-- ACHTUNG: Löscht die Liste der Teilzahlungen und Kassenstürze. Die Buchungen bleiben im Journal (es wird nie
-- gelöscht); Rechnungen und Belege mit Teilzahlungen stehen danach wieder voll offen. Die Funktionen werden die
-- Fassungen aus 89–92. Die neuen Konten und der Schlüssel `r13b2_19` gehen nur, wenn nichts darauf gebucht ist;
-- die Quelle `kasse` bleibt erlaubt, wenn es Buchungen damit gibt. Vorher ggf. „Alle Daten sichern“.
-- Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists fin_teilzahlung_nach_storno on public.fin_buchungen;
drop function if exists public.fin_teilzahlung_nach_storno();
drop function if exists public.fin_kassensturz(date, numeric, text, boolean);
drop table if exists public.fin_kassenstuerze;
drop table if exists public.fin_steuer_erinnerungen;

-- wie Migration 91
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
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag <= 0 then raise exception 'Eine Rechnung wird mit einem Zahlungseingang ausgeglichen, nicht mit einer Abbuchung.'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Die Rechnung ist in Finance nicht gebucht.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon als bezahlt erfasst.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  if r.brutto <> (h.u).betrag then
    raise exception 'Betrag passt nicht: Rechnung % €, Zahlung % € – Teilzahlungen kommen später.', r.brutto, (h.u).betrag;
  end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum, left('Zahlungseingang ' || r.nummer_text, 200), r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', h.sachkonto, r.brutto), (neu, 1, 'H', public.fin_rechnung_konto((h.e).kontenrahmen, 'forderung'), r.brutto);
  update public.fin_rechnungen set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'rechnung', zuordnung_id = p_rechnung, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;

-- wie Migration 91
create or replace function public.fin_bank_zu_beleg(p_umsatz uuid, p_beleg uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  b public.fin_belege%rowtype;
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag >= 0 then raise exception 'Ein Beleg wird mit einer Abbuchung bezahlt, nicht mit einem Zahlungseingang.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Der Beleg ist nicht gebucht.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  if b.brutto <> -(h.u).betrag then
    raise exception 'Betrag passt nicht: Beleg % €, Abbuchung % € – Teilzahlungen kommen später.', b.brutto, -(h.u).betrag;
  end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left('Überweisung: ' || coalesce(nullif(b.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', public.fin_rechnung_konto((h.e).kontenrahmen, 'verbindlichkeit'), b.brutto), (neu, 1, 'H', h.sachkonto, b.brutto);
  update public.fin_belege set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu where id = b.id;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'beleg', zuordnung_id = p_beleg, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;

-- wie Migration 89
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
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  forderung := public.fin_rechnung_konto(e.kontenrahmen, 'forderung');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt ' else 'Zahlungseingang ' end || r.nummer_text, 200),
          r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', geld, r.brutto), (neu, 1, 'H', forderung, r.brutto);
  update public.fin_rechnungen set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

-- wie Migration 89
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

-- wie Migration 90
create or replace function public.fin_beleg_zahlung_schreiben(p_beleg uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  e public.fin_einstellungen%rowtype;
  geld integer; verb integer; neu uuid; n integer;
begin
  if p_art is null or p_art not in ('bar', 'bank') then raise exception 'Bar oder Überweisung angeben.'; end if;
  if p_datum is null then raise exception 'Das Datum der Zahlung fehlt.'; end if;
  if p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Eine Zahlung in der Zukunft wird nicht erfasst.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Erst den Beleg buchen, dann die Zahlung.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  verb := public.fin_rechnung_konto(e.kontenrahmen, 'verbindlichkeit');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt: ' else 'Überweisung: ' end ||
          coalesce(nullif(b.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', verb, b.brutto), (neu, 1, 'H', geld, b.brutto);
  update public.fin_belege set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu where id = b.id;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

-- wie Migration 90
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
  g := public.fin_gegenbuchung(b.buchung_id, p_grund, null, null);
  update public.fin_belege set status = 'storniert', storno_buchung_id = (g ->> 'id')::uuid where id = b.id;
  return g;
end;
$$;

-- wie Migration 92
create or replace function public.fin_ust_kennzahlen(p_von date, p_bis date, p_rahmen text, p_ist boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    -- Wirksames Datum: Soll = Buchungsdatum. Ist = Rechnungen aus FSM im Monat der Zahlung; ihr Storno zählt
    -- an seinem Tag nur, wenn die Rechnung bezahlt war (sonst zählten beide nie).
    select b.id,
           case
             when not p_ist or b.quelle <> 'rechnung' then b.datum
             when b.storno_von is null then (select r.bezahlt_am from public.fin_rechnungen r where r.buchung_id = b.id)
             else (select case when r.bezahlt_am is not null then greatest(b.datum, r.bezahlt_am) end
                     from public.fin_rechnungen r where r.storno_buchung_id = b.id)
           end as wirksam
      from public.fin_buchungen b
  ), posten as (
    select z.buchung_id, z.posten, z.steuerschluessel as schl, s.art,
           -- Erlös-/Aufwands-/Anlagekonto: Haben minus Soll. Bei „ohne“-Schlüsseln nur Erlöskonten (ein steuerfreier
           -- Einkauf gehört nicht in die Voranmeldung).
           coalesce(sum(case when not z.ist_steuer and (k.kategorie = 'erloes' or (s.art <> 'ohne' and k.kategorie in ('aufwand', 'anlage')))
                             then case z.seite when 'H' then z.betrag else -z.betrag end end), 0) as erfolg_h,
           coalesce(sum(case when z.ist_steuer and z.konto = s.ust_konto then case z.seite when 'H' then z.betrag else -z.betrag end end), 0) as ust,
           coalesce(sum(case when z.ist_steuer and z.konto = s.vst_konto then case z.seite when 'S' then z.betrag else -z.betrag end end), 0) as vst
      from public.fin_buchungszeilen z
      join b on b.id = z.buchung_id and b.wirksam between p_von and p_bis
      join public.fin_steuerschluessel s on s.kontenrahmen = p_rahmen and s.schluessel = z.steuerschluessel
      left join public.fin_konten k on k.kontenrahmen = p_rahmen and k.nummer = z.konto
     where z.steuerschluessel is not null
     group by z.buchung_id, z.posten, z.steuerschluessel, s.art
  ), kz as (
    select case schl when 'ust19' then '81' when 'ust7' then '86' when 'igl' then '41' when 'frei' then '48' end as kz,
           erfolg_h as b, case when art = 'ust' then ust else 0 end as s
      from posten where art in ('ust', 'ohne') and schl in ('ust19', 'ust7', 'igl', 'frei')
    union all
    select '66', 0, vst from posten where art = 'vst'
    -- § 13b und ig. Erwerb: Aufwand im Soll (netto, beim Kleinunternehmer brutto) – zurück auf netto.
    union all
    select case art when 'r13b' then '46' else '89' end, -erfolg_h - ust + vst, ust from posten where art in ('r13b', 'ige')
    union all
    select case art when 'r13b' then '67' else '61' end, 0, vst from posten where art in ('r13b', 'ige') and vst <> 0
  )
  select coalesce(jsonb_object_agg(kz, case when kz in ('66', '61', '67') then jsonb_build_object('s', s)
                                            when kz in ('41', '48') then jsonb_build_object('b', b)
                                            else jsonb_build_object('b', b, 's', s) end), '{}'::jsonb)
    from (select kz, sum(b) as b, sum(s) as s from kz where kz is not null group by kz having sum(b) <> 0 or sum(s) <> 0) x;
$$;

drop function if exists public.fin_rechnung_zahlungsanteile(uuid);
drop table if exists public.fin_teilzahlungen;
drop function if exists public.fin_teilbezahlt(text, uuid);

revoke all on function public.fin_ust_kennzahlen(date, date, text, boolean) from public, anon, authenticated;

delete from public.fin_steuerschluessel s where s.schluessel = 'r13b2_19'
   and not exists (select 1 from public.fin_buchungszeilen z where z.steuerschluessel = 'r13b2_19');
update public.fin_steuerschluessel set bezeichnung = '§ 13b – Steuer schuldet der Empfänger, 19 %'
 where schluessel = 'r13b19' and bezeichnung = '§ 13b Abs. 1 – Leistung aus dem EU-Ausland, Steuer schuldet der Empfänger, 19 %';
delete from public.fin_konten k where (k.kontenrahmen, k.nummer) in (('skr03', 3120), ('skr04', 5920), ('skr03', 2700), ('skr04', 4830))
   and not exists (select 1 from public.fin_buchungszeilen z where z.konto = k.nummer);

do $$
begin
  if not exists (select 1 from public.fin_buchungen where quelle = 'kasse') then
    alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
    alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank'));
  end if;
end $$;

select 'Rücknahme 93' as pruefung,
       case when to_regclass('public.fin_teilzahlungen') is null and to_regclass('public.fin_kassenstuerze') is null
            and to_regprocedure('public.fin_kassensturz(date,numeric,text,boolean)') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;

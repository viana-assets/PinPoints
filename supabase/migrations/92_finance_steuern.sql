-- =====================================================================
-- Migration 92 – Finance, Phase F5: Umsatzsteuer-Voranmeldung als Probelauf (14.10.2026, v150).
--
-- docs/finance.md Abschnitt 4.6, schlank:
--
--   1. KENNZAHLEN je Zeitraum aus dem Journal (`fin_ust_kennzahlen()`, nur intern): jede Buchungszeile mit
--      Steuerschlüssel, gruppiert je Posten – Bemessungsgrundlage aus dem Erlös-/Aufwandskonto, Steuer aus dem
--      Steuerkonto. Kz 81/86 (USt 19/7), 41 (ig. Lieferung), 48 (steuerfrei), 89/61 (ig. Erwerb), 46/47/67
--      (§ 13b), 66 (Vorsteuer). Ist-Versteuerung: Rechnungen aus FSM zählen im Monat der Zahlung.
--   2. STAND je Jahr `fin_ust_stand(jahr)`: Zeiträume nach den Einstellungen (Monat, Quartal oder nur das
--      Jahr), Kennzahlen, abgegebene Fassungen, Umsatz des Jahres (Kleinunternehmer-Grenze).
--   3. ABGABE FESTHALTEN `fin_ust_abgegeben()`: legt eine Fassung mit den Kennzahlen dieses Augenblicks ab
--      (`fin_voranmeldungen`); eine Berichtigung ist die nächste Fassung. Gelöscht wird nichts.
--   4. JE JAHR `fin_steuer_jahre`: Umsatz des Vorjahres (für § 19) und festgesetzte Sondervorauszahlung
--      (Kz 39 in der Dezember-Voranmeldung bei Dauerfrist).
--
-- Übermittelt wird NICHT aus der App (ELSTER oder Steuerberater). PILOT wie alles in Finance. Reihenfolge:
-- nach 91, SQL zuerst, dann v150. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_bankumsaetze') is null then
    raise exception 'Zuerst Migration 91 (Finance: Bank) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Je Jahr: Vorjahresumsatz, Sondervorauszahlung
-- ---------------------------------------------------------------------
create table if not exists public.fin_steuer_jahre (
  jahr                integer primary key,
  umsatz_vorjahr      numeric(14,2),
  sondervorauszahlung numeric(14,2),
  aktualisiert_am     timestamptz not null default now(),
  aktualisiert_von    uuid default auth.uid(),
  constraint fin_sj_jahr check (jahr between 2000 and 2100),
  constraint fin_sj_umsatz check (umsatz_vorjahr is null or umsatz_vorjahr >= 0),
  constraint fin_sj_svz check (sondervorauszahlung is null or sondervorauszahlung >= 0)
);
alter table public.fin_steuer_jahre enable row level security;
drop policy if exists "Finance-Steuerjahre lesen" on public.fin_steuer_jahre;
create policy "Finance-Steuerjahre lesen" on public.fin_steuer_jahre for select to authenticated using (public.darf('finance.steuer', 'lesen'));
drop policy if exists "Finance-Steuerjahre anlegen" on public.fin_steuer_jahre;
create policy "Finance-Steuerjahre anlegen" on public.fin_steuer_jahre for insert to authenticated with check (public.darf('finance.steuer', 'schreiben'));
drop policy if exists "Finance-Steuerjahre ändern" on public.fin_steuer_jahre;
create policy "Finance-Steuerjahre ändern" on public.fin_steuer_jahre for update to authenticated
  using (public.darf('finance.steuer', 'schreiben')) with check (public.darf('finance.steuer', 'schreiben'));
revoke all on public.fin_steuer_jahre from anon, authenticated;
grant select on public.fin_steuer_jahre to authenticated;
grant insert (jahr, umsatz_vorjahr, sondervorauszahlung) on public.fin_steuer_jahre to authenticated;
-- `jahr` auch: Das Upsert von PostgREST setzt beim Konflikt alle mitgeschickten Spalten (lib/api/finance.ts).
grant update (jahr, umsatz_vorjahr, sondervorauszahlung) on public.fin_steuer_jahre to authenticated;

create or replace function public.fin_steuer_jahre_stempel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aktualisiert_am := now();
  new.aktualisiert_von := auth.uid();
  return new;
end;
$$;
drop trigger if exists fin_steuer_jahre_stempel on public.fin_steuer_jahre;
create trigger fin_steuer_jahre_stempel before insert or update on public.fin_steuer_jahre
  for each row execute function public.fin_steuer_jahre_stempel();

-- ---------------------------------------------------------------------
-- 2. Abgegebene Voranmeldungen (Fassungen)
-- ---------------------------------------------------------------------
create table if not exists public.fin_voranmeldungen (
  id           uuid primary key default gen_random_uuid(),
  jahr         integer not null,
  zeitraum     text not null,
  fassung      integer not null,
  von          date not null,
  bis          date not null,
  abgegeben_am date not null,
  kennzahlen   jsonb not null,
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_va_zeitraum check (zeitraum ~ '^(M(0[1-9]|1[0-2])|Q[1-4]|J)$'),
  constraint fin_va_fassung check (fassung >= 1),
  unique (jahr, zeitraum, fassung)
);
alter table public.fin_voranmeldungen enable row level security;
drop policy if exists "Finance-Voranmeldungen lesen" on public.fin_voranmeldungen;
create policy "Finance-Voranmeldungen lesen" on public.fin_voranmeldungen for select to authenticated using (public.darf('finance.steuer', 'lesen'));
revoke all on public.fin_voranmeldungen from anon, authenticated;
grant select on public.fin_voranmeldungen to authenticated;

-- ---------------------------------------------------------------------
-- 3. Kennzahlen eines Zeitraums (intern)
-- ---------------------------------------------------------------------
-- Ergebnis: {"81": {"b": 100.00, "s": 19.00}, "66": {"s": 9.50}, …} – b = Bemessungsgrundlage, s = Steuer, in
-- Cent genau wie gebucht. Volle Euro und die Steuer „laut Formular“ rechnet lib/finance/steuern.ts.
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
revoke all on function public.fin_ust_kennzahlen(date, date, text, boolean) from public, anon, authenticated;

-- Zeiträume eines Jahres nach der Voranmeldung: monat → M01…M12, quartal → Q1…Q4, keine → J.
create or replace function public.fin_ust_zeitraeume(p_jahr integer, p_art text)
returns table (zeitraum text, von date, bis date)
language sql
immutable
set search_path = ''
as $$
  select case p_art when 'monat' then 'M' || lpad(g::text, 2, '0') when 'quartal' then 'Q' || g::text else 'J' end,
         make_date(p_jahr, case p_art when 'monat' then g when 'quartal' then 3 * g - 2 else 1 end, 1),
         (make_date(p_jahr, case p_art when 'monat' then g when 'quartal' then 3 * g - 2 else 1 end, 1)
           + case p_art when 'monat' then interval '1 month' when 'quartal' then interval '3 months' else interval '1 year' end
           - interval '1 day')::date
    from generate_series(1, case p_art when 'monat' then 12 when 'quartal' then 4 else 1 end) g;
$$;
revoke all on function public.fin_ust_zeitraeume(integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Stand eines Jahres
-- ---------------------------------------------------------------------
create or replace function public.fin_ust_stand(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  sj public.fin_steuer_jahre%rowtype;
  zr jsonb;
begin
  if not public.darf('finance.steuer', 'lesen') then
    raise exception 'Steuern sind für deine Rolle nicht freigeschaltet (Recht „Finance › Steuern“).';
  end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then
    return jsonb_build_object('eingerichtet', false);
  end if;
  select * into sj from public.fin_steuer_jahre where jahr = p_jahr;
  select coalesce(jsonb_agg(jsonb_build_object(
           'zeitraum', z.zeitraum, 'von', z.von, 'bis', z.bis,
           'kennzahlen', public.fin_ust_kennzahlen(z.von, z.bis, e.kontenrahmen, e.versteuerung = 'ist'),
           'abgaben', coalesce((select jsonb_agg(jsonb_build_object('fassung', v.fassung, 'abgegeben_am', v.abgegeben_am,
                                  'kennzahlen', v.kennzahlen, 'notiz', v.notiz, 'erstellt_am', v.erstellt_am) order by v.fassung)
                                  from public.fin_voranmeldungen v where v.jahr = p_jahr and v.zeitraum = z.zeitraum), '[]'::jsonb)
         ) order by z.von), '[]'::jsonb)
    into zr
    from public.fin_ust_zeitraeume(p_jahr, e.voranmeldung) z;
  return jsonb_build_object(
    'eingerichtet', true,
    'umsatz_vorjahr', sj.umsatz_vorjahr,
    'sondervorauszahlung', sj.sondervorauszahlung,
    -- Gesamtumsatz für § 19: Erlöskonten, Haben minus Soll, nach Buchungsdatum.
    'umsatz_jahr', (select coalesce(sum(case z.seite when 'H' then z.betrag else -z.betrag end), 0)
                      from public.fin_buchungszeilen z
                      join public.fin_buchungen b on b.id = z.buchung_id and b.jahr = p_jahr
                      join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto and k.kategorie = 'erloes'
                     where not z.ist_steuer),
    'zeitraeume', zr);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Abgabe festhalten (nächste Fassung, Kennzahlen dieses Augenblicks)
-- ---------------------------------------------------------------------
create or replace function public.fin_ust_abgegeben(p_jahr integer, p_zeitraum text, p_am date, p_notiz text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  z record;
  kz jsonb;
  svz numeric;
  n integer;
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.darf('finance.steuer', 'schreiben') then
    raise exception 'Eine Voranmeldung festhalten ist für deine Rolle nicht freigeschaltet (Recht „Finance › Steuern“ schreiben).';
  end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen noch nicht gespeichert.', p_jahr; end if;
  select * into z from public.fin_ust_zeitraeume(p_jahr, e.voranmeldung) x where x.zeitraum = p_zeitraum;
  if z.zeitraum is null then raise exception 'Den Zeitraum % gibt es bei dieser Voranmeldung nicht.', p_zeitraum; end if;
  if p_am is null or p_am <= z.bis then raise exception 'Abgegeben wird nach dem Ende des Zeitraums (%).', to_char(z.bis, 'DD.MM.YYYY'); end if;
  if p_am > heute then raise exception 'Das Abgabedatum liegt in der Zukunft.'; end if;
  kz := public.fin_ust_kennzahlen(z.von, z.bis, e.kontenrahmen, e.versteuerung = 'ist');
  -- Kz 39: die festgesetzte Sondervorauszahlung wird in der letzten Voranmeldung des Jahres angerechnet.
  if e.voranmeldung = 'monat' and e.dauerfrist and p_zeitraum = 'M12' then
    select sondervorauszahlung into svz from public.fin_steuer_jahre where jahr = p_jahr;
    if coalesce(svz, 0) > 0 then kz := kz || jsonb_build_object('39', jsonb_build_object('s', svz)); end if;
  end if;
  perform 1 from public.fin_voranmeldungen where jahr = p_jahr and zeitraum = p_zeitraum for update;
  select coalesce(max(fassung), 0) + 1 into n from public.fin_voranmeldungen where jahr = p_jahr and zeitraum = p_zeitraum;
  insert into public.fin_voranmeldungen (jahr, zeitraum, fassung, von, bis, abgegeben_am, kennzahlen, notiz)
  values (p_jahr, p_zeitraum, n, z.von, z.bis, p_am, kz, left(nullif(btrim(coalesce(p_notiz, '')), ''), 200));
  return jsonb_build_object('fassung', n, 'kennzahlen', kz);
end;
$$;

revoke all on function public.fin_ust_stand(integer) from public, anon;
revoke all on function public.fin_ust_abgegeben(integer, text, date, text) from public, anon;
grant execute on function public.fin_ust_stand(integer) to authenticated;
grant execute on function public.fin_ust_abgegeben(integer, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabellen' as pruefung,
       (select string_agg(t, ', ') from unnest(array['fin_steuer_jahre', 'fin_voranmeldungen']) t
         where to_regclass('public.' || t) is not null) as ergebnis
union all
select 'Funktionen', (select string_agg(x, ', ') from unnest(array['fin_ust_kennzahlen(date,date,text,boolean)',
         'fin_ust_zeitraeume(integer,text)', 'fin_ust_stand(integer)', 'fin_ust_abgegeben(integer,text,date,text)']) x
         where to_regprocedure('public.' || x) is not null)
union all
select 'Richtlinien', (select count(*)::text || ' (erwartet 4)' from pg_policies
         where schemaname = 'public' and tablename in ('fin_steuer_jahre', 'fin_voranmeldungen'));

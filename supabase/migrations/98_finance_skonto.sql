-- =====================================================================
-- Migration 98 – Finance: Skonto (14.10.2026, v156).
--
-- Lücke vor dem Echtbetrieb (docs/finance.md „Noch nicht“):
--
--   1. SKONTO an Rechnung (gewährt) und Beleg (erhalten): `fin_skonto_buchen(art, id, datum, betrag)` bucht den Abzug
--      auf die Skontokonten und mindert die Umsatz- bzw. Vorsteuer anteilig wie in der ursprünglichen Buchung
--      (Rechnung: Gewährte Skonti 8736/8731/8730 bzw. 4736/4731/4730 an Forderung; Beleg: Verbindlichkeit an Erhaltene
--      Skonti 3736/3731/3730 bzw. 5736/5731/5730 – bei einer Anlage an das Anlagekonto selbst, die Anschaffungskosten
--      sinken). Höchstens 10 % des Bruttobetrags. Der Abzug zählt wie eine Teilzahlung (`fin_teilzahlungen.skonto`); ist
--      der Rest null, gilt der Posten als bezahlt („skonto“). Zurücknehmen: `fin_skonto_zuruecknehmen()` (Storno, der
--      Posten ist wieder offen). § 13b und ig. Erwerb: von Hand buchen.
--   2. Ist-Versteuerung: Eine Rechnung zählt nur mit dem, was wirklich gezahlt wurde (`fin_rechnung_zahlungsanteile`
--      ohne Skonto); die Skontobuchung einer Rechnung selbst zählt dann nicht (`fin_ust_kennzahlen`).
--
-- PILOT wie alles in Finance. Reihenfolge: nach 97, SQL zuerst, dann v156. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_exporte') is null then
    raise exception 'Zuerst Migration 97 (Finance: Export) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle
  check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse', 'afa', 'abgang', 'abschluss', 'vortrag', 'skonto'));
alter table public.fin_rechnungen drop constraint if exists fin_re_art;
alter table public.fin_rechnungen add constraint fin_re_art check (bezahlt_art is null or bezahlt_art in ('bar', 'bank', 'skonto'));
alter table public.fin_belege drop constraint if exists fin_beleg_art;
alter table public.fin_belege add constraint fin_beleg_art check (bezahlt_art is null or bezahlt_art in ('bar', 'bank', 'skonto'));
alter table public.fin_teilzahlungen add column if not exists skonto boolean not null default false;

insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr03', 8730, 'Gewährte Skonti', 'erloes'),
  ('skr03', 8731, 'Gewährte Skonti 7 % USt', 'erloes'),
  ('skr03', 8736, 'Gewährte Skonti 19 % USt', 'erloes'),
  ('skr03', 3730, 'Erhaltene Skonti', 'aufwand'),
  ('skr03', 3731, 'Erhaltene Skonti 7 % Vorsteuer', 'aufwand'),
  ('skr03', 3736, 'Erhaltene Skonti 19 % Vorsteuer', 'aufwand'),
  ('skr04', 4730, 'Gewährte Skonti', 'erloes'),
  ('skr04', 4731, 'Gewährte Skonti 7 % USt', 'erloes'),
  ('skr04', 4736, 'Gewährte Skonti 19 % USt', 'erloes'),
  ('skr04', 5730, 'Erhaltene Skonti', 'aufwand'),
  ('skr04', 5731, 'Erhaltene Skonti 7 % Vorsteuer', 'aufwand'),
  ('skr04', 5736, 'Erhaltene Skonti 19 % Vorsteuer', 'aufwand')
on conflict (kontenrahmen, nummer) do nothing;

-- Skontokonto je Kontenrahmen, Richtung und Steuerschlüssel (wie FIN_SKONTO_KONTEN in lib/finance/rechnungen.ts).
create or replace function public.fin_skonto_konto(p_rahmen text, p_art text, p_schl text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_rahmen
    when 'skr03' then case p_art when 'rechnung' then case p_schl when 'ust19' then 8736 when 'ust7' then 8731 else 8730 end
                                 else case p_schl when 'vst19' then 3736 when 'vst7' then 3731 else 3730 end end
    else case p_art when 'rechnung' then case p_schl when 'ust19' then 4736 when 'ust7' then 4731 else 4730 end
                    else case p_schl when 'vst19' then 5736 when 'vst7' then 5731 else 5730 end end
  end
$$;
revoke all on function public.fin_skonto_konto(text, text, text) from public, anon, authenticated;

-- Skonto buchen. Aufteilung wie die ursprüngliche Buchung: je Steuerschlüssel (bei Belegen außerdem je Anlagekonto)
-- der Anteil am Brutto; der Rundungsrest geht auf den letzten Teil.
create or replace function public.fin_skonto_buchen(p_art text, p_ziel uuid, p_datum date, p_betrag numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  bl public.fin_belege%rowtype;
  ursprung uuid; brutto numeric; rest numeric; bisher numeric; belegdatum date; nummer text;
  teile jsonb; v_posten jsonb := '[]'::jsonb; x jsonb; summe numeric; anteil numeric; verteilt numeric := 0; i integer := 0; n_teile integer;
  gegen integer; neu uuid; n integer;
begin
  if p_art is null or p_art not in ('rechnung', 'beleg') then raise exception 'Skonto gibt es an Rechnungen und Belegen.'; end if;
  if not public.darf(case p_art when 'rechnung' then 'finance.rechnungen' else 'finance.belege' end, 'schreiben') then
    raise exception 'Skonto buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › %“ schreiben).', case p_art when 'rechnung' then 'Rechnungen' else 'Belege' end;
  end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag <> round(p_betrag, 2) then raise exception 'Den Skontobetrag in Euro und Cent angeben (größer 0).'; end if;
  if p_datum is null or p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Datum fehlt oder liegt in der Zukunft.'; end if;
  if p_art = 'rechnung' then
    select * into fr from public.fin_rechnungen where rechnung_id = p_ziel for update;
    if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Die Rechnung ist in Finance nicht gebucht.'; end if;
    if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon bezahlt.'; end if;
    select * into r from public.rechnungen where id = p_ziel;
    if r.storniert_durch is not null then raise exception 'Die Rechnung ist storniert.'; end if;
    ursprung := fr.buchung_id; brutto := r.brutto; belegdatum := r.datum; nummer := r.nummer_text;
  else
    select * into bl from public.fin_belege where id = p_ziel for update;
    if bl.id is null or bl.status <> 'gebucht' then raise exception 'Der Beleg ist nicht gebucht.'; end if;
    if bl.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon bezahlt.'; end if;
    ursprung := bl.buchung_id; brutto := bl.brutto; belegdatum := bl.belegdatum;
    nummer := coalesce(nullif(bl.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = bl.lieferant_id), '');
  end if;
  if p_datum < belegdatum then raise exception 'Skonto gibt es nicht vor dem Datum der Rechnung bzw. des Belegs.'; end if;
  rest := brutto - public.fin_teilbezahlt(p_art, p_ziel);
  if p_betrag > rest then raise exception 'Der Skontobetrag (% €) ist höher als der offene Rest (% €).', p_betrag, rest; end if;
  select coalesce(sum(t.betrag), 0) into bisher from public.fin_teilzahlungen t where t.art = p_art and t.ziel_id = p_ziel and t.skonto and not t.storniert;
  if bisher + p_betrag > round(brutto * 0.10, 2) then
    raise exception 'Mehr als 10 %% des Bruttobetrags ist kein Skonto – einen Forderungsausfall oder Nachlass mit dem Steuerberater klären.';
  end if;
  e := public.fin_buchbar(p_datum);

  -- Teile der ursprünglichen Buchung: Brutto (Netto + Steuer) je Steuerschlüssel, bei Belegen je Anlagekonto getrennt.
  with z as (
    select z.posten, z.seite, z.konto, z.betrag, z.steuerschluessel as schl, z.ist_steuer, k.kategorie
      from public.fin_buchungszeilen z left join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto
     where z.buchung_id = ursprung
  ), basis as (
    select posten, schl, case when kategorie = 'anlage' then konto end as anlage,
           sum(case when (p_art = 'rechnung') = (seite = 'H') then betrag else -betrag end) as netto
      from z where not ist_steuer and kategorie in ('erloes', 'aufwand', 'anlage')
     group by posten, schl, case when kategorie = 'anlage' then konto end
  ), steuer as (
    select posten, schl, sum(case when (p_art = 'rechnung') = (seite = 'H') then betrag else -betrag end) as steuer
      from z where ist_steuer group by posten, schl
  )
  select jsonb_agg(jsonb_build_object('schl', t.schl, 'anlage', t.anlage, 'brutto', t.brutto) order by t.brutto, t.schl)
    into teile
    from (select b.schl, b.anlage, sum(b.netto + coalesce(s.steuer, 0)) as brutto
            from basis b left join steuer s on s.posten = b.posten and s.schl is not distinct from b.schl
           group by b.schl, b.anlage having sum(b.netto + coalesce(s.steuer, 0)) > 0) t;
  if teile is null then raise exception 'Die ursprüngliche Buchung lässt sich nicht aufteilen – Skonto bitte von Hand buchen.'; end if;
  if exists (select 1 from jsonb_array_elements(teile) y join public.fin_steuerschluessel s on s.kontenrahmen = e.kontenrahmen and s.schluessel = y ->> 'schl'
              where s.art in ('r13b', 'ige')) then
    raise exception 'Skonto bei § 13b oder innergemeinschaftlichem Erwerb bitte von Hand buchen (beide Steuern ändern sich).';
  end if;
  select sum((y ->> 'brutto')::numeric), count(*) into summe, n_teile from jsonb_array_elements(teile) y;
  for x in select value from jsonb_array_elements(teile) loop
    i := i + 1;
    anteil := case when i = n_teile then p_betrag - verteilt else round(p_betrag * (x ->> 'brutto')::numeric / summe, 2) end;
    verteilt := verteilt + anteil;
    if anteil <= 0 then continue; end if;
    gegen := coalesce((x ->> 'anlage')::integer, public.fin_skonto_konto(e.kontenrahmen, p_art, x ->> 'schl'));
    v_posten := v_posten || jsonb_build_array(case when p_art = 'rechnung'
      then jsonb_build_object('soll', gegen, 'haben', public.fin_rechnung_konto(e.kontenrahmen, 'forderung'), 'betrag', anteil,
                              'steuer', case when x ->> 'schl' in ('ust19', 'ust7') then x ->> 'schl' end)
      else jsonb_build_object('soll', public.fin_rechnung_konto(e.kontenrahmen, 'verbindlichkeit'), 'haben', gegen, 'betrag', anteil,
                              'steuer', case when x ->> 'schl' in ('vst19', 'vst7') then x ->> 'schl' end) end);
  end loop;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left('Skonto ' || nummer, 200), left(case p_art when 'rechnung' then r.nummer_text else bl.belegnummer end, 60), 'skonto', p_ziel)
  returning id into neu;
  perform public.fin_posten_schreiben(neu, e.kontenrahmen, e.besteuerung, e.r13b_empfaenger, e.innergemeinschaftlich, v_posten);
  insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id, skonto) values (p_art, p_ziel, p_datum, p_betrag, neu, true);
  if p_betrag = rest then
    if p_art = 'rechnung' then
      update public.fin_rechnungen set bezahlt_am = p_datum, bezahlt_art = 'skonto', zahlung_buchung_id = neu, aktualisiert_am = now() where rechnung_id = p_ziel;
    else
      update public.fin_belege set bezahlt_am = p_datum, bezahlt_art = 'skonto', zahlung_buchung_id = neu where id = p_ziel;
    end if;
  end if;
  return jsonb_build_object('id', neu, 'nr', n, 'rest', rest - p_betrag);
end;
$$;

-- Skonto zurücknehmen: Storno; fin_teilzahlung_nach_storno (Migration 93) macht den Posten wieder offen.
create or replace function public.fin_skonto_zuruecknehmen(p_buchung uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.fin_teilzahlungen%rowtype;
begin
  select * into t from public.fin_teilzahlungen where buchung_id = p_buchung and skonto and not storniert;
  if t.id is null then raise exception 'Diesen Skonto gibt es nicht (mehr).'; end if;
  if not public.darf(case t.art when 'rechnung' then 'finance.rechnungen' else 'finance.belege' end, 'schreiben') then
    raise exception 'Skonto zurücknehmen ist für deine Rolle nicht freigeschaltet.';
  end if;
  perform public.fin_gegenbuchung(p_buchung, p_grund, null, null);
end;
$$;

-- Die Skontoabzüge je Rechnung bzw. Beleg (für die Oberfläche).
create or replace function public.fin_skonti(p_art text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf(case p_art when 'rechnung' then 'finance.rechnungen' else 'finance.belege' end, 'lesen') then
    raise exception 'Nicht freigeschaltet.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('ziel_id', t.ziel_id, 'buchung_id', t.buchung_id, 'datum', t.datum, 'betrag', t.betrag,
                                                     'nr', (select b.nr from public.fin_buchungen b where b.id = t.buchung_id)) order by t.datum)
                     from public.fin_teilzahlungen t where t.art = p_art and t.skonto and not t.storniert), '[]'::jsonb);
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Ist-Versteuerung und Stornieren (Rücknahme stellt 93/96 wieder her)
-- ---------------------------------------------------------------------
create or replace function public.fin_rechnung_zahlungsanteile(p_rechnung uuid)
returns table (datum date, anteil numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- Seit Migration 98: Skonto ist keine Zahlung – gezählt wird nur, was eingegangen ist.
  with r as (select x.id, x.brutto from public.rechnungen x where x.id = p_rechnung and x.brutto > 0),
       f as (select * from public.fin_rechnungen where rechnung_id = p_rechnung),
       alle as (select z.datum, z.betrag, z.buchung_id, z.skonto from public.fin_teilzahlungen z where z.art = 'rechnung' and z.ziel_id = p_rechnung and not z.storniert),
       t as (select * from alle where not skonto)
  select t.datum, t.betrag / r.brutto from t, r
  union all
  select f.bezahlt_am, (r.brutto - coalesce((select sum(betrag) from alle), 0)) / r.brutto
    from f, r
   where f.bezahlt_am is not null and not exists (select 1 from alle where alle.buchung_id = f.zahlung_buchung_id);
$$;

-- Kennzahlen wie Migration 93, bei Ist ohne den Skonto einer Rechnung.
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
      from public.fin_buchungen b where not p_ist or (b.quelle <> 'rechnung'
        -- Seit Migration 98: Bei Ist zählt eine Rechnung nur mit dem Gezahlten – ihr Skonto (und dessen Storno) nicht extra.
        and not (b.quelle = 'skonto' and exists (select 1 from public.fin_teilzahlungen t where t.art = 'rechnung' and t.skonto
                                                    and t.buchung_id in (b.id, b.storno_von))))
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

-- Stornieren wie Migration 96; Skonto an Rechnung/Beleg.
create or replace function public.fin_stornieren(p_id uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  select quelle into q from public.fin_buchungen where id = p_id;
  if q = 'rechnung' then
    raise exception 'Diese Buchung kommt aus einer Rechnung – storniert wird die Rechnung (in FSM), dann storniert Finance die Buchung mit.';
  end if;
  if q = 'beleg' then
    raise exception 'Diese Buchung kommt aus einem Beleg – stornieren unter Finance › Belege am Beleg.';
  end if;
  if q = 'zahlung' then
    raise exception 'Diese Buchung ist eine Zahlung – zurücknehmen an der Rechnung bzw. am Beleg.';
  end if;
  if q = 'bank' then
    raise exception 'Diese Buchung kommt aus dem Bankabgleich – unter Finance › Bank & Kasse die Zuordnung aufheben.';
  end if;
  if q = 'abgang' then
    raise exception 'Diese Buchung ist ein Anlagenabgang – unter Finance › Anlagen an der Anlage zurücknehmen.';
  end if;
  if q = 'skonto' then
    raise exception 'Diese Buchung ist ein Skonto – an der Rechnung bzw. am Beleg zurücknehmen.';
  end if;
  if q = 'abschluss' then
    raise exception 'Diese Buchung ist eine Abschlussbuchung – unter Finance › Jahresabschluss zurücknehmen.';
  end if;
  if q = 'vortrag' then
    raise exception 'Diese Buchung ist der Saldenvortrag – unter Finance › Jahresabschluss zurücknehmen oder neu vortragen.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

revoke all on function public.fin_skonto_buchen(text, uuid, date, numeric) from public, anon;
revoke all on function public.fin_skonto_zuruecknehmen(uuid, text) from public, anon;
revoke all on function public.fin_skonti(text) from public, anon;
grant execute on function public.fin_skonto_buchen(text, uuid, date, numeric) to authenticated;
grant execute on function public.fin_skonto_zuruecknehmen(uuid, text) to authenticated;
grant execute on function public.fin_skonti(text) to authenticated;

select 'Neue Konten' as pruefung, (select count(*)::text || ' von 12' from public.fin_konten k where k.nummer in (8730, 8731, 8736, 3730, 3731, 3736, 4730, 4731, 4736, 5730, 5731, 5736)
         and k.kontenrahmen = case when k.nummer in (8730, 8731, 8736, 3730, 3731, 3736) then 'skr03' else 'skr04' end) as ergebnis
union all
select 'Spalte fin_teilzahlungen.skonto', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_teilzahlungen' and column_name = 'skonto') then 'da' else 'fehlt' end
union all
select 'Funktionen', (select count(*)::text || ' von 7' from unnest(array['fin_skonto_konto(text,text,text)', 'fin_skonto_buchen(text,uuid,date,numeric)',
         'fin_skonto_zuruecknehmen(uuid,text)', 'fin_skonti(text)', 'fin_rechnung_zahlungsanteile(uuid)', 'fin_ust_kennzahlen(date,date,text,boolean)',
         'fin_stornieren(uuid,text)']) x where to_regprocedure('public.' || x) is not null);

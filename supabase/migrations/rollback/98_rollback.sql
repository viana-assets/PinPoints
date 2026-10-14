-- =====================================================================
-- Rücknahme Migration 98 – Finance: Skonto wieder entfernen.
--
-- ACHTUNG: Gebuchte Skonti bleiben im Journal; vorher an der Rechnung bzw. am Beleg zurücknehmen, wenn sie nicht
-- bleiben sollen. Spalte, Konten und erlaubte Werte bleiben, solange es Skonti gibt. Die Funktionen
-- `fin_rechnung_zahlungsanteile`, `fin_ust_kennzahlen` (93) und `fin_stornieren` (96) werden wiederhergestellt.
-- Zweiter Lauf folgenlos.
-- =====================================================================

-- wie Migration 93
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

-- wie Migration 93
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

-- wie Migration 96
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
  if q = 'abschluss' then
    raise exception 'Diese Buchung ist eine Abschlussbuchung – unter Finance › Jahresabschluss zurücknehmen.';
  end if;
  if q = 'vortrag' then
    raise exception 'Diese Buchung ist der Saldenvortrag – unter Finance › Jahresabschluss zurücknehmen oder neu vortragen.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

drop function if exists public.fin_skonti(text);
drop function if exists public.fin_skonto_zuruecknehmen(uuid, text);
drop function if exists public.fin_skonto_buchen(text, uuid, date, numeric);
drop function if exists public.fin_skonto_konto(text, text, text);

delete from public.fin_konten k where k.nummer in (8730, 8731, 8736, 3730, 3731, 3736, 4730, 4731, 4736, 5730, 5731, 5736)
   and k.kontenrahmen = case when k.nummer in (8730, 8731, 8736, 3730, 3731, 3736) then 'skr03' else 'skr04' end
   and not exists (select 1 from public.fin_buchungszeilen z where z.konto = k.nummer);

do $$
begin
  if not exists (select 1 from public.fin_buchungen where quelle = 'skonto') then
    alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
    alter table public.fin_buchungen add constraint fin_buchung_quelle
      check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse', 'afa', 'abgang', 'abschluss', 'vortrag'));
  end if;
  if not exists (select 1 from public.fin_rechnungen where bezahlt_art = 'skonto') then
    alter table public.fin_rechnungen drop constraint if exists fin_re_art;
    alter table public.fin_rechnungen add constraint fin_re_art check (bezahlt_art is null or bezahlt_art in ('bar', 'bank'));
  end if;
  if not exists (select 1 from public.fin_belege where bezahlt_art = 'skonto') then
    alter table public.fin_belege drop constraint if exists fin_beleg_art;
    alter table public.fin_belege add constraint fin_beleg_art check (bezahlt_art is null or bezahlt_art in ('bar', 'bank'));
  end if;
  if not exists (select 1 from public.fin_teilzahlungen where skonto) then
    alter table public.fin_teilzahlungen drop column if exists skonto;
  end if;
end $$;

select 'Rücknahme 98' as pruefung,
       case when to_regprocedure('public.fin_skonto_buchen(text,uuid,date,numeric)') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;

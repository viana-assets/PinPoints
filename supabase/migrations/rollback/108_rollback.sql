-- =====================================================================
-- Rücknahme Migration 108 – Finance: Kostenstellen wieder entfernen.
--
-- Stellt die Fassungen aus 88/106/107 wieder her (zuerst – der SQL-Editor ist nicht atomar), entfernt dann die
-- Fassungen mit Kostenstellen, den Storno-Trigger, die Spalten kost1/kost2 und die Tabelle fin_kostenstellen.
-- ACHTUNG: Die Kostenstellen an Buchungen, Stapelzeilen, Vorlagen und wiederkehrenden Buchungen gehen verloren; die
-- Buchungen selbst bleiben unverändert. Vorher ggf. „Alle Daten sichern“ oder DATEV-Export. Zweiter Lauf folgenlos.
-- =====================================================================

create or replace function public.fin_buchen(p_datum date, p_text text, p_beleg text, p_posten jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  neu uuid;
  n integer;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  if coalesce(btrim(p_text), '') = '' then raise exception 'Der Buchungstext fehlt.'; end if;
  e := public.fin_buchbar(p_datum);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg)
  values (e.wirtschaftsjahr, n, p_datum, btrim(p_text), nullif(btrim(coalesce(p_beleg, '')), ''))
  returning id into neu;
  perform public.fin_posten_schreiben(neu, e.kontenrahmen, e.besteuerung, e.r13b_empfaenger, e.innergemeinschaftlich, p_posten);
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;


create or replace function public.fin_stapel_zeile_speichern(p_id uuid, p_stapel uuid, p_datum date, p_beleg text, p_text text,
  p_soll integer, p_haben integer, p_betrag numeric, p_steuer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  neu uuid;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_datum is null then raise exception 'Das Datum fehlt.'; end if;
  if extract(year from p_datum)::integer <> st.jahr then
    raise exception 'Das Datum % liegt nicht im Wirtschaftsjahr % des Stapels.', to_char(p_datum, 'DD.MM.YYYY'), st.jahr;
  end if;
  if coalesce(btrim(p_text), '') = '' or length(btrim(p_text)) > 200 then raise exception 'Der Buchungstext fehlt (höchstens 200 Zeichen).'; end if;
  if p_beleg is not null and length(btrim(p_beleg)) > 60 then raise exception 'Die Belegnummer ist zu lang (höchstens 60 Zeichen).'; end if;
  if p_soll is null or p_haben is null or p_soll <= 0 or p_haben <= 0 then raise exception 'Soll- und Haben-Konto angeben.'; end if;
  if p_soll = p_haben then raise exception 'Soll und Haben sind dasselbe Konto.'; end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag > 10000000 or p_betrag <> round(p_betrag, 2) then
    raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).';
  end if;

  if p_id is null then
    insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer)
    values (p_stapel, p_datum, nullif(btrim(coalesce(p_beleg, '')), ''), btrim(p_text), p_soll, p_haben, p_betrag,
            nullif(btrim(coalesce(p_steuer, '')), ''))
    returning id into neu;
    return neu;
  end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), soll = p_soll, haben = p_haben,
         betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), geaendert_am = now()
   where id = p_id and stapel_id = p_stapel;
  if not found then raise exception 'Diese Zeile gibt es in dem Stapel nicht (mehr).'; end if;
  return p_id;
end;
$$;


create or replace function public.fin_stapel_buchen(p_stapel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  z record;
  r jsonb;
  i integer := 0;
  erste integer;
  letzte integer;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if not exists (select 1 from public.fin_stapel_zeilen where stapel_id = p_stapel) then
    raise exception 'Der Stapel „%“ ist leer.', st.bezeichnung;
  end if;
  for z in select * from public.fin_stapel_zeilen where stapel_id = p_stapel order by datum, lfd loop
    i := i + 1;
    begin
      r := public.fin_buchen(z.datum, z.text, z.beleg,
        jsonb_build_array(jsonb_build_object('soll', z.soll, 'haben', z.haben, 'betrag', z.betrag, 'steuer', z.steuer)));
    exception when others then
      -- Die ganze Anweisung bricht ab: Nichts aus diesem Stapel ist gebucht, der Stapel bleibt offen.
      raise exception 'Zeile % (% · %): % – nichts gebucht, der Stapel bleibt offen.', i, to_char(z.datum, 'DD.MM.'), left(z.text, 40), sqlerrm;
    end;
    update public.fin_stapel_zeilen set buchung_id = (r ->> 'id')::uuid where id = z.id;
    erste := coalesce(erste, (r ->> 'nr')::integer);
    letzte := (r ->> 'nr')::integer;
  end loop;
  update public.fin_stapel set zustand = 'gebucht', gebucht_am = now(), gebucht_von = auth.uid() where id = p_stapel;
  return jsonb_build_object('anzahl', i, 'jahr', st.jahr, 'von', erste, 'bis', letzte);
end;
$$;


create or replace function public.fin_vorlage_speichern(p_id uuid, p_kurz text, p_text text, p_soll integer, p_haben integer,
  p_betrag numeric, p_steuer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
begin
  perform public.fin_stapel_recht();
  if coalesce(btrim(p_kurz), '') = '' or length(btrim(p_kurz)) > 40 then raise exception 'Der Kurzname fehlt (höchstens 40 Zeichen).'; end if;
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 200);
  if exists (select 1 from public.fin_vorlagen v where lower(btrim(v.kurz)) = lower(btrim(p_kurz)) and v.id is distinct from p_id) then
    raise exception 'Eine Vorlage „%“ gibt es schon.', btrim(p_kurz);
  end if;
  if p_id is null then
    insert into public.fin_vorlagen (kurz, text, soll, haben, betrag, steuer)
    values (btrim(p_kurz), btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''))
    returning id into neu;
    return neu;
  end if;
  update public.fin_vorlagen
     set kurz = btrim(p_kurz), text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag,
         steuer = nullif(btrim(coalesce(p_steuer, '')), ''), geaendert_am = now()
   where id = p_id;
  if not found then raise exception 'Diese Vorlage gibt es nicht (mehr).'; end if;
  return p_id;
end;
$$;


create or replace function public.fin_wiederkehrend_speichern(p_id uuid, p_text text, p_soll integer, p_haben integer, p_betrag numeric,
  p_steuer text, p_rhythmus text, p_ab date, p_bis date, p_aktiv boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt public.fin_wiederkehrend%rowtype;
  neu uuid;
begin
  perform public.fin_stapel_recht();
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 180);
  if p_betrag is null then raise exception 'Eine wiederkehrende Buchung braucht einen festen Betrag.'; end if;
  if p_rhythmus is null or p_rhythmus not in ('monat', 'quartal', 'halbjahr', 'jahr') then raise exception 'Unbekannter Rhythmus.'; end if;
  if p_ab is null then raise exception 'Der erste Termin fehlt.'; end if;
  if p_bis is not null and p_bis < p_ab then raise exception '„Bis“ liegt vor dem ersten Termin.'; end if;
  if p_id is null then
    insert into public.fin_wiederkehrend (text, soll, haben, betrag, steuer, rhythmus, ab, bis, aktiv)
    values (btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''), p_rhythmus, p_ab, p_bis, coalesce(p_aktiv, true))
    returning id into neu;
    return neu;
  end if;
  select * into alt from public.fin_wiederkehrend where id = p_id for update;
  if alt.id is null then raise exception 'Diese wiederkehrende Buchung gibt es nicht (mehr).'; end if;
  if (alt.ab <> p_ab or alt.rhythmus <> p_rhythmus)
     and exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = p_id) then
    raise exception 'Erster Termin und Rhythmus stehen fest, seit Termine geholt wurden – für einen neuen Rhythmus diese beenden („bis“) und eine neue anlegen.';
  end if;
  update public.fin_wiederkehrend
     set text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''),
         rhythmus = p_rhythmus, ab = p_ab, bis = p_bis, aktiv = coalesce(p_aktiv, true), geaendert_am = now()
   where id = p_id;
  return p_id;
end;
$$;


create or replace function public.fin_wiederkehrend_holen(p_stapel uuid, p_bis date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  w public.fin_wiederkehrend%rowtype;
  schritt integer;
  k integer;
  d date;
  von date;
  ende date;
  n integer := 0;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_bis is null then raise exception 'Der Stichtag fehlt.'; end if;
  von := make_date(st.jahr, 1, 1);
  for w in select * from public.fin_wiederkehrend where aktiv order by ab, id loop
    schritt := case w.rhythmus when 'monat' then 1 when 'quartal' then 3 when 'halbjahr' then 6 else 12 end;
    ende := least(p_bis, make_date(st.jahr, 12, 31), coalesce(w.bis, p_bis));
    k := 0;
    loop
      d := (w.ab + make_interval(months => k * schritt))::date;
      exit when d > ende or k > 1200;
      if d >= von and not exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = w.id and z.termin = d) then
        insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer, wiederkehrend_id, termin)
        values (p_stapel, d, null, left(w.text || ' ' || to_char(d, 'MM/YYYY'), 200), w.soll, w.haben, w.betrag, w.steuer, w.id, d);
        n := n + 1;
      end if;
      k := k + 1;
    end loop;
  end loop;
  return jsonb_build_object('anzahl', n);
end;
$$;


revoke all on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text) from public, anon;
revoke all on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text) from public, anon;
revoke all on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean) from public, anon;
grant execute on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text) to authenticated;
grant execute on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text) to authenticated;
grant execute on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean) to authenticated;

drop function if exists public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text, text, text);
drop function if exists public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text, text, text);
drop function if exists public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean, text, text);
drop trigger if exists trg_fin_storno_kost on public.fin_buchungen;
drop function if exists public.fin_storno_kost();
drop function if exists public.fin_kostenstelle_speichern(uuid, text, text, text, boolean);
drop function if exists public.fin_kostenstellen_uebernehmen();
drop function if exists public.fin_kostenstellen_transporter();
drop function if exists public.fin_kost(text, text);
alter table if exists public.fin_buchungszeilen drop column if exists kost1;
alter table if exists public.fin_buchungszeilen drop column if exists kost2;
alter table if exists public.fin_stapel_zeilen drop column if exists kost1;
alter table if exists public.fin_stapel_zeilen drop column if exists kost2;
alter table if exists public.fin_vorlagen drop column if exists kost1;
alter table if exists public.fin_vorlagen drop column if exists kost2;
alter table if exists public.fin_wiederkehrend drop column if exists kost1;
alter table if exists public.fin_wiederkehrend drop column if exists kost2;
drop table if exists public.fin_kostenstellen;

select 'Rücknahme 108' as pruefung,
       case when to_regclass('public.fin_kostenstellen') is null
             and to_regprocedure('public.fin_stapel_zeile_speichern(uuid,uuid,date,text,text,integer,integer,numeric,text)') is not null
             and not exists (select 1 from information_schema.columns where table_schema = 'public' and column_name = 'kost1')
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;

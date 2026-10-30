-- =====================================================================
-- Rücknahme Migration 109 – Splitt im Stapel, Abhaken (v183).
--
-- Stellt `fin_stapel_zeile_speichern()` und `fin_stapel_buchen()` im Stand von Migration 108 wieder her, entfernt
-- `fin_stapel_teil_speichern()`, `fin_abhaken()`, die Tabelle `fin_abgehakt` (die Haken gehen verloren, die Buchungen
-- bleiben) und die Spalte `teil_von`. Teile in einem OFFENEN Stapel bleiben als eigene Zeilen stehen und würden dann
-- je als eigene Buchung gebucht – vorher im Stapel prüfen. Gebuchte Stapel ändern sich nicht. Zweimal lauffähig.
-- Danach die App auf v183 zurück (sie liest `teil_von` und `fin_abgehakt`).
-- =====================================================================

create or replace function public.fin_stapel_zeile_speichern(p_id uuid, p_stapel uuid, p_datum date, p_beleg text, p_text text,
  p_soll integer, p_haben integer, p_betrag numeric, p_steuer text, p_kost1 text default null, p_kost2 text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  neu uuid;
  k1 text;
  k2 text;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_datum is null then raise exception 'Das Datum fehlt.'; end if;
  if extract(year from p_datum)::integer <> st.jahr then
    raise exception 'Das Datum % liegt nicht im Wirtschaftsjahr % des Stapels.', to_char(p_datum, 'DD.MM.YYYY'), st.jahr;
  end if;
  if p_beleg is not null and length(btrim(p_beleg)) > 60 then raise exception 'Die Belegnummer ist zu lang (höchstens 60 Zeichen).'; end if;
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 200);
  if p_betrag is null then raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).'; end if;
  k1 := public.fin_kost('kost1', p_kost1);
  k2 := public.fin_kost('kost2', p_kost2);
  if p_id is null then
    insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer, kost1, kost2)
    values (p_stapel, p_datum, nullif(btrim(coalesce(p_beleg, '')), ''), btrim(p_text), p_soll, p_haben, p_betrag,
            nullif(btrim(coalesce(p_steuer, '')), ''), k1, k2)
    returning id into neu;
    return neu;
  end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), soll = p_soll, haben = p_haben,
         betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), kost1 = k1, kost2 = k2, geaendert_am = now()
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
        jsonb_build_array(jsonb_build_object('soll', z.soll, 'haben', z.haben, 'betrag', z.betrag, 'steuer', z.steuer,
                                             'kost1', z.kost1, 'kost2', z.kost2)));
    exception when others then
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

drop function if exists public.fin_stapel_teil_speichern(uuid, uuid, integer, integer, numeric, text, text, text);
drop function if exists public.fin_abhaken(bigint[], boolean);
drop table if exists public.fin_abgehakt;
drop index if exists public.fin_sz_teil;
alter table public.fin_stapel_zeilen drop constraint if exists fin_sz_teil_selbst;
alter table public.fin_stapel_zeilen drop column if exists teil_von;

select 'Spalte teil_von' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_stapel_zeilen' and column_name = 'teil_von')
            then 'noch da' else 'weg' end as ergebnis
union all
select 'Tabelle fin_abgehakt', case when to_regclass('public.fin_abgehakt') is null then 'weg' else 'noch da' end
union all
select 'fin_stapel_buchen ohne Teile', case when position('teil_von' in pg_get_functiondef('public.fin_stapel_buchen(uuid)'::regprocedure)) = 0 then 'ja' else 'nein' end;

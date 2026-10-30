-- =====================================================================
-- Migration 109 – Finance, Stufe C (Teil 4): Splitt im Stapel, Abhaken beim Abstimmen; dazu der Stapel am Handy ohne eigene SQL (30.10.2026, v183).
--
-- docs/finance.md Abschnitt 15.
--
--   1. Splitt im Buchungsstapel: Eine Stapelzeile kann Teile haben (`fin_stapel_zeilen.teil_von`). Ein Teil ist ein
--      weiterer Posten derselben Buchung – eigene Konten, eigener Betrag, eigene Steuer und Kostenstellen, aber Datum,
--      Beleg und Text der Kopfzeile. „Stapel buchen“ macht aus Kopf und Teilen EINE Buchung mit mehreren Posten
--      (wie „+ Weiterer Posten“ im Buchungsfenster). Teile über `fin_stapel_teil_speichern()`; Löschen der Kopfzeile
--      löscht ihre Teile mit. Ändert sich Datum, Beleg oder Text der Kopfzeile, ziehen die Teile mit.
--   2. Abhaken (`fin_abgehakt`): eine Buchungszeile als abgestimmt markieren – etwa auf dem Bank- oder einem
--      Verrechnungskonto, bis der Saldo der offenen Zeilen stimmt. Der Haken ist eine Notiz neben dem Journal; die
--      Buchung selbst ändert sich nicht (GoBD) und kann auch nach dem Festschreiben noch abgehakt werden.
--      `fin_abhaken(zeilen, an)` mit „Finance › Buchungen“ schreiben.
--
-- Reihenfolge: nach 108, SQL zuerst, dann v183. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_kostenstellen') is null then
    raise exception 'Zuerst Migration 108 (Finance: Kostenstellen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Splitt im Stapel
-- ---------------------------------------------------------------------
alter table public.fin_stapel_zeilen add column if not exists teil_von uuid references public.fin_stapel_zeilen (id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_sz_teil_selbst') then
    alter table public.fin_stapel_zeilen add constraint fin_sz_teil_selbst check (teil_von is null or teil_von <> id);
  end if;
end $$;
create index if not exists fin_sz_teil on public.fin_stapel_zeilen (teil_von) where teil_von is not null;
comment on column public.fin_stapel_zeilen.teil_von is
  'Migration 109: Teil (weiterer Posten) dieser Kopfzeile; gebucht wird Kopf + Teile als eine Buchung. Datum/Beleg/Text wie der Kopf.';

-- Kopfzeile wie bisher – ein Teil wird hier abgelehnt, und Datum/Beleg/Text gehen an die Teile weiter.
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
  if exists (select 1 from public.fin_stapel_zeilen where id = p_id and teil_von is not null) then
    raise exception 'Das ist ein Teil einer Splittbuchung – Datum, Beleg und Text gehören zur Kopfzeile.';
  end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), soll = p_soll, haben = p_haben,
         betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), kost1 = k1, kost2 = k2, geaendert_am = now()
   where id = p_id and stapel_id = p_stapel;
  if not found then raise exception 'Diese Zeile gibt es in dem Stapel nicht (mehr).'; end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), geaendert_am = now()
   where teil_von = p_id;
  return p_id;
end;
$$;

-- Teil neu (p_id null) oder ändern. Datum, Beleg und Text kommen von der Kopfzeile.
create or replace function public.fin_stapel_teil_speichern(p_id uuid, p_kopf uuid, p_soll integer, p_haben integer, p_betrag numeric,
  p_steuer text, p_kost1 text default null, p_kost2 text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  kopf public.fin_stapel_zeilen%rowtype;
  neu uuid;
  k1 text;
  k2 text;
begin
  perform public.fin_stapel_recht();
  select * into kopf from public.fin_stapel_zeilen where id = p_kopf;
  if kopf.id is null then raise exception 'Die Kopfzeile gibt es nicht (mehr).'; end if;
  if kopf.teil_von is not null then raise exception 'Ein Teil kann selbst keine Teile haben – an die Kopfzeile hängen.'; end if;
  perform public.fin_stapel_offen(kopf.stapel_id);
  perform public.fin_felder_pruefen(kopf.text, p_soll, p_haben, p_betrag, 200);
  if p_betrag is null then raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).'; end if;
  k1 := public.fin_kost('kost1', p_kost1);
  k2 := public.fin_kost('kost2', p_kost2);
  if p_id is null then
    if (select count(*) from public.fin_stapel_zeilen where teil_von = p_kopf) >= 49 then
      raise exception 'Höchstens 50 Posten in einer Buchung.';
    end if;
    insert into public.fin_stapel_zeilen (stapel_id, teil_von, datum, beleg, text, soll, haben, betrag, steuer, kost1, kost2)
    values (kopf.stapel_id, p_kopf, kopf.datum, kopf.beleg, kopf.text, p_soll, p_haben, p_betrag,
            nullif(btrim(coalesce(p_steuer, '')), ''), k1, k2)
    returning id into neu;
    return neu;
  end if;
  update public.fin_stapel_zeilen
     set soll = p_soll, haben = p_haben, betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), kost1 = k1, kost2 = k2,
         geaendert_am = now()
   where id = p_id and teil_von = p_kopf;
  if not found then raise exception 'Diesen Teil gibt es an der Zeile nicht (mehr).'; end if;
  return p_id;
end;
$$;

-- Kopf und Teile als eine Buchung; Reihenfolge Datum, dann Erfassung der Kopfzeile. Alle oder keine.
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
  posten jsonb;
  i integer := 0;
  erste integer;
  letzte integer;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if not exists (select 1 from public.fin_stapel_zeilen where stapel_id = p_stapel) then
    raise exception 'Der Stapel „%“ ist leer.', st.bezeichnung;
  end if;
  for z in select * from public.fin_stapel_zeilen where stapel_id = p_stapel and teil_von is null order by datum, lfd loop
    i := i + 1;
    select jsonb_agg(jsonb_build_object('soll', x.soll, 'haben', x.haben, 'betrag', x.betrag, 'steuer', x.steuer,
                                        'kost1', x.kost1, 'kost2', x.kost2) order by (x.teil_von is not null), x.lfd)
      into posten
      from public.fin_stapel_zeilen x where x.id = z.id or x.teil_von = z.id;
    begin
      r := public.fin_buchen(z.datum, z.text, z.beleg, posten);
    exception when others then
      raise exception 'Zeile % (% · %): % – nichts gebucht, der Stapel bleibt offen.', i, to_char(z.datum, 'DD.MM.'), left(z.text, 40), sqlerrm;
    end;
    update public.fin_stapel_zeilen set buchung_id = (r ->> 'id')::uuid where id = z.id or teil_von = z.id;
    erste := coalesce(erste, (r ->> 'nr')::integer);
    letzte := (r ->> 'nr')::integer;
  end loop;
  update public.fin_stapel set zustand = 'gebucht', gebucht_am = now(), gebucht_von = auth.uid() where id = p_stapel;
  return jsonb_build_object('anzahl', i, 'jahr', st.jahr, 'von', erste, 'bis', letzte);
end;
$$;

revoke all on function public.fin_stapel_teil_speichern(uuid, uuid, integer, integer, numeric, text, text, text) from public, anon;
grant execute on function public.fin_stapel_teil_speichern(uuid, uuid, integer, integer, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Abhaken
-- ---------------------------------------------------------------------
create table if not exists public.fin_abgehakt (
  zeile_id bigint primary key references public.fin_buchungszeilen (id) on delete cascade,
  jahr     integer not null,
  am       timestamptz not null default now(),
  von      uuid default auth.uid()
);
create index if not exists fin_abgehakt_jahr on public.fin_abgehakt (jahr);
alter table public.fin_abgehakt enable row level security;
drop policy if exists "Finance-Abgehakt lesen" on public.fin_abgehakt;
create policy "Finance-Abgehakt lesen" on public.fin_abgehakt for select to authenticated using (public.darf('finance.buchen', 'lesen'));
revoke all on public.fin_abgehakt from anon, authenticated;
grant select on public.fin_abgehakt to authenticated;
comment on table public.fin_abgehakt is
  'Migration 109: abgehakte (abgestimmte) Buchungszeilen. Notiz neben dem Journal, ändert keine Buchung. Geschrieben über fin_abhaken(). docs/finance.md Abschnitt 15.';

-- Haken setzen (p_an) oder entfernen; gibt zurück, wie viele Zeilen sich geändert haben.
create or replace function public.fin_abhaken(p_zeilen bigint[], p_an boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Abhaken ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  if p_zeilen is null or cardinality(p_zeilen) = 0 then return 0; end if;
  if cardinality(p_zeilen) > 5000 then raise exception 'Höchstens 5000 Zeilen auf einmal.'; end if;
  if p_an then
    insert into public.fin_abgehakt (zeile_id, jahr)
    select z.id, b.jahr from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
     where z.id = any (p_zeilen)
    on conflict (zeile_id) do nothing;
  else
    delete from public.fin_abgehakt where zeile_id = any (p_zeilen);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fin_abhaken(bigint[], boolean) from public, anon;
grant execute on function public.fin_abhaken(bigint[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Ergebnis
-- ---------------------------------------------------------------------
select 'Splitt: Spalte fin_stapel_zeilen.teil_von' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_stapel_zeilen' and column_name = 'teil_von')
            then 'da' else 'fehlt' end as ergebnis
union all
select 'Splitt: fin_stapel_teil_speichern()', case when to_regprocedure('public.fin_stapel_teil_speichern(uuid,uuid,integer,integer,numeric,text,text,text)') is not null then 'da' else 'fehlt' end
union all
select 'Stapel buchen mit Teilen', case when position('teil_von' in pg_get_functiondef('public.fin_stapel_buchen(uuid)'::regprocedure)) > 0 then 'ja' else 'nein' end
union all
select 'Tabelle fin_abgehakt (RLS)',
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_abgehakt')), 'fehlt')
union all
select 'Abhaken: fin_abhaken()', case when to_regprocedure('public.fin_abhaken(bigint[],boolean)') is not null then 'da' else 'fehlt' end;

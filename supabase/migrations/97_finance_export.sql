-- =====================================================================
-- Migration 97 – Finance, Phase F9: Export für den Steuerberater (14.10.2026, v155).
--
-- docs/finance.md Abschnitt 4.8, schlank – lesend, dazu ein Protokoll:
--
--   1. `fin_export_journal(von, bis)`: alle Buchungen eines Zeitraums (ein Jahr) mit ihren Zeilen – daraus baut die App
--      den DATEV-Buchungsstapel und den GoBD-Datenexport (lib/finance/export.ts). Lesen mit „Finance › Auswertungen
--      und Abschluss“, auch ohne „Buchungen lesen“.
--   2. `fin_export_belege(von, bis)`: die Eingangsbelege des Zeitraums (ohne Dateien) für den GoBD-Export.
--   3. PROTOKOLL `fin_exporte`: wann welcher Zeitraum exportiert wurde, mit Zahl, Summe und letzter Nummer der
--      Buchungen – die Datenbank zählt selbst (`fin_export_protokollieren()`). `fin_export_protokolle(jahr)` zeigt dazu
--      den heutigen Stand, damit die Seite „seitdem geändert“ melden kann.
--
-- PILOT wie alles in Finance. Reihenfolge: nach 96, SQL zuerst, dann v155. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_abschlussposten') is null then
    raise exception 'Zuerst Migration 96 (Finance: Jahresabschluss) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create table if not exists public.fin_exporte (
  id           uuid primary key default gen_random_uuid(),
  art          text not null,
  von          date not null,
  bis          date not null,
  buchungen    integer not null,
  summe        numeric(16,2) not null,
  letzte_nr    integer,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_ex_art check (art in ('datev', 'gobd')),
  constraint fin_ex_zeitraum check (von <= bis and extract(year from von) = extract(year from bis))
);
create index if not exists fin_exporte_von on public.fin_exporte (von);
alter table public.fin_exporte enable row level security;
drop policy if exists "Finance-Exporte lesen" on public.fin_exporte;
create policy "Finance-Exporte lesen" on public.fin_exporte for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_exporte from anon, authenticated;
grant select on public.fin_exporte to authenticated;
comment on table public.fin_exporte is
  'Migration 97: Protokoll der Exporte (DATEV, GoBD) mit dem Stand des Journals im Zeitraum. Geschrieben nur über fin_export_protokollieren(). docs/finance.md „So ist F9 gebaut“.';

-- Zeitraum prüfen (ein Jahr, von <= bis). Ohne Rechteprüfung.
create or replace function public.fin_export_zeitraum(p_von date, p_bis date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_von is null or p_bis is null or p_von > p_bis then raise exception 'Den Zeitraum angeben (von vor bis).'; end if;
  if extract(year from p_von) <> extract(year from p_bis) then raise exception 'Ein Export umfasst höchstens ein Wirtschaftsjahr.'; end if;
end;
$$;
revoke all on function public.fin_export_zeitraum(date, date) from public, anon, authenticated;

-- Stand des Journals im Zeitraum: Zahl der Buchungen, Summe Soll, letzte Nummer. Ohne Rechteprüfung.
create or replace function public.fin_export_kennzahlen(p_von date, p_bis date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'buchungen', (select count(*) from public.fin_buchungen b where b.datum between p_von and p_bis),
    'summe', (select coalesce(sum(z.betrag), 0) from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
               where b.datum between p_von and p_bis and z.seite = 'S'),
    'letzte_nr', (select max(b.nr) from public.fin_buchungen b where b.datum between p_von and p_bis))
$$;
revoke all on function public.fin_export_kennzahlen(date, date) from public, anon, authenticated;

create or replace function public.fin_export_journal(p_von date, p_bis date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Der Export ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  perform public.fin_export_zeitraum(p_von, p_bis);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'jahr', b.jahr, 'nr', b.nr, 'datum', b.datum, 'text', b.text, 'beleg', b.beleg, 'quelle', b.quelle,
             'quelle_id', b.quelle_id, 'storno_von', b.storno_von, 'storniert_durch', b.storniert_durch, 'grund', b.grund, 'erstellt_am', b.erstellt_am,
             'fin_buchungszeilen', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'posten', z.posten, 'seite', z.seite, 'konto', z.konto, 'betrag', z.betrag,
                                                     'steuerschluessel', z.steuerschluessel, 'ist_steuer', z.ist_steuer) order by z.id)
                                       from public.fin_buchungszeilen z where z.buchung_id = b.id), '[]'::jsonb))
           order by b.nr)
      from public.fin_buchungen b where b.datum between p_von and p_bis), '[]'::jsonb);
end;
$$;

create or replace function public.fin_export_belege(p_von date, p_bis date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Der Export ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  perform public.fin_export_zeitraum(p_von, p_bis);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'belegdatum', x.belegdatum, 'belegnummer', x.belegnummer, 'lieferant', l.name, 'text', x.text, 'brutto', x.brutto,
             'status', x.status, 'buchung_nr', bu.nr, 'bezahlt_am', x.bezahlt_am, 'datei_name', x.datei_name)
           order by x.belegdatum, x.id)
      from public.fin_belege x
      left join public.fin_lieferanten l on l.id = x.lieferant_id
      left join public.fin_buchungen bu on bu.id = x.buchung_id
     where x.belegdatum between p_von and p_bis), '[]'::jsonb);
end;
$$;

create or replace function public.fin_export_protokollieren(p_art text, p_von date, p_bis date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k jsonb;
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Der Export ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  if p_art is null or p_art not in ('datev', 'gobd') then raise exception 'Unbekannte Art des Exports.'; end if;
  perform public.fin_export_zeitraum(p_von, p_bis);
  k := public.fin_export_kennzahlen(p_von, p_bis);
  insert into public.fin_exporte (art, von, bis, buchungen, summe, letzte_nr)
  values (p_art, p_von, p_bis, (k ->> 'buchungen')::integer, (k ->> 'summe')::numeric, (k ->> 'letzte_nr')::integer);
  return k;
end;
$$;

-- Die Exporte eines Jahres mit dem heutigen Stand ihres Zeitraums.
create or replace function public.fin_export_protokolle(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Der Export ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'art', x.art, 'von', x.von, 'bis', x.bis, 'buchungen', x.buchungen, 'summe', x.summe,
             'letzte_nr', x.letzte_nr, 'erstellt_am', x.erstellt_am, 'jetzt', public.fin_export_kennzahlen(x.von, x.bis)) order by x.erstellt_am desc)
      from (select * from public.fin_exporte e where extract(year from e.von) = p_jahr order by e.erstellt_am desc limit 50) x), '[]'::jsonb);
end;
$$;

revoke all on function public.fin_export_journal(date, date) from public, anon;
revoke all on function public.fin_export_belege(date, date) from public, anon;
revoke all on function public.fin_export_protokollieren(text, date, date) from public, anon;
revoke all on function public.fin_export_protokolle(integer) from public, anon;
grant execute on function public.fin_export_journal(date, date) to authenticated;
grant execute on function public.fin_export_belege(date, date) to authenticated;
grant execute on function public.fin_export_protokollieren(text, date, date) to authenticated;
grant execute on function public.fin_export_protokolle(integer) to authenticated;

select 'Tabelle fin_exporte (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_exporte')), 'fehlt') as ergebnis
union all
select 'Richtlinien auf fin_exporte',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'fin_exporte'), 'keine')
union all
select 'Funktionen', (select count(*)::text || ' von 6' from unnest(array['fin_export_zeitraum(date,date)', 'fin_export_kennzahlen(date,date)',
         'fin_export_journal(date,date)', 'fin_export_belege(date,date)', 'fin_export_protokollieren(text,date,date)', 'fin_export_protokolle(integer)']) x
        where to_regprocedure('public.' || x) is not null);

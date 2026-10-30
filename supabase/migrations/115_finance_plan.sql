-- =====================================================================
-- Migration 115 – Finance, Stufe G: Planwerte je Konto und Monat für Plan/Ist (30.10.2026, v186).
--
-- docs/finance.md Abschnitt 20.
--
--   `fin_plan`: Planbetrag je Wirtschaftsjahr, Konto und Monat – positiv, wie man es denkt (Erlös 5.000, Aufwand 1.200).
--   Die App legt ihn neben das Ist (BWA-Zeilen, Konten) und rechnet die Abweichung. Pflege mit „Finance › Auswertungen und
--   Abschluss“ schreiben: je Konto zwölf Monate auf einmal (`fin_plan_setzen`) oder alles aus dem Ist des Vorjahres mit
--   Auf- oder Abschlag (`fin_plan_aus_vorjahr`). Nur Erlös- und Aufwandskonten.
--   Die Liquiditätsplanung (Migration 100, `fin_planposten`) bleibt davon unberührt.
--
-- Reihenfolge: nach 114, SQL zuerst, dann v186. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_buchung_dateien') is null then
    raise exception 'Zuerst Migration 114 (Finance: Belegeingang) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create table if not exists public.fin_plan (
  jahr   integer not null,
  konto  integer not null,
  monat  integer not null,
  betrag numeric(14,2) not null,
  primary key (jahr, konto, monat),
  constraint fin_plan_jahr  check (jahr between 2000 and 2100),
  constraint fin_plan_konto check (konto between 1 and 9999),
  constraint fin_plan_monat check (monat between 1 and 12)
);
comment on table public.fin_plan is 'Migration 115: Planwerte je Jahr, Konto, Monat (positiv). Lesen finance.abschluss, schreiben über Funktionen.';
alter table public.fin_plan enable row level security;
drop policy if exists "Finance-Plan lesen" on public.fin_plan;
create policy "Finance-Plan lesen" on public.fin_plan for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_plan from anon, authenticated;
grant select on public.fin_plan to authenticated;

-- Welche Konten geplant werden dürfen: Erlös und Aufwand im Kontenrahmen des Jahres.
create or replace function public.fin_plan_konto_ok(p_jahr integer, p_konto integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.fin_einstellungen e join public.fin_konten k on k.kontenrahmen = e.kontenrahmen
                  where e.wirtschaftsjahr = p_jahr and k.nummer = p_konto and k.kategorie in ('erloes', 'aufwand'));
$$;
revoke all on function public.fin_plan_konto_ok(integer, integer) from public, anon, authenticated;

-- Zwölf Monatswerte für ein Konto; null oder 0 entfernt den Monat. Rückgabe: Zahl der gesetzten Monate.
create or replace function public.fin_plan_setzen(p_jahr integer, p_konto integer, p_werte numeric[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m integer;
  w numeric;
  n integer := 0;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Planen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  if not public.fin_plan_konto_ok(p_jahr, p_konto) then
    raise exception 'Geplant werden Erlös- und Aufwandskonten – und erst, wenn die Einstellungen für % gespeichert sind.', p_jahr;
  end if;
  if p_werte is null or array_length(p_werte, 1) <> 12 then raise exception 'Es braucht genau zwölf Monatswerte.'; end if;
  for m in 1..12 loop
    w := round(p_werte[m], 2);
    if w is null or w = 0 then
      delete from public.fin_plan where jahr = p_jahr and konto = p_konto and monat = m;
    else
      if abs(w) >= 1e10 then raise exception 'Der Betrag im Monat % ist zu groß.', m; end if;
      insert into public.fin_plan (jahr, konto, monat, betrag) values (p_jahr, p_konto, m, w)
      on conflict (jahr, konto, monat) do update set betrag = excluded.betrag;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Plan aus dem Ist des Vorjahres: je Erlös-/Aufwandskonto und Monat, mit Auf- oder Abschlag in Prozent.
-- p_ersetzen = false lässt Konten stehen, die schon einen Plan haben. Rückgabe: Zahl der geplanten Konten.
create or replace function public.fin_plan_aus_vorjahr(p_jahr integer, p_prozent numeric, p_ersetzen boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rahmen text;
  n integer;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Planen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  select kontenrahmen into v_rahmen from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if v_rahmen is null then raise exception 'Erst die Einstellungen für % speichern.', p_jahr; end if;
  if p_prozent is null or p_prozent < -100 or p_prozent > 1000 then raise exception 'Auf- oder Abschlag zwischen -100 und 1000 %%.'; end if;

  -- Erst entfernen, dann einfügen – zwei Anweisungen, nicht ein CTE (dieselbe Zeile zweimal in einer Anweisung geht nicht).
  if p_ersetzen then
    delete from public.fin_plan p where p.jahr = p_jahr
       and p.konto in (select distinct z.konto from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
                        where b.jahr = p_jahr - 1);
  end if;

  with ist as (
    select z.konto, extract(month from b.datum)::integer as monat, k.kategorie,
           sum(case z.seite when 'S' then z.betrag else -z.betrag end) as soll_minus_haben
      from public.fin_buchungszeilen z
      join public.fin_buchungen b on b.id = z.buchung_id
      join public.fin_konten k on k.kontenrahmen = v_rahmen and k.nummer = z.konto and k.kategorie in ('erloes', 'aufwand')
     where b.jahr = p_jahr - 1 and not z.ist_steuer
     group by z.konto, extract(month from b.datum), k.kategorie
  ), werte as (
    select konto, monat,
           round(case when kategorie = 'erloes' then -soll_minus_haben else soll_minus_haben end * (1 + p_prozent / 100), 2) as betrag
      from ist
  ), ziel as (
    select w.* from werte w
     where w.betrag <> 0
       and not exists (select 1 from public.fin_plan p where p.jahr = p_jahr and p.konto = w.konto)
  )
  insert into public.fin_plan (jahr, konto, monat, betrag)
  select p_jahr, konto, monat, betrag from ziel
  on conflict (jahr, konto, monat) do update set betrag = excluded.betrag;

  select count(distinct konto) into n from public.fin_plan where jahr = p_jahr;
  return n;
end;
$$;

revoke all on function public.fin_plan_setzen(integer, integer, numeric[]) from public, anon;
revoke all on function public.fin_plan_aus_vorjahr(integer, numeric, boolean) from public, anon;
grant execute on function public.fin_plan_setzen(integer, integer, numeric[]) to authenticated;
grant execute on function public.fin_plan_aus_vorjahr(integer, numeric, boolean) to authenticated;

select 'Tabelle fin_plan (RLS)' as pruefung,
       (select c.relname || case when c.relrowsecurity then ' RLS an' else ' RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_plan')) as ergebnis
union all
select 'Funktionen', (select count(*)::text || ' von 2' from unnest(array['fin_plan_setzen(integer,integer,numeric[])', 'fin_plan_aus_vorjahr(integer,numeric,boolean)']) x
         where to_regprocedure('public.' || x) is not null);

-- =====================================================================
-- Migration 100 – Finance: Planposten für die Liquiditätsvorschau (14.10.2026, v158).
--
-- docs/finance.md „Liquiditätsvorschau und Vorjahresvergleich (v158)“. Die Vorschau rechnet in der App aus dem, was
-- Finance schon kennt (Geldkonten, offene Rechnungen und Belege, Vorgänge ohne Rechnung, Umsatzsteuer). Was dort nicht
-- steht – Miete, Leasing, Löhne, Versicherungen, eine geplante Anschaffung –, trägt man als Planposten ein:
--
--   1. `fin_planposten`: Text, Einzahlung oder Auszahlung, Betrag, erster Termin, Rhythmus (einmalig, monatlich,
--      vierteljährlich, halbjährlich, jährlich), optional „bis“. Kein Buchungssatz, keine Steuer – nur Planung.
--   2. `fin_planposten_speichern()` (neu oder ändern) und `fin_planposten_loeschen()` – mit Klartext-Prüfung.
--
-- Rechte: lesen mit „Finance › Auswertungen“ (Recht `finance.abschluss` lesen), schreiben mit `finance.abschluss`
-- schreiben. Planposten sind Fachdaten: „Alle Daten löschen“ (Migration 72) leert sie mit. PILOT wie alles in Finance.
-- Reihenfolge: nach 99, SQL zuerst, dann v158. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_mahnungen') is null then
    raise exception 'Zuerst Migration 99 (Finance: Mahnwesen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create table if not exists public.fin_planposten (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  art          text not null,
  betrag       numeric(14,2) not null,
  ab           date not null,
  rhythmus     text not null,
  bis          date,
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  constraint fin_pp_text check (length(btrim(text)) between 1 and 120),
  constraint fin_pp_art check (art in ('ein', 'aus')),
  constraint fin_pp_betrag check (betrag > 0 and betrag <= 10000000),
  constraint fin_pp_rhythmus check (rhythmus in ('einmal', 'monat', 'quartal', 'halbjahr', 'jahr')),
  constraint fin_pp_bis check (bis is null or (bis >= ab and rhythmus <> 'einmal')),
  constraint fin_pp_notiz check (notiz is null or length(notiz) <= 500)
);
alter table public.fin_planposten enable row level security;
drop policy if exists "Finance-Planposten lesen" on public.fin_planposten;
create policy "Finance-Planposten lesen" on public.fin_planposten for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_planposten from anon, authenticated;
grant select on public.fin_planposten to authenticated;
comment on table public.fin_planposten is
  'Migration 100: Planposten der Liquiditätsvorschau (Einzahlung/Auszahlung, Rhythmus). Keine Buchung. Geschrieben nur über fin_planposten_speichern()/_loeschen(). docs/finance.md „Liquiditätsvorschau“.';

-- Neu (p_id null) oder ändern. Gibt die ID zurück.
create or replace function public.fin_planposten_speichern(p_id uuid, p_text text, p_art text, p_betrag numeric,
  p_ab date, p_rhythmus text, p_bis date, p_notiz text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Planposten sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen“ schreiben).';
  end if;
  if coalesce(btrim(p_text), '') = '' or length(btrim(p_text)) > 120 then raise exception 'Der Text fehlt (höchstens 120 Zeichen).'; end if;
  if p_art is null or p_art not in ('ein', 'aus') then raise exception 'Einzahlung oder Auszahlung wählen.'; end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag > 10000000 or p_betrag <> round(p_betrag, 2) then
    raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).';
  end if;
  if p_ab is null then raise exception 'Das Datum fehlt.'; end if;
  if p_rhythmus is null or p_rhythmus not in ('einmal', 'monat', 'quartal', 'halbjahr', 'jahr') then raise exception 'Unbekannter Rhythmus.'; end if;
  if p_bis is not null and p_rhythmus = 'einmal' then raise exception 'Ein einmaliger Posten hat kein „bis“.'; end if;
  if p_bis is not null and p_bis < p_ab then raise exception '„Bis“ liegt vor dem ersten Termin.'; end if;
  if p_notiz is not null and length(p_notiz) > 500 then raise exception 'Die Notiz ist zu lang (höchstens 500 Zeichen).'; end if;

  if p_id is null then
    insert into public.fin_planposten (text, art, betrag, ab, rhythmus, bis, notiz)
    values (btrim(p_text), p_art, p_betrag, p_ab, p_rhythmus, p_bis, nullif(btrim(p_notiz), ''))
    returning id into neu;
    return neu;
  end if;
  update public.fin_planposten
     set text = btrim(p_text), art = p_art, betrag = p_betrag, ab = p_ab, rhythmus = p_rhythmus, bis = p_bis,
         notiz = nullif(btrim(p_notiz), ''), geaendert_am = now()
   where id = p_id;
  if not found then raise exception 'Diesen Planposten gibt es nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_planposten_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Planposten sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen“ schreiben).';
  end if;
  delete from public.fin_planposten where id = p_id;
  if not found then raise exception 'Diesen Planposten gibt es nicht (mehr).'; end if;
end;
$$;

revoke all on function public.fin_planposten_speichern(uuid, text, text, numeric, date, text, date, text) from public, anon;
revoke all on function public.fin_planposten_loeschen(uuid) from public, anon;
grant execute on function public.fin_planposten_speichern(uuid, text, text, numeric, date, text, date, text) to authenticated;
grant execute on function public.fin_planposten_loeschen(uuid) to authenticated;

select 'Tabelle fin_planposten (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_planposten')), 'fehlt') as ergebnis
union all
select 'Richtlinien auf fin_planposten',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'fin_planposten'), 'keine')
union all
select 'Funktionen', (select count(*)::text || ' von 2' from unnest(array['fin_planposten_speichern(uuid,text,text,numeric,date,text,date,text)',
         'fin_planposten_loeschen(uuid)']) x where to_regprocedure('public.' || x) is not null);

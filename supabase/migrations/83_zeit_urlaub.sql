-- =====================================================================
-- Migration 83 – Zeiterfassung: Urlaub als Eintrag (08.10.2026, v136, Fahrplan E20).
--
-- Wunsch Vitali 08.10.2026 (Auswahl „Urlaub als Eintrag“): Urlaubstage lassen sich eintragen und
-- zählen in der Monatsübersicht und im Export mit. Bewusst NUR Urlaub: Krankheit wären
-- Gesundheitsdaten (Art. 9 DSGVO) – die kommen erst nach Rücksprache mit dem Datenschutz dazu.
-- Die Prüfregel auf `art` lässt deshalb heute nur 'urlaub' zu.
--
-- Wie bei den Schichten gilt: Eintragen und Entfernen NUR mit „Zeiten aller · schreiben“ und
-- immer mit Grund; jede Änderung landet mit Vorher und Nachher in `zeit_korrekturen`
-- (`schicht_id` leer, im JSON `art: "urlaub"`). Die Person selbst ändert nichts.
--
--   - `zeit_abwesenheiten`: eine Zeile je Person und Tag (eindeutig), mit den Minuten, die der
--     Tag zählt (ganzer Tag 8 h, halber 4 h – die Vorgaben stehen in der App, `ZEIT_URLAUB_VORGABEN`).
--   - `zeit_urlaub_setzen(person, von, bis, minuten, grund)`: setzt jeden Werktag (Mo–Fr) im
--     Zeitraum; ein schon vorhandener Eintrag wird überschrieben. Feiertage kennt die Datenbank
--     nicht – wer einen Zeitraum über einen Feiertag einträgt, nimmt diesen Tag danach wieder heraus.
--   - `zeit_urlaub_loeschen(person, von, bis, grund)`: nimmt die Einträge im Zeitraum heraus.
--   - `zeit_aufraeumen()` räumt die Einträge nach 2 Jahren mit ab (wie die Schichten).
--
-- Reihenfolge: nach 82, SQL zuerst, dann die Dateien von v136. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.zeit_schichten') is null then
    raise exception 'Zuerst Migration 82 (Zeiterfassung) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.zeit_abwesenheiten (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  tag          date not null,
  art          text not null default 'urlaub',
  minuten      integer not null,
  notiz        text,
  erfasst_von  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint zeit_abwesenheit_art check (art in ('urlaub')),
  constraint zeit_abwesenheit_minuten check (minuten between 1 and 720),
  constraint zeit_abwesenheit_eine unique (profile_id, tag)
);
create index if not exists zeit_abwesenheiten_tag on public.zeit_abwesenheiten (tag);

alter table public.zeit_abwesenheiten enable row level security;

-- Lesen wie die Schichten: die eigenen mit „Zeiterfassung“, alle mit „Zeiten aller“. Schreiben:
-- keine Richtlinie – nur über die Funktionen unten.
drop policy if exists "Abwesenheiten lesen" on public.zeit_abwesenheiten;
create policy "Abwesenheiten lesen" on public.zeit_abwesenheiten
  for select to authenticated
  using ((profile_id = (select auth.uid()) and public.darf('zeiterfassung', 'lesen')) or public.darf('zeiterfassung.alle', 'lesen'));

-- ---------------------------------------------------------------------
-- 2. Eintragen und Entfernen – nur mit „Zeiten aller · schreiben“, immer mit Grund
-- ---------------------------------------------------------------------
create or replace function public.zeit_urlaub_setzen(p_profile uuid, p_von date, p_bis date, p_minuten integer, p_grund text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_tag    date;
  v_vorher jsonb;
  v_anzahl integer := 0;
begin
  if not public.darf('zeiterfassung.alle', 'schreiben') then
    raise exception 'Urlaub eintragen darf nur, wer das Recht „Zeiten aller korrigieren“ hat.';
  end if;
  if char_length(v_grund) < 3 then raise exception 'Bitte einen Grund angeben (z. B. „Urlaubsantrag vom 1.10.“).'; end if;
  if p_profile is null or not exists (select 1 from public.profiles where id = p_profile) then raise exception 'Für wen? Die Person fehlt.'; end if;
  if p_von is null or p_bis is null or p_bis < p_von then raise exception 'Der Zeitraum ist nicht gültig: „bis“ muss am oder nach „von“ liegen.'; end if;
  if p_bis - p_von > 62 then raise exception 'Höchstens zwei Monate auf einmal eintragen.'; end if;
  if p_minuten is null or p_minuten < 1 or p_minuten > 720 then raise exception 'Ein Urlaubstag zählt zwischen 1 Minute und 12 Stunden.'; end if;

  for v_tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d loop
    if extract(isodow from v_tag) > 5 then continue; end if;
    select jsonb_build_object('art', a.art, 'tag', a.tag, 'minuten', a.minuten) into v_vorher
      from public.zeit_abwesenheiten a where a.profile_id = p_profile and a.tag = v_tag;
    if v_vorher is not null and (v_vorher->>'minuten')::integer = p_minuten then continue; end if;
    insert into public.zeit_abwesenheiten (profile_id, tag, art, minuten, notiz, erfasst_von)
    values (p_profile, v_tag, 'urlaub', p_minuten, v_grund, (select auth.uid()))
    on conflict (profile_id, tag) do update
      set minuten = excluded.minuten, notiz = excluded.notiz, erfasst_von = excluded.erfasst_von, art = excluded.art;
    insert into public.zeit_korrekturen (schicht_id, profile_id, vorher, nachher, grund, von)
    values (null, p_profile, v_vorher, jsonb_build_object('art', 'urlaub', 'tag', v_tag, 'minuten', p_minuten), v_grund, (select auth.uid()));
    v_anzahl := v_anzahl + 1;
  end loop;
  return v_anzahl;
end;
$$;

create or replace function public.zeit_urlaub_loeschen(p_profile uuid, p_von date, p_bis date, p_grund text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_zeile  record;
  v_anzahl integer := 0;
begin
  if not public.darf('zeiterfassung.alle', 'schreiben') then
    raise exception 'Urlaub entfernen darf nur, wer das Recht „Zeiten aller korrigieren“ hat.';
  end if;
  if char_length(v_grund) < 3 then raise exception 'Bitte einen Grund angeben.'; end if;
  if p_von is null or p_bis is null or p_bis < p_von then raise exception 'Der Zeitraum ist nicht gültig.'; end if;
  for v_zeile in delete from public.zeit_abwesenheiten a
                  where a.profile_id = p_profile and a.tag between p_von and p_bis
                  returning a.art, a.tag, a.minuten loop
    insert into public.zeit_korrekturen (schicht_id, profile_id, vorher, nachher, grund, von)
    values (null, p_profile, jsonb_build_object('art', v_zeile.art, 'tag', v_zeile.tag, 'minuten', v_zeile.minuten), null, v_grund, (select auth.uid()));
    v_anzahl := v_anzahl + 1;
  end loop;
  return v_anzahl;
end;
$$;

revoke all on function public.zeit_urlaub_setzen(uuid, date, date, integer, text) from public, anon;
revoke all on function public.zeit_urlaub_loeschen(uuid, date, date, text) from public, anon;
grant execute on function public.zeit_urlaub_setzen(uuid, date, date, integer, text) to authenticated;
grant execute on function public.zeit_urlaub_loeschen(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Aufbewahrung: die Urlaubseinträge nach 2 Jahren mit abräumen
-- ---------------------------------------------------------------------
create or replace function public.zeit_aufraeumen(frist interval default interval '2 years')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from public.zeit_schichten where beginn < now() - frist;
  get diagnostics anzahl = row_count;
  delete from public.zeit_abwesenheiten where tag < (now() - frist)::date;
  delete from public.zeit_korrekturen where am < now() - frist;
  return anzahl;
end;
$$;
revoke all on function public.zeit_aufraeumen(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Tabelle zeit_abwesenheiten' as pruefung, (to_regclass('public.zeit_abwesenheiten') is not null)::text as ergebnis
union all
select 'Funktionen zum Eintragen und Entfernen',
       (to_regprocedure('public.zeit_urlaub_setzen(uuid, date, date, integer, text)') is not null
        and to_regprocedure('public.zeit_urlaub_loeschen(uuid, date, date, text)') is not null)::text
union all
select 'Richtlinien auf zeit_abwesenheiten (nur Lesen erwartet)',
       (select string_agg(policyname || ' (' || cmd || ')', ', ') from pg_policies where schemaname = 'public' and tablename = 'zeit_abwesenheiten');

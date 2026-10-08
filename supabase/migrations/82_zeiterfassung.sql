-- =====================================================================
-- Migration 82 – Zeiterfassung: Stempeluhr (08.10.2026, v131).
--
-- Wunsch Vitali 08.10.2026, Entwurf „Stempeluhr“ abgenickt: Jeder mit dem Recht stempelt ein und
-- aus und macht zwischendurch Pause; ein eigener Bereich zeigt Tag und Woche für sich selbst, mit
-- einem zweiten Recht für alle Mitarbeiter. Entschieden per Auswahl:
--   - Pause-Knopf (Einstempeln → Pause → Weiter → Ausstempeln). Die Pausenregel aus § 4 ArbZG ist
--     nur ein Hinweis in der App, keine Sperre.
--   - Korrigieren und Nachtragen NUR mit dem Recht „Zeiten aller“ und immer mit Grund. Die Person
--     selbst ändert nichts. Eine vergessene Stempelung endet nicht von selbst.
--   - Aufbewahrung 2 Jahre, danach nächtlich gelöscht.
--   - Rechte: `zeiterfassung` (lesen = eigene Zeiten, schreiben = stempeln) ab Werk Admin und
--     Benutzer, Techniker AUS; `zeiterfassung.alle` (lesen = alle sehen, schreiben = korrigieren)
--     ab Werk Admin. Für die Techniker später nur die Haken in der Rechtematrix setzen.
--
-- Bausteine:
--   - `zeit_schichten`: eine Zeile je Schicht (Beginn, Ende; Ende leer = läuft). Höchstens eine
--     offene Schicht je Zugang (eindeutiger Teilindex).
--   - `zeit_pausen`: Pausen einer Schicht; höchstens eine offene je Schicht.
--   - `zeit_korrekturen`: jede Korrektur mit Vorher, Nachher, Grund, wer, wann. Bewusst eine eigene
--     Tabelle und nicht das Änderungsprotokoll (`audit_row`): Das hielte die Zeiten 36 Monate fest,
--     hier gelten 2 Jahre – und die räumt `zeit_aufraeumen()` vollständig ab.
--   - Geschrieben wird NUR über Funktionen (`security definer`), nie direkt: Die Uhrzeit nimmt die
--     Datenbank (`now()`), nicht das Gerät – ein falsch gestelltes Handy verschiebt nichts.
--     Für direkte Schreibzugriffe gibt es keine Richtlinie, also sind sie verboten.
--
-- Reihenfolge: nach 81, SQL zuerst, dann die Dateien von v131. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Rechte – Techniker bewusst AUS
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('zeiterfassung', array['admin', 'user'], array['admin', 'user'], '{}'::text[]),
       ('zeiterfassung.alle', array['admin'], array['admin'], '{}'::text[])
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.zeit_schichten (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  beginn           timestamptz not null,
  ende             timestamptz,
  korrigiert_am    timestamptz,
  korrigiert_von   uuid references public.profiles(id) on delete set null,
  korrektur_grund  text,
  created_at       timestamptz not null default now(),
  constraint zeit_schicht_reihenfolge check (ende is null or ende > beginn)
);
create unique index if not exists zeit_schicht_eine_offene on public.zeit_schichten (profile_id) where ende is null;
create index if not exists zeit_schichten_beginn on public.zeit_schichten (beginn);
create index if not exists zeit_schichten_person on public.zeit_schichten (profile_id, beginn);

create table if not exists public.zeit_pausen (
  id         uuid primary key default gen_random_uuid(),
  schicht_id uuid not null references public.zeit_schichten(id) on delete cascade,
  beginn     timestamptz not null,
  ende       timestamptz,
  constraint zeit_pause_reihenfolge check (ende is null or ende > beginn)
);
create unique index if not exists zeit_pause_eine_offene on public.zeit_pausen (schicht_id) where ende is null;
create index if not exists zeit_pausen_schicht on public.zeit_pausen (schicht_id);

create table if not exists public.zeit_korrekturen (
  id         uuid primary key default gen_random_uuid(),
  schicht_id uuid,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vorher     jsonb,
  nachher    jsonb,
  grund      text not null,
  von        uuid references public.profiles(id) on delete set null,
  am         timestamptz not null default now()
);
create index if not exists zeit_korrekturen_person on public.zeit_korrekturen (profile_id, am);

alter table public.zeit_schichten enable row level security;
alter table public.zeit_pausen enable row level security;
alter table public.zeit_korrekturen enable row level security;

-- Lesen: die eigenen mit „Zeiterfassung“, alle mit „Zeiten aller“. Schreiben: keine Richtlinie.
drop policy if exists "Zeiten lesen" on public.zeit_schichten;
create policy "Zeiten lesen" on public.zeit_schichten
  for select to authenticated
  using ((profile_id = (select auth.uid()) and public.darf('zeiterfassung', 'lesen')) or public.darf('zeiterfassung.alle', 'lesen'));
drop policy if exists "Pausen lesen" on public.zeit_pausen;
create policy "Pausen lesen" on public.zeit_pausen
  for select to authenticated
  using (exists (select 1 from public.zeit_schichten s where s.id = schicht_id));
drop policy if exists "Korrekturen lesen" on public.zeit_korrekturen;
create policy "Korrekturen lesen" on public.zeit_korrekturen
  for select to authenticated
  using ((profile_id = (select auth.uid()) and public.darf('zeiterfassung', 'lesen')) or public.darf('zeiterfassung.alle', 'lesen'));

-- ---------------------------------------------------------------------
-- 3. Stempeln – immer mit der Uhr der Datenbank
-- ---------------------------------------------------------------------
create or replace function public.zeit_schicht_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', s.id, 'profile_id', s.profile_id, 'beginn', s.beginn, 'ende', s.ende,
           'pausen', coalesce((select jsonb_agg(jsonb_build_object('beginn', p.beginn, 'ende', p.ende) order by p.beginn)
                                 from public.zeit_pausen p where p.schicht_id = s.id), '[]'::jsonb))
    from public.zeit_schichten s where s.id = p_id;
$$;
revoke all on function public.zeit_schicht_json(uuid) from public, anon, authenticated;

create or replace function public.zeit_einstempeln()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
begin
  if not public.darf('zeiterfassung', 'schreiben') then
    raise exception 'Stempeln ist für deine Rolle nicht freigeschaltet (Recht „Zeiterfassung“).';
  end if;
  if exists (select 1 from public.zeit_schichten where profile_id = (select auth.uid()) and ende is null) then
    raise exception 'Du bist schon eingestempelt.';
  end if;
  insert into public.zeit_schichten (profile_id, beginn) values ((select auth.uid()), now()) returning id into neu;
  return neu;
end;
$$;

create or replace function public.zeit_pause_beginnen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  offen uuid;
begin
  if not public.darf('zeiterfassung', 'schreiben') then
    raise exception 'Stempeln ist für deine Rolle nicht freigeschaltet (Recht „Zeiterfassung“).';
  end if;
  select id into offen from public.zeit_schichten where profile_id = (select auth.uid()) and ende is null for update;
  if offen is null then raise exception 'Du bist nicht eingestempelt.'; end if;
  if exists (select 1 from public.zeit_pausen where schicht_id = offen and ende is null) then
    raise exception 'Die Pause läuft schon.';
  end if;
  insert into public.zeit_pausen (schicht_id, beginn) values (offen, now());
end;
$$;

create or replace function public.zeit_pause_beenden()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  offen uuid;
begin
  if not public.darf('zeiterfassung', 'schreiben') then
    raise exception 'Stempeln ist für deine Rolle nicht freigeschaltet (Recht „Zeiterfassung“).';
  end if;
  select id into offen from public.zeit_schichten where profile_id = (select auth.uid()) and ende is null for update;
  if offen is null then raise exception 'Du bist nicht eingestempelt.'; end if;
  update public.zeit_pausen set ende = now() where schicht_id = offen and ende is null;
  if not found then raise exception 'Es läuft keine Pause.'; end if;
end;
$$;

create or replace function public.zeit_ausstempeln()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  offen uuid;
begin
  if not public.darf('zeiterfassung', 'schreiben') then
    raise exception 'Stempeln ist für deine Rolle nicht freigeschaltet (Recht „Zeiterfassung“).';
  end if;
  select id into offen from public.zeit_schichten where profile_id = (select auth.uid()) and ende is null for update;
  if offen is null then raise exception 'Du bist nicht eingestempelt.'; end if;
  update public.zeit_pausen set ende = now() where schicht_id = offen and ende is null;
  update public.zeit_schichten set ende = now() where id = offen;
end;
$$;

-- Der eigene Stand für die Stempeluhr: die offene Schicht samt Pausen und die Uhrzeit der Datenbank
-- (die App rechnet damit den Unterschied zur Uhr des Geräts heraus).
create or replace function public.zeit_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'jetzt', now(),
    'schicht', case when public.darf('zeiterfassung', 'lesen') then
      (select public.zeit_schicht_json(s.id) from public.zeit_schichten s where s.profile_id = (select auth.uid()) and s.ende is null)
    end);
$$;

-- Wer in der Übersicht „Alle“ vorkommt: Zugänge, deren Rolle stempeln darf, und jeder mit einer
-- Schicht. Ohne „Zeiten aller“ nur man selbst. Name wie im Chat: Mitarbeiter, sonst E-Mail vor dem @.
create or replace function public.zeit_personen()
returns table (id uuid, name text, rolle text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim((select e.name from public.employees e where e.profile_id = p.id order by e.created_at limit 1)), ''),
                  nullif(split_part(coalesce(p.email, ''), '@', 1), ''), 'Zugang') as name,
         p.role
    from public.profiles p
   where (public.darf('zeiterfassung.alle', 'lesen')
          and (p.role = any (coalesce((select m.read_roles from public.module_permissions m where m.module_key = 'zeiterfassung'), '{}'::text[]))
               or exists (select 1 from public.zeit_schichten s where s.profile_id = p.id)))
      or (p.id = (select auth.uid()) and public.darf('zeiterfassung', 'lesen'))
   order by 2;
$$;

-- ---------------------------------------------------------------------
-- 4. Korrigieren und Nachtragen – nur mit „Zeiten aller · schreiben“, immer mit Grund
-- ---------------------------------------------------------------------
-- `p_id` leer = neue Schicht nachtragen. `p_pausen`: [{"beginn": …, "ende": …}, …], jede Pause
-- vollständig und innerhalb der Schicht. `p_ende` leer = die Schicht läuft weiter.
create or replace function public.zeit_schicht_speichern(
  p_id uuid, p_profile uuid, p_beginn timestamptz, p_ende timestamptz, p_pausen jsonb, p_grund text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_id     uuid := p_id;
  v_person uuid := p_profile;
  v_vorher jsonb;
  v_pause  jsonb;
  v_pb     timestamptz;
  v_pe     timestamptz;
  v_letzt  timestamptz := null;
begin
  if not public.darf('zeiterfassung.alle', 'schreiben') then
    raise exception 'Korrigieren darf nur, wer das Recht „Zeiten aller korrigieren“ hat.';
  end if;
  if char_length(v_grund) < 3 then raise exception 'Bitte einen Grund für die Korrektur angeben.'; end if;
  if p_beginn is null then raise exception 'Der Beginn fehlt.'; end if;
  if p_ende is not null and p_ende <= p_beginn then raise exception 'Das Ende muss nach dem Beginn liegen.'; end if;
  if p_beginn > now() or p_ende > now() then raise exception 'Eine Schicht kann nicht in der Zukunft liegen.'; end if;
  if coalesce(p_ende, now()) - p_beginn > interval '24 hours' then raise exception 'Eine Schicht kann nicht länger als 24 Stunden sein.'; end if;

  if v_id is not null then
    select profile_id into v_person from public.zeit_schichten where id = v_id for update;
    if v_person is null then raise exception 'Diese Schicht gibt es nicht mehr.'; end if;
    v_vorher := public.zeit_schicht_json(v_id);
  end if;
  if v_person is null then raise exception 'Für wen? Die Person fehlt.'; end if;

  if exists (select 1 from public.zeit_schichten s
              where s.profile_id = v_person and s.id is distinct from v_id
                and tstzrange(s.beginn, coalesce(s.ende, 'infinity'::timestamptz)) && tstzrange(p_beginn, coalesce(p_ende, 'infinity'::timestamptz))) then
    raise exception 'Die Zeit überschneidet sich mit einer anderen Schicht dieser Person.';
  end if;

  -- Pausen prüfen: vollständig, innerhalb der Schicht, ohne Überschneidung (nach Beginn sortiert).
  for v_pause in select x from jsonb_array_elements(coalesce(p_pausen, '[]'::jsonb)) x order by (x->>'beginn')::timestamptz loop
    v_pb := (v_pause->>'beginn')::timestamptz;
    v_pe := (v_pause->>'ende')::timestamptz;
    if v_pb is null or v_pe is null or v_pe <= v_pb then raise exception 'Jede Pause braucht einen Beginn und ein späteres Ende.'; end if;
    if v_pb < p_beginn or v_pe > coalesce(p_ende, now()) then raise exception 'Eine Pause liegt außerhalb der Schicht.'; end if;
    if v_letzt is not null and v_pb < v_letzt then raise exception 'Zwei Pausen überschneiden sich.'; end if;
    v_letzt := v_pe;
  end loop;

  if v_id is null then
    insert into public.zeit_schichten (profile_id, beginn, ende, korrigiert_am, korrigiert_von, korrektur_grund)
    values (v_person, p_beginn, p_ende, now(), (select auth.uid()), v_grund)
    returning id into v_id;
  else
    update public.zeit_schichten
       set beginn = p_beginn, ende = p_ende, korrigiert_am = now(), korrigiert_von = (select auth.uid()), korrektur_grund = v_grund
     where id = v_id;
    delete from public.zeit_pausen where schicht_id = v_id;
  end if;
  insert into public.zeit_pausen (schicht_id, beginn, ende)
  select v_id, (x->>'beginn')::timestamptz, (x->>'ende')::timestamptz from jsonb_array_elements(coalesce(p_pausen, '[]'::jsonb)) x;

  insert into public.zeit_korrekturen (schicht_id, profile_id, vorher, nachher, grund, von)
  values (v_id, v_person, v_vorher, public.zeit_schicht_json(v_id), v_grund, (select auth.uid()));
  return v_id;
end;
$$;

create or replace function public.zeit_schicht_loeschen(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_person uuid;
  v_vorher jsonb;
begin
  if not public.darf('zeiterfassung.alle', 'schreiben') then
    raise exception 'Korrigieren darf nur, wer das Recht „Zeiten aller korrigieren“ hat.';
  end if;
  if char_length(v_grund) < 3 then raise exception 'Bitte einen Grund für die Korrektur angeben.'; end if;
  select profile_id into v_person from public.zeit_schichten where id = p_id for update;
  if v_person is null then raise exception 'Diese Schicht gibt es nicht mehr.'; end if;
  v_vorher := public.zeit_schicht_json(p_id);
  delete from public.zeit_schichten where id = p_id;
  insert into public.zeit_korrekturen (schicht_id, profile_id, vorher, nachher, grund, von)
  values (p_id, v_person, v_vorher, null, v_grund, (select auth.uid()));
end;
$$;

revoke all on function public.zeit_einstempeln() from public, anon;
revoke all on function public.zeit_pause_beginnen() from public, anon;
revoke all on function public.zeit_pause_beenden() from public, anon;
revoke all on function public.zeit_ausstempeln() from public, anon;
revoke all on function public.zeit_status() from public, anon;
revoke all on function public.zeit_personen() from public, anon;
revoke all on function public.zeit_schicht_speichern(uuid, uuid, timestamptz, timestamptz, jsonb, text) from public, anon;
revoke all on function public.zeit_schicht_loeschen(uuid, text) from public, anon;
grant execute on function public.zeit_einstempeln() to authenticated;
grant execute on function public.zeit_pause_beginnen() to authenticated;
grant execute on function public.zeit_pause_beenden() to authenticated;
grant execute on function public.zeit_ausstempeln() to authenticated;
grant execute on function public.zeit_status() to authenticated;
grant execute on function public.zeit_personen() to authenticated;
grant execute on function public.zeit_schicht_speichern(uuid, uuid, timestamptz, timestamptz, jsonb, text) to authenticated;
grant execute on function public.zeit_schicht_loeschen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Aufbewahrung: 2 Jahre
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
  delete from public.zeit_korrekturen where am < now() - frist;
  return anzahl;
end;
$$;
revoke all on function public.zeit_aufraeumen(interval) from public, anon, authenticated;

select cron.unschedule('pinpoints-zeit-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-zeit-aufraeumen');
select cron.schedule('pinpoints-zeit-aufraeumen', '35 3 * * *', $auftrag$ select public.zeit_aufraeumen(); $auftrag$);

-- ---------------------------------------------------------------------
-- 6. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Tabellen zeit_schichten, zeit_pausen, zeit_korrekturen' as pruefung,
       (to_regclass('public.zeit_schichten') is not null and to_regclass('public.zeit_pausen') is not null
        and to_regclass('public.zeit_korrekturen') is not null)::text as ergebnis
union all
select 'Recht „Zeiterfassung“ (lesen) – Techniker sollte fehlen',
       (select coalesce(array_to_string(read_roles, ', '), '–') from public.module_permissions where module_key = 'zeiterfassung')
union all
select 'Recht „Zeiten aller“ (lesen)',
       (select coalesce(array_to_string(read_roles, ', '), '–') from public.module_permissions where module_key = 'zeiterfassung.alle')
union all
select 'Nächtliches Aufräumen (2 Jahre)',
       exists (select 1 from cron.job where jobname = 'pinpoints-zeit-aufraeumen')::text;

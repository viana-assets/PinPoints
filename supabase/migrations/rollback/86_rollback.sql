-- =====================================================================
-- Rücknahme Migration 86 – zurück auf den Stand von Migration 72/85.
--
-- Danach: „Alle Daten löschen“ wieder mit nur dem Bestätigungswort, ohne Chat-Fotos in der
-- Übersicht, „Was gibt es Neues“ ohne Neubeginn. Die App ab v142 meldet beim Löschen dann
-- „Funktion nicht gefunden“ und versucht es ohne Fassung erneut – das klappt.
-- Gelöscht wird nur die Tabelle app_stand (ein Merker, keine Fachdaten). Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.alle_daten_loeschen(text, text);

create or replace function public.alle_daten_behalten()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['profiles', 'module_permissions', 'user_settings', 'push_geraete']::text[] $$;

create or replace function public.alle_daten_umfang()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  n bigint;
  tabellen jsonb := '{}'::jsonb;
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Alle Daten löschen darf nur der Superadmin.';
  end if;
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and not (tablename = any(public.alle_daten_behalten()))
     order by tablename
  loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    tabellen := tabellen || jsonb_build_object(t.tablename, n);
  end loop;
  return jsonb_build_object(
    'tabellen', tabellen,
    'zugaenge_weg', (select count(*) from public.profiles p where coalesce(p.role, '') not in ('admin', 'superadmin')),
    'zugaenge_bleiben', (select count(*) from public.profiles p where p.role in ('admin', 'superadmin')),
    'belege', (select count(*) from public.auftrag_belege),
    'rechnungen_echt', (select count(*) from public.rechnungen r where r.nummer > 0)
  );
end;
$$;

create or replace function public.alle_daten_loeschen(p_bestaetigung text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  umfang jsonb;
  liste text;
  s record;
  zugaenge integer;
begin
  if coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Alle Daten löschen darf nur der Superadmin.';
  end if;
  if p_bestaetigung is distinct from 'löschen' then
    raise exception 'Zum Bestätigen genau das Wort „löschen“ eintippen (klein geschrieben).';
  end if;

  umfang := public.alle_daten_umfang();

  delete from auth.users u
   where u.id <> (select auth.uid())
     and not exists (select 1 from public.profiles p where p.id = u.id and p.role in ('admin', 'superadmin'));
  get diagnostics zugaenge = row_count;

  select string_agg(format('public.%I', tablename), ', ' order by tablename) into liste
    from pg_tables
   where schemaname = 'public' and not (tablename = any(public.alle_daten_behalten()));
  if liste is not null then
    execute 'truncate table ' || liste || ' restart identity';
  end if;

  for s in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('alter sequence public.%I restart', s.sequencename);
  end loop;

  insert into public.betrieb (id) values (true) on conflict (id) do nothing;

  truncate table public.audit_log restart identity;
  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values ('betrieb', 'alle', 'DELETE',
          jsonb_build_object('alle_daten_geloescht', true, 'zugaenge_geloescht', zugaenge),
          null, (select auth.uid()));

  return umfang || jsonb_build_object('zugaenge_geloescht', zugaenge);
end;
$$;

comment on function public.alle_daten_loeschen(text) is
  'Migration 72: löscht alle Daten außer Admin-/Superadmin-Zugängen, ihren Einstellungen und Geräten und der Rechtetabelle. Nur Superadmin, nur mit dem Wort „löschen“.';
comment on function public.alle_daten_umfang() is 'Migration 72: Zeilen je Tabelle, die „Alle Daten löschen“ entfernen würde. Nur Superadmin.';

revoke all on function public.alle_daten_umfang() from public, anon;
revoke all on function public.alle_daten_loeschen(text) from public, anon;
revoke all on function public.alle_daten_behalten() from public, anon;
grant execute on function public.alle_daten_umfang() to authenticated;
grant execute on function public.alle_daten_loeschen(text) to authenticated;

drop table if exists public.app_stand;

select 'Rücknahme 86' as pruefung,
       (to_regprocedure('public.alle_daten_loeschen(text)') is not null
        and to_regprocedure('public.alle_daten_loeschen(text,text)') is null
        and to_regclass('public.app_stand') is null)::text as ergebnis;

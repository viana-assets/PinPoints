-- =====================================================================
-- Migration 68 – Verfügbarkeit der Mitarbeiter (05.10.2026, v112).
--
-- Die Techniker sind selbstständig. Bevor das Büro Termine vergibt, tragen sie ein, an welchen
-- Tagen sie überhaupt eingesetzt werden können – wie ein Schichtplan, nur andersherum: Nicht das
-- Büro teilt ein, sondern jeder sagt, wann er kann. Die Einsatzplanung zeigt dann beim Einteilen
-- zuerst die, die an dem Tag Zeit haben.
--
-- Eine Zeile je Mitarbeiter und Tag:
--
--   von/bis leer   verfügbar, ganzer Tag
--   von/bis        verfügbar in diesem Zeitfenster
--   keine Zeile    nichts eingetragen – das heißt „unbekannt", nicht „hat keine Zeit"
--
-- Bewusst KEIN Grund (Urlaub, krank …): Krankheit wäre ein Gesundheitsdatum (Art. 9 DSGVO), und
-- für die Planung reicht „kann" oder „kann nicht".
--
-- Wer was darf:
--   - Jeder mit einem verknüpften Mitarbeiter (Admin › Mitarbeiter, `employees.profile_id`) sieht
--     und pflegt seine EIGENEN Tage – ohne besonderes Recht, aber nur ab heute.
--   - Wer `einsatzplanung.verfuegbarkeit · lesen` hat (Vorgabe: Admin; Superadmin immer), sieht
--     alle; mit `· schreiben` trägt er auch für andere ein, etwa für Mitarbeiter ohne eigenen
--     Zugang, und darf vergangene Tage berichtigen.
-- Durchgesetzt in den Richtlinien UND im BEFORE-Trigger `verfuegbarkeit_pruefen()`, der im
-- Klartext sagt, warum etwas nicht geht (CLAUDE.md §2: Durchsetzung, die sich erklären muss).
--
-- Aufräumen: Einträge, die älter als 12 Monate sind, löscht die Datenbank beim nächsten Eintragen
-- (`verfuegbarkeit_aufraeumen()`), samt ihren Protokollzeilen.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Die Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.verfuegbarkeiten (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  datum date not null,
  von time,
  bis time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint verfuegbarkeit_ein_eintrag_je_tag unique (employee_id, datum),
  constraint verfuegbarkeit_fenster_vollstaendig check ((von is null) = (bis is null)),
  constraint verfuegbarkeit_fenster_richtig check (von is null or von < bis)
);

comment on table public.verfuegbarkeiten is
  'An welchen Tagen ein Mitarbeiter eingesetzt werden kann (Migration 68). von/bis leer = ganzer Tag. Keine Zeile = nichts eingetragen. Kein Grund – nur ob und wann.';

create index if not exists verfuegbarkeiten_datum_idx on public.verfuegbarkeiten (datum);

alter table public.verfuegbarkeiten enable row level security;

-- ---------------------------------------------------------------------
-- 2. Das Recht, alle zu sehen und für alle einzutragen
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('einsatzplanung.verfuegbarkeit', '{admin}', '{admin}', '{}')
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Die Prüfung – mit Begründung
-- ---------------------------------------------------------------------
create or replace function public.verfuegbarkeit_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ich uuid := public.current_employee_id();
  alle boolean := public.darf('einsatzplanung.verfuegbarkeit', 'schreiben');
  zeile record;
begin
  -- Aufräumen aus dem eigenen Trigger heraus und Wartung im SQL-Editor (ohne Anmeldung).
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if not alle then
    if ich is null then
      raise exception 'Dein Zugang ist mit keinem Mitarbeiter verknüpft. Das richtet der Admin unter Admin › Mitarbeiter ein.';
    end if;
    for zeile in
      select * from (values (case when tg_op <> 'INSERT' then old.employee_id end, case when tg_op <> 'INSERT' then old.datum end),
                            (case when tg_op <> 'DELETE' then new.employee_id end, case when tg_op <> 'DELETE' then new.datum end)) as z(wer, tag)
       where z.wer is not null
    loop
      if zeile.wer is distinct from ich then
        raise exception 'Du kannst nur deine eigene Verfügbarkeit eintragen.';
      end if;
      if zeile.tag < current_date then
        raise exception 'Vergangene Tage lassen sich nicht mehr ändern.';
      end if;
    end loop;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_verfuegbarkeit_pruefen on public.verfuegbarkeiten;
create trigger trg_verfuegbarkeit_pruefen
  before insert or update or delete on public.verfuegbarkeiten
  for each row execute procedure public.verfuegbarkeit_pruefen();

drop trigger if exists trg_stamp_row on public.verfuegbarkeiten;
create trigger trg_stamp_row
  before insert or update on public.verfuegbarkeiten
  for each row execute procedure public.stamp_row();

drop trigger if exists trg_audit_row on public.verfuegbarkeiten;
create trigger trg_audit_row
  after insert or update or delete on public.verfuegbarkeiten
  for each row execute procedure public.audit_row();

-- ---------------------------------------------------------------------
-- 4. Nach 12 Monaten weg – samt Protokoll
-- ---------------------------------------------------------------------
create or replace function public.verfuegbarkeit_aufraeumen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grenze date := (current_date - interval '12 months')::date;
begin
  if exists (select 1 from public.verfuegbarkeiten where datum < grenze) then
    delete from public.verfuegbarkeiten where datum < grenze;
  end if;
  delete from public.audit_log
   where tabelle = 'verfuegbarkeiten'
     and coalesce(neu->>'datum', alt->>'datum') < grenze::text;
  return null;
end;
$$;

drop trigger if exists trg_verfuegbarkeit_aufraeumen on public.verfuegbarkeiten;
create trigger trg_verfuegbarkeit_aufraeumen
  after insert on public.verfuegbarkeiten
  for each statement execute procedure public.verfuegbarkeit_aufraeumen();

-- ---------------------------------------------------------------------
-- 5. Die Richtlinien: eigene Zeile immer, alle nur mit dem Recht
--
-- Löschen (= austragen) prüft wie überall nur das Sehen; ob es erlaubt ist, entscheidet der
-- Trigger oben – sonst wäre ein abgelehntes Löschen still (CLAUDE.md §2).
-- ---------------------------------------------------------------------
drop policy if exists "Verfuegbarkeit lesen" on public.verfuegbarkeiten;
create policy "Verfuegbarkeit lesen" on public.verfuegbarkeiten
  for select to authenticated
  using (employee_id = public.current_employee_id() or public.darf('einsatzplanung.verfuegbarkeit', 'lesen'));

drop policy if exists "Verfuegbarkeit eintragen" on public.verfuegbarkeiten;
create policy "Verfuegbarkeit eintragen" on public.verfuegbarkeiten
  for insert to authenticated
  with check (employee_id = public.current_employee_id() or public.darf('einsatzplanung.verfuegbarkeit', 'schreiben'));

drop policy if exists "Verfuegbarkeit aendern" on public.verfuegbarkeiten;
create policy "Verfuegbarkeit aendern" on public.verfuegbarkeiten
  for update to authenticated
  using (employee_id = public.current_employee_id() or public.darf('einsatzplanung.verfuegbarkeit', 'schreiben'))
  with check (employee_id = public.current_employee_id() or public.darf('einsatzplanung.verfuegbarkeit', 'schreiben'));

drop policy if exists "Verfuegbarkeit austragen" on public.verfuegbarkeiten;
create policy "Verfuegbarkeit austragen" on public.verfuegbarkeiten
  for delete to authenticated
  using (employee_id = public.current_employee_id() or public.darf('einsatzplanung.verfuegbarkeit', 'lesen'));

grant select, insert, update, delete on public.verfuegbarkeiten to authenticated;

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Tabelle verfuegbarkeiten' as pruefung, (to_regclass('public.verfuegbarkeiten') is not null)::text as ergebnis
union all
select 'Recht einsatzplanung.verfuegbarkeit', exists (select 1 from public.module_permissions where module_key = 'einsatzplanung.verfuegbarkeit')::text
union all
select 'Richtlinien', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'verfuegbarkeiten');

-- =====================================================================
-- Viana PinPoints – 36: Das Protokoll sichtbar machen
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 18 (audit_log, audit_row).
--
-- Konzept: claude/fahrplan-phase-5.md, Block A.
--
-- WICHTIG – WAS HIER *NICHT* PASSIERT
--
-- Es wird KEIN Protokoll angelegt. Es gibt seit Migration 18 eines: `public.audit_log`, mit
-- Triggern auf dreizehn Tabellen. Es zeichnet auf, seit es läuft – die Aufzeichnung der
-- letzten Wochen ist also bereits vorhanden, sie war nur nirgends zu sehen.
--
-- Ein zweites Protokoll danebenzustellen wäre derselbe Fehler wie seinerzeit DOT-Datum am
-- Fahrzeug UND am Satz: dieselbe Aussage an zwei Orten, die auseinanderlaufen können.
--
-- WAS ALSO FEHLT UND HIER NACHGEHOLT WIRD
--
--  1. Drei Tabellen sind nach Migration 18 dazugekommen und werden bisher NICHT
--     protokolliert: order_employees (11), firmenfahrzeuge (32), eingelagerte_raeder (33).
--     Ausgerechnet das Neueste ist also blind – darunter die einzeln gemessenen Räder.
--  2. Lesen darf bisher nur der Superadmin. Gewünscht ist Admin und Superadmin.
--  3. Für die Anzeige am Auftrag braucht es einen Auftragsbezug. Der steckt heute im
--     jsonb (`neu->>'order_id'`), was jede Abfrage zu einem vollen Tabellendurchlauf macht.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Die drei fehlenden Tabellen nachziehen – mit denselben zwei Triggern wie in 18.
--    `stamp_row` (created_by/updated_by/updated_at) gehört dazu: Ohne die Spalten schreibt
--    das Protokoll zwar mit, aber am Datensatz selbst steht nicht, wer ihn zuletzt angefasst
--    hat – und genau danach schaut man zuerst.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  nachzügler text[] := array['order_employees', 'firmenfahrzeuge', 'eingelagerte_raeder'];
begin
  foreach t in array nachzügler loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabelle % gibt es hier nicht – übersprungen.', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists created_by uuid', t);
    execute format('alter table public.%I add column if not exists updated_by uuid', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);

    execute format('drop trigger if exists trg_stamp_row on public.%I', t);
    execute format('create trigger trg_stamp_row before insert or update on public.%I
                      for each row execute procedure public.stamp_row()', t);

    execute format('drop trigger if exists trg_audit_row on public.%I', t);
    execute format('create trigger trg_audit_row after insert or update or delete on public.%I
                      for each row execute procedure public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Auch der Admin darf lesen.
--
-- Die Regel von 18 („nur Superadmin") wird ERSETZT, nicht ergänzt: Zwei Leseregeln
-- nebeneinander sind in Postgres ein ODER und damit schwerer zu beurteilen als eine.
-- Schreiben darf weiterhin niemand – es gibt nach wie vor keine insert/update/delete-Regel,
-- und der Trigger kommt als `security definer` ohnehin an RLS vorbei. Ein Protokoll, das
-- sein Gegenstand ändern kann, ist keines.
-- ---------------------------------------------------------------------
drop policy if exists "Superadmin liest das Protokoll" on public.audit_log;
drop policy if exists "Admin liest das Protokoll" on public.audit_log;
create policy "Admin liest das Protokoll" on public.audit_log
  for select to authenticated
  using ((select coalesce(public.current_user_role(), '')) in ('admin', 'superadmin'));

-- ---------------------------------------------------------------------
-- 3. Auftrags- und Kundenbezug als eigene Spalten.
--
-- Warum nicht einfach im jsonb suchen? Weil `neu->>'order_id' = '…'` keinen Index benutzen
-- kann: Für jede Anzeige der Auftragshistorie läse Postgres das gesamte Protokoll. Diese
-- Tabelle ist die einzige im System, die nie kleiner wird – das ist die eine Stelle, an der
-- man das nicht durchgehen lassen darf.
--
-- `generated always as … stored` heißt: Postgres rechnet den Wert selbst aus, für jede
-- bestehende Zeile beim Hinzufügen und für jede neue beim Schreiben. Niemand kann ihn
-- danebensetzen, und der Trigger aus 18 muss nicht angefasst werden.
-- ---------------------------------------------------------------------

-- Ein Textfeld in eine Kennung zu verwandeln, ohne dass eine einzige unsaubere Altzeile die
-- ganze Migration abbricht. `immutable` ist Bedingung für eine generierte Spalte – die
-- Funktion darf für dieselbe Eingabe nie ein anderes Ergebnis liefern, und das tut sie nicht.
create or replace function public.als_uuid(wert text)
returns uuid
language plpgsql
immutable
returns null on null input
as $$
begin
  return wert::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  alter table public.audit_log
    add column auftrag_id uuid generated always as (
      case when tabelle = 'orders'
           then public.als_uuid(datensatz_id)
           else public.als_uuid(coalesce(neu ->> 'order_id', alt ->> 'order_id'))
      end
    ) stored;
exception when duplicate_column then
  raise notice 'Spalte auftrag_id gibt es schon – übersprungen.';
end $$;

do $$
begin
  alter table public.audit_log
    add column kunde_id uuid generated always as (
      case when tabelle = 'customers'
           then public.als_uuid(datensatz_id)
           else public.als_uuid(coalesce(neu ->> 'customer_id', alt ->> 'customer_id'))
      end
    ) stored;
exception when duplicate_column then
  raise notice 'Spalte kunde_id gibt es schon – übersprungen.';
end $$;

create index if not exists audit_log_auftrag_idx on public.audit_log (auftrag_id, geaendert_am desc) where auftrag_id is not null;
create index if not exists audit_log_kunde_idx   on public.audit_log (kunde_id,   geaendert_am desc) where kunde_id   is not null;
-- Die Adminliste filtert nach Person und Zeit.
create index if not exists audit_log_wer_idx     on public.audit_log (geaendert_von, geaendert_am desc);

-- ---------------------------------------------------------------------
-- 4. Namen zu den Kennungen.
--
-- Das Protokoll speichert `geaendert_von` als Kennung. Wer sie auflösen will, braucht
-- `public.profiles` – und die darf laut Migration 05 nur der SUPERADMIN lesen. Für einen
-- Admin stünde im Protokoll sonst überall eine achtstellige Zeichenfolge statt eines Namens;
-- ein Protokoll, das nicht sagt WER, beantwortet die eine Frage nicht, für die es da ist.
--
-- Deshalb hier eine eng zugeschnittene Funktion statt einer Lockerung von `profiles`: Sie
-- gibt ausschließlich Kennung und E-Mail heraus, und nur an Admin/Superadmin. Wer weniger
-- Rechte hat, bekommt eine leere Liste – das ist RLS-Verhalten und kein Fehler.
-- ---------------------------------------------------------------------
create or replace function public.protokoll_personen()
returns table (id uuid, email text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.email
  from public.profiles p
  where (select coalesce(public.current_user_role(), '')) in ('admin', 'superadmin');
$$;

revoke all on function public.protokoll_personen() from public;
grant execute on function public.protokoll_personen() to authenticated;

-- Gegenprobe.
select
  (select count(*) from pg_trigger where tgname = 'trg_audit_row' and not tgisinternal) as tabellen_protokolliert,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='audit_log' and column_name='auftrag_id')  as auftrag_bezug_da,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='audit_log' and column_name='kunde_id')    as kunde_bezug_da,
  (select count(*) from pg_policies where schemaname='public' and tablename='audit_log')        as anzahl_leseregeln,
  (select count(*) from public.audit_log)                                                       as eintraege_bisher,
  (select count(*) from public.audit_log where auftrag_id is not null)                          as davon_mit_auftrag,
  (to_regprocedure('public.protokoll_personen()') is not null)                                  as namensfunktion_da;

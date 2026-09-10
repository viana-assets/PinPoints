-- =====================================================================
-- Viana PinPoints – 18: Nachvollziehbarkeit und Datenintegrität (Phase 11)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 15 und 16.
--
-- Bisher konnte niemand nachvollziehen, wer einen Datensatz angelegt oder geändert hat:
-- keine Urheber-Spalten, kein Änderungsprotokoll, und `updated_at` wurde außer bei `orders`
-- nirgends automatisch gepflegt (Review-Befund C3/C4). Für ein ERP ist das zu wenig – und für
-- die Rechnungsstellung (Roadmap Phase 5) ist es die Voraussetzung: eine Rechnung muss zeigen
-- können, wer eine Position wann geändert hat.
--
-- Diese Migration ändert nichts an der Oberfläche. Sie ergänzt Spalten, Trigger und
-- Constraints; alle bestehenden Zeilen bekommen `updated_at = now()` und leere Urheber-Felder
-- (rückwirkend lässt sich nicht ermitteln, wer sie angelegt hat).
--
-- Rücknahme im Notfall: supabase/migrations/rollback/18_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Setzt Urheber und Änderungszeitpunkt automatisch. Generisch über jsonb, damit eine einzige
-- Funktion für alle Tabellen reicht und beim nächsten Modul nichts vergessen wird.
-- ---------------------------------------------------------------------
create or replace function public.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  daten jsonb;
  wer uuid := (select auth.uid());
begin
  daten := to_jsonb(new);
  if tg_op = 'INSERT' and daten ? 'created_by' and daten->>'created_by' is null and wer is not null then
    daten := jsonb_set(daten, '{created_by}', to_jsonb(wer));
  end if;
  if tg_op = 'UPDATE' and daten ? 'updated_by' and wer is not null then
    daten := jsonb_set(daten, '{updated_by}', to_jsonb(wer));
  end if;
  if daten ? 'updated_at' then
    daten := jsonb_set(daten, '{updated_at}', to_jsonb(now()));
  end if;
  return jsonb_populate_record(new, daten);
end;
$$;

-- ---------------------------------------------------------------------
-- Änderungsprotokoll. Bewusst als eine Tabelle für alle Objekte (statt je Tabelle eine
-- Historientabelle): einfacher zu pflegen, und für die typische Frage "wer hat diesen
-- Datensatz angefasst?" völlig ausreichend.
--
-- Hinweis zum Wachstum: jede Schreiboperation erzeugt hier eine Zeile mit dem kompletten alten
-- und neuen Zeileninhalt. Das ist für den aktuellen Betrieb unproblematisch; wenn die Tabelle
-- irgendwann groß wird, gehören Zeilen älter als X Monate in ein Archiv (kein automatisches
-- Löschen einbauen – das Protokoll ist genau dann wertvoll, wenn es lückenlos ist).
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigserial primary key,
  tabelle text not null,
  datensatz_id text,
  aktion text not null,
  alt jsonb,
  neu jsonb,
  geaendert_von uuid,
  geaendert_am timestamptz not null default now()
);

create index if not exists idx_audit_log_tabelle_datensatz on public.audit_log (tabelle, datensatz_id);
create index if not exists idx_audit_log_zeitpunkt on public.audit_log (geaendert_am desc);

alter table public.audit_log enable row level security;

-- Lesen darf nur der Superadmin. Schreiben darf niemand direkt – die Zeilen entstehen
-- ausschließlich über den Trigger unten, der als security definer läuft und RLS umgeht.
-- Dadurch kann auch niemand seine eigenen Spuren nachträglich verwischen.
drop policy if exists "Superadmin liest das Protokoll" on public.audit_log;
create policy "Superadmin liest das Protokoll" on public.audit_log
  for select to authenticated
  using ((select coalesce(public.current_user_role(), '')) = 'superadmin');

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt_daten jsonb;
  neu_daten jsonb;
  kennung text;
begin
  if tg_op = 'DELETE' then
    alt_daten := to_jsonb(old);
    neu_daten := null;
    kennung := alt_daten->>'id';
  elsif tg_op = 'UPDATE' then
    alt_daten := to_jsonb(old);
    neu_daten := to_jsonb(new);
    kennung := neu_daten->>'id';
  else
    alt_daten := null;
    neu_daten := to_jsonb(new);
    kennung := neu_daten->>'id';
  end if;

  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values (tg_table_name, kennung, tg_op, alt_daten, neu_daten, (select auth.uid()));

  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Spalten + Trigger auf allen Geschäftstabellen ausrollen. Über eine Schleife, damit beim
-- nächsten Modul nur ein Tabellenname in dieser Liste ergänzt werden muss.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tabellen text[] := array[
    'customers', 'contact_history', 'orders', 'order_articles', 'articles', 'article_prices',
    'vehicles', 'tire_storage', 'warehouses', 'storage_slots', 'employees',
    'module_permissions', 'profiles'
  ];
begin
  foreach t in array tabellen loop
    execute format('alter table public.%I add column if not exists created_by uuid', t);
    execute format('alter table public.%I add column if not exists updated_by uuid', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);

    execute format('drop trigger if exists trg_stamp_row on public.%I', t);
    execute format(
      'create trigger trg_stamp_row before insert or update on public.%I for each row execute procedure public.stamp_row()', t);

    execute format('drop trigger if exists trg_audit_row on public.%I', t);
    execute format(
      'create trigger trg_audit_row after insert or update or delete on public.%I for each row execute procedure public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Der Techniker-Spaltenschutz muss `updated_by` mitzählen: stamp_row() setzt die Spalte im
-- selben UPDATE, und ohne diese Ergänzung würde der Positivlisten-Vergleich aus Migration 15
-- eine eigentlich erlaubte Statusänderung fälschlich ablehnen, sobald sich die Trigger-
-- Reihenfolge einmal ändert.
-- ---------------------------------------------------------------------
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array['status', 'techniker_notiz', 'updated_at', 'updated_by'];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    if (to_jsonb(old) - aenderbar) is distinct from (to_jsonb(new) - aenderbar) then
      raise exception 'Techniker dürfen an einem Auftrag nur Status und Techniker-Notiz ändern.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Restliche Integritätsregeln (Review-Befund C4).
--
-- Beide werden nur angelegt, wenn die vorhandenen Daten sie erfüllen – sonst bricht die
-- Migration mit einer verständlichen Meldung ab statt mit einem Constraint-Fehler. Falls eine
-- Meldung erscheint: die genannten Daten bereinigen und nur diesen Block erneut ausführen.
-- ---------------------------------------------------------------------

-- Ein Lagerplatz-Code darf innerhalb eines Lagers nur einmal vorkommen.
do $$
begin
  if exists (
    select 1 from public.storage_slots group by warehouse_id, code having count(*) > 1
  ) then
    raise notice 'Übersprungen: es gibt doppelte Lagerplatz-Codes innerhalb eines Lagers. Bitte bereinigen, dann diesen Block erneut ausführen.';
  else
    create unique index if not exists storage_slots_code_je_lager
      on public.storage_slots (warehouse_id, code);
  end if;
end $$;

-- Preiszeiträume eines Artikels dürfen sich nicht überlappen. Bisher verhinderte das nur der
-- Anwendungscode (insertArticlePrice schließt den Vorgänger) – ein zweiter gleichzeitiger
-- Client konnte Überschneidungen erzeugen.
create extension if not exists btree_gist;

-- Zuerst bereinigen: einen noch offenen oder zu weit reichenden Zeitraum am Vortag des
-- nächsten Zeitraums schließen. Genau das tut die Anwendung beim Anlegen eines Preises auch.
with folge as (
  select id,
         lead(valid_from) over (partition by article_id order by valid_from) as naechster_start,
         valid_to
  from public.article_prices
)
update public.article_prices p
   set valid_to = folge.naechster_start - 1
  from folge
 where p.id = folge.id
   and folge.naechster_start is not null
   and (folge.valid_to is null or folge.valid_to >= folge.naechster_start);

do $$
begin
  if exists (
    select 1
    from public.article_prices a
    join public.article_prices b
      on a.article_id = b.article_id
     and a.id <> b.id
     and daterange(a.valid_from, coalesce(a.valid_to, 'infinity'::date), '[]')
      && daterange(b.valid_from, coalesce(b.valid_to, 'infinity'::date), '[]')
  ) then
    raise notice 'Übersprungen: es gibt weiterhin überlappende Preiszeiträume. Bitte prüfen, dann diesen Block erneut ausführen.';
  else
    begin
      alter table public.article_prices
        add constraint article_prices_kein_ueberlapp
        exclude using gist (
          article_id with =,
          daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
        );
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

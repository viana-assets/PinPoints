-- =====================================================================
-- Viana PinPoints – 38: Rechnung/Steuer am Auftrag, Endpreis je Position,
--                        Betriebseinstellungen
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 03 (orders), 12 (order_articles),
-- 05 (current_user_role) und 18 (audit_row) – letzteres nur, damit die neue
-- Einstellungstabelle mitprotokolliert wird.
--
-- Konzept: claude/fahrplan-phase-5.md, Block C.
--
-- DIESE MIGRATION FÜGT NUR HINZU. Sie löscht nichts.
--
-- Das ist Absicht und folgt der Projektregel „entfernt eine Migration etwas, das der alte
-- Code noch schreibt, muss der Code zuerst". `order_articles.discount_percent` wird von der
-- LAUFENDEN Fassung noch geschrieben. Also bleibt die Spalte vorerst stehen – unbenutzt,
-- aber unschädlich – und fällt in einer späteren Migration, wenn die neue Fassung überall
-- läuft. Zwei kleine Schritte statt eines Sprungs, bei dem zwischendurch nichts geht.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. „Rechnung benötigt" am Auftrag.
--
-- Der Schalter entscheidet, ob auf den Nettobetrag noch die Steuer kommt. Er steht am
-- AUFTRAG und nicht an der Position: Eine Rechnung schreibt man für den ganzen Vorgang,
-- nicht für einzelne Zeilen darin – und zwei Zeilen desselben Auftrags, von denen eine
-- besteuert wird und die andere nicht, gäbe es in keinem Beleg.
--
-- Voreinstellung `false`: Wer nichts entscheidet, bekommt den Nettobetrag. Eine Steuer, die
-- ungefragt aufschlägt, fällt niemandem auf; eine fehlende schon.
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists rechnung_noetig boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Endpreis statt Prozentrabatt an der Position.
--
-- Bisher gab es `discount_percent`, und der Betrag ergab sich daraus. Im Gespräch läuft es
-- andersherum: „das kostet 50, wir machen 40". Der Endpreis ist die Aussage, der Nachlass die
-- Ableitung – und genau als Ableitung braucht ihn die Auswertung („wie viel Rabatt wurde
-- gegeben" = Listenpreis minus Endpreis).
--
-- NULL heißt „kein Sonderpreis": Dann gilt Menge × Listenpreis. Das ist etwas anderes als
-- eine 0, die „dieser Posten ist geschenkt" bedeutet – beides muss unterscheidbar bleiben.
-- ---------------------------------------------------------------------
alter table public.order_articles
  add column if not exists endpreis_netto numeric(10,2);

do $$
begin
  alter table public.order_articles
    add constraint order_articles_endpreis_nicht_negativ
    check (endpreis_netto is null or endpreis_netto >= 0);
exception when duplicate_object then
  null;
end $$;

-- Bestand: Wo ein Prozentrabatt steht, wird daraus einmalig der Endpreis gerechnet. Danach
-- ist die Prozentangabe nur noch Altpapier – der Code sieht sie nicht mehr an.
update public.order_articles
   set endpreis_netto = round((quantity * net_price * (1 - discount_percent / 100.0))::numeric, 2)
 where endpreis_netto is null
   and coalesce(discount_percent, 0) <> 0;

-- ---------------------------------------------------------------------
-- 3. Betriebseinstellungen – Einstellungen, die für den BETRIEB gelten, nicht für einen
--    Nutzer.
--
-- `user_settings` gibt es schon, aber das ist etwas anderes: Kartenstil und
-- Wiedervorlage-Zeitraum sind Ansichtssachen jedes Einzelnen. Das Terminraster dagegen
-- bestimmt, was in die AUFTRÄGE geschrieben wird – hätte jeder seinen eigenen Wert, hinge
-- die Dauer eines Termins davon ab, wer ihn angelegt hat.
--
-- Der Kniff mit `id boolean primary key check (id)`: Es kann nur eine einzige Zeile geben –
-- `true` ist der einzige erlaubte Schlüssel. Damit braucht niemand eine Regel „bitte nur eine
-- Zeile anlegen", die Datenbank erzwingt es selbst.
-- ---------------------------------------------------------------------
create table if not exists public.betrieb (
  id boolean primary key default true check (id),
  -- In welchen Schritten die Terminlänge vorgeschlagen wird, und wie lang ein Termin ohne
  -- gepflegtes Ende gilt. 30 Minuten als Voreinstellung.
  termin_intervall_min integer not null default 30,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

do $$
begin
  alter table public.betrieb
    add constraint betrieb_intervall_sinnvoll
    check (termin_intervall_min between 5 and 480);
exception when duplicate_object then
  null;
end $$;

insert into public.betrieb (id) values (true) on conflict (id) do nothing;

alter table public.betrieb enable row level security;

-- Lesen dürfen alle Angemeldeten: Das Terminraster braucht jeder, der einen Termin anlegt.
drop policy if exists "Alle lesen die Betriebseinstellungen" on public.betrieb;
create policy "Alle lesen die Betriebseinstellungen" on public.betrieb
  for select to authenticated using (true);

-- Ändern nur Admin und Superadmin. Es gibt bewusst KEINE insert/delete-Regel – die eine Zeile
-- steht, und sie soll stehen bleiben.
drop policy if exists "Admin ändert die Betriebseinstellungen" on public.betrieb;
create policy "Admin ändert die Betriebseinstellungen" on public.betrieb
  for update to authenticated
  using ((select coalesce(public.current_user_role(), '')) in ('admin', 'superadmin'))
  with check ((select coalesce(public.current_user_role(), '')) in ('admin', 'superadmin'));

-- Eine Einstellung, die für alle gilt, gehört ins Protokoll (Migration 36): „Warum sind
-- plötzlich alle Termine 45 Minuten lang?" ist genau die Frage, für die es da ist.
do $$
begin
  if to_regprocedure('public.audit_row()') is not null then
    drop trigger if exists trg_audit_row on public.betrieb;
    create trigger trg_audit_row after insert or update or delete on public.betrieb
      for each row execute procedure public.audit_row();
  else
    raise notice 'public.audit_row() fehlt – Betriebseinstellungen werden nicht protokolliert. Migration 18 fehlt?';
  end if;
end $$;

-- Gegenprobe.
select
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='orders' and column_name='rechnung_noetig')        as schalter_da,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='order_articles' and column_name='endpreis_netto') as endpreis_da,
  (select count(*) from public.betrieb)                                                                 as betriebszeilen,
  (select termin_intervall_min from public.betrieb)                                                     as intervall,
  (select count(*) from public.order_articles where endpreis_netto is not null)                         as positionen_mit_endpreis,
  (select count(*) from public.order_articles where coalesce(discount_percent,0) <> 0
     and endpreis_netto is null)                                                                        as rabatt_nicht_umgerechnet;

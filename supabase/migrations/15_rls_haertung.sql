-- =====================================================================
-- Viana PinPoints – 15: RLS-Härtung (Phase 6)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01, 05, 11, 13.
--
-- Schließt die im Architektur-Review vom 28.08.2026 gefundenen kritischen
-- Lücken (siehe docs/architektur-review-2026-08.md, Befunde A1/A3/A4/A5,
-- B3, C4). Ändert kein sichtbares Verhalten für Admin/Superadmin/Nutzer –
-- es wird ausschließlich verhindert, was ohnehin nie vorgesehen war.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/15_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- A4: security-definer-Funktionen mit fixiertem Suchpfad neu anlegen.
--
-- Ohne `set search_path = ''` bestimmt der Suchpfad des Aufrufers, welche
-- Tabelle/Funktion innerhalb einer mit erhöhten Rechten laufenden Funktion
-- getroffen wird. Deshalb hier fixiert und alle Objekte voll qualifiziert.
-- ---------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_employee_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from public.employees where profile_id = (select auth.uid()) limit 1;
$$;

-- A8: Der ADMIN_EMAIL-Zweig wird ersatzlos entfernt. `current_setting(
-- 'app.admin_email', true)` ist in einer Supabase-Instanz nie gesetzt und
-- lieferte immer null – jeder neue Account bekam ohnehin 'user'. Die
-- Superadmin-Rolle wird bewusst über die Nutzerverwaltung vergeben.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Neue Hilfsfunktion: "gehört dieser Auftrag dem aktuell eingeloggten
-- Techniker?" – security definer, damit die Abfrage auf order_employees
-- nicht rekursiv erneut durch die RLS-Policies derselben Tabelle läuft
-- (das wäre ein Endlosfehler). Wird von den Policies auf orders,
-- order_employees und order_articles gemeinsam benutzt.
-- ---------------------------------------------------------------------
create or replace function public.is_own_order(p_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_employees oe
    where oe.order_id = p_order_id
      and oe.employee_id = public.current_employee_id()
  );
$$;

-- ---------------------------------------------------------------------
-- A1: Rechteausweitung über die eigene Profilzeile unterbinden.
--
-- Die Policy "Nutzer aktualisiert eigenes Profil" beschränkt nur, WELCHE
-- ZEILE geändert werden darf – nicht, welche Spalte. Damit konnte sich
-- jeder eingeloggte Account per direktem API-Aufruf selbst die Rolle
-- 'superadmin' setzen. Ein Spalten-Grant hilft hier nicht, weil auch der
-- Superadmin technisch die Rolle `authenticated` trägt; deshalb ein
-- Trigger, der den Rollenwechsel auf Superadmin (bzw. den Service-Role-Key
-- der Einladungs-Route) beschränkt.
--
-- Wichtig: coalesce(...) um current_user_role(), weil ein NULL-Vergleich
-- die ganze Bedingung zu NULL machen und die Prüfung damit aushebeln würde.
-- ---------------------------------------------------------------------
create or replace function public.restrict_profile_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce((select auth.role()), '') <> 'service_role'
     and coalesce(public.current_user_role(), '') <> 'superadmin' then
    raise exception 'Nur ein Superadmin darf die Rolle eines Profils ändern.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_profile_role_change on public.profiles;
create trigger trg_restrict_profile_role_change
  before update on public.profiles
  for each row execute procedure public.restrict_profile_role_change();

-- ---------------------------------------------------------------------
-- A5: Spalten-Schutz für Techniker von Negativ- auf Positivliste umstellen.
--
-- Bisher zählte der Trigger auf, was NICHT geändert werden darf. Jede
-- künftig zu `orders` hinzugefügte Spalte (Rechnungsnummer, Freigabe, …)
-- wäre damit ab dem Tag ihres Anlegens für Techniker frei änderbar, ohne
-- dass jemand daran denkt. Jetzt umgekehrt: alles außer status und
-- techniker_notiz muss unverändert bleiben.
-- ---------------------------------------------------------------------
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array['status', 'techniker_notiz', 'updated_at'];
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
-- A3: Die Techniker-Einschränkung aus Migration 13 war umgehbar.
--
-- `order_articles` war für jeden Eingeloggten lesbar und enthält order_id –
-- darüber ließen sich die IDs aller Aufträge auslesen. `order_employees`
-- war für jeden Eingeloggten beschreibbar – ein Techniker konnte sich damit
-- selbst einem fremden Auftrag zuordnen und ihn anschließend über die
-- Policy "Techniker sieht eigene Aufträge" öffnen. Beide Tabellen bekommen
-- deshalb dasselbe Muster wie orders.
-- ---------------------------------------------------------------------

drop policy if exists "Eingeloggte Nutzer verwalten Auftrags-Mitarbeiter" on public.order_employees;

create policy "Nicht-Techniker verwalten Auftrags-Mitarbeiter" on public.order_employees
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

-- Lesen darf der Techniker die Zuordnungen der Aufträge, auf denen er selbst
-- steht – inklusive der Kollegen, die mit ihm eingeteilt sind (bei größeren
-- Aufträgen arbeiten mehrere zusammen, siehe Migration 11).
create policy "Techniker liest Zuordnungen eigener Auftraege" on public.order_employees
  for select to authenticated
  using (
    public.current_user_role() = 'techniker'
    and public.is_own_order(order_id)
  );

drop policy if exists "Eingeloggte Nutzer verwalten Auftrags-Artikel" on public.order_articles;

create policy "Nicht-Techniker verwalten Auftrags-Artikel" on public.order_articles
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

-- Techniker sieht die Leistungen seiner eigenen Aufträge (er muss wissen,
-- was zu tun ist), darf sie aber nicht ändern – die Zuordnung von
-- Leistungen bleibt Büro-Sache, so wie es die Oberfläche schon vorsieht.
create policy "Techniker liest Artikel eigener Auftraege" on public.order_articles
  for select to authenticated
  using (
    public.current_user_role() = 'techniker'
    and public.is_own_order(order_id)
  );

-- ---------------------------------------------------------------------
-- Die Auftrags-Policies aus Migration 13 auf die neue Hilfsfunktion
-- umstellen: fachlich identisch, aber die Unterabfrage läuft jetzt einmal
-- pro Auftrag statt als Inline-EXISTS pro geprüfter Zeile, und sie
-- profitiert vom neuen Index auf order_employees(employee_id).
-- ---------------------------------------------------------------------
drop policy if exists "Nicht-Techniker verwalten Aufträge" on public.orders;
drop policy if exists "Techniker sieht eigene Aufträge" on public.orders;
drop policy if exists "Techniker aktualisiert eigene Aufträge" on public.orders;

create policy "Nicht-Techniker verwalten Auftraege" on public.orders
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

create policy "Techniker sieht eigene Auftraege" on public.orders
  for select to authenticated
  using (
    public.current_user_role() = 'techniker'
    and public.is_own_order(id)
  );

create policy "Techniker aktualisiert eigene Auftraege" on public.orders
  for update to authenticated
  using (
    public.current_user_role() = 'techniker'
    and public.is_own_order(id)
  )
  with check (
    public.current_user_role() = 'techniker'
    and public.is_own_order(id)
  );

-- ---------------------------------------------------------------------
-- C4: Ein Lagerplatz kann nur EINE aktive Belegung haben.
--
-- Bisher nur eine Annahme der Oberfläche ("die zuletzt aktualisierte Zeile
-- ist die aktuelle Belegung"). Zwei parallele Zuordnungen erzeugten zwei
-- aktive Zeilen, und welche angezeigt wird, war Zufall. Vorhandene
-- Doppelbelegungen werden vorher bereinigt: die jüngste bleibt aktiv, die
-- älteren wandern in die Historie – sonst könnte der Index nicht angelegt
-- werden.
-- ---------------------------------------------------------------------
with doppelt as (
  select id,
         row_number() over (
           partition by storage_slot_id
           order by updated_at desc nulls last, created_at desc
         ) as rn
  from public.tire_storage
  where removed_at is null
)
update public.tire_storage t
   set removed_at = now()
  from doppelt
 where t.id = doppelt.id
   and doppelt.rn > 1;

create unique index if not exists tire_storage_ein_aktiver_satz_je_platz
  on public.tire_storage (storage_slot_id)
  where removed_at is null;

-- ---------------------------------------------------------------------
-- B3: Indizes. Postgres legt für Fremdschlüssel KEINE Indizes an – bisher
-- gab es im ganzen Schema außer den Primärschlüsseln keinen einzigen.
-- Besonders order_employees(employee_id) und employees(profile_id) sind
-- wichtig, weil current_employee_id()/is_own_order() bei jedem einzelnen
-- Zugriff auf Aufträge ausgewertet werden.
-- ---------------------------------------------------------------------
create index if not exists idx_orders_customer_id       on public.orders (customer_id);
create index if not exists idx_orders_order_date        on public.orders (order_date);
create index if not exists idx_orders_status            on public.orders (status);
create index if not exists idx_order_employees_employee on public.order_employees (employee_id);
create index if not exists idx_order_articles_order     on public.order_articles (order_id);
create index if not exists idx_order_articles_article   on public.order_articles (article_id);
create index if not exists idx_contact_history_customer on public.contact_history (customer_id);
create index if not exists idx_vehicles_customer        on public.vehicles (customer_id);
create index if not exists idx_vehicles_stored_tire     on public.vehicles (stored_tire_storage_id);
create index if not exists idx_tire_storage_slot        on public.tire_storage (storage_slot_id);
create index if not exists idx_tire_storage_customer    on public.tire_storage (customer_id);
create index if not exists idx_storage_slots_warehouse  on public.storage_slots (warehouse_id);
create index if not exists idx_article_prices_article   on public.article_prices (article_id);
create index if not exists idx_employees_profile        on public.employees (profile_id);
-- Kundenliste wird nach Name sortiert und nach Name/Adresse durchsucht.
create index if not exists idx_customers_name           on public.customers (name);
create index if not exists idx_customers_active         on public.customers (active);

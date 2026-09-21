-- Rücknahme von Migration 42: zurück auf einen Haken je Bereich.
--
-- Was zurückkommt: die Richtlinien aus Migration 16 (ein Recht je Modul, über
-- `has_module_permission`), die Auftrags-Richtlinien aus 13/15 und die Leistungs-Richtlinie
-- aus 41.
--
-- Was BLEIBT: die Spalten `read_roles`/`delete_roles` und die neuen Zeilen in
-- `module_permissions`. Sie stören nicht und werden schlicht nicht mehr gelesen – wer die
-- Migration später erneut ausführt, findet seine Einstellungen wieder vor. Die alten
-- `view.*`- und `action.*`-Zeilen hat Migration 42 nie gelöscht, sie sind also noch da.
--
-- Zuerst den Anwendungscode zurückdrehen: Die neue Fassung liest drei Spalten und zeigt neun
-- Haken; mit den alten Richtlinien dahinter wäre das eine Anzeige, die nichts mehr bedeutet.

begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception 'FALSCHES PROJEKT (Datenbank: %) - diese Rücknahme gehört zu PinPoints.', current_database();
  end if;
end $$;

-- 1. Löschschutz weg
do $$
declare t text;
begin
  foreach t in array array['customers','contact_history','vehicles','orders','order_articles',
                           'warehouses','storage_slots','tire_storage','eingelagerte_raeder',
                           'articles','article_prices','employees','firmenfahrzeuge'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_loeschrecht on public.%I', t);
    execute format('drop trigger if exists trg_loeschrecht_soft on public.%I', t);
  end loop;
end $$;
drop function if exists public.pruefe_loeschrecht();

-- 2. Die neuen Richtlinien weg
do $$
declare
  paar text[][] := array[
    array['customers','kunden'], array['contact_history','kunden'], array['vehicles','kunden'],
    array['warehouses','lager.regale'], array['storage_slots','lager.regale'],
    array['articles','artikel'], array['article_prices','artikel'],
    array['employees','mitarbeiter'], array['firmenfahrzeuge','firmenfahrzeuge']
  ];
  i int; t text; b text;
begin
  for i in 1..array_length(paar, 1) loop
    t := paar[i][1]; b := paar[i][2];
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "Bereich %s lesen" on public.%I', b, t);
    execute format('drop policy if exists "Bereich %s schreiben" on public.%I', b, t);
    execute format('drop policy if exists "Bereich %s aendern" on public.%I', b, t);
    execute format('drop policy if exists "Bereich %s loeschen" on public.%I', b, t);
  end loop;
end $$;

drop policy if exists "Bereich auftraege lesen" on public.orders;
drop policy if exists "Bereich auftraege schreiben" on public.orders;
drop policy if exists "Bereich auftraege aendern" on public.orders;
drop policy if exists "Bereich auftraege loeschen" on public.orders;
drop policy if exists "Bereich auftraege mitarbeiter lesen" on public.order_employees;
drop policy if exists "Bereich auftraege mitarbeiter schreiben" on public.order_employees;
drop policy if exists "Bereich einlagerung lesen" on public.tire_storage;
drop policy if exists "Bereich einlagerung schreiben" on public.tire_storage;
drop policy if exists "Bereich einlagerung aendern" on public.tire_storage;
drop policy if exists "Bereich raeder lesen" on public.eingelagerte_raeder;
drop policy if exists "Bereich raeder schreiben" on public.eingelagerte_raeder;
drop policy if exists "Bereich raeder aendern" on public.eingelagerte_raeder;
drop policy if exists "Bereich raeder loeschen" on public.eingelagerte_raeder;
drop policy if exists "Bereich auftraege leistungen lesen" on public.order_articles;
drop policy if exists "Bereich auftraege leistungen schreiben" on public.order_articles;

-- 3. Die Richtlinien von damals zurück
create policy "Nicht-Techniker verwalten Aufträge" on public.orders
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

create policy "Techniker sieht eigene Aufträge" on public.orders
  for select to authenticated
  using (coalesce(public.current_user_role(), '') = 'techniker' and public.is_own_order(id));

create policy "Nicht-Techniker verwalten Auftrags-Mitarbeiter" on public.order_employees
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

create policy "Techniker liest eigene Zuordnungen" on public.order_employees
  for select to authenticated
  using (coalesce(public.current_user_role(), '') = 'techniker' and public.is_own_order(order_id));

create policy "Nicht-Techniker verwalten Auftrags-Artikel" on public.order_articles
  for all to authenticated
  using (coalesce(public.current_user_role(), '') <> 'techniker')
  with check (coalesce(public.current_user_role(), '') <> 'techniker');

create policy "Techniker verwaltet Artikel eigener Auftraege" on public.order_articles
  for all to authenticated
  using ((select public.current_user_role()) = 'techniker' and public.is_own_order(order_id))
  with check ((select public.current_user_role()) = 'techniker' and public.is_own_order(order_id));

-- 4. Die alten Modul-Richtlinien aus Migration 16 zurück
do $$
declare
  paar text[][] := array[
    array['customers','view.kunden'], array['contact_history','view.kunden'], array['vehicles','view.kunden'],
    array['warehouses','action.lager.warehouse_create'], array['storage_slots','action.lager.slot_create'],
    array['tire_storage','action.lager.tire_assign'],
    array['employees','action.admin.employee_manage']
  ];
  i int; t text; k text;
begin
  for i in 1..array_length(paar, 1) loop
    t := paar[i][1]; k := paar[i][2];
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "Modulrecht %s" on public.%I', t, t);
    execute format($f$create policy "Modulrecht %s" on public.%I for all to authenticated using (public.has_module_permission(%L)) with check (public.has_module_permission(%L))$f$, t, t, k, k);
  end loop;
end $$;

-- Artikel und Preise lagen schon vor 42 fest bei Admin/Superadmin (Migration 12).
drop policy if exists "Artikel lesen" on public.articles;
create policy "Artikel lesen" on public.articles for select to authenticated using (true);
drop policy if exists "Artikel pflegen" on public.articles;
create policy "Artikel pflegen" on public.articles for all to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin','superadmin'))
  with check (coalesce(public.current_user_role(), '') in ('admin','superadmin'));
drop policy if exists "Artikelpreise lesen" on public.article_prices;
create policy "Artikelpreise lesen" on public.article_prices for select to authenticated using (true);
drop policy if exists "Artikelpreise pflegen" on public.article_prices;
create policy "Artikelpreise pflegen" on public.article_prices for all to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin','superadmin'))
  with check (coalesce(public.current_user_role(), '') in ('admin','superadmin'));

drop function if exists public.darf(text, text);
drop function if exists public.ist_kollege(uuid);

commit;

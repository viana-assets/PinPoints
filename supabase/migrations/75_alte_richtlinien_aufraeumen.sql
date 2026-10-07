-- =====================================================================
-- Migration 75 – Alte Richtlinien aus den Migrationen 13–16 aufräumen; Transporter bleibt beim Büro
-- (07.10.2026, v121).
--
-- Befund 07.10.2026 (Prüfabfrage in der Produktivdatenbank, Bildschirmfoto): Neben den Richtlinien
-- „Bereich …“ aus Migration 42, die die Rechtetabelle abfragen, stehen noch 39 ältere aus den
-- Migrationen 13–16. Mehrere Richtlinien für dieselbe Aktion werden ODER-verknüpft (CLAUDE.md,
-- Abschnitt 2) – die alten lockerten also jede neue wieder auf:
--   - „Kunden lesen“, „Kontakthistorie lesen“, „Fahrzeuge lesen“, „Mitarbeiter lesen“: true – jeder
--     Angemeldete, auch der Techniker, konnte über die Schnittstelle ALLE Kunden, die ganze
--     Kontakthistorie, alle Fahrzeuge und alle Mitarbeiter lesen (die App zeigte es nicht).
--   - „Nicht-Techniker verwalten Auftraege“: Für jede Rolle außer Techniker galt bei Aufträgen die
--     Rechtetabelle nicht. Migration 42 wollte sie entfernen, schrieb den Namen aber mit „ä“.
--   - „Eingeloggte Nutzer verwalten eingelagerte Räder“: jeder Angemeldete alles an Radmessungen.
--   - Die übrigen fragen alte Schlüssel ab (`view.kunden`, `action.lager.…` über
--     `has_module_permission()`), die in der Rechtetabelle nicht mehr zu sehen und nicht mehr zu
--     ändern sind – ein Haken, den man wegnimmt, hätte dort nichts bewirkt.
-- Entschieden 07.10.2026 (Vitali): aufräumen.
--
-- Was danach gilt: allein die Richtlinien „Bereich …“ – also genau die Rechtetabelle, für den
-- Techniker mit den Einschränkungen auf eigene Aufträge, eigene Kunden und Kollegen (Migration
-- 42/45). Eine Lücke, die nur die alten Richtlinien gefüllt hatten, wird hier geschlossen:
--   - Einlagerungen löschen: Die App tut das nie (auslagern setzt `removed_at`); Migration 42 hat
--     bewusst keine Löschrichtlinie angelegt. „Einlagerungen loeschen“ entfällt ersatzlos.
--   - Artikel und Preise liest der Techniker für die Leistungen am Auftrag – das Recht „Artikel
--     lesen“ hat er nicht. Neu: „Artikel für Leistungen lesen“ für alle, die Leistungen lesen
--     dürfen (dieselbe Form wie bei den Auftragsvorlagen, Migration 63).
-- Sichtbare Folge für den Techniker: Im Lager stehen bei Sätzen von Kunden, bei denen er keinen
-- Auftrag hat, kein Name und kein Kennzeichen mehr – so war es in Migration 45 vorgesehen.
--
-- Dazu (Entscheidung 07.10.2026): Den Transporter am Auftrag teilt das Büro ein. Die Oberfläche
-- bot ihn dem Techniker schon nicht an, die Datenbank hätte es seit Migration 41 aber erlaubt –
-- `firmenfahrzeug_id` kommt in die Liste der Spalten, die der Techniker nicht ändert.
--
-- Sicher gegen den Editor (CLAUDE.md, Abschnitt 2): Das Aufräumen ist EINE Anweisung (ein
-- do-Block). Er prüft zuerst, dass es für jede betroffene Tabelle und jede Aktion eine Richtlinie
-- „Bereich …“ gibt, und bricht sonst ab, ohne etwas zu entfernen.
--
-- Reihenfolge: nach 74, SQL zuerst, dann die Dateien von v121.
-- =====================================================================

do $$
declare
  alt text[][] := array[
    array['article_prices', 'Artikelpreise lesen'],
    array['article_prices', 'Artikelpreise pflegen'],
    array['articles', 'Artikel lesen'],
    array['articles', 'Artikel pflegen'],
    array['contact_history', 'Kontakthistorie aendern'],
    array['contact_history', 'Kontakthistorie lesen'],
    array['contact_history', 'Kontakthistorie loeschen'],
    array['contact_history', 'Kontakthistorie schreiben'],
    array['customers', 'Kunden aendern'],
    array['customers', 'Kunden anlegen'],
    array['customers', 'Kunden lesen'],
    array['customers', 'Kunden loeschen'],
    array['eingelagerte_raeder', 'Eingeloggte Nutzer verwalten eingelagerte Räder'],
    array['employees', 'Mitarbeiter aendern'],
    array['employees', 'Mitarbeiter anlegen'],
    array['employees', 'Mitarbeiter lesen'],
    array['employees', 'Mitarbeiter loeschen'],
    array['firmenfahrzeuge', 'Firmenfahrzeuge lesen'],
    array['firmenfahrzeuge', 'Firmenfahrzeuge pflegen'],
    array['order_employees', 'Techniker liest Zuordnungen eigener Auftraege'],
    array['orders', 'Nicht-Techniker verwalten Auftraege'],
    array['orders', 'Techniker aktualisiert eigene Auftraege'],
    array['orders', 'Techniker sieht eigene Auftraege'],
    array['storage_slots', 'Lagerplaetze aendern'],
    array['storage_slots', 'Lagerplaetze anlegen'],
    array['storage_slots', 'Lagerplaetze lesen'],
    array['storage_slots', 'Lagerplaetze loeschen'],
    array['tire_storage', 'Einlagerungen aendern'],
    array['tire_storage', 'Einlagerungen anlegen'],
    array['tire_storage', 'Einlagerungen lesen'],
    array['tire_storage', 'Einlagerungen loeschen'],
    array['vehicles', 'Fahrzeuge aendern'],
    array['vehicles', 'Fahrzeuge lesen'],
    array['vehicles', 'Fahrzeuge loeschen'],
    array['vehicles', 'Fahrzeuge schreiben'],
    array['warehouses', 'Lager anlegen'],
    array['warehouses', 'Lager bearbeiten'],
    array['warehouses', 'Lager lesen'],
    array['warehouses', 'Lager loeschen']
  ];
  tabellen text[] := array['article_prices', 'articles', 'contact_history', 'customers', 'eingelagerte_raeder', 'employees', 'firmenfahrzeuge', 'order_employees', 'orders', 'storage_slots', 'tire_storage', 'vehicles', 'warehouses'];
  t text; aktion text; fehlt text[] := '{}'; i int;
begin
  -- 1. Gibt es überall Ersatz?
  foreach t in array tabellen loop
    foreach aktion in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      -- Eine Einlagerung wird nie gelöscht, nur ausgelagert (`removed_at`) – Migration 42 hat
      -- dort bewusst keine Löschrichtlinie. Die alte „Einlagerungen loeschen“ fällt ersatzlos weg.
      continue when t = 'tire_storage' and aktion = 'DELETE';
      if not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t and p.policyname like 'Bereich %'
           and (p.cmd = aktion or p.cmd = 'ALL')
      ) then
        fehlt := array_append(fehlt, t || ' ' || aktion);
      end if;
    end loop;
  end loop;
  if array_length(fehlt, 1) > 0 then
    raise exception 'Abgebrochen, nichts entfernt: Für % fehlt die Richtlinie „Bereich …“ (Migration 42). Bitte zuerst prüfen.',
      array_to_string(fehlt, ', ');
  end if;

  -- 2. Ersatz für das, was nur die alten Richtlinien gaben: Artikel und Preise für die Leistungen.
  execute 'drop policy if exists "Artikel für Leistungen lesen" on public.articles';
  execute $p$create policy "Artikel für Leistungen lesen" on public.articles
    for select to authenticated using (public.darf('auftraege.leistungen', 'lesen'))$p$;
  execute 'drop policy if exists "Artikel für Leistungen lesen" on public.article_prices';
  execute $p$create policy "Artikel für Leistungen lesen" on public.article_prices
    for select to authenticated using (public.darf('auftraege.leistungen', 'lesen'))$p$;

  -- 3. Die alten Richtlinien entfernen.
  for i in 1..array_length(alt, 1) loop
    execute format('drop policy if exists %I on public.%I', alt[i][2], alt[i][1]);
  end loop;
end $$;

-- Der Transporter bleibt beim Büro (Entscheidung 07.10.2026). Sonst unverändert wie Migration 41.
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  -- Was ein Techniker NICHT anfassen darf. Kurz und stabil gehalten: Es sind genau die
  -- Felder, mit denen man einen Auftrag wegnimmt oder ihm eine andere Identität gibt.
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    -- Wegnehmen: Stornieren und Löschen.
    'cancelled_at', 'cancelled_by', 'cancel_reason', 'deleted_at',
    -- Wiedereröffnen ist Admin-Sache (Migration 20); ohne diesen Grund geht es ohnehin nicht.
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    -- Migration 75: Den Transporter teilt das Büro ein.
    if old.firmenfahrzeug_id is distinct from new.firmenfahrzeug_id then
      raise exception 'Den Transporter teilt das Büro ein.';
    end if;
    -- Verglichen wird nur die gesperrte Teilmenge: Ändert sich dort etwas, ist es abgelehnt.
    -- Alles übrige darf sich ändern, ohne dass es hier aufgezählt werden muss.
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht stornieren, löschen, wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$f$;

-- Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
select 'Alte Richtlinien noch vorhanden (sollte 0 sein)' as pruefung,
       (select count(*) from pg_policies p
         where p.schemaname = 'public'
           and p.tablename = any (array['article_prices', 'articles', 'contact_history', 'customers', 'eingelagerte_raeder', 'employees', 'firmenfahrzeuge', 'order_employees', 'orders', 'storage_slots', 'tire_storage', 'vehicles', 'warehouses'])
           and p.policyname not like 'Bereich %'
           and p.policyname not in ('Techniker legt Fahrzeug eigener Kunden an', 'Artikel für Leistungen lesen'))::text as ergebnis
union all
select 'Artikel für Leistungen lesen',
       (select count(*) from pg_policies where schemaname = 'public' and policyname = 'Artikel für Leistungen lesen')::text || ' von 2'
union all
select 'Transporter gesperrt für Techniker',
       (position('firmenfahrzeug_id' in pg_get_functiondef('public.restrict_techniker_order_update()'::regprocedure)) > 0)::text;

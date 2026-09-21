-- Migration 42: Rechte als Lesen / Schreiben / Löschen je Rolle
--
-- Bisher hatte jeder Bereich EINEN Haken je Rolle, dazu eine Handvoll eigener Zeilen für
-- einzelne Lager-Aktionen. Gewachsen, ungleichmäßig, und man musste raten: Meinte der Haken
-- bei „Lager" nur das Sehen oder auch das Löschen?
--
-- Ab jetzt: ein Bereich, drei Verben, je Rolle ein Haken – und jeder davon wird von der
-- DATENBANK durchgesetzt. Ein Löschen-Haken, den nur die Oberfläche kennt, ist eine Zusage,
-- die das Programm nicht hält: Wer die API direkt anspricht, löscht trotzdem.
--
-- ============================================================================
-- ZWEI EBENEN, UND WARUM SIE NÖTIG SIND
-- ============================================================================
-- Ein erster Entwurf dieser Migration schnitt die Bereiche an TABELLEN: „Lager und
-- Lagerplätze", „Eingelagerte Reifen". Beim Durchsprechen fiel auf, dass das niemand deuten
-- kann, der die Datenbank nicht kennt – und dass zwei Haken dadurch schlicht falsch saßen:
--
--   * „Löschen" bei den eingelagerten Reifen hätte NICHT das Auslagern gesteuert. Auslagern
--     ist ein `update` (`removed_at` setzen); gelöscht wird eine Einlagerung nie. Der Haken
--     hätte in Wahrheit das Entfernen einer Radmessung geregelt – und ausgesehen, als ginge
--     es ums Auslagern.
--   * Eine Leistung aus einem Auftrag zu entfernen hing am selben „Löschen" wie das
--     Wegwerfen des ganzen Auftrags. Ein Techniker konnte damit eine Leistung eintragen, aber
--     seinen eigenen Tippfehler nicht mehr korrigieren – genau der Umweg über das Büro, den
--     Migration 41 gerade abgeschafft hatte.
--
-- Deshalb jetzt zweistufig, und die Zeilen heißen nach dem, was man TUT:
--
--   auftraege               Modul: darf der Reiter geöffnet werden?
--   auftraege.auftrag       den Auftrag selbst anlegen, ändern, wegwerfen
--   auftraege.leistungen    Leistungen eintragen und wieder entfernen (= korrigieren)
--   auftraege.einteilung    wer fährt hin
--   lager                   Modul
--   lager.regale            Lager und Plätze als Struktur
--   lager.einlagerung       Reifen ein- und auslagern (kein Löschen – siehe oben)
--   lager.raeder            Räder einzeln messen
--
-- ============================================================================
-- WAS DIESE MIGRATION NICHT ANFASST, und zwar mit Absicht:
--
--   * Die Techniker-Regel „nur eigene Aufträge" (Migration 13/15) bleibt UNVERÄNDERT und gilt
--     ZUSÄTZLICH. Ein Techniker mit „Auftrag lesen" sieht weiterhin nur seine eigenen.
--   * Der Spaltenschutz aus Migration 41 (was ein Techniker am Auftrag nicht ändern darf).
--   * Das Einfrieren abgeschlossener Aufträge (Migration 20).
--   * Superadmin darf weiterhin alles, unabhängig von dieser Tabelle.
--
-- NEU HINZU: Ein Techniker sieht bei den Mitarbeitern nur noch sich selbst und Kollegen, die
-- mit ihm auf einem Auftrag stehen. Bisher lag dort die vollständige Belegschaft offen und nur
-- die Oberfläche blendete sie aus – zwei verschiedene Wahrheiten für dieselbe Frage.
--
-- ÜBERNAHME DER BISHERIGEN EINSTELLUNGEN – jede Zeile wird abgebildet, nichts fällt weg:
--
--   view.<bereich>              -> <bereich>.lesen        (der alte Haken war ein Sehen-Haken)
--   view.neuer_kunde            -> kunden.schreiben
--   view.inaktive_kunden        -> geht in kunden.lesen auf
--   action.lager.tire_assign    -> lager.einlagerung + lager.raeder (schreiben)
--   action.lager.slot_create    \
--   action.lager.warehouse_*    -> lager.regale.schreiben  (Vereinigung)
--   action.lager.slot_delete    \
--   action.lager.warehouse_del. -> lager.regale.loeschen   (Vereinigung)
--
-- Wo mehrere alte Zeilen auf ein Verb fallen, gilt die VEREINIGUNG: Eine Umstellung darf
-- niemandem wegnehmen, was er gestern konnte. Wer es enger will, hakt es danach ab – das ist
-- ein Klick und fällt auf. Ein stilles Wegnehmen fällt nicht auf.
--
-- Rücknahme: rollback/42_rollback.sql.

begin;

-- ---------------------------------------------------------------------
-- PROJEKTWACHE. Zuerst, vor allem anderen.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die Tabelle: aus einem Rollenfeld werden drei
--
-- `edit_roles` bleibt und wird zu „schreiben". Umbenennen wäre sauberer gewesen, hätte aber
-- jede Zeile Bestandscode mitgerissen, der sie noch liest – und eine Spalte, die während des
-- Umbaus zwei Namen hat, ist schlimmer als eine, die anders heißt als sie meint.
-- ---------------------------------------------------------------------
alter table public.module_permissions
  add column if not exists read_roles   text[] not null default '{}'::text[],
  add column if not exists delete_roles text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------
-- 2. Die Übernahme
--
-- Ein Helfer, weil dieselbe Frage zwanzigmal kommt: Was stand bisher in dieser alten Zeile?
-- Fehlt sie, gilt der mitgegebene Vorgabewert.
-- ---------------------------------------------------------------------
create or replace function pg_temp.alt(p_key text, p_vorgabe text[])
returns text[] language sql stable as $$
  select coalesce((select edit_roles from public.module_permissions where module_key = p_key), p_vorgabe);
$$;

-- Und einer für die Vereinigung mehrerer alter Zeilen.
-- `variadic` ginge hier nicht: Eine variadische Liste sammelt EINZELWERTE in ein Array,
-- übergeben werden aber ganze Arrays. Deshalb drei benannte Parameter mit Vorgabe.
create or replace function pg_temp.vereinigt(a text[], b text[] default '{}', c text[] default '{}')
returns text[] language sql immutable as $$
  select array(select distinct unnest(a || b || c));
$$;

insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values
  -- Module (nur „sehen")
  ('dashboard',              pg_temp.alt('view.dashboard',      '{admin,techniker,user}'), '{}', '{}'),
  ('auftraege',              pg_temp.alt('view.auftraege',      '{admin,techniker,user}'), '{}', '{}'),
  ('termine',                pg_temp.alt('view.termine',        '{admin,techniker,user}'), '{}', '{}'),
  ('einsatzplanung',         pg_temp.alt('view.einsatzplanung', '{admin,techniker,user}'), '{}', '{}'),
  ('lager',                  pg_temp.alt('view.lager',          '{admin,techniker,user}'), '{}', '{}'),
  ('saison',                 pg_temp.alt('view.saison',         '{admin,user}'),           '{}', '{}'),
  ('auswertung',             pg_temp.alt('view.auswertung',     '{admin}'),                '{}', '{}'),

  -- Kunden: ein Datenbereich, deshalb ohne Unterzeile. Schreiben kommt aus „Neuer Kunde".
  ('kunden',                 pg_temp.alt('view.kunden',         '{admin,user}'),
                             pg_temp.alt('view.neuer_kunde',    '{admin,user}'),
                             '{admin}'),

  -- Aufträge, dreigeteilt nach dem, was man tut.
  ('auftraege.auftrag',      pg_temp.alt('view.auftraege', '{admin,techniker,user}'),
                             pg_temp.alt('view.auftraege', '{admin,techniker,user}'),
                             '{admin,user}'),
  -- Leistungen: Löschen heißt hier KORRIGIEREN, nicht wegwerfen – deshalb bekommt es, wer
  -- auch schreiben darf. Ohne das könnte ein Techniker eine Leistung eintragen, aber seinen
  -- eigenen Tippfehler nicht mehr entfernen.
  ('auftraege.leistungen',   pg_temp.alt('view.auftraege', '{admin,techniker,user}'),
                             pg_temp.alt('view.auftraege', '{admin,techniker,user}'),
                             pg_temp.alt('view.auftraege', '{admin,techniker,user}')),
  -- Einteilung: bewusst OHNE Techniker, unabhängig davon, was in view.auftraege stand.
  -- Wer sich selbst Aufträge zuteilen kann, teilt sich auch fremde zu.
  ('auftraege.einteilung',   pg_temp.alt('view.auftraege', '{admin,techniker,user}'),
                             '{admin,user}', '{}'),

  -- Lager, dreigeteilt.
  ('lager.regale',           pg_temp.alt('view.lager', '{admin,techniker,user}'),
                             pg_temp.vereinigt(pg_temp.alt('action.lager.slot_create',     '{admin}'),
                                               pg_temp.alt('action.lager.warehouse_create','{admin}'),
                                               pg_temp.alt('action.lager.warehouse_edit',  '{admin}')),
                             pg_temp.vereinigt(pg_temp.alt('action.lager.slot_delete',     '{admin}'),
                                               pg_temp.alt('action.lager.warehouse_delete','{admin}'))),
  -- Einlagerung: kein Löschen. Auslagern ist das Schreiben; die Zeile bleibt als Historie.
  ('lager.einlagerung',      pg_temp.alt('view.lager', '{admin,techniker,user}'),
                             pg_temp.alt('action.lager.tire_assign', '{admin,techniker,user}'),
                             '{}'),
  -- Radmessungen: Löschen heißt auch hier korrigieren.
  ('lager.raeder',           pg_temp.alt('view.lager', '{admin,techniker,user}'),
                             pg_temp.alt('action.lager.tire_assign', '{admin,techniker,user}'),
                             pg_temp.alt('action.lager.tire_assign', '{admin,techniker,user}')),

  -- Stammdaten.
  ('artikel',                pg_temp.alt('view.artikel',        '{admin,user}'),           '{admin}', '{admin}'),
  ('mitarbeiter',            '{admin,techniker,user}',                                     '{admin}', '{admin}'),
  ('firmenfahrzeuge',        '{admin,techniker,user}',                                     '{admin}', '{admin}'),
  ('einstellungen',          pg_temp.alt('view.einstellungen',  '{admin,techniker,user}'),
                             pg_temp.alt('view.einstellungen',  '{admin,techniker,user}'), '{}')
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Die Prüffunktion
--
-- EINE Funktion für alle Richtlinien. Wer ein Verb ergänzt oder einen Bereich umbenennt,
-- ändert eine Stelle – nicht dreißig.
--
-- `security definer`, weil die Abfrage auf `module_permissions` sonst an den Zeilenrechten
-- des Aufrufers hinge; `stable`, damit Postgres sie je Anweisung einmal auswertet statt je
-- Zeile.
-- ---------------------------------------------------------------------
create or replace function public.darf(p_bereich text, p_verb text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when coalesce(public.current_user_role(), '') = 'superadmin' then true
    else coalesce(public.current_user_role(), '') = any (
      select unnest(
        case p_verb
          when 'lesen'     then m.read_roles
          when 'schreiben' then m.edit_roles
          when 'loeschen'  then m.delete_roles
        end
      )
      from public.module_permissions m
      where m.module_key = p_bereich
    )
  end;
$$;

comment on function public.darf(text, text) is
  'Darf die aufrufende Rolle im Bereich p_bereich das Verb p_verb (lesen/schreiben/loeschen)? Superadmin immer. Fehlt die Zeile, gilt: nein.';

-- ---------------------------------------------------------------------
-- 4. Die Richtlinien
--
-- Aufgebaut wie in Migration 16: je Tabelle vier Richtlinien, getrennt nach select / insert /
-- update / delete. Neu ist nur, WORAUF sie sich berufen.
-- ---------------------------------------------------------------------

-- Kunden, Kontakthistorie, Kundenfahrzeuge hängen an demselben Bereich: Es sind drei Tabellen,
-- aber eine Sache. Wer einen Kunden sehen darf, muss auch sein Auto sehen – sonst steht im
-- Auftrag ein Fahrzeug, das es angeblich nicht gibt.
do $$
declare
  t text;
begin
  foreach t in array array['customers', 'contact_history', 'vehicles'] loop
    execute format('drop policy if exists "Bereich kunden lesen" on public.%I', t);
    execute format('drop policy if exists "Bereich kunden schreiben" on public.%I', t);
    execute format('drop policy if exists "Bereich kunden aendern" on public.%I', t);
    execute format('drop policy if exists "Bereich kunden loeschen" on public.%I', t);
    execute format($f$create policy "Bereich kunden lesen" on public.%I for select to authenticated using (public.darf('kunden','lesen'))$f$, t);
    execute format($f$create policy "Bereich kunden schreiben" on public.%I for insert to authenticated with check (public.darf('kunden','schreiben'))$f$, t);
    execute format($f$create policy "Bereich kunden aendern" on public.%I for update to authenticated using (public.darf('kunden','schreiben')) with check (public.darf('kunden','schreiben'))$f$, t);
    execute format($f$create policy "Bereich kunden loeschen" on public.%I for delete to authenticated using (public.darf('kunden','lesen'))$f$, t);
  end loop;
end $$;

-- Lager und Lagerplätze.
do $$
declare
  t text;
begin
  foreach t in array array['warehouses', 'storage_slots'] loop
    execute format('drop policy if exists "Bereich lager.regale lesen" on public.%I', t);
    execute format('drop policy if exists "Bereich lager.regale schreiben" on public.%I', t);
    execute format('drop policy if exists "Bereich lager.regale aendern" on public.%I', t);
    execute format('drop policy if exists "Bereich lager.regale loeschen" on public.%I', t);
    execute format($f$create policy "Bereich lager.regale lesen" on public.%I for select to authenticated using (public.darf('lager.regale','lesen'))$f$, t);
    execute format($f$create policy "Bereich lager.regale schreiben" on public.%I for insert to authenticated with check (public.darf('lager.regale','schreiben'))$f$, t);
    execute format($f$create policy "Bereich lager.regale aendern" on public.%I for update to authenticated using (public.darf('lager.regale','schreiben')) with check (public.darf('lager.regale','schreiben'))$f$, t);
    execute format($f$create policy "Bereich lager.regale loeschen" on public.%I for delete to authenticated using (public.darf('lager.regale','lesen'))$f$, t);
  end loop;
end $$;

-- Reifen ein- und auslagern (`tire_storage`) und die einzeln gemessenen Räder
-- (`eingelagerte_raeder`) sind ZWEI Bereiche, obwohl sie zusammengehören – weil „löschen"
-- bei ihnen verschiedene Dinge bedeutet. Eine Einlagerung wird nie gelöscht (Auslagern ist
-- ein `update` auf `removed_at`, und die Zeile bleibt als Historie stehen); eine falsch
-- erfasste Radmessung dagegen schon.
--
-- Deshalb hat `tire_storage` hier gar keine Löschrichtlinie und keinen Löschtrigger: Wenn
-- die Anwendung etwas nie tut, soll auch kein Haken so tun, als könnte man es erlauben.
drop policy if exists "Bereich einlagerung lesen" on public.tire_storage;
drop policy if exists "Bereich einlagerung schreiben" on public.tire_storage;
drop policy if exists "Bereich einlagerung aendern" on public.tire_storage;
drop policy if exists "Bereich einlagerung loeschen" on public.tire_storage;
create policy "Bereich einlagerung lesen" on public.tire_storage
  for select to authenticated using (public.darf('lager.einlagerung','lesen'));
create policy "Bereich einlagerung schreiben" on public.tire_storage
  for insert to authenticated with check (public.darf('lager.einlagerung','schreiben'));
create policy "Bereich einlagerung aendern" on public.tire_storage
  for update to authenticated
  using (public.darf('lager.einlagerung','schreiben'))
  with check (public.darf('lager.einlagerung','schreiben'));

do $$
begin
  if to_regclass('public.eingelagerte_raeder') is null then return; end if;
  execute 'drop policy if exists "Bereich raeder lesen" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich raeder schreiben" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich raeder aendern" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich raeder loeschen" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich einlagerung lesen" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich einlagerung schreiben" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich einlagerung aendern" on public.eingelagerte_raeder';
  execute 'drop policy if exists "Bereich einlagerung loeschen" on public.eingelagerte_raeder';
  execute $p$create policy "Bereich raeder lesen" on public.eingelagerte_raeder for select to authenticated using (public.darf('lager.raeder','lesen'))$p$;
  execute $p$create policy "Bereich raeder schreiben" on public.eingelagerte_raeder for insert to authenticated with check (public.darf('lager.raeder','schreiben'))$p$;
  execute $p$create policy "Bereich raeder aendern" on public.eingelagerte_raeder for update to authenticated using (public.darf('lager.raeder','schreiben')) with check (public.darf('lager.raeder','schreiben'))$p$;
  execute $p$create policy "Bereich raeder loeschen" on public.eingelagerte_raeder for delete to authenticated using (public.darf('lager.raeder','lesen'))$p$;
end $$;

-- Artikel und Preise.
do $$
declare
  t text;
begin
  foreach t in array array['articles', 'article_prices'] loop
    execute format('drop policy if exists "Bereich artikel lesen" on public.%I', t);
    execute format('drop policy if exists "Bereich artikel schreiben" on public.%I', t);
    execute format('drop policy if exists "Bereich artikel aendern" on public.%I', t);
    execute format('drop policy if exists "Bereich artikel loeschen" on public.%I', t);
    execute format($f$create policy "Bereich artikel lesen" on public.%I for select to authenticated using (public.darf('artikel','lesen'))$f$, t);
    execute format($f$create policy "Bereich artikel schreiben" on public.%I for insert to authenticated with check (public.darf('artikel','schreiben'))$f$, t);
    execute format($f$create policy "Bereich artikel aendern" on public.%I for update to authenticated using (public.darf('artikel','schreiben')) with check (public.darf('artikel','schreiben'))$f$, t);
    execute format($f$create policy "Bereich artikel loeschen" on public.%I for delete to authenticated using (public.darf('artikel','lesen'))$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Mitarbeiter: sichtbar sind die eigenen Kollegen, nicht die Belegschaft
--
-- Bisher lag die vollständige Mitarbeiterliste für jeden Eingeloggten offen, und nur die
-- Oberfläche blendete sie einem Techniker aus. Das sind zwei verschiedene Wahrheiten für
-- dieselbe Frage – und die, die zählt, ist die der Datenbank.
--
-- Der Techniker braucht Namen: die seiner Kollegen am eigenen Auftrag (er fährt mit ihnen
-- hin) und den eigenen (seine Farbe im Kalender). Mehr nicht.
-- ---------------------------------------------------------------------
create or replace function public.ist_kollege(p_employee_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    p_employee_id = public.current_employee_id()
    or exists (
      select 1
        from public.order_employees meins
        join public.order_employees seins on seins.order_id = meins.order_id
       where meins.employee_id = public.current_employee_id()
         and seins.employee_id = p_employee_id
    );
$$;

comment on function public.ist_kollege(uuid) is
  'Steht dieser Mitarbeiter mit dem Aufrufer auf mindestens einem gemeinsamen Auftrag (oder ist er es selbst)?';

drop policy if exists "Bereich mitarbeiter lesen" on public.employees;
drop policy if exists "Bereich mitarbeiter schreiben" on public.employees;
drop policy if exists "Bereich mitarbeiter aendern" on public.employees;
drop policy if exists "Bereich mitarbeiter loeschen" on public.employees;

create policy "Bereich mitarbeiter lesen" on public.employees
  for select to authenticated
  using (
    public.darf('mitarbeiter','lesen')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_kollege(id))
  );
create policy "Bereich mitarbeiter schreiben" on public.employees
  for insert to authenticated with check (public.darf('mitarbeiter','schreiben'));
create policy "Bereich mitarbeiter aendern" on public.employees
  for update to authenticated
  using (public.darf('mitarbeiter','schreiben')) with check (public.darf('mitarbeiter','schreiben'));
create policy "Bereich mitarbeiter loeschen" on public.employees
  for delete to authenticated using (public.darf('mitarbeiter','lesen'));

-- Firmenfahrzeuge: schlichter, ohne Sonderregel.
do $$
begin
  if to_regclass('public.firmenfahrzeuge') is null then return; end if;
  execute 'drop policy if exists "Bereich firmenfahrzeuge lesen" on public.firmenfahrzeuge';
  execute 'drop policy if exists "Bereich firmenfahrzeuge schreiben" on public.firmenfahrzeuge';
  execute 'drop policy if exists "Bereich firmenfahrzeuge aendern" on public.firmenfahrzeuge';
  execute 'drop policy if exists "Bereich firmenfahrzeuge loeschen" on public.firmenfahrzeuge';
  execute $p$create policy "Bereich firmenfahrzeuge lesen" on public.firmenfahrzeuge for select to authenticated using (public.darf('firmenfahrzeuge','lesen'))$p$;
  execute $p$create policy "Bereich firmenfahrzeuge schreiben" on public.firmenfahrzeuge for insert to authenticated with check (public.darf('firmenfahrzeuge','schreiben'))$p$;
  execute $p$create policy "Bereich firmenfahrzeuge aendern" on public.firmenfahrzeuge for update to authenticated using (public.darf('firmenfahrzeuge','schreiben')) with check (public.darf('firmenfahrzeuge','schreiben'))$p$;
  execute $p$create policy "Bereich firmenfahrzeuge loeschen" on public.firmenfahrzeuge for delete to authenticated using (public.darf('firmenfahrzeuge','lesen'))$p$;
end $$;

-- ---------------------------------------------------------------------
-- 5. Aufträge – hier liegt die Falle
--
-- Die alten Richtlinien aus Migration 13/15 bleiben BESTEHEN: „Techniker sieht eigene
-- Aufträge" und „Nicht-Techniker verwalten Aufträge". In Postgres sind mehrere Richtlinien
-- für dieselbe Aktion ODER-verknüpft – eine neue Richtlinie „darf('auftraege','lesen')"
-- DANEBEN würde die Techniker-Einschränkung also AUFHEBEN statt ergänzen.
--
-- Deshalb werden die alten hier ersetzt und die Bedingung in EINER Richtlinie
-- zusammengeführt: Modulrecht UND (kein Techniker ODER eigener Auftrag).
-- ---------------------------------------------------------------------
drop policy if exists "Nicht-Techniker verwalten Aufträge" on public.orders;
drop policy if exists "Techniker sieht eigene Aufträge" on public.orders;
drop policy if exists "Techniker aendert eigene Auftraege" on public.orders;
drop policy if exists "Bereich auftraege lesen" on public.orders;
drop policy if exists "Bereich auftraege schreiben" on public.orders;
drop policy if exists "Bereich auftraege aendern" on public.orders;
drop policy if exists "Bereich auftraege loeschen" on public.orders;

create policy "Bereich auftraege lesen" on public.orders
  for select to authenticated
  using (
    public.darf('auftraege.auftrag','lesen')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(id))
  );

-- Anlegen bleibt dem Büro vorbehalten: Ein Techniker, der Aufträge anlegen kann, legt sie sich
-- selbst zu – und die Einteilung ist genau die Entscheidung, die nicht bei ihm liegt.
create policy "Bereich auftraege schreiben" on public.orders
  for insert to authenticated
  with check (
    public.darf('auftraege.auftrag','schreiben')
    and coalesce(public.current_user_role(), '') <> 'techniker'
  );

create policy "Bereich auftraege aendern" on public.orders
  for update to authenticated
  using (
    public.darf('auftraege.auftrag','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(id))
  )
  with check (
    public.darf('auftraege.auftrag','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(id))
  );

create policy "Bereich auftraege loeschen" on public.orders
  for delete to authenticated
  using (public.darf('auftraege.auftrag','lesen'));

-- Die Zuordnungstabellen folgen dem Auftrag. `order_employees` bleibt beim Büro (die
-- Einteilung ist keine Technikerentscheidung), `order_articles` darf der Techniker an seinem
-- eigenen Auftrag pflegen – so wie Migration 41 es festgelegt hat.
drop policy if exists "Nicht-Techniker verwalten Auftrags-Mitarbeiter" on public.order_employees;
drop policy if exists "Techniker liest eigene Zuordnungen" on public.order_employees;
drop policy if exists "Bereich auftraege mitarbeiter lesen" on public.order_employees;
drop policy if exists "Bereich auftraege mitarbeiter schreiben" on public.order_employees;

create policy "Bereich auftraege mitarbeiter lesen" on public.order_employees
  for select to authenticated
  using (
    public.darf('auftraege.einteilung','lesen')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  );

create policy "Bereich auftraege mitarbeiter schreiben" on public.order_employees
  for all to authenticated
  using (public.darf('auftraege.einteilung','schreiben'))
  with check (public.darf('auftraege.einteilung','schreiben'));

drop policy if exists "Nicht-Techniker verwalten Auftrags-Artikel" on public.order_articles;
drop policy if exists "Techniker liest Artikel eigener Auftraege" on public.order_articles;
drop policy if exists "Techniker verwaltet Artikel eigener Auftraege" on public.order_articles;
drop policy if exists "Bereich auftraege leistungen lesen" on public.order_articles;
drop policy if exists "Bereich auftraege leistungen schreiben" on public.order_articles;
drop policy if exists "Bereich auftraege leistungen loeschen" on public.order_articles;

create policy "Bereich auftraege leistungen lesen" on public.order_articles
  for select to authenticated
  using (
    public.darf('auftraege.leistungen','lesen')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  );

create policy "Bereich auftraege leistungen schreiben" on public.order_articles
  for all to authenticated
  using (
    public.darf('auftraege.leistungen','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  )
  with check (
    public.darf('auftraege.leistungen','schreiben')
    and (coalesce(public.current_user_role(), '') <> 'techniker' or public.is_own_order(order_id))
  );

-- ---------------------------------------------------------------------
-- 6. Löschen ist in dieser Anwendung meistens gar kein DELETE
--
-- Beim Prüfen gegen Postgres aufgefallen, und es hätte den ganzen Löschen-Haken wirkungslos
-- gemacht: Kunden, Aufträge und Auftragspositionen werden seit Migration 19 NICHT gelöscht,
-- sondern mit `deleted_at` markiert. Technisch ist das ein `update` – und ein `update` fragt
-- nach dem SCHREIB-Recht. Wer schreiben darf, hätte damit auch löschen dürfen, egal was in
-- der Modulverwaltung steht.
--
-- Zweiter Punkt, ebenso unangenehm: Eine Richtlinie, die ein DELETE verbietet, wirft keinen
-- Fehler – die Zeile ist für die Anweisung schlicht nicht sichtbar, und es werden null Zeilen
-- gelöscht. Der Nutzer klickt „Löschen", nichts passiert, und niemand sagt warum. Genau diese
-- Art stillen Scheiterns hat Phase 9 abgeschafft.
--
-- Deshalb ein TRIGGER statt einer weiteren Richtlinie: Er sieht den Soft-Delete als das, was
-- er ist, und er sagt im Klartext, was fehlt.
--
-- UND DESHALB fragen die DELETE-Richtlinien oben nach 'lesen' und nicht nach 'loeschen'.
-- Das sieht nach einer Lücke aus und ist keine: Eine Richtlinie, die die Zeile wegfiltert,
-- lässt den Trigger gar nicht erst laufen – dann steht wieder „DELETE 0" ohne ein Wort dazu.
-- Die Zeile muss sichtbar sein, damit der Trigger sie ablehnen und begründen kann. Die
-- eigentliche Entscheidung trifft der Trigger, und ein BEFORE-Trigger, der eine Ausnahme
-- wirft, lässt sich vom Aufrufer so wenig umgehen wie eine Richtlinie – es ist dasselbe
-- Verfahren, das den Spaltenschutz für Techniker seit Migration 15 trägt.
-- ---------------------------------------------------------------------
create or replace function public.pruefe_loeschrecht()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bereich constant text := tg_argv[0];
begin
  -- Soft-Delete: nur wenn in DIESER Änderung die Löschmarke gesetzt wird. Ein Auftrag, der
  -- bereits gelöscht ist und nebenbei weiter geändert wird (etwa durch die Kettenwirkung aus
  -- Migration 19), löst das hier nicht aus.
  if tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null and not public.darf(bereich, 'loeschen') then
      raise exception 'Zum Löschen im Bereich "%" fehlt die Berechtigung.', bereich;
    end if;
    -- Wiederherstellen ist kein Löschen, sondern ein Schreiben – und das ist oben geprüft.
    return new;
  end if;

  if not public.darf(bereich, 'loeschen') then
    raise exception 'Zum Löschen im Bereich "%" fehlt die Berechtigung.', bereich;
  end if;
  return old;
end;
$$;

do $$
declare
  -- `tire_storage` steht bewusst NICHT in dieser Liste: Eine Einlagerung wird nie gelöscht.
  -- Auslagern setzt `removed_at` und ist damit ein Schreiben; die Zeile bleibt als Historie.
  -- Ein Löschtrigger dort würde eine Handlung bewachen, die es nicht gibt.
  paar text[][] := array[
    array['customers','kunden'], array['contact_history','kunden'], array['vehicles','kunden'],
    array['orders','auftraege.auftrag'], array['order_articles','auftraege.leistungen'],
    array['warehouses','lager.regale'], array['storage_slots','lager.regale'],
    array['eingelagerte_raeder','lager.raeder'],
    array['articles','artikel'], array['article_prices','artikel'],
    array['employees','mitarbeiter'], array['firmenfahrzeuge','firmenfahrzeuge']
  ];
  i int; t text; b text; hat_marke boolean;
begin
  for i in 1..array_length(paar, 1) loop
    t := paar[i][1]; b := paar[i][2];
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop trigger if exists trg_loeschrecht on public.%I', t);
    execute format('drop trigger if exists trg_loeschrecht_soft on public.%I', t);

    execute format('create trigger trg_loeschrecht before delete on public.%I for each row execute procedure public.pruefe_loeschrecht(%L)', t, b);

    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'deleted_at'
    ) into hat_marke;
    if hat_marke then
      execute format('create trigger trg_loeschrecht_soft before update on public.%I for each row execute procedure public.pruefe_loeschrecht(%L)', t, b);
    end if;
  end loop;
end $$;

commit;

-- Kontrolle nach dem Lauf:
--
-- select module_key, read_roles, edit_roles as schreib_roles, delete_roles
--   from public.module_permissions
--  where module_key not like 'view.%' and module_key not like 'action.%'
--  order by module_key;
--
-- Und mit je einem Testzugang: Was die Modulverwaltung anzeigt, muss dem entsprechen, was
-- tatsächlich geht. Besonders prüfen: ein Techniker sieht weiterhin NUR eigene Aufträge.

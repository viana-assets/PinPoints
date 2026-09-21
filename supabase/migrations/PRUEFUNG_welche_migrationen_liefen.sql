-- =====================================================================
-- Viana PinPoints – Prüfskript: Welche Migrationen sind in DIESER Datenbank gelaufen?
--
-- Nur LESEND. Ändert nichts, legt nichts an, kann gefahrlos beliebig oft laufen.
--
-- Warum es das gibt: Es gibt keine Tabelle, die mitschreibt, welche Migration ausgeführt
-- wurde – die Dateien werden von Hand im SQL-Editor gestartet. Der Stand steht also nur in
-- `README.md`, und ein Mensch vergisst das Nachtragen. Am 09.09.2026 hat genau diese Lücke
-- eine Stunde gekostet: Migration 26 WAR ausgeführt – nur im falschen Projekt.
--
-- Statt einem Protokoll zu glauben, fragt dieses Skript die Datenbank selbst: Für jede
-- Migration wird geprüft, ob das existiert, was sie anlegt (Tabelle, Spalte, Funktion, Zeile).
--
-- BEDIENUNG: Der Supabase-Editor zeigt immer nur das Ergebnis des LETZTEN Befehls. Deshalb
-- die beiden Teile einzeln ausführen – Teil markieren, dann Run (oder Strg+Enter).
-- =====================================================================


-- ---------------------------------------------------------------------
-- TEIL 1 – Migrationen. Markieren bis zum Semikolon, dann Run.
-- Erste Zeile: in welchem Projekt bin ich überhaupt?
-- ---------------------------------------------------------------------
with pruefungen(nr, was, vorhanden) as (
  values
    ('01', 'Tabellen profiles + customers',       (to_regclass('public.profiles') is not null and to_regclass('public.customers') is not null)),
    ('02', 'Tabellen warehouses + storage_slots', (to_regclass('public.warehouses') is not null and to_regclass('public.storage_slots') is not null)),
    ('03', 'Tabelle orders',                      (to_regclass('public.orders') is not null)),
    ('04', 'Tabelle vehicles',                    (to_regclass('public.vehicles') is not null)),
    ('05', 'Funktion current_user_role()',        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'current_user_role')),
    ('06', 'tire_storage.removed_at',             exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'removed_at')),
    ('07', 'Tabelle employees + orders.time',     (to_regclass('public.employees') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'time'))),
    ('08', 'warehouses.address',                  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'warehouses' and column_name = 'address')),
    ('09', 'Tabelle module_permissions',          (to_regclass('public.module_permissions') is not null)),
    ('10', 'Rechte-Matrix befüllt (view.*)',      exists (select 1 from public.module_permissions where module_key like 'view.%')),
    ('11', 'Tabelle order_employees',             (to_regclass('public.order_employees') is not null)),
    ('12', 'Tabellen articles + article_prices',  (to_regclass('public.articles') is not null and to_regclass('public.article_prices') is not null)),
    ('13', 'orders.techniker_notiz',              exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'techniker_notiz')),
    ('14', 'articles.article_number',             exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'article_number')),
    ('15', 'Funktion is_own_order()',             exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_own_order')),
    ('16', 'Funktion has_module_permission()',    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'has_module_permission')),
    ('17', 'Tabelle geocode_cache',               (to_regclass('public.geocode_cache') is not null)),
    ('18', 'Tabelle audit_log + orders.updated_by', (to_regclass('public.audit_log') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'updated_by'))),
    ('19', 'customers.deleted_at (Soft-Delete)',  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'deleted_at')),
    ('20', 'orders.order_number + completed_at',  (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'order_number') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'completed_at'))),
    ('21', 'Tabelle appointments ist entfernt',   (to_regclass('public.appointments') is null)),
    ('22', 'tire_storage.order_id + articles.braucht_lagerplatz', (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'order_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'braucht_lagerplatz'))),
    ('23', 'customers.kontakt_ergebnis',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'kontakt_ergebnis')),
    ('24', 'customers.company + anrede',          (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'company') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'anrede'))),
    ('25', 'Tabelle adressvorschlag_cache',       (to_regclass('public.adressvorschlag_cache') is not null)),
    ('26', 'Tabelle push_geraete',                (to_regclass('public.push_geraete') is not null)),
    ('27', 'Tabelle push_versand',                (to_regclass('public.push_versand') is not null)),
    ('28', 'Erweiterungen pg_cron + pg_net',      ((select count(*) from pg_extension where extname in ('pg_cron', 'pg_net')) = 2)),
    ('29', 'push_versand.termin',                 exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_versand' and column_name = 'termin')),
    ('30', 'tire_storage.vehicle_id + saison',    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'vehicle_id')
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'saison')),
    ('31', 'Berechtigung view.saison',            exists (select 1 from public.module_permissions where module_key = 'view.saison')),
    ('32', 'Tabelle firmenfahrzeuge',             to_regclass('public.firmenfahrzeuge') is not null),
    ('33', 'Tabelle eingelagerte_raeder',         to_regclass('public.eingelagerte_raeder') is not null
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'erfassungsart')),
    ('34', 'vehicles ohne DOT/Profil',            not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name in ('tire_dot_date', 'tire_profile_mm'))),
    ('35', 'customers.geo_genauigkeit',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'geo_genauigkeit')),
    ('36', 'Protokoll sichtbar (auftrag_id)',    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audit_log' and column_name = 'auftrag_id')
                                              and to_regprocedure('public.protokoll_personen()') is not null),
    ('37', 'orders.end_time (Termin von-bis)',   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'end_time')),
    ('38', 'Rechnung/Endpreis/Betrieb',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'rechnung_noetig')
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_articles' and column_name = 'endpreis_netto')
                                              and to_regclass('public.betrieb') is not null),
    -- 39 prueft umgekehrt: Sie hat gewirkt, wenn die Spalten WEG sind.
    ('39', 'tote Spalten entfernt',              not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'assigned_employee_id')
                                              and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_articles' and column_name = 'discount_percent')),
    ('40', 'Rechnung erstellt (Arbeitsliste)',  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'rechnung_erstellt_am')
                                              and to_regprocedure('public.stempel_rechnung()') is not null),
    -- 41 prueft am Text der Funktion: Die neue Fassung nennt die Sperrliste, die alte nicht.
    ('41', 'Techniker darf bearbeiten',         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                                        where n.nspname = 'public' and p.proname = 'restrict_techniker_order_update'
                                                          and p.prosrc like '%gesperrt%')
                                              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_articles'
                                                           and policyname = 'Techniker verwaltet Artikel eigener Auftraege')),
    ('42', 'Rechte lesen/schreiben/loeschen',    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'module_permissions' and column_name = 'delete_roles')
                                              and to_regprocedure('public.darf(text,text)') is not null
                                              and to_regprocedure('public.pruefe_loeschrecht()') is not null
                                              and to_regprocedure('public.ist_kollege(uuid)') is not null),
    -- 43 prueft umgekehrt: Sie hat gewirkt, wenn die Altlasten WEG sind.
    ('43', 'Altlasten aus 42 entfernt',         not exists (select 1 from pg_policies where schemaname = 'public' and policyname like 'Bereich lager %' and policyname not like '%lager.regale%')
                                              and not exists (select 1 from public.module_permissions where module_key = 'einlagerung')),
    ('44', 'Fahrzeuge am Auftrag + km',         to_regclass('public.auftrag_fahrzeuge') is not null
                                              and to_regprocedure('public.pruefe_rechnungsdaten()') is not null),
    ('45', 'Techniker sieht eigene Kunden',     to_regprocedure('public.ist_eigener_kunde(uuid)') is not null),
    ('46', 'Lagergebuehr beim Auslagern',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'abrechnungsart')
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'fragt_einlagerung')
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'entnahme_order_id')),
    ('47', 'Kontakt beim Abschliessen',       to_regprocedure('public.kontakt_aus_abschluss()') is not null
                                              and exists (select 1 from pg_trigger where tgname = 'trg_kontakt_aus_abschluss')),
    ('48', 'Rechnungen (Tabelle + Briefkopf)',  to_regclass('public.rechnungen') is not null
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'betrieb' and column_name = 'anschreiben')
                                              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'kundennummer')),
    ('49', 'Rechnung haengt am Auftrag',        to_regprocedure('public.rechnung_am_auftrag()') is not null
                                              and exists (select 1 from pg_trigger where tgname = 'trg_rechnung_am_auftrag')),
    ('50', 'Freie Position (Freitext)',        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'freitext'))
)
select '00' as migration, 'DATENBANK: ' || current_database() as woran_erkennbar, '(zur Kontrolle)' as gelaufen
union all
select nr, was, case when vorhanden then 'ja' else '>>> NEIN <<<' end from pruefungen
order by 1;


-- ---------------------------------------------------------------------
-- TEIL 2 – Bestandszahlen. Beantwortet nebenbei: Ist der Kundenimport gelaufen, sind die
-- Adressen geokodiert, hängt schon etwas im Lager? Markieren, dann Run.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.customers)                             as kunden,
  (select count(*) from public.customers where lat is not null)       as davon_mit_koordinaten,
  (select count(*) from public.orders)                                as auftraege,
  (select count(*) from public.storage_slots)                         as lagerplaetze,
  (select count(*) from public.tire_storage where removed_at is null) as eingelagerte_saetze,
  (select count(*) from public.articles)                              as artikel,
  (select count(*) from public.employees)                             as mitarbeiter,
  (select count(*) from public.employees where profile_id is not null) as davon_mit_konto,
  (select count(*) from public.push_geraete)                          as angemeldete_geraete;


-- ---------------------------------------------------------------------
-- TEIL 3 (nur falls Teil 1 bei 28 „ja" sagt) – läuft der Zeitgeber, und mit welchem Ergebnis?
-- ---------------------------------------------------------------------
-- select jobname, schedule, active from cron.job;
-- select status_code, content, created from net._http_response order by created desc limit 5;

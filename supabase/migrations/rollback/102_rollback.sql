-- Rücknahme von Migration 102 – Navigation zum Lager. Die gewählten Lager je Person gehen dabei verloren; danach
-- greift in v169 die Vorgabe (Hauptlager). Zweimal lauffähig.
alter table if exists public.user_settings drop column if exists nav_lager_id;
select 'Spalte user_settings.nav_lager_id' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_settings' and column_name = 'nav_lager_id')
            then 'noch da' else 'entfernt' end as ergebnis;

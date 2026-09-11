-- Rücknahme von 31_saisonliste_berechtigung.sql.
--
-- Danach greift für die Saisonliste wieder der eingebaute Standardwert aus
-- `PERMISSION_DEFAULTS` (lib/constants.ts) – die Liste bleibt also sichtbar, sie lässt sich
-- nur nicht mehr in der Modulverwaltung einstellen. Eine im Admin-Bereich abweichend
-- eingestellte Rollenauswahl geht dabei verloren.

delete from public.module_permissions where module_key = 'view.saison';

-- Rücknahme von 17_geocode_cache.sql.
-- Achtung: erst ausführen, wenn app/api/geocode/route.ts nicht mehr im Einsatz ist –
-- sonst schlägt jede Geokodierung fehl (und damit das Speichern einer Adresse mit
-- Kartenposition; der Kunde selbst wird weiterhin gespeichert, nur ohne Position).
drop table if exists public.geocode_cache;

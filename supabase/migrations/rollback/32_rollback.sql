-- Rücknahme von 32_firmenfahrzeuge.sql.
--
-- ZUERST den Anwendungscode zurückdrehen: Die Oberfläche liest `orders.firmenfahrzeug_id` und
-- die Stammdatenliste.
--
-- Was verloren geht: die Fahrzeugstammdaten und die Zuordnung an allen Aufträgen. Beides ist
-- nicht rekonstruierbar – vor dem Ausführen also überlegen, ob ein Export sinnvoll ist:
--   select o.order_number, f.kennzeichen from public.orders o
--     join public.firmenfahrzeuge f on f.id = o.firmenfahrzeug_id;

drop index if exists public.idx_orders_firmenfahrzeug;
alter table public.orders drop column if exists firmenfahrzeug_id;
drop table if exists public.firmenfahrzeuge;

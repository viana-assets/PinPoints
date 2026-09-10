-- Rücknahme von 25_adressvorschlaege_cache.sql.
--
-- Gefahrlos: die Tabelle ist ein reiner Zwischenspeicher. Was hier steht, lässt sich jederzeit
-- neu abfragen – es geht nichts verloren außer ein paar gesparten Anfragen an den Kartendienst.
-- Der Anwendungscode muss vorher zurück, sonst schreibt die Route in eine Tabelle, die es
-- nicht mehr gibt.

drop table if exists public.adressvorschlag_cache;

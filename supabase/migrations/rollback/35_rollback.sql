-- =====================================================================
-- Viana PinPoints – Rücknahme von 35
--
-- Entfernt die Spalte `geo_genauigkeit` samt Prüfregel. Die Positionen selbst bleiben
-- unangetastet – verloren geht nur das Wissen darüber, WIE GENAU sie sind.
--
-- Das hat eine Folge, die man kennen sollte: Die zurückgedrehte Fassung navigiert wieder
-- über die Koordinate statt über den Adresstext. Bei Kunden, deren Punkt nur die Straßenmitte
-- ist, führt die Navigation danach wieder an den Anfang der Straße. Wer 35 zurücknimmt, sollte
-- diese Kunden vorher notieren:
--
--   select id, name, address from public.customers where geo_genauigkeit = 'ungefaehr';
--
-- Vorher den Anwendungscode zurückdrehen – die aktuelle Fassung liest die Spalte.
-- =====================================================================

alter table public.customers drop constraint if exists customers_geo_genauigkeit_werte;
alter table public.customers drop column if exists geo_genauigkeit;

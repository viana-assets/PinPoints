-- =====================================================================
-- Viana PinPoints – Rücknahme von 34
--
-- Stellt die beiden Spalten wieder her – LEER. Die Werte von vorher sind mit dem
-- `drop column` verschwunden und lassen sich hier nicht zurückholen; das steht im Kopf
-- von 34 und ist der Grund für die Zählung, die dort vor dem Löschen läuft.
--
-- Vor dieser Rücknahme den Anwendungscode zurückdrehen: Die aktuelle Fassung kennt die
-- Spalten nicht mehr. Stehen sie wieder da, ohne dass der Code sie füllt, entsteht genau
-- das Feld, das diese Migration abschaffen sollte – eines, das aussieht wie eine Messung
-- und keine ist.
-- =====================================================================

alter table public.vehicles add column if not exists tire_dot_date text;
alter table public.vehicles add column if not exists tire_profile_mm numeric(4,1);

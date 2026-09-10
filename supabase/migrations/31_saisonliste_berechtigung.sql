-- =====================================================================
-- Viana PinPoints – 31: Die Saisonliste in die Modulverwaltung aufnehmen
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 09/10 (module_permissions).
--
-- Konzept: docs/lager-ausbaukonzept.md, D1.
--
-- Die Anwendung funktioniert auch OHNE diese Migration: Fehlt eine Zeile in
-- `module_permissions`, greift der eingebaute Standardwert aus `PERMISSION_DEFAULTS`
-- (lib/constants.ts). Ohne die Zeile taucht die Saisonliste aber in der Modulverwaltung
-- nicht auf – der Superadmin könnte sie also nicht freigeben oder entziehen, ohne dass
-- irgendwo erklärt wäre, warum ausgerechnet dieses Modul fehlt.
--
-- Ohne Techniker: Die Saisonliste ist die halbjährliche Anrufliste, also Büro- und
-- Vertriebsarbeit. Ein Techniker unterwegs braucht seine Aufträge, nicht die Liste aller
-- eingelagerten Wintersätze – und sie enthält die Adressen des gesamten Kundenstamms
-- auf einen Blick.
-- =====================================================================

insert into public.module_permissions (module_key, edit_roles) values
  ('view.saison', '{admin,user}')
on conflict (module_key) do nothing;

-- =====================================================================
-- Viana PinPoints – 34: DOT-Datum und Profiltiefe gehören nicht ans Fahrzeug
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 04 (vehicles) und 33
-- (eingelagerte_raeder) – letzteres nicht technisch, aber inhaltlich: erst seit 33
-- steht der Zustand der Reifen vollständig am Satz.
--
-- Konzept: docs/lager-ausbaukonzept.md, A1 – und eine Beobachtung aus dem Betrieb
-- am 11.09.2026.
--
-- DER GRUND: `vehicles.tire_dot_date` und `vehicles.tire_profile_mm` beschreiben einen
-- REIFENSATZ, standen aber am AUTO. Ein Auto behält man zehn Jahre, der Satz wechselt
-- zweimal im Jahr. Nach dem ersten Wechsel ist der Wert am Fahrzeug also falsch – und
-- zwar unauffällig falsch: Er sieht aus wie eine Messung, ist aber die Messung von
-- vorletzter Saison. Genau die Sorte Zahl, auf die sich jemand im Kundengespräch
-- verlässt.
--
-- Seit Migration 33 stehen dieselben Angaben dort, wo sie hingehören: am eingelagerten
-- Satz (`tire_storage.dot_date`, `profiltiefe_mm`) bzw. am einzelnen Rad
-- (`eingelagerte_raeder`). Zwei Orte für dieselbe Aussage sind einer zu viel.
--
-- WAS BLEIBT: `vehicles.tire_size`. Welche Reifengröße ein Fahrzeug fährt, ist eine
-- Eigenschaft des Autos und wechselt nicht mit dem Satz. Sie hilft beim Bestellen und
-- beim Prüfen, ob der eingelagerte Satz überhaupt zu diesem Auto passt.
--
-- FALLS DOCH WERTE DRINSTEHEN: Der DO-Block unten meldet die Anzahl als Hinweis, BEVOR
-- die Spalten fallen. Wer sie retten will, führt vorher aus:
--
--   select id, license_plate, make_model, tire_dot_date, tire_profile_mm
--   from public.vehicles
--   where tire_dot_date is not null or tire_profile_mm is not null;
--
-- und trägt die Werte am eingelagerten Satz nach. Danach diese Migration erneut starten.
-- =====================================================================

-- Erst zählen, dann löschen. Die Meldung erscheint im SQL-Editor unter „Results" als
-- Notice – sie ist die letzte Gelegenheit, es sich anders zu überlegen.
do $$
declare
  betroffen integer;
  spalten   integer;
begin
  -- Erst nachsehen, ob es die Spalten überhaupt (noch) gibt. Ohne diese Prüfung bricht ein
  -- zweiter Lauf mit „column does not exist" ab – und wer das sieht, glaubt, etwas sei
  -- schiefgegangen, obwohl die Migration längst erledigt ist.
  select count(*) into spalten
  from information_schema.columns
  where table_schema = 'public' and table_name = 'vehicles'
    and column_name in ('tire_dot_date', 'tire_profile_mm');

  if spalten = 0 then
    raise notice 'Die Spalten sind bereits entfernt – diese Migration lief hier schon.';
    return;
  end if;

  execute 'select count(*) from public.vehicles where tire_dot_date is not null or tire_profile_mm is not null'
    into betroffen;

  if betroffen > 0 then
    raise notice 'ACHTUNG: % Fahrzeug(e) haben noch DOT-Datum oder Profiltiefe gespeichert. Diese Werte werden mit dieser Migration gelöscht.', betroffen;
  else
    raise notice 'Keine Werte in tire_dot_date / tire_profile_mm – es geht nichts verloren.';
  end if;
end $$;

alter table public.vehicles drop column if exists tire_dot_date;
alter table public.vehicles drop column if exists tire_profile_mm;

-- Gegenprobe: Beide Spalten sind weg, tire_size steht noch.
select
  (to_regclass('public.vehicles') is not null)                                                as tabelle_da,
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'vehicles' and column_name = 'tire_dot_date')     as dot_entfernt,
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'vehicles' and column_name = 'tire_profile_mm')   as profil_entfernt,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'vehicles' and column_name = 'tire_size')             as groesse_bleibt;

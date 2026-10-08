-- =====================================================================
-- Migration 79 – „Rechnung nötig“ ohne E-Mail-Adresse abschließen (08.10.2026, v128).
--
-- Wunsch Vitali 08.10.2026: Beim Kunden fehlt die E-Mail-Adresse oft, und dann ließ sich ein
-- Auftrag mit „Rechnung nötig“ nicht abschließen – man kam beim Bearbeiten nicht weiter. Jetzt
-- verlangt `pruefe_rechnungsdaten()` (Migrationen 44/53/57/74) die E-Mail nicht mehr. Name,
-- Anschrift, Fahrzeug, Kennzeichen und Kilometerstand bleiben Pflicht.
--
-- Die App zeigt stattdessen in „Rechnungen noch nicht ausgestellt“ (Aufträge und Rechnungen) einen
-- roten Hinweis „E-Mail hinterlegen“; nachtragen lässt sie sich auch am erledigten Auftrag.
--
-- Reihenfolge: nach 78, SQL zuerst, dann die Dateien von v128. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

create or replace function public.pruefe_rechnungsdaten()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  fehlt text[] := '{}';
  kunde public.customers%rowtype;
  ohne_kennzeichen int;
  ohne_km int;
  anzahl int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'erledigt' then return new; end if;
  if not coalesce(new.rechnung_noetig, false) then return new; end if;

  select * into kunde from public.customers c where c.id = new.customer_id;

  -- Laufkundschaft: Der Beleg ist eine Kleinbetragsrechnung nach § 33 UStDV und braucht weder
  -- Empfängerangaben noch ein Fahrzeug. Die Steuer wird trotzdem gerechnet – genau dafür bleibt
  -- der Haken „Rechnung benötigt" gesetzt.
  if coalesce(kunde.laufkundschaft, false) then
    return new;
  end if;

  if coalesce(btrim(kunde.name), '') = '' then
    fehlt := array_append(fehlt, 'Name des Kunden');
  end if;
  if coalesce(btrim(kunde.address), '') = '' then
    fehlt := array_append(fehlt, 'Anschrift des Kunden');
  end if;
  -- Migration 79 (v128): Die E-Mail-Adresse wird nicht mehr verlangt. Sie fehlt unterwegs oft und
  -- wird später nachgetragen; die App erinnert in der Liste „Rechnungen noch nicht ausgestellt“.
  -- Dieselbe Regel steht in `rechnungsdatenMaengel()` (lib/helpers.ts, `pflicht: false`).

  select count(*) into anzahl
    from public.auftrag_fahrzeuge af where af.order_id = new.id;
  if anzahl = 0 then
    fehlt := array_append(fehlt, 'mindestens ein Fahrzeug am Auftrag');
  else
    select count(*) into ohne_kennzeichen
      from public.auftrag_fahrzeuge af
      join public.vehicles v on v.id = af.vehicle_id
     where af.order_id = new.id
       and coalesce(btrim(v.license_plate), '') = '';
    if ohne_kennzeichen > 0 then
      fehlt := array_append(fehlt, ohne_kennzeichen || ' Fahrzeug(e) ohne Kennzeichen');
    end if;

    select count(*) into ohne_km
      from public.auftrag_fahrzeuge af
     where af.order_id = new.id and af.kilometerstand is null;
    if ohne_km > 0 then
      fehlt := array_append(fehlt, ohne_km || ' Fahrzeug(e) ohne Kilometerstand');
    end if;
  end if;

  if array_length(fehlt, 1) > 0 then
    raise exception 'Für die Rechnung fehlt noch: %. Entweder ergänzen oder den Haken "Rechnung benötigt" entfernen.',
      array_to_string(fehlt, ', ');
  end if;

  return new;
end;
$function$;

select 'E-Mail wird beim Abschließen noch verlangt (sollte false sein)' as pruefung,
       (position('E-Mail-Adresse des Kunden' in pg_get_functiondef('public.pruefe_rechnungsdaten()'::regprocedure)) > 0)::text as ergebnis;

-- =====================================================================
-- Rücknahme von Migration 79: `pruefe_rechnungsdaten()` verlangt wieder die E-Mail-Adresse
-- (Stand nach Migration 78). Zweimal lauffähig. Erst die Dateien von v127 wieder hochladen.
-- Achtung: Aufträge, die inzwischen ohne E-Mail abgeschlossen wurden, bleiben abgeschlossen.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
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
  if coalesce(btrim(kunde.email), '') = '' then
    fehlt := array_append(fehlt, 'E-Mail-Adresse des Kunden');
  end if;

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

select 'E-Mail wird beim Abschließen wieder verlangt (sollte true sein)' as pruefung,
       (position('E-Mail-Adresse des Kunden' in pg_get_functiondef('public.pruefe_rechnungsdaten()'::regprocedure)) > 0)::text as ergebnis;

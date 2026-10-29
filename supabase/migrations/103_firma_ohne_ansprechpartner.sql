-- =====================================================================
-- Migration 103 – Firma ohne Ansprechpartner (29.10.2026, v172).
--
-- Wunsch Vitali 29.10.2026: Bei einem Geschäftskunden ist die FIRMA Pflicht, der Ansprechpartner nicht.
-- Bisher verlangte `pruefe_rechnungsdaten()` (zuletzt Migration 79) beim Abschließen eines Auftrags mit
-- „Rechnung nötig“ den Namen – bei einer Firma ohne Ansprechpartner wäre der Abschluss gescheitert.
-- Jetzt genügt Name ODER Firma. Alles andere bleibt wie nach Migration 79: Anschrift, Fahrzeug,
-- Kennzeichen und Kilometerstand sind Pflicht, die E-Mail-Adresse nicht.
--
-- Nebenwirkung, gewollt: Die Funktion steht danach in jedem Fall ohne E-Mail-Pflicht da – auch wenn
-- Migration 79 in der Datenbank nie gelaufen sein sollte (Meldung 26.10.2026: Techniker kam wegen der
-- E-Mail nicht weiter). Die Ergebnistabelle zeigt beides.
--
-- Reihenfolge: nach 102, SQL zuerst, dann die Dateien von v172. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.customers') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.customers. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
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

  -- Migration 103 (v172): Name ODER Firma. Bei einer Firma ist der Ansprechpartner (`name`) freiwillig.
  -- Dieselbe Regel steht in `rechnungsdatenMaengel()` (lib/helpers.ts) und `stammdatenFehlen()` (lib/kundenAnsicht.ts).
  if coalesce(btrim(kunde.name), '') = '' and coalesce(btrim(kunde.company), '') = '' then
    fehlt := array_append(fehlt, 'Name oder Firma des Kunden');
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

select 'Firma ohne Ansprechpartner genügt (sollte true sein)' as pruefung,
       (position('Name oder Firma des Kunden' in pg_get_functiondef('public.pruefe_rechnungsdaten()'::regprocedure)) > 0)::text as ergebnis
union all
select 'E-Mail wird beim Abschließen noch verlangt (sollte false sein)',
       (position('E-Mail-Adresse des Kunden' in pg_get_functiondef('public.pruefe_rechnungsdaten()'::regprocedure)) > 0)::text
union all
select 'Firmenkunden ohne Ansprechpartner',
       (select count(*)::text from public.customers where coalesce(btrim(name), '') = '' and coalesce(btrim(company), '') <> '');

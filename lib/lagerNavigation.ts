// Zum Lager navigieren – aus dem Schnellmenü (v169, Migration 102).
//
// Wunsch Vitali (19.10.2026): meist geht es in dasselbe Lager; der Weg dorthin über den Lager-Reiter war jedes Mal
// ein Umweg. Welches Lager der Knopf ansteuert, steht je Person in `user_settings.nav_lager_id`; leer heißt: das Lager,
// dessen Name „Hauptlager“ enthält, sonst das erste mit Adresse, sonst das erste überhaupt. Lager haben keine
// Koordinate – navigiert wird zur Adresse. Geprüft in tests/lagerNavigation.test.ts.

import type { Customer, Warehouse } from "./types";

export function navigationsLager(lager: Warehouse[], gewaehltId: string | null | undefined): Warehouse | null {
  if (!lager.length) return null;
  const gewaehlt = gewaehltId ? lager.find((w) => w.id === gewaehltId) : undefined;
  if (gewaehlt) return gewaehlt;
  const mitAdresse = lager.filter((w) => (w.address || "").trim());
  return lager.find((w) => /hauptlager/i.test(w.name)) ?? mitAdresse[0] ?? lager[0];
}

// Das Ziel in der Form, die das Navigationsmenü (Google Maps / Apple Karten) für Kunden nimmt – ohne Koordinate,
// also über die Adresse (`navigationsZiel` in lib/helpers.ts).
export function lagerNavZiel(w: Warehouse): Pick<Customer, "lat" | "lng" | "geo_genauigkeit" | "address"> | null {
  const adresse = (w.address || "").trim();
  return adresse ? { lat: null, lng: null, geo_genauigkeit: null, address: adresse } : null;
}

// Tagesroute nach Fahrstrecke (Fahrplan E5, v104).
//
// Die Tagesliste steht nach Uhrzeit. Wer plant – oder einen Tag mit Terminen ohne Uhrzeit vor sich
// hat –, will wissen: In welcher Reihenfolge fährt man am kürzesten, von der Firma los und wieder
// zurück? Gerechnet wird hier, in der App, über die Kartenpositionen der Kunden:
//
//   * Abstand = Luftlinie (Haversine). Ein Routendienst kennte die Straßen, bekäme dafür aber jede
//     Kundenanschrift – und wäre ein weiterer Dienstleister (CLAUDE.md, Abschnitt 5). Für die
//     REIHENFOLGE genügt die Luftlinie fast immer; die Kilometer stehen deshalb als „ca." da, mit
//     einem Umwegfaktor auf die Luftlinie (`UMWEG_FAKTOR`).
//   * Reihenfolge = nächster Nachbar ab der Firma, danach 2-opt (zwei Kanten tauschen, solange es
//     kürzer wird). Bei den zehn bis fünfzehn Stopps eines Tages ist das in Millisekunden fertig und
//     liegt erfahrungsgemäß sehr nah am Optimum.
//
// Die Uhrzeiten werden NICHT verändert: Ein vereinbarter Termin ist eine Zusage an den Kunden. Die
// Route ist ein Vorschlag, mit dem man plant; was davon in die Uhrzeiten geht, entscheidet ein Mensch.
//
// Reine Funktionen, geprüft in tests/route.test.ts.

export type Punkt = { lat: number; lng: number };

// Straße statt Luftlinie: im Umland rund 1,3-mal so weit. Ein Erfahrungswert – genau wird es nur
// mit einem Routendienst, und den gibt es hier bewusst nicht.
export const UMWEG_FAKTOR = 1.3;

const ERDRADIUS_KM = 6371;

export function luftlinieKm(a: Punkt, b: Punkt): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * ERDRADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Länge einer Fahrt durch `punkte` in der gegebenen Reihenfolge – mit Start, und zurück zum Start,
// wenn einer da ist. Ohne Start beginnt sie beim ersten Punkt und endet beim letzten.
export function streckeKm(start: Punkt | null, punkte: Punkt[]): number {
  if (punkte.length === 0) return 0;
  let km = 0;
  if (start) km += luftlinieKm(start, punkte[0]);
  for (let i = 1; i < punkte.length; i++) km += luftlinieKm(punkte[i - 1], punkte[i]);
  if (start) km += luftlinieKm(punkte[punkte.length - 1], start);
  return km;
}

// Die kürzeste Reihenfolge (als Indizes in `punkte`). Mit Start: eine Runde von dort und zurück.
// Ohne Start: ein Weg, der beim ersten Punkt der Liste beginnt – er ist der früheste Termin.
export function kuerzesteReihenfolge(start: Punkt | null, punkte: Punkt[]): number[] {
  const n = punkte.length;
  if (n <= 1) return punkte.map((_, i) => i);
  // 1. Nächster Nachbar.
  const offen = new Set(punkte.map((_, i) => i));
  const folge: number[] = [];
  let hier: Punkt;
  if (start) {
    hier = start;
  } else {
    folge.push(0); offen.delete(0); hier = punkte[0];
  }
  while (offen.size > 0) {
    let bester = -1, besterKm = Infinity;
    for (const i of offen) {
      const km = luftlinieKm(hier, punkte[i]);
      if (km < besterKm - 1e-9 || (Math.abs(km - besterKm) <= 1e-9 && i < bester)) { bester = i; besterKm = km; }
    }
    folge.push(bester); offen.delete(bester); hier = punkte[bester];
  }
  // 2. 2-opt: einen Abschnitt umdrehen, solange die Strecke kürzer wird. Ohne Start bleibt der
  //    erste Punkt fest (Index 0 wird nicht umgedreht).
  const laenge = (f: number[]) => streckeKm(start, f.map((i) => punkte[i]));
  let besser = true;
  let aktuell = laenge(folge);
  const ab = start ? 0 : 1;
  while (besser) {
    besser = false;
    for (let i = ab; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const neu = [...folge.slice(0, i), ...folge.slice(i, k + 1).reverse(), ...folge.slice(k + 1)];
        const km = laenge(neu);
        if (km < aktuell - 1e-6) { folge.splice(0, n, ...neu); aktuell = km; besser = true; }
      }
    }
  }
  return folge;
}

export type RoutenStopp<T> = { eintrag: T; punkt: Punkt | null };

export type Routenvorschlag<T> = {
  // In der vorgeschlagenen Reihenfolge.
  reihenfolge: T[];
  // Ohne Kartenposition – sie lassen sich nicht einplanen und stehen getrennt da.
  ohnePosition: T[];
  // Luftlinie mal Umwegfaktor, gerundet auf ganze Kilometer.
  kmVorschlag: number;
  kmNachUhrzeit: number;
  // Weicht der Vorschlag von der Reihenfolge nach Uhrzeit ab?
  andersAlsUhrzeit: boolean;
};

// Der Vorschlag für einen Tag. `stopps` kommen in der Reihenfolge nach Uhrzeit (so, wie die
// Tagesliste sie zeigt) – gegen diese Reihenfolge wird verglichen.
export function routenvorschlag<T>(start: Punkt | null, stopps: RoutenStopp<T>[]): Routenvorschlag<T> {
  const mit = stopps.filter((s): s is { eintrag: T; punkt: Punkt } => !!s.punkt);
  const ohnePosition = stopps.filter((s) => !s.punkt).map((s) => s.eintrag);
  const punkte = mit.map((s) => s.punkt);
  const folge = kuerzesteReihenfolge(start, punkte);
  const km = (f: number[]) => Math.round(streckeKm(start, f.map((i) => punkte[i])) * UMWEG_FAKTOR);
  const nachUhrzeit = mit.map((_, i) => i);
  return {
    reihenfolge: folge.map((i) => mit[i].eintrag),
    ohnePosition,
    kmVorschlag: km(folge),
    kmNachUhrzeit: km(nachUhrzeit),
    andersAlsUhrzeit: folge.some((i, j) => i !== j),
  };
}

// Google Maps mit allen Stopps – Start, Zwischenziele, Ziel. Google nimmt in einem Link höchstens
// neun Zwischenziele; was darüber hinausgeht, fällt weg, und der Aufrufer sagt das dazu.
export const MAPS_ZWISCHENZIELE_MAX = 9;

export function mapsRoutenUrl(start: string | null, ziele: string[]): string | null {
  if (ziele.length === 0) return null;
  const alle = start ? [...ziele, start] : ziele;
  const ziel = alle[alle.length - 1];
  const zwischen = alle.slice(0, -1).slice(0, MAPS_ZWISCHENZIELE_MAX);
  const p = new URLSearchParams({ api: "1", destination: ziel, travelmode: "driving" });
  if (start) p.set("origin", start);
  if (zwischen.length > 0) p.set("waypoints", zwischen.join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

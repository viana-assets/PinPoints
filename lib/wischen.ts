// Im Kalender der Einsatzplanung blättern durch Wischen (04.10.2026, v107).
//
// Nach links wischen = weiter (nächster Monat, nächste Woche, nächster Tag), nach rechts =
// zurück – wie in jedem Kalender am Handy. Dieselbe Wirkung wie ‹ und › in der Bedienleiste.
//
// Das Raster kennt schon zwei andere Gesten mit dem Finger, und das Wischen darf keine davon
// stehlen:
//   - Termin ziehen: LANG drücken (400 ms, Stundenraster.tsx), dann ziehen. Ein Wisch beginnt
//     dagegen sofort. Fängt der Finger erst nach WISCH_START_MAX_MS an, sich zu bewegen, ist es
//     kein Wisch – auch wenn er danach waagrecht über den Bildschirm geht.
//   - Zoomen mit zwei Fingern: Liegt je mehr als ein Finger auf, ist es kein Wisch.
// Und das senkrechte Scrollen durch den Tag bleibt: Gewischt ist nur, was deutlich waagrecht
// ging (WISCH_VERHAELTNIS) und weit genug (WISCH_MIN_PX).
//
// Eine reine Rechenfunktion, damit sich die Grenzen prüfen lassen (tests/wischen.test.ts); die
// Finger-Ereignisse sammelt EinsatzplanungPanel.

// So weit muss der Finger waagrecht gehen – weniger ist ein Zittern beim Antippen.
export const WISCH_MIN_PX = 60;
// So viel deutlicher waagrecht als senkrecht – sonst war es Scrollen mit etwas Drift.
export const WISCH_VERHAELTNIS = 1.5;
// So lange darf ein Wisch insgesamt dauern. Langsames Schieben ist kein Blättern.
export const WISCH_MAX_MS = 800;
// Bewegt sich der Finger erst später, wurde gedrückt und gehalten (Termin ziehen).
export const WISCH_START_MAX_MS = 300;

export type Wisch = {
  dx: number;              // waagrecht in px, negativ = nach links
  dy: number;              // senkrecht in px
  dauerMs: number;         // vom Aufsetzen bis zum Loslassen
  ersteBewegungMs: number | null; // wann der Finger sich zum ersten Mal deutlich bewegte
};

// -1 = zurück, 1 = weiter, 0 = kein Blättern.
export function wischRichtung(w: Wisch): -1 | 0 | 1 {
  if (w.ersteBewegungMs === null || w.ersteBewegungMs > WISCH_START_MAX_MS) return 0;
  if (w.dauerMs > WISCH_MAX_MS) return 0;
  if (Math.abs(w.dx) < WISCH_MIN_PX) return 0;
  if (Math.abs(w.dx) < Math.abs(w.dy) * WISCH_VERHAELTNIS) return 0;
  return w.dx < 0 ? 1 : -1;
}

// Das nächste Element zwischen `ziel` und `grenze`, das sich selbst seitlich rollen lässt. Wischt
// man dort, rollt zuerst dieses Element; geblättert wird nur, wenn es sich dabei nicht bewegt hat
// (es stand schon am Rand).
export function seitlichRollbar(ziel: Element | null, grenze: Element): HTMLElement | null {
  let el: Element | null = ziel;
  while (el && el !== grenze) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}

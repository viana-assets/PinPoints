// Uhrzeit tippen ODER aus einer Liste wählen (v168, `components/ZeitFeld.tsx`).
//
// Wunsch Vitali (19.10.2026, Bildschirmfoto Edge): Das eingebaute Zeitfeld (`<input type="time">`) bot am Rechner eine
// Rolle mit allen 60 Minuten, und Tippen ging nur Stelle für Stelle. Jetzt ist es ein Textfeld, das verzeiht – „9“,
// „930“, „0930“, „9:30“, „9.30“, „9 30“, „9h“ ergeben 09:00 bzw. 09:30 –, und darunter eine Liste im
// Viertelstundentakt. Am Handy dieselbe Liste und die Zifferntastatur.
// Geprüft in tests/zeitEingabe.test.ts.

import { hhmmAus, minutenAus } from "./calendar";

// Takt und Spanne der Auswahlliste. Getippt werden darf jede Minute des Tages.
export const ZEIT_WAHL = { rasterMin: 15, vonStunde: 6, bisStunde: 21 } as const;

// Eingabe → „HH:MM“; leer → ""; nicht lesbar → null.
export function zeitAusEingabe(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s*(uhr|h)$/, "");
  if (t === "") return "";
  let std: number, min: number;
  const getrennt = /^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/.exec(t);
  if (getrennt) {
    std = Number(getrennt[1]);
    // „9:3“ meint 9:30, nicht 9:03 – so liest man es auch.
    min = getrennt[2].length === 1 ? Number(getrennt[2]) * 10 : Number(getrennt[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) { std = Number(t); min = 0; }
    else if (t.length === 3) { std = Number(t.slice(0, 1)); min = Number(t.slice(1)); }
    else { std = Number(t.slice(0, 2)); min = Number(t.slice(2)); }
  } else return null;
  if (std > 23 || min > 59) return null;
  return hhmmAus(std * 60 + min);
}

// Die Einträge der Liste. `ab` (z. B. der Beginn beim „bis“-Feld): nur spätere Zeiten.
export function zeitVorschlaege(ab?: string | null, raster: number = ZEIT_WAHL.rasterMin): string[] {
  const start = ZEIT_WAHL.vonStunde * 60;
  const ende = ZEIT_WAHL.bisStunde * 60;
  const nach = minutenAus(ab ?? null);
  const liste: string[] = [];
  for (let m = start; m <= ende; m += raster) if (nach == null || m > nach) liste.push(hhmmAus(m));
  return liste;
}

// Welcher Listeneintrag beim Öffnen bzw. Tippen markiert wird: der genaue, sonst der nächstspätere.
export function naechsterVorschlag(liste: string[], wert: string | null | undefined): number {
  const m = minutenAus(wert ?? null);
  if (m == null) return -1;
  const i = liste.findIndex((z) => (minutenAus(z) ?? 0) >= m);
  return i === -1 ? liste.length - 1 : i;
}

// „+1 Std. 30“ – Dauer zum Beginn, für die Liste im „bis“-Feld.
export function dauerText(von: string | null | undefined, bis: string): string | null {
  const a = minutenAus(von ?? null), b = minutenAus(bis);
  if (a == null || b == null || b <= a) return null;
  const d = b - a, h = Math.floor(d / 60), m = d % 60;
  return h ? `${h} Std.${m ? ` ${m}` : ""}` : `${m} Min.`;
}

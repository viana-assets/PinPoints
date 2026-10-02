// Profiltiefe: Satzwert aus Sammelwert oder Rädern, Lage gegenüber den Grenzen, Text und Eingabe.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

import type { RadPosition } from "./types";
import { RAD_POSITIONEN } from "./constants";

// ---------------------------------------------------------------- Profiltiefe
//
// Die eine Zahl, die einen eingelagerten Satz beschreibt – egal, wie er erfasst wurde. Bei
// Sammelmessung ist es der Wert am Satz, bei Einzelerfassung das Minimum der Räder: Das
// schwächste Rad entscheidet, wann gewechselt werden muss, nicht der Durchschnitt. Ein
// Mittelwert würde den Fall „drei Räder gut, eins durch" verschwinden lassen – also genau den
// Fall, um dessentwillen einzeln gemessen wird.
export function satzProfilMm(
  satz: { erfassungsart?: "sammel" | "einzeln"; profiltiefe_mm: number | null },
  raeder: { profiltiefe_mm: number | null }[] = []
): number | null {
  if ((satz.erfassungsart ?? "sammel") === "sammel") return satz.profiltiefe_mm;
  const werte = raeder.map((r) => r.profiltiefe_mm).filter((w): w is number => w != null);
  return werte.length === 0 ? null : Math.min(...werte);
}

// Wie wurde gemessen – als eine Zeile für Listen (v98, 02.10.2026). Die Marke daneben zeigt nur
// EINE Zahl; ob das ein Wert für den Satz ist oder das schwächste von vier Rädern, stand bis v97
// nur als kleiner Pfeil und als Tooltip da – und den gibt es am Handy nicht.
//   je Rad:    „je Rad 5,0 · 5,5 · 6,0 · 6,0" (Reihenfolge VL, VR, HL, HR; „–" = nicht gemessen)
//   Satzwert:  „Satzwert" (kurz – steht in der Liste mit in der Zeile Kennzeichen · Saison)
//   nichts erfasst: null
export function profilAufteilung(
  satz: { erfassungsart?: "sammel" | "einzeln"; profiltiefe_mm: number | null; anzahl_raeder?: number },
  raeder: { position: RadPosition | null; profiltiefe_mm: number | null }[] = []
): string | null {
  if ((satz.erfassungsart ?? "sammel") === "sammel") return satz.profiltiefe_mm == null ? null : "Satzwert";
  const anzahl = Math.max(satz.anzahl_raeder ?? 4, raeder.length);
  const geordnet = [
    ...RAD_POSITIONEN.map((p) => raeder.find((r) => r.position === p)),
    ...raeder.filter((r) => r.position == null),
  ];
  const werte = geordnet.slice(0, Math.max(anzahl, 1)).map((r) => (r?.profiltiefe_mm != null ? profilZahl(r.profiltiefe_mm) : "–"));
  if (werte.every((w) => w === "–")) return "je Rad, noch nicht gemessen";
  return `je Rad ${werte.join(" · ")}`;
}

export type ProfilLage = "ohne" | "gut" | "hinweis" | "kritisch";

// Wie steht es um diese Profiltiefe? Drei Stufen statt einer Ampel mit fünf Farben: Der
// Techniker braucht vor Ort nur zu wissen, ob er etwas ansprechen soll.
export function profilLage(
  mm: number | null,
  grenzen: { hinweis: number; kritisch: number }
): ProfilLage {
  if (mm == null) return "ohne";
  if (mm < grenzen.kritisch) return "kritisch";
  if (mm < grenzen.hinweis) return "hinweis";
  return "gut";
}

// Anzeige mit einer Nachkommastelle und Komma – „3,1 mm". `toFixed` allein liefert einen
// Punkt, und 3.1 mm liest sich in einer deutschen Oberfläche falsch.
export function profilText(mm: number | null): string {
  return mm == null ? "–" : `${profilZahl(mm)} mm`;
}

// Dieselbe Zahl OHNE Einheit – für das Eingabefeld, das die Einheit daneben stehen hat. Eine
// eigene Funktion und kein `profilText(...).replace(" mm","")`: Wer die Einheit ändert, ändert
// sonst unbemerkt auch das, was im Feld steht.
export function profilZahl(mm: number): string {
  return mm.toFixed(1).replace(".", ",");
}

// Aus einer Eingabe eine Profiltiefe machen. `null` heißt „damit lässt sich nichts anfangen" –
// und das ist ausdrücklich etwas anderes als 0,0 mm. Ein leeres Feld als Null zu verbuchen
// wäre eine Messung, die niemand gemacht hat.
//
// Angenommen wird Komma wie Punkt: Auf der deutschen Tastatur liegt das Komma näher, die
// Zahlentastatur des iPhones bietet je nach Einstellung den Punkt. Beides meint dasselbe.
export function profilAusText(text: string, maxMm = 25): number | null {
  const roh = text.trim().replace(",", ".");
  if (roh === "") return null;
  // Nur Ziffern und höchstens ein Punkt. `parseFloat` würde aus „1,5 mm" klaglos 1.5 machen
  // und aus „6x" eine 6 – eine Eingabe, die offensichtlich anders gemeint war, soll nicht
  // stillschweigend zurechtgebogen werden.
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(roh)) return null;
  const zahl = Number(roh);
  if (!Number.isFinite(zahl) || zahl < 0 || zahl > maxMm) return null;
  return Math.round(zahl * 10) / 10;
}

// Die Räder nach ihrem Satz gruppiert. Listen wie die Saisonliste oder das Lagerregal fragen
// für jede Zeile nach den Rädern EINES Satzes; ohne diese Gruppierung wäre das je Zeile ein
// Durchlauf durch alle Räder – bei 400 Sätzen also 400 × alle. Einmal gruppieren, dann
// nachschlagen.
export function raederNachSatz<T extends { tire_storage_id: string }>(raeder: T[]): Map<string, T[]> {
  const nach = new Map<string, T[]>();
  for (const rad of raeder) {
    const liste = nach.get(rad.tire_storage_id);
    if (liste) liste.push(rad);
    else nach.set(rad.tire_storage_id, [rad]);
  }
  return nach;
}

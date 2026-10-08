import type { Customer } from "./types";
import type { KundenZustand } from "./helpers";

// Die Regeln hinter der neu gestalteten Kundenliste (26.09.2026, Entwurf „J · Kundenliste").
// Reine Funktionen, geprüft in tests/kundenAnsicht.test.ts.

// Unter welchem Namen steht ein Kunde in der Liste? Bei Firmenkunden die Firma, darunter der
// Ansprechpartner (Migration 24). Seit der Neugestaltung richten sich danach auch Sortierung,
// Buchstabengruppen und der A–Z-Filter – vorher sortierte die Liste nach dem Ansprechpartner
// und zeigte die Firma, sodass „Hofmann GmbH" unter „E" wie „Elke" stand.
export function anzeigeName(c: Pick<Customer, "name" | "company">): string {
  return (c.company || "").trim() || c.name.trim();
}

export function anfangsbuchstabe(c: Pick<Customer, "name" | "company">): string {
  return anzeigeName(c).charAt(0).toUpperCase();
}

// Ein fälliger Rückruf: eine Wiedervorlage, deren Tag erreicht ist, bei einem Kunden, der noch
// offen ist (Zustand „red"). Dieselbe Regel wie „Rückrufe fällig" im Dashboard
// (lib/dashboard.ts, `zuErledigen`) – ein Kunde mit Termin oder „kein Interesse" ist kein
// Rückruf, auch wenn noch ein altes Datum an ihm hängt.
export function rueckrufFaellig(c: Pick<Customer, "wiedervorlage_am">, zustand: KundenZustand, heute: string): boolean {
  return zustand === "red" && !!c.wiedervorlage_am && c.wiedervorlage_am <= heute;
}

// Die sichtbaren Kunden nach Anfangsbuchstaben gebündelt – in der Reihenfolge, in der sie
// kommen (die Liste ist schon sortiert). Nicht-Buchstaben (Ziffern, Zeichen) landen unter „#".
export function nachBuchstaben<C extends Pick<Customer, "name" | "company">>(kunden: C[]): { buchstabe: string; kunden: C[] }[] {
  const gruppen: { buchstabe: string; kunden: C[] }[] = [];
  for (const k of kunden) {
    const roh = anfangsbuchstabe(k);
    const b = /\p{L}/u.test(roh) ? roh : "#";
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.buchstabe === b) letzte.kunden.push(k);
    else gruppen.push({ buchstabe: b, kunden: [k] });
  }
  return gruppen;
}

// Zwei Buchstaben für den Kreis vor dem Namen: „Hofmann GmbH" → „HG", „Nadine Kurz" → „NK".
export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter((t) => /\p{L}|\d/u.test(t.charAt(0)));
  return teile.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join("") || "?";
}

// Kundenart-Filter neben A–Z (08.10.2026, v128). Die Arten überschneiden sich bewusst: Ein
// Einmalkunde ist zugleich Privat- oder Firmenkunde, ein Testkunde ebenso. Privat und Firma
// trennt allein das Feld „Firma“; die Laufkundschaft (Sammelkunde, Migration 53) ist keins von
// beiden.
export type KundenArt = "alle" | "privat" | "firma" | "einmal" | "test";

export const KUNDEN_ARTEN: { wert: KundenArt; text: string }[] = [
  { wert: "alle", text: "Alle Kundenarten" },
  { wert: "privat", text: "Privatkunden" },
  { wert: "firma", text: "Firmenkunden" },
  { wert: "einmal", text: "Einmalkunden" },
  { wert: "test", text: "Testkunden" },
];

type ArtFelder = Pick<Customer, "company" | "laufkundschaft" | "einmalkunde" | "testkunde">;

export function kundenArtPasst(c: ArtFelder, art: KundenArt): boolean {
  const firma = (c.company || "").trim() !== "";
  switch (art) {
    case "alle": return true;
    case "privat": return !firma && !c.laufkundschaft;
    case "firma": return firma && !c.laufkundschaft;
    case "einmal": return !!c.einmalkunde;
    case "test": return !!c.testkunde;
  }
}

export function kundenArtZahlen(kunden: ArtFelder[]): Record<KundenArt, number> {
  const z: Record<KundenArt, number> = { alle: 0, privat: 0, firma: 0, einmal: 0, test: 0 };
  for (const c of kunden) for (const { wert } of KUNDEN_ARTEN) if (kundenArtPasst(c, wert)) z[wert]++;
  return z;
}

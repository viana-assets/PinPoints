// Finance Stufe G (v186): das Auswertungs-Cockpit – die Kacheln aus Salden, Plan und Voranmeldung. Ohne Datenbank,
// geprüft in tests/financeCockpit.test.ts. Jede Kachel führt in die Auswertung dahinter.

import { bwa, type FinSaldo } from "./auswertungen";
import type { FinKonto } from "./buchung";
import type { FinEinstellungen, Kontenrahmen } from "./einstellungen";
import { geldBestand } from "./liquiditaet";
import { planAlsSalden, type FinPlanWert } from "./plan";
import { ustFormular, ustZustand, zeitraumText, type FinUstStand } from "./steuern";

const cent = (n: number) => Math.round(n * 100) / 100;

export type CockpitWerte = {
  umsatzMonat: number; umsatzJahr: number; rohertrag: number; ergebnis: number;
  // Ergebnis laut Plan bis zum Monat – null ohne Plan.
  planErgebnis: number | null; planUmsatz: number | null;
  geld: number; forderungen: number; verbindlichkeiten: number;
};

export function cockpit(salden: readonly FinSaldo[], konten: readonly FinKonto[], rahmen: Kontenrahmen, monat: number, plan: readonly FinPlanWert[] = []): CockpitWerte {
  const b = bwa([...salden], [...konten], rahmen, monat);
  const p = plan.length ? bwa(planAlsSalden(plan, konten), [...konten], rahmen, monat).kumuliert : null;
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  let forderungen = 0, verbindlichkeiten = 0;
  for (const s of salden) {
    if (s.monat > monat) continue;
    const k = kat.get(s.konto);
    if (k === "forderung") forderungen += s.soll - s.haben;
    else if (k === "verbindlichkeit") verbindlichkeiten += s.haben - s.soll;
  }
  return {
    umsatzMonat: b.monat.umsatz, umsatzJahr: b.kumuliert.umsatz, rohertrag: b.kumuliert.rohertrag, ergebnis: b.kumuliert.ergebnis,
    planErgebnis: p ? p.ergebnis : null, planUmsatz: p ? p.umsatz : null,
    geld: geldBestand([...salden], [...konten], monat).summe, forderungen: cent(forderungen), verbindlichkeiten: cent(verbindlichkeiten),
  };
}

// Die nächste fällige (oder überfällige) Voranmeldung mit ihrer Zahllast laut Kennzahlen.
export function naechsteUst(stand: FinUstStand | null | undefined, e: Pick<FinEinstellungen, "dauerfrist" | "besteuerung" | "start_datum">, heute: string, jahr: number):
  { text: string; frist: string; betrag: number; ueberfaellig: boolean } | null {
  if (!stand?.eingerichtet) return null;
  const offen = stand.zeitraeume
    .map((z) => ({ z, s: ustZustand(z, e, heute) }))
    .filter((x): x is { z: typeof x.z; s: Extract<typeof x.s, { art: "offen" | "ueberfaellig" }> & { frist: string } } =>
      (x.s.art === "offen" || x.s.art === "ueberfaellig") && !!x.s.frist)
    .sort((a, b) => a.s.frist.localeCompare(b.s.frist))[0];
  return offen ? { text: zeitraumText(offen.z.zeitraum, jahr), frist: offen.s.frist, betrag: ustFormular(offen.z.kennzahlen).zahllast, ueberfaellig: offen.s.art === "ueberfaellig" } : null;
}

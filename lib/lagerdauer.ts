// Lagerdauer in angefangenen Monaten und die Langlieger-Grenze.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

// ---------------------------------------------------------------- Lagerdauer
//
// Wie viele Monate lag dieser Satz im Regal? Grundlage der Einlagerungsgebühr (Migration 46).
//
// ANGEFANGENER MONAT ZÄHLT VOLL, entschieden am 17.09.2026. Das ist die übliche Praxis und
// die einzige Regel, die man am Tresen in einem Satz erklären kann. 16.02. bis 17.09. sind
// damit 8 Monate, nicht 7.
//
// MINDESTENS EINS: Wer morgens bringt und nachmittags holt, zahlt einen Monat. Null Monate
// wären ein Satz, der nie gelegen hat – und der Platz war trotzdem belegt.
//
// Der Vergleich läuft über Kalenderfelder und nicht über Millisekunden: Ein Monat hat keine
// feste Länge, und `tage / 30.44` liefert bei jeder Schaltjahr- und Februarkombination eine
// andere Antwort auf dieselbe Frage.
export function lagermonate(von: Date | string, bis: Date | string): number {
  const a = typeof von === "string" ? new Date(von) : von;
  const b = typeof bis === "string" ? new Date(bis) : bis;
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 1;

  let monate = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // Ist der Tag im Zielmonat später als der Einlagerungstag, läuft ein weiterer Monat –
  // angefangen, also voll.
  if (b.getDate() > a.getDate()) monate += 1;
  return Math.max(1, monate);
}

// Ab wann lohnt beim Auslagern der zweite Blick? Acht Euro im Monat sind nach zwei Jahren
// 192 € – die Zahl ist richtig und trotzdem eine, die man dem Kunden nicht ungefragt hinlegt.
// Die Anwendung entscheidet das nicht, sie macht es nur sichtbar; ob gekürzt wird, ist eine
// Geschäftsentscheidung.
//
// Zwei Schwellen statt einer, weil zwei verschiedene Dinge auffallen sollen: ein Satz, der
// VERGESSEN wurde (die Monate), und eine SUMME, die aus dem Rahmen fällt – die kann auch bei
// wenigen Monaten entstehen, wenn der Monatspreis hoch ist.
export const LANGLIEGER_MONATE = 18;
export const LANGLIEGER_EURO = 150;

export function istLanglieger(monate: number, summeNetto: number | null): boolean {
  return monate >= LANGLIEGER_MONATE || (summeNetto !== null && summeNetto >= LANGLIEGER_EURO);
}

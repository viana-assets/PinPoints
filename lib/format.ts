// Datum und Betrag, wie die App sie überall schreibt.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106). lib/helpers.ts reicht alles hier weiter,
// damit bestehende Importe gültig bleiben; neuer Code importiert direkt aus dieser Datei. Eigene
// Datei auch deshalb, weil die Themendateien (lib/protokollText.ts …) diese vier brauchen und
// sonst lib/helpers.ts importieren müssten – das wäre ein Kreis.

// Das heutige Datum als `JJJJ-MM-TT` – in ORTSZEIT.
//
// Bis zum 21.09.2026 stand hier `toISOString().slice(0,10)`, und das ist immer UTC. In
// Deutschland war „heute" damit zwischen Mitternacht und 01:00 (Winterzeit) bzw. 02:00
// (Sommerzeit) noch der Vortag – jeden Tag, nicht nur an der Zeitumstellung. Betroffen war
// alles, was von hier kommt: das Vorgabedatum neuer Aufträge, der „Heute"-Knopf im Kalender,
// die Zeiträume Heute/Morgen/7 Tage und das Datum, mit dem der gültige Preis gesucht wird.
//
// Die Rechnung ist dieselbe wie in `toDateStr()` (lib/calendar.ts); die beiden liefen
// auseinander, und in genau dieser Stunde meinten „Heute"-Knopf und „ist heute"-Markierung
// im Stundenraster verschiedene Tage. `toDateStr` ruft jetzt hierher durch.
export function todayStr(): string {
  return datumStr(new Date());
}

// Ein Datum als `JJJJ-MM-TT` in Ortszeit. Bewusst von Hand zusammengesetzt statt über
// `toISOString()`: Die Zeitzone darf das Ergebnis nicht verschieben.
export function datumStr(d: Date): string {
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE");
}

export function formatEUR(amount: number): string {
  return amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

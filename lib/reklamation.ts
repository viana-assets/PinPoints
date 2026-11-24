// Reklamationsauftrag (Migration 120, v193, docs/auftraege.md „Reklamation“).
//
// Ruft ein Kunde nach einem Reifenwechsel an („das Lenkrad vibriert“), entsteht ein Auftrag mit `art = 'reklamation'`.
// Er bezieht sich auf den erledigten Auftrag von damals – oder, im Sonderfall, auf keinen (dann mit Begründung). Der
// Schnappschuss `reklamation_bezug` zeigt dem Techniker, was damals gemacht wurde. Beim Abschließen ist das Ergebnis
// Pflicht; berechnet wird nur „nicht berechtigt“.
//
// Hier stehen die Regeln für die Oberfläche (dieselben wie in `auftrag_reklamation_pruefen()`) und die Zahlen für die
// Auswertung: Anzahl, Quote, Gründe, Ergebnisse, Techniker des Bezugsauftrags und der Schaden – Kosten über den
// internen Stundensatz und der entgangene Umsatz über den Ø Umsatz je Terminstunde. Geprüft in tests/reklamation.test.ts.

import type { Order, OrderArticle, ReklamationErgebnis, ReklamationGrund } from "./types";
import { auftragsZeitraum } from "./calendar";
import { formatDate } from "./format";
import { orderArticleTotals } from "./helpers";
import { auftragsNr } from "./testkunde";

// Dieselbe Liste wie die Prüfregel `orders_reklamation_grund_werte` (Migration 120), in der Reihenfolge der Auswahl.
export const REKLAMATION_GRUENDE: { wert: ReklamationGrund; text: string }[] = [
  { wert: "vibration", text: "Vibration / Unwucht" },
  { wert: "radmutter", text: "Radmutter / Anzugsmoment" },
  { wert: "luftdruck", text: "Luftdruck / Ventil" },
  { wert: "beschaedigung", text: "Beschädigung an Felge oder Fahrzeug" },
  { wert: "falsche_montage", text: "Falscher Reifen / falsche Montage" },
  { wert: "sonstiges", text: "Sonstiges" },
];

// Das Ergebnis beim Abschließen (Prüfregel `orders_reklamation_ergebnis_werte`).
export const REKLAMATION_ERGEBNISSE: { wert: ReklamationErgebnis; text: string; info: string }[] = [
  { wert: "berechtigt", text: "Berechtigt", info: "unser Fehler – kostenlos nachgebessert" },
  { wert: "kulanz", text: "Kulanz", info: "nicht eindeutig unser Fehler, trotzdem kostenlos" },
  { wert: "nicht_berechtigt", text: "Nicht berechtigt", info: "Ursache beim Kunden – darf berechnet werden" },
];

// Längen wie die Prüfregel `orders_reklamation_laengen`.
export const REKLAMATION_TEXT_MAX = 1000;
export const REKLAMATION_OHNE_BEZUG_MAX = 300;

export function grundText(g: ReklamationGrund | null | undefined): string {
  return REKLAMATION_GRUENDE.find((x) => x.wert === g)?.text ?? "ohne Grund";
}
export function ergebnisText(e: ReklamationErgebnis | null | undefined): string {
  return REKLAMATION_ERGEBNISSE.find((x) => x.wert === e)?.text ?? "offen";
}

export function istReklamation(o: Pick<Order, "art"> | null | undefined): boolean {
  return o?.art === "reklamation";
}

// „Reklamation – Muster GmbH“ als Titel, wie „Termin – …“ bei gewöhnlichen Aufträgen.
export function reklamationTitel(kunde: string | undefined): string {
  return kunde?.trim() ? `Reklamation – ${kunde.trim()}` : "Reklamation";
}

// „zu Auftrag #441 vom 12.10.2026“ – oder „ohne Bezugsauftrag“.
export function bezugText(o: Pick<Order, "reklamation_bezug" | "reklamation_von">): string {
  const b = o.reklamation_bezug;
  if (!b) return "ohne Bezugsauftrag";
  return `zu Auftrag #${auftragsNr(b.nummer)} vom ${formatDate(b.datum)}`;
}

// ---------------------------------------------------------------- Anlegen
export type ReklamationEntwurf = {
  kundeId: string;
  vonId: string | null;
  grund: ReklamationGrund | "";
  text: string;
  ohneBezug: string;
};

// Dieselben Regeln wie `auftrag_reklamation_pruefen()` beim Anlegen.
export function reklamationMaengel(e: ReklamationEntwurf): string | null {
  if (!e.kundeId) return "Den Kunden wählen.";
  if (!e.vonId && !e.ohneBezug.trim()) return "Den Auftrag wählen, auf den sich die Reklamation bezieht – oder ohne Bezugsauftrag kurz begründen, warum es keinen gibt.";
  if (!e.grund) return "Den Grund der Reklamation wählen.";
  if (e.text.trim().length > REKLAMATION_TEXT_MAX) return `Der Text ist zu lang (höchstens ${REKLAMATION_TEXT_MAX} Zeichen).`;
  if (e.ohneBezug.trim().length > REKLAMATION_OHNE_BEZUG_MAX) return `Die Begründung ist zu lang (höchstens ${REKLAMATION_OHNE_BEZUG_MAX} Zeichen).`;
  return null;
}

// Die Aufträge, auf die sich eine Reklamation beziehen kann: erledigt, nicht gelöscht, neueste zuerst.
export function reklamationKandidaten(orders: readonly Order[]): Order[] {
  return orders
    .filter((o) => o.status === "erledigt" && !o.deleted_at)
    .sort((a, b) => b.order_date.localeCompare(a.order_date) || b.order_number - a.order_number);
}

// Was die Suche im Reklamationsfenster als Auftragsnummer liest: „441“, „#441“, „T12“ (Testauftrag = −12).
export function nummerAusSuche(text: string): number | null {
  const t = text.trim().replace(/^#/, "");
  if (/^\d{1,9}$/.test(t)) return Number(t);
  const test = /^t(\d{1,9})$/i.exec(t);
  return test ? -Number(test[1]) : null;
}

// ---------------------------------------------------------------- Abschließen
// Dieselben Regeln wie `auftrag_reklamation_pruefen()` beim Abschluss.
export function abschlussMaengel(ergebnis: ReklamationErgebnis | null, rechnungNoetig: boolean): string | null {
  if (!ergebnis) return "Das Ergebnis wählen: berechtigt, Kulanz oder nicht berechtigt.";
  if (rechnungNoetig && ergebnis !== "nicht_berechtigt") return "Berechnet wird eine Reklamation nur, wenn sie nicht berechtigt war.";
  return null;
}

// ---------------------------------------------------------------- Schaden
// Dauer des Termins in Minuten: von–bis, ohne Ende die Standarddauer, ohne Uhrzeit ebenfalls die Standarddauer.
export function terminDauerMin(o: Pick<Order, "time" | "end_time">, standardMin: number): number {
  const zr = auftragsZeitraum(o, standardMin);
  return zr ? zr.ende - zr.start : standardMin;
}

// Ø Netto-Umsatz je Terminstunde aus gewöhnlichen erledigten Aufträgen mit Uhrzeit, die im Zeitraum liegen. Null, wenn
// es keinen solchen Auftrag gibt. Testaufträge (negative Nummer) zählen nicht.
export function umsatzJeTerminstunde(orders: readonly Order[], positionen: readonly OrderArticle[], von: string, bis: string, standardMin: number): number | null {
  const je = new Map<string, OrderArticle[]>();
  for (const p of positionen) { if (p.deleted_at) continue; const l = je.get(p.order_id); if (l) l.push(p); else je.set(p.order_id, [p]); }
  let netto = 0, minuten = 0;
  for (const o of orders) {
    if (o.deleted_at || o.status !== "erledigt" || istReklamation(o) || o.order_number < 0) continue;
    if (o.order_date < von || o.order_date > bis || !o.time) continue;
    netto += orderArticleTotals(je.get(o.id) ?? [], o.rechnung_noetig).net;
    minuten += terminDauerMin(o, standardMin);
  }
  return minuten > 0 ? Math.round((netto / (minuten / 60)) * 100) / 100 : null;
}

export type ReklamationSchaden = {
  dauerMin: number;
  techniker: number;
  // Leistungen und Material der Reklamation zum Listenpreis (netto, ohne Endpreis).
  material: number;
  // Dauer × Techniker × interner Stundensatz + Material. Null ohne Stundensatz.
  kosten: number | null;
  // Dauer × Ø Umsatz je Terminstunde – eine Obergrenze: nur wenn der Platz sonst bezahlt belegt gewesen wäre.
  entgangen: number | null;
  // „nicht berechtigt“: Der Kunde trägt die Kosten, die Reklamation zählt nicht als Schaden.
  keinSchaden: boolean;
};

const rund = (n: number) => Math.round(n * 100) / 100;

export function reklamationSchaden(o: Order, positionen: readonly OrderArticle[], technikerAnzahl: number,
  stundensatz: number | null | undefined, jeStunde: number | null, standardMin: number): ReklamationSchaden {
  const dauerMin = terminDauerMin(o, standardMin);
  const techniker = Math.max(1, technikerAnzahl);
  const material = rund(positionen.filter((p) => p.order_id === o.id && !p.deleted_at).reduce((n, p) => n + p.quantity * Number(p.net_price), 0));
  const keinSchaden = o.reklamation_ergebnis === "nicht_berechtigt";
  if (keinSchaden) return { dauerMin, techniker, material, kosten: 0, entgangen: 0, keinSchaden };
  const h = dauerMin / 60;
  return {
    dauerMin, techniker, material, keinSchaden,
    kosten: stundensatz == null ? null : rund(h * techniker * Number(stundensatz) + material),
    entgangen: jeStunde == null ? null : rund(h * jeStunde),
  };
}

// ---------------------------------------------------------------- Auswertung
export type ReklamationZeile = { auftrag: Order; schaden: ReklamationSchaden };
export type ReklamationAuswertung = {
  anzahl: number;
  // Reklamationen je 100 erledigte gewöhnliche Aufträge im Zeitraum. Null ohne erledigte Aufträge.
  quote: number | null;
  offen: number;
  jeGrund: { grund: ReklamationGrund; anzahl: number }[];
  jeErgebnis: { ergebnis: ReklamationErgebnis | "offen"; anzahl: number }[];
  // Techniker des Bezugsauftrags (aus dem Schnappschuss). Nur zur Information – keine Bewertung von Personen.
  jeTechniker: { id: string; name: string; anzahl: number }[];
  ohneBezug: number;
  kosten: number;
  kostenUnvollstaendig: boolean;
  entgangen: number;
  minuten: number;
  zeilen: ReklamationZeile[];
};

export function reklamationAuswertung(d: {
  orders: readonly Order[]; positionen: readonly OrderArticle[]; orderEmployees: Record<string, string[]>;
  stundensatz: number | null | undefined; jeStunde: number | null; standardMin: number;
}, z: { von: string; bis: string }): ReklamationAuswertung {
  const im = (o: Order) => !o.deleted_at && o.order_number >= 0 && o.order_date >= z.von && o.order_date <= z.bis;
  const rekl = d.orders.filter((o) => im(o) && istReklamation(o) && o.status !== "storniert")
    .sort((a, b) => b.order_date.localeCompare(a.order_date) || b.order_number - a.order_number);
  const erledigt = d.orders.filter((o) => im(o) && !istReklamation(o) && o.status === "erledigt").length;

  const grund = new Map<ReklamationGrund, number>();
  const ergebnis = new Map<ReklamationErgebnis | "offen", number>();
  const techniker = new Map<string, { id: string; name: string; anzahl: number }>();
  let ohneBezug = 0, kosten = 0, entgangen = 0, minuten = 0, kostenUnvollstaendig = false, offen = 0;
  const zeilen: ReklamationZeile[] = [];
  for (const o of rekl) {
    if (o.reklamation_grund) grund.set(o.reklamation_grund, (grund.get(o.reklamation_grund) ?? 0) + 1);
    const erg = o.status === "erledigt" && o.reklamation_ergebnis ? o.reklamation_ergebnis : "offen";
    if (erg === "offen") offen++;
    ergebnis.set(erg, (ergebnis.get(erg) ?? 0) + 1);
    if (!o.reklamation_bezug) ohneBezug++;
    for (const t of o.reklamation_bezug?.techniker ?? []) {
      const e = techniker.get(t.id) ?? { id: t.id, name: t.name, anzahl: 0 };
      e.anzahl++;
      techniker.set(t.id, e);
    }
    const s = reklamationSchaden(o, d.positionen, (d.orderEmployees[o.id] ?? []).length, d.stundensatz, d.jeStunde, d.standardMin);
    minuten += s.dauerMin;
    if (s.kosten == null) kostenUnvollstaendig = true; else kosten += s.kosten;
    entgangen += s.entgangen ?? 0;
    zeilen.push({ auftrag: o, schaden: s });
  }
  const reihe = <K extends string>(m: Map<K, number>, ordnung: K[]) => ordnung.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  return {
    anzahl: rekl.length,
    quote: erledigt > 0 ? Math.round((rekl.length / erledigt) * 1000) / 10 : null,
    offen,
    jeGrund: reihe(grund, REKLAMATION_GRUENDE.map((g) => g.wert)).map(([g, n]) => ({ grund: g, anzahl: n })),
    jeErgebnis: reihe(ergebnis, [...REKLAMATION_ERGEBNISSE.map((x) => x.wert), "offen" as const]).map(([e, n]) => ({ ergebnis: e, anzahl: n })),
    jeTechniker: [...techniker.values()].sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de")),
    ohneBezug,
    kosten: rund(kosten),
    kostenUnvollstaendig,
    entgangen: rund(entgangen),
    minuten,
    zeilen,
  };
}

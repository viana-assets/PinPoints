// Packliste „Was muss heute mit" (E2, 02.10.2026).
//
// Die Mitnehmen-Liste (lib/mitnehmen.ts) sagt, welche eingelagerten SÄTZE ins Auto müssen. Für
// die Beladung am Morgen fehlte der Rest: welche Leistungen an diesem Tag anstehen (wie viele
// Räderwechsel, wie viel Auswuchten – daraus folgen Gewichte, Ventile, Werkzeug) und welche
// Reifengrößen die Autos des Tages fahren. Beides steht schon in den Aufträgen; hier wird es nur
// zusammengezogen. Keine neuen Daten, keine neue Tabelle.
//
// DIESELBE AUSWAHL WIE BEI DEN SÄTZEN: offene und begonnene Aufträge des Tages. Ein erledigter
// Auftrag braucht nichts mehr, ein stornierter nichts mehr.
//
// FAHRZEUG EINES AUFTRAGS: die am Auftrag eingetragenen (Migration 44). Steht keines dabei und
// hat der Kunde genau ein Auto, ist es das. Sonst ist die Größe unbekannt – das wird gezählt und
// angezeigt, statt still eine zu raten.

import type { Article, AuftragFahrzeug, Order, OrderArticle, Vehicle } from "./types";

export type Packliste = {
  auftraege: number;
  // Je Leistung die Summe über alle Aufträge, größte Menge zuerst.
  leistungen: { name: string; menge: number }[];
  // Je Reifengröße die Zahl der Autos, häufigste zuerst.
  groessen: { groesse: string; autos: number }[];
  // Aufträge, zu denen sich kein Auto oder keine Größe finden ließ.
  ohneGroesse: number;
};

// Schreibweisen vereinheitlichen, damit „205/55R16" und „205/55 r16" eine Zeile sind.
export function groesseSchluessel(groesse: string): string {
  return groesse.trim().toUpperCase().replace(/\s+/g, " ").replace(/\s*R\s*(\d)/, " R$1");
}

export function packliste(
  datum: string,
  auftraege: Order[],
  positionen: OrderArticle[],
  artikel: Article[],
  auftragFahrzeuge: AuftragFahrzeug[],
  fahrzeuge: Vehicle[]
): Packliste {
  const tag = auftraege.filter((o) => o.order_date === datum && !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit"));
  const ids = new Set(tag.map((o) => o.id));

  const mengen = new Map<string, number>();
  for (const p of positionen) {
    if (!ids.has(p.order_id) || p.deleted_at) continue;
    const name = artikel.find((a) => a.id === p.article_id)?.short_name ?? "Leistung";
    mengen.set(name, (mengen.get(name) ?? 0) + p.quantity);
  }
  const leistungen = [...mengen].map(([name, menge]) => ({ name, menge }))
    .sort((a, b) => b.menge - a.menge || a.name.localeCompare(b.name, "de"));

  const autos = new Map<string, number>();
  let ohneGroesse = 0;
  for (const o of tag) {
    const amAuftrag = auftragFahrzeuge.filter((af) => af.order_id === o.id)
      .map((af) => fahrzeuge.find((v) => v.id === af.vehicle_id))
      .filter((v): v is Vehicle => !!v);
    const desKunden = fahrzeuge.filter((v) => v.customer_id === o.customer_id);
    const liste = amAuftrag.length > 0 ? amAuftrag : desKunden.length === 1 ? desKunden : [];
    const mitGroesse = liste.filter((v) => (v.tire_size ?? "").trim() !== "");
    if (mitGroesse.length === 0) { ohneGroesse++; continue; }
    for (const v of mitGroesse) {
      const g = groesseSchluessel(v.tire_size!);
      autos.set(g, (autos.get(g) ?? 0) + 1);
    }
  }
  const groessen = [...autos].map(([groesse, n]) => ({ groesse, autos: n }))
    .sort((a, b) => b.autos - a.autos || a.groesse.localeCompare(b.groesse));

  return { auftraege: tag.length, leistungen, groessen, ohneGroesse };
}

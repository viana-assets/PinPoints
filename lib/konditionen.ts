// Auswertung der Kundenkonditionen (v192): Kundenpreise (Migration 118) und Kundenartikel (Migration 119) im Umsatz.
// Grundlage sind die Leistungen erledigter Aufträge im Zeitraum – wie die Artikelauswertung (`jeArtikel`), nicht das
// Rechnungsbuch: Nur an der Leistung steht, ob ein Kundenpreis galt (`listenpreis_netto`) oder ein Kundenartikel
// abgerechnet wurde. Der „Preisvorteil“ ist, was der Kunde gegenüber dem Listenpreis gespart hat:
// (Listenpreis − Kundenpreis) × Menge. Ein von Hand gesetzter Endpreis (Sonderpreis) zählt nicht dazu – er ist ein
// Nachlass am Auftrag, kein Teil der Konditionen. Geprüft in tests/konditionen.test.ts.

import type { Article, Customer, KundenPreis, Order, OrderArticle } from "./types";
import { orderArticleTotals } from "./helpers";
import type { ArtikelWert, Zeitraum } from "./auswertung";

export type PositionsArt = "liste" | "kundenpreis" | "kundenartikel";

export function positionsArt(p: Pick<OrderArticle, "article_id" | "listenpreis_netto">, kundenartikel: ReadonlySet<string>): PositionsArt {
  if (kundenartikel.has(p.article_id)) return "kundenartikel";
  if (p.listenpreis_netto != null) return "kundenpreis";
  return "liste";
}

const rund = (n: number) => Math.round(n * 100) / 100;

export type KundeKonditionen = {
  id: string;
  name: string;
  kundennummer: number | null;
  hauptKundeId: string | null;
  auftraege: number;
  // Netto aller Leistungen, aufgeteilt nach Art.
  netto: number;
  liste: number;
  kundenpreis: number;
  kundenartikel: number;
  preisvorteil: number;
  letzterAuftrag: string | null;
  // Kundenpreise oder Kundenartikel hinterlegt (unabhängig vom Zeitraum).
  hinterlegt: boolean;
};

type Daten = { orders: Order[]; orderArticles: OrderArticle[]; articles: Pick<Article, "id" | "customer_id">[]; customers: Customer[] };

const kundenName = (c: Pick<Customer, "name" | "company"> | undefined) => (c ? (c.company || "").trim() || (c.name || "").trim() : "Unbekannt");

// Je Kunde die Aufteilung seiner Leistungen im Zeitraum. Laufkundschaft und Einmalkunden zählen nicht.
export function konditionenJeKunde(d: Daten, z: Zeitraum): Map<string, KundeKonditionen> {
  const kundenartikel = new Set(d.articles.filter((a) => a.customer_id).map((a) => a.id));
  const kunde = new Map(d.customers.map((c) => [c.id, c]));
  const auftrag = new Map<string, Order>();
  for (const o of d.orders) {
    if (o.deleted_at || o.status !== "erledigt" || !o.order_date || o.order_date < z.von || o.order_date > z.bis) continue;
    const c = kunde.get(o.customer_id);
    if (c?.laufkundschaft || c?.einmalkunde) continue;
    auftrag.set(o.id, o);
  }
  const je = new Map<string, KundeKonditionen>();
  const leer = (id: string): KundeKonditionen => {
    const c = kunde.get(id);
    return { id, name: kundenName(c), kundennummer: c?.kundennummer ?? null, hauptKundeId: c?.haupt_kunde_id ?? null, auftraege: 0,
      netto: 0, liste: 0, kundenpreis: 0, kundenartikel: 0, preisvorteil: 0, letzterAuftrag: null, hinterlegt: false };
  };
  const gezaehlt = new Set<string>();
  for (const p of d.orderArticles) {
    if (p.deleted_at) continue;
    const o = auftrag.get(p.order_id);
    if (!o) continue;
    const e = je.get(o.customer_id) ?? leer(o.customer_id);
    const net = orderArticleTotals([p], o.rechnung_noetig).net;
    const art = positionsArt(p, kundenartikel);
    e.netto = rund(e.netto + net);
    e[art] = rund(e[art] + net);
    if (art === "kundenpreis") e.preisvorteil = rund(e.preisvorteil + (Number(p.listenpreis_netto) - Number(p.net_price)) * p.quantity);
    if (!gezaehlt.has(o.id)) { gezaehlt.add(o.id); e.auftraege += 1; }
    if (!e.letzterAuftrag || o.order_date > e.letzterAuftrag) e.letzterAuftrag = o.order_date;
    je.set(o.customer_id, e);
  }
  return je;
}

// Die Kunden mit Konditionen: hinterlegt (Kundenpreis oder Kundenartikel) oder im Zeitraum mit Kundenpreis bzw.
// Kundenartikel abgerechnet. Größter Preisvorteil zuerst, dann Umsatz, dann Name.
export function kundenMitKonditionen(je: Map<string, KundeKonditionen>, d: Pick<Daten, "articles" | "customers">,
  kundenpreise: readonly Pick<KundenPreis, "customer_id">[]): KundeKonditionen[] {
  const hinterlegt = new Set<string>([
    ...kundenpreise.map((p) => p.customer_id),
    ...d.articles.filter((a) => a.customer_id).map((a) => a.customer_id as string),
  ]);
  const ids = new Set<string>(hinterlegt);
  for (const e of je.values()) if (e.kundenpreis > 0 || e.kundenartikel > 0 || e.preisvorteil > 0) ids.add(e.id);
  const kunde = new Map(d.customers.map((c) => [c.id, c]));
  const liste: KundeKonditionen[] = [];
  for (const id of ids) {
    const c = kunde.get(id);
    if (!c || c.deleted_at) continue;
    const e = je.get(id) ?? { id, name: kundenName(c), kundennummer: c.kundennummer ?? null, hauptKundeId: c.haupt_kunde_id ?? null, auftraege: 0,
      netto: 0, liste: 0, kundenpreis: 0, kundenartikel: 0, preisvorteil: 0, letzterAuftrag: null, hinterlegt: false };
    liste.push({ ...e, hinterlegt: hinterlegt.has(id) });
  }
  return liste.sort((a, b) => b.preisvorteil - a.preisvorteil || b.netto - a.netto || a.name.localeCompare(b.name, "de"));
}

export type KonditionenSumme = { kunden: number; netto: number; kundenpreis: number; kundenartikel: number; preisvorteil: number };
export function konditionenSumme(liste: readonly KundeKonditionen[]): KonditionenSumme {
  return liste.reduce((s, e) => ({
    kunden: s.kunden + 1, netto: rund(s.netto + e.netto), kundenpreis: rund(s.kundenpreis + e.kundenpreis),
    kundenartikel: rund(s.kundenartikel + e.kundenartikel), preisvorteil: rund(s.preisvorteil + e.preisvorteil),
  }), { kunden: 0, netto: 0, kundenpreis: 0, kundenartikel: 0, preisvorteil: 0 });
}

// Summe einer Kundengruppe (Hauptkunde und Unterdebitoren) – oder null, wenn der Kunde keine Unterdebitoren hat.
export function gruppenSumme(hauptId: string, je: Map<string, KundeKonditionen>, customers: readonly Pick<Customer, "id" | "haupt_kunde_id" | "deleted_at">[]): KonditionenSumme | null {
  const mitglieder = customers.filter((c) => c.haupt_kunde_id === hauptId && !c.deleted_at).map((c) => c.id);
  if (!mitglieder.length) return null;
  return konditionenSumme([hauptId, ...mitglieder].map((id) => je.get(id)).filter((e): e is KundeKonditionen => !!e));
}

// Artikelauswertung (Reiter „Artikel“): Kundenartikel getrennt von den Artikeln für alle, je mit ihrem Kunden.
export type KundenartikelWert = ArtikelWert & { kundeId: string; kunde: string };
export function artikelWerteTeilen(werte: readonly ArtikelWert[], articles: readonly Pick<Article, "id" | "customer_id">[],
  customers: readonly Pick<Customer, "id" | "name" | "company">[]): { standard: ArtikelWert[]; kunden: KundenartikelWert[] } {
  const besitzer = new Map(articles.filter((a) => a.customer_id).map((a) => [a.id, a.customer_id as string]));
  const kunde = new Map(customers.map((c) => [c.id, c]));
  const standard: ArtikelWert[] = [];
  const kunden: KundenartikelWert[] = [];
  for (const w of werte) {
    const k = besitzer.get(w.id);
    if (k) kunden.push({ ...w, kundeId: k, kunde: kundenName(kunde.get(k)) });
    else standard.push(w);
  }
  return { standard, kunden };
}

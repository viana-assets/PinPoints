// Kundenartikel (Migration 119, v192, docs/artikelstammdaten.md „Kundenartikel“): ein ganz normaler Artikel mit
// `customer_id`. Er taucht nur in Aufträgen dieses Kunden oder seiner Kundengruppe auf. Dieselbe Regel prüft die
// Datenbank (`position_kundenartikel_pruefen()` über `kunde_gruppe()`); hier die Regeln für Auswahl, Übersicht und
// Formular. Geprüft in tests/kundenartikel.test.ts.

import type { Article, Customer } from "./types";

type K = Pick<Customer, "id" | "haupt_kunde_id">;

export function istKundenartikel(a: Pick<Article, "customer_id">): boolean {
  return !!a.customer_id;
}

// Die Gruppe eines Kunden: der Hauptkunde, sonst er selbst (wie `kunde_gruppe()`, Migration 101).
export function gruppeVonKunde(kundeId: string, kunden: readonly K[]): string {
  return kunden.find((k) => k.id === kundeId)?.haupt_kunde_id ?? kundeId;
}

// Alle Kunden, deren Kundenartikel in einem Auftrag dieses Kunden wählbar sind: die ganze Kundengruppe.
export function kundenartikelKunden(kundeId: string | null | undefined, kunden: readonly K[]): string[] {
  if (!kundeId) return [];
  const g = gruppeVonKunde(kundeId, kunden);
  const ids = new Set([kundeId, g]);
  for (const k of kunden) if (k.haupt_kunde_id === g) ids.add(k.id);
  return [...ids];
}

// Wählbar im Auftrag: Artikel für alle und die Kundenartikel der Gruppe. Ohne Kundenangabe keine Kundenartikel.
export function waehlbarFuer(a: Pick<Article, "customer_id">, kundenIds: readonly string[] | undefined): boolean {
  return !a.customer_id || (!!kundenIds && kundenIds.includes(a.customer_id));
}

// Die Kundenartikel eines Kunden (für die Karte im Kundenfenster), nach Name.
export function kundenartikelVon<A extends Pick<Article, "customer_id" | "short_name" | "article_number">>(kundeId: string, articles: readonly A[]): A[] {
  return articles.filter((a) => a.customer_id === kundeId)
    .sort((a, b) => a.short_name.localeCompare(b.short_name, "de") || a.article_number - b.article_number);
}

// Übersicht im Artikelstamm: je Kunde gruppiert, Kunden nach Name, darin nach Artikelnummer. Gesucht wird auch nach
// Kundenname und Kundennummer.
export type KundenartikelGruppe<A> = { kunde: Pick<Customer, "id" | "name" | "company" | "kundennummer"> | null; kundeId: string; artikel: A[] };
export function kundenartikelUebersicht<A extends Pick<Article, "customer_id" | "short_name" | "long_name" | "article_number">>(
  articles: readonly A[], kunden: readonly Pick<Customer, "id" | "name" | "company" | "kundennummer">[], suche = ""): KundenartikelGruppe<A>[] {
  const s = suche.trim().toLowerCase();
  const name = (k: Pick<Customer, "name" | "company"> | null) => (k ? ((k.company || "").trim() || (k.name || "").trim()) : "");
  const je = new Map<string, KundenartikelGruppe<A>>();
  for (const a of articles) {
    if (!a.customer_id) continue;
    const k = kunden.find((c) => c.id === a.customer_id) ?? null;
    const text = `${a.article_number} ${a.short_name} ${a.long_name} ${name(k)} ${k?.kundennummer ?? ""}`.toLowerCase();
    if (s && !text.includes(s)) continue;
    const g = je.get(a.customer_id) ?? { kunde: k, kundeId: a.customer_id, artikel: [] };
    g.artikel.push(a);
    je.set(a.customer_id, g);
  }
  for (const g of je.values()) g.artikel.sort((x, y) => x.article_number - y.article_number);
  return [...je.values()].sort((x, y) => name(x.kunde).localeCompare(name(y.kunde), "de") || x.kundeId.localeCompare(y.kundeId));
}

// ---------------------------------------------------------------- Formular (Kundenfenster)
export type KundenartikelEntwurf = { kurz: string; lang: string; einheit: string; preis: string; mwst: string };

// „20“, „20,5“, „1.234,50“ → Zahl; sonst null (wie `preisLesen` bei den Kundenpreisen).
function zahl(text: string): number | null {
  const t = text.trim().replace(/\s|€|%/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100) / 100;
}
export function entwurfPreis(e: Pick<KundenartikelEntwurf, "preis">): number | null {
  return zahl(e.preis);
}
export function entwurfMwst(e: Pick<KundenartikelEntwurf, "mwst">): number | null {
  return zahl(e.mwst);
}

// Dieselben Regeln wie `artikel_kunde_pruefen()` (Migration 119) und das Formular „Neuer Artikel“.
export function kundenartikelMaengel(e: KundenartikelEntwurf, kunde: Pick<Customer, "laufkundschaft">): string | null {
  if (kunde.laufkundschaft) return "Für die Laufkundschaft gibt es keine Kundenartikel.";
  if (!e.kurz.trim()) return "Die Kurzbezeichnung eintragen.";
  if (!e.lang.trim()) return "Die Bezeichnung für die Rechnung eintragen.";
  if (entwurfPreis(e) == null) return "Den Preis eintragen (netto je Einheit, z. B. 40 oder 39,50).";
  const m = entwurfMwst(e);
  if (m == null || m > 100) return "Den Steuersatz eintragen (z. B. 19).";
  return null;
}

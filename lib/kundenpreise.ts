// Kundenpreise (Migration 118, v191, docs/artikelstammdaten.md „Kundenpreise“): ein eigener Netto-Preis je Kunde und
// Artikel, wahlweise mit Zeitraum. Eingesetzt wird er von der Datenbank beim Anlegen einer Position
// (`position_kundenpreis()`); hier dieselben Regeln für die Anzeige – welcher Preis an einem Tag gilt, der Hauptkunde
// als Rückfall, die Prüfung des Formulars (wie `kunden_preis_pruefen()`). Geprüft in tests/kundenpreise.test.ts.

import type { Article, Customer, KundenPreis } from "./types";
import { formatDate } from "./format";

export function gilt(p: Pick<KundenPreis, "valid_from" | "valid_to">, tag: string): boolean {
  return (!p.valid_from || p.valid_from <= tag) && (!p.valid_to || p.valid_to >= tag);
}

export type KundenpreisZustand = "gilt" | "kommt" | "vorbei";
export function kundenpreisZustand(p: Pick<KundenPreis, "valid_from" | "valid_to">, heute: string): KundenpreisZustand {
  if (p.valid_to && p.valid_to < heute) return "vorbei";
  if (p.valid_from && p.valid_from > heute) return "kommt";
  return "gilt";
}

export function zeitraumText(p: Pick<KundenPreis, "valid_from" | "valid_to">): string {
  if (p.valid_from && p.valid_to) return `${formatDate(p.valid_from)} – ${formatDate(p.valid_to)}`;
  if (p.valid_from) return `ab ${formatDate(p.valid_from)}`;
  if (p.valid_to) return `bis ${formatDate(p.valid_to)}`;
  return "unbefristet";
}

// Der Preis, den die Datenbank an diesem Tag einsetzen würde: der eigene, sonst der des Hauptkunden (Migration 101).
export type GeltenderKundenpreis = { preis: KundenPreis; vomHauptkunden: boolean };
export function kundenpreisFuer(kundeId: string, artikelId: string, tag: string, preise: readonly KundenPreis[],
  kunden: readonly Pick<Customer, "id" | "haupt_kunde_id">[]): GeltenderKundenpreis | null {
  const eigen = preise.find((p) => p.customer_id === kundeId && p.article_id === artikelId && gilt(p, tag));
  if (eigen) return { preis: eigen, vomHauptkunden: false };
  const haupt = kunden.find((k) => k.id === kundeId)?.haupt_kunde_id;
  const geerbt = haupt ? preise.find((p) => p.customer_id === haupt && p.article_id === artikelId && gilt(p, tag)) : undefined;
  return geerbt ? { preis: geerbt, vomHauptkunden: true } : null;
}

// Alle an einem Tag geltenden Kundenpreise eines Kunden, je Artikel – für die Leistungsauswahl im Auftrag.
export function kundenpreiseAm(kundeId: string | null | undefined, tag: string, preise: readonly KundenPreis[],
  kunden: readonly Pick<Customer, "id" | "haupt_kunde_id">[]): Map<string, GeltenderKundenpreis> {
  const m = new Map<string, GeltenderKundenpreis>();
  if (!kundeId) return m;
  const haupt = kunden.find((k) => k.id === kundeId)?.haupt_kunde_id ?? null;
  for (const p of preise) {
    if ((p.customer_id !== kundeId && p.customer_id !== haupt) || !gilt(p, tag)) continue;
    const vorher = m.get(p.article_id);
    if (!vorher || (vorher.vomHauptkunden && p.customer_id === kundeId)) m.set(p.article_id, { preis: p, vomHauptkunden: p.customer_id !== kundeId });
  }
  return m;
}

// Die Kundenpreise eines Kunden für die Liste im Kundenfenster: Artikel nach Name, darin nach Beginn.
export function preiseVonKunde(kundeId: string, preise: readonly KundenPreis[], artikel: readonly Pick<Article, "id" | "short_name">[]): KundenPreis[] {
  const name = (id: string) => artikel.find((a) => a.id === id)?.short_name ?? "";
  return preise.filter((p) => p.customer_id === kundeId)
    .sort((a, b) => name(a.article_id).localeCompare(name(b.article_id), "de") || (a.valid_from ?? "").localeCompare(b.valid_from ?? "") || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- Formular
export type KundenpreisEntwurf = { artikelId: string; preis: string; ab: string; bis: string; notiz: string };

// „20“, „20,5“, „1.234,50“ → Zahl; sonst null.
export function preisLesen(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100) / 100;
}

const ueberschneiden = (a: { ab: string | null; bis: string | null }, b: { ab: string | null; bis: string | null }) =>
  (a.ab ?? "0000-00-00") <= (b.bis ?? "9999-12-31") && (b.ab ?? "0000-00-00") <= (a.bis ?? "9999-12-31");

// Dieselben Regeln wie `kunden_preis_pruefen()` und die Prüfregeln von `kunden_preise` (Migration 118).
export function kundenpreisMaengel(e: KundenpreisEntwurf, kundeId: string, id: string | null, vorhandene: readonly KundenPreis[],
  artikel: readonly Pick<Article, "id" | "abrechnungsart">[]): string | null {
  if (!e.artikelId) return "Den Artikel wählen.";
  const art = artikel.find((a) => a.id === e.artikelId);
  if (art && art.abrechnungsart.startsWith("reifenverkauf")) return "Beim Reifenverkauf kommt der Preis vom Reifen – dafür gibt es keinen Kundenpreis.";
  const preis = preisLesen(e.preis);
  if (preis == null) return "Den Preis eintragen (netto je Einheit, z. B. 20 oder 19,50).";
  if (preis > 99999) return "Der Preis ist zu hoch.";
  if (e.ab && e.bis && e.bis < e.ab) return "Das Ende (gültig bis) liegt vor dem Anfang (gültig ab).";
  if (e.notiz.length > 300) return "Die Notiz ist zu lang (höchstens 300 Zeichen).";
  const neu = { ab: e.ab || null, bis: e.bis || null };
  if (vorhandene.some((p) => p.id !== id && p.customer_id === kundeId && p.article_id === e.artikelId && ueberschneiden(neu, { ab: p.valid_from, bis: p.valid_to }))) {
    return "Für diesen Artikel gibt es im selben Zeitraum schon einen Kundenpreis. Den anderen zuerst beenden (gültig bis) oder ändern.";
  }
  return null;
}

export function entwurfAus(p: KundenPreis | null): KundenpreisEntwurf {
  return p ? { artikelId: p.article_id, preis: String(Number(p.net_price)).replace(".", ","), ab: p.valid_from ?? "", bis: p.valid_to ?? "", notiz: p.notiz ?? "" }
    : { artikelId: "", preis: "", ab: "", bis: "", notiz: "" };
}

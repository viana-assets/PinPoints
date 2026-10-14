// Finance F2 (Migration 90, v148): Belege und Lieferanten – die Regeln ohne Datenbank, geprüft in
// tests/financeBelege.test.ts. Gebucht wird in `fin_beleg_buchen()`; die Vorschau rechnet mit
// `buchungVorschau()` (lib/finance/buchung.ts) gegen das Verbindlichkeitskonto.

import type { FinPosten } from "./buchung";
import type { Kontenrahmen } from "./einstellungen";

// Privater Speicher für Belegdateien (Migration 90). Pfad `<Beleg-ID>/<Zeit>-<Name>`.
export const FIN_BELEG_BUCKET = "fin-belege";
// Wie `file_size_limit` des Buckets (Migration 90).
export const FIN_BELEG_MAX_BYTES = 10 * 1024 * 1024;
// Wie `allowed_mime_types` des Buckets.
export const FIN_BELEG_TYPEN = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/xml", "text/xml"] as const;

export type FinLieferant = {
  id: string;
  name: string;
  ust_id: string | null;
  konto: number | null;
  steuer: string | null;
  aktiv: boolean;
};

export type FinBelegPosten = { konto: number | null; betrag: number | null; steuer: string | null };

export type FinBeleg = {
  id: string;
  lieferant_id: string | null;
  belegdatum: string;
  belegnummer: string | null;
  text: string | null;
  faellig_am: string | null;
  posten: FinBelegPosten[];
  datei_pfad: string | null;
  datei_typ: string | null;
  datei_name: string | null;
  status: "entwurf" | "gebucht" | "storniert";
  brutto: number | null;
  buchung_id: string | null;
  bezahlt_am: string | null;
  bezahlt_art: "bar" | "bank" | null;
  erstellt_am: string;
  // Schon bezahlter Teil (Teilzahlungen, Migration 93) – lib/api/finance.ts liest ihn dazu.
  teilbezahlt?: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function belegRest(b: Pick<FinBeleg, "brutto" | "teilbezahlt" | "bezahlt_am">): number {
  return b.bezahlt_am ? 0 : cent(Number(b.brutto ?? 0) - Number(b.teilbezahlt ?? 0));
}

// Verbindlichkeiten aus Lieferungen und Leistungen – wie `fin_rechnung_konto(…, 'verbindlichkeit')` in
// Migration 90 (dieselbe Zahl dort; tests/financeBelege.test.ts vergleicht).
export const FIN_VERBINDLICHKEIT_KONTO: Record<Kontenrahmen, number> = { skr03: 1600, skr04: 3300 };

// Die Posten eines Belegs als Buchungsposten (Soll Aufwand, Haben Verbindlichkeit) – für die Vorschau.
export function belegAlsBuchung(posten: FinBelegPosten[], rahmen: Kontenrahmen): FinPosten[] {
  return posten.map((p) => ({ soll: p.konto, haben: FIN_VERBINDLICHKEIT_KONTO[rahmen], betrag: p.betrag, steuer: p.steuer }));
}

export type BelegZustand =
  | { art: "entwurf" }
  | { art: "offen"; faellig: string; tage: number; teil: number }
  | { art: "ueberfaellig"; faellig: string; tage: number; teil: number }
  | { art: "bezahlt"; am: string; wie: "bar" | "bank" }
  | { art: "storniert" };

export function belegZustand(b: Pick<FinBeleg, "status" | "faellig_am" | "belegdatum" | "bezahlt_am" | "bezahlt_art" | "teilbezahlt">, heute: string): BelegZustand {
  if (b.status === "entwurf") return { art: "entwurf" };
  if (b.status === "storniert") return { art: "storniert" };
  if (b.bezahlt_am && b.bezahlt_art) return { art: "bezahlt", am: b.bezahlt_am, wie: b.bezahlt_art };
  const faellig = b.faellig_am ?? b.belegdatum;
  const tage = Math.round((Date.parse(faellig + "T00:00:00Z") - Date.parse(heute + "T00:00:00Z")) / 86_400_000);
  const teil = Number(b.teilbezahlt ?? 0);
  return tage < 0 ? { art: "ueberfaellig", faellig, tage: -tage, teil } : { art: "offen", faellig, tage, teil };
}

export function belegZustandText(z: BelegZustand): string {
  switch (z.art) {
    case "entwurf": return "Entwurf";
    case "offen": return (z.tage === 0 ? "fällig heute" : `offen · fällig in ${z.tage} ${z.tage === 1 ? "Tag" : "Tagen"}`) + teilText(z.teil);
    case "ueberfaellig": return `überfällig seit ${z.tage} ${z.tage === 1 ? "Tag" : "Tagen"}` + teilText(z.teil);
    case "bezahlt": return z.wie === "bar" ? "bar bezahlt" : "überwiesen";
    case "storniert": return "storniert";
  }
}

function teilText(teil: number): string {
  return teil > 0 ? ` · ${teil.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € schon bezahlt` : "";
}

// Kontovorschlag für einen Lieferanten: sein hinterlegtes Konto, sonst das des letzten gebuchten Belegs.
export function kontoVorschlag(lieferant: FinLieferant | null | undefined, belege: FinBeleg[]): { konto: number | null; steuer: string | null } {
  if (!lieferant) return { konto: null, steuer: null };
  if (lieferant.konto) return { konto: lieferant.konto, steuer: lieferant.steuer };
  const letzter = belege
    .filter((b) => b.lieferant_id === lieferant.id && b.status === "gebucht" && b.posten.length)
    .sort((a, b) => b.belegdatum.localeCompare(a.belegdatum) || b.erstellt_am.localeCompare(a.erstellt_am))[0];
  return letzter ? { konto: letzter.posten[0].konto, steuer: letzter.posten[0].steuer ?? lieferant.steuer } : { konto: null, steuer: lieferant.steuer };
}

// Offene Posten der Lieferanten: gebucht, unbezahlt – älteste Fälligkeit zuerst. Summen = offener Rest.
export function belegeOffen(belege: FinBeleg[], heute: string): { posten: (FinBeleg & { zustand: BelegZustand })[]; summe: number; ueberfaellig: number } {
  const posten = belege
    .map((b) => ({ ...b, zustand: belegZustand(b, heute) }))
    .filter((b) => b.zustand.art === "offen" || b.zustand.art === "ueberfaellig")
    .sort((a, b) => (a.faellig_am ?? a.belegdatum).localeCompare(b.faellig_am ?? b.belegdatum));
  return {
    posten,
    summe: cent(posten.reduce((s, b) => s + belegRest(b), 0)),
    ueberfaellig: cent(posten.filter((b) => b.zustand.art === "ueberfaellig").reduce((s, b) => s + belegRest(b), 0)),
  };
}

// Pfad im Bucket: `<Beleg-ID>/<Zeit>-<Name>` – der Name ohne Sonderzeichen, damit Storage ihn annimmt.
export function belegDateiPfad(belegId: string, name: string, jetzt: Date): string {
  const sauber = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || "beleg";
  return `${belegId}/${jetzt.getTime()}-${sauber}`;
}

export function istXml(datei: { type: string; name: string }): boolean {
  return /xml/.test(datei.type) || /\.xml$/i.test(datei.name);
}

// Was gegen das Hochladen spricht – oder null.
export function dateiMangel(datei: { type: string; size: number; name: string }): string | null {
  const typ = istXml(datei) ? "application/xml" : datei.type;
  if (!(FIN_BELEG_TYPEN as readonly string[]).includes(typ)) return "Nur Fotos (JPG, PNG, WEBP), PDF oder E-Rechnung (XML).";
  if (datei.size > FIN_BELEG_MAX_BYTES) return "Die Datei ist zu groß (höchstens 10 MB).";
  return null;
}

// Konten, die im Belegfenster zur Wahl stehen: Aufwand und Anlagen (gebucht wird gegen Verbindlichkeiten).
export const FIN_BELEG_KATEGORIEN = ["aufwand", "anlage"] as const;

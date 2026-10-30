// Finance Stufe C, Teil 3 (Migration 108, v182, docs/finance.md Abschnitt 14): Kostenstellen nach Entscheidung 4 vom
// 30.10.2026 – KOST1 je Transporter, KOST2 je Leistungsart. Die Regeln ohne React: Auswahl, Anzeige, Auswertung
// (Erlöse, Aufwand, Ergebnis je Kostenstelle im Zeitraum). Wohin eine Kostenstelle beim Buchen kommt, regelt
// `postenZeilen` (lib/finance/buchung.ts) wie `fin_buchen()`. Geprüft in tests/financeKostenstellen.test.ts.

import type { FinBuchung, FinKonto } from "./buchung";

export type KostArt = "kost1" | "kost2";
export type FinKostenstelle = { id: string; art: KostArt; nummer: string; bezeichnung: string; aktiv: boolean; firmenfahrzeug_id: string | null };

// Die zwei Arten mit dem Wort, das im Betrieb gebraucht wird – und dem DATEV-Namen. Wie `fin_ks_art` (Migration 108).
export const FIN_KOST_ARTEN: { wert: KostArt; text: string; datev: string; leer: string }[] = [
  { wert: "kost1", text: "Transporter", datev: "KOST1", leer: "ohne Transporter" },
  { wert: "kost2", text: "Leistung", datev: "KOST2", leer: "ohne Leistungsart" },
];

// Was in einer Auswahl steht: die aktiven einer Art, nach Nummer („T2“ vor „T10“). Eine schon gesetzte, inzwischen
// ausgeblendete bleibt sichtbar, damit eine alte Zeile nicht leer aussieht.
export function kostAuswahl(liste: readonly FinKostenstelle[], art: KostArt, gesetzt?: string | null): FinKostenstelle[] {
  return liste.filter((k) => k.art === art && (k.aktiv || k.nummer === gesetzt))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, "de", { numeric: true }));
}

// „T1 · NB-MR 12 · Sprinter weiß“ – oder nur die Nummer, wenn es sie (nicht mehr) gibt.
export function kostText(liste: readonly FinKostenstelle[], art: KostArt, nummer: string | null | undefined): string {
  if (!nummer) return "";
  const k = liste.find((x) => x.art === art && x.nummer === nummer);
  return k ? `${k.nummer} · ${k.bezeichnung}` : nummer;
}

// Die Kostenstellen einer Buchung: die der ersten Zeile, die eine hat (fürs Journal; bei mehreren Posten mit
// verschiedenen steht „mehrere“).
export function buchungKost(b: Pick<FinBuchung, "fin_buchungszeilen">, art: KostArt): string | null {
  const werte = [...new Set(b.fin_buchungszeilen.map((z) => z[art]).filter((x): x is string => !!x))];
  return werte.length === 0 ? null : werte.length === 1 ? werte[0] : "mehrere";
}

// ---------------------------------------------------------------- Auswertung
export type KostZeile = { art: KostArt; nummer: string | null; erloese: number; aufwand: number; ergebnis: number; anzahl: number };

const cent = (x: number) => Math.round(x * 100) / 100;

// Je Art und Kostenstelle im Zeitraum: Erlöse (Haben minus Soll auf Erlöskonten), Aufwand (Soll minus Haben auf
// Aufwandskonten), Ergebnis. Anlagekonten zählen nicht – eine Anschaffung ist kein Aufwand (die Abschreibung schon).
// `nummer: null` sammelt, was ohne Kostenstelle dieser Art gebucht ist.
export function kostenAuswertung(buchungen: readonly FinBuchung[], konten: readonly FinKonto[], von: string, bis: string): KostZeile[] {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  const m = new Map<string, KostZeile>();
  for (const b of buchungen) {
    if (b.datum < von || b.datum > bis) continue;
    for (const z of b.fin_buchungszeilen) {
      if (z.ist_steuer) continue;
      const k = kat.get(z.konto);
      if (k !== "erloes" && k !== "aufwand") continue;
      const betrag = Number(z.betrag) * (z.seite === "S" ? 1 : -1);
      for (const a of FIN_KOST_ARTEN) {
        const nummer = z[a.wert] ?? null;
        const key = `${a.wert}|${nummer ?? ""}`;
        const e = m.get(key) ?? { art: a.wert, nummer, erloese: 0, aufwand: 0, ergebnis: 0, anzahl: 0 };
        if (k === "erloes") e.erloese = cent(e.erloese - betrag); else e.aufwand = cent(e.aufwand + betrag);
        e.ergebnis = cent(e.erloese - e.aufwand);
        e.anzahl += 1;
        m.set(key, e);
      }
    }
  }
  return [...m.values()].sort((a, b) => a.art.localeCompare(b.art) || (a.nummer == null ? 1 : b.nummer == null ? -1 : a.nummer.localeCompare(b.nummer, "de", { numeric: true })));
}

// ---------------------------------------------------------------- Leistungsart je Artikel (Migration 111, v184)
// Vorgabe aus der Abrechnungsart des Artikels – wie `fin_leistungsart_vorgabe()` (Migration 111, Test vergleicht).
export const FIN_LEISTUNGSART_VORGABE: Record<string, string> = {
  normal: "100", lagergebuehr: "200", reifenverkauf_neu: "300", reifenverkauf_gebraucht: "300",
};
export const leistungsartVorgabe = (abrechnungsart: string) => FIN_LEISTUNGSART_VORGABE[abrechnungsart] ?? "100";

export type FinArtikelLeistungsart = {
  id: string; artikelnummer: number; name: string; abrechnungsart: string; aktiv: boolean;
  // Vorgabe aus der Abrechnungsart, `kost2` die abweichende Wahl (null = Vorgabe).
  vorgabe: string; kost2: string | null;
};

// Nummer für eine neue Kostenstelle prüfen (wie `fin_ks_nummer`).
export function kostNummerFehler(nummer: string): string | null {
  return /^[A-Za-z0-9]{1,8}$/.test(nummer.trim()) ? null : "Die Nummer: Buchstaben und Ziffern, höchstens 8 Zeichen.";
}

// Finance-Arbeitsplatz am Rechner (v178, Stufe A des Ausbaus, docs/finance.md Abschnitt 9 und 10):
// die Regeln der Bausteine ohne React – Sortieren, Tastatur, Konto aus Nummer oder Name, Beträge, CSV,
// Journal als Tabelle mit Filter und Saldo vor/nach einer Buchung. Die Bausteine dazu liegen in
// components/finance/arbeitsplatz/, geprüft in tests/financeArbeitsplatz.test.ts.
//
// Entwurf: Claude outputs/Mockup_Finance_StufeA_v1.html (abgenommen 30.10.2026).

import { buchungBetrag, buchungZustand, kontoNr, type FinBuchung, type FinFestschreibung, type FinKonto } from "./buchung";

// ---------------------------------------------------------------- Sortieren
export type SpaltenWert = string | number | null;
export type Richtung = "auf" | "ab";
export type Sortierung = { spalte: string; richtung: Richtung } | null;

const vergleicher = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

// Stabil; leere Werte stehen immer unten, egal in welche Richtung.
export function sortiere<T>(zeilen: readonly T[], wert: (z: T) => SpaltenWert, richtung: Richtung): T[] {
  const f = richtung === "auf" ? 1 : -1;
  return zeilen
    .map((z, i) => ({ z, i, w: wert(z) }))
    .sort((a, b) => {
      if (a.w == null || a.w === "") return b.w == null || b.w === "" ? a.i - b.i : 1;
      if (b.w == null || b.w === "") return -1;
      const d = typeof a.w === "number" && typeof b.w === "number" ? a.w - b.w : vergleicher.compare(String(a.w), String(b.w));
      return d === 0 ? a.i - b.i : d * f;
    })
    .map((x) => x.z);
}

// Klick auf denselben Spaltenkopf: aufsteigend → absteigend → wie geliefert.
export function naechsteSortierung(jetzt: Sortierung, spalte: string): Sortierung {
  if (!jetzt || jetzt.spalte !== spalte) return { spalte, richtung: "auf" };
  return jetzt.richtung === "auf" ? { spalte, richtung: "ab" } : null;
}

// ---------------------------------------------------------------- Tastatur
// Wohin eine Taste in einer Liste mit `anzahl` Zeilen springt; null = diese Taste bewegt nichts.
export const TABELLE_SEITE = 10;
export function tastenZiel(taste: string, index: number, anzahl: number): number | null {
  if (anzahl <= 0) return null;
  const von = index < 0 ? -1 : Math.min(index, anzahl - 1);
  const auf = (n: number) => Math.max(0, Math.min(anzahl - 1, n));
  switch (taste) {
    case "ArrowDown": return auf(von + 1);
    case "ArrowUp": return von < 0 ? 0 : auf(von - 1);
    case "PageDown": return auf(von + TABELLE_SEITE);
    case "PageUp": return auf(von - TABELLE_SEITE);
    case "Home": return 0;
    case "End": return anzahl - 1;
    default: return null;
  }
}

// Kurzbefehle des Arbeitsplatzes. In einem Eingabefeld zählt nur F2 (Suche) und F3 – ein „n“ ist dort ein Buchstabe.
export type Kurzbefehl = "suche" | "neu" | "konto";
export const FIN_KURZBEFEHLE: { taste: string; befehl: Kurzbefehl; text: string }[] = [
  { taste: "F2", befehl: "suche", text: "Suche" },
  { taste: "F3", befehl: "konto", text: "Kontoblatt" },
  { taste: "N", befehl: "neu", text: "Schnellbuchung" },
];
export function kurzbefehl(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, imFeld: boolean): Kurzbefehl | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === "F2") return "suche";
  if (e.key === "F3") return "konto";
  if (!imFeld && (e.key === "n" || e.key === "N")) return "neu";
  return null;
}

// ---------------------------------------------------------------- Konto aus Nummer oder Name
export const KONTO_VORSCHLAEGE = 8;

// Ziffern: Konten, deren Nummer so beginnt (auch „45“ → 4500–4599). Text: zuerst Bezeichnungen, die so anfangen,
// dann solche, in denen ein Wort so anfängt, dann alle übrigen Treffer.
export function kontoVorschlaege(konten: readonly FinKonto[], eingabe: string, max = KONTO_VORSCHLAEGE): FinKonto[] {
  const t = eingabe.trim().toLowerCase();
  const aktiv = konten.filter((k) => k.aktiv);
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    return aktiv.filter((k) => kontoNr(k.nummer).startsWith(t) || String(k.nummer).startsWith(t))
      .sort((a, b) => a.nummer - b.nummer).slice(0, max);
  }
  const rang = (k: FinKonto) => {
    const b = k.bezeichnung.toLowerCase();
    if (b.startsWith(t)) return 0;
    if (b.split(/[\s\-/(,.]+/).some((w) => w.startsWith(t))) return 1;
    return b.includes(t) ? 2 : -1;
  };
  return aktiv.map((k) => ({ k, r: rang(k) })).filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.k.nummer - b.k.nummer).map((x) => x.k).slice(0, max);
}

// Die Nummer, die eine Eingabe eindeutig meint: genau diese Kontonummer, oder der einzige Vorschlag. Sonst null.
export function kontoAusEingabe(konten: readonly FinKonto[], eingabe: string): number | null {
  const t = eingabe.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const genau = konten.find((k) => k.aktiv && k.nummer === Number(t));
    if (genau) return genau.nummer;
  }
  const v = kontoVorschlaege(konten, t, 2);
  return v.length === 1 ? v[0].nummer : null;
}

// ---------------------------------------------------------------- Beträge
const zahl2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// „1.234,56“ – ohne Euro-Zeichen, für dichte Spalten und das Betragsfeld.
export function betragText(n: number): string {
  return zahl2.format(n);
}
// Saldo mit Seite, wie im Kontoblatt: „1.248,30 S“ / „57,00 H“.
export function saldoText(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? "0,00" : `${betragText(Math.abs(r))} ${r > 0 ? "S" : "H"}`;
}

// ---------------------------------------------------------------- CSV (Excel)
// Semikolon, Komma als Dezimalzeichen, BOM vorne – so öffnet Excel die Datei mit Umlauten richtig.
// Text, der mit = + - @ beginnt, bekommt ein Hochkomma: Excel würde ihn sonst als Formel ausführen.
export function csvZelle(w: SpaltenWert): string {
  if (w == null) return "";
  if (typeof w === "number") return Number.isFinite(w) ? String(Math.round(w * 100) / 100).replace(".", ",") : "";
  let s = w;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function tabellenCsv(kopf: readonly string[], zeilen: readonly SpaltenWert[][]): string {
  return "﻿" + [kopf.map(csvZelle).join(";"), ...zeilen.map((z) => z.map(csvZelle).join(";"))].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- Journal als Tabelle
export type JournalZustand = "gebucht" | "festgeschrieben" | "storno" | "storniert";
export const JOURNAL_ZUSTAENDE: { wert: JournalZustand; text: string }[] = [
  { wert: "gebucht", text: "gebucht" },
  { wert: "festgeschrieben", text: "festgeschrieben" },
  { wert: "storno", text: "Storno" },
  { wert: "storniert", text: "storniert" },
];

export type JournalZeile = {
  id: string;
  nr: number;
  datum: string;
  beleg: string;
  text: string;
  betrag: number;
  // Erste Soll- und Haben-Zeile ohne Steuer; bei mehreren Posten steht `splitt` und die Konten der ersten.
  konto: number | null;
  gegenkonto: number | null;
  splitt: boolean;
  steuer: string | null;
  zustand: JournalZustand;
  buchung: FinBuchung;
};

export function journalZeilen(buchungen: readonly FinBuchung[], fest: readonly FinFestschreibung[]): JournalZeile[] {
  return buchungen.map((b) => {
    const z = buchungZustand(b, fest as FinFestschreibung[]);
    const ohneSteuer = b.fin_buchungszeilen.filter((x) => !x.ist_steuer);
    return {
      id: b.id, nr: b.nr, datum: b.datum, beleg: b.beleg ?? "", text: b.text, betrag: buchungBetrag(b),
      konto: ohneSteuer.find((x) => x.seite === "S")?.konto ?? null,
      gegenkonto: ohneSteuer.find((x) => x.seite === "H")?.konto ?? null,
      splitt: new Set(b.fin_buchungszeilen.map((x) => x.posten)).size > 1,
      steuer: b.fin_buchungszeilen.find((x) => x.steuerschluessel)?.steuerschluessel ?? null,
      // Storno und storniert gehen vor festgeschrieben: Das ist für die Arbeit wichtiger.
      zustand: z.storniert ? "storniert" : z.storno ? "storno" : z.festgeschrieben ? "festgeschrieben" : "gebucht",
      buchung: b,
    };
  });
}

export type JournalFilter = {
  monat: number; // 0 = ganzes Jahr
  konto: number | null;
  zustand: JournalZustand | null;
  betragVon: number | null;
  betragBis: number | null;
  text: string;
  // Kostenstelle als „kost1|T1“ bzw. „kost2|100“ (v182, Migration 108); null = alle.
  kost?: string | null;
};
export const JOURNAL_FILTER_LEER: JournalFilter = { monat: 0, konto: null, zustand: null, betragVon: null, betragBis: null, text: "", kost: null };

// Wie viele Filter gesetzt sind (für „Filter zurücksetzen“).
export function filterAnzahl(f: JournalFilter): number {
  return [f.monat !== 0, f.konto != null, f.zustand != null, f.betragVon != null || f.betragBis != null, f.text.trim() !== "", !!f.kost]
    .filter(Boolean).length;
}

// Das Konto zählt, wenn es in irgendeiner Zeile der Buchung steht (auch als Steuerkonto). Die Suche geht über
// Nummer, Text, Beleg, Konten und den Betrag in beiden Schreibweisen („1234,5“ und „1.234,50“).
export function journalFiltern(zeilen: readonly JournalZeile[], f: JournalFilter): JournalZeile[] {
  const s = f.text.trim().toLowerCase();
  return zeilen.filter((z) => {
    if (f.monat && Number(z.datum.slice(5, 7)) !== f.monat) return false;
    if (f.konto != null && !z.buchung.fin_buchungszeilen.some((x) => x.konto === f.konto)) return false;
    if (f.zustand && z.zustand !== f.zustand) return false;
    if (f.kost) {
      const [art, nummer] = f.kost.split("|") as ["kost1" | "kost2", string];
      if (!z.buchung.fin_buchungszeilen.some((x) => x[art] === nummer)) return false;
    }
    if (f.betragVon != null && z.betrag < f.betragVon) return false;
    if (f.betragBis != null && z.betrag > f.betragBis) return false;
    if (s) {
      const heu = [z.nr, z.text, z.beleg, betragText(z.betrag), String(z.betrag).replace(".", ","),
        ...z.buchung.fin_buchungszeilen.map((x) => kontoNr(x.konto))].join(" ").toLowerCase();
      if (!heu.includes(s)) return false;
    }
    return true;
  });
}

// Saldo eines Kontos unmittelbar vor und nach dieser Buchung (Soll minus Haben, Reihenfolge Datum, dann Nr.) –
// für die Detailspalte. Gezählt wird, was im Journal des Jahres steht; ein Saldenvortrag ist selbst eine Buchung.
export function saldoVorNach(buchungen: readonly FinBuchung[], konto: number, b: FinBuchung): { vor: number; nach: number } {
  const frueher = (x: FinBuchung) => x.datum < b.datum || (x.datum === b.datum && x.nr < b.nr);
  const wirkung = (x: FinBuchung) => x.fin_buchungszeilen.filter((z) => z.konto === konto)
    .reduce((s, z) => s + (z.seite === "S" ? 1 : -1) * Number(z.betrag), 0);
  const vor = Math.round(buchungen.filter(frueher).reduce((s, x) => s + wirkung(x), 0) * 100) / 100;
  return { vor, nach: Math.round((vor + wirkung(b)) * 100) / 100 };
}

// Woher eine Buchung kommt, in Worten (Detailspalte und Buchungsfenster).
export const BUCHUNG_QUELLE_TEXT: Record<FinBuchung["quelle"], string> = {
  manuell: "von Hand", rechnung: "aus einer Rechnung", zahlung: "Zahlung einer Rechnung", beleg: "aus dem Belegeingang",
  bank: "aus der Bank", kasse: "aus dem Kassenbuch", afa: "Abschreibung", abgang: "Anlagenabgang", abschluss: "Jahresabschluss",
  vortrag: "Saldenvortrag", skonto: "Skonto",
};

export function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

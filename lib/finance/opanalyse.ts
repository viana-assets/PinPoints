// Finance Stufe G (v186): offene Posten nach Fälligkeit – Forderungen aus den Rechnungen, Verbindlichkeiten aus den
// Belegen, gestaffelt wie in der Kanzlei üblich. Ohne Datenbank, geprüft in tests/financeOpAnalyse.test.ts.

import { rechnungRest, type FinRechnungZeile } from "./rechnungen";
import { belegRest, type FinBeleg, type FinLieferant } from "./belege";

// Stufen nach Tagen über der Fälligkeit; `bis` = höchste Tageszahl der Stufe, null = darüber.
export const FIN_OP_STUFEN: { bis: number | null; text: string }[] = [
  { bis: 0, text: "nicht fällig" }, { bis: 30, text: "1–30 Tage" }, { bis: 60, text: "31–60 Tage" }, { bis: 90, text: "61–90 Tage" }, { bis: null, text: "über 90 Tage" },
];

export type OpArt = "forderung" | "verbindlichkeit";
export type OpPosten = { art: OpArt; id: string; nummer: string; name: string; datum: string; faellig: string; rest: number; tage: number };

const cent = (n: number) => Math.round(n * 100) / 100;
const tag = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export function tageUeber(faellig: string, heute: string): number {
  return Math.round((tag(heute) - tag(faellig)) / 86400000);
}

export function opPosten(rechnungen: readonly FinRechnungZeile[], belege: readonly FinBeleg[], lieferanten: readonly FinLieferant[], heute: string): OpPosten[] {
  const liste: OpPosten[] = [];
  for (const r of rechnungen) {
    if (r.status !== "gebucht" || r.storniert || r.bezahlt_am) continue;
    const rest = rechnungRest(r);
    if (rest <= 0) continue;
    const faellig = r.faellig_am ?? r.datum;
    liste.push({ art: "forderung", id: r.rechnung_id, nummer: r.nummer_text, name: r.kunde, datum: r.datum, faellig, rest, tage: tageUeber(faellig, heute) });
  }
  for (const b of belege) {
    if (b.status !== "gebucht" || b.bezahlt_am) continue;
    const rest = belegRest(b);
    if (rest <= 0) continue;
    const faellig = b.faellig_am ?? b.belegdatum;
    liste.push({ art: "verbindlichkeit", id: b.id, nummer: b.belegnummer ?? "ohne Nummer", name: lieferanten.find((l) => l.id === b.lieferant_id)?.name ?? "ohne Lieferant",
      datum: b.belegdatum, faellig, rest, tage: tageUeber(faellig, heute) });
  }
  return liste.sort((a, b) => b.tage - a.tage || b.rest - a.rest);
}

export function opStufe(tage: number): number {
  const i = FIN_OP_STUFEN.findIndex((s) => s.bis != null && tage <= s.bis);
  return i < 0 ? FIN_OP_STUFEN.length - 1 : i;
}

export type OpAnalyse = {
  stufen: { text: string; forderung: number; verbindlichkeit: number; anzahlF: number; anzahlV: number }[];
  summe: { forderung: number; verbindlichkeit: number };
  personen: { art: OpArt; name: string; rest: number; ueberfaellig: number; tage: number; anzahl: number }[];
};

export function opAnalyse(posten: readonly OpPosten[]): OpAnalyse {
  const stufen = FIN_OP_STUFEN.map((s) => ({ text: s.text, forderung: 0, verbindlichkeit: 0, anzahlF: 0, anzahlV: 0 }));
  const personen = new Map<string, OpAnalyse["personen"][number]>();
  for (const p of posten) {
    const s = stufen[opStufe(p.tage)];
    if (p.art === "forderung") { s.forderung = cent(s.forderung + p.rest); s.anzahlF++; } else { s.verbindlichkeit = cent(s.verbindlichkeit + p.rest); s.anzahlV++; }
    const key = `${p.art}|${p.name}`;
    const e = personen.get(key) ?? { art: p.art, name: p.name, rest: 0, ueberfaellig: 0, tage: 0, anzahl: 0 };
    e.rest = cent(e.rest + p.rest);
    if (p.tage > 0) e.ueberfaellig = cent(e.ueberfaellig + p.rest);
    e.tage = Math.max(e.tage, p.tage);
    e.anzahl++;
    personen.set(key, e);
  }
  return {
    stufen,
    summe: { forderung: cent(stufen.reduce((t, s) => t + s.forderung, 0)), verbindlichkeit: cent(stufen.reduce((t, s) => t + s.verbindlichkeit, 0)) },
    personen: [...personen.values()].sort((a, b) => b.ueberfaellig - a.ueberfaellig || b.rest - a.rest),
  };
}

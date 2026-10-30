// Finance-Arbeitsplatz Stufe B (v179, docs/finance.md Abschnitt 11): Kontoblatt mit freiem Zeitraum und laufendem
// Saldo, Kontenübersicht (Summen und Salden je Konto im Zeitraum) – die Regeln ohne React. Oberflächen:
// components/finance/FinanceKontoblatt.tsx und FinanceKontenArbeitsplatz.tsx, geprüft in tests/financeKontoblatt.test.ts.
//
// Gerechnet wird aus dem Journal des Jahres, das die Seite ohnehin geladen hat – so führt jede Zeile zur Buchung
// (die Datenbankfunktion `fin_kontenblatt` aus Migration 94 liefert keine Buchungs-ID). Der Saldenvortrag ist selbst
// eine Buchung im Januar; die Eröffnung eines Zeitraums ist damit der Saldo aller Buchungen davor im Jahr.

import { buchungZustand, type FinBuchung, type FinFestschreibung, type FinKonto, type KontoKategorie } from "./buchung";
import type { JournalZustand } from "./arbeitsplatz";

const cent = (x: number) => Math.round(x * 100) / 100;
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// ---------------------------------------------------------------- Zeitraum
export type Zeitraum = { von: string; bis: string };
export type ZeitraumVorgabe = Zeitraum & { key: string; text: string };

const tag = (j: number, m: number, t: number) => `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const letzter = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();

// Ganzes Jahr, vier Quartale, zwölf Monate – die Auswahl im Kopf von Kontoblatt und Konten.
export function zeitraumVorgaben(jahr: number): ZeitraumVorgabe[] {
  return [
    { key: "jahr", text: `ganzes Jahr ${jahr}`, von: tag(jahr, 1, 1), bis: tag(jahr, 12, 31) },
    ...[1, 2, 3, 4].map((q) => ({ key: `q${q}`, text: `${q}. Quartal ${jahr}`, von: tag(jahr, q * 3 - 2, 1), bis: tag(jahr, q * 3, letzter(jahr, q * 3)) })),
    ...MONATE.map((n, i) => ({ key: `m${i + 1}`, text: `${n} ${jahr}`, von: tag(jahr, i + 1, 1), bis: tag(jahr, i + 1, letzter(jahr, i + 1)) })),
  ];
}

// Welche Vorgabe genau diesen Zeitraum meint – sonst „frei“.
export function zeitraumKey(jahr: number, z: Zeitraum): string {
  return zeitraumVorgaben(jahr).find((v) => v.von === z.von && v.bis === z.bis)?.key ?? "frei";
}

// Ein frei getippter Zeitraum: beide Tage im Jahr, von nicht nach bis. Sonst die Begründung.
export function zeitraumFehler(jahr: number, z: Zeitraum): string | null {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0, 4) === String(jahr);
  if (!ok(z.von) || !ok(z.bis)) return `Von und bis müssen in ${jahr} liegen.`;
  if (z.von > z.bis) return "„Von“ liegt nach „bis“.";
  return null;
}

// ---------------------------------------------------------------- Kontoblatt
export type KontoblattZeile = {
  // Buchung und Zeile: eine Buchung kann ein Konto mehrfach berühren (Splitt).
  key: string;
  // Die Buchungszeile (fin_buchungszeilen.id) – fürs Abhaken (Migration 109); null nur in alten Testdaten.
  zeileId: number | null;
  buchung: FinBuchung;
  datum: string;
  nr: number;
  beleg: string;
  text: string;
  // Das Gegenkonto des Postens; null, wenn mehrere (dann steht „div.“).
  gegen: number | null;
  soll: number;
  haben: number;
  saldo: number;
  steuer: string | null;
  istSteuer: boolean;
  zustand: JournalZustand;
  // Kostenstellen der Zeile (Migration 108).
  kost1: string | null;
  kost2: string | null;
  // Debitor/Kreditor der Zeile (Migration 110).
  personenkonto: number | null;
};

export type Kontoblatt = { eroeffnung: number; zeilen: KontoblattZeile[]; soll: number; haben: number; ende: number };

const frueher = (a: FinBuchung, b: FinBuchung) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.nr - b.nr);

function zustandVon(b: FinBuchung, fest: FinFestschreibung[]): JournalZustand {
  const z = buchungZustand(b, fest);
  return z.storniert ? "storniert" : z.storno ? "storno" : z.festgeschrieben ? "festgeschrieben" : "gebucht";
}

// Mit `person` (Migration 110, v184): das Blatt eines Personenkontos – die Zeilen mit diesem Debitor/Kreditor statt
// eines Sachkontos, die Eröffnung beginnt beim Saldo aus den Vorjahren (`vortrag`).
export function kontoblatt(buchungen: readonly FinBuchung[], konto: number, z: Zeitraum, fest: readonly FinFestschreibung[],
  person?: { vortrag: number }): Kontoblatt {
  let eroeffnung = person ? cent(person.vortrag) : 0;
  const zeilen: KontoblattZeile[] = [];
  for (const b of [...buchungen].sort(frueher)) {
    if (b.datum > z.bis) continue;
    b.fin_buchungszeilen.forEach((x, i) => {
      if (person ? x.personenkonto !== konto : x.konto !== konto) return;
      const wirkung = (x.seite === "S" ? 1 : -1) * Number(x.betrag);
      if (b.datum < z.von) { eroeffnung = cent(eroeffnung + wirkung); return; }
      // Gegenkonto: im selben Posten die andere Seite ohne Steuerzeile. Steht hier die Steuerzeile selbst, ist es das
      // Konto auf der anderen Seite (die Rechnung oder der Lieferant).
      // Ohne Treffer im Posten (die Forderung einer Rechnung steht in Posten 0, die Erlöse in 1, 2 …): alle Posten.
      const gegenseite = (nurPosten: boolean) => [...new Set(b.fin_buchungszeilen
        .filter((y) => (!nurPosten || y.posten === x.posten) && y.seite !== x.seite && !y.ist_steuer && y.konto !== x.konto).map((y) => y.konto))];
      const imPosten = gegenseite(true);
      const andere = imPosten.length ? imPosten : gegenseite(false);
      zeilen.push({
        key: `${b.id}:${x.id ?? i}`, zeileId: x.id ?? null, buchung: b, datum: b.datum, nr: b.nr, beleg: b.beleg ?? "", text: b.text,
        gegen: andere.length === 1 ? andere[0] : null,
        soll: x.seite === "S" ? Number(x.betrag) : 0, haben: x.seite === "H" ? Number(x.betrag) : 0, saldo: 0,
        steuer: x.steuerschluessel, istSteuer: x.ist_steuer, zustand: zustandVon(b, fest as FinFestschreibung[]),
        kost1: x.kost1 ?? null, kost2: x.kost2 ?? null, personenkonto: x.personenkonto ?? null,
      });
    });
  }
  let saldo = eroeffnung, soll = 0, haben = 0;
  for (const r of zeilen) {
    saldo = cent(saldo + r.soll - r.haben);
    r.saldo = saldo;
    soll = cent(soll + r.soll);
    haben = cent(haben + r.haben);
  }
  return { eroeffnung, zeilen, soll, haben, ende: saldo };
}

// ---------------------------------------------------------------- Konten im Zeitraum
export type KontoUebersicht = {
  konto: FinKonto;
  eroeffnung: number;
  soll: number;
  haben: number;
  ende: number;
  anzahl: number;
};

export function kontenUebersicht(konten: readonly FinKonto[], buchungen: readonly FinBuchung[], z: Zeitraum): KontoUebersicht[] {
  const m = new Map<number, Omit<KontoUebersicht, "konto">>();
  const hole = (n: number) => {
    let e = m.get(n);
    if (!e) { e = { eroeffnung: 0, soll: 0, haben: 0, ende: 0, anzahl: 0 }; m.set(n, e); }
    return e;
  };
  for (const b of buchungen) {
    if (b.datum > z.bis) continue;
    const vorher = b.datum < z.von;
    for (const x of b.fin_buchungszeilen) {
      const e = hole(x.konto);
      const betrag = Number(x.betrag);
      if (vorher) e.eroeffnung = cent(e.eroeffnung + (x.seite === "S" ? betrag : -betrag));
      else {
        if (x.seite === "S") e.soll = cent(e.soll + betrag); else e.haben = cent(e.haben + betrag);
        e.anzahl += 1;
      }
    }
  }
  // Nach Kontonummer, wie im Kontenplan.
  return [...konten].sort((a, b) => a.nummer - b.nummer).map((k) => {
    const e = m.get(k.nummer) ?? { eroeffnung: 0, soll: 0, haben: 0, ende: 0, anzahl: 0 };
    return { konto: k, ...e, ende: cent(e.eroeffnung + e.soll - e.haben) };
  });
}

export type KontenFilter = { kategorie: KontoKategorie | null; nurBebucht: boolean; ausgeblendete: boolean; text: string };
export const KONTEN_FILTER_LEER: KontenFilter = { kategorie: null, nurBebucht: true, ausgeblendete: false, text: "" };

// „Bebucht“ heißt: im Zeitraum bewegt oder mit Saldo aus der Zeit davor.
export function kontenFiltern(zeilen: readonly KontoUebersicht[], f: KontenFilter): KontoUebersicht[] {
  const s = f.text.trim().toLowerCase();
  return zeilen.filter((z) => {
    if (f.kategorie && z.konto.kategorie !== f.kategorie) return false;
    if (!f.ausgeblendete && !z.konto.aktiv && z.anzahl === 0 && z.eroeffnung === 0) return false;
    if (f.nurBebucht && z.anzahl === 0 && z.eroeffnung === 0) return false;
    if (s && !`${String(z.konto.nummer).padStart(4, "0")} ${z.konto.bezeichnung}`.toLowerCase().includes(s)) return false;
    return true;
  });
}

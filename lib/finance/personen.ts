// Finance Stufe D, Teil 1 (Migration 110, v184, docs/finance.md Abschnitt 16): Personenkonten – Debitoren und Kreditoren
// als Nebenbuch. Die Forderungs- bzw. Verbindlichkeitszeile einer Rechnung, Zahlung, eines Skontos oder Belegs trägt
// `personenkonto`; gebucht ist weiter auf dem Sammelkonto. Hier die Regeln ohne React: Salden je Person im Jahr,
// offene Posten je Beleg, die Liste für die Kanzlei. Das Kontoblatt rechnet `kontoblatt(…, { vortrag })`
// (lib/finance/kontoblatt.ts). Geprüft in tests/financePersonen.test.ts.

import type { FinBuchung } from "./buchung";
import { csvZelle } from "./arbeitsplatz";

export type PersonArt = "debitor" | "kreditor";
export type FinPersonenkonto = {
  nummer: number;
  art: PersonArt;
  sammel: boolean;
  name: string;
  kundennummer: number | null;
  customer_id: string | null;
  lieferant_id: string | null;
  anschrift: string | null;
  ust_id: string | null;
  // Saldo der Zeilen aus den Vorjahren (Soll minus Haben).
  vortrag: number;
};

// Die zwei Arten mit Nummernbereich – wie die Prüfregel `fin_pk_bereich` (Migration 110) und DATEV bei Sachkontenlänge 4.
export const FIN_PERSONEN_ARTEN: { wert: PersonArt; text: string; einzeln: string; von: number; bis: number }[] = [
  { wert: "debitor", text: "Debitoren", einzeln: "Debitor", von: 10000, bis: 69999 },
  { wert: "kreditor", text: "Kreditoren", einzeln: "Kreditor", von: 70000, bis: 99999 },
];

const cent = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- Salden
export type PersonSaldo = { soll: number; haben: number; saldo: number; zeilen: number };

// Je Personenkonto: Soll, Haben und Saldo (Vortrag + Soll − Haben) aus den Buchungen des Jahres.
export function personenSalden(personen: readonly FinPersonenkonto[], buchungen: readonly FinBuchung[]): Map<number, PersonSaldo> {
  const m = new Map<number, PersonSaldo>(personen.map((p) => [p.nummer, { soll: 0, haben: 0, saldo: cent(p.vortrag), zeilen: 0 }]));
  for (const b of buchungen) {
    for (const z of b.fin_buchungszeilen) {
      if (z.personenkonto == null) continue;
      const e = m.get(z.personenkonto) ?? { soll: 0, haben: 0, saldo: 0, zeilen: 0 };
      if (z.seite === "S") e.soll = cent(e.soll + Number(z.betrag)); else e.haben = cent(e.haben + Number(z.betrag));
      e.saldo = cent(e.saldo + (z.seite === "S" ? 1 : -1) * Number(z.betrag));
      e.zeilen += 1;
      m.set(z.personenkonto, e);
    }
  }
  return m;
}

// ---------------------------------------------------------------- Offene Posten
export type OffenerPosten = { beleg: string; datum: string; text: string; soll: number; haben: number; offen: number; buchungen: FinBuchung[] };

// Offene Posten eines Personenkontos wie bei DATEV: die Zeilen je Belegnummer (Rechnungs- bzw. Belegnummer) gegeneinander
// aufgerechnet; was nicht auf null aufgeht, ist offen. Nur das Jahr – was aus Vorjahren offen ist, steckt im Vortrag.
export function offenePosten(buchungen: readonly FinBuchung[], nummer: number): OffenerPosten[] {
  const m = new Map<string, OffenerPosten>();
  for (const b of [...buchungen].sort((x, y) => x.datum.localeCompare(y.datum) || x.nr - y.nr)) {
    for (const z of b.fin_buchungszeilen) {
      if (z.personenkonto !== nummer) continue;
      const beleg = b.beleg?.trim() || `${b.jahr}-${b.nr}`;
      const e = m.get(beleg) ?? { beleg, datum: b.datum, text: b.text, soll: 0, haben: 0, offen: 0, buchungen: [] };
      if (z.seite === "S") e.soll = cent(e.soll + Number(z.betrag)); else e.haben = cent(e.haben + Number(z.betrag));
      e.offen = cent(e.soll - e.haben);
      if (!e.buchungen.includes(b)) e.buchungen.push(b);
      m.set(beleg, e);
    }
  }
  return [...m.values()].filter((o) => Math.abs(o.offen) >= 0.005);
}

// Tage seit dem Beleg (für „wie alt“ in der OP-Liste).
export function tageSeit(datum: string, heute: string): number {
  return Math.round((Date.parse(`${heute}T00:00:00Z`) - Date.parse(`${datum}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------- Filtern und Liste für die Kanzlei
export function personenFiltern(personen: readonly FinPersonenkonto[], salden: Map<number, PersonSaldo>,
  f: { art: PersonArt | null; suche: string; nurOffen: boolean }): FinPersonenkonto[] {
  const s = f.suche.trim().toLowerCase();
  return personen
    .filter((p) => !f.art || p.art === f.art)
    .filter((p) => !f.nurOffen || Math.abs(salden.get(p.nummer)?.saldo ?? 0) >= 0.005)
    .filter((p) => !s || `${p.nummer} ${p.name} ${p.kundennummer ?? ""}`.toLowerCase().includes(s));
}

// Die Personenkonten als CSV (Semikolon, für Excel und die Kanzlei): damit legt sie Debitoren und Kreditoren mit Namen an.
export function personenCsv(personen: readonly FinPersonenkonto[]): string {
  const kopf = ["Konto", "Art", "Name", "Kundennummer", "Anschrift", "USt-IdNr."];
  const zeilen = personen.map((p) => [p.nummer, FIN_PERSONEN_ARTEN.find((a) => a.wert === p.art)?.einzeln ?? p.art, p.name, p.kundennummer ?? "",
    (p.anschrift ?? "").replace(/\s*\n\s*/g, ", "), p.ust_id ?? ""]);
  return [kopf, ...zeilen].map((z) => z.map((x) => csvZelle(x)).join(";")).join("\r\n") + "\r\n";
}

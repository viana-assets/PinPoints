import { describe, expect, it } from "vitest";
import type { FinBuchung, FinZeile } from "@/lib/finance/buchung";
import { kontoblatt } from "@/lib/finance/kontoblatt";
import { FIN_PERSONEN_ARTEN, offenePosten, personenCsv, personenFiltern, personenSalden, tageSeit, type FinPersonenkonto } from "@/lib/finance/personen";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Personenkonten (Migration 110, v184): Salden, offene Posten je Beleg, Kontoblatt ab Vortrag, CSV.
let id = 0;
const z = (seite: "S" | "H", konto: number, betrag: number, personenkonto: number | null = null): FinZeile =>
  ({ id: ++id, posten: 1, seite, konto, betrag, steuerschluessel: null, ist_steuer: false, personenkonto });
const b = (nr: number, datum: string, beleg: string, zeilen: FinZeile[]): FinBuchung => ({ id: `b${nr}`, jahr: 2027, nr, datum, text: `Buchung ${nr}`, beleg,
  quelle: "rechnung", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x", fin_buchungszeilen: zeilen });
const P = (nummer: number, name: string, vortrag = 0, art: FinPersonenkonto["art"] = "debitor"): FinPersonenkonto =>
  ({ nummer, art, sammel: false, name, kundennummer: art === "debitor" ? nummer : null, customer_id: null, lieferant_id: null, anschrift: "Weg 1\n12345 Ort", ust_id: null, vortrag });
const B = [
  b(1, "2027-01-10", "RE1", [z("S", 1400, 119, 10000), z("H", 8400, 119)]),
  b(2, "2027-01-12", "RE2", [z("S", 1400, 59.5, 10000), z("H", 8400, 59.5)]),
  b(3, "2027-01-20", "RE1", [z("S", 1200, 119), z("H", 1400, 119, 10000)]),
  b(4, "2027-01-21", "RE2", [z("S", 1200, 50), z("H", 1400, 50, 10000)]),
  b(5, "2027-02-01", "LR-1", [z("S", 3200, 238), z("H", 1600, 238, 70000)]),
];

describe("Personenkonten", () => {
  it("Nummernbereiche wie die Prüfregel in Migration 110", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "110_finance_personenkonten.sql"), "utf8");
    for (const a of FIN_PERSONEN_ARTEN) expect(sql).toContain(`art = '${a.wert}' and nummer between ${a.von} and ${a.bis}`);
  });
  it("Salden: Vortrag + Soll − Haben je Person", () => {
    const s = personenSalden([P(10000, "Anna", 20), P(70000, "Reifen GmbH", 0, "kreditor")], B);
    expect(s.get(10000)).toEqual({ soll: 178.5, haben: 169, saldo: 29.5, zeilen: 4 });
    expect(s.get(70000)).toEqual({ soll: 0, haben: 238, saldo: -238, zeilen: 1 });
  });
  it("offene Posten je Belegnummer: RE1 ausgeglichen, RE2 mit 9,50 offen", () => {
    const op = offenePosten(B, 10000);
    expect(op.map((o) => [o.beleg, o.offen])).toEqual([["RE2", 9.5]]);
    expect(op[0].buchungen.map((x) => x.nr)).toEqual([2, 4]);
    expect(offenePosten(B, 70000).map((o) => [o.beleg, o.offen])).toEqual([["LR-1", -238]]);
    expect(tageSeit("2027-01-12", "2027-02-11")).toBe(30);
  });
  it("Kontoblatt eines Personenkontos: Eröffnung = Vortrag, laufender Saldo, Gegenkonto", () => {
    const k = kontoblatt(B, 10000, { von: "2027-01-15", bis: "2027-12-31" }, [], { vortrag: 20 });
    expect(k.eroeffnung).toBe(198.5);
    expect(k.zeilen.map((x) => [x.nr, x.gegen, x.saldo])).toEqual([[3, 1200, 79.5], [4, 1200, 29.5]]);
    expect(k.ende).toBe(29.5);
  });
  it("filtern nach Art, Saldo und Suche; CSV für die Kanzlei", () => {
    const pers = [P(10000, "Anna"), P(10001, "Bert"), P(70000, "Reifen GmbH", 0, "kreditor")];
    const s = personenSalden(pers, B);
    expect(personenFiltern(pers, s, { art: "debitor", suche: "", nurOffen: false }).map((p) => p.nummer)).toEqual([10000, 10001]);
    expect(personenFiltern(pers, s, { art: null, suche: "", nurOffen: true }).map((p) => p.nummer)).toEqual([10000, 70000]);
    expect(personenFiltern(pers, s, { art: null, suche: "reif", nurOffen: false }).map((p) => p.nummer)).toEqual([70000]);
    expect(personenCsv([P(10000, "Anna; Müller")]).split("\r\n")).toEqual(["Konto;Art;Name;Kundennummer;Anschrift;USt-IdNr.", '10000;Debitor;"Anna; Müller";10000;Weg 1, 12345 Ort;', ""]);
  });
});

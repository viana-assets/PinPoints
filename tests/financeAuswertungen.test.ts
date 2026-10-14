import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_BWA_KOSTEN, FIN_EUER_AUSGABEN, bwa, euer, euerLesen, kontenblattMitSaldo, saldenLesen, summenSalden,
} from "@/lib/finance/auswertungen";
import type { FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";

// Finance F6 (Migration 94, v152). Die Konten kommen aus den Migrationen 88 und 93 – so prüft der Test zugleich,
// dass jede Aufwandsnummer in genau eine Zeile fällt.
const SQL = ["88_finance_buchungen.sql", "93_finance_luecken.sql"].map((d) => readFileSync(join(__dirname, "..", "supabase", "migrations", d), "utf8")).join("\n");
const alle = [...SQL.matchAll(/\('(skr0[34])', (\d+), '((?:[^']|'')*)', '(\w+)'\)/g)].map((m) => ({ kontenrahmen: m[1], nummer: Number(m[2]), bezeichnung: m[3], kategorie: m[4], eigen: false, aktiv: true })) as FinKonto[];
const K03 = alle.filter((k) => k.kontenrahmen === "skr03");
const schl: FinSteuerschluessel[] = [...SQL.matchAll(/\('(skr03)', '(\w+)', '((?:[^']|'')*)', ([\d.]+), '(\w+)', (\w+), (\w+)\)/g)]
  .map((m) => ({ kontenrahmen: m[1], schluessel: m[2], bezeichnung: m[3], satz: Number(m[4]), art: m[5], ust_konto: m[6] === "null" ? null : Number(m[6]), vst_konto: m[7] === "null" ? null : Number(m[7]) })) as FinSteuerschluessel[];

describe("Zuordnung der Konten", () => {
  for (const rahmen of ["skr03", "skr04"] as const) {
    it(`${rahmen}: Bereiche überschneiden sich nicht, alle Aufwandskonten sind bekannt`, () => {
      const aufwand = alle.filter((k) => k.kontenrahmen === rahmen && k.kategorie === "aufwand");
      expect(aufwand.length).toBeGreaterThan(20);
      for (const k of aufwand) {
        const bwaTreffer = FIN_BWA_KOSTEN.filter((z) => z.bereiche[rahmen].some(([v, b]) => k.nummer >= v && k.nummer <= b));
        const euerTreffer = FIN_EUER_AUSGABEN.filter((z) => z.bereiche[rahmen].some(([v, b]) => k.nummer >= v && k.nummer <= b));
        expect(bwaTreffer.length, `${k.nummer} BWA`).toBeLessThanOrEqual(1);
        expect(euerTreffer.length, `${k.nummer} EÜR`).toBeLessThanOrEqual(1);
      }
    });
  }
  it("die wichtigsten Konten landen, wo sie hingehören", () => {
    const zeile = (n: number) => FIN_EUER_AUSGABEN.find((z) => z.bereiche.skr03.some(([v, b]) => n >= v && n <= b))?.kz ?? "183";
    expect([3400, 3123, 4110, 4830, 4855, 4210, 4920, 4670, 4955, 4360, 4600, 4650, 4530, 4970].map(zeile))
      .toEqual(["100", "110", "120", "130", "132", "150", "280", "221", "194", "223", "224", "165", "144–146", "183"]);
  });
});

describe("Summen und Salden, BWA", () => {
  const salden = saldenLesen([
    { konto: 8400, monat: 9, soll: null, haben: "118.00" }, { konto: 8400, monat: 10, soll: "10", haben: "300.00" },
    { konto: 1400, monat: 9, soll: "140.42", haben: "50" }, { konto: 3400, monat: 10, soll: "80", haben: null },
    { konto: 4530, monat: 9, soll: "50", haben: null }, { konto: 4210, monat: 10, soll: "100", haben: null },
    { konto: 2700, monat: 10, soll: null, haben: "5" },
  ]);
  it("Zeitraum, Saldo Soll minus Haben, Summen", () => {
    const s = summenSalden(salden, K03, 10, 10);
    expect(s.zeilen.map((z) => [z.konto, z.saldo])).toEqual([[2700, -5], [3400, 80], [4210, 100], [8400, -290]]);
    expect(summenSalden(salden, K03, 1, 12).zeilen.find((z) => z.konto === 1400)).toMatchObject({ soll: 140.42, haben: 50, saldo: 90.42, kategorie: "forderung" });
  });
  it("BWA Monat und kumuliert", () => {
    const b = bwa(salden, K03, "skr03", 10);
    expect(b.monat).toMatchObject({ umsatz: 290, material: 80, rohertrag: 210, gesamtkosten: 100, betriebsergebnis: 110, sonstigeErtraege: 5, ergebnis: 115 });
    expect(b.kumuliert).toMatchObject({ umsatz: 408, gesamtkosten: 150, betriebsergebnis: 178, ergebnis: 183 });
    expect(b.kumuliert.kosten).toMatchObject({ kfz: 50, raum: 100 });
  });
});

describe("EÜR", () => {
  // Wie pgtest/t94.sql gegen Migration 94.
  const stand = euerLesen({ eingerichtet: true, unklar: "80.00", konten: [
    { konto: 210, wirkung: "-1000.00" }, { konto: 1576, wirkung: "-199.50" }, { konto: 1776, wirkung: "41.42" }, { konto: 1780, wirkung: "-300.00" },
    { konto: 1800, wirkung: "-200.00" }, { konto: 4530, wirkung: "-50.00" }, { konto: 4830, wirkung: "-250.00" }, { konto: 8400, wirkung: "218.00" },
    { konto: 4650, wirkung: "-100.00" },
  ] });
  it("Einnahmen, Ausgaben, Gewinn, Hinweise", () => {
    if (!stand.eingerichtet) throw new Error("x");
    const x = euer(stand, K03, schl, "skr03", false);
    expect(x.einnahmen.map((z) => [z.kz, z.betrag])).toEqual([["112", 218], ["140", 41.42]]);
    expect(x.ausgaben.map((z) => [z.kz, z.betrag])).toEqual([["130", 250], ["165", 70], ["144–146", 50], ["185", 199.5], ["186", 300]]);
    expect(x).toMatchObject({ summeEinnahmen: 259.42, summeAusgaben: 869.5, gewinn: -610.08, anlagen: 1000, privat: -200, unklar: 80, nichtAbziehbar: 30 });
  });
  it("Kleinunternehmer: alles in Kz 111", () => {
    if (!stand.eingerichtet) throw new Error("x");
    expect(euer(stand, K03, schl, "skr03", true).einnahmen[0]).toEqual({ kz: "111", text: "Betriebseinnahmen als Kleinunternehmer", betrag: 218 });
    expect(euerLesen({ eingerichtet: false })).toEqual({ eingerichtet: false });
  });
});

describe("Kontenblatt", () => {
  it("laufender Saldo", () => {
    const z = (seite: "S" | "H", betrag: number) => ({ datum: "2026-10-01", nr: 1, text: "", beleg: null, seite, betrag, steuer: null, storno: false, gegen: null });
    expect(kontenblattMitSaldo([z("S", 140.42), z("H", 50), z("H", 90.42)]).map((x) => x.saldo)).toEqual([140.42, 90.42, 0]);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_BASISZINS, FIN_MAHNSTUFEN, FIN_VERZUG_PUNKTE, aktiveMahnungen, basiszins, mahnGesamt, mahnText, mahnVorschlag, mahnZuErledigen,
  mailtoMahnung, tagePlus, verzugszinsen, type FinMahnung,
} from "@/lib/finance/mahnung";
import type { FinRechnungZeile } from "@/lib/finance/rechnungen";

// Finance: Mahnwesen (Migration 99, v157).
const r = (p: Partial<FinRechnungZeile> = {}): FinRechnungZeile => ({
  rechnung_id: "r1", nummer_text: "RE1", datum: "2026-10-01", brutto: 119, order_id: "o", order_number: 1, kunde: "K", storniert: false,
  storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1, ...p,
});
const m = (p: Partial<FinMahnung>): FinMahnung => ({
  id: "m" + (p.stufe ?? 1), rechnung_id: "r1", stufe: 1, datum: "2026-10-22", frist: "2026-11-01", nummer_text: "RE1", rechnung_datum: "2026-10-01",
  faellig_am: "2026-10-15", brutto: 119, bezahlt: 0, offen: 119, gebuehr: 0, zinsen: 0, zinssatz: null, text: "Text",
  absender: { firma: "Beispielbetrieb" }, empfaenger: { email: "kunde@example.org" }, zurueckgezogen_am: null, zurueck_grund: null, erstellt_am: "x", ...p,
});

describe("Basiszins und Verzugszinsen", () => {
  it("Basiszins je Halbjahr, aufsteigend", () => {
    expect(basiszins("2023-12-31")).toBeNull();
    expect(basiszins("2026-06-30")).toBe(1.27);
    expect(basiszins("2026-07-01")).toBe(1.52);
    expect(FIN_BASISZINS.map((b) => b.ab)).toEqual([...FIN_BASISZINS.map((b) => b.ab)].sort());
    expect(FIN_BASISZINS.every((b) => /-0[17]-01$/.test(b.ab))).toBe(true);
    expect(FIN_VERZUG_PUNKTE).toEqual({ verbraucher: 5, unternehmer: 9 });
  });
  it("taggenau über den Wechsel zum 1. Juli 2026", () => {
    // 10 Tage zu 6,27 % und 10 Tage zu 6,52 % auf 100 €: (62,7 + 65,2) / 365 = 0,35
    expect(verzugszinsen(100, "2026-06-21", "2026-07-10", "verbraucher")).toEqual({ zinsen: 0.35, satz: 6.52, tage: 20 });
    // ein ganzes Jahr Unternehmer: 181 Tage 10,27 % und 184 Tage 10,52 % auf 1.000 €
    expect(verzugszinsen(1000, "2026-01-01", "2026-12-31", "unternehmer")).toEqual({ zinsen: 103.96, satz: 10.52, tage: 365 });
  });
  it("nichts offen oder Zeitraum verkehrt: keine Zinsen", () => {
    expect(verzugszinsen(0, "2026-07-01", "2026-07-10", "verbraucher").zinsen).toBe(0);
    expect(verzugszinsen(100, "2026-07-11", "2026-07-10", "verbraucher")).toEqual({ zinsen: 0, satz: 6.52, tage: 0 });
  });
  it("tagePlus über Monatsgrenzen", () => {
    expect(tagePlus("2026-10-25", 10)).toBe("2026-11-04");
    expect(tagePlus("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("mahnVorschlag", () => {
  it("vor und am Fälligkeitstag noch nicht, danach erlaubt, nach 7 Tagen vorgeschlagen", () => {
    expect(mahnVorschlag(r(), [], "2026-10-15")).toEqual({ art: "noch_nicht", stufe: 1, ab: "2026-10-16", moeglich: false, grund: "fällig am 15.10.2026" });
    expect(mahnVorschlag(r(), [], "2026-10-18")).toEqual({ art: "noch_nicht", stufe: 1, ab: "2026-10-22", moeglich: true, grund: "Zahlungserinnerung vorgeschlagen ab 22.10.2026" });
    expect(mahnVorschlag(r(), [], "2026-10-22")).toEqual({ art: "jetzt", stufe: 1, datum: "2026-10-22", frist: "2026-11-01", verzugAb: null });
  });
  it("Stufe 2 erst nach der Frist der Erinnerung, Verzug ab dem Tag danach", () => {
    const e = [m({ stufe: 1 })];
    expect(mahnVorschlag(r(), e, "2026-11-01")).toMatchObject({ art: "noch_nicht", stufe: 2, moeglich: false, grund: "Frist der Zahlungserinnerung läuft bis 01.11.2026" });
    expect(mahnVorschlag(r(), e, "2026-11-04")).toEqual({ art: "jetzt", stufe: 2, datum: "2026-11-04", frist: "2026-11-14", verzugAb: "2026-11-02" });
  });
  it("nach Stufe 3 keine weitere; zurückgezogene zählen nicht", () => {
    expect(mahnVorschlag(r(), [m({ stufe: 1 }), m({ stufe: 2, frist: "2026-11-14" }), m({ stufe: 3, frist: "2026-11-27" })], "2026-12-20").art).toBe("keine");
    const zurueck = [m({ stufe: 1, zurueckgezogen_am: "2026-10-23" })];
    expect(aktiveMahnungen(zurueck, "r1")).toEqual([]);
    expect(mahnVorschlag(r(), zurueck, "2026-10-23")).toMatchObject({ art: "jetzt", stufe: 1 });
  });
  it("bezahlt, storniert, nicht gebucht: keine", () => {
    expect(mahnVorschlag(r({ bezahlt_am: "2026-10-20", bezahlt_art: "bank" }), [], "2026-11-01")).toEqual({ art: "keine", grund: "bezahlt" });
    expect(mahnVorschlag(r({ storniert: true }), [], "2026-11-01")).toEqual({ art: "keine", grund: "storniert" });
    expect(mahnVorschlag(r({ status: "offen" }), [], "2026-11-01")).toEqual({ art: "keine", grund: "nicht gebucht" });
  });
  it("mahnZuErledigen zählt nur, was jetzt dran ist", () => {
    const liste = [r(), r({ rechnung_id: "r2", faellig_am: "2026-10-30" }), r({ rechnung_id: "r3", bezahlt_am: "2026-10-16", bezahlt_art: "bar" })];
    expect(mahnZuErledigen(liste, [], "2026-10-25")).toBe(1);
  });
});

describe("Text, Summe, E-Mail", () => {
  it("Vorlagen je Stufe mit Betrag und Frist", () => {
    const x = { nummer: "RE1", rechnungDatum: "2026-10-01", offen: 119, gesamt: 124.5, frist: "2026-11-01" };
    expect(mahnText({ ...x, stufe: 1 })).toMatch(/^Sehr geehrte Damen und Herren,\n\nsicher ist es [^]*RE1 vom 01\.10\.2026[^]*124,50\s€ bis zum 01\.11\.2026/);
    expect(mahnText({ ...x, stufe: 2, anrede: "Hallo Frau Muster" })).toMatch(/^Hallo Frau Muster,\n\ntrotz unserer Zahlungserinnerung/);
    expect(mahnText({ ...x, stufe: 3 })).toMatch(/gerichtlich geltend machen/);
    for (const s of [1, 2, 3]) expect(mahnText({ ...x, stufe: s }).length).toBeLessThanOrEqual(2000);
  });
  it("Gesamt = offen + Gebühr + Zinsen; mailto nur mit Adresse", () => {
    expect(mahnGesamt({ offen: 119, gebuehr: 2.5, zinsen: 0.35 })).toBe(121.85);
    expect(mailtoMahnung(m({}))).toMatch(/^mailto:kunde%40example\.org\?subject=Zahlungserinnerung%20zur%20Rechnung%20RE1&body=Text/);
    expect(mailtoMahnung(m({ empfaenger: { email: null } }))).toBeNull();
  });
});

describe("Gleich mit Migration 99", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "99_finance_mahnwesen.sql"), "utf8");
  it("drei Stufen, Gebühr 0–100, Text bis 2.000", () => {
    expect(FIN_MAHNSTUFEN.map((s) => s.stufe)).toEqual([1, 2, 3]);
    expect(sql).toMatch(/stufe between 1 and 3/);
    expect(sql).toMatch(/gebuehr >= 0 and gebuehr <= 100/);
    expect(sql).toMatch(/between 1 and 2000/);
  });
});

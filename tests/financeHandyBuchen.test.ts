import { describe, expect, it } from "vitest";
import {
  FIN_HANDY_ZWECKE, FIN_PRIVATEINLAGE, handyGegenkonto, handyMangel, handyPosten, handyText, handyZahlwege, handyZwecke, heuteGebucht, kurzName, lokalesDatum,
} from "@/lib/finance/handybuchen";
import { FIN_GELDTRANSIT } from "@/lib/finance/bank";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Buchen am Handy (v187). Konten wie Migration 88, Buchungen erfunden.
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand", aktiv = true): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv });
const KONTEN = [k(1000, "Kasse", "geld"), k(1360, "Geldtransit", "geld"), k(1890, "Privateinlagen", "privat"), k(1576, "Vorsteuer 19 %", "steuer"),
  k(3400, "Wareneingang 19 % Vorsteuer (Reifen, Ventile, Material)"), k(4530, "Laufende Kfz-Kosten (Kraftstoff)"), k(4580, "Sonstige Kfz-Kosten"),
  k(4650, "Bewirtungskosten"), k(4985, "Werkzeuge und Kleingeräte"), k(4930, "Bürobedarf"), k(4910, "Porto"), k(4210, "Miete")];
const z = (seite: "S" | "H", konto: number, betrag: number, ist_steuer = false): FinZeile => ({ posten: 1, seite, konto, betrag, ist_steuer, steuerschluessel: null });
let nr = 0;
const b = (soll: number, quelle: FinBuchung["quelle"] = "manuell", extra: Partial<FinBuchung> = {}): FinBuchung => ({
  id: `b${++nr}`, jahr: 2026, nr, datum: "2026-10-01", text: "x", beleg: null, quelle, quelle_id: null, storno_von: null, storniert_durch: null, grund: null,
  erstellt_am: "2026-10-01T08:00:00Z", fin_buchungszeilen: [z("S", soll, 10), z("S", 1576, 1.9, true), z("H", 1000, 11.9)], ...extra,
});

describe("Wofür: feste Zwecke nach Häufigkeit, dazu gelernte Konten", () => {
  it("ohne Buchungen: die festen in ihrer Reihenfolge", () => {
    expect(handyZwecke([], KONTEN, "skr03").map((x) => x.text)).toEqual(["Tanken", "Material", "Werkzeug", "Bewirtung", "Parken"]);
  });
  it("häufige zuerst; Bürobedarf zweimal → eigener Knopf; Porto einmal nicht; Rechnung und Storno zählen nicht", () => {
    const liste = [b(4985), b(4985), b(4530), b(4930), b(4930), b(4910), b(4210, "rechnung"), b(4210, "rechnung"), b(4650, "manuell", { storno_von: "b1" }), b(4650, "manuell", { storniert_durch: "b2" })];
    const w = handyZwecke(liste, KONTEN, "skr03");
    expect(w.map((x) => x.text)).toEqual(["Werkzeug", "Tanken", "Material", "Bewirtung", "Parken", "Bürobedarf"]);
    expect(w[5]).toEqual({ key: "k4930", text: "Bürobedarf", konto: 4930 });
  });
  it("ausgeblendete Konten fehlen; SKR04 hat eigene Nummern", () => {
    expect(handyZwecke([], KONTEN.map((x) => (x.nummer === 4650 ? { ...x, aktiv: false } : x)), "skr03").map((x) => x.key)).not.toContain("bewirtung");
    expect(FIN_HANDY_ZWECKE.map((x) => x.konto.skr04)).toEqual([6530, 5400, 6845, 6640, 6570]);
  });
  it("die festen Konten stehen alle in Migration 88", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "88_finance_buchungen.sql"), "utf8");
    for (const z of FIN_HANDY_ZWECKE) for (const r of ["skr03", "skr04"] as const) expect(sql).toContain(`('${r}', ${z.konto[r]}, `);
    for (const r of ["skr03", "skr04"] as const) expect(sql).toContain(`('${r}', ${FIN_PRIVATEINLAGE[r]}, 'Privateinlagen'`);
  });
  it("kurze Namen für Knöpfe", () => {
    expect(kurzName("Wareneingang 19 % Vorsteuer (Reifen, Ventile, Material)")).toBe("Wareneingang 19 % Vorst…");
    expect(kurzName("Porto")).toBe("Porto");
  });
});

describe("Bezahlt mit", () => {
  it("Rechte und Rechtsform", () => {
    expect(handyZahlwege("einzel", { buchen: true, belege: true })).toEqual(["karte", "bar", "privat", "offen"]);
    expect(handyZahlwege("gmbh", { buchen: true, belege: false })).toEqual(["karte", "bar"]);
    expect(handyZahlwege("einzel", { buchen: false, belege: true })).toEqual(["offen"]);
  });
  it("Gegenkonten", () => {
    expect(handyGegenkonto("karte", "skr03")).toBe(FIN_GELDTRANSIT.skr03);
    expect(handyGegenkonto("bar", "skr04")).toBe(1600);
    expect(handyGegenkonto("privat", "skr03")).toBe(1890);
    expect(handyGegenkonto("offen", "skr03")).toBeNull();
  });
  it("Posten, Text, was fehlt", () => {
    expect(handyPosten({ konto: 4530, gegen: 1000, betrag: 78.4, mitSteuer: true, klein: false, kost1: "T1" }))
      .toEqual({ soll: 4530, haben: 1000, betrag: 78.4, steuer: "vst19", kost1: "T1" });
    expect(handyPosten({ konto: 4530, gegen: 1000, betrag: 78.4, mitSteuer: true, klein: true, kost1: "" }).steuer).toBeNull();
    expect(handyText("Tanken", "  Shell   Hbf ")).toBe("Tanken · Shell Hbf");
    expect(handyText("Parken", "")).toBe("Parken");
    expect(handyMangel({ betrag: null, konto: 4530, weg: "bar", lieferant: "" })).toBe("Betrag eintragen.");
    expect(handyMangel({ betrag: 5, konto: null, weg: "bar", lieferant: "" })).toBe("Wählen, wofür es war.");
    expect(handyMangel({ betrag: 5, konto: 4530, weg: null, lieferant: "" })).toBe("Wählen, womit bezahlt wurde.");
    expect(handyMangel({ betrag: 5, konto: 4530, weg: "offen", lieferant: " " })).toMatch(/Lieferanten/);
    expect(handyMangel({ betrag: 5, konto: 4530, weg: "offen", lieferant: "Würth" })).toBeNull();
  });
});

describe("Heute von dir gebucht", () => {
  it("nur eigene, heutige, ohne Stornos und Rechnungen, neueste zuerst", () => {
    const heute = lokalesDatum("2026-10-30T10:00:00");
    const a = b(4530, "manuell", { erstellt_von: "ich", erstellt_am: "2026-10-30T07:00:00" });
    const c = b(4580, "beleg", { erstellt_von: "ich", erstellt_am: "2026-10-30T09:00:00" });
    const liste = [a, c, b(4530, "manuell", { erstellt_von: "andere", erstellt_am: "2026-10-30T08:00:00" }),
      b(4530, "manuell", { erstellt_von: "ich", erstellt_am: "2026-10-29T08:00:00" }),
      b(4530, "manuell", { erstellt_von: "ich", erstellt_am: "2026-10-30T08:00:00", storno_von: "x" }),
      b(8400, "rechnung", { erstellt_von: "ich", erstellt_am: "2026-10-30T08:00:00" })];
    expect(heuteGebucht(liste, "ich", heute).map((x) => x.id)).toEqual([c.id, a.id]);
    expect(heuteGebucht(liste, null, heute)).toEqual([]);
  });
});

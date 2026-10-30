import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIN_WK_RHYTHMEN, naechsterOffenerTermin, vorlageInEingabe, vorlagenSortiert, wiederkehrendOffen, wkText, type FinWiederkehrend } from "@/lib/finance/vorlagen";

// Vorlagen und wiederkehrende Buchungen (Migration 107, v181): dieselben Termine wie fin_wiederkehrend_holen()
// (Fälle wie in /tmp/pgt/t107.sql).
const wk = (id: string, text: string, rhythmus: FinWiederkehrend["rhythmus"], ab: string, bis: string | null = null, aktiv = true): FinWiederkehrend =>
  ({ id, text, soll: 4530, haben: 1200, betrag: 100, steuer: null, rhythmus, ab, bis, aktiv });
const LEASING = wk("w1", "Leasing VW T6.1", "monat", "2026-11-30");
const VERS = wk("w2", "Versicherung", "quartal", "2027-01-15", "2027-06-30");
const PAUSE = wk("w3", "Pausiert", "monat", "2027-01-01", null, false);

describe("Wiederkehrende Buchungen", () => {
  it("Rhythmen wie die Prüfregel der Migration", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "107_finance_vorlagen_wiederkehrend.sql"), "utf8");
    const m = /fin_wk_rhythmus check \(rhythmus in \(([^)]*)\)\)/.exec(sql);
    expect(m?.[1].split(",").map((x) => x.trim().replace(/'/g, ""))).toEqual(FIN_WK_RHYTHMEN.map((r) => r.wert));
  });
  it("holen bis 30.04.: Termine im Jahr, Monatsende abgeschnitten, pausierte nicht, sortiert", () => {
    const o = wiederkehrendOffen([LEASING, VERS, PAUSE], [], 2027, "2027-04-30");
    expect(o.map((x) => [x.termin, x.text])).toEqual([
      ["2027-01-15", "Versicherung 01/2027"], ["2027-01-30", "Leasing VW T6.1 01/2027"], ["2027-02-28", "Leasing VW T6.1 02/2027"],
      ["2027-03-30", "Leasing VW T6.1 03/2027"], ["2027-04-15", "Versicherung 04/2027"], ["2027-04-30", "Leasing VW T6.1 04/2027"]]);
  });
  it("schon geholte Termine nicht noch einmal; „bis“ und Jahresende begrenzen", () => {
    const vergeben = [{ wiederkehrend_id: "w1", termin: "2027-01-30" }, { wiederkehrend_id: "w2", termin: "2027-01-15" }, { wiederkehrend_id: null, termin: null }];
    expect(wiederkehrendOffen([LEASING, VERS], vergeben, 2027, "2027-02-28").map((x) => x.termin)).toEqual(["2027-02-28"]);
    expect(wiederkehrendOffen([VERS], [], 2027, "2028-12-31").map((x) => x.termin)).toEqual(["2027-01-15", "2027-04-15"]);
    expect(wiederkehrendOffen([LEASING], [], 2027, "2030-01-01").length).toBe(12);
  });
  it("nächster offener Termin", () => {
    expect(naechsterOffenerTermin(LEASING, [])).toBe("2026-11-30");
    expect(naechsterOffenerTermin(LEASING, [{ wiederkehrend_id: "w1", termin: "2026-11-30" }])).toBe("2026-12-30");
    expect(naechsterOffenerTermin(VERS, [{ wiederkehrend_id: "w2", termin: "2027-01-15" }, { wiederkehrend_id: "w2", termin: "2027-04-15" }])).toBeNull();
  });
  it("Text mit Monat, höchstens 200 Zeichen", () => {
    expect(wkText("Miete", "2027-03-01")).toBe("Miete 03/2027");
    expect(wkText("x".repeat(198), "2027-03-01").length).toBe(200);
  });
});

describe("Vorlagen", () => {
  it("füllt die Erfassungszeile, Datum und Beleg bleiben; ohne Betrag bleibt er leer", () => {
    const e = { datum: "10.02.", beleg: "ER-7", soll: null, haben: null, betrag: "5", steuer: "", text: "" };
    expect(vorlageInEingabe({ id: "v", kurz: "Tank", text: "Tanken", soll: 4530, haben: 1000, betrag: null, steuer: "vst19" }, e))
      .toEqual({ datum: "10.02.", beleg: "ER-7", soll: 4530, haben: 1000, betrag: "", steuer: "vst19", text: "Tanken", kost1: "", kost2: "" });
    expect(vorlageInEingabe({ id: "v", kurz: "Konto", text: "Kontoführung", soll: 4970, haben: 1200, betrag: 12.9, steuer: null }, e).betrag).toBe("12,90");
  });
  it("sortiert nach Kurzname ohne Groß/klein", () => {
    const v = (kurz: string) => ({ id: kurz, kurz, text: "t", soll: 1, haben: 2, betrag: null, steuer: null });
    expect(vorlagenSortiert([v("tank"), v("Miete"), v("Bank")]).map((x) => x.kurz)).toEqual(["Bank", "Miete", "tank"]);
  });
});

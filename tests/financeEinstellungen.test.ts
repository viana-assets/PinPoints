import { describe, expect, it } from "vitest";
import {
  FIN_BESTEUERUNG, FIN_GEWINNERMITTLUNG, FIN_KONTENRAHMEN, FIN_RECHTSFORMEN, FIN_VERSTEUERUNG, FIN_VORANMELDUNG,
  finFeldAktiv, finKurztext, finMaengel, finVorgabe,
} from "@/lib/finance/einstellungen";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Finance-Einstellungen (Migration 87, v145). Die Wertebereiche hier und die Prüfregeln
// `fin_einst_*` der Datenbank müssen übereinstimmen.
const v = finVorgabe(2026, "2026-10-13");

describe("finVorgabe", () => {
  it("EÜR, SKR03, Regelbesteuerung, Soll, monatlich, Kalenderjahr, ab heute", () => {
    expect(v).toMatchObject({
      wirtschaftsjahr: 2026, rechtsform: "einzel", gewinnermittlung: "euer", kontenrahmen: "skr03",
      besteuerung: "regel", versteuerung: "soll", voranmeldung: "monat", dauerfrist: false,
      wj_beginn_monat: 1, start_datum: "2026-10-13",
    });
    expect(finMaengel(v)).toEqual([]);
  });
});

describe("finMaengel", () => {
  it("Dauerfrist ohne Voranmeldung", () => {
    expect(finMaengel({ ...v, voranmeldung: "keine", dauerfrist: true })).toHaveLength(1);
  });
  it("UG und GmbH müssen bilanzieren", () => {
    expect(finMaengel({ ...v, rechtsform: "gmbh" })[0]).toMatch(/bilanzieren/);
    expect(finMaengel({ ...v, rechtsform: "ug", gewinnermittlung: "bilanz" })).toEqual([]);
  });
  it("Monat und Starttag", () => {
    expect(finMaengel({ ...v, wj_beginn_monat: 13 })).toHaveLength(1);
    expect(finMaengel({ ...v, start_datum: "" })).toHaveLength(1);
  });
});

describe("finFeldAktiv", () => {
  it("Kleinunternehmer: Soll/Ist, Zeitraum und Dauerfrist ruhen", () => {
    const ku = { ...v, besteuerung: "klein" as const };
    expect(finFeldAktiv(ku, "versteuerung")).toBe(false);
    expect(finFeldAktiv(ku, "voranmeldung")).toBe(false);
    expect(finFeldAktiv(ku, "dauerfrist")).toBe(false);
  });
  it("Befreit: keine Dauerfrist", () => {
    expect(finFeldAktiv({ ...v, voranmeldung: "keine" }, "dauerfrist")).toBe(false);
    expect(finFeldAktiv(v, "dauerfrist")).toBe(true);
  });
});

describe("finKurztext", () => {
  it("Regelbesteuerung", () => {
    expect(finKurztext({ ...v, dauerfrist: true })).toBe("EÜR · SKR03 · Regelbesteuerung, Soll, monatlich mit Dauerfrist");
  });
  it("Kleinunternehmer", () => {
    expect(finKurztext({ ...v, gewinnermittlung: "bilanz", kontenrahmen: "skr04", besteuerung: "klein" })).toBe("Bilanz · SKR04 · Kleinunternehmer § 19");
  });
});

describe("Wertebereiche wie in Migration 87", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "87_finance_grundlagen.sql"), "utf8");
  const pruef = (name: string) => {
    const m = sql.match(new RegExp(`constraint ${name}\\s+check \\(\\w+ in \\(([^)]*)\\)\\)`));
    return (m?.[1] ?? "").split(",").map((x) => x.trim().replace(/'/g, "")).sort();
  };
  const werte = (l: { wert: string }[]) => l.map((x) => x.wert).sort();
  it.each([
    ["fin_einst_rechtsform", FIN_RECHTSFORMEN], ["fin_einst_gewinn", FIN_GEWINNERMITTLUNG], ["fin_einst_konten", FIN_KONTENRAHMEN],
    ["fin_einst_besteuerung", FIN_BESTEUERUNG], ["fin_einst_versteuerung", FIN_VERSTEUERUNG], ["fin_einst_voranmeldung", FIN_VORANMELDUNG],
  ] as const)("%s", (name, liste) => {
    expect(pruef(name)).toEqual(werte(liste));
  });
});

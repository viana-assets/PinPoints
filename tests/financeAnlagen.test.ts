import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_DEGRESSIV_HOECHSTSATZ, FIN_E_FAHRZEUG_SAETZE, FIN_GWG_GRENZE, FIN_SAMMELPOSTEN, FIN_SONDER_AFA_ZEITRAUM,
  afaBis, afaLaufVorschau, afaPlan, anlageMaengel, artVorschlag, buchwertEnde, degressivSatz, type FinAnlage,
} from "@/lib/finance/anlagen";

// Finance F7 (Migration 95, v153). Die Erwartungswerte sind die, die `fin_afa_bis()` in pgtest/t95.sql liefert –
// so bleiben Datenbank und Vorschau gleich.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "95_finance_anlagen.sql"), "utf8");
const t = (j: number, m: number) => j * 12 + m - 1;
const a = (p: Partial<FinAnlage>): FinAnlage => ({
  id: "a", bezeichnung: "X", konto: 210, art: "linear", anschaffung: "2026-03-15", ak: 1200, monate: 36, satz: null, afa_konto: 4830,
  beleg_id: null, fahrzeug_id: null, abgang: null, abgang_buchung_id: null, notiz: null, erstellt_am: "x", ...p,
});

describe("Abschreibung bis Monat – wie die Datenbank", () => {
  it("linear 1.200 € / 36 Monate ab 15.03.2026", () => {
    const x = a({});
    expect([t(2026, 12), t(2027, 12), t(2028, 12), t(2029, 12), t(2026, 6)].map((m) => afaBis(x, m))).toEqual([333.33, 733.33, 1133.33, 1200, 133.33]);
  });
  it("degressiv 10.000 € / 120 Monate, 30 %, ab 10.08.2025", () => {
    const x = a({ art: "degressiv", ak: 10000, monate: 120, satz: 30, anschaffung: "2025-08-10" });
    expect([t(2025, 12), t(2026, 12), t(2030, 12), t(2035, 12), t(2026, 6)].map((m) => afaBis(x, m))).toEqual([1250, 3875, 8529.39, 10000, 2562.5]);
  });
  it("degressiv 5.000 € / 60 Monate mit Wechsel zu linear", () => {
    const x = a({ art: "degressiv", ak: 5000, monate: 60, satz: 30, anschaffung: "2026-01-01" });
    expect([2026, 2027, 2028, 2029, 2030].map((j) => afaBis(x, t(j, 12)))).toEqual([1500, 2550, 3366.67, 4183.34, 5000]);
    expect(afaPlan(x).map((z) => z.afa)).toEqual([1500, 1050, 816.67, 816.67, 816.66]);
  });
  it("GWG, Sammelposten, E-Fahrzeug, Abgang", () => {
    expect([afaBis(a({ art: "gwg", ak: 700, monate: null, anschaffung: "2026-05-01" }), t(2026, 4)), afaBis(a({ art: "gwg", ak: 700, monate: null, anschaffung: "2026-05-01" }), t(2026, 5))]).toEqual([0, 700]);
    const sp = a({ art: "sammelposten", ak: 600, monate: null, anschaffung: "2026-02-01" });
    expect([afaBis(sp, t(2026, 12)), afaBis(sp, t(2030, 12)), afaBis({ ...sp, abgang: "2026-06-01" }, t(2027, 12)), afaBis(sp, t(2026, 6))]).toEqual([120, 600, 240, 60]);
    const ef = a({ art: "e_fahrzeug", ak: 40000, monate: null, anschaffung: "2026-03-01" });
    expect([afaBis(ef, t(2026, 12)), afaBis(ef, t(2027, 12)), afaBis(ef, t(2031, 12)), afaBis(ef, t(2026, 6))]).toEqual([30000, 34000, 40000, 12000]);
    const ab = a({ abgang: "2027-06-20" });
    expect([afaBis(ab, t(2027, 12)), afaBis(ab, t(2029, 12)), buchwertEnde(ab, t(2029, 12))]).toEqual([533.33, 533.33, 666.67]);
    expect(afaPlan(ab).map((z) => z.jahr)).toEqual([2026, 2027]);
  });
});

describe("Regeln wie fin_anlage_speichern()", () => {
  const ohne = { sammelposten: false }, mit = { sammelposten: true };
  const f = (p: Partial<Parameters<typeof anlageMaengel>[0]>, e: { sammelposten: boolean } | null = ohne) =>
    anlageMaengel({ bezeichnung: "X", art: "linear", anschaffung: "2026-03-01", ak: 1200, monate: 36, ...p } as Parameters<typeof anlageMaengel>[0], e, "2026-10-14");
  it("Grenzen und Zeitraum", () => {
    expect(f({})).toEqual([]);
    expect(f({ art: "gwg", ak: 801 })).toEqual(["Sofort abschreiben lassen sich Güter bis 800 € (netto)."]);
    expect(f({ art: "degressiv", anschaffung: "2025-06-30" })[0]).toMatch(/01\.07\.2025 bis 31\.12\.2027/);
    expect(f({ art: "linear", monate: null })).toEqual(["Die Nutzungsdauer fehlt (1 bis 50 Jahre)."]);
    expect(f({ anschaffung: "2026-11-01" })).toEqual(["Das Anschaffungsdatum liegt in der Zukunft."]);
    expect(f({}, null)).toEqual(["Für das Anschaffungsjahr sind die Finance-Einstellungen noch nicht gespeichert."]);
  });
  it("Sammelposten: nur mit Wahl, dann für alles über 250 € bis 1.000 €", () => {
    expect(f({ art: "sammelposten", ak: 600, monate: null })).toEqual(["Der Sammelposten ist für dieses Jahr nicht gewählt (Finance › Einstellungen)."]);
    expect(f({ art: "gwg", ak: 600, monate: null }, mit)[0]).toMatch(/Sammelposten gewählt/);
    expect(f({ art: "sammelposten", ak: 600, monate: null }, mit)).toEqual([]);
    expect(f({ art: "gwg", ak: 200, monate: null }, mit)).toEqual([]);
    expect([artVorschlag(600, mit), artVorschlag(600, ohne), artVorschlag(1500, ohne), artVorschlag(200, mit)]).toEqual(["sammelposten", "gwg", "linear", "gwg"]);
  });
  it("Zahlen wie in Migration 95", () => {
    expect(degressivSatz(120)).toBe(30);
    expect(degressivSatz(240)).toBe(15);
    expect(MIG).toContain(`v_ak > ${FIN_GWG_GRENZE}`);
    expect(MIG).toContain(`v_ak <= ${FIN_SAMMELPOSTEN.von} or v_ak > ${FIN_SAMMELPOSTEN.bis}`);
    expect(MIG).toContain(`date '${FIN_SONDER_AFA_ZEITRAUM.von}'`);
    expect(MIG).toContain(`date '${FIN_SONDER_AFA_ZEITRAUM.bis}'`);
    expect(MIG).toContain(`least(round(3 * 1200.0 / v_monate, 2), ${FIN_DEGRESSIV_HOECHSTSATZ})`);
    expect(MIG).toContain(`array[${FIN_E_FAHRZEUG_SAETZE.join(", ")}]`);
  });
});

describe("Vorschau eines Abschreibungslaufs", () => {
  it("fällig minus gebucht, nur angeschaffte", () => {
    const l = [a({ id: "m" }), a({ id: "n", anschaffung: "2026-11-01" }), a({ id: "g", art: "gwg", ak: 700, monate: null, anschaffung: "2026-05-01" })];
    expect(afaLaufVorschau(l, { g: 700 }, 2026, 10).map((x) => [x.anlage.id, x.betrag])).toEqual([["m", 266.67]]);
    expect(afaLaufVorschau(l, { m: 300 }, 2026, 8).map((x) => [x.anlage.id, x.betrag])).toEqual([["m", -100], ["g", 700]]);
  });
});

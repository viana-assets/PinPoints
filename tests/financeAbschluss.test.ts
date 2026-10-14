import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_ABSCHLUSS_KONTEN, FIN_BILANZ_BEREICHE, FIN_GUV_AUFWAND, abschlussSchritte, anlagenspiegel, bilanz, guv, vortragAktuell, vortragLesen,
} from "@/lib/finance/abschluss";
import type { FinKonto } from "@/lib/finance/buchung";
import type { FinSaldo } from "@/lib/finance/auswertungen";
import type { FinAnlage } from "@/lib/finance/anlagen";

// Finance F8 (Migration 96, v154). Die Konten kommen aus den Migrationen; der Fall ist derselbe wie in pgtest/t96.sql
// (Jahr 2025: Anfangsbestand 5.000, Rechnung 1.190, Reifen 595, Miete 800, Barverkauf 119, Entnahme 300,
// Rückstellung 500, aktive Abgrenzung 200, passive Abgrenzung 100) – die Datenbank trägt Kapital 4.100 H vor.
const M = (d: string) => readFileSync(join(__dirname, "..", "supabase", "migrations", d), "utf8");
const SQL = ["88_finance_buchungen.sql", "93_finance_luecken.sql", "95_finance_anlagen.sql", "96_finance_abschluss.sql"].map(M).join("\n");
const MIG96 = M("96_finance_abschluss.sql");
const alle = [...SQL.matchAll(/\('(skr0[34])', (\d+), '((?:[^']|'')*)', '(\w+)'\)/g)].map((m) => ({ kontenrahmen: m[1], nummer: Number(m[2]), bezeichnung: m[3], kategorie: m[4], eigen: false, aktiv: true })) as FinKonto[];
const K03 = alle.filter((k) => k.kontenrahmen === "skr03");

// Salden 2025 wie in t96.sql (Soll/Haben je Konto, alles im jeweiligen Monat)
const s = (konto: number, monat: number, soll: number, haben: number): FinSaldo => ({ konto, monat, soll, haben });
const SALDEN: FinSaldo[] = [
  s(1200, 1, 5000, 0), s(9000, 1, 5000, 5000), s(880, 1, 0, 5000),
  s(1400, 3, 1190, 0), s(8400, 3, 0, 1000), s(1776, 3, 0, 190),
  s(3400, 4, 500, 0), s(1576, 4, 95, 0), s(1600, 4, 0, 595),
  s(4210, 5, 800, 0), s(1200, 5, 0, 800),
  s(1000, 6, 119, 0), s(8400, 6, 0, 100), s(1776, 6, 0, 19),
  s(1800, 7, 300, 0), s(1200, 7, 0, 300),
  s(4950, 12, 500, 0), s(970, 12, 0, 500), s(980, 12, 200, 0), s(4210, 12, 0, 200), s(8400, 12, 100, 0), s(990, 12, 0, 100),
];

describe("Konten wie in Migration 96", () => {
  it("feste Konten stimmen mit fin_abschluss_konto() überein und existieren", () => {
    for (const [was, k] of [["rueckstellung", "rueckstellung"], ["rap_aktiv", "rap_aktiv"], ["rap_passiv", "rap_passiv"], ["gewinnvortrag", "gewinnvortrag"], ["kapital", "kapital"], ["ust_vorjahr", "ust_vorjahr"]] as const) {
      const m = MIG96.match(new RegExp(`when '${was}'\\s+then case p_rahmen when 'skr03' then (\\d+) else (\\d+) end`));
      expect(m, was).not.toBeNull();
      expect([Number(m![1]), Number(m![2])], was).toEqual([FIN_ABSCHLUSS_KONTEN.skr03[k], FIN_ABSCHLUSS_KONTEN.skr04[k]]);
      for (const r of ["skr03", "skr04"] as const) expect(alle.some((x) => x.kontenrahmen === r && x.nummer === FIN_ABSCHLUSS_KONTEN[r][k]), `${r} ${k}`).toBe(true);
    }
  });
  it("Rückstellungen und Abgrenzungen liegen in ihren Bilanzbereichen", () => {
    for (const r of ["skr03", "skr04"] as const) {
      const in_ = (n: number, b: [number, number][]) => b.some(([v, x]) => n >= v && n <= x);
      expect(in_(FIN_ABSCHLUSS_KONTEN[r].rueckstellung, FIN_BILANZ_BEREICHE.rueckstellungen[r])).toBe(true);
      expect(in_(FIN_ABSCHLUSS_KONTEN[r].rap_aktiv, FIN_BILANZ_BEREICHE.rapAktiv[r])).toBe(true);
      expect(in_(FIN_ABSCHLUSS_KONTEN[r].rap_passiv, FIN_BILANZ_BEREICHE.rapPassiv[r])).toBe(true);
    }
  });
  it("Quellen abschluss und vortrag sind erlaubt", () => {
    expect(MIG96).toMatch(/'abschluss', 'vortrag'\)\)/);
  });
  it("GuV: jedes Aufwandskonto fällt in höchstens einen Posten; Kfz-Steuer und AfA richtig", () => {
    for (const r of ["skr03", "skr04"] as const) {
      for (const k of alle.filter((x) => x.kontenrahmen === r && x.kategorie === "aufwand")) {
        expect(FIN_GUV_AUFWAND.filter((d) => d.bereiche[r].some(([v, b]) => k.nummer >= v && k.nummer <= b)).length, `${r} ${k.nummer}`).toBeLessThanOrEqual(1);
      }
    }
    const nr = (n: number) => FIN_GUV_AUFWAND.find((d) => d.bereiche.skr03.some(([v, b]) => n >= v && n <= b))?.nr ?? "8";
    expect([3400, 4110, 4830, 4855, 4862, 4510, 4530, 2310, 4950].map(nr)).toEqual(["5", "6", "7", "7", "7", "16", "8", "8", "8"]);
  });
});

describe("GuV und Bilanz", () => {
  it("GuV 2025: Erlöse 1.000, Aufwand 1.600, Fehlbetrag 600", () => {
    const g = guv(SALDEN, K03, "skr03", 12);
    const z = Object.fromEntries(g.zeilen.map((x) => [x.text, x.betrag]));
    expect(z["Umsatzerlöse"]).toBe(1000);
    expect(z["Materialaufwand"]).toBe(-500);
    expect(z["Sonstige betriebliche Aufwendungen"]).toBe(-1100);
    expect(z["Rohergebnis"]).toBe(500);
    expect(g.jahresergebnis).toBe(-600);
    expect(g.zeilen[g.zeilen.length - 1].text).toBe("Jahresfehlbetrag");
    // bis November: ohne Abschlussbuchungen
    expect(guv(SALDEN, K03, "skr03", 11).jahresergebnis).toBe(-200);
  });
  it("Bilanz 31.12.2025 Einzelunternehmen: Summen gleich, Eigenkapital 4.100", () => {
    const b = bilanz(SALDEN, K03, "skr03", "einzel", 12);
    expect(b.summeAktiva).toBe(b.summePassiva);
    expect(b.summeAktiva).toBe(5504);
    const pos = (seite: typeof b.aktiva) => Object.fromEntries(seite.flatMap((g) => [[g.titel, g.summe], ...g.zeilen.map((x) => [x.text, x.betrag])]));
    const a = pos(b.aktiva), p = pos(b.passiva);
    expect(a["Kassenbestand, Guthaben bei Kreditinstituten"]).toBe(4019);
    expect(a["Forderungen aus Lieferungen und Leistungen"]).toBe(1190);
    expect(a["Sonstige Vermögensgegenstände"]).toBe(95);
    expect(a["C. Rechnungsabgrenzungsposten"]).toBe(200);
    expect(p["A. Eigenkapital"]).toBe(4100);
    expect(p["Privatentnahmen und -einlagen"]).toBe(-300);
    expect(p["Verlust"]).toBe(-600);
    expect(p["B. Rückstellungen"]).toBe(500);
    expect(p["Verbindlichkeiten aus Lieferungen und Leistungen"]).toBe(595);
    expect(p["Sonstige Verbindlichkeiten"]).toBe(209);
    expect(p["D. Rechnungsabgrenzungsposten"]).toBe(100);
    expect(b.vortragOffen).toBe(0);
  });
  it("Bilanz GmbH: Jahresfehlbetrag; Bank im Minus bei den Verbindlichkeiten; 9000 offen zeigt sich", () => {
    const b = bilanz([...SALDEN, s(1200, 8, 0, 5000), s(4900, 8, 5000, 0), s(9000, 2, 10, 0), s(1000, 2, 0, 10)], K03, "skr03", "gmbh", 12);
    expect(b.summeAktiva).toBe(b.summePassiva);
    expect(b.passiva.flatMap((g) => g.zeilen).find((z) => z.text === "Verbindlichkeiten gegenüber Kreditinstituten")?.betrag).toBe(1100);
    expect(b.passiva[0].zeilen.some((z) => z.text === "Jahresfehlbetrag")).toBe(true);
    expect(b.vortragOffen).toBe(10);
  });
});

describe("Saldenvortrag", () => {
  const roh = {
    eingerichtet: true, folgejahr: true, folgejahr_rahmen: "skr03", von_hand: 0,
    zeilen: [{ konto: 1200, betrag: "3900.00" }, { konto: 880, betrag: "-4100.00" }],
    gebucht: { nr: 1, datum: "2026-01-01", zeilen: [{ konto: 880, betrag: "-4100.00" }, { konto: 1200, betrag: "3900.00" }] },
  };
  it("liest die Vorschau und erkennt, ob der Vortrag noch stimmt", () => {
    const v = vortragLesen(roh);
    expect(v.eingerichtet && v.zeilen[0]).toEqual({ konto: 1200, betrag: 3900 });
    expect(v.eingerichtet && v.gebucht && vortragAktuell(v.zeilen, v.gebucht.zeilen)).toBe(true);
    expect(vortragAktuell([{ konto: 1200, betrag: 3900 }], [{ konto: 1200, betrag: 3800 }])).toBe(false);
    expect(vortragAktuell([{ konto: 1200, betrag: 3900 }], [{ konto: 1200, betrag: 3900 }, { konto: 1000, betrag: 0 }])).toBe(true);
    expect(vortragLesen({ eingerichtet: false })).toEqual({ eingerichtet: false });
  });
  it("Schritte zum Abschluss", () => {
    const v = vortragLesen({ ...roh, gebucht: null });
    const x = abschlussSchritte({ jahr: 2025, festgeschrieben: 12, afaOffen: 0, vortragOffen: 0, bilanz: true, abschlussposten: 3, vortrag: v });
    expect(x.map((y) => [y.key, y.erledigt])).toEqual([["afa", true], ["eb", true], ["abschluss", true], ["fest", true], ["vortrag", false]]);
    expect(abschlussSchritte({ jahr: 2025, festgeschrieben: 3, afaOffen: 12.5, vortragOffen: 10, bilanz: false, abschlussposten: 0, vortrag: vortragLesen(roh) })
      .map((y) => y.erledigt)).toEqual([false, false, false, true]);
  });
});

describe("Anlagenspiegel", () => {
  const a = (p: Partial<FinAnlage>): FinAnlage => ({
    id: "a", bezeichnung: "X", konto: 210, art: "linear", anschaffung: "2025-01-01", ak: 1200, monate: 12, satz: null, afa_konto: 4830,
    beleg_id: null, fahrzeug_id: null, abgang: null, abgang_buchung_id: null, notiz: null, erstellt_am: "x", ...p,
  });
  it("Bestand, Zugang, Abgang je Konto", () => {
    const sp = anlagenspiegel([
      a({ id: "1", konto: 210, ak: 2400, monate: 24, anschaffung: "2025-01-01" }),
      a({ id: "2", konto: 210, ak: 1200, monate: 12, anschaffung: "2026-07-01" }),
      a({ id: "3", konto: 210, ak: 3600, monate: 36, anschaffung: "2025-01-01", abgang: "2026-06-15" }),
      a({ id: "4", konto: 400, art: "gwg", ak: 500, monate: null, anschaffung: "2026-02-01" }),
      a({ id: "5", konto: 400, ak: 900, monate: 12, anschaffung: "2020-01-01", abgang: "2024-05-01" }),
    ], 2026);
    expect(sp.zeilen.map((z) => z.konto)).toEqual([210, 400]);
    const k = sp.zeilen[0];
    expect([k.akBeginn, k.zugang, k.abgang, k.akEnde]).toEqual([6000, 1200, 3600, 3600]);
    expect([k.afaBeginn, k.afaJahr, k.afaAbgang, k.afaEnde]).toEqual([2400, 2400, 1800, 3000]);
    expect([k.buchwertVorjahr, k.buchwertEnde]).toEqual([3600, 600]);
    expect(sp.zeilen[1]).toMatchObject({ zugang: 500, afaJahr: 500, buchwertEnde: 0 });
    expect(sp.summe.buchwertEnde).toBe(600);
  });
  it("Sammelposten scheidet nach fünf Jahren aus", () => {
    const x = a({ art: "sammelposten", ak: 600, monate: null, anschaffung: "2021-03-01", konto: 485 });
    expect(anlagenspiegel([x], 2025).zeilen[0]).toMatchObject({ akBeginn: 600, abgang: 600, afaJahr: 120, akEnde: 0, buchwertEnde: 0 });
    expect(anlagenspiegel([x], 2026).zeilen).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planAlsSalden, planEingabe, planIst, planMonate, planVerteilen, type FinPlanWert } from "@/lib/finance/plan";
import { cockpit, naechsteUst } from "@/lib/finance/cockpit";
import { FIN_OP_STUFEN, opAnalyse, opPosten, opStufe, tageUeber } from "@/lib/finance/opanalyse";
import { lueckenText, pruefPunkte, pruefungLesen } from "@/lib/finance/pruefung";
import { ustKontenAbstimmung, zmMeldung, type FinUstStand } from "@/lib/finance/steuern";
import { bwa, type FinSaldo } from "@/lib/finance/auswertungen";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinRechnungZeile } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";

// Stufen G und H (Migrationen 115, 116, v186): Plan/Ist, Cockpit, OP-Analyse, Prüfliste, Abstimmung und ZM. Daten erfunden.
const MIG116 = readFileSync(join(__dirname, "..", "supabase", "migrations", "116_finance_pruefung.sql"), "utf8");
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1000, "Kasse", "geld"), k(1200, "Bank", "geld"), k(1400, "Forderungen", "forderung"), k(1600, "Verbindlichkeiten", "verbindlichkeit"),
  k(3200, "Wareneingang", "aufwand"), k(4210, "Miete", "aufwand"), k(8400, "Erlöse 19 %", "erloes"), k(1776, "USt 19", "steuer")];
const SALDEN: FinSaldo[] = [
  { konto: 8400, monat: 9, soll: 0, haben: 1000 }, { konto: 8400, monat: 10, soll: 0, haben: 2000 },
  { konto: 4210, monat: 10, soll: 500, haben: 0 }, { konto: 3200, monat: 10, soll: 400, haben: 0 },
  { konto: 1200, monat: 10, soll: 2500, haben: 900 }, { konto: 1400, monat: 10, soll: 1190, haben: 0 }, { konto: 1600, monat: 10, soll: 0, haben: 476 },
];
const PLAN: FinPlanWert[] = [{ konto: 8400, monat: 9, betrag: 1500 }, { konto: 8400, monat: 10, betrag: 1500 }, { konto: 4210, monat: 10, betrag: 500 }, { konto: 1200, monat: 1, betrag: 9 }];

describe("Plan und Ist", () => {
  it("Plan läuft als Salden durch die BWA", () => {
    const s = planAlsSalden(PLAN, KONTEN);
    expect(s).toEqual([{ konto: 8400, monat: 9, soll: 0, haben: 1500 }, { konto: 8400, monat: 10, soll: 0, haben: 1500 }, { konto: 4210, monat: 10, soll: 500, haben: 0 }]);
    expect(bwa(s, KONTEN, "skr03", 10).kumuliert).toMatchObject({ umsatz: 3000, ergebnis: 2500 });
  });

  it("je Konto: Abweichung, Prozent, gut oder schlecht", () => {
    const z = planIst(SALDEN, PLAN, KONTEN, 1, 10);
    expect(z.map((x) => [x.konto, x.plan, x.ist, x.abweichung, x.prozent, x.gut])).toEqual([
      [8400, 3000, 3000, 0, 0, true], [3200, 0, 400, 400, null, false], [4210, 500, 500, 0, 0, true],
    ]);
    expect(planIst(SALDEN, PLAN, KONTEN, 10, 10).find((x) => x.konto === 8400)).toMatchObject({ plan: 1500, ist: 2000, abweichung: 500, prozent: 33.3, gut: true });
    expect(planMonate(PLAN, 8400)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1500, 1500, 0, 0]);
  });

  it("Eingabe und Verteilen", () => {
    expect(planEingabe(["1.200,50", "", "3", ...Array(9).fill("")])).toEqual([1200.5, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(planEingabe(["x", ...Array(11).fill("")])).toBe("Der Wert im Monat 1 ist keine Zahl.");
    expect(planEingabe(["1"])).toBe("Es braucht genau zwölf Monatswerte.");
    const v = planVerteilen(1000);
    expect(v.slice(0, 11).every((x) => x === 83.33)).toBe(true);
    expect(v[11]).toBe(83.37);
    expect(Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100).toBe(1000);
  });
});

describe("Cockpit", () => {
  it("Kacheln aus Salden und Plan", () => {
    expect(cockpit(SALDEN, KONTEN, "skr03", 10, PLAN)).toEqual({
      umsatzMonat: 2000, umsatzJahr: 3000, rohertrag: 2600, ergebnis: 2100, planErgebnis: 2500, planUmsatz: 3000,
      geld: 1600, forderungen: 1190, verbindlichkeiten: 476,
    });
    expect(cockpit(SALDEN, KONTEN, "skr03", 9).planErgebnis).toBeNull();
  });

  it("nächste Voranmeldung: die früheste offene Frist", () => {
    const e = { ...finVorgabe(2026, "2026-01-01"), dauerfrist: false };
    const z = (zeitraum: string, von: string, bis: string, b: number) => ({ zeitraum, von, bis, kennzahlen: { "81": { b, s: b * 0.19 } }, abgaben: [] });
    const stand: FinUstStand = { eingerichtet: true, umsatz_vorjahr: null, sondervorauszahlung: null, umsatz_jahr: 0,
      zeitraeume: [z("M08", "2026-08-01", "2026-08-31", 1000), z("M09", "2026-09-01", "2026-09-30", 2000), z("M10", "2026-10-01", "2026-10-31", 50)] };
    stand.zeitraeume[0].abgaben = [{ fassung: 1, abgegeben_am: "2026-09-10", kennzahlen: stand.zeitraeume[0].kennzahlen, notiz: null, erstellt_am: "2026-09-10" }];
    expect(naechsteUst(stand, e, "2026-10-14", 2026)).toEqual({ text: "September 2026", frist: "2026-10-12", betrag: 380, ueberfaellig: true });
    expect(naechsteUst({ eingerichtet: false }, e, "2026-10-14", 2026)).toBeNull();
  });
});

describe("Offene Posten nach Fälligkeit", () => {
  const r = (p: Partial<FinRechnungZeile>): FinRechnungZeile => ({
    rechnung_id: "r1", nummer_text: "RE-1", datum: "2026-07-01", brutto: 119, order_id: null, order_number: null, kunde: "Muster GmbH",
    storniert: false, storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-07-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1, ...p,
  });
  const b = (p: Partial<FinBeleg>): FinBeleg => ({
    id: "b1", lieferant_id: "l1", belegdatum: "2026-10-01", belegnummer: "LR-1", text: null, faellig_am: "2026-10-20", posten: [], datei_pfad: null, datei_typ: null,
    datei_name: null, status: "gebucht", brutto: 50, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01T00:00:00Z", ...p,
  });
  const L: FinLieferant[] = [{ id: "l1", name: "Reifen Nord", ust_id: null, konto: null, steuer: null, aktiv: true }];

  it("Stufen wie in der Kanzlei", () => {
    expect(FIN_OP_STUFEN.map((s) => s.text)).toEqual(["nicht fällig", "1–30 Tage", "31–60 Tage", "61–90 Tage", "über 90 Tage"]);
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(opStufe)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(tageUeber("2026-09-30", "2026-10-14")).toBe(14);
  });

  it("Forderungen und Verbindlichkeiten gestaffelt, je Person summiert", () => {
    const p = opPosten([
      r({}), r({ rechnung_id: "r2", nummer_text: "RE-2", faellig_am: "2026-10-01", brutto: 238, teilbezahlt: 38 }),
      r({ rechnung_id: "r3", bezahlt_am: "2026-08-01" }), r({ rechnung_id: "r4", storniert: true }), r({ rechnung_id: "r5", status: "fehler" }),
    ], [b({}), b({ id: "b2", bezahlt_am: "2026-10-05" })], L, "2026-10-14");
    expect(p.map((x) => [x.nummer, x.tage, x.rest])).toEqual([["RE-1", 91, 119], ["RE-2", 13, 200], ["LR-1", -6, 50]]);
    const a = opAnalyse(p);
    expect(a.stufen.map((s) => [s.forderung, s.verbindlichkeit])).toEqual([[0, 50], [200, 0], [0, 0], [0, 0], [119, 0]]);
    expect(a.summe).toEqual({ forderung: 319, verbindlichkeit: 50 });
    expect(a.personen[0]).toEqual({ art: "forderung", name: "Muster GmbH", rest: 319, ueberfaellig: 319, tage: 91, anzahl: 2 });
    expect(a.personen[1]).toMatchObject({ art: "verbindlichkeit", name: "Reifen Nord", ueberfaellig: 0 });
  });
});

describe("Prüfliste", () => {
  const roh = {
    eingerichtet: true, luecken_buchungen: [2], luecken_rechnungen: [3, 4, 5, 9], ohne_beleg_zahl: 1,
    ohne_beleg: [{ id: "x", nr: 7, datum: "2026-10-27", text: "Porto", betrag: "5.00" }], ohne_personenkonto: 0,
    bank_offen: { zahl: 1, summe: "-20.00", aeltester: "2026-09-01" }, entwuerfe_alt: 0, monate_offen: [3, 4],
  };
  it("lesen und Lücken zusammenfassen", () => {
    const p = pruefungLesen(roh);
    expect(p.ohne_beleg[0]).toEqual({ id: "x", nr: 7, datum: "2026-10-27", text: "Porto", betrag: 5 });
    expect(p.bank_offen).toEqual({ zahl: 1, summe: -20, aeltester: "2026-09-01" });
    expect(lueckenText([3, 4, 5, 9, 11, 12])).toBe("3–5, 9, 11–12");
    expect(pruefungLesen(null)).toMatchObject({ eingerichtet: false, luecken_buchungen: [], monate_offen: [] });
  });
  it("Punkte mit Ziel; Zusatzpunkte nur mit Recht", () => {
    const p = pruefPunkte(pruefungLesen(roh), { rechnungenUngebucht: 0, kasseNegativ: null, zahlauftraegeOffen: 2, ustOffen: null });
    expect(p.map((x) => [x.key, x.ok])).toEqual([
      ["nummern", false], ["rechnungskreis", false], ["rechnungen", true], ["beleg", false], ["personen", true], ["bank", false], ["entwuerfe", true], ["fest", false], ["zahlungen", false],
    ]);
    expect(p[0].hinweis).toContain("Nr. 2");
    expect(p[1].hinweis).toContain("3–5, 9");
    expect(p.find((x) => x.key === "fest")!.hinweis).toContain("März, April");
    expect(p.find((x) => x.key === "bank")!.hinweis).toContain("01.09.2026");
  });
  it("die Felder, die die App liest, liefert fin_pruefung", () => {
    for (const f of Object.keys(roh)) expect(MIG116).toContain(`'${f}'`);
  });
});

describe("Abstimmung Konto ↔ Kennzahl und ZM", () => {
  const S: FinSteuerschluessel[] = [
    { kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "USt 19", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null },
    { kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "VSt 19", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 },
  ];
  const zeile = (seite: "S" | "H", konto: number, betrag: number, extra: object = {}) => ({ posten: 1, seite, konto, betrag, steuerschluessel: null, ist_steuer: false, ...extra });
  const buchung = (p: Partial<FinBuchung>): FinBuchung => ({ id: "x", jahr: 2026, nr: 1, datum: "2026-09-10", text: "t", beleg: null, quelle: "manuell", quelle_id: null,
    storno_von: null, storniert_durch: null, grund: null, erstellt_am: "", fin_buchungszeilen: [], ...p });
  it("Steuerkonten im Zeitraum, Haben minus Soll", () => {
    const b = [
      buchung({ fin_buchungszeilen: [zeile("S", 1200, 119), zeile("H", 8400, 100), zeile("H", 1776, 19, { ist_steuer: true })] }),
      buchung({ nr: 2, fin_buchungszeilen: [zeile("S", 4210, 50), zeile("S", 1576, 9.5, { ist_steuer: true }), zeile("H", 1200, 59.5)] }),
      buchung({ nr: 3, datum: "2026-10-02", fin_buchungszeilen: [zeile("H", 1776, 1000)] }),
    ];
    expect(ustKontenAbstimmung(b, S, "2026-09-01", "2026-09-30")).toEqual({ konten: [{ konto: 1576, saldo: -9.5 }, { konto: 1776, saldo: 19 }], summe: 9.5 });
  });
  it("ZM: igl je Quartal und Debitor, ohne Stornos", () => {
    const igl = (nr: number, datum: string, betrag: number, pk: number | null, extra: Partial<FinBuchung> = {}) => buchung({ nr, datum, text: `Lieferung ${nr}`, ...extra,
      fin_buchungszeilen: [zeile("S", 1400, betrag, { personenkonto: pk }), zeile("H", 8125, betrag, { steuerschluessel: "igl" })] });
    const zm = zmMeldung([igl(1, "2026-02-01", 100, 10001), igl(2, "2026-03-01", 50, 10001), igl(3, "2026-03-05", 70, null), igl(4, "2026-07-01", 30, 10002),
      igl(5, "2026-07-02", 99, 10002, { storniert_durch: "y" }), igl(6, "2025-12-31", 1, 10001, { jahr: 2025 })], 2026);
    expect(zm.quartale.map((q) => [q.quartal, q.summe, q.zeilen.map((z) => z.text)])).toEqual([
      [1, 220, ["Debitor 10001", "Nr. 3: Lieferung 3"]], [3, 30, ["Debitor 10002"]],
    ]);
  });
});

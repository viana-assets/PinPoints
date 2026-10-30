import { describe, expect, it } from "vitest";
import { betragLesen, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import { finVorgabe } from "@/lib/finance/einstellungen";
import {
  belegWeiter, datumAusEingabe, datumKurz, eingabeAlsZeile, stapelBuchungen, stapelPositionen, stapelReihenfolge, stapelSumme, stapelTeile, stapelZeilePruefen, type FinStapelZeile,
} from "@/lib/finance/stapel";

// Buchungsstapel (Migration 106, v180): Datum kurz, Beleg weiter, Prüfung wie fin_buchen(), Reihenfolge.
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(1576, "Vorsteuer", "steuer"), k(4530, "Kfz", "aufwand"), k(1400, "Forderungen", "forderung"), k(8400, "Erlöse", "erloes")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }];
const E = finVorgabe(2027, "2027-02-01");

describe("Datum kurz", () => {
  it("TTMM, TT.MM., mit Jahr; falsches Jahr und unmögliche Tage nicht", () => {
    expect(datumAusEingabe("1002", 2027)).toBe("2027-02-10");
    expect(datumAusEingabe("10.2", 2027)).toBe("2027-02-10");
    expect(datumAusEingabe(" 1.3. ", 2027)).toBe("2027-03-01");
    expect(datumAusEingabe("10.02.2027", 2027)).toBe("2027-02-10");
    expect(datumAusEingabe("10.2.27", 2027)).toBe("2027-02-10");
    expect(datumAusEingabe("10.02.2026", 2027)).toBeNull();
    expect(datumAusEingabe("3102", 2027)).toBeNull();
    expect(datumAusEingabe("2902", 2028)).toBe("2028-02-29");
    expect(datumAusEingabe("1302", 2027)).toBe("2027-02-13");
    expect(datumAusEingabe("0013", 2027)).toBeNull();
    expect(datumAusEingabe("abc", 2027)).toBeNull();
    expect(datumKurz("2027-02-10")).toBe("10.02.");
  });
  it("Beleg weiterzählen mit Stellen", () => {
    expect(belegWeiter("ER-0042")).toBe("ER-0043");
    expect(belegWeiter("RE-099")).toBe("RE-100");
    expect(belegWeiter("RE-999")).toBe("RE-1000");
    expect(belegWeiter("7")).toBe("8");
    expect(belegWeiter("Quittung")).toBe("Quittung");
  });
});

describe("Prüfen wie beim Buchen", () => {
  const z = { datum: "2027-02-10", soll: 4530, haben: 1200, betrag: 78.4, steuer: "vst19", text: "Tanken" };
  it("richtige Zeile: dieselben Zeilen wie fin_buchen()", () => {
    const p = stapelZeilePruefen(z, 2027, KONTEN, SCHL, E, []);
    expect(p.fehler).toBeNull();
    expect(p.zeilen.map((x) => [x.seite, x.konto, x.betrag])).toEqual([["S", 4530, 65.88], ["H", 1200, 78.4], ["S", 1576, 12.52]]);
  });
  it("Fehler: Konto fehlt, festgeschrieben, Jahr, Text", () => {
    expect(stapelZeilePruefen({ ...z, haben: 9999 }, 2027, KONTEN, SCHL, E, []).fehler).toMatch(/9999/);
    expect(stapelZeilePruefen(z, 2027, KONTEN, SCHL, E, [{ jahr: 2027, monat: 2, am: "x" }]).fehler).toBe("Der 02/2027 ist festgeschrieben.");
    expect(stapelZeilePruefen({ ...z, datum: "2026-12-31" }, 2027, KONTEN, SCHL, E, []).fehler).toMatch(/2027/);
    expect(stapelZeilePruefen({ ...z, text: " " }, 2027, KONTEN, SCHL, E, []).fehler).toMatch(/Buchungstext/);
  });
  it("Eingabe → Zeile oder das fehlende Feld", () => {
    const e = { datum: "1002", beleg: " ER-1 ", soll: 4530, haben: 1200, betrag: "78,40", steuer: "vst19", text: " Tanken " };
    expect(eingabeAlsZeile(e, 2027, betragLesen)).toEqual({ ok: true, zeile: { datum: "2027-02-10", beleg: "ER-1", soll: 4530, haben: 1200, betrag: 78.4, steuer: "vst19", text: "Tanken" } });
    expect(eingabeAlsZeile({ ...e, datum: "x" }, 2027, betragLesen)).toMatchObject({ ok: false, feld: "datum" });
    expect(eingabeAlsZeile({ ...e, haben: null }, 2027, betragLesen)).toMatchObject({ ok: false, feld: "haben" });
    expect(eingabeAlsZeile({ ...e, haben: 4530 }, 2027, betragLesen)).toMatchObject({ ok: false, feld: "haben" });
    expect(eingabeAlsZeile({ ...e, betrag: "0" }, 2027, betragLesen)).toMatchObject({ ok: false, feld: "betrag" });
    expect(eingabeAlsZeile({ ...e, text: "" }, 2027, betragLesen)).toMatchObject({ ok: false, feld: "text" });
    expect(eingabeAlsZeile({ ...e, beleg: "", steuer: "" }, 2027, betragLesen)).toMatchObject({ ok: true, zeile: { beleg: null, steuer: null } });
  });
  it("Reihenfolge wie beim Buchen: Datum, dann Erfassung; Summe", () => {
    const z0 = (id: string, datum: string, lfd: number, betrag: number): FinStapelZeile =>
      ({ id, stapel_id: "s", lfd, datum, beleg: null, text: id, soll: 4530, haben: 1200, betrag, steuer: null, buchung_id: null });
    const l = [z0("c", "2027-02-10", 3, 1.1), z0("a", "2027-02-10", 1, 2.2), z0("b", "2027-02-03", 2, 3.3)];
    expect(stapelReihenfolge(l).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(stapelSumme(l)).toBe(6.6);
  });
});

describe("Splitt im Stapel (Migration 109, v183)", () => {
  const z1 = (id: string, datum: string, lfd: number, teil_von: string | null = null): FinStapelZeile =>
    ({ id, stapel_id: "s", lfd, datum, beleg: null, text: "t", soll: 4530, haben: 1200, betrag: 1, steuer: null, buchung_id: null, teil_von });
  const l = [z1("k2", "2027-02-10", 1), z1("t2b", "2027-02-10", 5, "k2"), z1("k1", "2027-02-03", 2), z1("t2a", "2027-02-10", 3, "k2"), z1("k3", "2027-02-10", 4)];
  it("Teile gleich hinter ihrer Kopfzeile, in Erfassungsreihenfolge; Positionen 2.1, 2.2", () => {
    const g = stapelReihenfolge(l);
    expect(g.map((x) => x.id)).toEqual(["k1", "k2", "t2a", "t2b", "k3"]);
    expect([...stapelPositionen(g).values()]).toEqual(["1", "2", "2.1", "2.2", "3"]);
    expect(stapelBuchungen(l)).toBe(3);
    expect(stapelTeile(l, "k2").map((x) => x.id)).toEqual(["t2a", "t2b"]);
  });
});


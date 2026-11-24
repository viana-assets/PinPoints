import { describe, expect, it } from "vitest";
import type { Customer, Order, OrderArticle } from "@/lib/types";
import {
  abschlussMaengel, bezugText, ergebnisText, grundText, istReklamation, nummerAusSuche, REKLAMATION_GRUENDE, reklamationAuswertung,
  reklamationKandidaten, reklamationMaengel, reklamationSchaden, reklamationTitel, terminDauerMin, umsatzJeTerminstunde,
} from "@/lib/reklamation";
import { kennzahlen } from "@/lib/auswertung";

// Reklamationsauftrag (Migration 120, v193). Erfundene Daten.
const o = (id: string, extra: Partial<Order> = {}) => ({
  id, order_number: 100, customer_id: "c1", title: "T", description: null, status: "erledigt", order_date: "2026-11-10", time: "09:00", end_time: "10:00",
  techniker_notiz: null, firmenfahrzeug_id: null, completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  reopen_reason: null, rechnung_noetig: false, rechnung_erstellt_am: null, rechnung_erstellt_von: null, rechnung_nummer: null,
  laufkunde_name: null, laufkunde_telefon: null, laufkunde_ort: null, created_at: "", updated_at: "", deleted_at: null, ...extra,
}) as Order;
const pos = (order: string, menge: number, preis: number): OrderArticle =>
  ({ id: order + menge + preis, order_id: order, article_id: "a", quantity: menge, net_price: preis, vat_rate: 19, endpreis_netto: null, note: null, created_at: "", deleted_at: null }) as unknown as OrderArticle;
const bezug = (nr: number, techniker: { id: string; name: string }[] = []) => ({ nummer: nr, datum: "2026-10-01", leistungen: [], techniker });
const R = (id: string, extra: Partial<Order> = {}) => o(id, { art: "reklamation", reklamation_grund: "vibration", ...extra });

describe("Anlegen", () => {
  const leer = { kundeId: "c1", vonId: "x", grund: "vibration" as const, text: "", ohneBezug: "" };
  it("prüft wie die Datenbank", () => {
    expect(reklamationMaengel(leer)).toBeNull();
    expect(reklamationMaengel({ ...leer, kundeId: "" })).toMatch(/Kunden/);
    expect(reklamationMaengel({ ...leer, vonId: null })).toMatch(/ohne Bezugsauftrag/);
    expect(reklamationMaengel({ ...leer, vonId: null, ohneBezug: "  Arbeit vor der App " })).toBeNull();
    expect(reklamationMaengel({ ...leer, grund: "" })).toMatch(/Grund/);
    expect(reklamationMaengel({ ...leer, text: "x".repeat(1001) })).toMatch(/zu lang/);
  });
  it("Titel, Texte, Art", () => {
    expect(reklamationTitel("Muster GmbH")).toBe("Reklamation – Muster GmbH");
    expect(reklamationTitel(" ")).toBe("Reklamation");
    expect(grundText("radmutter")).toBe("Radmutter / Anzugsmoment");
    expect(ergebnisText(null)).toBe("offen");
    expect(istReklamation(R("r"))).toBe(true);
    expect(istReklamation(o("a"))).toBe(false);
    expect(istReklamation({ art: undefined })).toBe(false);
    expect(bezugText(R("r", { reklamation_bezug: bezug(441) }))).toBe("zu Auftrag #441 vom 1.10.2026");
    expect(bezugText(R("r"))).toBe("ohne Bezugsauftrag");
    expect(REKLAMATION_GRUENDE).toHaveLength(6);
  });
  it("liest Auftragsnummern aus der Suche", () => {
    expect(nummerAusSuche("441")).toBe(441);
    expect(nummerAusSuche(" #441 ")).toBe(441);
    expect(nummerAusSuche("T12")).toBe(-12);
    expect(nummerAusSuche("N-AB 123")).toBeNull();
    expect(nummerAusSuche("Muster")).toBeNull();
  });
  it("Kandidaten: nur erledigte, nicht gelöschte, neueste zuerst", () => {
    const liste = reklamationKandidaten([
      o("alt", { order_date: "2026-01-01", order_number: 5 }), o("offen", { status: "offen" }), o("weg", { deleted_at: "x" }),
      o("neu", { order_date: "2026-11-01", order_number: 9 }), o("neu2", { order_date: "2026-11-01", order_number: 12 }),
    ]);
    expect(liste.map((x) => x.id)).toEqual(["neu2", "neu", "alt"]);
  });
});

describe("Abschließen", () => {
  it("Ergebnis Pflicht, Rechnung nur bei „nicht berechtigt“", () => {
    expect(abschlussMaengel(null, false)).toMatch(/Ergebnis/);
    expect(abschlussMaengel("kulanz", false)).toBeNull();
    expect(abschlussMaengel("kulanz", true)).toMatch(/nicht berechtigt/);
    expect(abschlussMaengel("nicht_berechtigt", true)).toBeNull();
  });
});

describe("Schaden", () => {
  it("Dauer: von–bis, sonst Standarddauer", () => {
    expect(terminDauerMin({ time: "09:00", end_time: "10:30" }, 30)).toBe(90);
    expect(terminDauerMin({ time: "09:00", end_time: null }, 45)).toBe(45);
    expect(terminDauerMin({ time: null, end_time: null }, 30)).toBe(30);
  });
  it("Ø Umsatz je Terminstunde aus gewöhnlichen erledigten Aufträgen mit Uhrzeit", () => {
    const orders = [o("a"), o("b", { time: "11:00", end_time: "12:00" }), R("r"), o("t", { order_number: -3 }), o("ohne", { time: null }),
      o("alt", { order_date: "2025-01-01" }), o("offen", { status: "offen" })];
    const p = [pos("a", 1, 100), pos("b", 1, 50), pos("r", 1, 999), pos("t", 1, 999), pos("ohne", 1, 999), pos("alt", 1, 999), pos("offen", 1, 999)];
    expect(umsatzJeTerminstunde(orders, p, "2025-11-24", "2026-11-24", 30)).toBe(75);
    expect(umsatzJeTerminstunde([R("r")], p, "2025-11-24", "2026-11-24", 30)).toBeNull();
  });
  it("Kosten = Dauer × Techniker × Satz + Material; entgangen = Dauer × Ø", () => {
    const r = R("r", { time: "08:00", end_time: "09:30" });
    const s = reklamationSchaden(r, [pos("r", 2, 5), pos("x", 1, 100)], 2, 40, 75, 30);
    expect(s).toMatchObject({ dauerMin: 90, techniker: 2, material: 10, kosten: 130, entgangen: 112.5, keinSchaden: false });
    expect(reklamationSchaden(r, [], 0, null, null, 30)).toMatchObject({ techniker: 1, kosten: null, entgangen: null });
    expect(reklamationSchaden({ ...r, reklamation_ergebnis: "nicht_berechtigt" }, [], 1, 40, 75, 30)).toMatchObject({ kosten: 0, entgangen: 0, keinSchaden: true });
  });
});

describe("Auswertung", () => {
  const orders = [
    o("a1"), o("a2"), o("a3"), o("a4"),
    R("r1", { reklamation_bezug: bezug(1, [{ id: "e1", name: "Jan" }, { id: "e2", name: "Paul" }]), reklamation_ergebnis: "berechtigt" }),
    R("r2", { reklamation_grund: "radmutter", reklamation_bezug: bezug(2, [{ id: "e1", name: "Jan" }]), reklamation_ergebnis: "nicht_berechtigt" }),
    R("r3", { status: "offen", reklamation_bezug: null, reklamation_ohne_bezug: "vor der App" }),
    R("st", { status: "storniert" }), R("test", { order_number: -1 }), R("alt", { order_date: "2025-01-01" }),
  ];
  const d = { orders, positionen: [pos("a1", 1, 100)], orderEmployees: { r1: ["e1", "e2"] }, stundensatz: 40, jeStunde: 100, standardMin: 30 };
  const z = { von: "2026-11-01", bis: "2026-11-30" };
  it("zählt, teilt auf und rechnet den Schaden", () => {
    const x = reklamationAuswertung(d, z);
    expect(x.anzahl).toBe(3);
    expect(x.quote).toBe(75);
    expect(x.offen).toBe(1);
    expect(x.ohneBezug).toBe(1);
    expect(x.jeGrund).toEqual([{ grund: "vibration", anzahl: 2 }, { grund: "radmutter", anzahl: 1 }]);
    expect(x.jeErgebnis).toEqual([{ ergebnis: "berechtigt", anzahl: 1 }, { ergebnis: "nicht_berechtigt", anzahl: 1 }, { ergebnis: "offen", anzahl: 1 }]);
    expect(x.jeTechniker).toEqual([{ id: "e1", name: "Jan", anzahl: 2 }, { id: "e2", name: "Paul", anzahl: 1 }]);
    // r1: 1 h × 2 × 40 = 80; r2 nicht berechtigt = 0; r3: 1 h × 1 × 40 = 40
    expect(x.kosten).toBe(120);
    expect(x.entgangen).toBe(200);
    expect(x.kostenUnvollstaendig).toBe(false);
    expect(x.zeilen.map((z2) => z2.auftrag.id)).toEqual(["r1", "r2", "r3"]);
  });
  it("ohne Stundensatz sind die Kosten unvollständig", () => {
    expect(reklamationAuswertung({ ...d, stundensatz: null }, z).kostenUnvollstaendig).toBe(true);
  });
  it("Reklamationen zählen in den Kennzahlen nicht als Auftrag, ihr Umsatz schon", () => {
    const kunden = [{ id: "c1", laufkundschaft: false }] as unknown as Customer[];
    const k = kennzahlen({ orders: [o("a1"), R("r1", { reklamation_ergebnis: "nicht_berechtigt", rechnung_noetig: false })], orderArticles: [pos("a1", 1, 100), pos("r1", 1, 30)],
      orderEmployees: {}, einlagerungen: [], auftragFahrzeuge: [], employees: [], articles: [], customers: kunden, vehicles: [] }, z);
    expect(k.auftraegeErledigt).toBe(1);
    expect(k.auftraegeGesamt).toBe(1);
    expect(k.umsatzNetto).toBe(130);
    expect(k.kundenBedient).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { brauchtGrossesFach, passtZumFilter, platzGroesse, platzZuKlein, plaetzeFuerReifen, reifenDurchmesserMm, reiheTitel, scanZiel } from "@/lib/lagerAnsicht";
import type { TireStorage } from "@/lib/types";

// Die Regeln hinter der neuen Lagerseite (Entwurf H): Filter, Reihentitel, Scan-Weiche.

const PLATZ_A = "11111111-1111-4111-8111-111111111111";
const PLATZ_B = "22222222-2222-4222-8222-222222222222";
const SATZ_LIEGT = "33333333-3333-4333-8333-333333333333";
const SATZ_RAUS = "44444444-4444-4444-8444-444444444444";

const satz = (felder: Partial<TireStorage> = {}): TireStorage => ({
  id: SATZ_LIEGT, storage_slot_id: PLATZ_A, customer_id: "k1", vehicle_id: null, saison: "winter",
  erfassungsart: "sammel", anzahl_raeder: 4, dot_date: null, profiltiefe_mm: 6, note: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", removed_at: null,
  entnahme_order_id: null, order_id: null,
  ...felder,
} as TireStorage);

describe("passtZumFilter", () => {
  it("„Alle“ lässt alles durch, auch freie Plätze", () => {
    expect(passtZumFilter(null, [], "alle")).toBe(true);
    expect(passtZumFilter(satz(), [], "alle")).toBe(true);
  });
  it("„Frei“ zeigt nur leere Plätze", () => {
    expect(passtZumFilter(null, [], "frei")).toBe(true);
    expect(passtZumFilter(satz(), [], "frei")).toBe(false);
  });
  it("„Zu prüfen“ braucht einen belegten Platz mit Grund", () => {
    expect(passtZumFilter(satz(), ["Profil 2,5 mm"], "pruefen")).toBe(true);
    expect(passtZumFilter(satz(), [], "pruefen")).toBe(false);
    expect(passtZumFilter(null, [], "pruefen")).toBe(false);
  });
  it("eine Saison zeigt nur Sätze dieser Saison – ein freier Platz hat keine", () => {
    expect(passtZumFilter(satz({ saison: "winter" }), [], "winter")).toBe(true);
    expect(passtZumFilter(satz({ saison: "sommer" }), [], "winter")).toBe(false);
    expect(passtZumFilter(satz({ saison: null }), [], "winter")).toBe(false);
    expect(passtZumFilter(null, [], "sommer")).toBe(false);
  });
});

describe("reiheTitel", () => {
  it("benennt Reihen nach ihrem Präfix", () => {
    expect(reiheTitel("A", 3)).toBe("Reihe A");
  });
  it("eine einzige namenlose Reihe ist das ganze Lager", () => {
    expect(reiheTitel("", 1)).toBe("Alle Plätze");
    expect(reiheTitel("", 4)).toBe("Ohne Reihe");
  });
});

describe("scanZiel", () => {
  const plaetze = [{ id: PLATZ_A }, { id: PLATZ_B }];
  const saetze = [satz(), satz({ id: SATZ_RAUS, storage_slot_id: PLATZ_B, customer_id: "k2", removed_at: "2026-05-01T00:00:00Z" })];

  it("ein Regal-Aufkleber öffnet seinen Platz", () => {
    expect(scanZiel(`https://app.example/?lagerplatz=${PLATZ_B}`, plaetze, saetze)).toEqual({ art: "platz", slotId: PLATZ_B });
  });
  it("ein Satz-Etikett öffnet den Platz, auf dem der Satz liegt", () => {
    expect(scanZiel(`https://app.example/?satz=${SATZ_LIEGT}`, plaetze, saetze)).toEqual({ art: "platz", slotId: PLATZ_A });
  });
  it("ein ausgelagerter Satz führt zum Kunden, nicht auf den alten Platz", () => {
    expect(scanZiel(`https://app.example/?satz=${SATZ_RAUS}`, plaetze, saetze)).toEqual({ art: "kunde", kundeId: "k2" });
  });
  it("unterscheidet unbekannte eigene Codes von fremden Aufklebern", () => {
    expect(scanZiel("https://app.example/?lagerplatz=55555555-5555-4555-8555-555555555555", plaetze, saetze)).toEqual({ art: "unbekannt" });
    expect(scanZiel("https://app.example/?satz=55555555-5555-4555-8555-555555555555", plaetze, saetze)).toEqual({ art: "unbekannt" });
    expect(scanZiel("DHL 00340434161234567890", plaetze, saetze)).toEqual({ art: "fremd" });
  });
});

describe("lagerAuslastung (E11)", () => {
  it("ab 90 % voll, Lager ohne Plätze nie", async () => {
    const { lagerAuslastung, auslastungText } = await import("@/lib/lagerAnsicht");
    const lager = [{ id: "a", name: "Halle" }, { id: "b", name: "Zuhause" }];
    const plaetze = Array.from({ length: 10 }, (_, i) => ({ id: "p" + i, warehouse_id: "a" }));
    const belegt = new Set(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
    const [halle, zuhause] = lagerAuslastung(lager, plaetze, belegt);
    expect(halle).toMatchObject({ belegt: 9, gesamt: 10, voll: true });
    expect(zuhause.voll).toBe(false);
    expect(auslastungText(halle)).toBe("Halle ist zu 90 % belegt – noch 1 Platz frei.");
    expect(lagerAuslastung(lager, plaetze, new Set(["p0"]))[0].voll).toBe(false);
  });
});

describe("scanZiel mit Verkaufsreifen (E17)", () => {
  const POSTEN = "66666666-6666-4666-8666-666666666666";
  it("ein Verkaufsreifen-Etikett öffnet den Posten", () => {
    expect(scanZiel(`https://app.example/?reifen=${POSTEN}`, [], [], [{ id: POSTEN }])).toEqual({ art: "verkauf", postenId: POSTEN });
  });
  it("ein unbekannter Posten ist unbekannt, nicht fremd", () => {
    expect(scanZiel(`https://app.example/?reifen=${POSTEN}`, [], [], [])).toEqual({ art: "unbekannt" });
  });
});

describe("Fachgröße (E12)", () => {
  it("rechnet den Außendurchmesser", () => {
    expect(reifenDurchmesserMm({ breite: 205, querschnitt: 55, zoll: 16 })).toBe(632);
    expect(reifenDurchmesserMm({ breite: 275, querschnitt: 45, zoll: 20 })).toBe(756);
    expect(reifenDurchmesserMm({ breite: 195, querschnitt: null, zoll: 14 })).toBe(668);
  });
  it("groß ab Durchmesser oder Breite", () => {
    expect(brauchtGrossesFach("205/55 R16")).toBe(false);
    expect(brauchtGrossesFach("235/55 R17")).toBe(false);
    expect(brauchtGrossesFach("255/55 R18")).toBe(true);
    expect(brauchtGrossesFach("275/35 R19")).toBe(true);
    expect(brauchtGrossesFach(null)).toBe(false);
    expect(brauchtGrossesFach("unbekannt")).toBe(false);
  });
  it("Hinweis nur bei großem Reifen im normalen Fach", () => {
    expect(platzZuKlein({ code: "A1" }, "275/45 R20")).toBe("Großes Fach nötig: 275/45 R20 (Ø 756 mm) – Platz A1 ist ein normales Fach");
    expect(platzZuKlein({ code: "A1", groesse: "gross" }, "275/45 R20")).toBeNull();
    expect(platzZuKlein({ code: "A1" }, "205/55 R16")).toBeNull();
  });
  it("große Fächer zuerst für große Reifen, sonst zuletzt", () => {
    const p = [{ id: "n1" }, { id: "g1", groesse: "gross" as const }, { id: "n2", groesse: "normal" as const }];
    expect(plaetzeFuerReifen(p, true).map((x) => x.id)).toEqual(["g1", "n1", "n2"]);
    expect(plaetzeFuerReifen(p, false).map((x) => x.id)).toEqual(["n1", "n2", "g1"]);
    expect(platzGroesse({})).toBe("normal");
  });
});

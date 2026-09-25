import { describe, expect, it } from "vitest";
import { passtZumFilter, reiheTitel, scanZiel } from "@/lib/lagerAnsicht";
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
  it("unterscheidet unbekannte PinPoints-Codes von fremden Aufklebern", () => {
    expect(scanZiel("https://app.example/?lagerplatz=55555555-5555-4555-8555-555555555555", plaetze, saetze)).toEqual({ art: "unbekannt" });
    expect(scanZiel("https://app.example/?satz=55555555-5555-4555-8555-555555555555", plaetze, saetze)).toEqual({ art: "unbekannt" });
    expect(scanZiel("DHL 00340434161234567890", plaetze, saetze)).toEqual({ art: "fremd" });
  });
});

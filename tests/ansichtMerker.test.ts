// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ansichtAusText, ansichtLesen, ansichtMerken, monatAusMerker, monatFuerMerker } from "@/lib/ansichtMerker";
import { systemStartwert } from "@/lib/systeme";

// v167: Jedes Fenster merkt sich, wo es steht – nach F5 wieder dort.
describe("ansichtMerker", () => {
  beforeEach(() => sessionStorage.clear());
  it("ohne Merker leer", () => {
    expect(ansichtLesen()).toEqual({});
  });
  it("merkt Reiter und Einsatzplanung, mischt Feld für Feld", () => {
    ansichtMerken({ tab: "einsatzplanung", plan: { ansicht: "tag", tag: "2026-10-19", mitarbeiter: "e2" } });
    ansichtMerken({ plan: { status: "offen" } });
    expect(ansichtLesen()).toEqual({ tab: "einsatzplanung", plan: { ansicht: "tag", tag: "2026-10-19", mitarbeiter: "e2", status: "offen" } });
  });
  it("lässt nur Passendes durch", () => {
    expect(ansichtAusText("kein json")).toEqual({});
    expect(ansichtAusText(JSON.stringify({ tab: 5, plan: { ansicht: "jahr", monat: "2026-13", tag: "gestern", status: "alles", mitarbeiter: "" } })))
      .toEqual({ plan: {} });
    expect(ansichtAusText(JSON.stringify({ plan: { tag: null, monat: "2026-02" } }))).toEqual({ plan: { tag: null, monat: "2026-02" } });
  });
  it("Monat hin und zurück", () => {
    const d = monatAusMerker("2026-02")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 1]);
    expect(monatFuerMerker(new Date(2026, 8, 17))).toBe("2026-09");
    expect(monatAusMerker(undefined)).toBeNull();
  });
  it("System: Link geht vor, sonst der Merker, sonst FSM", () => {
    expect(systemStartwert("finance")).toBe("finance");
    expect(systemStartwert("unsinn")).toBe("fsm");
    expect(systemStartwert()).toBe("fsm");
  });
});

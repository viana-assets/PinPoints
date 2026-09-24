import { describe, expect, it } from "vitest";
import { rechnungOffen } from "@/lib/helpers";
import { nummernkreisFehler } from "@/lib/rechnung";

// Die Arbeitsliste „welche Rechnung muss ich noch schreiben". Ein Fehler hier heisst: ein
// Auftrag wird nie abgerechnet, und zwar ohne dass irgendwo etwas fehlt - er taucht einfach
// nicht auf.

function auftrag(teil: Partial<Parameters<typeof rechnungOffen>[0]> = {}) {
  return {
    status: "erledigt",
    rechnung_noetig: true,
    rechnung_erstellt_am: null,
    deleted_at: null,
    ...teil,
  };
}

describe("rechnungOffen", () => {
  it("erledigt, Rechnung noetig, noch nicht geschrieben - das ist die Arbeit", () => {
    expect(rechnungOffen(auftrag())).toBe(true);
  });

  it("ohne Haken Rechnung benoetigt gibt es nichts zu tun", () => {
    expect(rechnungOffen(auftrag({ rechnung_noetig: false }))).toBe(false);
  });

  it("schon geschrieben heisst erledigt", () => {
    expect(rechnungOffen(auftrag({ rechnung_erstellt_am: "2026-09-16T08:00:00Z" }))).toBe(false);
  });

  it("ein offener Auftrag steht noch nicht fest", () => {
    expect(rechnungOffen(auftrag({ status: "offen" }))).toBe(false);
    expect(rechnungOffen(auftrag({ status: "in_arbeit" }))).toBe(false);
  });

  it("ein stornierter Auftrag wird nicht abgerechnet", () => {
    expect(rechnungOffen(auftrag({ status: "storniert" }))).toBe(false);
  });

  it("ein geloeschter Auftrag taucht nicht auf", () => {
    expect(rechnungOffen(auftrag({ deleted_at: "2026-09-16T08:00:00Z" }))).toBe(false);
  });

  it("kommt ohne deleted_at zurecht", () => {
    const ohne = { status: "erledigt", rechnung_noetig: true, rechnung_erstellt_am: null };
    expect(rechnungOffen(ohne)).toBe(true);
  });
});

// Fahrplan D7: Die nächste Rechnungsnummer wird gegen den Bestand geprüft.

describe("nummernkreisFehler", () => {
  it("lässt ohne jede Rechnung jede Zahl ab 1 zu – das ist die Übernahme aus dem Altsystem", () => {
    expect(nummernkreisFehler(1782, null)).toBeNull();
    expect(nummernkreisFehler(1, null)).toBeNull();
  });
  it("lehnt 0, negative und gebrochene Zahlen ab", () => {
    expect(nummernkreisFehler(0, null)).toMatch(/ab 1/);
    expect(nummernkreisFehler(-5, null)).toMatch(/ab 1/);
    expect(nummernkreisFehler(12.5, null)).toMatch(/ab 1/);
    expect(nummernkreisFehler(Number.NaN, null)).toMatch(/ab 1/);
  });
  it("lässt nach vorhandenen Rechnungen genau die nächste zu", () => {
    expect(nummernkreisFehler(1785, 1784)).toBeNull();
  });
  it("benennt eine Doppelvergabe", () => {
    expect(nummernkreisFehler(1783, 1784, "RE")).toMatch(/RE1783 ist schon vergeben.*RE1785/);
  });
  it("benennt die Lücke, die entstünde", () => {
    expect(nummernkreisFehler(1786, 1784, "RE")).toMatch(/fehlten die Nummern RE1785 im Kreis/);
    expect(nummernkreisFehler(1790, 1784, "RE")).toMatch(/RE1785 bis RE1789/);
  });
});

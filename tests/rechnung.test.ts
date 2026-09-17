import { describe, expect, it } from "vitest";
import { rechnungOffen } from "@/lib/helpers";

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

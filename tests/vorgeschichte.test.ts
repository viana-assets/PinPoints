import { describe, expect, it } from "vitest";
import { letzterSatzFuer } from "@/lib/helpers";

// Der Hinweis „beim letzten Wechsel: 3,1 mm" ist nur so viel wert, wie er stimmt. Die
// gefährliche Verwechslung ist das ZWEITE Auto desselben Kunden – ein Messwert vom falschen
// Wagen sähe aus wie eine Auskunft und wäre eine Falschaussage.

function satz(id: string, felder: Record<string, unknown> = {}) {
  return { id, customer_id: "k1", vehicle_id: "f1", created_at: "2026-03-01T10:00:00Z", ...felder };
}

describe("letzterSatzFuer", () => {
  it("nimmt den jüngsten Satz dieses Fahrzeugs", () => {
    const saetze = [
      satz("alt", { created_at: "2025-03-01T10:00:00Z" }),
      satz("neu", { created_at: "2026-03-01T10:00:00Z" }),
    ];
    expect(letzterSatzFuer(saetze, "k1", "f1")?.id).toBe("neu");
  });

  it("lässt den Satz des laufenden Auftrags außen vor", () => {
    const saetze = [satz("jetzt", { created_at: "2026-09-01T10:00:00Z" }), satz("davor")];
    expect(letzterSatzFuer(saetze, "k1", "f1", "jetzt")?.id).toBe("davor");
  });

  // Der eigentliche Grund für diese Funktion.
  it("schweigt lieber, als einen Messwert vom anderen Auto zu zeigen", () => {
    const saetze = [satz("zweitwagen", { vehicle_id: "f2" })];
    expect(letzterSatzFuer(saetze, "k1", "f1")).toBeNull();
  });

  it("nimmt ohne bekanntes Fahrzeug den jüngsten Satz des Kunden", () => {
    const saetze = [satz("a", { vehicle_id: "f2", created_at: "2026-01-01T10:00:00Z" }),
                    satz("b", { vehicle_id: "f3", created_at: "2026-05-01T10:00:00Z" })];
    expect(letzterSatzFuer(saetze, "k1", null)?.id).toBe("b");
  });

  it("zeigt nichts von einem anderen Kunden", () => {
    expect(letzterSatzFuer([satz("x", { customer_id: "k2" })], "k1", "f1")).toBeNull();
  });

  it("verträgt einen Auftrag ohne Kunden", () => {
    expect(letzterSatzFuer([satz("x")], null, "f1")).toBeNull();
  });
});

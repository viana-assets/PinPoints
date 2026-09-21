import { describe, expect, it } from "vitest";
import { letzterSatzFuer } from "@/lib/helpers";

// Der Hinweis „beim letzten Wechsel: 3,1 mm" ist nur so viel wert, wie er stimmt. Die
// gefährliche Verwechslung ist das ZWEITE Auto desselben Kunden – ein Messwert vom falschen
// Wagen sähe aus wie eine Auskunft und wäre eine Falschaussage.
//
// Seit dem 21.09.2026 bekommt die Funktion eine LISTE von Fahrzeugen: Ein Auftrag kann
// mehrere Autos tragen (Migration 44), und vorher las das Auftragsfenster dafür noch das
// abgelöste Einzelfeld `orders.vehicle_id` – während die Rechnung daneben schon die neue
// Tabelle las. Zwei Antworten auf dieselbe Frage im selben Fenster.

function satz(id: string, felder: Record<string, unknown> = {}) {
  return { id, customer_id: "k1", vehicle_id: "f1", created_at: "2026-03-01T10:00:00Z", ...felder };
}

describe("letzterSatzFuer", () => {
  it("nimmt den jüngsten Satz dieses Fahrzeugs", () => {
    const saetze = [
      satz("alt", { created_at: "2025-03-01T10:00:00Z" }),
      satz("neu", { created_at: "2026-03-01T10:00:00Z" }),
    ];
    expect(letzterSatzFuer(saetze, "k1", ["f1"])?.id).toBe("neu");
  });

  // Der eigentliche Grund für diese Funktion.
  it("schweigt lieber, als einen Messwert vom anderen Auto zu zeigen", () => {
    const saetze = [satz("zweitwagen", { vehicle_id: "f2" })];
    expect(letzterSatzFuer(saetze, "k1", ["f1"])).toBeNull();
  });

  it("nimmt ohne bekanntes Fahrzeug den jüngsten Satz des Kunden", () => {
    const saetze = [satz("a", { vehicle_id: "f2", created_at: "2026-01-01T10:00:00Z" }),
                    satz("b", { vehicle_id: "f3", created_at: "2026-05-01T10:00:00Z" })];
    expect(letzterSatzFuer(saetze, "k1", [])?.id).toBe("b");
    expect(letzterSatzFuer(saetze, "k1", null)?.id).toBe("b");
  });

  // Mehrere Autos am selben Auftrag: Gesucht ist der jüngste Satz zu IRGENDEINEM davon – nicht
  // der jüngste des Kunden. Ein drittes Auto bleibt außen vor.
  it("findet bei mehreren Fahrzeugen am Auftrag den jüngsten passenden Satz", () => {
    const saetze = [
      satz("zuF1", { vehicle_id: "f1", created_at: "2026-01-01T10:00:00Z" }),
      satz("zuF2", { vehicle_id: "f2", created_at: "2026-04-01T10:00:00Z" }),
      satz("fremdesAuto", { vehicle_id: "f9", created_at: "2026-08-01T10:00:00Z" }),
    ];
    expect(letzterSatzFuer(saetze, "k1", ["f1", "f2"])?.id).toBe("zuF2");
  });

  // Ein Auftragsfahrzeug ohne Stammsatz darf die Liste nicht entwerten: `null` wird
  // aussortiert, die übrigen zählen weiter.
  it("überliest leere Einträge in der Fahrzeugliste", () => {
    const saetze = [satz("zuF1", { vehicle_id: "f1" })];
    expect(letzterSatzFuer(saetze, "k1", [null, "f1"])?.id).toBe("zuF1");
  });

  it("zeigt nichts von einem anderen Kunden", () => {
    expect(letzterSatzFuer([satz("x", { customer_id: "k2" })], "k1", ["f1"])).toBeNull();
  });

  it("verträgt einen Auftrag ohne Kunden", () => {
    expect(letzterSatzFuer([satz("x")], null, ["f1"])).toBeNull();
  });
});

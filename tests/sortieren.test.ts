import { describe, expect, it } from "vitest";
import { formatOrderDateTime, sortiere, terminZeitraum, vergleiche } from "@/lib/helpers";

// Sortierung der Auftragsliste. Ein Fehler hier faellt nicht als Fehler auf - die Liste sieht
// sortiert aus, steht aber falsch, und man sucht den Auftrag an der falschen Stelle.

describe("vergleiche", () => {
  it("sortiert Zahlen als Zahlen, nicht als Text", () => {
    expect(vergleiche(9, 10, "auf")).toBeLessThan(0);
    expect(vergleiche(9, 10, "ab")).toBeGreaterThan(0);
  });

  it("sortiert Text nach deutschen Regeln", () => {
    expect(vergleiche("Ärger", "Bauer", "auf")).toBeLessThan(0);
    expect(vergleiche("a", "B", "auf")).toBeLessThan(0);
  });

  it("stellt Leeres in BEIDEN Richtungen ans Ende", () => {
    expect(vergleiche(null, "x", "auf")).toBeGreaterThan(0);
    expect(vergleiche(null, "x", "ab")).toBeGreaterThan(0);
    expect(vergleiche("", "x", "ab")).toBeGreaterThan(0);
    expect(vergleiche("x", null, "ab")).toBeLessThan(0);
  });

  it("haelt zwei leere Werte fuer gleich", () => {
    expect(vergleiche(null, "", "auf")).toBe(0);
  });
});

describe("sortiere", () => {
  const zeilen = [
    { nr: 3, datum: "2026-11-03" },
    { nr: 1, datum: "2026-10-19" },
    { nr: 2, datum: null },
  ];

  it("sortiert Datumswerte richtig herum - nicht als angezeigten Text", () => {
    expect(sortiere(zeilen, (z) => z.datum, "auf").map((z) => z.nr)).toEqual([1, 3, 2]);
  });

  it("dreht um, laesst Leeres aber unten", () => {
    expect(sortiere(zeilen, (z) => z.datum, "ab").map((z) => z.nr)).toEqual([3, 1, 2]);
  });

  it("laesst die Ausgangsliste unangetastet", () => {
    const vorher = zeilen.map((z) => z.nr);
    sortiere(zeilen, (z) => z.nr, "ab");
    expect(zeilen.map((z) => z.nr)).toEqual(vorher);
  });
});

describe("terminZeitraum", () => {
  it("nennt Anfang und Ende", () => {
    expect(terminZeitraum({ time: "09:00", end_time: "10:30" })).toBe("09:00 – 10:30 Uhr");
  });

  it("nennt nur den Anfang, wenn kein Ende gepflegt ist", () => {
    expect(terminZeitraum({ time: "09:00", end_time: null })).toBe("09:00 Uhr");
  });

  it("sagt nichts, wenn es keine Uhrzeit gibt - ein Auftrag ist kein Termin", () => {
    expect(terminZeitraum({ time: null, end_time: null })).toBeNull();
  });
});

// Die einzeilige Fassung muss dieselbe Uhrzeit nennen wie die zweizeilige – sonst stünde in
// der Terminliste ein Zeitraum und im Kartenpunkt daneben nur der Anfang, und man müsste
// raten, welche der beiden Angaben gilt.
describe("formatOrderDateTime", () => {
  const basis = { order_date: "2026-09-17" };

  it("setzt das Datum vor den Zeitraum", () => {
    expect(formatOrderDateTime({ ...basis, time: "15:15", end_time: "16:00" } as never))
      .toBe("17.9.2026, 15:15 – 16:00 Uhr");
  });

  it("nennt nur den Anfang, wenn kein Ende gepflegt ist", () => {
    expect(formatOrderDateTime({ ...basis, time: "15:15", end_time: null } as never))
      .toBe("17.9.2026, 15:15 Uhr");
  });

  it("nennt nur das Datum, wenn es keine Uhrzeit gibt", () => {
    expect(formatOrderDateTime({ ...basis, time: null, end_time: null } as never))
      .toBe("17.9.2026");
  });
});

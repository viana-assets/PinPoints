import { describe, expect, it } from "vitest";
import { buildSlotCodes } from "@/components/lager/LagerPanel";

// Die Nummerierungslogik legt beim Anlegen eines Lagers auf einen Schlag viele Lagerplätze an.
// Ein Fehler hier erzeugt gleich reihenweise falsch benannte Plätze, die anschließend von Hand
// nachgezogen werden müssten.

describe("buildSlotCodes", () => {
  it("füllt die Nummern auf die gewünschte Stellenzahl auf", () => {
    expect(buildSlotCodes("A", 1, 3, 2)).toEqual(["A-01", "A-02", "A-03"]);
  });

  it("kommt mit dreistelliger Nummerierung zurecht", () => {
    expect(buildSlotCodes("B", 9, 11, 3)).toEqual(["B-009", "B-010", "B-011"]);
  });

  it("kürzt eine Nummer nicht, die länger ist als die Stellenzahl", () => {
    expect(buildSlotCodes("C", 100, 101, 2)).toEqual(["C-100", "C-101"]);
  });

  it("liefert bei einem einzelnen Platz genau einen Code", () => {
    expect(buildSlotCodes("D", 7, 7, 2)).toEqual(["D-07"]);
  });

  it("liefert eine leere Liste, wenn das Ende vor dem Anfang liegt", () => {
    expect(buildSlotCodes("E", 5, 3, 2)).toEqual([]);
  });
});

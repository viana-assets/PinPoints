import { describe, expect, it } from "vitest";
import { hausnummerAus, vorschlagOhneHausnummer } from "@/lib/helpers";

// Der Kartendienst schlägt gern die Straße ohne Haus vor. Wird dieser Vorschlag übernommen,
// ist die Adresse anschließend schlechter als vorher – und die Fahrt endet am Anfang der
// Straße. Diese Regel entscheidet, ob daneben eine Warnung steht.
// Anlass: docs/kunden-und-karte.md, Befund vom 14.09.2026.

describe("hausnummerAus", () => {
  it("findet die Hausnummer in der üblichen Schreibweise", () => {
    expect(hausnummerAus("Strengenbergstraße 54, 90607 Rückersdorf")).toBe("54");
    expect(hausnummerAus("Bertolt-Brecht-Weg 54, 90513 Zirndorf")).toBe("54");
  });

  it("versteht Hausnummern mit Buchstabe", () => {
    expect(hausnummerAus("Ganghoferstraße 16b, 91126 Rednitzhembach")).toBe("16b");
    expect(hausnummerAus("Hauptstraße 7 a, 90402 Nürnberg")).toBe("7a");
  });

  it("erkennt das Fehlen", () => {
    expect(hausnummerAus("Strengenbergstraße, 90607 Rückersdorf")).toBeNull();
    expect(hausnummerAus("Wielandstraße, 90513 Zirndorf")).toBeNull();
    expect(hausnummerAus(null)).toBeNull();
    expect(hausnummerAus("")).toBeNull();
  });

  it("kommt ohne Komma aus und hält die Postleitzahl nicht für eine Hausnummer", () => {
    expect(hausnummerAus("Fürtherstraße 59 90513 Zirndorf")).toBe("59");
    expect(hausnummerAus("Fürtherstraße 90513 Zirndorf")).toBeNull();
  });

  it("lässt sich von einer Zahl im Straßennamen nicht täuschen", () => {
    expect(hausnummerAus("Straße des 17. Juni, 10623 Berlin")).toBeNull();
  });
});

describe("vorschlagOhneHausnummer", () => {
  it("warnt, wenn der Vorschlag die Hausnummer verliert", () => {
    expect(vorschlagOhneHausnummer(
      "Strengenbergstraße 54, 90607 Rückersdorf",
      "Strengenbergstraße, 90607 Rückersdorf"
    )).toBe(true);
  });

  it("warnt nicht, wenn der Vorschlag sie behält", () => {
    expect(vorschlagOhneHausnummer(
      "Bertolt-Brecht-Weg 54, 90513 Zirndorf",
      "Bertolt-Brecht-Weg 54, 90513 Zirndorf"
    )).toBe(false);
  });

  it("warnt nicht, wenn schon vorher keine dastand", () => {
    // Dann ist der Vorschlag kein Rückschritt – er ist nur auch keine Verbesserung.
    expect(vorschlagOhneHausnummer("Wielandstraße, 90513 Zirndorf", "Wielandstraße, 90513 Zirndorf")).toBe(false);
  });

  it("warnt auch, wenn der Vorschlag eine ANDERE Straße ohne Nummer ist", () => {
    expect(vorschlagOhneHausnummer("Hauptstraße 3, 90402 Nürnberg", "Nebenstraße, 90402 Nürnberg")).toBe(true);
  });
});

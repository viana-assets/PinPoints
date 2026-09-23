import { describe, expect, it } from "vitest";
import { adresseOhneHausnummer, geocodeAnfrage, hausnummerAus, navigationUrls, vorschlagOhneHausnummer } from "@/lib/helpers";

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

// Der zweite Versuch beim Geokodieren: dieselbe Adresse ohne die Hausnummer.
describe("adresseOhneHausnummer", () => {
  it("streicht die Hausnummer und lässt den Rest stehen", () => {
    expect(adresseOhneHausnummer("Allerheiligenweg 36b, 90530 Wendelstein"))
      .toBe("Allerheiligenweg, 90530 Wendelstein");
    expect(adresseOhneHausnummer("Rehhofstraße 16, 90482 Nürnberg"))
      .toBe("Rehhofstraße, 90482 Nürnberg");
  });

  it("gibt null zurück, wenn es nichts zu streichen gibt", () => {
    // Sonst ginge eine zweite, identische Anfrage an einen kostenlosen Fremddienst.
    expect(adresseOhneHausnummer("Allerheiligenweg, 90530 Wendelstein")).toBeNull();
    expect(adresseOhneHausnummer(null)).toBeNull();
  });

  it("lässt eine Zahl im Straßennamen unangetastet", () => {
    expect(adresseOhneHausnummer("Straße des 17. Juni, 10623 Berlin")).toBeNull();
  });
});

// Die Navigation ist der Punkt, an dem eine ungefähre Position echten Schaden anrichtet.
describe("navigationUrls", () => {
  const basis = {
    id: "k1", name: "Test", address: "Allerheiligenweg 36b, 90530 Wendelstein",
    kundennummer: null, phone_mobile: null, phone_landline: null, company: null, anrede: null, email: null,
    note: null, status: "offen" as const, last_contact: null, kontakt_ergebnis: null,
    wiedervorlage_am: null, laufkundschaft: false, active: true, deleted_at: null,
  };

  it("nimmt bei genauer Position die Koordinate", () => {
    const u = navigationUrls({ ...basis, lat: 49.35, lng: 11.15, geo_genauigkeit: "exakt" });
    expect(u.google).toContain("49.35%2C11.15");
  });

  it("nimmt bei von Hand gesetzter Position die Koordinate", () => {
    // Sie kommt von einem Menschen, der dort war – genauer geht es nicht.
    const u = navigationUrls({ ...basis, lat: 49.35, lng: 11.15, geo_genauigkeit: "hand" });
    expect(u.google).toContain("49.35%2C11.15");
  });

  it("nimmt bei UNGEFÄHRER Position den Adresstext, nicht den Punkt", () => {
    // Der Punkt ist die Straßenmitte; die Hausnummer steht nur im Text, und Google findet sie.
    const u = navigationUrls({ ...basis, lat: 49.35, lng: 11.15, geo_genauigkeit: "ungefaehr" });
    expect(u.google).toContain("36b");
    expect(u.google).not.toContain("49.35");
    expect(u.apple).toContain("36b");
  });

  it("nimmt ohne Position den Adresstext", () => {
    const u = navigationUrls({ ...basis, lat: null, lng: null, geo_genauigkeit: null });
    expect(u.google).toContain("36b");
  });

  it("behandelt Altbestand ohne Angabe wie „genau“", () => {
    // Bis Migration 35 gab es die Spalte nicht; jede vorhandene Position stammte aus der
    // vollständigen Adresse. Ein fehlender Wert darf die Navigation nicht verschlechtern.
    const u = navigationUrls({ ...basis, lat: 49.35, lng: 11.15, geo_genauigkeit: null });
    expect(u.google).toContain("49.35%2C11.15");
  });
});

// Der Zusatz „, Nürnberg, Deutschland" an der Geokodier-Anfrage. Er soll Adressen OHNE Ort
// helfen – und darf Adressen MIT Ort nicht kaputt machen.
// Befund vom 14.09.2026: Er wurde an jede Adresse gehängt, in der das Wort „Nürnberg" nicht
// vorkam. „Strengenbergstraße 54, 90607 Rückersdorf, Nürnberg, Deutschland" ist ein
// Widerspruch, und der Kartendienst fand daraufhin gar nichts – auch die Straße allein nicht.
describe("geocodeAnfrage", () => {
  it("lässt eine Adresse mit Postleitzahl unangetastet – auch außerhalb von Nürnberg", () => {
    expect(geocodeAnfrage("Strengenbergstraße 54, 90607 Rückersdorf"))
      .toBe("Strengenbergstraße 54, 90607 Rückersdorf");
    expect(geocodeAnfrage("Am Pfaffensteig 43, 91126 Schwabach"))
      .toBe("Am Pfaffensteig 43, 91126 Schwabach");
    expect(geocodeAnfrage("Wielandstraße 6a, 90513 Zirndorf"))
      .toBe("Wielandstraße 6a, 90513 Zirndorf");
  });

  it("lässt eine Adresse mit dem Stadtnamen unangetastet, auch ohne Postleitzahl", () => {
    expect(geocodeAnfrage("Rehhofstraße 16, Nürnberg")).toBe("Rehhofstraße 16, Nürnberg");
    // Ohne Umlaut geschrieben zählt genauso – sonst stünde der Stadtname zweimal.
    expect(geocodeAnfrage("Rehhofstraße 16, Nuernberg")).toBe("Rehhofstraße 16, Nuernberg");
  });

  it("ergänzt die Region nur dort, wo wirklich kein Ort steht", () => {
    expect(geocodeAnfrage("Rehhofstraße 16")).toBe("Rehhofstraße 16, Nürnberg, Deutschland");
    expect(geocodeAnfrage("Am Berg")).toBe("Am Berg, Nürnberg, Deutschland");
  });
});

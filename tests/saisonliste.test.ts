import { describe, expect, it } from "vitest";
import { plzAus, naechsteSaison } from "@/lib/helpers";

// Die Saisonliste filtert nach Postleitzahl, und die steckt in einer einzeiligen Adresse
// zwischen Hausnummer und Ort. Ein Fehler hier fällt nicht auf: die Liste ist dann einfach
// leer oder zu lang, und beides sieht nach einem Datenproblem aus statt nach einem
// Rechenfehler (docs/lager-ausbaukonzept.md, D1).

describe("plzAus", () => {
  it("findet die Postleitzahl in der üblichen Schreibweise", () => {
    expect(plzAus("Rehhofstraße 16, 90482 Nürnberg")).toBe("90482");
    expect(plzAus("Schmausenbuckstraße 69, 90480 Nürnberg")).toBe("90480");
  });

  it("lässt sich von der Hausnummer nicht täuschen", () => {
    expect(plzAus("Hauptstraße 5, 91207 Lauf")).toBe("91207");
    expect(plzAus("Am Anger 12a, 90562 Heroldsberg")).toBe("90562");
  });

  it("nimmt keine längere Zahl für eine Postleitzahl", () => {
    // Eine sechsstellige Zahl ist keine deutsche PLZ – lieber nichts als etwas Falsches.
    expect(plzAus("Testweg 1, 123456 Irgendwo")).toBeNull();
  });

  it("kommt mit fehlender oder unvollständiger Adresse zurecht", () => {
    expect(plzAus(null)).toBeNull();
    expect(plzAus("")).toBeNull();
    expect(plzAus("Nürnberg")).toBeNull();
  });
});

describe("naechsteSaison", () => {
  it("schlägt im Herbst die Winterliste vor", () => {
    // Im Herbst brauchen die Kunden ihre Winterreifen – die bei uns liegen.
    expect(naechsteSaison(new Date("2026-08-15T12:00:00"))).toBe("winter");
    expect(naechsteSaison(new Date("2026-10-01T12:00:00"))).toBe("winter");
    expect(naechsteSaison(new Date("2027-01-20T12:00:00"))).toBe("winter");
  });

  it("schlägt im Frühjahr die Sommerliste vor", () => {
    expect(naechsteSaison(new Date("2026-02-10T12:00:00"))).toBe("sommer");
    expect(naechsteSaison(new Date("2026-04-01T12:00:00"))).toBe("sommer");
    expect(naechsteSaison(new Date("2026-07-31T12:00:00"))).toBe("sommer");
  });
});

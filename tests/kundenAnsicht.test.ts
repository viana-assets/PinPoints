import { describe, expect, it } from "vitest";
import { anfangsbuchstabe, anzeigeName, initialen, nachBuchstaben, rueckrufFaellig } from "@/lib/kundenAnsicht";

// Die Regeln hinter der neuen Kundenliste (Entwurf J).

describe("anzeigeName", () => {
  it("zeigt bei Firmenkunden die Firma, sonst den Namen", () => {
    expect(anzeigeName({ name: "Elke Hofmann", company: "Hofmann GmbH" })).toBe("Hofmann GmbH");
    expect(anzeigeName({ name: "Nadine Kurz", company: null })).toBe("Nadine Kurz");
    expect(anzeigeName({ name: "Nadine Kurz", company: "  " })).toBe("Nadine Kurz");
  });
  it("richtet den Anfangsbuchstaben nach dem angezeigten Namen", () => {
    expect(anfangsbuchstabe({ name: "Elke Hofmann", company: "Hofmann GmbH" })).toBe("H");
    expect(anfangsbuchstabe({ name: "ärztehaus", company: null })).toBe("Ä");
  });
});

describe("rueckrufFaellig", () => {
  const heute = "2026-09-26";
  it("gilt für offene Kunden mit erreichter Wiedervorlage", () => {
    expect(rueckrufFaellig({ wiedervorlage_am: "2026-09-26" }, "red", heute)).toBe(true);
    expect(rueckrufFaellig({ wiedervorlage_am: "2026-09-01" }, "red", heute)).toBe(true);
  });
  it("nicht ohne Wiedervorlage, nicht in der Zukunft, nicht bei Termin", () => {
    expect(rueckrufFaellig({ wiedervorlage_am: null }, "red", heute)).toBe(false);
    expect(rueckrufFaellig({ wiedervorlage_am: "2026-10-01" }, "wiedervorlage", heute)).toBe(false);
    expect(rueckrufFaellig({ wiedervorlage_am: "2026-09-01" }, "termin", heute)).toBe(false);
  });
});

describe("nachBuchstaben", () => {
  it("bündelt aufeinanderfolgende Kunden je Buchstabe, Ziffern unter #", () => {
    const g = nachBuchstaben([
      { name: "1a Reifen", company: null },
      { name: "Anna", company: null },
      { name: "Axel", company: null },
      { name: "Elke Hofmann", company: "Hofmann GmbH" },
    ]);
    expect(g.map((x) => [x.buchstabe, x.kunden.length])).toEqual([["#", 1], ["A", 2], ["H", 1]]);
  });
});

describe("initialen", () => {
  it("nimmt die ersten beiden Wörter", () => {
    expect(initialen("Hofmann GmbH")).toBe("HG");
    expect(initialen("Familie Brandt & Söhne")).toBe("FB");
    expect(initialen("")).toBe("?");
  });
});

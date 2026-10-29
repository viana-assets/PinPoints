import { describe, expect, it } from "vitest";
import { anzeigeName, pflichtText, stammdatenFehlen } from "@/lib/kundenAnsicht";
import { rechnungsdatenMaengel } from "@/lib/helpers";
import { anschriftZeilen } from "@/lib/rechnung";
import { aehnlicheKunden } from "@/lib/dubletten";
import type { Customer } from "@/lib/types";

// v172 (Migration 103): Bei einer Firma ist die Firma Pflicht, der Ansprechpartner freiwillig; angezeigt
// wird überall die Firma vor dem Ansprechpartner (im Lager stand bis v171 der Ansprechpartner).

describe("stammdatenFehlen", () => {
  it("Firma: Firma und Adresse Pflicht, Ansprechpartner nicht", () => {
    expect(stammdatenFehlen({ firma: true, name: "", company: "Muster GmbH", address: "Weg 1" })).toEqual([]);
    expect(stammdatenFehlen({ firma: true, name: "Artur", company: " ", address: "Weg 1" })).toEqual(["Firma"]);
    expect(stammdatenFehlen({ firma: true, name: "", company: "", address: "" })).toEqual(["Firma", "Adresse"]);
  });
  it("Privat: Name Pflicht; Laufkundschaft ohne Adresse", () => {
    expect(stammdatenFehlen({ firma: false, name: "", company: "", address: "Weg 1" })).toEqual(["Name"]);
    expect(stammdatenFehlen({ firma: false, name: "Max", company: "", address: "", ohneAdresse: true })).toEqual([]);
  });
  it("Text für den Hinweis", () => {
    expect(pflichtText(["Firma"])).toBe("Firma ist Pflicht");
    expect(pflichtText(["Firma", "Adresse"])).toBe("Firma und Adresse sind Pflicht");
    expect(pflichtText([])).toBe("");
  });
});

describe("Anzeige und Rechnung", () => {
  it("anzeigeName: Firma vor Ansprechpartner, auch ohne Ansprechpartner", () => {
    expect(anzeigeName({ name: "Artur", company: "Algen GmbH" })).toBe("Algen GmbH");
    expect(anzeigeName({ name: "", company: "Algen GmbH" })).toBe("Algen GmbH");
    expect(anzeigeName({ name: "Max Muster" })).toBe("Max Muster");
    expect(anzeigeName({ name: null, company: null })).toBe("");
  });
  it("Rechnung: Name ODER Firma genügt (wie pruefe_rechnungsdaten, Migration 103)", () => {
    const auto = [{ kennzeichen: "N-X 1", kilometerstand: 1 }];
    expect(rechnungsdatenMaengel({ name: "", company: "Algen GmbH", address: "Weg 1", email: null }, auto).filter((m) => m.pflicht)).toEqual([]);
    const m = rechnungsdatenMaengel({ name: "", company: null, address: "Weg 1", email: null }, auto);
    expect(m.find((x) => x.schluessel === "name")?.text).toBe("Name oder Firma des Kunden");
  });
  it("Anschrift ohne Ansprechpartner: keine einzelne Anrede", () => {
    expect(anschriftZeilen({ name: "", company: "Algen GmbH", anrede: "Herr", address: "Weg 1, 90000 Ort", email: null, kundennummer: 1 }))
      .toEqual(["Algen GmbH", "Weg 1", "90000 Ort"]);
    expect(anschriftZeilen({ name: "Artur", company: "Algen GmbH", anrede: "Herr", address: "Weg 1", email: null, kundennummer: 1 }))
      .toEqual(["Algen GmbH", "Herr Artur", "Weg 1"]);
  });
  it("Dubletten: getippte Firma wird auch ohne Ansprechpartner verglichen", () => {
    const vorhanden = { id: "k1", name: "Artur", company: "Algenmax Bayern GmbH", address: "Weg 1, 90441 Nürnberg", phone_mobile: null, phone_landline: null, email: null } as unknown as Customer;
    const t = aehnlicheKunden({ name: "", company: "Algenmax", address: "", phone_mobile: null, phone_landline: null, email: null }, [vorhanden]);
    expect(t.map((x) => x.kunde.id)).toEqual(["k1"]);
  });
});

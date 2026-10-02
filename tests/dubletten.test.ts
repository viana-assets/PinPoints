import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/types";
import {
  aehnlicheKunden, dublettenGruende, dublettenPaare, nameSchluessel, paarSchluessel, plzAus,
  uebernommeneFelder, vorschlagBehalten,
} from "@/lib/dubletten";

// Dublettenprüfung (E1, v103). Erfundene Namen und Nummern.

function kunde(id: string, teil: Partial<Customer> = {}): Customer {
  return {
    id, kundennummer: null, name: "Kunde " + id, company: null, anrede: null, email: null, address: "",
    phone_mobile: null, phone_landline: null, note: null, lat: null, lng: null, laufkundschaft: false,
    einmalkunde: false, testkunde: false, active: true, deleted_at: null, ...teil,
  } as unknown as Customer;
}

describe("plzAus / nameSchluessel", () => {
  it("nimmt die letzte fünfstellige Zahl", () => {
    expect(plzAus("Weg 12, 90513 Zirndorf")).toBe("90513");
    expect(plzAus("Postfach 12345, 90402 Nürnberg")).toBe("90402");
    expect(plzAus("Hauptstraße 3")).toBeNull();
  });
  it("Reihenfolge, Umlaute und Anrede sind egal", () => {
    expect(nameSchluessel("Hans Müller")).toBe(nameSchluessel("Mueller, Hans"));
    expect(nameSchluessel("Herr Hans Müller")).toBe(nameSchluessel("Hans Müller"));
    expect(nameSchluessel("Hans Müller")).not.toBe(nameSchluessel("Hannes Müller"));
  });
});

describe("dublettenGruende", () => {
  it("gleiche Nummer in anderer Schreibweise", () => {
    expect(dublettenGruende(kunde("a", { phone_mobile: "0171 555666" }), kunde("b", { phone_landline: "+49 171 555666" }))).toEqual(["telefon"]);
  });
  it("kurze Nummern ohne Vorwahl zählen nicht", () => {
    expect(dublettenGruende(kunde("a", { phone_mobile: "12345" }), kunde("b", { phone_mobile: "12345" }))).toEqual([]);
  });
  it("Name nur zusammen mit gleicher PLZ", () => {
    const a = kunde("a", { name: "Hans Muster", address: "Weg 1, 90513 Zirndorf" });
    expect(dublettenGruende(a, kunde("b", { name: "Muster Hans", address: "Gasse 9, 90513 Zirndorf" }))).toEqual(["name_plz"]);
    expect(dublettenGruende(a, kunde("c", { name: "Muster Hans", address: "Gasse 9, 90402 Nürnberg" }))).toEqual([]);
  });
  it("E-Mail ohne Groß/klein", () => {
    expect(dublettenGruende(kunde("a", { email: "HM@example.org " }), kunde("b", { email: "hm@example.org" }))).toEqual(["email"]);
  });
});

describe("aehnlicheKunden", () => {
  const bestand = [
    kunde("1", { name: "Petra Beispiel", phone_mobile: "0170 1112223", address: "Ring 2, 90763 Fürth" }),
    kunde("2", { name: "Beispielhaus GmbH", address: "Ring 9, 90763 Fürth" }),
    kunde("3", { name: "Laufkundschaft", laufkundschaft: true, phone_mobile: "0170 1112223" }),
  ];
  it("die Nummer schlägt den Namen", () => {
    const t = aehnlicheKunden({ name: "Beispiel", company: null, address: "", phone_mobile: "+49 170 1112223", phone_landline: null, email: null }, bestand);
    expect(t.map((x) => x.kunde.id)).toEqual(["1", "2"]);
    expect(t[0].gruende).toEqual(["telefon"]);
    expect(t[1].gruende).toEqual(["name"]);
  });
  it("Laufkundschaft nie, kurze Eingabe ohne Nummer nichts", () => {
    expect(aehnlicheKunden({ name: "Bei", company: null, address: "", phone_mobile: null, phone_landline: null, email: null }, bestand)).toEqual([]);
  });
});

describe("dublettenPaare", () => {
  const a = kunde("a1", { name: "Hans Muster", address: "Weg 1, 90513 Zirndorf", phone_mobile: "0171 555666" });
  const b = kunde("b2", { name: "Muster Hans", address: "Weg 1, 90513 Zirndorf", phone_landline: "0171/555666" });
  const c = kunde("c3", { name: "Jemand Anders", phone_mobile: "0911 999888" });
  it("findet das Paar einmal, mit beiden Gründen", () => {
    const p = dublettenPaare([c, b, a], new Set());
    expect(p).toHaveLength(1);
    expect([p[0].a.id, p[0].b.id]).toEqual(["a1", "b2"]);
    expect(p[0].gruende).toEqual(["telefon", "name_plz"]);
  });
  it("„keine Dublette“ nimmt es heraus, Testkunden sind nie dabei", () => {
    expect(dublettenPaare([a, b], new Set([paarSchluessel("b2", "a1").join("|")]))).toEqual([]);
    expect(dublettenPaare([a, { ...b, testkunde: true }], new Set())).toEqual([]);
  });
  it("eine Sammelnummer für viele ist keine Dublette", () => {
    const viele = Array.from({ length: 7 }, (_, i) => kunde("z" + i, { phone_landline: "0911 4444444" }));
    expect(dublettenPaare(viele, new Set())).toEqual([]);
  });
});

describe("Zusammenführen", () => {
  it("behält die ältere Kundennummer", () => {
    expect(vorschlagBehalten(kunde("a", { kundennummer: 10020 }), kunde("b", { kundennummer: 10003 })).id).toBe("b");
    expect(vorschlagBehalten(kunde("a", { kundennummer: null }), kunde("b", { kundennummer: 10003 })).id).toBe("b");
  });
  it("nennt, was herüberkommt – wie kunden_zusammenfuehren()", () => {
    const bleibt = kunde("a", { phone_mobile: "0171 555666", note: "Hof" });
    const weg = kunde("b", { phone_mobile: "0160 1234567", email: "x@example.org", note: "Hund", lat: 49.4 });
    expect(uebernommeneFelder(bleibt, weg)).toEqual(["E-Mail", "Festnetz", "Kartenposition", "Notiz (angehängt)"]);
    expect(uebernommeneFelder(bleibt, kunde("c", { phone_mobile: "+49 171 555666" }))).toEqual([]);
  });
});

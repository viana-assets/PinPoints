import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/types";
import { effectiveColor, kundenMitTermin } from "@/lib/helpers";

// Grundgerüst eines Kunden. Object.assign statt Streuung, weil `strict: true` sonst über
// optionale Felder stolpert (siehe tests/preislogik.test.ts, gleiches Muster).
function kunde(teil: Partial<Customer>): Customer {
  const standard: Customer = {
    id: "k1", kundennummer: null, name: "Testkunde", address: "Teststr. 1", phone_mobile: null, phone_landline: null,
    company: null, anrede: null, email: null,
    note: null, lat: null, lng: null, geo_genauigkeit: null, status: "offen", last_contact: null,
    kontakt_ergebnis: null, wiedervorlage_am: null, laufkundschaft: false, einmalkunde: false, testkunde: false, active: true, deleted_at: null,
  };
  return Object.assign(standard, teil);
}

const HEUTE = "2026-08-29";

describe("effectiveColor", () => {
  it("ist rot, solange kein Kontakt stattgefunden hat", () => {
    expect(effectiveColor(kunde({}), 3, HEUTE)).toBe("red");
  });

  it("ist grün innerhalb des Wiedervorlage-Zeitraums aus den Einstellungen", () => {
    const c = kunde({ status: "kontaktiert", last_contact: "2026-08-01", kontakt_ergebnis: "auftrag" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("green");
  });

  it("ist wieder rot, wenn der Zeitraum abgelaufen ist", () => {
    const c = kunde({ status: "kontaktiert", last_contact: "2020-01-01" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("red");
  });

  it("steht auf Wiedervorlage, solange der Stichtag in der Zukunft liegt", () => {
    const c = kunde({ status: "kontaktiert", last_contact: HEUTE, kontakt_ergebnis: "wiedervorlage", wiedervorlage_am: "2026-11-01" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("wiedervorlage");
  });

  // Der Kern der Sache: eine Wiedervorlage muss von selbst wieder auf der Anrufliste landen.
  it("ist am Stichtag selbst fällig, nicht mehr auf Wiedervorlage", () => {
    const c = kunde({ status: "kontaktiert", last_contact: "2026-08-01", kontakt_ergebnis: "wiedervorlage", wiedervorlage_am: HEUTE });
    expect(effectiveColor(c, 3, HEUTE)).toBe("red");
  });

  it("ist nach dem Stichtag fällig, auch wenn der Kontakt frisch war", () => {
    const c = kunde({ status: "kontaktiert", last_contact: HEUTE, kontakt_ergebnis: "wiedervorlage", wiedervorlage_am: "2026-08-20" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("red");
  });

  it("zeigt kein Interesse an, unabhängig von allem anderen", () => {
    const c = kunde({ status: "kontaktiert", last_contact: HEUTE, kontakt_ergebnis: "kein_interesse" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("kein-interesse");
  });

  it("lässt kein Interesse auch eine gesetzte Wiedervorlage überstimmen", () => {
    const c = kunde({ kontakt_ergebnis: "kein_interesse", wiedervorlage_am: "2026-12-01" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("kein-interesse");
  });
});

// Der Zustand „Termin" (17.09.2026). Die Regel ist nicht gespeichert, sondern abgeleitet –
// deshalb muss sie hier festgehalten sein: Eine abgeleitete Regel, die niemand prüft, ändert
// sich beim nächsten Umbau unbemerkt.
describe("effectiveColor mit Termin", () => {
  it("schlaegt alles andere, auch kein Interesse", () => {
    const c = kunde({ kontakt_ergebnis: "kein_interesse" });
    expect(effectiveColor(c, 3, HEUTE, false)).toBe("kein-interesse");
    expect(effectiveColor(c, 3, HEUTE, true)).toBe("termin");
  });

  it("schlaegt die Wiedervorlage - der Grund zurueckzurufen ist erledigt", () => {
    const c = kunde({ wiedervorlage_am: "2026-09-30" });
    expect(effectiveColor(c, 3, HEUTE, true)).toBe("termin");
  });

  it("aendert nichts, wenn kein Termin ansteht", () => {
    expect(effectiveColor(kunde({}), 3, HEUTE, false)).toBe("red");
  });
});

describe("kundenMitTermin", () => {
  const auftrag = (teil: Record<string, unknown>) =>
    Object.assign({ customer_id: "k1", order_date: "2026-09-30", status: "offen", deleted_at: null }, teil);

  it("nimmt offene und laufende Auftraege ab heute", () => {
    expect(kundenMitTermin([auftrag({})], HEUTE).has("k1")).toBe(true);
    expect(kundenMitTermin([auftrag({ status: "in_arbeit" })], HEUTE).has("k1")).toBe(true);
  });

  it("nimmt einen Auftrag von HEUTE mit - der Tag ist noch nicht vorbei", () => {
    expect(kundenMitTermin([auftrag({ order_date: HEUTE })], HEUTE).has("k1")).toBe(true);
  });

  it("laesst Vergangenes weg - dafuer gibt es den Kontakt beim Abschliessen", () => {
    expect(kundenMitTermin([auftrag({ order_date: "2026-08-01" })], HEUTE).has("k1")).toBe(false);
  });

  it("laesst erledigte, stornierte und geloeschte weg", () => {
    expect(kundenMitTermin([auftrag({ status: "erledigt" })], HEUTE).has("k1")).toBe(false);
    expect(kundenMitTermin([auftrag({ status: "storniert" })], HEUTE).has("k1")).toBe(false);
    expect(kundenMitTermin([auftrag({ deleted_at: "2026-08-30" })], HEUTE).has("k1")).toBe(false);
  });

  it("fasst mehrere Auftraege desselben Kunden zu einem Eintrag zusammen", () => {
    const menge = kundenMitTermin([auftrag({}), auftrag({ order_date: "2026-10-05" })], HEUTE);
    expect(menge.size).toBe(1);
  });
});

// Laufkundschaft (Migration 53): der Sammelposten fuer Barverkaeufe. Er darf NIE rot werden –
// sonst stuende er fuer immer auf der Anrufliste, als „noch nicht kontaktiert" bei jemandem,
// den es als Person gar nicht gibt.
describe("Laufkundschaft als Zustand", () => {
  it("schlaegt jeden anderen Zustand, auch einen offenen Termin", () => {
    const c = kunde({ laufkundschaft: true });
    expect(effectiveColor(c, 3, HEUTE)).toBe("laufkundschaft");
    expect(effectiveColor(c, 3, HEUTE, true)).toBe("laufkundschaft");
  });

  it("schlaegt auch eine faellige Wiedervorlage und kein-Interesse", () => {
    expect(effectiveColor(kunde({ laufkundschaft: true, wiedervorlage_am: "2026-01-01" }), 3, HEUTE))
      .toBe("laufkundschaft");
    expect(effectiveColor(kunde({ laufkundschaft: true, kontakt_ergebnis: "kein_interesse" }), 3, HEUTE))
      .toBe("laufkundschaft");
  });

  it("aendert ohne das Kennzeichen nichts", () => {
    expect(effectiveColor(kunde({ laufkundschaft: false }), 3, HEUTE)).toBe("red");
  });
});

// Einmalkunde (Migration 57): keine Nadel, keine Anrufliste – außer mit Termin.
describe("effectiveColor – Einmalkunde", () => {
  it("ist ohne Termin nie rot, sondern Einmalkunde", () => {
    expect(effectiveColor(kunde({ einmalkunde: true }), 3, HEUTE)).toBe("einmalkunde");
    expect(effectiveColor(kunde({ einmalkunde: true, wiedervorlage_am: "2026-01-01" }), 3, HEUTE)).toBe("einmalkunde");
    expect(effectiveColor(kunde({ einmalkunde: true, status: "kontaktiert", last_contact: "2026-08-01" }), 3, HEUTE)).toBe("einmalkunde");
  });

  it("zeigt mit Termin den Termin – die dunkelblaue Nadel", () => {
    expect(effectiveColor(kunde({ einmalkunde: true }), 3, HEUTE, true)).toBe("termin");
  });

  it("fällt nach dem Termin nicht auf Rot zurück", () => {
    // Der Termin liegt gestern: kundenMitTermin zählt ihn nicht mehr.
    const mitTermin = kundenMitTermin([{ customer_id: "k1", order_date: "2026-08-28", status: "offen" }], HEUTE);
    expect(effectiveColor(kunde({ einmalkunde: true }), 3, HEUTE, mitTermin.has("k1"))).toBe("einmalkunde");
  });

  it("ist nach dem Herausnehmen des Hakens wieder ein normaler Kunde", () => {
    expect(effectiveColor(kunde({ einmalkunde: false }), 3, HEUTE)).toBe("red");
  });

  it("steht nicht in der Kartenreihenfolge – also keine Nadel ohne Termin", async () => {
    const { KUNDEN_ZUSTAND_REIHENFOLGE } = await import("@/lib/helpers");
    expect(KUNDEN_ZUSTAND_REIHENFOLGE).not.toContain("einmalkunde");
    expect(KUNDEN_ZUSTAND_REIHENFOLGE).toContain("termin");
  });
});

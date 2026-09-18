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
    kontakt_ergebnis: null, wiedervorlage_am: null, active: true, deleted_at: null,
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

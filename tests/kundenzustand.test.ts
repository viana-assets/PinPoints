import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/types";
import { effectiveColor } from "@/lib/helpers";

// Grundgerüst eines Kunden. Object.assign statt Streuung, weil `strict: true` sonst über
// optionale Felder stolpert (siehe tests/preislogik.test.ts, gleiches Muster).
function kunde(teil: Partial<Customer>): Customer {
  const standard: Customer = {
    id: "k1", name: "Testkunde", address: "Teststr. 1", phone_mobile: null, phone_landline: null,
    company: null, anrede: null, email: null,
    note: null, lat: null, lng: null, status: "offen", last_contact: null,
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

  it("ist orange, solange die Wiedervorlage in der Zukunft liegt", () => {
    const c = kunde({ status: "kontaktiert", last_contact: HEUTE, kontakt_ergebnis: "wiedervorlage", wiedervorlage_am: "2026-11-01" });
    expect(effectiveColor(c, 3, HEUTE)).toBe("orange");
  });

  // Der Kern der Sache: eine Wiedervorlage muss von selbst wieder auf der Anrufliste landen.
  it("ist am Stichtag selbst fällig, nicht mehr orange", () => {
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

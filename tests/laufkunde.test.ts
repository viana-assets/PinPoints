import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/types";
import { kundeFuerAuftrag, kundeZumAuftrag, laufkundeName } from "@/lib/laufkunde";
import { empfaengerFuerAuftrag } from "@/lib/rechnung";
import { getPhoneNumbers, navigationUrls } from "@/lib/helpers";

// Laufkunde am Auftrag (Migration 57).

function kunde(teil: Partial<Customer> = {}): Customer {
  const standard: Customer = {
    id: "k1", kundennummer: 10000, name: "Laufkundschaft", address: "", phone_mobile: null, phone_landline: null,
    company: null, anrede: null, email: null, note: null, lat: null, lng: null, geo_genauigkeit: null,
    status: "offen", last_contact: null, kontakt_ergebnis: null, wiedervorlage_am: null,
    laufkundschaft: true, einmalkunde: false, testkunde: false, active: true, deleted_at: null,
  };
  return Object.assign(standard, teil);
}
const auftrag = (teil: Record<string, string | null> = {}) => ({
  customer_id: "k1", laufkunde_name: null, laufkunde_telefon: null, laufkunde_ort: null, ...teil,
});

describe("kundeZumAuftrag", () => {
  it("zeigt bei der Laufkundschaft den eingetragenen Namen, die Nummer und den Einsatzort", () => {
    const k = kundeZumAuftrag(auftrag({ laufkunde_name: " Max Muster ", laufkunde_telefon: "0171 123", laufkunde_ort: "Rastplatz A9 Feucht" }), kunde())!;
    expect(k.name).toBe("Max Muster (Laufkunde)");
    expect(getPhoneNumbers(k)).toEqual([{ label: "Mobil", number: "0171 123" }]);
    expect(k.address).toBe("Rastplatz A9 Feucht");
    // Keine Koordinate: Die Navigation sucht nach dem Text.
    expect(navigationUrls(k).google).toContain(encodeURIComponent("Rastplatz A9 Feucht"));
    expect(k.id).toBe("k1");
  });

  it("ohne Namen bleibt es beim Sammelkunden – man sieht, dass etwas fehlt", () => {
    expect(kundeZumAuftrag(auftrag(), kunde())!.name).toBe("Laufkundschaft");
    expect(laufkundeName({ laufkunde_name: "  " }, { name: "Laufkundschaft" })).toBe("Laufkundschaft");
  });

  it("lässt jeden anderen Kunden unverändert", () => {
    const normal = kunde({ laufkundschaft: false, name: "Meyer", address: "Weg 1", phone_mobile: "0911" });
    expect(kundeZumAuftrag(auftrag({ laufkunde_name: "Fremd" }), normal)).toBe(normal);
  });

  it("findet den Kunden im Bestand", () => {
    expect(kundeFuerAuftrag(auftrag({ laufkunde_name: "Eva" }), [kunde()])?.name).toBe("Eva (Laufkunde)");
    expect(kundeFuerAuftrag(auftrag(), [])).toBeUndefined();
  });
});

describe("empfaengerFuerAuftrag", () => {
  it("setzt bei der Laufkundschaft den Namen als Empfänger – ohne Anschrift", () => {
    const e = empfaengerFuerAuftrag({ laufkunde_name: "Max Muster" }, kunde());
    expect(e).toEqual({ name: "Max Muster", company: null, anrede: null, address: "", email: null, kundennummer: 10000 });
  });
  it("bleibt ohne Namen beim Sammelkunden", () => {
    expect(empfaengerFuerAuftrag({ laufkunde_name: null }, kunde()).name).toBe("Laufkundschaft");
  });
  it("ändert bei normalen Kunden nichts", () => {
    const e = empfaengerFuerAuftrag({ laufkunde_name: "Fremd" }, kunde({ laufkundschaft: false, name: "Meyer", address: "Weg 1" }));
    expect(e.name).toBe("Meyer");
    expect(e.address).toBe("Weg 1");
  });
});

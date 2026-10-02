import { describe, expect, it } from "vitest";
import { anredeZeile, bestaetigungBetreff, bestaetigungText, datumLang, handynummer, versandLink, whatsappNummer } from "@/lib/terminBestaetigung";

// Terminbestätigung (E9, v104). Erfundene Daten.

const basis = {
  auftrag: { order_date: "2026-10-05", time: "09:30", end_time: "10:30" },
  kunde: { anrede: "Herr" as const, name: "Hans Muster", address: "Weg 1, 90513 Zirndorf" },
  kennzeichen: ["FÜ-AB 1"],
  betrieb: { firma: "Mobiler Reifenservice Beispiel", telefon: "0911 000" },
  heute: "2026-10-04",
};

describe("Texte", () => {
  it("Datum lang", () => {
    expect(datumLang("2026-10-05")).toBe("Montag, 5. Oktober 2026");
  });
  it("Anrede mit Nachname, ohne Anrede der Name", () => {
    expect(anredeZeile({ anrede: "Frau", name: "Petra Beispiel" })).toBe("Guten Tag Frau Beispiel,");
    expect(anredeZeile({ anrede: "Herr", name: "Muster, Hans" })).toBe("Guten Tag Herr Muster,");
    expect(anredeZeile({ anrede: null, name: "Familie Brandt" })).toBe("Guten Tag Familie Brandt,");
  });
  it("Bestätigung mit Zeitfenster, Ort, Fahrzeug und Rückrufnummer", () => {
    const t = bestaetigungText({ ...basis, art: "bestaetigung" });
    expect(t).toContain("hiermit bestätigen wir Ihren Termin am Montag, 5. Oktober 2026, zwischen 09:30 und 10:30 Uhr bei Ihnen in Weg 1, 90513 Zirndorf.");
    expect(t).toContain("Fahrzeug: FÜ-AB 1.");
    expect(t).toContain("unter 0911 000");
    expect(t.endsWith("Viele Grüße\nMobiler Reifenservice Beispiel")).toBe(true);
  });
  it("Erinnerung sagt „morgen“, ohne Uhrzeit kein Zeitfenster", () => {
    const t = bestaetigungText({ ...basis, art: "erinnerung", auftrag: { order_date: "2026-10-05", time: null, end_time: null } });
    expect(t).toContain("an Ihren Termin morgen, Montag, 5. Oktober 2026 in Weg 1");
    expect(t).not.toContain("Uhr bei");
  });
  it("Erinnerung am selben Tag sagt „heute“", () => {
    expect(bestaetigungText({ ...basis, art: "erinnerung", heute: "2026-10-05" })).toContain("an Ihren Termin heute, Montag");
  });
  it("Betreff", () => {
    expect(bestaetigungBetreff({ ...basis, art: "bestaetigung" })).toBe("Terminbestätigung 05.10.2026 09:30 Uhr – Mobiler Reifenservice Beispiel");
  });
});

describe("Links", () => {
  it("WhatsApp braucht eine Nummer mit Vorwahl", () => {
    expect(whatsappNummer("0171 1234567")).toBe("491711234567");
    expect(whatsappNummer("12345")).toBeNull();
    expect(versandLink("whatsapp", "0171 1234567", "Hallo du", "x")).toBe("https://wa.me/491711234567?text=Hallo%20du");
  });
  it("SMS und E-Mail", () => {
    expect(versandLink("sms", "0171/1234567", "a&b", "x")).toBe("sms:+491711234567?&body=a%26b");
    expect(versandLink("email", "kunde@example.org", "Text", "Betreff 1")).toBe("mailto:kunde@example.org?subject=Betreff%201&body=Text");
    expect(versandLink("email", "", "Text", "B")).toBeNull();
    expect(versandLink("sms", null, "Text", "B")).toBeNull();
  });
  it("Handynummer: Mobil, sonst ein Handy im Festnetzfeld", () => {
    expect(handynummer({ phone_mobile: "0151 222", phone_landline: "0911 1" })).toBe("0151 222");
    expect(handynummer({ phone_mobile: null, phone_landline: "0160 9998887" })).toBe("0160 9998887");
    expect(handynummer({ phone_mobile: null, phone_landline: "0911 12345" })).toBeNull();
  });
});

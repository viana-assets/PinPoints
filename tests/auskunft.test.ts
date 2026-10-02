import { describe, expect, it } from "vitest";
import { auftragZeile, auskunftDateiname, auskunftUmfang, satzZeile, stammdatenZeilen, type AuskunftDaten } from "@/lib/auskunft";

// Auskunftsauszug (E10, v103). Erfundene Daten.

const kunde = {
  id: "k1", kundennummer: 10042, name: "Petra Beispiel", company: null, anrede: "Frau", email: "pb@example.org",
  address: "Ring 2, 90763 Fürth", phone_mobile: "0170 1112223", phone_landline: null, note: null, lat: 49.47, lng: 10.99,
  last_contact: "2026-09-01", wiedervorlage_am: null, created_at: "2025-03-04T10:00:00Z", active: true, deleted_at: null,
} as unknown as AuskunftDaten["kunde"];

describe("stammdatenZeilen", () => {
  it("nur gefüllte Felder, Datum deutsch", () => {
    const z = stammdatenZeilen(kunde);
    expect(z.map((x) => x[0])).toEqual(["Kundennummer", "Anrede", "Name", "Anschrift", "Mobil", "E-Mail", "Kartenposition", "Letzter Kontakt", "Angelegt am", "Status"]);
    expect(z.find((x) => x[0] === "Letzter Kontakt")?.[1]).toBe("01.09.2026");
    expect(z.find((x) => x[0] === "Status")?.[1]).toBe("aktiv");
  });
});

describe("auftragZeile / satzZeile", () => {
  it("Auftrag mit Fahrzeug, Positionen und Testnummer", () => {
    const [kopf, text] = auftragZeile({
      nummer: -3, datum: "2026-10-05", uhrzeit: "09:30:00", titel: "Räderwechsel", beschreibung: null, status: "erledigt",
      notiz: null, storno_grund: null, geloescht: false, rechnung_noetig: true,
      positionen: [{ menge: 1, artikel: "Räderwechsel PKW", text: null, netto: 59.5, endpreis: null }, { menge: 4, artikel: "Wuchten", text: null, netto: 3, endpreis: null }],
      fahrzeuge: [{ kennzeichen: "FÜ-AB 1", kilometerstand: 81234 }],
    });
    expect(kopf).toBe("T3 · 05.10.2026 09:30");
    expect(text).toBe("Räderwechsel · Erledigt · FÜ-AB 1 81.234 km · Räderwechsel PKW; 4× Wuchten");
  });
  it("Satz mit Rädern", () => {
    const [kopf, text] = satzZeile({
      eingelagert: "2025-10-01T08:00:00Z", ausgelagert: null, saison: "winter", lager: "Halle", platz: "A3", fahrzeug: "FÜ-AB 1",
      dot: null, profil_mm: null, anzahl_raeder: 4, notiz: null,
      raeder: [{ position: "VL", groesse: "205/55 R16", dot: "2121", profil_mm: 5.5, felge: "alu", bemerkung: null }],
    });
    expect(kopf).toBe("01.10.2025 – liegt noch");
    expect(text).toBe("Winter · Halle · Platz A3 · FÜ-AB 1 · 4 Räder · VL 205/55 R16 DOT 2121 5,5 mm");
  });
});

describe("Umfang und Dateiname", () => {
  const d = { erstellt_am: "2026-10-02T12:00:00Z", kunde, kontakte: [], fahrzeuge: [], auftraege: [], reifensaetze: [], rechnungen: [], protokoll: { eintraege: 7, aeltester: null, neuester: null } } as unknown as AuskunftDaten;
  it("zählt je Abschnitt", () => {
    expect(auskunftUmfang(d).at(-1)).toEqual(["Einträge im Änderungsprotokoll", "7"]);
  });
  it("ohne Namen im Dateinamen", () => {
    expect(auskunftDateiname(d, "json")).toBe("auskunft-kd-10042-2026-10-02.json");
  });
});

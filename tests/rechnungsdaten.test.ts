import { describe, expect, it } from "vitest";
import { rechnungsdatenMaengel } from "@/lib/helpers";

// Die Abhakliste im Auftragsfenster und die Sperre am Abschluss. Ein Fehler hier heisst: ein
// Auftrag geht als abgeschlossen ins ERP, und dort fehlt die Anschrift.

const vollstaendig = { name: "Müller", address: "Hauptstr. 1, 90402 Nürnberg", email: "a@b.de" };
const auto = { kennzeichen: "N-AB 123", kilometerstand: 84000 };

describe("rechnungsdatenMaengel", () => {
  it("meldet nichts, wenn alles da ist", () => {
    expect(rechnungsdatenMaengel(vollstaendig, [auto])).toEqual([]);
  });

  it("nennt ALLE Luecken auf einmal, nicht nur die erste", () => {
    // Wer dreimal hintereinander eine Meldung bekommt, die jeweils einen weiteren Mangel
    // nennt, haelt das Programm fuer schikanoes - zu Recht.
    const m = rechnungsdatenMaengel({ name: "", address: "", email: null }, []);
    expect(m.map((x) => x.schluessel)).toEqual(["name", "adresse", "email", "fahrzeug"]);
  });

  it("zaehlt Fahrzeuge ohne Kennzeichen und ohne Kilometerstand getrennt", () => {
    const m = rechnungsdatenMaengel(vollstaendig, [
      { kennzeichen: "", kilometerstand: 1000 },
      { kennzeichen: "N-XY 1", kilometerstand: null },
      { kennzeichen: "", kilometerstand: null },
    ]);
    expect(m.find((x) => x.schluessel === "kennzeichen")?.text).toBe("2 Fahrzeuge ohne Kennzeichen");
    expect(m.find((x) => x.schluessel === "kilometerstand")?.text).toBe("2 Fahrzeuge ohne Kilometerstand");
  });

  it("schreibt die Einzahl aus", () => {
    const m = rechnungsdatenMaengel(vollstaendig, [{ kennzeichen: "", kilometerstand: 1 }]);
    expect(m[0].text).toBe("1 Fahrzeug ohne Kennzeichen");
  });

  it("haelt Kilometerstand 0 fuer eine Angabe", () => {
    // Ein fabrikneuer Wagen hat 0 km. Wuerde `0` als „fehlt" gelten, koennte man ihn nie
    // abrechnen - der klassische Fehler, `null` und `0` zu verwechseln.
    expect(rechnungsdatenMaengel(vollstaendig, [{ kennzeichen: "N-A 1", kilometerstand: 0 }])).toEqual([]);
  });

  it("haelt Leerzeichen nicht fuer eine Angabe", () => {
    const m = rechnungsdatenMaengel({ name: "  ", address: " ", email: "   " }, [auto]);
    expect(m.map((x) => x.schluessel)).toEqual(["name", "adresse", "email"]);
  });

  it("markiert nur, was sich im Auftragsfenster beheben laesst", () => {
    const m = rechnungsdatenMaengel({ name: "", address: "", email: null }, []);
    expect(m.filter((x) => x.behebbarHier).map((x) => x.schluessel)).toEqual(["email", "fahrzeug"]);
  });

  it("kommt mit einem fehlenden Kunden zurecht", () => {
    expect(rechnungsdatenMaengel(null, [auto]).length).toBe(3);
  });

  // Laufkundschaft (Migration 53): Kleinbetragsrechnung nach § 33 UStDV – weder Anschrift noch
  // Fahrzeug sind erforderlich. Dieselbe Ausnahme steht im Trigger `pruefe_rechnungsdaten()`;
  // wer eine der beiden Stellen aendert, muss beide aendern.
  it("verlangt bei Laufkundschaft gar nichts", () => {
    const lauf = { name: "Laufkundschaft", address: "", email: null, laufkundschaft: true };
    expect(rechnungsdatenMaengel(lauf, [])).toEqual([]);
  });

  it("verlangt ohne das Kennzeichen weiterhin alles", () => {
    const ohne = { name: "Laufkundschaft", address: "", email: null, laufkundschaft: false };
    expect(rechnungsdatenMaengel(ohne, []).map((x) => x.schluessel))
      .toEqual(["adresse", "email", "fahrzeug"]);
  });
});

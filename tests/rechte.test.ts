import { describe, expect, it } from "vitest";
import { RECHTE_KATALOG, RECHTE_VORGABE, VERBEN, type Verb } from "@/lib/constants";

// Der Rechtekatalog entscheidet, was in der Modulverwaltung ankreuzbar ist - und Migration 42
// setzt genau diese Bereiche in der Datenbank durch. Laufen Katalog und Vorgabe auseinander,
// steht in der Tabelle ein Haken, den niemand setzen kann, oder umgekehrt ein Recht, das
// niemand sieht.

describe("Rechtekatalog", () => {
  it("kennt jeden Bereich nur einmal", () => {
    const s = RECHTE_KATALOG.map((b) => b.schluessel);
    expect(new Set(s).size).toBe(s.length);
  });

  it("nennt fuer jeden Bereich mindestens das Lesen", () => {
    RECHTE_KATALOG.forEach((b) => {
      expect(b.verben, `${b.schluessel} kennt kein Lesen`).toContain("lesen");
    });
  });

  it("verwendet nur bekannte Verben", () => {
    RECHTE_KATALOG.forEach((b) => {
      b.verben.forEach((v) => expect(VERBEN).toContain(v));
    });
  });

  it("begruendet jede Luecke", () => {
    // Eine graue Zelle ohne Begruendung ist eine Aufforderung zum Raetselraten.
    RECHTE_KATALOG.forEach((b) => {
      if (b.verben.length < VERBEN.length) {
        expect(b.warumNicht, `${b.schluessel} laesst ein Verb weg, sagt aber nicht warum`).toBeTruthy();
      }
    });
  });

  it("hat fuer jeden Bereich eine Vorgabe", () => {
    RECHTE_KATALOG.forEach((b) => {
      expect(RECHTE_VORGABE, `Vorgabe fuer ${b.schluessel} fehlt`).toHaveProperty(b.schluessel);
    });
  });

  it("vergibt in der Vorgabe kein Verb, das es im Bereich nicht gibt", () => {
    // Sonst stuende in der Datenbank eine Rolle fuer ein Recht, das die Oberflaeche gar nicht
    // anzeigt - unsichtbar und trotzdem wirksam.
    RECHTE_KATALOG.forEach((b) => {
      const vorgabe = RECHTE_VORGABE[b.schluessel];
      (Object.keys(vorgabe) as Verb[]).forEach((v) => {
        if ((vorgabe[v] ?? []).length > 0) {
          expect(b.verben, `${b.schluessel}: Vorgabe setzt "${v}", der Bereich kennt es nicht`).toContain(v);
        }
      });
    });
  });

  it("laesst den Techniker korrigieren, aber nichts wegwerfen", () => {
    // Der Unterschied, den die zweite Ebene ueberhaupt erst ausdrueckbar macht: Eine falsch
    // eingetragene Leistung oder Radmessung wieder zu entfernen ist KORRIGIEREN und gehoert
    // zur Arbeit. Einen Auftrag, einen Kunden oder ein Lager wegzuwerfen ist etwas anderes.
    const darfKorrigieren = ["auftraege.leistungen", "lager.raeder"];
    const darfNichtWegwerfen = ["kunden", "auftraege.auftrag", "lager.regale", "artikel", "mitarbeiter", "firmenfahrzeuge"];
    darfKorrigieren.forEach((b) => {
      expect(RECHTE_VORGABE[b]?.loeschen ?? [], `${b}: Techniker kann nicht korrigieren`).toContain("techniker");
    });
    darfNichtWegwerfen.forEach((b) => {
      expect(RECHTE_VORGABE[b]?.loeschen ?? [], `${b}: Techniker darf wegwerfen`).not.toContain("techniker");
    });
  });

  it("gibt der Einlagerung kein Loeschen", () => {
    // Auslagern ist ein Schreiben (`removed_at`), geloescht wird eine Einlagerung nie. Ein
    // Loeschen-Haken dort saesse auf einer Handlung, die es nicht gibt - und wuerde
    // aussehen, als ginge es ums Auslagern.
    const e = RECHTE_KATALOG.find((b) => b.schluessel === "lager.einlagerung");
    expect(e!.verben).not.toContain("loeschen");
  });

  it("erklaert jede Zeile", () => {
    // Die Erfahrung vom 17.09.2026: „Lager und Lagerplaetze" klang nach dem ganzen Modul und
    // meinte nur die Regale. Ein Name allein traegt eine Rechteentscheidung nicht.
    RECHTE_KATALOG.forEach((b) => {
      expect(b.erklaerung, `${b.schluessel} hat keine Erklaerung`).toBeTruthy();
    });
  });

  it("haengt jede eingerueckte Zeile an ein vorhandenes Modul", () => {
    RECHTE_KATALOG.filter((b) => b.unter).forEach((b) => {
      const modul = b.schluessel.split(".")[0];
      expect(RECHTE_KATALOG.map((x) => x.schluessel), `${b.schluessel} haengt an keinem Modul`).toContain(modul);
    });
  });

  it("gibt dem Techniker keinen Blick auf Kunden, Preise und Auswertungen", () => {
    ["kunden", "artikel", "auswertung", "saison"].forEach((bereich) => {
      expect(RECHTE_VORGABE[bereich]?.lesen ?? [], `${bereich}`).not.toContain("techniker");
    });
  });
});

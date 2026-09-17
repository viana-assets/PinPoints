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

  it("gibt dem Techniker nirgends ein Loeschrecht", () => {
    // Loeschen nimmt etwas weg; das ist eine Bueroentscheidung. Aendern laesst sich das
    // jederzeit in der Modulverwaltung - aber nicht aus Versehen in der Voreinstellung.
    RECHTE_KATALOG.forEach((b) => {
      const loeschen = RECHTE_VORGABE[b.schluessel]?.loeschen ?? [];
      expect(loeschen, `${b.schluessel} laesst Techniker loeschen`).not.toContain("techniker");
    });
  });

  it("gibt dem Techniker keinen Blick auf Kunden, Preise und Auswertungen", () => {
    ["kunden", "artikel", "auswertung", "saison"].forEach((bereich) => {
      expect(RECHTE_VORGABE[bereich]?.lesen ?? [], `${bereich}`).not.toContain("techniker");
    });
  });
});

import { describe, expect, it } from "vitest";
import type { Article, OrderArticle, Rechnung } from "@/lib/types";
import {
  aufCent, positionenAusAuftrag, rechnungSummen, anschriftZeilen, girocodeText,
  stornoAus, istGueltig, NACHLASS_BEZEICHNUNG, GIROCODE_KENNUNG,
  firmaOhneInhaber, voraussichtlicheNummer,
} from "@/lib/rechnung";

// Die Zahlen auf einem Beleg sind die einzige Stelle in dieser Anwendung, an der ein Fehler
// nicht beim naechsten Speichern verschwindet. Deshalb steht hier mehr, als es nach der
// Menge Code aussieht.

function artikel(teil: Partial<Article> = {}): Article {
  return {
    id: "a1", article_number: 100, short_name: "Wechsel", long_name: "Reifenwechsel",
    active: true, abrechnungsart: "normal", fragt_einlagerung: false, einheit: "Stück", freitext: false,
    created_at: "2026-01-01", ...teil,
  };
}

function zeile(teil: Partial<OrderArticle> = {}): OrderArticle {
  return {
    id: "z1", order_id: "o1", article_id: "a1", quantity: 1, net_price: 50, vat_rate: 19,
    endpreis_netto: null, note: null, created_at: "2026-01-01", deleted_at: null, ...teil,
  };
}

describe("aufCent", () => {
  it("rundet kaufmaennisch auf zwei Stellen", () => {
    expect(aufCent(1.005)).toBe(1.01);
    expect(aufCent(2.344)).toBe(2.34);
    expect(aufCent(2.345)).toBe(2.35);
  });
});

describe("positionenAusAuftrag", () => {
  it("ohne Sonderpreis ist Gesamt gleich Menge mal Einzelpreis", () => {
    const p = positionenAusAuftrag([zeile({ quantity: 3, net_price: 50 })], [artikel()]);
    expect(p).toHaveLength(1);
    expect(p[0].einzelpreis).toBe(50);
    expect(p[0].netto).toBe(150);
    expect(p[0].bezeichnung).toBe("Reifenwechsel");
    expect(p[0].einheit).toBe("Stück");
  });

  it("Sonderpreis bei Menge 1 wird einfach zum Einzelpreis", () => {
    const p = positionenAusAuftrag([zeile({ quantity: 1, net_price: 50, endpreis_netto: 42 })], [artikel()]);
    expect(p).toHaveLength(1);
    expect(p[0].einzelpreis).toBe(42);
    expect(p[0].netto).toBe(42);
  });

  it("Sonderpreis, der glatt aufgeht, erzeugt KEINE Nachlasszeile", () => {
    const p = positionenAusAuftrag([zeile({ quantity: 4, net_price: 50, endpreis_netto: 180 })], [artikel()]);
    expect(p).toHaveLength(1);
    expect(p[0].einzelpreis).toBe(45);
    expect(p[0].netto).toBe(180);
  });

  it("Sonderpreis, der NICHT aufgeht, wird zur eigenen Nachlasszeile", () => {
    // 100 auf drei Stueck sind 33,333… – jede gerundete Zahl in der Zeile wuerde luegen.
    const p = positionenAusAuftrag([zeile({ quantity: 3, net_price: 50, endpreis_netto: 100 })], [artikel()]);
    expect(p).toHaveLength(2);
    expect(p[0].netto).toBe(150);
    expect(p[1].bezeichnung).toBe(NACHLASS_BEZEICHNUNG);
    expect(p[1].netto).toBe(-50);
    // Und die Summe stimmt trotzdem auf den Cent.
    expect(aufCent(p[0].netto + p[1].netto)).toBe(100);
  });

  it("jede Zeile geht auf: Menge mal Einzelpreis ist Gesamt", () => {
    const p = positionenAusAuftrag(
      [
        zeile({ id: "z1", quantity: 4, net_price: 25 }),
        zeile({ id: "z2", quantity: 2, net_price: 19.99, endpreis_netto: 35 }),
        zeile({ id: "z3", quantity: 3, net_price: 10, endpreis_netto: 25 }),
      ],
      [artikel()]
    );
    p.forEach((zeileP) => {
      expect(aufCent(zeileP.menge * zeileP.einzelpreis)).toBe(zeileP.netto);
    });
  });

  it("nimmt die Notiz der Position als Zusatzzeile mit", () => {
    const p = positionenAusAuftrag([zeile({ note: "Radlager Reifen VR" })], [artikel()]);
    expect(p[0].zusatz).toBe("Radlager Reifen VR");
  });

  it("ein unbekannter Artikel laesst die Rechnung nicht platzen", () => {
    const p = positionenAusAuftrag([zeile({ article_id: "weg" })], [artikel()]);
    expect(p[0].bezeichnung).toBe("Leistung");
    expect(p[0].artikelnummer).toBeNull();
  });
});

describe("rechnungSummen", () => {
  it("weist je Steuersatz getrennt aus", () => {
    const p = positionenAusAuftrag(
      [zeile({ id: "z1", quantity: 1, net_price: 100, vat_rate: 19 }),
       zeile({ id: "z2", quantity: 1, net_price: 100, vat_rate: 7 })],
      [artikel()]
    );
    const s = rechnungSummen(p, true);
    expect(s.netto).toBe(200);
    expect(s.saetze).toEqual([
      { satz: 19, netto: 100, steuer: 19 },
      { satz: 7, netto: 100, steuer: 7 },
    ]);
    expect(s.steuer).toBe(26);
    expect(s.brutto).toBe(226);
  });

  it("ohne Rechnung bleibt es beim Netto", () => {
    const p = positionenAusAuftrag([zeile({ net_price: 100 })], [artikel()]);
    const s = rechnungSummen(p, false);
    expect(s.steuer).toBe(0);
    expect(s.brutto).toBe(100);
  });

  it("die Summe der Satzzeilen ist die Gesamtsumme", () => {
    const p = positionenAusAuftrag(
      [zeile({ id: "z1", quantity: 3, net_price: 33.33, vat_rate: 19 }),
       zeile({ id: "z2", quantity: 7, net_price: 4.99, vat_rate: 19 })],
      [artikel()]
    );
    const s = rechnungSummen(p, true);
    expect(aufCent(s.saetze.reduce((x, z) => x + z.netto, 0))).toBe(s.netto);
    expect(aufCent(s.netto + s.steuer)).toBe(s.brutto);
  });
});

describe("anschriftZeilen", () => {
  const leer = { name: "", company: null, anrede: null, address: "", email: null, kundennummer: null };

  it("Firma steht ueber der Person", () => {
    expect(anschriftZeilen({ ...leer, company: "Muster GmbH", anrede: "Herr", name: "Meier", address: "Hauptstr. 1, 90402 Nürnberg" }))
      .toEqual(["Muster GmbH", "Herr Meier", "Hauptstr. 1", "90402 Nürnberg"]);
  });

  it("Zeilenumbrueche gewinnen gegen Kommas", () => {
    expect(anschriftZeilen({ ...leer, name: "Meier", address: "Hauptstr. 1, Hinterhaus\n90402 Nürnberg" }))
      .toEqual(["Meier", "Hauptstr. 1, Hinterhaus", "90402 Nürnberg"]);
  });

  it("leere Bestandteile fallen weg statt Leerzeilen zu erzeugen", () => {
    expect(anschriftZeilen({ ...leer, name: "Meier", address: "Hauptstr. 1,, 90402 Nürnberg" }))
      .toEqual(["Meier", "Hauptstr. 1", "90402 Nürnberg"]);
  });
});

function beleg(teil: Partial<Rechnung> = {}): Rechnung {
  return {
    id: "r1", nummer: 1782, nummer_text: "RE1782", art: "rechnung",
    storniert_durch: null, storniert_am: null, hebt_auf: null,
    order_id: "o1", customer_id: "k1", kundennummer: 10619,
    datum: "2026-09-18", lieferdatum: "2026-09-15",
    empfaenger: { name: "Meier", company: null, anrede: "Herr", address: "Hauptstr. 1, 90402 Nürnberg", email: null, kundennummer: 10619 },
    absender: {
      firma: "Testbetrieb", inhaber: "Paul", strasse: "Weg 1", plz: "90482", ort: "Nürnberg",
      telefon: "", email: "", webseite: "", ust_id: "", steuernummer: "",
      kontoinhaber: "PAUL GEIGER", bank: "N26", iban: "DE35 1001 1001 2622 5225 15", bic: "", logo: "",
    },
    positionen: [{ artikelnummer: 100, bezeichnung: "Reifenwechsel", zusatz: null, menge: 1, einheit: "Stück", einzelpreis: 100, netto: 100, steuersatz: 19 }],
    texte: { mit_steuer: true, anschreiben: "", fuss_zahlung: "", fuss_hinweis: "", fuss_dank: "", auftragsnummer: 7, kennzeichen: [] },
    netto: 100, steuer: 19, brutto: 119,
    created_at: "2026-09-18T08:00:00Z", created_by: null,
    ...teil,
  };
}

describe("girocodeText", () => {
  it("baut den EPC-Datensatz mit IBAN ohne Leerzeichen und Punkt-Betrag", () => {
    const t = girocodeText(beleg())!;
    const zeilen = t.split("\n");
    expect(zeilen[0]).toBe(GIROCODE_KENNUNG);
    expect(zeilen[1]).toBe("002");
    expect(zeilen[3]).toBe("SCT");
    expect(zeilen[5]).toBe("PAUL GEIGER");
    expect(zeilen[6]).toBe("DE35100110012622522515");
    expect(zeilen[7]).toBe("EUR119.00");
    expect(zeilen[10]).toBe("Rechnung RE1782");
  });

  it("ohne IBAN gibt es keinen Code statt eines kaputten", () => {
    expect(girocodeText(beleg({ absender: { ...beleg().absender, iban: "" } }))).toBeNull();
  });

  it("eine Stornorechnung bekommt keinen Zahlcode", () => {
    expect(girocodeText(beleg({ brutto: -119 }))).toBeNull();
  });
});

describe("stornoAus", () => {
  it("dreht jedes Vorzeichen und behaelt den Inhalt", () => {
    const s = stornoAus(beleg(), "2026-09-20");
    expect(s.art).toBe("storno");
    expect(s.hebt_auf).toBe("r1");
    expect(s.brutto).toBe(-119);
    expect(s.netto).toBe(-100);
    expect(s.steuer).toBe(-19);
    expect(s.positionen[0].netto).toBe(-100);
    expect(s.positionen[0].einzelpreis).toBe(-100);
    // Der Empfaenger bleibt der, an den geschickt wurde – auch wenn der Kunde inzwischen
    // umgezogen ist.
    expect(s.empfaenger).toEqual(beleg().empfaenger);
    expect(s.datum).toBe("2026-09-20");
    expect(s.lieferdatum).toBe("2026-09-15");
  });
});

describe("istGueltig", () => {
  it("eine stornierte Rechnung zaehlt nicht mehr", () => {
    expect(istGueltig(beleg())).toBe(true);
    expect(istGueltig(beleg({ storniert_durch: "r2" }))).toBe(false);
    expect(istGueltig(beleg({ art: "storno", hebt_auf: "r1" }))).toBe(false);
  });
});

describe("der Snapshot traegt den Steuerausweis selbst", () => {
  it("stornoAus uebernimmt mit_steuer unveraendert", () => {
    const s = stornoAus(beleg(), "2026-09-20");
    expect(s.texte.mit_steuer).toBe(true);
  });

  it("eine Rechnung ohne Steuer behaelt ihren Vermerk", () => {
    const ohne = beleg({
      texte: { ...beleg().texte, mit_steuer: false },
      steuer: 0, brutto: 100,
    });
    // Der Beleg sagt selbst, wie er ausgestellt wurde – er wird nicht aus `steuer !== 0`
    // erraten. Genau daran haengt der Fall „alle Positionen steuerfrei".
    expect(ohne.texte.mit_steuer).toBe(false);
    expect(stornoAus(ohne, "2026-09-20").texte.mit_steuer).toBe(false);
  });
});

describe("firmaOhneInhaber", () => {
  it("nimmt den Inhabernamen aus dem Firmennamen heraus", () => {
    // Fusszeile: „Mobiler Reifenservice" und darunter „Inhaber: Paul Geiger" – nicht zweimal
    // derselbe Name untereinander.
    expect(firmaOhneInhaber("Mobiler Reifenservice Paul Geiger", "Paul Geiger"))
      .toBe("Mobiler Reifenservice");
  });

  it("laesst den Namen stehen, wenn der Inhaber nicht darin vorkommt", () => {
    expect(firmaOhneInhaber("Reifen Nord GmbH", "Paul Geiger")).toBe("Reifen Nord GmbH");
  });

  it("achtet nicht auf Gross- und Kleinschreibung", () => {
    expect(firmaOhneInhaber("MOBILER REIFENSERVICE PAUL GEIGER", "paul geiger"))
      .toBe("MOBILER REIFENSERVICE");
  });

  it("nimmt ein Trennzeichen am Rand mit", () => {
    expect(firmaOhneInhaber("Reifenservice - Paul Geiger", "Paul Geiger")).toBe("Reifenservice");
    expect(firmaOhneInhaber("Reifenservice, Paul Geiger", "Paul Geiger")).toBe("Reifenservice");
  });

  it("findet den Namen auch am Anfang", () => {
    expect(firmaOhneInhaber("Paul Geiger Reifenservice", "Paul Geiger")).toBe("Reifenservice");
  });

  it("laesst den Namen stehen, wenn sonst nichts uebrig bliebe", () => {
    // Eine leere Zeile in der Fusszeile waere schlimmer als eine doppelte.
    expect(firmaOhneInhaber("Paul Geiger", "Paul Geiger")).toBe("Paul Geiger");
  });

  it("kommt mit leeren Angaben zurecht", () => {
    expect(firmaOhneInhaber("Reifen Nord GmbH", "")).toBe("Reifen Nord GmbH");
    expect(firmaOhneInhaber("", "Paul Geiger")).toBe("");
  });
});

describe("voraussichtlicheNummer", () => {
  it("setzt Praefix und naechste Nummer zusammen", () => {
    expect(voraussichtlicheNummer({ rechnung_praefix: "RE", rechnung_naechste_nummer: 1782 })).toBe("RE1782");
  });

  it("faellt ohne Praefix auf RE zurueck statt eine nackte Zahl zu zeigen", () => {
    expect(voraussichtlicheNummer({ rechnung_praefix: "", rechnung_naechste_nummer: 7 })).toBe("RE7");
  });
});

describe("die freie Position (Migration 50)", () => {
  const sonstiges = artikel({
    id: "frei", article_number: 12, short_name: "Sonstiges", long_name: "Sonstiges",
    freitext: true, einheit: "Pauschal",
  });

  it("der eingegebene Text ERSETZT die Bezeichnung", () => {
    const p = positionenAusAuftrag(
      [zeile({ article_id: "frei", quantity: 1, net_price: 0, endpreis_netto: 70, note: "Hilfe beim Aufbocken" })],
      [sonstiges]
    );
    expect(p).toHaveLength(1);
    expect(p[0].bezeichnung).toBe("Hilfe beim Aufbocken");
    // Nicht zusaetzlich als Zusatzzeile – sonst staende derselbe Text zweimal.
    expect(p[0].zusatz).toBeNull();
    expect(p[0].netto).toBe(70);
    expect(p[0].einheit).toBe("Pauschal");
  });

  it("ohne Eingabe bleibt der Artikelname stehen", () => {
    // Eine Rechnungszeile ohne Bezeichnung waere schlimmer als eine mit „Sonstiges".
    const p = positionenAusAuftrag(
      [zeile({ article_id: "frei", quantity: 1, net_price: 0, endpreis_netto: 70, note: null })],
      [sonstiges]
    );
    expect(p[0].bezeichnung).toBe("Sonstiges");
  });

  it("Leerzeichen allein zaehlen nicht als Eingabe", () => {
    const p = positionenAusAuftrag(
      [zeile({ article_id: "frei", quantity: 1, net_price: 0, endpreis_netto: 70, note: "   " })],
      [sonstiges]
    );
    expect(p[0].bezeichnung).toBe("Sonstiges");
  });

  it("bei einem normalen Artikel ERGAENZT der Text die Bezeichnung", () => {
    const p = positionenAusAuftrag([zeile({ note: "Radlager Reifen VR" })], [artikel()]);
    expect(p[0].bezeichnung).toBe("Reifenwechsel");
    expect(p[0].zusatz).toBe("Radlager Reifen VR");
  });
});

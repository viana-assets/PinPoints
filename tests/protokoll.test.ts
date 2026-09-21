import { describe, expect, it } from "vitest";
import { protokollFelder, protokollWert, protokollWer } from "@/lib/helpers";
import { PROTOKOLL_FELD_LABEL } from "@/lib/constants";

// Die Übersetzung roher Datenbankwerte in etwas, das jemand lesen kann. Falsch ist hier
// besonders leicht unauffällig: Eine Zahl mit Punkt statt Komma, ein Datum in ISO-Form oder
// ein „null", das aussieht wie ein Wert, fallen beim Überfliegen nicht auf – und das
// Protokoll wird ja gerade dann gelesen, wenn jemand etwas Bestimmtes sucht.

describe("protokollWert", () => {
  it("macht aus einem fehlenden Wert einen sichtbaren Strich, kein leeres Nichts", () => {
    expect(protokollWert(null)).toBe("—");
    expect(protokollWert(undefined)).toBe("—");
    expect(protokollWert("")).toBe("—");
  });

  it("schreibt Wahrheitswerte aus", () => {
    expect(protokollWert(true)).toBe("ja");
    expect(protokollWert(false)).toBe("nein");
  });

  it("schreibt Zahlen deutsch", () => {
    expect(protokollWert(12.5)).toBe("12,5");
    expect(protokollWert(4)).toBe("4");
  });

  it("formatiert ein Datum", () => {
    expect(protokollWert("2026-09-20")).toBe("20.9.2026");
  });

  it("kürzt eine Kennung, statt sie wegzulassen", () => {
    expect(protokollWert("3f2a8c1e-0000-4000-8000-000000000001")).toBe("3f2a8c1e…");
  });

  it("lässt gewöhnlichen Text stehen", () => {
    expect(protokollWert("Radwechsel Winter")).toBe("Radwechsel Winter");
  });

  it("kürzt sehr langen Text, damit eine Zeile eine Zeile bleibt", () => {
    const lang = "a".repeat(200);
    expect(protokollWert(lang)).toHaveLength(122); // 120 Zeichen + " …"
    expect(protokollWert(lang).endsWith(" …")).toBe(true);
  });
});

describe("protokollFelder", () => {
  // Der Trigger legt die VOLLSTÄNDIGE Zeile vorher und nachher ab. Interessant ist der
  // Unterschied – und zwar nur der: Eine Anzeige, die bei jeder Änderung dreißig
  // unveränderte Felder mitzeigt, versteckt die eine Änderung, um die es geht.
  it("zeigt nur das, was sich wirklich geändert hat", () => {
    const zeilen = protokollFelder(
      { title: "Radwechsel", status: "offen", note: null },
      { title: "Radwechsel", status: "in_arbeit", note: null },
      PROTOKOLL_FELD_LABEL
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ label: "Status", alt: "offen", neu: "in_arbeit" });
  });

  it("übersetzt die Feldnamen und sortiert nach Beschriftung", () => {
    const zeilen = protokollFelder(
      { status: "offen", net_price: 10 },
      { status: "in_arbeit", net_price: 12.5 },
      PROTOKOLL_FELD_LABEL
    );
    expect(zeilen.map((z) => z.label)).toEqual(["Nettopreis", "Status"]);
    expect(zeilen[0]).toMatchObject({ alt: "10,00\u00A0€", neu: "12,50\u00A0€" });
  });

  // `updated_at`/`updated_by` schreibt derselbe Trigger-Satz bei JEDER Änderung mit. Stünden
  // sie in der Liste, hätte jeder Eintrag zwei Zeilen Rauschen.
  it("verschweigt die Felder, die sich ohnehin bei jeder Änderung bewegen", () => {
    const zeilen = protokollFelder(
      { status: "offen", updated_at: "2026-09-14T10:00:00Z", updated_by: "a", id: "x" },
      { status: "offen", updated_at: "2026-09-14T11:00:00Z", updated_by: "b", id: "x" },
      PROTOKOLL_FELD_LABEL
    );
    expect(zeilen).toEqual([]);
  });

  it("nimmt beim Anlegen die ganze neue Zeile", () => {
    const zeilen = protokollFelder(null, { title: "Radwechsel", status: "offen" }, PROTOKOLL_FELD_LABEL);
    expect(zeilen.map((z) => z.label).sort()).toEqual(["Status", "Titel"]);
    expect(zeilen.every((z) => z.alt === "—")).toBe(true);
  });

  it("nimmt beim Löschen die ganze alte Zeile", () => {
    const zeilen = protokollFelder({ title: "Radwechsel" }, null, PROTOKOLL_FELD_LABEL);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ alt: "Radwechsel", neu: "—" });
  });

  // Zwei gleiche Objekte sind nie dasselbe Objekt – ein Vergleich mit === meldete hier
  // eine Änderung, die keine ist.
  it("hält zwei inhaltsgleiche Objekte für gleich", () => {
    const zeilen = protokollFelder(
      { roles: ["admin", "user"] }, { roles: ["admin", "user"] }, PROTOKOLL_FELD_LABEL
    );
    expect(zeilen).toEqual([]);
  });

  it("zeigt ein unbekanntes Feld unter seinem Rohnamen, statt es zu verschlucken", () => {
    const zeilen = protokollFelder({}, { irgendwas_neues: "x" }, PROTOKOLL_FELD_LABEL);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].label).toBe("irgendwas_neues");
  });

  it("verträgt zwei leere Seiten", () => {
    expect(protokollFelder(null, null, PROTOKOLL_FELD_LABEL)).toEqual([]);
  });
});

describe("protokollWer", () => {
  const personen = [{ id: "3f2a8c1e-0000-4000-8000-000000000001", email: "tech@viana.de" }];

  it("löst die Kennung in eine E-Mail auf", () => {
    expect(protokollWer("3f2a8c1e-0000-4000-8000-000000000001", personen)).toBe("tech@viana.de");
  });

  // Ohne angemeldeten Menschen war es wirklich das System – eine Auskunft, keine Lücke.
  it("nennt System, wenn niemand angemeldet war", () => {
    expect(protokollWer(null, personen)).toBe("System");
  });

  // Ein gelöschter Zugang steht nicht mehr in der Namensliste. Die gekürzte Kennung ist
  // weniger, als man will – aber sie ist wahr.
  it("fällt auf die gekürzte Kennung zurück, wenn der Zugang nicht mehr existiert", () => {
    expect(protokollWer("99999999-0000-4000-8000-000000000009", personen)).toBe("99999999…");
  });
});

// ---------------------------------------------------------------- Namen statt Kennungen
//
// Das Protokoll hielt fest, WAS in der Datenbank steht: `article_id: c5cc3cb9-…`. Richtig und
// fuer einen Menschen wertlos. Aufgeloest wird beim Lesen, nicht beim Schreiben.
describe("protokollWert mit Namensverzeichnis", () => {
  const namen = new Map([
    ["c5cc3cb9-1111-4111-8111-111111111111", "Reifenwechsel mobil"],
    ["67488ddc-2222-4222-8222-222222222222", "Auftrag 38"],
  ]);

  it("loest eine bekannte Kennung in Klartext auf", () => {
    expect(protokollWert("c5cc3cb9-1111-4111-8111-111111111111", namen)).toBe("Reifenwechsel mobil");
    expect(protokollWert("67488ddc-2222-4222-8222-222222222222", namen)).toBe("Auftrag 38");
  });

  it("kuerzt eine unbekannte Kennung wie bisher", () => {
    // Ein geloeschter Datensatz steht in keinem Verzeichnis. Die gekuerzte Kennung ist
    // weniger, als man will, aber wahr.
    expect(protokollWert("aaaaaaaa-3333-4333-8333-333333333333", namen)).toBe("aaaaaaaa…");
  });

  it("ohne Verzeichnis bleibt alles wie vorher", () => {
    expect(protokollWert("c5cc3cb9-1111-4111-8111-111111111111")).toBe("c5cc3cb9…");
  });

  it("laesst alles andere unberuehrt", () => {
    expect(protokollWert(50, namen)).toBe("50");
    expect(protokollWert(true, namen)).toBe("ja");
    expect(protokollWert("Radlager Reifen VR", namen)).toBe("Radlager Reifen VR");
  });
});

describe("protokollFelder laesst Rauschen weg", () => {
  it("verschweigt angelegt am und angelegt von", () => {
    // Beides steht bei einem Anlegen schon in der Kopfzeile des Eintrags – einmal als
    // Klartext oben, einmal als rohe Kennung unten ist kein zusaetzlicher Beleg.
    const felder = protokollFelder(
      null,
      { created_at: "2026-09-18T14:10:00Z", created_by: "039b29ac-4444-4444-8444-444444444444", quantity: 1 },
      { quantity: "Menge" }
    );
    expect(felder.map((f) => f.feld)).toEqual(["quantity"]);
  });

  it("verschweigt, was schon in der Kopfzeile steht", () => {
    const felder = protokollFelder(
      null,
      { order_id: "67488ddc-2222-4222-8222-222222222222", quantity: 1 },
      { quantity: "Menge", order_id: "Auftrag" },
      undefined,
      new Set(["order_id"])
    );
    expect(felder.map((f) => f.feld)).toEqual(["quantity"]);
  });
});

describe("Geld und Prozent im Protokoll", () => {
  it("ein Preis ist ein Preis und keine Stueckzahl", () => {
    // „Nettopreis 50" liest sich wie eine Anzahl.
    const felder = protokollFelder(null, { net_price: 50 }, { net_price: "Nettopreis" });
    // Das Leerzeichen vor dem Euro ist ein geschuetztes (U+00A0) – so liefert es
    // `toLocaleString`, und so gehoert es auch: Ein Betrag bricht nicht vor seiner Waehrung um.
    expect(felder[0].neu).toBe("50,00\u00A0€");
  });

  it("ein Steuersatz bekommt sein Prozentzeichen", () => {
    const felder = protokollFelder(null, { vat_rate: 19 }, { vat_rate: "Steuersatz" });
    expect(felder[0].neu).toBe("19 %");
  });

  it("eine gewoehnliche Zahl bleibt eine Zahl", () => {
    const felder = protokollFelder(null, { quantity: 4 }, { quantity: "Menge" });
    expect(felder[0].neu).toBe("4");
  });
});

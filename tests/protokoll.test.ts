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
    expect(zeilen[0]).toMatchObject({ alt: "10", neu: "12,5" });
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

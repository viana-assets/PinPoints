import { describe, expect, it } from "vitest";
import { dateiName, mmZuPx, textKuerzen, umbrechen, PX_PRO_MM } from "@/lib/etikettBild";

// Das Etikett als Bild (21.09.2026) – der Weg für Drucker ohne AirPrint.
//
// Geprüft wird hier die RECHNUNG, nicht das Aussehen: Millimeter in Bildpunkte, das Kürzen
// von Text und der Dateiname. Wie es am Ende aussieht, zeigt nur ein erzeugtes Bild; das ist
// beim Bauen mit einem echten Browser gemessen worden (Maße und Lesbarkeit des QR-Codes nach
// simuliertem Thermodruck).

// Ein Messgerät für Text ohne Browser: jedes Zeichen ist 10 Einheiten breit. Damit lassen
// sich die Grenzfälle rechnen, ohne eine Schrift zu laden.
const messen = (t: string) => t.length * 10;

describe("mmZuPx", () => {
  // 8 Punkte je Millimeter sind 203 dpi – die Auflösung dieser Etikettendrucker. Trifft das
  // nicht, muss der Drucker das Bild umrechnen, und genau das macht QR-Codes unlesbar.
  it("rechnet Millimeter in die Auflösung des Druckers um", () => {
    expect(PX_PRO_MM).toBe(8);
    expect(mmZuPx(50)).toBe(400);
    expect(mmZuPx(30)).toBe(240);
    expect(mmZuPx(80)).toBe(640);
  });

  it("rundet auf ganze Bildpunkte", () => {
    expect(mmZuPx(2.1)).toBe(17);
    expect(Number.isInteger(mmZuPx(1.5))).toBe(true);
  });
});

describe("textKuerzen", () => {
  it("lässt Text stehen, der passt", () => {
    expect(textKuerzen("Halle 1", 100, messen)).toBe("Halle 1");
  });

  // Eine abgeschnittene Angabe, die wie eine vollständige aussieht, ist schlimmer als eine
  // sichtbar gekürzte: Aus „6,0 mm" wurde einmal „6,0 m", und das las sich wie eine Messung.
  it("macht das Kürzen sichtbar, statt stillschweigend abzuschneiden", () => {
    const k = textKuerzen("Mobiler Reifenservice", 100, messen);
    expect(k.endsWith("…")).toBe(true);
    expect(messen(k)).toBeLessThanOrEqual(100);
  });

  it("gibt nichts zurück, wenn nicht einmal ein Zeichen passt", () => {
    expect(textKuerzen("Test", 5, messen)).toBe("");
    expect(textKuerzen("Test", 0, messen)).toBe("");
  });
});

describe("umbrechen", () => {
  it("bricht an Wortgrenzen um", () => {
    expect(umbrechen("Meyer und Sohn", 100, 2, messen)).toEqual(["Meyer und", "Sohn"]);
  });

  // Der eigentliche Grund für diese Funktion: Der Kundenname darf zwei Zeilen brauchen, aber
  // nicht das halbe Etikett.
  it("hält die Zeilenzahl ein", () => {
    const zeilen = umbrechen("Ein sehr langer Name mit vielen Wörtern darin", 100, 2, messen);
    expect(zeilen).toHaveLength(2);
  });

  // Fallen Wörter weg, MUSS man das sehen. Beim ersten Entwurf endete „Mobiler Reifenservice
  // Musterbetrieb GmbH" nach zwei Zeilen einfach – und sah vollständig aus.
  it("zeigt an, wenn hinten Wörter weggefallen sind", () => {
    const zeilen = umbrechen("Ein sehr langer Name mit vielen Wörtern darin", 100, 2, messen);
    expect(zeilen[1].endsWith("…")).toBe(true);
  });

  it("setzt kein Auslassungszeichen, wenn alles hineinpasst", () => {
    const zeilen = umbrechen("Meyer und Sohn", 100, 2, messen);
    expect(zeilen.some((z) => z.includes("…"))).toBe(false);
  });

  it("verträgt leeren Text", () => {
    expect(umbrechen("", 100, 2, messen)).toEqual([]);
    expect(umbrechen("   ", 100, 2, messen)).toEqual([]);
  });
});

describe("dateiName", () => {
  // Der Name steht im Teilen-Menü und im Dateispeicher. „Mustermann-VL.png" sagt dort mehr
  // als „etikett-1.png".
  it("macht aus dem Kundennamen einen brauchbaren Dateinamen", () => {
    expect(dateiName("Meyer & Sohn GmbH", 1, 1)).toBe("Meyer-Sohn-GmbH.png");
  });

  it("schreibt Umlaute aus, statt sie zu verschlucken", () => {
    expect(dateiName("Müller Schön", 1, 1)).toBe("Mueller-Schoen.png");
    expect(dateiName("Weiß", 1, 1)).toBe("Weiss.png");
  });

  // Vier Rad-Etiketten müssen vier unterscheidbare Dateien werden – sonst überschreibt die
  // Drucker-App sie gegenseitig oder zeigt viermal denselben Namen an.
  it("nummeriert, sobald es mehrere sind", () => {
    expect(dateiName("Meyer VL", 1, 4)).toBe("Meyer-VL-1.png");
    expect(dateiName("Meyer HR", 4, 4)).toBe("Meyer-HR-4.png");
  });

  it("fällt auf einen Namen zurück, wenn nichts Brauchbares übrig bleibt", () => {
    expect(dateiName("···", 1, 1)).toBe("etikett.png");
  });
});

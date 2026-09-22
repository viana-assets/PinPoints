import { describe, expect, it } from "vitest";
import { auftragsZeitraum, hhmmAus, layoutSpalten, minutenAus, terminAusKlick, zeitfenster } from "@/lib/calendar";

// Die Rechnung hinter Tages- und Wochenansicht. Ein Fehler ist hier besonders tückisch: Er
// sieht nicht nach einem Fehler aus, sondern nach einem leeren Kalender oder nach einem
// Termin, den es gar nicht gibt.

describe("minutenAus", () => {
  it("rechnet eine Uhrzeit in Minuten um", () => {
    expect(minutenAus("08:30")).toBe(510);
    expect(minutenAus("00:00")).toBe(0);
    expect(minutenAus("23:59")).toBe(1439);
  });

  it("verträgt eine fehlende führende Null", () => {
    expect(minutenAus("8:05")).toBe(485);
  });

  // Der wichtigste Fall: „keine Angabe" darf nicht zu Mitternacht werden. Sonst stünde jeder
  // Auftrag ohne Uhrzeit jeden Tag ganz oben im Raster.
  it("unterscheidet: keine Uhrzeit ist nicht Mitternacht", () => {
    expect(minutenAus(null)).toBeNull();
    expect(minutenAus("")).toBeNull();
    expect(minutenAus("nachmittags")).toBeNull();
    expect(minutenAus("00:00")).toBe(0);
  });

  it("weist unmögliche Uhrzeiten ab", () => {
    expect(minutenAus("25:00")).toBeNull();
    expect(minutenAus("10:75")).toBeNull();
  });
});

describe("hhmmAus", () => {
  it("schreibt Minuten als Uhrzeit mit führender Null", () => {
    expect(hhmmAus(510)).toBe("08:30");
    expect(hhmmAus(0)).toBe("00:00");
  });

  // Ein Termin, der rechnerisch über Mitternacht liefe, gehört in seinen Tag – nicht in den
  // nächsten, wo ihn niemand suchen würde.
  it("deckelt bei 23:59 statt in den Folgetag zu rutschen", () => {
    expect(hhmmAus(24 * 60)).toBe("23:59");
    expect(hhmmAus(30 * 60)).toBe("23:59");
  });
});

describe("auftragsZeitraum", () => {
  it("nimmt Anfang und Ende, wenn beide dastehen", () => {
    expect(auftragsZeitraum({ time: "08:00", end_time: "09:30" }, 60))
      .toEqual({ start: 480, ende: 570, geschaetzt: false });
  });

  it("schätzt das Ende über die Standarddauer, wenn keines gepflegt ist", () => {
    expect(auftragsZeitraum({ time: "08:00", end_time: null }, 45))
      .toEqual({ start: 480, ende: 525, geschaetzt: true });
  });

  // Ein Ende vor dem Anfang ist keine Angabe, sondern ein Fehler in den Daten. Gezeichnet
  // würde daraus ein Block mit negativer Höhe – also gar keiner.
  it("fällt auf die Standarddauer zurück, wenn das Ende vor dem Anfang liegt", () => {
    expect(auftragsZeitraum({ time: "10:00", end_time: "09:00" }, 60))
      .toEqual({ start: 600, ende: 660, geschaetzt: true });
  });

  it("gibt ohne Startzeit gar keinen Zeitraum zurück", () => {
    expect(auftragsZeitraum({ time: null, end_time: "09:00" }, 60)).toBeNull();
  });
});

describe("layoutSpalten", () => {
  it("lässt einen einzelnen Termin die volle Breite haben", () => {
    const r = layoutSpalten([{ start: 480, ende: 540 }]);
    expect(r[0]).toMatchObject({ spalte: 0, spalten: 1 });
  });

  it("stellt zwei gleichzeitige Termine nebeneinander", () => {
    const r = layoutSpalten([{ start: 480, ende: 600 }, { start: 510, ende: 570 }]);
    expect(r.map((t) => t.spalte)).toEqual([0, 1]);
    expect(r.every((t) => t.spalten === 2)).toBe(true);
  });

  it("gibt aufeinanderfolgenden Terminen wieder die volle Breite", () => {
    const r = layoutSpalten([{ start: 480, ende: 540 }, { start: 540, ende: 600 }]);
    expect(r.every((t) => t.spalten === 1 && t.spalte === 0)).toBe(true);
  });

  // Der Fall, für den das zweistufige Verfahren überhaupt da ist: A überschneidet B, B
  // überschneidet C, A und C berühren sich nicht. Zählte man nur direkte Überschneidungen,
  // bekäme C die halbe Breite und läge unter A.
  it("hält mittelbar verbundene Termine in derselben Aufteilung", () => {
    const r = layoutSpalten([
      { start: 480, ende: 600 },  // A 8:00–10:00
      { start: 540, ende: 660 },  // B 9:00–11:00
      { start: 620, ende: 720 },  // C 10:20–12:00
    ]);
    expect(r.every((t) => t.spalten === 2)).toBe(true);
    expect(r.map((t) => t.spalte)).toEqual([0, 1, 0]);
  });

  it("verteilt drei gleichzeitige Termine auf drei Spalten", () => {
    const r = layoutSpalten([
      { start: 480, ende: 600 }, { start: 490, ende: 600 }, { start: 500, ende: 600 },
    ]);
    expect(r.every((t) => t.spalten === 3)).toBe(true);
    expect(r.map((t) => t.spalte).sort()).toEqual([0, 1, 2]);
  });

  // Hier wird nach Kennung geprüft und nicht nach Position: `layoutSpalten` gibt die Termine
  // SORTIERT zurück, nicht in der Eingabereihenfolge. Ein Test, der sich auf die Position
  // verlässt, prüft in Wahrheit die Sortierung.
  it("gibt eine Spalte wieder frei, sobald der Termin darin zu Ende ist", () => {
    const r = layoutSpalten([
      { id: "kurz",  start: 480, ende: 540 },  // 8:00–9:00
      { id: "lang",  start: 480, ende: 660 },  // 8:00–11:00
      { id: "danach", start: 545, ende: 600 }, // 9:05–10:00 – „kurz" ist vorbei
    ]);
    const spalte = Object.fromEntries(r.map((t) => [t.id, t.spalte]));
    expect(spalte.lang).toBe(0);
    expect(spalte.kurz).toBe(1);
    // Nicht Spalte 2: Die Spalte von „kurz" ist um 9:00 wieder frei.
    expect(spalte.danach).toBe(1);
    expect(r.every((t) => t.spalten === 2)).toBe(true);
  });

  it("verträgt eine leere Liste", () => {
    expect(layoutSpalten([])).toEqual([]);
  });
});

describe("zeitfenster", () => {
  it("nimmt ohne Termine das Grundfenster", () => {
    expect(zeitfenster([])).toEqual({ vonStunde: 7, bisStunde: 19 });
  });

  it("dehnt sich nach oben und unten aus, wenn ein Termin herausragt", () => {
    expect(zeitfenster([{ start: 6 * 60 + 30, ende: 20 * 60 + 15 }]))
      .toEqual({ vonStunde: 6, bisStunde: 21 });
  });

  // Enger als das Grundfenster wird es nie – sonst hätte die Ansicht bei jedem Tageswechsel
  // eine andere Höhe, und die Stundenlinien lägen jedes Mal woanders.
  it("wird durch einen kurzen Tag nicht enger", () => {
    expect(zeitfenster([{ start: 10 * 60, ende: 11 * 60 }]))
      .toEqual({ vonStunde: 7, bisStunde: 19 });
  });
});

// Der Klick in eine freie Stelle des Rasters. Ein Fehler hier ist besonders unangenehm, weil
// er nicht auffällt: Der Auftrag entsteht, er steht nur zur falschen Zeit im Kalender.
describe("terminAusKlick", () => {
  // 52 px je Stunde ist die Voreinstellung, das Fenster beginnt um 7 Uhr.
  const px = 52;
  const von7 = 7 * 60;

  it("trifft die Stunde, auf deren Linie geklickt wurde", () => {
    expect(terminAusKlick(0, px, von7, 60)).toEqual({ von: "07:00", bis: "08:00" });
    expect(terminAusKlick(3 * px, px, von7, 60)).toEqual({ von: "10:00", bis: "11:00" });
  });

  it("rundet auf die Viertelstunde ab, nicht zur nächsten", () => {
    // 20 Minuten nach 10 Uhr: 13 px bei 39 px/Stunde – wer knapp unter die Linie tippt, soll
    // nicht in der Stunde davor landen.
    expect(terminAusKlick(3 * px + px * 20 / 60, px, von7, 60).von).toBe("10:15");
    expect(terminAusKlick(3 * px + px * 14 / 60, px, von7, 60).von).toBe("10:00");
    expect(terminAusKlick(3 * px + px * 59 / 60, px, von7, 60).von).toBe("10:45");
  });

  it("nimmt die Dauer aus dem Terminraster des Betriebs", () => {
    expect(terminAusKlick(0, px, von7, 90)).toEqual({ von: "07:00", bis: "08:30" });
    expect(terminAusKlick(0, px, von7, 30)).toEqual({ von: "07:00", bis: "07:30" });
  });

  it("läuft nicht über Mitternacht hinaus", () => {
    // Klick ganz unten in einen bis 24 Uhr herausgezoomten Tag.
    expect(terminAusKlick(23.9 * px, px, 0, 120)).toEqual({ von: "23:45", bis: "23:59" });
  });

  it("verträgt einen Klick oberhalb des Fensterbeginns", () => {
    // Kann durch das Polster über der ersten Stundenlinie entstehen: negative Position.
    expect(terminAusKlick(-9, px, 0, 60).von).toBe("00:00");
  });
});

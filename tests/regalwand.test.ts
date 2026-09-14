import { describe, expect, it } from "vitest";
import { dotJahr, handlungsgruende, nachReihen, reiheAusCode } from "@/lib/helpers";
import { DOT_ALT_JAHRE, LAGERDAUER_HINWEIS_TAGE, PROFIL_KRITISCH_MM } from "@/lib/constants";

// Die Regeln hinter der Regalwand. Sie entscheiden, wo eine Kachel hängt und ob ein oranger
// Punkt darauf sitzt – beides Aussagen über das echte Lager, beide leicht unauffällig falsch.

const GRENZEN = {
  kritischMm: PROFIL_KRITISCH_MM,
  dotJahre: DOT_ALT_JAHRE,
  liegtTage: LAGERDAUER_HINWEIS_TAGE,
};

const HEUTE = new Date("2026-09-14T10:00:00Z");

function satz(felder: Partial<Parameters<typeof handlungsgruende>[0]> = {}) {
  return {
    erfassungsart: "sammel" as const,
    profiltiefe_mm: 6,
    dot_date: "2524",
    created_at: "2026-04-01T08:00:00Z",
    ...felder,
  };
}

describe("reiheAusCode", () => {
  it("trennt das Präfix von der laufenden Nummer", () => {
    expect(reiheAusCode("BC-01")).toEqual({ reihe: "BC", nummer: 1 });
    expect(reiheAusCode("A-20")).toEqual({ reihe: "A", nummer: 20 });
  });

  it("versteht Handeingaben ohne Bindestrich", () => {
    expect(reiheAusCode("A01")).toEqual({ reihe: "A", nummer: 1 });
    expect(reiheAusCode("A 7")).toEqual({ reihe: "A", nummer: 7 });
  });

  it("nimmt eine reine Nummer als Platz ohne Reihe", () => {
    expect(reiheAusCode("12")).toEqual({ reihe: "", nummer: 12 });
  });

  it("behält die Reihe, auch wenn hinter dem Strich keine Zahl steht", () => {
    expect(reiheAusCode("A-2b")).toEqual({ reihe: "A", nummer: null });
  });

  it("wirft nicht sortierbare Codes in die namenlose Reihe, statt je Code eine aufzumachen", () => {
    expect(reiheAusCode("Regal links")).toEqual({ reihe: "", nummer: null });
    expect(reiheAusCode("  ")).toEqual({ reihe: "", nummer: null });
  });
});

describe("nachReihen", () => {
  it("bündelt nach Präfix und behält die Reihenfolge des ersten Auftretens", () => {
    const reihen = nachReihen([{ code: "A-01" }, { code: "BC-01" }, { code: "A-02" }]);
    expect(reihen.map((r) => r.reihe)).toEqual(["A", "BC"]);
    expect(reihen[0].plaetze.map((p) => p.code)).toEqual(["A-01", "A-02"]);
  });

  // Der eigentliche Grund für diese Funktion: alphabetisch steht „A-10" vor „A-2".
  it("sortiert einstellige Nummern richtig – nicht alphabetisch", () => {
    const reihen = nachReihen([{ code: "A-1" }, { code: "A-10" }, { code: "A-2" }]);
    expect(reihen[0].plaetze.map((p) => p.code)).toEqual(["A-1", "A-2", "A-10"]);
  });

  it("stellt Plätze ohne Nummer hinter die nummerierten", () => {
    const reihen = nachReihen([{ code: "A-Ecke" }, { code: "A-3" }, { code: "A-1" }]);
    expect(reihen[0].plaetze.map((p) => p.code)).toEqual(["A-1", "A-3", "A-Ecke"]);
  });

  it("liefert für ein leeres Lager keine Reihe", () => {
    expect(nachReihen([])).toEqual([]);
  });
});

describe("dotJahr", () => {
  it("liest das Jahr aus dem vierstelligen Kürzel", () => {
    expect(dotJahr("2523")).toBe(2023);
    expect(dotJahr("0126")).toBe(2026);
  });

  it("schluckt Trennzeichen", () => {
    expect(dotJahr("25/23")).toBe(2023);
  });

  it("deutet Jahreszahlen über 60 als letztes Jahrhundert", () => {
    expect(dotJahr("1295")).toBe(1995);
  });

  it("gibt nichts zurück, wo nichts Verwertbares steht", () => {
    expect(dotJahr(null)).toBeNull();
    expect(dotJahr("")).toBeNull();
    expect(dotJahr("23")).toBeNull();
    expect(dotJahr("Sommer")).toBeNull();
  });
});

describe("handlungsgruende", () => {
  it("schweigt bei einem frisch gemessenen, jungen Satz", () => {
    expect(handlungsgruende(satz(), [], GRENZEN, HEUTE)).toEqual([]);
  });

  it("meldet ein Profil unter der kritischen Grenze mit der Zahl", () => {
    const gruende = handlungsgruende(satz({ profiltiefe_mm: 2.4 }), [], GRENZEN, HEUTE);
    expect(gruende).toEqual(["Profil 2,4 mm – unter 3,0 mm"]);
  });

  it("lässt die Grenze selbst noch durchgehen", () => {
    expect(handlungsgruende(satz({ profiltiefe_mm: 3 }), [], GRENZEN, HEUTE)).toEqual([]);
  });

  it("meldet eine fehlende Messung – das ist etwas anderes als ein guter Wert", () => {
    expect(handlungsgruende(satz({ profiltiefe_mm: null }), [], GRENZEN, HEUTE))
      .toEqual(["Profiltiefe nie gemessen"]);
  });

  // Bei Einzelerfassung steht der Wert an den Rädern; das schwächste Rad entscheidet.
  it("nimmt bei Einzelerfassung das schwächste Rad", () => {
    const einzeln = satz({ erfassungsart: "einzeln", profiltiefe_mm: null });
    const raeder = [{ profiltiefe_mm: 5.2 }, { profiltiefe_mm: 2.8 }];
    expect(handlungsgruende(einzeln, raeder, GRENZEN, HEUTE))
      .toEqual(["Profil 2,8 mm – unter 3,0 mm"]);
  });

  it("meldet einen einzeln erfassten Satz ohne ein einziges gemessenes Rad als ungemessen", () => {
    const einzeln = satz({ erfassungsart: "einzeln", profiltiefe_mm: null });
    expect(handlungsgruende(einzeln, [{ profiltiefe_mm: null }], GRENZEN, HEUTE))
      .toEqual(["Profiltiefe nie gemessen"]);
  });

  it("meldet alte Reifen mit Jahr und Alter", () => {
    expect(handlungsgruende(satz({ dot_date: "2518" }), [], GRENZEN, HEUTE))
      .toEqual(["Reifen von 2018 – 8 Jahre alt"]);
  });

  it("schweigt ein Jahr vor der Altersgrenze", () => {
    expect(handlungsgruende(satz({ dot_date: "2521" }), [], GRENZEN, HEUTE)).toEqual([]);
  });

  it("meldet einen Satz, der eine ganze Saison übersprungen hat", () => {
    expect(handlungsgruende(satz({ created_at: "2025-03-01T08:00:00Z" }), [], GRENZEN, HEUTE))
      .toEqual(["liegt seit 18 Monaten unberührt"]);
  });

  it("sammelt mehrere Gründe, statt beim ersten aufzuhören", () => {
    const alt = satz({ profiltiefe_mm: 1.9, dot_date: "1017", created_at: "2024-06-01T08:00:00Z" });
    expect(handlungsgruende(alt, [], GRENZEN, HEUTE)).toEqual([
      "Profil 1,9 mm – unter 3,0 mm",
      "Reifen von 2017 – 9 Jahre alt",
      "liegt seit 27 Monaten unberührt",
    ]);
  });

  it("verträgt ein unlesbares Einlagerungsdatum, statt eine Zeile Unsinn zu erzeugen", () => {
    expect(handlungsgruende(satz({ created_at: "irgendwas" }), [], GRENZEN, HEUTE)).toEqual([]);
  });
});

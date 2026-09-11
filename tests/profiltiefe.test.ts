import { describe, expect, it } from "vitest";
import { satzProfilMm, profilLage, profilText, raederNachSatz } from "@/lib/helpers";
import { PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM } from "@/lib/constants";

const GRENZEN = { hinweis: PROFIL_HINWEIS_MM, kritisch: PROFIL_KRITISCH_MM };

// Die Profiltiefe entscheidet, ob ein Kunde angesprochen wird – und sie ist die Zahl, die am
// Ende in einem Verkaufsgespräch steht. Ein Rechenfehler fällt hier nicht als Absturz auf,
// sondern als Satz „Ihre Reifen sind noch gut", der nicht stimmt.
// Konzept: docs/lager-ausbaukonzept.md, A1.

describe("satzProfilMm", () => {
  it("nimmt bei Sammelmessung den Wert am Satz", () => {
    expect(satzProfilMm({ erfassungsart: "sammel", profiltiefe_mm: 4.5 }, [])).toBe(4.5);
  });

  it("ignoriert bei Sammelmessung etwaige Radzeilen", () => {
    // Die Datenbank lässt diese Kombination gar nicht erst zu (Migration 33). Sollte sie doch
    // einmal entstehen, gilt die Erfassungsart – nicht das, was zufällig mehr Zeilen hat.
    expect(satzProfilMm({ erfassungsart: "sammel", profiltiefe_mm: 6 }, [{ profiltiefe_mm: 2 }])).toBe(6);
  });

  it("nimmt bei Einzelerfassung das SCHWÄCHSTE Rad, nicht den Durchschnitt", () => {
    const raeder = [{ profiltiefe_mm: 5.2 }, { profiltiefe_mm: 5.0 }, { profiltiefe_mm: 3.1 }, { profiltiefe_mm: 3.4 }];
    expect(satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null }, raeder)).toBe(3.1);
  });

  it("übergeht Räder ohne Messwert", () => {
    const raeder = [{ profiltiefe_mm: null }, { profiltiefe_mm: 4.2 }];
    expect(satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null }, raeder)).toBe(4.2);
  });

  it("sagt „unbekannt“ statt 0, wenn nichts gemessen wurde", () => {
    // 0 wäre eine Aussage („durchgefahren"), null ist die Wahrheit („nicht gemessen").
    expect(satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null }, [])).toBeNull();
    expect(satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null }, [{ profiltiefe_mm: null }])).toBeNull();
    expect(satzProfilMm({ erfassungsart: "sammel", profiltiefe_mm: null }, [])).toBeNull();
  });
});

describe("profilLage", () => {
  it("stuft an den Grenzen richtig ein", () => {
    expect(profilLage(6, GRENZEN)).toBe("gut");
    expect(profilLage(4, GRENZEN)).toBe("gut");        // 4,0 ist noch in Ordnung
    expect(profilLage(3.9, GRENZEN)).toBe("hinweis");
    expect(profilLage(3, GRENZEN)).toBe("hinweis");    // 3,0 ist noch nicht kritisch
    expect(profilLage(2.9, GRENZEN)).toBe("kritisch");
    expect(profilLage(1.5, GRENZEN)).toBe("kritisch"); // unter dem gesetzlichen Minimum
  });

  it("behandelt „nicht gemessen“ als eigenen Zustand", () => {
    expect(profilLage(null, GRENZEN)).toBe("ohne");
  });
});

describe("profilText", () => {
  it("schreibt deutsch mit Komma und einer Nachkommastelle", () => {
    expect(profilText(3.1)).toBe("3,1 mm");
    expect(profilText(6)).toBe("6,0 mm");
    expect(profilText(null)).toBe("–");
  });
});

describe("raederNachSatz", () => {
  const raeder = [
    { id: "a", tire_storage_id: "s1", profiltiefe_mm: 5.2 },
    { id: "b", tire_storage_id: "s2", profiltiefe_mm: 2.4 },
    { id: "c", tire_storage_id: "s1", profiltiefe_mm: 3.1 },
  ];

  it("gruppiert je Satz und behält die Reihenfolge", () => {
    const nach = raederNachSatz(raeder);
    expect(nach.get("s1")?.map((r) => r.id)).toEqual(["a", "c"]);
    expect(nach.get("s2")?.map((r) => r.id)).toEqual(["b"]);
  });

  it("liefert für einen Satz ohne Räder nichts – nicht ein leeres Etwas", () => {
    expect(raederNachSatz(raeder).get("s3")).toBeUndefined();
  });

  it("verträgt eine leere Liste", () => {
    expect(raederNachSatz([]).size).toBe(0);
  });
});

// Der Filter „nur mit schwachem Profil" aus der Saisonliste (app/page.tsx) und die Zahl in
// ihrer Kopfzeile (SaisonPanel) müssen dieselbe Regel verwenden – sonst zeigt die Liste drei
// Zeilen und die Überschrift behauptet fünf. Die Regel steht hier als das, was sie ist: eine
// Aussage über EINEN Satz.
function istSchwach(
  satz: { erfassungsart?: "sammel" | "einzeln"; profiltiefe_mm: number | null },
  raeder: { profiltiefe_mm: number | null }[]
): boolean {
  const mm = satzProfilMm(satz, raeder);
  return mm != null && mm < PROFIL_KRITISCH_MM;
}

describe("Filter „schwaches Profil“", () => {
  it("greift beim Sammelwert", () => {
    expect(istSchwach({ erfassungsart: "sammel", profiltiefe_mm: 2.5 }, [])).toBe(true);
    expect(istSchwach({ erfassungsart: "sammel", profiltiefe_mm: 4.0 }, [])).toBe(false);
  });

  it("greift, wenn EIN Rad schwach ist – auch wenn die anderen gut sind", () => {
    const raeder = [{ profiltiefe_mm: 7 }, { profiltiefe_mm: 7 }, { profiltiefe_mm: 7 }, { profiltiefe_mm: 2.8 }];
    expect(istSchwach({ erfassungsart: "einzeln", profiltiefe_mm: null }, raeder)).toBe(true);
  });

  it("zählt genau 3,0 mm noch nicht als schwach", () => {
    expect(istSchwach({ erfassungsart: "sammel", profiltiefe_mm: PROFIL_KRITISCH_MM }, [])).toBe(false);
  });

  it("führt einen ungemessenen Satz NICHT als schwach", () => {
    // Über ihn ist nichts bekannt. Ihn mitzuzählen hieße, eine Messung zu behaupten, die es
    // nicht gibt – und der Anruf beim Kunden fiele entsprechend aus.
    expect(istSchwach({ erfassungsart: "sammel", profiltiefe_mm: null }, [])).toBe(false);
    expect(istSchwach({ erfassungsart: "einzeln", profiltiefe_mm: null }, [])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  arbeitMs, dauerText, kalenderwoche, offeneSchichten, pauseMs, pauseZuKurz, personenWoche, schichtAusFormular,
  formularAusSchicht, tagAuswerten, uhrText, wocheAuswerten, wochenMontag, wochenTage, wochenTitel, zustand, type ZeitSchicht,
} from "@/lib/zeiterfassung";

// Die Regeln hinter der Stempeluhr (lib/zeiterfassung.ts, Migration 82, v131).

const ort = (tag: string, uhr: string) => new Date(`${tag}T${uhr}:00`).toISOString();
function schicht(id: string, tag: string, von: string, bis: string | null, pausen: [string, string | null][] = [], felder: Partial<ZeitSchicht> = {}): ZeitSchicht {
  return {
    id, profile_id: "jan", beginn: ort(tag, von), ende: bis ? ort(tag, bis) : null,
    pausen: pausen.map(([a, b]) => ({ beginn: ort(tag, a), ende: b ? ort(tag, b) : null })), ...felder,
  };
}

describe("Zeiten zählen", () => {
  it("Arbeitszeit ohne Pausen; offene Schicht bis jetzt", () => {
    const s = schicht("a", "2026-10-08", "07:15", "15:55", [["09:40", "10:10"], ["12:00", "12:15"]]);
    expect(dauerText(pauseMs(s, 0))).toBe("0:45");
    expect(dauerText(arbeitMs(s, 0))).toBe("7:55");
    const offen = schicht("b", "2026-10-08", "07:15", null, [["09:40", null]]);
    const jetzt = new Date(ort("2026-10-08", "10:00")).getTime();
    expect(dauerText(arbeitMs(offen, jetzt))).toBe("2:25");
    expect(zustand(offen)).toBe("pause");
    expect(zustand({ ...offen, pausen: [] })).toBe("laeuft");
    expect(zustand(s)).toBe("aus");
    expect(zustand(null)).toBe("aus");
  });
  it("Texte", () => {
    expect(uhrText(3 * 3600_000 + 17 * 60_000 + 42_000)).toBe("3:17:42");
    expect(dauerText(-5)).toBe("0:00");
    expect(dauerText(40 * 3600_000 + 2 * 60_000)).toBe("40:02");
  });
});

describe("Woche", () => {
  it("Montag, Tage, KW, Titel", () => {
    expect(wochenMontag("2026-10-08")).toBe("2026-10-05");
    expect(wochenMontag("2026-10-11")).toBe("2026-10-05");
    expect(wochenMontag("2026-10-05")).toBe("2026-10-05");
    expect(wochenTage("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(kalenderwoche("2026-10-08")).toBe(41);
    expect(kalenderwoche("2026-01-01")).toBe(1);
    expect(wochenTitel("2026-10-05")).toBe("KW 41 · 5.–11.10.");
    expect(wochenTitel("2026-09-28")).toBe("KW 40 · 28.9.–4.10.");
  });

  it("Tageshinweise: Pause zu kurz, über 10 h, offen, korrigiert", () => {
    expect(pauseZuKurz(6 * 60 + 1, 29)).toBe(true);
    expect(pauseZuKurz(6 * 60, 0)).toBe(false);
    expect(pauseZuKurz(9 * 60 + 1, 30)).toBe(true);
    expect(pauseZuKurz(9 * 60 + 1, 45)).toBe(false);
    const heute = "2026-10-08";
    const kurz = schicht("a", "2026-10-06", "06:50", "16:40", [["12:00", "12:30"]]);
    expect(tagAuswerten([kurz], "2026-10-06", heute, 0).hinweise).toEqual(["pause"]);
    const lang = schicht("b", "2026-10-07", "06:00", "17:45", [["12:00", "12:45"]]);
    expect(tagAuswerten([lang], "2026-10-07", heute, 0).hinweise).toEqual(["lang"]);
    const vergessen = schicht("c", "2026-10-07", "08:00", null, [], { profile_id: "mira" });
    const jetzt = new Date(ort(heute, "17:00")).getTime();
    expect(tagAuswerten([vergessen], "2026-10-07", heute, jetzt).hinweise).toContain("offen");
    const korr = schicht("d", "2026-10-05", "07:00", "15:00", [["12:00", "12:30"]], { korrigiert_am: "x", korrektur_grund: "Ende nachgetragen" });
    expect(tagAuswerten([korr], "2026-10-05", heute, 0).hinweise).toEqual(["korrigiert"]);
    // Heute laufend: kein „offen“, und die Pausenregel wartet bis zum Ausstempeln.
    const heuteLaeuft = schicht("e", heute, "06:00", null);
    const t = tagAuswerten([heuteLaeuft], heute, heute, jetzt);
    expect(t.laeuft).toBe(true);
    expect(t.hinweise).toEqual(["lang"]);
    expect(offeneSchichten([vergessen, heuteLaeuft], heute).map((s) => s.id)).toEqual(["c"]);
    // Die vergessene zählt nicht mit, bis sie korrigiert ist.
    expect(tagAuswerten([vergessen], "2026-10-07", heute, jetzt).arbeitMs).toBe(0);
    expect(tagAuswerten([vergessen], "2026-10-07", heute, jetzt).hinweise).toEqual(["offen"]);
  });

  it("Wochensumme und Tabelle aller – unbekannte Personen fallen nicht heraus", () => {
    const heute = "2026-10-08";
    const s = [
      schicht("a", "2026-10-05", "07:00", "15:00", [["12:00", "12:30"]]),
      schicht("b", "2026-10-06", "07:00", "11:00"),
      schicht("c", "2026-10-06", "12:00", "16:00", [], { profile_id: "lea" }),
      schicht("d", "2026-10-12", "07:00", "09:00"),
    ];
    const w = wocheAuswerten(s.filter((x) => x.profile_id === "jan"), "2026-10-05", heute, 0);
    expect(dauerText(w.arbeitMs)).toBe("11:30");
    expect(dauerText(w.pauseMs)).toBe("0:30");
    expect(w.arbeitstage).toBe(2);
    const zeilen = personenWoche(s, [{ id: "jan", name: "Jan", rolle: "user" }, { id: "mira", name: "Mira", rolle: "user" }], "2026-10-05", heute, 0);
    expect(zeilen.map((z) => [z.person.name, dauerText(z.woche.arbeitMs)])).toEqual([["Ehemaliger Zugang", "4:00"], ["Jan", "11:30"], ["Mira", "0:00"]]);
  });
});

describe("Korrektur-Formular", () => {
  it("Uhrzeiten → Zeitpunkte, Nachtschicht über Mitternacht", () => {
    const r = schichtAusFormular({ tag: "2026-10-07", beginn: "08:02", ende: "14:30", pausen: [{ von: "11:45", bis: "12:15" }, { von: "", bis: "" }] });
    expect(r.fehler).toBeNull();
    expect(r.zeiten).toEqual({ beginn: ort("2026-10-07", "08:02"), ende: ort("2026-10-07", "14:30"), pausen: [{ beginn: ort("2026-10-07", "11:45"), ende: ort("2026-10-07", "12:15") }] });
    const nacht = schichtAusFormular({ tag: "2026-10-07", beginn: "22:00", ende: "02:00", pausen: [{ von: "00:30", bis: "01:00" }] });
    expect(nacht.zeiten?.ende).toBe(ort("2026-10-08", "02:00"));
    expect(nacht.zeiten?.pausen[0].beginn).toBe(ort("2026-10-08", "00:30"));
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "08:00", ende: "", pausen: [] }).zeiten?.ende).toBeNull();
  });
  it("lehnt Unsinn ab", () => {
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "", ende: "10:00", pausen: [] }).fehler).toMatch(/Beginn/);
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "08:00", ende: "08:00", pausen: [] }).fehler).toMatch(/gleich/);
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "08:00", ende: "12:00", pausen: [{ von: "13:00", bis: "13:30" }] }).fehler).toMatch(/außerhalb/);
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "08:00", ende: "16:00", pausen: [{ von: "12:00", bis: "12:30" }, { von: "12:15", bis: "12:45" }] }).fehler).toMatch(/überschneiden/);
    expect(schichtAusFormular({ tag: "2026-10-07", beginn: "08:00", ende: "16:00", pausen: [{ von: "12:00", bis: "" }] }).fehler).toMatch(/von.*bis/);
  });
  it("Schicht → Formular und zurück", () => {
    const s = schicht("a", "2026-10-07", "08:02", "14:30", [["11:45", "12:15"]]);
    const f = formularAusSchicht(s, "2026-10-07");
    expect(f).toEqual({ tag: "2026-10-07", beginn: "08:02", ende: "14:30", pausen: [{ von: "11:45", bis: "12:15" }] });
    expect(schichtAusFormular(f).zeiten?.beginn).toBe(s.beginn);
    expect(formularAusSchicht(null, "2026-10-07")).toEqual({ tag: "2026-10-07", beginn: "", ende: "", pausen: [] });
  });
});

// Monat, Urlaub, Korrekturen, Export (Migration 83, v136, E20).
import {
  exportDateiname, korrekturTag, korrekturText, monatAuswerten, monatCsv, monatPlus, monatTage, monatTitel, personenMonat,
  stundenDezimal, type ZeitAbwesenheit, type ZeitKorrektur,
} from "@/lib/zeiterfassung";

describe("Monat und Urlaub (v136)", () => {
  const urlaub = (tag: string, minuten = 480, wer = "jan"): ZeitAbwesenheit => ({ id: tag + wer, profile_id: wer, tag, art: "urlaub", minuten, notiz: null });

  it("Monatstage, Blättern über das Jahresende, Titel", () => {
    expect(monatTage("2026-02")).toHaveLength(28);
    expect(monatTage("2026-10")[30]).toBe("2026-10-31");
    expect(monatPlus("2026-12", 1)).toBe("2027-01");
    expect(monatPlus("2026-01", -1)).toBe("2025-12");
    expect(monatTitel("2026-03")).toBe("März 2026");
  });

  it("zählt Arbeit, Pausen und Urlaub; Hinweis-Tage ohne „korrigiert“", () => {
    const s = [
      schicht("a", "2026-10-05", "07:00", "15:00", [["12:00", "12:30"]]),
      schicht("b", "2026-10-06", "07:00", "17:30"),
      schicht("c", "2026-10-07", "08:00", "12:00", [], { korrigiert_am: "x", korrektur_grund: "vergessen" }),
    ];
    const m = monatAuswerten(s, [urlaub("2026-10-12"), urlaub("2026-10-13", 240)], "2026-10", "2026-10-31", 0);
    expect(dauerText(m.arbeitMs)).toBe("22:00");
    expect(dauerText(m.pauseMs)).toBe("0:30");
    expect(dauerText(m.urlaubMs)).toBe("12:00");
    expect([m.arbeitstage, m.urlaubstage, m.hinweise]).toEqual([3, 2, 1]);
    expect(stundenDezimal(m.arbeitMs + m.urlaubMs)).toBe("34,00");
    expect(stundenDezimal(7.5 * 3_600_000 + 20_000)).toBe("7,51");
  });

  it("Monatstabelle aller: auch wer nur Urlaub hat; alphabetisch", () => {
    const z = personenMonat([schicht("a", "2026-10-05", "07:00", "15:00")], [urlaub("2026-10-12", 480, "mira")],
      [{ id: "jan", name: "Jan", rolle: "admin" }], "2026-10", "2026-10-31", 0);
    expect(z.map((x) => x.person.name)).toEqual(["Ehemaliger Zugang", "Jan"]);
    expect(dauerText(z[0].monat.urlaubMs)).toBe("8:00");
  });

  it("CSV: BOM, Semikolon, Dezimalkomma, eine Zeile je Tag mit Eintrag, Summe je Person", () => {
    const m = monatAuswerten([schicht("a", "2026-10-05", "07:00", "15:30", [["12:00", "12:30"]])], [urlaub("2026-10-12")], "2026-10", "2026-10-31", 0);
    const csv = monatCsv([{ person: { id: "jan", name: "Jan; Beispiel", rolle: "" }, monat: m }]);
    expect(csv.startsWith("﻿Person;Datum;")).toBe(true);
    const zeilen = csv.trim().split("\r\n");
    expect(zeilen).toHaveLength(4);
    expect(zeilen[1]).toBe('"Jan; Beispiel";05.10.2026;Mo;07:00;15:30;0:30;8:00;8,00;;');
    expect(zeilen[2]).toBe('"Jan; Beispiel";12.10.2026;Mo;;;;;;8,00;');
    expect(zeilen[3]).toContain(";Summe;");
    expect(zeilen[3]).toContain("1 Arbeitstage, 1 Urlaubstage");
    expect(exportDateiname("2026-10", "Jürgen Weiß")).toBe("arbeitszeiten-2026-10-juergen-weiss");
  });

  it("Korrekturen: Text und Tag für Schicht und Urlaub", () => {
    const k = (vorher: ZeitKorrektur["vorher"], nachher: ZeitKorrektur["nachher"]): ZeitKorrektur =>
      ({ id: "k", schicht_id: null, profile_id: "jan", vorher, nachher, grund: "g", von: null, am: "2026-10-09T10:00:00Z" });
    const v = { beginn: ort("2026-10-08", "08:00"), ende: null, pausen: [] };
    const n = { beginn: ort("2026-10-08", "08:00"), ende: ort("2026-10-08", "14:30"), pausen: [{ beginn: ort("2026-10-08", "12:00"), ende: ort("2026-10-08", "12:30") }] };
    expect(korrekturText(k(v, n))).toBe("Schicht 08:00 – jetzt → 08:00 – 14:30, Pause 0:30");
    expect(korrekturTag(k(v, n))).toBe("2026-10-08");
    expect(korrekturText(k(null, n))).toMatch(/^Schicht nachgetragen/);
    expect(korrekturText(k(v, null))).toMatch(/^Schicht gelöscht/);
    expect(korrekturText(k(null, { art: "urlaub", tag: "2026-10-12", minuten: 480 }))).toBe("Urlaub 8:00 h eingetragen");
    expect(korrekturText(k({ art: "urlaub", tag: "2026-10-12", minuten: 480 }, { art: "urlaub", tag: "2026-10-12", minuten: 240 }))).toBe("Urlaub 8:00 h → 4:00 h");
    expect(korrekturTag(k({ art: "urlaub", tag: "2026-10-12", minuten: 480 }, null))).toBe("2026-10-12");
  });
});

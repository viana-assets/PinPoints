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

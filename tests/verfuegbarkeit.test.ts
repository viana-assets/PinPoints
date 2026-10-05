import { describe, expect, it } from "vitest";
import type { Employee, Verfuegbarkeit } from "@/lib/types";
import {
  VERFUEGBARKEIT_ZEITEN, eintragAm, fensterText, nichtEingetragen, passtInsFenster, teamHinweise, verfuegbareAm, vorlageTage,
} from "@/lib/verfuegbarkeit";

// Verfügbarkeit der Mitarbeiter (Migration 68, v112).

const ma = (id: string, name: string): Employee => ({ id, name, profile_id: null, created_at: "" });
const leute = [ma("e1", "Jan Beispiel"), ma("e2", "Mira Muster"), ma("e3", "Lea Probe")];
const v = (employee_id: string, datum: string, von: string | null = null, bis: string | null = null): Verfuegbarkeit =>
  ({ id: employee_id + datum, employee_id, datum, von, bis, created_at: "", updated_at: "" });
const eintraege = [v("e1", "2026-10-08"), v("e3", "2026-10-08", "08:00:00", "13:00:00"), v("e2", "2026-10-09")];

describe("Zeitfenster", () => {
  it("schreibt ganzer Tag, volle und halbe Stunden lesbar", () => {
    expect(fensterText(v("e1", "x"))).toBe("ganzer Tag");
    expect(fensterText(v("e1", "x", "08:00:00", "13:00:00"))).toBe("8–13");
    expect(fensterText(v("e1", "x", "08:30", "13:00"))).toBe("8:30–13");
    expect(fensterText(null)).toBe("nicht eingetragen");
  });
  it("prüft, ob ein Termin hineinpasst", () => {
    const f = v("e1", "x", "08:00:00", "13:00:00");
    expect(passtInsFenster(f, "09:00", "10:00")).toBe(true);
    expect(passtInsFenster(f, "12:30", "14:00")).toBe(false);
    expect(passtInsFenster(f, "14:00", null)).toBe(false);
    expect(passtInsFenster(v("e1", "x"), "19:00", "20:00")).toBe(true);
  });
  it("bietet halbstündlich 6 bis 21 Uhr an", () => {
    expect(VERFUEGBARKEIT_ZEITEN[0]).toBe("06:00");
    expect(VERFUEGBARKEIT_ZEITEN.at(-1)).toBe("21:00");
    expect(VERFUEGBARKEIT_ZEITEN).toContain("13:30");
  });
});

describe("Wer hat Zeit", () => {
  it("findet die Verfügbaren eines Tages in der Reihenfolge der Mitarbeiter", () => {
    expect(verfuegbareAm(eintraege, leute, "2026-10-08").map((x) => x.employee.id)).toEqual(["e1", "e3"]);
    expect(eintragAm(eintraege, "e2", "2026-10-08")).toBeNull();
  });
  it("meldet beim Einteilen, wer nicht eingetragen ist und wessen Fenster nicht passt", () => {
    const h = teamHinweise(["e1", "e2", "e3"], "2026-10-08", "14:00", null, eintraege, leute);
    expect(h.map((x) => [x.employeeId, x.art])).toEqual([["e2", "nicht_eingetragen"], ["e3", "ausserhalb"]]);
    expect(h[1].text).toContain("8–13");
  });
  it("findet die Lücke für die Warnmarke am Termin", () => {
    expect(nichtEingetragen(["e1", "e2"], "2026-10-08", eintraege)).toEqual(["e2"]);
  });
});

describe("Vorlage", () => {
  it("trägt nur die gewählten Wochentage ab heute ein und lässt Vorhandenes stehen", () => {
    const moBisFr = [true, true, true, true, true, false, false];
    const tage = vorlageTage("2026-10-01", "2026-10-11", moBisFr, "2026-10-05", new Set(["2026-10-07"]));
    expect(tage).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]);
  });
  it("gibt bei verdrehtem Zeitraum nichts zurück", () => {
    expect(vorlageTage("2026-10-11", "2026-10-01", [true, true, true, true, true, true, true], "2026-10-01", new Set())).toEqual([]);
  });
});

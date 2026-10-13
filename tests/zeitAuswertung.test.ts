import { describe, expect, it } from "vitest";
import { anteilBeimKunden, zeitAuswertung } from "@/lib/auswertungAnsicht";
import { arbeitMs } from "@/lib/zeiterfassung";

// Arbeitszeit laut Stempeluhr in den Auswertungen (v144): Summe des Betriebs im Zeitraum.
const iso = (tag: string, uhr: string) => new Date(`${tag}T${uhr}:00`).toISOString();
const schicht = (tag: string, von: string, bis: string | null, pause = 0, heim = 0) => ({
  beginn: iso(tag, von), ende: bis ? iso(tag, bis) : null, heimfahrt_minuten: heim,
  pausen: pause ? [{ beginn: iso(tag, "12:00"), ende: new Date(new Date(iso(tag, "12:00")).getTime() + pause * 60_000).toISOString() }] : [],
});

describe("zeitAuswertung", () => {
  const d = {
    schichten: [
      schicht("2026-10-01", "08:00", "16:30", 30, 30), // 8:00 + 0:30 Heimfahrt
      schicht("2026-10-01", "09:00", "13:00"),         // zweite Person, 4:00
      schicht("2026-10-02", "07:30", "15:30", 30),      // 7:30
      schicht("2026-09-30", "08:00", "17:00"),          // außerhalb
    ],
    urlaub: [{ tag: "2026-10-05", minuten: 480 }, { tag: "2026-10-06", minuten: 240 }, { tag: "2026-11-02", minuten: 480 }],
    korrekturen: [{ am: iso("2026-10-03", "10:00") }, { am: iso("2026-09-29", "10:00") }],
  };
  const z = { von: "2026-10-01", bis: "2026-10-31" };

  it("summiert ohne Pausen, mit Heimfahrt, nur im Zeitraum", () => {
    const r = zeitAuswertung(d, z, Date.now(), arbeitMs);
    expect(r.gestempeltMin).toBe(8 * 60 + 30 + 4 * 60 + 7 * 60 + 30);
    expect(r).toMatchObject({ schichten: 3, tage: 2, heimfahrten: 1, heimfahrtMin: 30, urlaubTage: 2, urlaubMin: 720, korrekturen: 1, laufend: 0 });
  });

  it("zählt eine laufende Schicht bis jetzt", () => {
    const jetzt = new Date(iso("2026-10-07", "10:00")).getTime();
    const r = zeitAuswertung({ schichten: [schicht("2026-10-07", "08:00", null)], urlaub: [], korrekturen: [] }, z, jetzt, arbeitMs);
    expect(r).toMatchObject({ gestempeltMin: 120, laufend: 1 });
  });

  it("Anteil beim Kunden", () => {
    expect(anteilBeimKunden(300, 600)).toBe(50);
    expect(anteilBeimKunden(300, 0)).toBeNull();
  });
});

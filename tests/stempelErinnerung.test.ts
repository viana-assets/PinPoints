import { describe, expect, it } from "vitest";
import { stempelErinnerungenFaellig, stempelPushInhalt, stempelTage, STEMPEL_ERINNERUNG_MINUTEN, type StempelTermin } from "@/lib/stempelErinnerung";

// Die Stempel-Erinnerung (lib/stempelErinnerung.ts, Migration 85, v138).

const um = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const t = (profileId: string, time: string | null, end_time: string | null, status: StempelTermin["status"] = "offen"): StempelTermin => ({ profileId, time, end_time, status });

describe("Stempel-Erinnerung", () => {
  const termine = [t("jan", "09:00", "10:00"), t("jan", "13:00", null), t("jan", "11:00", "12:30", "erledigt"), t("mira", "08:00", "17:00", "storniert")];

  it("erster Beginn, letztes Ende (ohne Ende: Standarddauer), Storno zählt nicht", () => {
    const tage = stempelTage(termine);
    expect(tage.get("jan")).toEqual({ beginn: um("09:00"), ende: um("13:30"), letzterErledigt: false });
    expect(tage.has("mira")).toBe(false);
  });

  it("Einstempeln: 30 Minuten vor dem ersten Termin, nur wenn nicht eingestempelt", () => {
    expect(STEMPEL_ERINNERUNG_MINUTEN).toBe(30);
    expect(stempelErinnerungenFaellig(termine, um("08:29"), new Set())).toEqual([]);
    expect(stempelErinnerungenFaellig(termine, um("08:30"), new Set())).toEqual([{ profileId: "jan", art: "ein", uhrzeit: "09:00" }]);
    expect(stempelErinnerungenFaellig(termine, um("08:59"), new Set())).toHaveLength(1);
    expect(stempelErinnerungenFaellig(termine, um("09:00"), new Set())).toEqual([]);
    expect(stempelErinnerungenFaellig(termine, um("08:45"), new Set(["jan"]))).toEqual([]);
  });

  it("Ausstempeln: 30 Minuten nach dem geplanten Ende, nur wenn eingestempelt und der letzte nicht erledigt", () => {
    expect(stempelErinnerungenFaellig(termine, um("13:59"), new Set(["jan"]))).toEqual([]);
    expect(stempelErinnerungenFaellig(termine, um("14:00"), new Set(["jan"]))).toEqual([{ profileId: "jan", art: "aus", uhrzeit: "13:30" }]);
    expect(stempelErinnerungenFaellig(termine, um("14:00"), new Set())).toEqual([]);
    expect(stempelErinnerungenFaellig(termine, um("15:00"), new Set(["jan"]))).toEqual([]); // nachholen nur 60 Min.
    const erledigt = termine.map((x) => (x.time === "13:00" ? { ...x, status: "erledigt" as const } : x));
    expect(stempelErinnerungenFaellig(erledigt, um("14:00"), new Set(["jan"]))).toEqual([]);
  });

  it("ohne Stempelstand nur die Frage, ob etwas im Fenster liegt", () => {
    expect(stempelErinnerungenFaellig(termine, um("08:40"), null)).toHaveLength(1);
    expect(stempelErinnerungenFaellig(termine, um("14:10"), null)).toHaveLength(1);
    expect(stempelErinnerungenFaellig(termine, um("11:00"), null)).toHaveLength(0);
  });

  it("Texte und Link zur Stempeluhr", () => {
    const ein = stempelPushInhalt({ profileId: "jan", art: "ein", uhrzeit: "09:00" }, "2026-10-09");
    expect(ein.titel).toBe("Einstempeln nicht vergessen");
    expect(ein.text).toContain("09:00");
    expect(ein.url).toBe("/?stempeluhr=1");
    const aus = stempelPushInhalt({ profileId: "jan", art: "aus", uhrzeit: "13:30" }, "2026-10-09");
    expect(aus.titel).toBe("Ausstempeln vergessen?");
    expect(aus.kennung).toBe("stempel-aus-2026-10-09");
  });
});

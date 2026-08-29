import { describe, expect, it } from "vitest";
import { addDays, isoWeekNumber, startOfWeekMonday, toDateStr } from "@/lib/calendar";

// Der Einsatzplanungs-Kalender hängt komplett an diesen vier Funktionen. Besonders die
// ISO-Kalenderwoche und der Wochenstart sind klassische Stolperstellen (Jahreswechsel,
// Sonntag als erster oder letzter Tag der Woche).

describe("startOfWeekMonday", () => {
  it("gibt für einen Mittwoch den Montag derselben Woche", () => {
    expect(toDateStr(startOfWeekMonday(new Date(2026, 7, 26)))).toBe("2026-08-24");
  });

  it("behandelt den Sonntag als letzten Tag der Woche, nicht als ersten", () => {
    expect(toDateStr(startOfWeekMonday(new Date(2026, 7, 30)))).toBe("2026-08-24");
  });

  it("lässt einen Montag unverändert", () => {
    expect(toDateStr(startOfWeekMonday(new Date(2026, 7, 24)))).toBe("2026-08-24");
  });
});

describe("addDays", () => {
  it("rechnet über einen Monatswechsel hinweg", () => {
    expect(toDateStr(addDays(new Date(2026, 7, 30), 3))).toBe("2026-09-02");
  });

  it("rechnet auch rückwärts", () => {
    expect(toDateStr(addDays(new Date(2026, 8, 2), -3))).toBe("2026-08-30");
  });
});

describe("isoWeekNumber", () => {
  it("zählt eine gewöhnliche Woche im Jahr richtig", () => {
    expect(isoWeekNumber(new Date(2026, 7, 26))).toBe(35);
  });

  it("ordnet den 1. Januar der letzten Woche des Vorjahres zu, wenn er auf einen Donnerstag davor fällt", () => {
    // 1.1.2027 ist ein Freitag – nach ISO gehört er noch zur KW 53 von 2026.
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
  });

  it("beginnt am 4. Januar immer mit KW 1", () => {
    expect(isoWeekNumber(new Date(2026, 0, 4))).toBe(1);
  });
});

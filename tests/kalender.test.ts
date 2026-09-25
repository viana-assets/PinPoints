import { describe, expect, it } from "vitest";
import { addDays, gezogenerTermin, isoWeekNumber, startOfWeekMonday, toDateStr } from "@/lib/calendar";

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

describe("gezogenerTermin", () => {
  const h = (std: number, min = 0) => std * 60 + min;

  it("verschiebt um volle Viertelstunden und behält die Dauer", () => {
    // Bei 10:00–11:00 zehn Minuten unter der Oberkante gefasst, Zeiger jetzt bei 13:22.
    expect(gezogenerTermin("verschieben", h(13, 22), 10, h(10), h(11))).toEqual({ start: h(13, 15), ende: h(14, 15) });
  });

  it("rundet zur nächsten Linie statt immer abzurunden", () => {
    expect(gezogenerTermin("verschieben", h(9, 53), 0, h(8), h(9))).toEqual({ start: h(10), ende: h(11) });
  });

  it("hält den Termin im Tag – nicht vor 0:00, nicht über 23:59 hinaus", () => {
    expect(gezogenerTermin("verschieben", h(0, 5), 30, h(8), h(9))).toEqual({ start: 0, ende: h(1) });
    const spaet = gezogenerTermin("verschieben", h(23, 40), 0, h(8), h(10));
    expect(spaet.ende).toBeLessThanOrEqual(h(23, 59));
    expect(spaet.ende - spaet.start).toBe(120);
  });

  it("ändert beim Ziehen an der Unterkante nur das Ende", () => {
    expect(gezogenerTermin("dauer", h(12, 40), 0, h(10), h(11))).toEqual({ start: h(10), ende: h(12, 45) });
  });

  it("lässt den Termin nicht kürzer als 15 Minuten werden", () => {
    expect(gezogenerTermin("dauer", h(9), 0, h(10), h(11))).toEqual({ start: h(10), ende: h(10, 15) });
  });

  it("endet spätestens um 23:59", () => {
    expect(gezogenerTermin("dauer", h(24), 0, h(22), h(23)).ende).toBe(h(23, 59));
  });
});

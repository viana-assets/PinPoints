import { describe, expect, it } from "vitest";
import { WISCH_MAX_MS, WISCH_MIN_PX, WISCH_START_MAX_MS, wischRichtung } from "@/lib/wischen";

// Blättern im Kalender durch Wischen (v107): nach links = weiter, nach rechts = zurück – und
// keine der anderen Gesten im Raster (Scrollen, Termin ziehen, Antippen) darf als Wisch gelten.
const wisch = (dx: number, dy = 0, dauerMs = 250, ersteBewegungMs: number | null = 40) => wischRichtung({ dx, dy, dauerMs, ersteBewegungMs });

describe("wischRichtung", () => {
  it("nach links wischen blättert weiter, nach rechts zurück", () => {
    expect(wisch(-120)).toBe(1);
    expect(wisch(120)).toBe(-1);
  });
  it("ein kurzer Ruck ist kein Wisch", () => {
    expect(wisch(-(WISCH_MIN_PX - 1))).toBe(0);
    expect(wisch(-WISCH_MIN_PX)).toBe(1);
  });
  it("senkrechtes Scrollen mit etwas Drift blättert nicht", () => {
    expect(wisch(-80, 200)).toBe(0);
    expect(wisch(-80, 60)).toBe(0);
    expect(wisch(-90, 50)).toBe(1);
  });
  it("lange drücken und dann ziehen ist ein Termin am Finger, kein Wisch", () => {
    expect(wisch(-200, 0, 700, WISCH_START_MAX_MS + 1)).toBe(0);
    expect(wisch(-200, 0, 500, WISCH_START_MAX_MS)).toBe(1);
  });
  it("langsames Schieben blättert nicht", () => {
    expect(wisch(-200, 0, WISCH_MAX_MS + 1)).toBe(0);
  });
  it("ohne Bewegung (Antippen) kein Wisch", () => {
    expect(wisch(0, 0, 120, null)).toBe(0);
  });
});

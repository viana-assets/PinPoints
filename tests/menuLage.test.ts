import { describe, expect, it } from "vitest";
import { menuLage } from "@/lib/helpers";

// Menüs an Knöpfen: unter dem Knopf, sonst darüber – und bei vergrößerter Seite (v83) in
// CSS-Punkten statt Bildschirmpunkten.

const fenster = { breite: 1280, hoehe: 800 };

describe("menuLage", () => {
  it("ohne Zoom: unter dem Knopf, bündig links", () => {
    expect(menuLage({ top: 100, bottom: 130, left: 300 }, { hoehe: 90, breite: 190 }, fenster, 1)).toEqual({ top: 134, left: 300 });
  });
  it("kein Platz unten: darüber", () => {
    expect(menuLage({ top: 700, bottom: 730, left: 300 }, { hoehe: 90, breite: 190 }, fenster, 1)).toEqual({ top: 606, left: 300 });
  });
  it("am rechten Rand: nach links gerückt", () => {
    expect(menuLage({ top: 100, bottom: 130, left: 1250 }, { hoehe: 90, breite: 190 }, fenster, 1).left).toBe(1090);
  });
  it("mit Zoom 1,35: Bildschirmpunkte durch den Zoom geteilt, Menü in Bildschirmgröße gerechnet", () => {
    const r = menuLage({ top: 1350, bottom: 1377, left: 2700 }, { hoehe: 100, breite: 200 }, { breite: 2560, hoehe: 1440 }, 1.35);
    // Unten fehlen 1377+4+135 = 1516 > 1432 → darüber: 1350-4-135 = 1211 Bildschirmpunkte.
    expect(r.top).toBeCloseTo(1211 / 1.35);
    // Rechts: 2560-270 = 2290 Bildschirmpunkte.
    expect(r.left).toBeCloseTo(2290 / 1.35);
  });
  it("ungültiger Zoom gilt als 1", () => {
    expect(menuLage({ top: 100, bottom: 130, left: 300 }, { hoehe: 90, breite: 190 }, fenster, 0)).toEqual({ top: 134, left: 300 });
  });
});

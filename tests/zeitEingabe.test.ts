import { describe, expect, it } from "vitest";
import { dauerText, naechsterVorschlag, zeitAusEingabe, zeitVorschlaege, ZEIT_WAHL } from "@/lib/zeitEingabe";

// v168: Uhrzeit tippen oder wählen.
describe("zeitAusEingabe", () => {
  it.each([
    ["9", "09:00"], ["09", "09:00"], ["930", "09:30"], ["0930", "09:30"], ["1030", "10:30"], ["10:30", "10:30"],
    ["10.30", "10.30".replace(".", ":")], ["10,30", "10:30"], ["10 30", "10:30"], ["9:3", "09:30"], ["9h", "09:00"],
    ["14 Uhr", "14:00"], ["0", "00:00"], ["23:59", "23:59"],
  ])("%s → %s", (ein, aus) => expect(zeitAusEingabe(ein)).toBe(aus));
  it("leer bleibt leer, Unsinn ist null", () => {
    expect(zeitAusEingabe("  ")).toBe("");
    for (const x of ["24", "2400", "9:60", "abc", "12345", "1:2:3"]) expect(zeitAusEingabe(x)).toBeNull();
  });
});

describe("Liste", () => {
  it("Viertelstunden von 6 bis 21 Uhr", () => {
    const l = zeitVorschlaege();
    expect(l[0]).toBe("06:00");
    expect(l[l.length - 1]).toBe("21:00");
    expect(l).toHaveLength(((ZEIT_WAHL.bisStunde - ZEIT_WAHL.vonStunde) * 60) / ZEIT_WAHL.rasterMin + 1);
  });
  it("beim „bis“-Feld erst nach dem Beginn", () => {
    expect(zeitVorschlaege("10:30")[0]).toBe("10:45");
    expect(zeitVorschlaege("10:40")[0]).toBe("10:45");
  });
  it("Markierung: genau oder nächstspäter", () => {
    const l = zeitVorschlaege();
    expect(l[naechsterVorschlag(l, "10:30")]).toBe("10:30");
    expect(l[naechsterVorschlag(l, "10:31")]).toBe("10:45");
    expect(naechsterVorschlag(l, "")).toBe(-1);
    expect(l[naechsterVorschlag(l, "23:00")]).toBe("21:00");
  });
  it("Dauer", () => {
    expect(dauerText("10:00", "10:45")).toBe("45 Min.");
    expect(dauerText("10:00", "11:00")).toBe("1 Std.");
    expect(dauerText("10:00", "11:30")).toBe("1 Std. 30");
    expect(dauerText("10:00", "09:00")).toBeNull();
    expect(dauerText(null, "09:00")).toBeNull();
  });
});

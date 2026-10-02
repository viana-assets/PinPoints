import { describe, expect, it } from "vitest";
import { gleicheNummer, telefonPasst, telefonVergleich } from "@/lib/telefon";

// Dieselben Fälle wie der lokale Test von public.telefon_vergleich() (Migration 63).
describe("telefonVergleich", () => {
  it.each([
    ["0911 12345", "+4991112345"],
    ["0911/12345", "+4991112345"],
    ["+49 911 12345", "+4991112345"],
    ["+49 (0) 911 12345", "+4991112345"],
    ["0049 911 12345", "+4991112345"],
    ["0171-1234567", "+491711234567"],
    ["12345", "12345"],
  ])("%s → %s", (ein, aus) => expect(telefonVergleich(ein)).toBe(aus));
  it("leer ist null", () => {
    expect(telefonVergleich("")).toBeNull();
    expect(telefonVergleich(null)).toBeNull();
    expect(telefonVergleich("+")).toBeNull();
  });
});

describe("telefonPasst", () => {
  it("findet über jede Schreibweise", () => {
    expect(telefonPasst(["0911 12345"], "+49 911 12345")).toBe(true);
    expect(telefonPasst(["+49 911 12345"], "0911/12345")).toBe(true);
    expect(telefonPasst(["0911 12345"], "12345")).toBe(true);
  });
  it("nicht unter vier Ziffern und nicht bei Text", () => {
    expect(telefonPasst(["0911 12345"], "911")).toBe(false);
    expect(telefonPasst(["0911 12345"], "Str. 12345")).toBe(false);
  });
});

describe("gleicheNummer", () => {
  it("vergleicht in der Vergleichsform", () => {
    expect(gleicheNummer("0171 1234567", "+49 171 1234567")).toBe(true);
    expect(gleicheNummer("0171 1234567", "0171 1234568")).toBe(false);
    expect(gleicheNummer("", "")).toBe(false);
  });
});

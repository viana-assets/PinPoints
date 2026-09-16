import { describe, expect, it } from "vitest";
import { suchtreffer } from "@/lib/helpers";

// Die Suche in der Regalwand und in der Lagerübersicht. Sie entscheidet, ob ein Platz
// angezeigt wird - ein zu strenger Vergleich laesst jemanden glauben, der Satz sei nicht da.

describe("suchtreffer", () => {
  const felder = ["A-01", "Müller", "N-AB 123", "VW Golf"];

  it("trifft alles, solange nichts eingegeben ist", () => {
    expect(suchtreffer(felder, "")).toBe(true);
    expect(suchtreffer(felder, "   ")).toBe(true);
  });

  it("findet einen Namen unabhaengig von der Schreibweise", () => {
    expect(suchtreffer(felder, "müller")).toBe(true);
    expect(suchtreffer(felder, "MÜLLER")).toBe(true);
  });

  it("findet einen Platz-Code auch ohne Bindestrich", () => {
    expect(suchtreffer(felder, "a01")).toBe(true);
    expect(suchtreffer(felder, "A-01")).toBe(true);
  });

  it("findet ein Kennzeichen in jeder Schreibweise", () => {
    expect(suchtreffer(felder, "nab123")).toBe(true);
    expect(suchtreffer(felder, "N-AB 123")).toBe(true);
    expect(suchtreffer(felder, "ab")).toBe(true);
  });

  it("verlangt ALLE Begriffe, nicht irgendeinen", () => {
    expect(suchtreffer(felder, "müller golf")).toBe(true);
    expect(suchtreffer(felder, "müller porsche")).toBe(false);
  });

  it("stoert sich nicht an leeren Feldern", () => {
    expect(suchtreffer(["B-02", null, undefined, ""], "b02")).toBe(true);
    expect(suchtreffer([null, undefined], "müller")).toBe(false);
  });

  it("findet nichts, was nicht dasteht", () => {
    expect(suchtreffer(felder, "schmidt")).toBe(false);
  });
});

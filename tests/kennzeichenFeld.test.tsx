// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KennzeichenFeld } from "@/components/KennzeichenFeld";
import { kennzeichenGross } from "@/lib/kennzeichen";

// Kennzeichen immer groß (v108): am iPhone stellt `autoCapitalize` die Tastatur auf groß, alles
// andere wandelt das Feld beim Tippen um.
describe("kennzeichenGross", () => {
  it("schreibt groß, auch Umlaute, und lässt Leerzeichen und Bindestriche stehen", () => {
    expect(kennzeichenGross("fü-ab 123")).toBe("FÜ-AB 123");
    expect(kennzeichenGross("n kk1012")).toBe("N KK1012");
  });
  it("verändert die Länge nicht", () => {
    expect(kennzeichenGross("ß-a 1")).toHaveLength(5);
  });
});

describe("KennzeichenFeld", () => {
  it("meldet die Eingabe in Großbuchstaben und stellt die Tastatur auf groß", () => {
    const onWert = vi.fn();
    render(<KennzeichenFeld value="" onWert={onWert} aria-label="Kennzeichen" />);
    const feld = screen.getByLabelText("Kennzeichen");
    expect(feld.getAttribute("autocapitalize")).toBe("characters");
    fireEvent.change(feld, { target: { value: "fü-ab 12" } });
    expect(onWert).toHaveBeenCalledWith("FÜ-AB 12");
  });
});

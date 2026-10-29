// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUER_LEISTEN, querRadAktivieren, querSchritt } from "@/lib/querRad";

// Mausrad über seitlich scrollenden Leisten (v177).
describe("querSchritt", () => {
  const l = (scrollLeft: number, scrollWidth = 400, clientWidth = 300) => ({ scrollLeft, scrollWidth, clientWidth });
  it("dreht das Rad zur Seite, solange es etwas zu scrollen gibt", () => {
    expect(querSchritt(l(0), 0, 100)).toBe(100);
    expect(querSchritt(l(50), 0, -40)).toBe(-40);
  });
  it("am Ende, am Anfang oder ohne Überstand scrollt die Seite normal", () => {
    expect(querSchritt(l(100), 0, 100)).toBe(0);
    expect(querSchritt(l(0), 0, -100)).toBe(0);
    expect(querSchritt(l(0, 300, 300), 0, 100)).toBe(0);
  });
  it("seitliche Bewegung (Touchpad) bleibt dem Browser", () => {
    expect(querSchritt(l(0), 80, 20)).toBe(0);
  });
});

describe("querRadAktivieren", () => {
  it("verschiebt eine Leiste und verhindert das Seitenscrollen; Strg+Rad bleibt Zoom", () => {
    document.body.innerHTML = '<div class="pl-filter"><button>A</button></div><div class="sonst">x</div>';
    const leiste = document.querySelector(".pl-filter") as HTMLElement;
    Object.defineProperty(leiste, "scrollWidth", { value: 500 });
    Object.defineProperty(leiste, "clientWidth", { value: 300 });
    const ab = querRadAktivieren(document);
    const rad = (ziel: Element, init: WheelEventInit) => { const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }); ziel.dispatchEvent(e); return e; };
    const e1 = rad(leiste.querySelector("button")!, { deltaY: 60 });
    expect(leiste.scrollLeft).toBe(60);
    expect(e1.defaultPrevented).toBe(true);
    expect(rad(leiste, { deltaY: 60, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(rad(document.querySelector(".sonst")!, { deltaY: 60 }).defaultPrevented).toBe(false);
    ab();
    expect(rad(leiste, { deltaY: 60 }).defaultPrevented).toBe(false);
  });
  it("dieselbe Liste steht im Stilblatt", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
    const liste = QUER_LEISTEN.split(",").map((x) => x.trim()).join(",");
    expect(css).toContain(`#app :is(${liste}){`);
  });
});

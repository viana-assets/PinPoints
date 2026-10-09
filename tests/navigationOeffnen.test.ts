// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appOderWebOeffnen, NAVIGATION_RUECKFALL_MS } from "@/lib/navigationOeffnen";

// Karten-App öffnen (v140): auf dem iPhone ohne eingebautes Browserfenster.

let gesetzt: string[];
beforeEach(() => {
  vi.useFakeTimers();
  gesetzt = [];
  // `location.href = …` mitschreiben statt wirklich zu navigieren.
  Object.defineProperty(window, "location", { configurable: true, value: { set href(v: string) { gesetzt.push(v); }, get href() { return "http://localhost/"; } } });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("appOderWebOeffnen", () => {
  it("nicht iOS: gleich der https-Link", () => {
    appOderWebOeffnen("comgooglemaps://x", "https://www.google.com/maps/x", false);
    expect(window.open).toHaveBeenCalledWith("https://www.google.com/maps/x", "_blank");
    expect(gesetzt).toEqual([]);
  });

  it("iOS: App-Adresse; hat die App übernommen (Seite weg), kein Rückfall", () => {
    appOderWebOeffnen("comgooglemaps://x", "https://www.google.com/maps/x", true);
    expect(gesetzt).toEqual(["comgooglemaps://x"]);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(NAVIGATION_RUECKFALL_MS + 10);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("iOS ohne Google Maps: Seite bleibt sichtbar → nach kurzer Zeit der https-Link", () => {
    appOderWebOeffnen("comgooglemaps://x", "https://www.google.com/maps/x", true);
    vi.advanceTimersByTime(NAVIGATION_RUECKFALL_MS - 100);
    expect(window.open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(window.open).toHaveBeenCalledWith("https://www.google.com/maps/x", "_blank");
  });
});

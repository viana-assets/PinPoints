import { describe, expect, it } from "vitest";
import type { Warehouse } from "@/lib/types";
import { lagerNavZiel, navigationsLager } from "@/lib/lagerNavigation";
import { navigationUrls } from "@/lib/helpers";

// v169: Knopf „Zum Lager“ im Schnellmenü.
const w = (id: string, name: string, address: string | null): Warehouse => ({ id, name, address, note: null, created_at: "" });
const L = [w("a", "Container", null), w("b", "Halle Nord", "Gewerbering 4, 90000 Ort"), w("c", "Hauptlager", "Hofweg 1, 90000 Ort")];

describe("navigationsLager", () => {
  it("die Wahl gilt", () => expect(navigationsLager(L, "b")?.id).toBe("b"));
  it("ohne Wahl das Hauptlager", () => expect(navigationsLager(L, null)?.id).toBe("c"));
  it("gelöschte Wahl → Vorgabe", () => expect(navigationsLager(L, "weg")?.id).toBe("c"));
  it("ohne Hauptlager das erste mit Adresse, sonst das erste", () => {
    expect(navigationsLager(L.slice(0, 2), null)?.id).toBe("b");
    expect(navigationsLager([L[0]], null)?.id).toBe("a");
    expect(navigationsLager([], "b")).toBeNull();
  });
});

describe("lagerNavZiel", () => {
  it("navigiert zur Adresse", () => {
    const z = lagerNavZiel(L[1])!;
    expect(navigationUrls(z).google).toContain(encodeURIComponent("Gewerbering 4, 90000 Ort"));
  });
  it("ohne Adresse kein Ziel", () => {
    expect(lagerNavZiel(L[0])).toBeNull();
    expect(lagerNavZiel(w("x", "X", "   "))).toBeNull();
  });
});

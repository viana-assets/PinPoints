import { describe, expect, it } from "vitest";
import { SPRUNG_MERKEN_MS, sprungLesen, sprungTeile } from "@/lib/sprungMerker";

// Sprung über die Adresse übersteht das erste Neuladen (D19, v106).

function speicher() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe("sprungTeile", () => {
  it("trennt Sprung-Parameter vom Rest", () => {
    const t = sprungTeile("?lagerplatz=abc&x=1&auftrag=o9");
    expect(t.sprung?.get("lagerplatz")).toBe("abc");
    expect(t.sprung?.get("auftrag")).toBe("o9");
    expect(t.rest).toBe("x=1");
    expect(sprungTeile("?x=1").sprung).toBeNull();
  });
});

describe("sprungLesen", () => {
  it("erster Aufruf ohne Service Worker: merkt, nach dem Neuladen eingelöst, danach weg", () => {
    const s = speicher();
    expect(sprungLesen("?reifen=vr3", s, 1000, false)?.get("reifen")).toBe("vr3");
    expect(s.m.size).toBe(1);
    // Neuladen durch den Worker: Adresse leer, jetzt mit Controller
    expect(sprungLesen("", s, 3000, true)?.get("reifen")).toBe("vr3");
    expect(s.m.size).toBe(0);
    // Noch ein Neuladen: nichts mehr
    expect(sprungLesen("", s, 4000, true)).toBeNull();
  });
  it("mit laufendem Service Worker wird nichts gemerkt", () => {
    const s = speicher();
    expect(sprungLesen("?satz=t1", s, 1000, true)?.get("satz")).toBe("t1");
    expect(s.m.size).toBe(0);
  });
  it("ein alter Merker zählt nicht", () => {
    const s = speicher();
    sprungLesen("?lagerplatz=p1", s, 1000, false);
    expect(sprungLesen("", s, 1000 + SPRUNG_MERKEN_MS + 1, true)).toBeNull();
  });
  it("kaputter Eintrag oder gesperrter Speicher stört nicht", () => {
    const s = speicher();
    s.m.set("mr-sprung", "{kaputt");
    expect(sprungLesen("", s, 1000, false)).toBeNull();
    const gesperrt = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
    expect(sprungLesen("?auftrag=o1", gesperrt, 1000, false)?.get("auftrag")).toBe("o1");
    expect(sprungLesen("?auftrag=o1", null, 1000, false)?.get("auftrag")).toBe("o1");
  });
});

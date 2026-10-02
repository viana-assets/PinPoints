import { describe, expect, it } from "vitest";
import { kuerzesteReihenfolge, luftlinieKm, mapsRoutenUrl, routenvorschlag, streckeKm, UMWEG_FAKTOR } from "@/lib/route";

// Tagesroute (E5, v104). Punkte auf einer Linie, damit das Ergebnis von Hand nachprüfbar ist.

const FIRMA = { lat: 49.40, lng: 11.00 };
const p = (lngPlus: number) => ({ lat: 49.40, lng: 11.00 + lngPlus });

describe("luftlinieKm", () => {
  it("rechnet Nürnberg–Fürth ungefähr richtig", () => {
    expect(luftlinieKm({ lat: 49.4521, lng: 11.0767 }, { lat: 49.4774, lng: 10.9887 })).toBeGreaterThan(6.5);
    expect(luftlinieKm({ lat: 49.4521, lng: 11.0767 }, { lat: 49.4774, lng: 10.9887 })).toBeLessThan(7.2);
  });
  it("gleich ist null", () => {
    expect(luftlinieKm(FIRMA, FIRMA)).toBe(0);
  });
});

describe("kuerzesteReihenfolge", () => {
  it("fährt eine Linie der Reihe nach ab und zurück", () => {
    const punkte = [p(0.3), p(0.1), p(0.2)];
    expect(kuerzesteReihenfolge(FIRMA, punkte)).toEqual([1, 2, 0]);
  });
  it("ohne Start bleibt der erste Punkt vorn", () => {
    const punkte = [p(0.2), p(0.1), p(0.3)];
    const f = kuerzesteReihenfolge(null, punkte);
    expect(f[0]).toBe(0);
    expect(streckeKm(null, f.map((i) => punkte[i]))).toBeCloseTo(luftlinieKm(p(0.2), p(0.1)) + luftlinieKm(p(0.1), p(0.3)), 5);
  });
  it("2-opt löst eine Kreuzung auf", () => {
    // Vier Ecken eines Quadrats, in gekreuzter Reihenfolge angeboten.
    const ecken = [{ lat: 49.4, lng: 11.0 }, { lat: 49.5, lng: 11.1 }, { lat: 49.4, lng: 11.1 }, { lat: 49.5, lng: 11.0 }];
    const f = kuerzesteReihenfolge(ecken[0], ecken.slice(1));
    const km = streckeKm(ecken[0], f.map((i) => ecken.slice(1)[i]));
    const umfang = luftlinieKm(ecken[0], ecken[2]) + luftlinieKm(ecken[2], ecken[1]) + luftlinieKm(ecken[1], ecken[3]) + luftlinieKm(ecken[3], ecken[0]);
    expect(km).toBeCloseTo(umfang, 5);
  });
});

describe("routenvorschlag", () => {
  it("vergleicht mit der Uhrzeit und nimmt Stopps ohne Position heraus", () => {
    const r = routenvorschlag(FIRMA, [
      { eintrag: "a", punkt: p(0.3) }, { eintrag: "b", punkt: p(0.1) }, { eintrag: "x", punkt: null }, { eintrag: "c", punkt: p(0.2) },
    ]);
    expect(r.reihenfolge).toEqual(["b", "c", "a"]);
    expect(r.ohnePosition).toEqual(["x"]);
    expect(r.andersAlsUhrzeit).toBe(true);
    expect(r.kmVorschlag).toBe(Math.round(2 * luftlinieKm(FIRMA, p(0.3)) * UMWEG_FAKTOR));
    expect(r.kmNachUhrzeit).toBeGreaterThan(r.kmVorschlag);
  });
  it("schon optimal: keine Abweichung", () => {
    const r = routenvorschlag(FIRMA, [{ eintrag: 1, punkt: p(0.1) }, { eintrag: 2, punkt: p(0.2) }]);
    expect(r.andersAlsUhrzeit).toBe(false);
    expect(r.kmVorschlag).toBe(r.kmNachUhrzeit);
  });
});

describe("mapsRoutenUrl", () => {
  it("Runde ab Firma über alle Ziele", () => {
    const u = new URL(mapsRoutenUrl("49.4,11", ["49.5,11.1", "Weg 1, 90513 Zirndorf"])!);
    expect(u.searchParams.get("origin")).toBe("49.4,11");
    expect(u.searchParams.get("destination")).toBe("49.4,11");
    expect(u.searchParams.get("waypoints")).toBe("49.5,11.1|Weg 1, 90513 Zirndorf");
  });
  it("ohne Start: vom Standort zum letzten Ziel; leer: nichts", () => {
    const u = new URL(mapsRoutenUrl(null, ["a", "b"])!);
    expect(u.searchParams.get("origin")).toBeNull();
    expect(u.searchParams.get("destination")).toBe("b");
    expect(u.searchParams.get("waypoints")).toBe("a");
    expect(mapsRoutenUrl(null, [])).toBeNull();
  });
  it("höchstens neun Zwischenziele", () => {
    const u = new URL(mapsRoutenUrl("s", Array.from({ length: 12 }, (_, i) => "z" + i))!);
    expect(u.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });
});

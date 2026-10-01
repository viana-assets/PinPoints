import { describe, expect, it } from "vitest";
import type { Vehicle } from "@/lib/types";
import { doppelteKennzeichen, fahrzeugAuswahlText, fahrzeugMitKennzeichen, kennzeichenSchluessel } from "@/lib/kennzeichen";

const fz = (id: string, license_plate: string | null, make_model: string | null = null, tire_size: string | null = null) =>
  ({ id, customer_id: "c1", license_plate, make_model, tire_size, note: null, created_at: "", updated_at: "" }) as unknown as Vehicle;

describe("kennzeichenSchluessel", () => {
  it("ignoriert Leerzeichen, Bindestriche und Groß-/Kleinschreibung", () => {
    expect(kennzeichenSchluessel("N-KK 1012")).toBe("NKK1012");
    expect(kennzeichenSchluessel("n kk1012")).toBe("NKK1012");
  });
  it("leer bleibt leer", () => {
    expect(kennzeichenSchluessel(null)).toBe("");
    expect(kennzeichenSchluessel("  ")).toBe("");
  });
});

describe("fahrzeugMitKennzeichen", () => {
  const liste = [fz("a", "N KK1012"), fz("b", "N KK1200"), fz("c", null)];
  it("findet dasselbe Auto in anderer Schreibweise", () => {
    expect(fahrzeugMitKennzeichen(liste, "n-kk 1200")?.id).toBe("b");
  });
  it("findet nichts bei anderem Kennzeichen oder leerer Eingabe", () => {
    expect(fahrzeugMitKennzeichen(liste, "N KK1021")).toBeNull();
    expect(fahrzeugMitKennzeichen(liste, "")).toBeNull();
  });
});

describe("doppelteKennzeichen / fahrzeugAuswahlText", () => {
  const liste = [fz("a", "N KK1012", "VW Caddy"), fz("b", "N-KK 1012"), fz("c", "N KK1200", null, "205/55 R16"), fz("d", null)];
  it("erkennt Dubletten, nicht aber Fahrzeuge ohne Kennzeichen", () => {
    expect([...doppelteKennzeichen(liste)]).toEqual(["NKK1012"]);
  });
  it("zeigt Modell und Reifengröße und markiert Dubletten", () => {
    const d = doppelteKennzeichen(liste);
    expect(fahrzeugAuswahlText(liste[0], d)).toBe("N KK1012 · VW Caddy (doppelt angelegt)");
    expect(fahrzeugAuswahlText(liste[2], d)).toBe("N KK1200 · 205/55 R16");
    expect(fahrzeugAuswahlText(liste[3], d)).toBe("Fahrzeug ohne Kennzeichen");
  });
});

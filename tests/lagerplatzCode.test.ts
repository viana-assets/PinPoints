import { describe, expect, it } from "vitest";
import { lagerplatzIdAusCode, lagerplatzUrl } from "@/lib/lagerplatzCode";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("lagerplatzUrl", () => {
  it("baut einen Link auf die App mit der Lagerplatz-Kennung", () => {
    expect(lagerplatzUrl(ID, "https://pin-points.vercel.app")).toBe(
      `https://pin-points.vercel.app/?lagerplatz=${ID}`
    );
  });

  it("verträgt einen abschließenden Schrägstrich in der Basisadresse", () => {
    expect(lagerplatzUrl(ID, "https://pin-points.vercel.app/")).toBe(
      `https://pin-points.vercel.app/?lagerplatz=${ID}`
    );
  });
});

describe("lagerplatzIdAusCode", () => {
  it("liest die Kennung aus dem Link des Aufklebers", () => {
    expect(lagerplatzIdAusCode(`https://pin-points.vercel.app/?lagerplatz=${ID}`)).toBe(ID);
  });

  it("nimmt auch einen Link aus einer anderen Umgebung an", () => {
    expect(lagerplatzIdAusCode(`http://localhost:3000/?lagerplatz=${ID}`)).toBe(ID);
  });

  it("nimmt eine abgetippte nackte Kennung an", () => {
    expect(lagerplatzIdAusCode(`  ${ID.toUpperCase()}  `)).toBe(ID);
  });

  it("weist einen fremden QR-Code ab", () => {
    expect(lagerplatzIdAusCode("https://example.com/paket/12345")).toBeNull();
    expect(lagerplatzIdAusCode("4019238 000123")).toBeNull();
    expect(lagerplatzIdAusCode("")).toBeNull();
  });

  it("weist einen Link ohne den erwarteten Parameter ab, auch mit UUID im Pfad", () => {
    expect(lagerplatzIdAusCode(`https://pin-points.vercel.app/kunde/${ID}`)).toBeNull();
  });

  it("weist eine Kennung ab, die nur Teil eines längeren Textes ist", () => {
    expect(lagerplatzIdAusCode(`Regal ${ID} Reihe 3`)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { lagerplatzIdAusCode, lagerplatzUrl, satzIdAusCode, satzUrl } from "@/lib/aufkleberCode";

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

// Die zweite Aufklebersorte (17.09.2026). Wichtig ist hier nicht, dass sie funktioniert,
// sondern dass die beiden Sorten sich NICHT gegenseitig annehmen: Ein Satz-Etikett, das als
// Lagerplatz durchginge, würde beim Scannen einen fremden Satz umlagern.
describe("satzUrl / satzIdAusCode", () => {
  const ID = "3f8a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

  it("erzeugt einen Link auf die App", () => {
    expect(satzUrl(ID, "https://pin-points.vercel.app")).toBe(
      `https://pin-points.vercel.app/?satz=${ID}`
    );
  });

  it("liest die Kennung wieder aus", () => {
    expect(satzIdAusCode(`https://pin-points.vercel.app/?satz=${ID}`)).toBe(ID);
  });

  it("nimmt einen Lagerplatz-Aufkleber NICHT als Satz an", () => {
    expect(satzIdAusCode(`https://pin-points.vercel.app/?lagerplatz=${ID}`)).toBeNull();
  });

  it("nimmt ein Satz-Etikett NICHT als Lagerplatz an", () => {
    expect(lagerplatzIdAusCode(`https://pin-points.vercel.app/?satz=${ID}`)).toBeNull();
  });

  it("nimmt eine nackte Kennung nicht an - sie waere nicht unterscheidbar", () => {
    expect(satzIdAusCode(ID)).toBeNull();
  });
});

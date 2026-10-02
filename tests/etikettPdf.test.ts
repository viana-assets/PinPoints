import { describe, expect, it } from "vitest";
import { einBitBild, etikettPdf, PT_PRO_MM } from "@/lib/etikettPdf";

// Ein kleines Testbild: 10 × 2 Punkte, links schwarz, rechts weiß.
function rgba(breite: number, hoehe: number, schwarz: (x: number, y: number) => boolean) {
  const a = new Uint8ClampedArray(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y++) for (let x = 0; x < breite; x++) {
    const i = (y * breite + x) * 4;
    const v = schwarz(x, y) ? 0 : 255;
    a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255;
  }
  return a;
}

describe("einBitBild", () => {
  it("packt acht Punkte je Byte, weiß = 1, höchstes Bit zuerst", () => {
    const bits = einBitBild(rgba(10, 2, (x) => x < 3), 10, 2);
    expect(bits.length).toBe(4); // 2 Byte je Zeile (10 Punkte), 2 Zeilen
    expect(bits[0]).toBe(0b00011111);
    expect(bits[1]).toBe(0b11000000);
  });
  it("Grau unter der Schwelle wird schwarz, durchsichtig wird weiß", () => {
    const a = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]);
    expect(einBitBild(a, 2, 1)[0]).toBe(0b01000000);
  });
});

describe("etikettPdf", () => {
  const seite = { breiteMm: 60, hoeheMm: 86, pxBreite: 16, pxHoehe: 2, bild: new Uint8Array(4).fill(0xff) };
  const pdf = etikettPdf([seite, { ...seite, breiteMm: 58, hoeheMm: 58 }]);
  const text = new TextDecoder("latin1").decode(pdf);

  it("ist ein PDF mit zwei Seiten in Etikettengröße", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain(`/MediaBox [0 0 ${(Math.round(60 * PT_PRO_MM * 1000) / 1000)} ${(Math.round(86 * PT_PRO_MM * 1000) / 1000)}]`);
    expect(text).toContain("/MediaBox [0 0 164.409 164.409]");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("die Querverweistabelle zeigt auf die richtigen Objekte", () => {
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const zeilen = text.slice(start).split("\n").slice(3, 3 + 8); // Objekte 1–8
    zeilen.forEach((z, i) => {
      const offset = Number(z.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("das Bild steht als 1-Bit-Graustufe mit richtiger Länge darin", () => {
    expect(text).toContain("/Width 16 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 1 /Length 4");
  });
});

import { describe, expect, it } from "vitest";
import { blattName, blattXml, spaltenName, tabelleXlsx } from "@/lib/finance/xlsx";

// Excel-Datei ohne Bibliothek (v187). Die Datei ist ein ZIP ohne Kompression – hier wieder auseinandergenommen.
function entpacken(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const aus = new Map<string, string>();
  const dec = new TextDecoder();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const groesse = v.getUint32(p + 18, true), nameLaenge = v.getUint16(p + 26, true), extra = v.getUint16(p + 28, true);
    const name = dec.decode(zip.subarray(p + 30, p + 30 + nameLaenge));
    const start = p + 30 + nameLaenge + extra;
    aus.set(name, dec.decode(zip.subarray(start, start + groesse)));
    p = start + groesse;
  }
  return aus;
}

describe("Excel-Datei", () => {
  it("Spalten- und Blattnamen", () => {
    expect([0, 25, 26, 27, 701, 702].map(spaltenName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(blattName("Kontoblatt 1200: Bank [Jan/Feb]")).toBe("Kontoblatt 1200  Bank  Jan Feb");
    expect(blattName("x".repeat(40))).toHaveLength(31);
    expect(blattName("***")).toBe("Tabelle");
  });

  it("Kopf fett, Zahlen als Zahl, Text als Text – auch „=1+1“ bleibt Text", () => {
    const x = blattXml(["Nr.", "Text", "Umsatz"], [[1, "=1+1", 1234.567], [2, "A & B <C>", null]]);
    expect(x).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Nr.</t></is></c>');
    expect(x).toContain('<c r="C2" s="2"><v>1234.57</v></c>');
    expect(x).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">=1+1</t></is></c>');
    expect(x).toContain("A &amp; B &lt;C&gt;");
    expect(x).not.toContain('r="C3"');
    expect(x).toContain('<autoFilter ref="A1:C3"/>');
    expect(x).toContain('state="frozen"');
  });

  it("das ZIP hat alle Teile, die Excel braucht", () => {
    const teile = entpacken(tabelleXlsx("Journal 2026", ["Nr.", "Umsatz"], [[1, 78.4]], new Date(2026, 9, 30, 12, 0, 0)));
    expect([...teile.keys()]).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
    expect(teile.get("xl/workbook.xml")).toContain('<sheet name="Journal 2026" sheetId="1" r:id="rId1"/>');
    expect(teile.get("xl/styles.xml")).toContain('formatCode="#,##0.00"');
    expect(teile.get("xl/worksheets/sheet1.xml")).toContain("<v>78.4</v>");
  });
});

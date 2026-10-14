import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { istPdf, pdfAnhaenge, pdfAnhangXml } from "@/lib/finance/zugferd";

// v156: ZUGFeRD/Factur-X – das XML im PDF. Das PDF wird hier von Hand gebaut (wie es Rechnungsprogramme schreiben:
// eingebettete Datei, FlateDecode, Länge direkt oder als Verweis); mit pikepdf erzeugte Dateien liefen beim Bau ebenso.
const XML = `<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"><x>Größe</x></rsm:CrossIndustryInvoice>`;

function pdf(teile: (string | Uint8Array)[]): Uint8Array {
  const stuecke = teile.map((t) => (typeof t === "string" ? Uint8Array.from(t, (c) => c.charCodeAt(0)) : t));
  const aus = new Uint8Array(stuecke.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of stuecke) { aus.set(x, p); p += x.length; }
  return aus;
}
const gepackt = new Uint8Array(deflateSync(Buffer.from(XML, "utf8")));

describe("XML im PDF", () => {
  it("eingebettet, gepackt, Länge direkt", async () => {
    const d = pdf(["%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n",
      `5 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Params << /Size ${XML.length} >> /Length ${gepackt.length} /Filter /FlateDecode >>\nstream\n`, gepackt, "\nendstream\nendobj\n%%EOF\n"]);
    expect(await pdfAnhangXml(d)).toBe(XML);
  });
  it("Länge als Verweis, ungepackt; zwei Anhänge, nur einer ist eine Rechnung", async () => {
    const roh = Uint8Array.from(Buffer.from(XML, "utf8"));
    const d = pdf(["%PDF-1.4\n",
      "3 0 obj\n<< /Type /EmbeddedFile /Length 4 0 R >>\nstream\nHallo Welt\nendstream\nendobj\n",
      "6 0 obj\n<< /Type/EmbeddedFile /Length 7 0 R >>\nstream\r\n", roh, "\r\nendstream\nendobj\n"]);
    expect(await pdfAnhaenge(d)).toHaveLength(2);
    expect((await pdfAnhangXml(d))?.trim()).toBe(XML);
  });
  it("kein PDF, verschlüsselt, ohne Anhang", async () => {
    expect(await pdfAnhaenge(pdf(["kein pdf"]))).toEqual([]);
    expect(await pdfAnhaenge(pdf(["%PDF-1.7\ntrailer << /Encrypt 9 0 R >>"]))).toEqual([]);
    expect(await pdfAnhangXml(pdf(["%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj"]))).toBeNull();
  });
  it("erkennt PDF an Typ oder Endung", () => {
    expect([istPdf({ type: "application/pdf", name: "x" }), istPdf({ type: "", name: "R.PDF" }), istPdf({ type: "image/jpeg", name: "a.jpg" })]).toEqual([true, true, false]);
  });
});

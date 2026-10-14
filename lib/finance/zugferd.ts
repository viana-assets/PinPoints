// ZUGFeRD / Factur-X: die E-Rechnung als XML im Anhang eines PDF (v156). Liest die eingebetteten Dateien eines PDF
// (Objekte mit /Type /EmbeddedFile), entpackt sie (FlateDecode) und gibt das erste XML zurück, das nach einer
// E-Rechnung aussieht – lib/finance/erechnung.ts liest es dann wie eine XML-Datei. Ohne Bibliothek, im Browser
// (DecompressionStream) und in den Tests (Node) gleich. Verschlüsselte PDF und seltene Filter liefern null – dann
// bleibt das PDF einfach ein Beleg ohne Daten.

const lat1 = (b: Uint8Array, von = 0, bis = b.length) => {
  let s = "";
  for (let i = von; i < bis; i += 0x8000) s += String.fromCharCode(...b.subarray(i, Math.min(bis, i + 0x8000)));
  return s;
};

async function entpacken(daten: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream("deflate");
    const strom = new Blob([daten as BlobPart]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(strom).arrayBuffer());
  } catch {
    return null;
  }
}

const sieht_nach_e_rechnung_aus = (x: string) => /CrossIndustryInvoice|<(?:\w+:)?Invoice[\s>]|<(?:\w+:)?CreditNote[\s>]/.test(x);

export function istPdf(datei: { type: string; name: string }): boolean {
  return datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
}

// Die eingebetteten Dateien als Text (UTF-8).
export async function pdfAnhaenge(pdf: Uint8Array): Promise<string[]> {
  const text = lat1(pdf);
  if (!text.startsWith("%PDF")) return [];
  if (/\/Encrypt\s/.test(text)) return [];
  const aus: string[] = [];
  const obj = /(\d+)\s+(\d+)\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = obj.exec(text))) {
    const dict = m[3];
    if (!/\/Type\s*\/EmbeddedFile\b/.test(dict)) continue;
    const start = m.index + m[0].length;
    const laenge = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let ende = laenge ? start + Number(laenge[1]) : -1;
    if (ende < 0 || ende > pdf.length || !/^\s*endstream/.test(text.slice(ende, ende + 20))) ende = text.indexOf("endstream", start);
    if (ende < 0) continue;
    let roh = pdf.subarray(start, ende);
    const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] ?? "";
    if (/FlateDecode/.test(filter)) {
      const x = await entpacken(roh);
      if (!x) continue;
      roh = x;
    } else if (filter.trim()) continue;
    aus.push(new TextDecoder("utf-8").decode(roh).replace(/^﻿/, ""));
    obj.lastIndex = ende;
  }
  return aus;
}

// Das XML der E-Rechnung im PDF – oder null.
export async function pdfAnhangXml(pdf: Uint8Array): Promise<string | null> {
  return (await pdfAnhaenge(pdf)).find(sieht_nach_e_rechnung_aus) ?? null;
}

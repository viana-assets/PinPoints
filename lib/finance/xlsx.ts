// Excel-Datei (.xlsx) aus einer Tabelle (v187) – für Journal, Kontoblatt und Konten neben CSV und PDF, ohne Bibliothek:
// ein ZIP (ohne Kompression, `zipDateien` aus lib/finance/export.ts) mit dem kleinsten Satz Teile, den Excel,
// LibreOffice und Numbers öffnen. Text steht als „inlineStr“ – eine Formel wird so nie ausgeführt, anders als bei CSV
// braucht es kein Hochkomma. Zahlen als Zahl mit dem Format „#.##0,00“, die Kopfzeile fett und fixiert.
// Geprüft in tests/financeXlsx.test.ts.

import { zipDateien } from "./export";
import type { SpaltenWert } from "./arbeitsplatz";

export const XLSX_TYP = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Excel erlaubt höchstens 31 Zeichen und keine der Zeichen []:*?/\ im Blattnamen.
export function blattName(n: string): string {
  return (n.replace(/[[\]:*?/\\]/g, " ").trim() || "Tabelle").slice(0, 31);
}

// Spalte 0 → A, 25 → Z, 26 → AA.
export function spaltenName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // Steuerzeichen außer Tab und Zeilenumbruch sind in XML 1.0 verboten.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function zelle(w: SpaltenWert, ref: string, stil: number): string {
  if (w == null || w === "") return "";
  if (typeof w === "number") return Number.isFinite(w) ? `<c r="${ref}" s="${stil || 2}"><v>${Math.round(w * 100) / 100}</v></c>` : "";
  return `<c r="${ref}" t="inlineStr"${stil ? ` s="${stil}"` : ""}><is><t xml:space="preserve">${xml(w)}</t></is></c>`;
}

// Breite je Spalte nach dem längsten Inhalt (Zeichen), begrenzt.
function breiten(kopf: readonly string[], zeilen: readonly SpaltenWert[][]): number[] {
  return kopf.map((k, i) => Math.min(60, Math.max(8, k.length + 2, ...zeilen.slice(0, 500).map((z) => {
    const w = z[i];
    return (typeof w === "number" ? 12 : String(w ?? "").length) + 2;
  }))));
}

export function blattXml(kopf: readonly string[], zeilen: readonly SpaltenWert[][]): string {
  const cols = breiten(kopf, zeilen).map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join("");
  const reihe = (werte: readonly SpaltenWert[], r: number, stil: number) =>
    `<row r="${r}">${werte.map((w, i) => zelle(w, `${spaltenName(i)}${r}`, stil)).join("")}</row>`;
  const daten = [reihe(kopf, 1, 1), ...zeilen.map((z, i) => reihe(z, i + 2, 0))].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${cols}</cols><sheetData>${daten}</sheetData>`
    + (zeilen.length ? `<autoFilter ref="A1:${spaltenName(Math.max(0, kopf.length - 1))}${zeilen.length + 1}"/>` : "")
    + `</worksheet>`;
}

const STILE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>`
  + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
  + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

export function tabelleXlsx(name: string, kopf: readonly string[], zeilen: readonly SpaltenWert[][], am: Date): Uint8Array {
  const enc = new TextEncoder();
  const datei = (n: string, s: string) => ({ name: n, daten: enc.encode(s) });
  return zipDateien([
    datei("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + `</Types>`),
    datei("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`),
    datei("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets><sheet name="${xml(blattName(name))}" sheetId="1" r:id="rId1"/></sheets>`
      + (zeilen.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(blattName(name)).replace(/'/g, "''")}'!$A$1:$${spaltenName(Math.max(0, kopf.length - 1))}$${zeilen.length + 1}</definedName></definedNames>` : "")
      + `</workbook>`),
    datei("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `</Relationships>`),
    datei("xl/styles.xml", STILE),
    datei("xl/worksheets/sheet1.xml", blattXml(kopf, zeilen)),
  ], am);
}

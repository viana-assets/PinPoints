// Finance F4 (Migration 91, v149): Kontoauszüge lesen, Vorschläge für den Abgleich, Kassenbuch – ohne
// Datenbank, geprüft in tests/financeBank.test.ts. Gelesen wird im Browser; an `fin_bank_einlesen()` gehen
// nur die Umsätze (Datum, Betrag mit Vorzeichen, Zweck, Name, IBAN, Referenz).
//
// Formate: CAMT.053 (XML, ISO 20022 – bieten alle deutschen Banken im Online-Banking an) und CSV mit
// Kopfzeile (Spalten werden am Namen erkannt: Buchungstag, Betrag, Verwendungszweck, Name, IBAN …).

import type { FinBuchung } from "./buchung";
import type { FinRechnungZeile } from "./rechnungen";
import type { FinBeleg, FinLieferant } from "./belege";

// Größe einer Kontoauszug-Datei (gelesen wird im Browser) und Umsätze je Import – wie `fin_bank_einlesen()`.
export const FIN_BANK_MAX_BYTES = 5 * 1024 * 1024;
export const FIN_BANK_MAX_UMSAETZE = 5000;

export type BankUmsatzEingang = {
  datum: string;
  valuta: string | null;
  betrag: number;
  zweck: string | null;
  name: string | null;
  iban: string | null;
  referenz: string | null;
};

export type Kontoauszug = {
  format: "camt" | "csv";
  iban: string | null;
  umsaetze: BankUmsatzEingang[];
  endsaldo: number | null;
  endsaldoAm: string | null;
  // Zeilen, die nicht gelesen werden konnten (CSV) bzw. vorgemerkte Umsätze (CAMT) – nur gezählt.
  uebersprungen: number;
};

export type FinBankkonto = { id: string; name: string; iban: string | null; konto: number; aktiv: boolean };

export type FinBankumsatz = BankUmsatzEingang & {
  id: string;
  bankkonto_id: string;
  import_id: string | null;
  status: "offen" | "zugeordnet" | "ignoriert";
  zuordnung: "rechnung" | "beleg" | "konto" | null;
  zuordnung_id: string | null;
  buchung_id: string | null;
  notiz: string | null;
};

export type FinBankimport = {
  id: string; bankkonto_id: string; dateiname: string | null; format: "camt" | "csv";
  anzahl: number; neu: number; von: string | null; bis: string | null; endsaldo: number | null; endsaldo_am: string | null; erstellt_am: string;
};

const cent = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Zeichensatz
// Viele Banken liefern CSV in Windows-1252. Erst streng UTF-8, sonst Windows-1252.
export function dateiText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function ibanSauber(t: string | null | undefined): string | null {
  const s = (t ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------- CAMT.053
function kinder(el: Element | null | undefined, name: string): Element[] {
  return el ? Array.from(el.children).filter((c) => c.localName === name) : [];
}
function kind(el: Element | null | undefined, name: string): Element | null {
  return kinder(el, name)[0] ?? null;
}
function pfad(el: Element | null | undefined, ...namen: string[]): Element | null {
  let x: Element | null | undefined = el;
  for (const n of namen) x = kind(x, n);
  return x ?? null;
}
const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() || null;
// Name einer Partei: camt.053.001.02 `Dbtr/Nm`, ab .08 `Dbtr/Pty/Nm`.
const partei = (el: Element | null) => txt(kind(el, "Nm")) ?? txt(pfad(el, "Pty", "Nm"));

export function camtLesen(xml: string): Kontoauszug | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length) return null;
  const meldung = Array.from(doc.getElementsByTagNameNS("*", "BkToCstmrStmt"))[0];
  if (!meldung) return null;
  const umsaetze: BankUmsatzEingang[] = [];
  let iban: string | null = null;
  let endsaldo: number | null = null;
  let endsaldoAm: string | null = null;
  let uebersprungen = 0;
  for (const stmt of kinder(meldung, "Stmt")) {
    iban ??= ibanSauber(txt(pfad(stmt, "Acct", "Id", "IBAN")));
    for (const bal of kinder(stmt, "Bal")) {
      if (txt(pfad(bal, "Tp", "CdOrPrtry", "Cd")) !== "CLBD") continue;
      const betrag = Number(txt(kind(bal, "Amt")));
      const am = txt(pfad(bal, "Dt", "Dt")) ?? txt(pfad(bal, "Dt", "DtTm"))?.slice(0, 10) ?? null;
      if (Number.isFinite(betrag) && (!endsaldoAm || (am && am >= endsaldoAm))) {
        endsaldo = txt(kind(bal, "CdtDbtInd")) === "DBIT" ? -betrag : betrag;
        endsaldoAm = am;
      }
    }
    for (const ntry of kinder(stmt, "Ntry")) {
      const sts = txt(pfad(ntry, "Sts", "Cd")) ?? txt(kind(ntry, "Sts"));
      if (sts && sts !== "BOOK") { uebersprungen++; continue; }
      const vorz = txt(kind(ntry, "CdtDbtInd")) === "DBIT" ? -1 : 1;
      const datum = (txt(pfad(ntry, "BookgDt", "Dt")) ?? txt(pfad(ntry, "BookgDt", "DtTm"))?.slice(0, 10)) ?? null;
      const valuta = (txt(pfad(ntry, "ValDt", "Dt")) ?? txt(pfad(ntry, "ValDt", "DtTm"))?.slice(0, 10)) ?? null;
      const gesamt = Number(txt(kind(ntry, "Amt")));
      if (!datum || !Number.isFinite(gesamt) || gesamt === 0) { uebersprungen++; continue; }
      const details = kinder(kind(ntry, "NtryDtls"), "TxDtls");
      const einzeln = details.length > 1 && details.every((d) => Number.isFinite(Number(txt(kind(d, "Amt")) ?? txt(pfad(d, "AmtDtls", "TxAmt", "Amt")))));
      const teile = einzeln ? details : [details[0] ?? null];
      for (const d of teile) {
        const betrag = einzeln ? Number(txt(kind(d, "Amt")) ?? txt(pfad(d, "AmtDtls", "TxAmt", "Amt"))) : gesamt;
        const parteien = pfad(d, "RltdPties");
        const gegen = vorz > 0 ? kind(parteien, "Dbtr") : kind(parteien, "Cdtr");
        const gegenKonto = vorz > 0 ? kind(parteien, "DbtrAcct") : kind(parteien, "CdtrAcct");
        const zweck = kinder(pfad(d, "RmtInf"), "Ustrd").map((u) => txt(u)).filter(Boolean).join(" ")
          || txt(kind(d, "AddtlTxInf")) || txt(kind(ntry, "AddtlNtryInf"));
        const e2e = txt(pfad(d, "Refs", "EndToEndId"));
        umsaetze.push({
          datum, valuta, betrag: cent(vorz * betrag), zweck: zweck || null, name: partei(gegen),
          iban: ibanSauber(txt(pfad(gegenKonto, "Id", "IBAN"))),
          referenz: (e2e && e2e !== "NOTPROVIDED" ? e2e : null) ?? txt(kind(ntry, "AcctSvcrRef")),
        });
      }
    }
  }
  return { format: "camt", iban, umsaetze, endsaldo: endsaldo == null ? null : cent(endsaldo), endsaldoAm, uebersprungen };
}

// ---------------------------------------------------------------- CSV
function csvZeilen(text: string, trenner: string): string[][] {
  const zeilen: string[][] = [];
  let feld = "", zeile: string[] = [], inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') inQuote = false;
      else feld += c;
    } else if (c === '"') inQuote = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.some((f) => f.trim())) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((f) => f.trim())) zeilen.push(zeile);
  return zeilen;
}

const norm = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9/]+/g, "");

const SPALTEN: Record<keyof BankUmsatzEingang | "soll" | "haben", string[]> = {
  datum: ["buchungstag", "buchungsdatum", "datum", "buchung", "bookingdate"],
  valuta: ["valutadatum", "valuta", "wertstellung", "wertstellungsdatum", "valuedate"],
  betrag: ["betrag", "umsatz", "betrageur", "betragineur", "betrag(eur)", "amount"],
  soll: ["soll", "sollbetrag", "ausgang"],
  haben: ["haben", "habenbetrag", "eingang"],
  zweck: ["verwendungszweck", "zweck", "buchungsdetails", "vorgang/verwendungszweck", "beschreibung", "text"],
  name: ["beguenstigter/zahlungspflichtiger", "zahlungspflichtige/r", "zahlungsempfaenger/in", "name", "empfaenger", "auftraggeber",
    "auftraggeber/empfaenger", "zahlungsempfaenger", "gegenpartei", "beguenstigter", "auftraggeber/beguenstigter", "nameauftraggeber/zahlungsempfaenger"],
  iban: ["kontonummer/iban", "iban", "ibanauftraggeber/zahlungsempfaenger", "kontonummer", "gegenkonto"],
  referenz: ["kundenreferenz(endtoend)", "endtoendreferenz", "referenz", "kundenreferenz"],
};

function betragZahl(t: string | undefined): number | null {
  if (t == null) return null;
  let s = t.replace(/\s|€|EUR/g, "");
  if (!s) return null;
  const minus = /^-|-$/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[-()+]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return cent((minus ? -1 : 1) * Number(s));
}

function datumIso(t: string | undefined): string | null {
  const s = (t ?? "").trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    const j = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${j}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function csvLesen(text: string): Kontoauszug | null {
  const erste = text.split(/\r?\n/).slice(0, 30);
  const trenner = [";", "\t", ","].map((t) => ({ t, n: erste.reduce((s, z) => s + z.split(t).length - 1, 0) })).sort((a, b) => b.n - a.n)[0];
  if (!trenner || trenner.n === 0) return null;
  const zeilen = csvZeilen(text, trenner.t);
  // Kopfzeile: die erste Zeile mit einer Datums- und einer Betragsspalte (Banken setzen oft Vorspann davor).
  let kopfIdx = -1;
  let index: Partial<Record<keyof typeof SPALTEN, number>> = {};
  for (let i = 0; i < Math.min(zeilen.length, 40); i++) {
    const namen = zeilen[i].map(norm);
    const finde = (k: keyof typeof SPALTEN) => {
      for (const kand of SPALTEN[k]) { const j = namen.indexOf(kand); if (j >= 0) return j; }
      return -1;
    };
    const d = finde("datum"), b = finde("betrag"), s = finde("soll"), h = finde("haben");
    if (d >= 0 && (b >= 0 || (s >= 0 && h >= 0))) {
      kopfIdx = i;
      index = Object.fromEntries((Object.keys(SPALTEN) as (keyof typeof SPALTEN)[]).map((k) => [k, finde(k)]).filter(([, v]) => (v as number) >= 0));
      break;
    }
  }
  if (kopfIdx < 0) return null;
  const umsaetze: BankUmsatzEingang[] = [];
  let uebersprungen = 0;
  let kontoIban: string | null = null;
  for (const z of zeilen.slice(0, kopfIdx)) for (const f of z) kontoIban ??= ibanSauber(f);
  for (const z of zeilen.slice(kopfIdx + 1)) {
    const f = (k: keyof typeof SPALTEN) => (index[k] == null ? undefined : z[index[k] as number]?.trim());
    const datum = datumIso(f("datum"));
    let betrag = betragZahl(f("betrag"));
    if (betrag == null && (index.soll != null || index.haben != null)) {
      const s = betragZahl(f("soll")), h = betragZahl(f("haben"));
      betrag = h ? Math.abs(h) : s ? -Math.abs(s) : null;
    }
    if (!datum || !betrag) { uebersprungen++; continue; }
    umsaetze.push({
      datum, valuta: datumIso(f("valuta")), betrag, zweck: f("zweck")?.replace(/\s+/g, " ") || null, name: f("name") || null,
      iban: ibanSauber(f("iban")), referenz: f("referenz") || null,
    });
  }
  if (!umsaetze.length) return null;
  return { format: "csv", iban: kontoIban, umsaetze, endsaldo: null, endsaldoAm: null, uebersprungen };
}

export function kontoauszugLesen(text: string): Kontoauszug | null {
  const t = text.trim();
  if (t.startsWith("<")) return camtLesen(t);
  return csvLesen(t);
}

// ---------------------------------------------------------------- Vorschläge
export type Vorschlag =
  | { art: "rechnung"; id: string; titel: string; betrag: number; passt: boolean; punkte: number }
  | { art: "beleg"; id: string; titel: string; betrag: number; passt: boolean; punkte: number };

const kompakt = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

// Vorschläge für einen Umsatz: gleiche Summe zählt 2, Rechnungs-/Belegnummer im Zweck 3, Name 1. Nur
// Treffer mit Nummer oder gleichem Betrag; gebucht wird nur, was auf den Cent passt (Teilzahlung später).
export function vorschlaege(u: Pick<FinBankumsatz, "betrag" | "zweck" | "name">, rechnungen: FinRechnungZeile[], belege: FinBeleg[], lieferanten: FinLieferant[]): Vorschlag[] {
  const zweck = kompakt(u.zweck);
  const name = kompakt(u.name);
  const liste: Vorschlag[] = [];
  if (u.betrag > 0) {
    for (const r of rechnungen) {
      if (r.status !== "gebucht" || r.bezahlt_am || r.storniert) continue;
      const passt = cent(r.brutto) === cent(u.betrag);
      const nummer = !!r.nummer_text && zweck.includes(kompakt(r.nummer_text));
      const kunde = kompakt(r.kunde).length > 3 && (name.includes(kompakt(r.kunde)) || kompakt(r.kunde).includes(name) && name.length > 3);
      const punkte = (passt ? 2 : 0) + (nummer ? 3 : 0) + (kunde ? 1 : 0);
      if (passt || nummer) liste.push({ art: "rechnung", id: r.rechnung_id, titel: `${r.nummer_text} · ${r.kunde}`, betrag: r.brutto, passt, punkte });
    }
  } else {
    for (const b of belege) {
      if (b.status !== "gebucht" || b.bezahlt_am || b.brutto == null) continue;
      const passt = cent(b.brutto) === cent(-u.betrag);
      const nummer = !!b.belegnummer && kompakt(b.belegnummer).length > 2 && zweck.includes(kompakt(b.belegnummer));
      const lname = kompakt(lieferanten.find((l) => l.id === b.lieferant_id)?.name);
      const lief = lname.length > 3 && (name.includes(lname) || zweck.includes(lname));
      const punkte = (passt ? 2 : 0) + (nummer ? 3 : 0) + (lief ? 1 : 0);
      if (passt || nummer) {
        liste.push({ art: "beleg", id: b.id, titel: [lieferanten.find((l) => l.id === b.lieferant_id)?.name, b.belegnummer, b.text].filter(Boolean).join(" · "), betrag: b.brutto, passt, punkte });
      }
    }
  }
  return liste.sort((a, b) => b.punkte - a.punkte).slice(0, 5);
}

// Konto, auf das ein früherer Umsatz desselben Namens gebucht wurde – die Regel entsteht von selbst.
export function kontoAusFrueheren(u: Pick<FinBankumsatz, "name" | "id">, alle: FinBankumsatz[], buchungen: Pick<FinBuchung, "id" | "fin_buchungszeilen">[], sachkonten: number[]): { konto: number; steuer: string | null } | null {
  const name = kompakt(u.name);
  if (name.length < 3) return null;
  const frueher = alle.find((x) => x.id !== u.id && x.status === "zugeordnet" && x.zuordnung === "konto" && kompakt(x.name) === name && x.buchung_id);
  const b = frueher && buchungen.find((x) => x.id === frueher.buchung_id);
  const zeile = b?.fin_buchungszeilen.find((z) => !z.ist_steuer && !sachkonten.includes(z.konto));
  return zeile ? { konto: zeile.konto, steuer: zeile.steuerschluessel } : null;
}

// ---------------------------------------------------------------- Kassenbuch
export type KassenZeile = { datum: string; nr: number; text: string; beleg: string | null; einnahme: number; ausgabe: number; bestand: number; storno: boolean };

// Alle Bewegungen auf dem Kassenkonto, nach Datum und Nummer, mit laufendem Bestand (ohne Anfangsbestand,
// solange keiner gebucht ist). Ein Bestand unter null ist ein Fehler im Kassenbuch – die Seite warnt.
export function kassenbuch(buchungen: FinBuchung[], kasse: number): { zeilen: KassenZeile[]; bestand: number; negativAm: string | null } {
  const bewegungen = buchungen
    .map((b) => {
      const soll = b.fin_buchungszeilen.filter((z) => z.konto === kasse && z.seite === "S").reduce((s, z) => s + Number(z.betrag), 0);
      const haben = b.fin_buchungszeilen.filter((z) => z.konto === kasse && z.seite === "H").reduce((s, z) => s + Number(z.betrag), 0);
      return { b, soll: cent(soll), haben: cent(haben) };
    })
    .filter((x) => x.soll || x.haben)
    .sort((a, c) => a.b.datum.localeCompare(c.b.datum) || a.b.nr - c.b.nr);
  let bestand = 0;
  let negativAm: string | null = null;
  const zeilen = bewegungen.map(({ b, soll, haben }) => {
    bestand = cent(bestand + soll - haben);
    if (bestand < 0 && !negativAm) negativAm = b.datum;
    return { datum: b.datum, nr: b.nr, text: b.text, beleg: b.beleg, einnahme: soll, ausgabe: haben, bestand, storno: !!b.storno_von || !!b.storniert_durch };
  });
  return { zeilen, bestand, negativAm };
}

// Saldo eines Sachkontos bis einschließlich `bis` (für „laut Bank – laut Finance“).
export function kontoSaldoBis(buchungen: FinBuchung[], konto: number, bis: string | null): number {
  return cent(buchungen.filter((b) => !bis || b.datum <= bis).reduce((s, b) =>
    s + b.fin_buchungszeilen.filter((z) => z.konto === konto).reduce((t, z) => t + (z.seite === "S" ? 1 : -1) * Number(z.betrag), 0), 0));
}

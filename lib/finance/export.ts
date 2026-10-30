// Finance F9 (Migration 97, v155): Export für den Steuerberater – DATEV-Buchungsstapel des ganzen Journals,
// GoBD-Datenexport (Datenträgerüberlassung nach dem Beschreibungsstandard) und eine Vorlage der
// Verfahrensdokumentation. Ohne Datenbank, geprüft in tests/financeExport.test.ts.
//
// DATEV rechnet die Umsatzsteuer selbst: Ein Satz trägt den BRUTTObetrag, die Steuer kommt aus dem Automatikkonto
// (8400, 3400 …) oder aus dem BU-Schlüssel am Gegenkonto. Finance speichert dagegen Netto- und Steuerzeile getrennt.
// Deshalb werden je Posten Netto und Steuer wieder zusammengefasst – aber nur, wenn DATEV aus dem Bruttobetrag
// dieselbe Steuer errechnet. Sonst gehen Netto (auf einem Automatikkonto mit BU 40 = ohne Automatik) und Steuer als
// eigene Sätze hinüber, und die Seite weist darauf hin. Stand Oktober 2026: zweistellige BU-Schlüssel (3/2 Umsatz-
// steuer, 9/8 Vorsteuer, 19 ig. Erwerb, 94 § 13b) – die erste Datei vor dem regelmäßigen Einsatz probeweise beim
// Steuerberater einlesen.

import type { FinBuchung, FinZeile as FinBuchungszeile, FinKonto, FinSteuerschluessel, KontoKategorie } from "./buchung";
import type { FinEinstellungen, Kontenrahmen } from "./einstellungen";
import { DATEV_SPALTEN, csv, datevBetrag, datevKopf, datevText, datevTt, windows1252 } from "@/lib/datev";
import type { Betrieb } from "@/lib/types";

const cent = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;

// BU-Schlüssel je Finance-Steuerschlüssel, wenn das Konto KEIN passendes Automatikkonto ist.
export const FIN_DATEV_BU: Record<string, string> = { ust19: "3", ust7: "2", vst19: "9", vst7: "8", ige19: "19", r13b19: "94", r13b2_19: "94" };
// Automatikkonten des DATEV-Standardkontenrahmens mit der Steuer, die DATEV dort selbst rechnet.
export const FIN_DATEV_AUTOMATIK: Record<Kontenrahmen, Record<number, string>> = {
  skr03: { 8400: "ust19", 8300: "ust7", 3400: "vst19", 3300: "vst7", 3425: "ige19", 3123: "r13b19", 8736: "ust19", 8731: "ust7", 3736: "vst19", 3731: "vst7" },
  skr04: { 4400: "ust19", 4300: "ust7", 5400: "vst19", 5300: "vst7", 5425: "ige19", 5923: "r13b19", 4736: "ust19", 4731: "ust7", 5736: "vst19", 5731: "vst7" },
};
// „Aufhebung der Automatik“: Ein Automatikkonto ohne Steuer (Netto-Satz, Abgrenzung, Umbuchung).
export const FIN_DATEV_OHNE_AUTOMATIK = "40";

// `kost1`/`kost2`: Kostenstelle und Kostenträger (Migration 108) – von der Erlös-/Aufwandszeile, die im Satz steht.
export type DatevSatz = { umsatz: number; sh: "S" | "H"; konto: number; gegenkonto: number; bu: string; datum: string; beleg: string; text: string; finNr: string; kost1?: string; kost2?: string };

type El = { posten: number; seite: "S" | "H"; konto: number; betrag: number; bu: string; kombi: boolean; erfolg: boolean };
type Ctx = { kat: Map<number, KontoKategorie>; schl: Map<string, FinSteuerschluessel>; rahmen: Kontenrahmen };
const ERFOLG: KontoKategorie[] = ["erloes", "aufwand", "anlage"];

// Netto + Steuer je Posten zu einem Bruttosatz zusammenfassen (oder, mit `netto`, getrennt lassen).
function elemente(z: FinBuchungszeile[], c: Ctx, netto: boolean): { els: El[]; getrennt: boolean; hinweis: string[] } {
  const am = FIN_DATEV_AUTOMATIK[c.rahmen];
  const benutzt = new Set<number>();
  const els: El[] = [];
  const hinweis: string[] = [];
  let getrennt = false;
  z.forEach((l, i) => {
    const st = l.steuerschluessel ? c.schl.get(l.steuerschluessel) : undefined;
    if (l.ist_steuer || !st || !["ust", "vst", "r13b", "ige"].includes(st.art) || !ERFOLG.includes(c.kat.get(l.konto) as KontoKategorie)) return;
    const satz = Number(st.satz);
    const steuern = z.map((t, j) => ({ t, j })).filter(({ t, j }) => t.ist_steuer && t.posten === l.posten && t.steuerschluessel === l.steuerschluessel && !benutzt.has(j));
    const bu = am[l.konto] === st.schluessel ? "" : FIN_DATEV_BU[st.schluessel] ?? "";
    if (st.art === "ust" || st.art === "vst") {
      const t = steuern.find(({ t }) => t.seite === l.seite);
      const brutto = cent(Number(l.betrag) + (t ? Number(t.t.betrag) : 0));
      const datev = cent((brutto * satz) / (100 + satz));
      if (!netto && datev === (t ? cent(Number(t.t.betrag)) : 0) && (bu || am[l.konto] === st.schluessel)) {
        els.push({ posten: l.posten, seite: l.seite, konto: l.konto, betrag: brutto, bu, kombi: true, erfolg: true });
        benutzt.add(i); if (t) benutzt.add(t.j);
      } else getrennt = true;
    } else {
      const tu = steuern.find(({ t }) => t.seite !== l.seite && t.konto === st.ust_konto);
      const tv = steuern.find(({ t }) => t.seite === l.seite && t.konto === st.vst_konto);
      const datev = cent((Number(l.betrag) * satz) / 100);
      if (!netto && tu && tv && cent(Number(tu.t.betrag)) === datev && cent(Number(tv.t.betrag)) === datev && (bu || am[l.konto] === st.schluessel)) {
        els.push({ posten: l.posten, seite: l.seite, konto: l.konto, betrag: cent(Number(l.betrag)), bu, kombi: true, erfolg: true });
        benutzt.add(i); benutzt.add(tu.j); benutzt.add(tv.j);
        if (st.schluessel === "r13b2_19" && am[l.konto] !== st.schluessel) hinweis.push("§ 13b Abs. 2 mit BU 94 übertragen – Sachverhalt mit dem Steuerberater prüfen");
      } else getrennt = true;
    }
  });
  z.forEach((l, i) => {
    if (benutzt.has(i)) return;
    // Forderung/Verbindlichkeit mit Personenkonto (Migration 110): DATEV bucht auf den Debitor bzw. Kreditor, das
    // Sammelkonto ergibt sich dort von selbst.
    els.push({ posten: l.posten, seite: l.seite, konto: l.personenkonto ?? l.konto, betrag: cent(Number(l.betrag)), bu: am[l.konto] ? FIN_DATEV_OHNE_AUTOMATIK : "", kombi: false,
      erfolg: ERFOLG.includes(c.kat.get(l.konto) as KontoKategorie) });
  });
  return { els, getrennt, hinweis };
}

type Roh = { umsatz: number; sh: "S" | "H"; konto: number; gegenkonto: number; bu: string };

// Konto/Gegenkonto-Paare. `null`, wenn ein Bruttosatz geteilt werden müsste (dann rechnete DATEV die Steuer anders).
function paare(els: El[]): Roh[] | null {
  const summe = (l: El[], s: "S" | "H") => cent(l.filter((e) => e.seite === s).reduce((t, e) => t + e.betrag, 0));
  const jePosten = new Map<number, El[]>();
  for (const e of els) jePosten.set(e.posten, [...(jePosten.get(e.posten) ?? []), e]);
  const gruppen = [...jePosten.values()].every((g) => summe(g, "S") === summe(g, "H")) ? [...jePosten.values()] : [els];
  const aus: Roh[] = [];
  for (const g of gruppen) {
    const S = g.filter((e) => e.seite === "S" && e.betrag !== 0), H = g.filter((e) => e.seite === "H" && e.betrag !== 0);
    if (!S.length && !H.length) continue;
    // Das Erlös-, Aufwands- oder Anlagekonto (mit Steuer) steht im Gegenkonto, das Geld- oder Personenkonto im Konto.
    const gegenartig = (e: El) => !!e.bu || e.kombi || e.erfolg;
    const einzeln = S.length === 1 && H.length === 1
      ? (gegenartig(S[0]) && !H[0].bu ? H[0] : S[0])
      : S.length === 1 && !S[0].bu ? S[0] : H.length === 1 && !H[0].bu ? H[0] : null;
    if (einzeln && (S.length === 1 || H.length === 1)) {
      for (const o of g.filter((e) => e.seite !== einzeln.seite && e.betrag !== 0)) {
        aus.push({ umsatz: o.betrag, sh: einzeln.seite, konto: einzeln.konto, gegenkonto: o.konto, bu: o.bu });
      }
      continue;
    }
    if (g.some((e) => e.kombi)) return null;
    // Beide Seiten mehrfach (oder die einzelne trägt einen Schlüssel): Stück für Stück zuordnen.
    const s = S.map((e) => ({ ...e })), h = H.map((e) => ({ ...e }));
    let i = 0, j = 0;
    while (i < s.length && j < h.length) {
      const m = cent(Math.min(s[i].betrag, h[j].betrag));
      if (m > 0) {
        if (s[i].bu && !h[j].bu) aus.push({ umsatz: m, sh: "H", konto: h[j].konto, gegenkonto: s[i].konto, bu: s[i].bu });
        else aus.push({ umsatz: m, sh: "S", konto: s[i].konto, gegenkonto: h[j].konto, bu: h[j].bu });
      }
      s[i].betrag = cent(s[i].betrag - m); h[j].betrag = cent(h[j].betrag - m);
      if (s[i].betrag <= 0) i++;
      if (h[j].betrag <= 0) j++;
    }
  }
  return aus;
}

const belegfeld = (b: FinBuchung) => ((b.beleg ?? "").replace(/[^A-Za-z0-9$&%*+\-/]/g, "") || `FIN${b.jahr}-${b.nr}`).slice(0, 36);

// Eine Finance-Buchung als DATEV-Sätze, dazu ein Hinweis, wenn sie ohne Steuerautomatik hinübergeht.
export function datevSaetze(b: FinBuchung, c: Ctx): { saetze: DatevSatz[]; hinweise: string[] } {
  const zeilen = [...b.fin_buchungszeilen].sort((x, y) => (x.id ?? 0) - (y.id ?? 0));
  let e = elemente(zeilen, c, false);
  let roh = paare(e.els);
  let getrennt = e.getrennt;
  if (!roh) { e = elemente(zeilen, c, true); roh = paare(e.els); getrennt = true; }
  const hinweise = [...new Set(e.hinweis)].map((h) => `Nr. ${b.nr}: ${h}.`);
  if (getrennt && zeilen.some((z) => z.ist_steuer)) hinweise.push(`Nr. ${b.nr} (${b.text}): Steuer als eigener Satz, ohne Automatik – beim Einlesen prüfen.`);
  const saetze = (roh ?? []).filter((r) => r.umsatz > 0).map((r) => {
    const k = zeilen.find((z) => !z.ist_steuer && (z.konto === r.gegenkonto || z.konto === r.konto) && (z.kost1 || z.kost2));
    return {
      ...r, datum: b.datum, beleg: belegfeld(b), text: b.text.slice(0, 60), finNr: `${b.jahr}-${b.nr}`,
      ...(k?.kost1 ? { kost1: k.kost1 } : {}), ...(k?.kost2 ? { kost2: k.kost2 } : {}),
    };
  });
  return { saetze, hinweise };
}

// Was am Betrieb (Admin › Betrieb › DATEV) für diesen Export fehlt.
export function finDatevFehler(b: Pick<Betrieb, "datev_berater" | "datev_mandant" | "datev_sachkontenlaenge"> | null): string[] {
  if (!b) return ["Die Betriebseinstellungen fehlen (Admin › Betrieb)."];
  const f: string[] = [];
  if (b.datev_berater == null || b.datev_berater < 1001 || b.datev_berater > 9999999) f.push("Die Beraternummer fehlt oder passt nicht (Admin › Betrieb › DATEV, 4 bis 7 Stellen).");
  if (b.datev_mandant == null || b.datev_mandant < 1 || b.datev_mandant > 99999) f.push("Die Mandantennummer fehlt oder passt nicht (Admin › Betrieb › DATEV, bis 5 Stellen).");
  if (b.datev_sachkontenlaenge !== 4) f.push(`Finance bucht auf vierstellige Konten – unter Admin › Betrieb › DATEV steht die Sachkontenlänge ${b.datev_sachkontenlaenge}.`);
  return f;
}

export type FinDatevStapel = { inhalt: string; dateiname: string; saetze: number; buchungen: number; fehler: string[]; hinweise: string[] };

export function finDatevStapel(buchungen: FinBuchung[], konten: FinKonto[], schluessel: FinSteuerschluessel[], o: {
  rahmen: Kontenrahmen; betrieb: Pick<Betrieb, "datev_berater" | "datev_mandant" | "datev_sachkontenlaenge" | "datev_skr"> | null;
  von: string; bis: string; ohneVortrag: boolean; erzeugtAm: Date;
}): FinDatevStapel {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  const c: Ctx = { kat, schl: new Map(schluessel.map((s) => [s.schluessel, s])), rahmen: o.rahmen };
  const fehler = finDatevFehler(o.betrieb);
  const hinweise: string[] = [];
  const skr = o.rahmen === "skr03" ? "03" : "04";
  if (o.betrieb && o.betrieb.datev_skr !== skr) hinweise.push(`Admin › Betrieb nennt SKR${o.betrieb.datev_skr}, Finance bucht im SKR${skr} – die Datei trägt SKR${skr}.`);
  const auswahl = buchungen.filter((b) => b.datum >= o.von && b.datum <= o.bis)
    .filter((b) => !o.ohneVortrag || !b.fin_buchungszeilen.some((z) => kat.get(z.konto) === "vortrag"))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.nr - b.nr);
  const saetze: DatevSatz[] = [];
  for (const b of auswahl) {
    const x = datevSaetze(b, c);
    saetze.push(...x.saetze);
    hinweise.push(...x.hinweise);
  }
  const i = { umsatz: 0, sh: 1, wkz: 2, konto: 6, gegenkonto: 7, bu: 8, belegdatum: 9, beleg1: 10, text: 13, zusatzArt: DATEV_SPALTEN.indexOf("Zusatzinformation - Art 1"), zusatzInhalt: DATEV_SPALTEN.indexOf("Zusatzinformation- Inhalt 1"),
    kost1: DATEV_SPALTEN.indexOf("KOST1 - Kostenstelle"), kost2: DATEV_SPALTEN.indexOf("KOST2 - Kostenstelle") };
  const zeilen = saetze.map((s) => {
    const f = DATEV_SPALTEN.map(() => "");
    f[i.umsatz] = datevBetrag(s.umsatz); f[i.sh] = datevText(s.sh); f[i.wkz] = datevText("EUR");
    f[i.konto] = String(s.konto); f[i.gegenkonto] = String(s.gegenkonto); f[i.bu] = s.bu ? datevText(s.bu) : "";
    f[i.belegdatum] = datevTt(s.datum); f[i.beleg1] = datevText(s.beleg); f[i.text] = datevText(s.text);
    f[i.zusatzArt] = datevText("Finance-Nr"); f[i.zusatzInhalt] = datevText(s.finNr);
    if (s.kost1) f[i.kost1] = datevText(s.kost1);
    if (s.kost2) f[i.kost2] = datevText(s.kost2);
    return f.join(";");
  });
  const kopf = datevKopf({
    herkunft: "FI", berater: o.betrieb?.datev_berater ?? null, mandant: o.betrieb?.datev_mandant ?? null, wjBeginn: `${o.von.slice(0, 4)}-01-01`,
    sachkontenlaenge: 4, von: o.von, bis: o.bis, bezeichnung: `Finance ${o.von.slice(0, 7)}–${o.bis.slice(0, 7)}`, skr, erzeugtAm: o.erzeugtAm,
  });
  return {
    inhalt: [kopf, DATEV_SPALTEN.join(";"), ...zeilen].join("\r\n") + "\r\n",
    dateiname: `EXTF_Finance_${o.von}_${o.bis}.csv`, saetze: saetze.length, buchungen: auswahl.length, fehler, hinweise,
  };
}

// ---------------------------------------------------------------- Zeiträume
export type ExportZeitraum = { key: string; text: string; von: string; bis: string };
export function exportZeitraeume(jahr: number): ExportZeitraum[] {
  const ende = (m: number) => new Date(Date.UTC(jahr, m, 0)).toISOString().slice(0, 10);
  const mm = (m: number) => String(m).padStart(2, "0");
  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return [
    { key: "jahr", text: `Jahr ${jahr}`, von: `${jahr}-01-01`, bis: `${jahr}-12-31` },
    ...[1, 2, 3, 4].map((q) => ({ key: `q${q}`, text: `${q}. Quartal`, von: `${jahr}-${mm(q * 3 - 2)}-01`, bis: ende(q * 3) })),
    ...monate.map((t, k) => ({ key: `m${k + 1}`, text: t, von: `${jahr}-${mm(k + 1)}-01`, bis: ende(k + 1) })),
  ];
}

// ---------------------------------------------------------------- Protokoll
export type FinExportProtokoll = { id: string; art: "datev" | "gobd"; von: string; bis: string; buchungen: number; summe: number; letzte_nr: number | null; erstellt_am: string; jetzt: { buchungen: number; summe: number; letzte_nr: number | null } };
export function protokolleLesen(roh: unknown): FinExportProtokoll[] {
  return ((roh ?? []) as Record<string, unknown>[]).map((x) => {
    const j = (x.jetzt ?? {}) as Record<string, unknown>;
    return {
      id: String(x.id), art: x.art as "datev" | "gobd", von: String(x.von), bis: String(x.bis), buchungen: Number(x.buchungen), summe: Number(x.summe),
      letzte_nr: x.letzte_nr == null ? null : Number(x.letzte_nr), erstellt_am: String(x.erstellt_am),
      jetzt: { buchungen: Number(j.buchungen ?? 0), summe: Number(j.summe ?? 0), letzte_nr: j.letzte_nr == null ? null : Number(j.letzte_nr) },
    };
  });
}
export const exportGeaendert = (p: FinExportProtokoll) =>
  p.buchungen !== p.jetzt.buchungen || cent(p.summe) !== cent(p.jetzt.summe) || p.letzte_nr !== p.jetzt.letzte_nr;

// ---------------------------------------------------------------- GoBD-Datenexport
export type FinExportBeleg = { belegdatum: string; belegnummer: string | null; lieferant: string | null; text: string | null; brutto: number | null; status: string; buchung_nr: number | null; bezahlt_am: string | null; datei_name: string | null };
type Spalte = { name: string; typ: "a" | "n" | "d"; stellen?: number };
type Tabelle = { url: string; name: string; text: string; schluessel: Spalte; spalten: Spalte[]; verweis?: { spalte: string; tabelle: string }; zeilen: (string | number | null)[][] };

const datumDe = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function gobdTabellen(buchungen: FinBuchung[], konten: FinKonto[], schluessel: FinSteuerschluessel[], belege: FinExportBeleg[]): Tabelle[] {
  const nrVon = new Map(buchungen.map((b) => [b.id, `${b.jahr}-${b.nr}`]));
  const a = (name: string): Spalte => ({ name, typ: "a" }), n = (name: string, stellen = 0): Spalte => ({ name, typ: "n", stellen }), d = (name: string): Spalte => ({ name, typ: "d" });
  return [
    { url: "buchungen.csv", name: "Buchungen", text: "Journal: ein Satz je Buchung", schluessel: a("Buchung"),
      spalten: [n("Jahr"), n("Nummer"), d("Datum"), a("Text"), a("Beleg"), a("Quelle"), a("Storno_von"), a("Storniert_durch"), a("Grund"), a("Erfasst_am")],
      zeilen: buchungen.map((b) => [`${b.jahr}-${b.nr}`, b.jahr, b.nr, datumDe(b.datum), b.text, b.beleg ?? "", b.quelle,
        b.storno_von ? nrVon.get(b.storno_von) ?? b.storno_von : "", b.storniert_durch ? nrVon.get(b.storniert_durch) ?? b.storniert_durch : "", b.grund ?? "", b.erstellt_am]) },
    { url: "buchungszeilen.csv", name: "Buchungszeilen", text: "Soll- und Habenzeilen je Buchung", schluessel: a("Zeile"), verweis: { spalte: "Buchung", tabelle: "Buchungen" },
      spalten: [a("Buchung"), n("Posten"), a("Seite"), n("Konto"), n("Betrag", 2), a("Steuerschluessel"), a("Steuerzeile"), a("KOST1"), a("KOST2"), a("Personenkonto")],
      zeilen: buchungen.flatMap((b) => [...b.fin_buchungszeilen].sort((x, y) => (x.id ?? 0) - (y.id ?? 0)).map((z, k) =>
        [`${b.jahr}-${b.nr}-${k + 1}`, `${b.jahr}-${b.nr}`, z.posten, z.seite, z.konto, Number(z.betrag), z.steuerschluessel ?? "", z.ist_steuer ? "ja" : "nein", z.kost1 ?? "", z.kost2 ?? "", z.personenkonto ?? ""])) },
    { url: "konten.csv", name: "Konten", text: "Kontenplan", schluessel: n("Konto"),
      spalten: [a("Bezeichnung"), a("Kategorie"), a("Eigenes_Konto"), a("Aktiv")],
      zeilen: [...konten].sort((x, y) => x.nummer - y.nummer).map((k) => [k.nummer, k.bezeichnung, k.kategorie, k.eigen ? "ja" : "nein", k.aktiv ? "ja" : "nein"]) },
    { url: "steuerschluessel.csv", name: "Steuerschluessel", text: "Steuerschlüssel mit Satz und Konten", schluessel: a("Schluessel"),
      spalten: [a("Bezeichnung"), n("Satz", 2), a("Art"), n("USt_Konto"), n("VSt_Konto")],
      zeilen: schluessel.map((s) => [s.schluessel, s.bezeichnung, Number(s.satz), s.art, s.ust_konto ?? "", s.vst_konto ?? ""]) },
    { url: "belege.csv", name: "Belege", text: "Eingangsbelege (die Dateien liegen in Finance › Belege)", schluessel: a("Lfd"),
      spalten: [d("Belegdatum"), a("Belegnummer"), a("Lieferant"), a("Text"), n("Brutto", 2), a("Status"), a("Buchung"), d("Bezahlt_am"), a("Datei")],
      zeilen: belege.map((x, k) => [String(k + 1), datumDe(x.belegdatum), x.belegnummer ?? "", x.lieferant ?? "", x.text ?? "", x.brutto ?? "", x.status,
        x.buchung_nr != null ? String(x.buchung_nr) : "", datumDe(x.bezahlt_am), x.datei_name ?? ""]) },
  ];
}

// GDPdU/GoBD-Beschreibungsstandard: index.xml plus CSV (Windows-1252, Semikolon, Komma als Dezimalzeichen).
export function gobdIndexXml(tabellen: Pick<Tabelle, "url" | "name" | "text" | "schluessel" | "spalten" | "verweis">[], o: { firma: string; ort: string; von: string; bis: string }): string {
  const spalte = (s: Spalte, tag: "VariablePrimaryKey" | "VariableColumn") =>
    `        <${tag}>\n          <Name>${xml(s.name)}</Name>\n          ${s.typ === "a" ? "<AlphaNumeric/>" : s.typ === "d" ? "<Date><Format>DD.MM.YYYY</Format></Date>" : `<Numeric>${s.stellen ? `<Accuracy>${s.stellen}</Accuracy>` : ""}</Numeric>`}\n        </${tag}>`;
  const tab = (t: (typeof tabellen)[number]) => `    <Table>
      <URL>${t.url}</URL>
      <Name>${xml(t.name)}</Name>
      <Description>${xml(t.text)}</Description>
      <Validity><Range><From>${datumDe(o.von)}</From><To>${datumDe(o.bis)}</To></Range><Format>DD.MM.YYYY</Format></Validity>
      <DecimalSymbol>,</DecimalSymbol>
      <DigitGroupingSymbol>.</DigitGroupingSymbol>
      <VariableLength>
        <ColumnDelimiter>;</ColumnDelimiter>
        <RecordDelimiter>&#13;&#10;</RecordDelimiter>
        <TextEncapsulator>&quot;</TextEncapsulator>
${spalte(t.schluessel, "VariablePrimaryKey")}
${t.spalten.map((s) => spalte(s, "VariableColumn")).join("\n")}${t.verweis ? `\n        <ForeignKey>\n          <Name>${xml(t.verweis.spalte)}</Name>\n          <References>${xml(t.verweis.tabelle)}</References>\n        </ForeignKey>` : ""}
      </VariableLength>
    </Table>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">
<DataSet>
  <Version>1.0</Version>
  <DataSupplier>
    <Name>${xml(o.firma)}</Name>
    <Location>${xml(o.ort)}</Location>
    <Comment>MR Assistent · Finance (Pilot), Zeitraum ${datumDe(o.von)} bis ${datumDe(o.bis)}</Comment>
  </DataSupplier>
  <Media>
    <Name>Finance</Name>
${tabellen.map(tab).join("\n")}
  </Media>
</DataSet>
`;
}

// Ein Feld wie in einer CSV für Excel, aber ohne BOM (die Datei ist Windows-1252, nicht UTF-8).
function csvOhneBom(zeilen: (string | number | null)[][]): string {
  return csv(zeilen).replace(/^﻿/, "");
}

export function gobdDateien(buchungen: FinBuchung[], konten: FinKonto[], schluessel: FinSteuerschluessel[], belege: FinExportBeleg[], o: { firma: string; ort: string; von: string; bis: string; erzeugtAm: Date }): { name: string; daten: Uint8Array }[] {
  const tabellen = gobdTabellen(buchungen.filter((b) => b.datum >= o.von && b.datum <= o.bis), konten, schluessel, belege);
  const enc = new TextEncoder();
  const liesmich = [
    "Datenträgerüberlassung (GoBD) aus MR Assistent · Finance – Pilot",
    `Zeitraum ${datumDe(o.von)} bis ${datumDe(o.bis)}, erzeugt am ${o.erzeugtAm.toLocaleString("de-DE")}.`,
    "",
    "index.xml beschreibt die Tabellen nach dem Beschreibungsstandard (GDPdU). Die DTD gdpdu-01-09-2004.dtd gehört in",
    "denselben Ordner; sie steht beim Bundesfinanzministerium zum Herunterladen bereit.",
    "Die CSV-Dateien sind Windows-1252 (ANSI), Trennzeichen Semikolon, Dezimalzeichen Komma, Datum TT.MM.JJJJ.",
    "Belegdateien (Fotos, PDF, E-Rechnungen) sind nicht enthalten – sie liegen in Finance › Belege.",
  ].join("\r\n") + "\r\n";
  return [
    { name: "index.xml", daten: enc.encode(gobdIndexXml(tabellen, o)) },
    ...tabellen.map((t) => ({ name: t.url, daten: windows1252(csvOhneBom([[t.schluessel.name, ...t.spalten.map((s) => s.name)], ...t.zeilen])) })),
    { name: "LIESMICH.txt", daten: windows1252(liesmich) },
  ];
}

// ---------------------------------------------------------------- ZIP (ohne Kompression)
const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_TABELLE[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipDateien(dateien: { name: string; daten: Uint8Array }[], am: Date): Uint8Array {
  const zeit = (am.getHours() << 11) | (am.getMinutes() << 5) | Math.floor(am.getSeconds() / 2);
  const datum = ((am.getFullYear() - 1980) << 9) | ((am.getMonth() + 1) << 5) | am.getDate();
  const teile: Uint8Array[] = [];
  const zentral: Uint8Array[] = [];
  let lage = 0;
  const enc = new TextEncoder();
  for (const f of dateien) {
    const name = enc.encode(f.name);
    const crc = crc32(f.daten);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true); kopf.setUint16(8, 0, true);
    kopf.setUint16(10, zeit, true); kopf.setUint16(12, datum, true); kopf.setUint32(14, crc, true);
    kopf.setUint32(18, f.daten.length, true); kopf.setUint32(22, f.daten.length, true); kopf.setUint16(26, name.length, true); kopf.setUint16(28, 0, true);
    teile.push(new Uint8Array(kopf.buffer), name, f.daten);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true); z.setUint16(10, 0, true);
    z.setUint16(12, zeit, true); z.setUint16(14, datum, true); z.setUint32(16, crc, true); z.setUint32(20, f.daten.length, true); z.setUint32(24, f.daten.length, true);
    z.setUint16(28, name.length, true); z.setUint32(42, lage, true);
    zentral.push(new Uint8Array(z.buffer), name);
    lage += 30 + name.length + f.daten.length;
  }
  const groesse = zentral.reduce((s, x) => s + x.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, dateien.length, true); ende.setUint16(10, dateien.length, true);
  ende.setUint32(12, groesse, true); ende.setUint32(16, lage, true);
  const alle = [...teile, ...zentral, new Uint8Array(ende.buffer)];
  const aus = new Uint8Array(alle.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of alle) { aus.set(x, p); p += x.length; }
  return aus;
}

// ---------------------------------------------------------------- Verfahrensdokumentation (Vorlage)
// Eine Vorlage zum Ausfüllen, gegliedert wie üblich (allgemeine Beschreibung, Anwender-, technische System- und
// Betriebsdokumentation, internes Kontrollsystem). Eigene Formulierung; was nur der Betrieb wissen kann, steht in
// eckigen Klammern.
export function verfahrensdokumentation(b: Pick<Betrieb, "firma" | "inhaber" | "strasse" | "plz" | "ort"> | null, e: FinEinstellungen, stand: string): string {
  const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const firma = h(b?.firma || "[Firma]");
  const rechtsform: Record<string, string> = { einzel: "Einzelunternehmen", gbr: "GbR", ug: "UG (haftungsbeschränkt)", gmbh: "GmbH", sonstige: "[Rechtsform]" };
  const p = (titel: string, ...zeilen: string[]) => `<h2>${titel}</h2>\n${zeilen.map((z) => (z.startsWith("<") ? z : `<p>${z}</p>`)).join("\n")}`;
  const liste = (...x: string[]) => `<ul>${x.map((y) => `<li>${y}</li>`).join("")}</ul>`;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Verfahrensdokumentation ${firma}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#222;line-height:1.5;font-size:14px}
h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:4px}.klein{color:#666;font-size:12px}
td,th{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}table{border-collapse:collapse;width:100%}@media print{body{margin:0}}</style></head>
<body>
<h1>Verfahrensdokumentation zur Buchführung</h1>
<p class="klein">Vorlage aus MR Assistent · Finance, Stand ${h(stand)}. Bitte prüfen, ergänzen (eckige Klammern) und mit dem Steuerberater
abstimmen. Die Dokumentation beschreibt das Verfahren, wie es tatsächlich gelebt wird – Änderungen werden mit Datum nachgetragen,
alte Fassungen aufbewahrt.</p>
<table><tr><th>Unternehmen</th><td>${firma}${b?.inhaber ? `, ${h(b.inhaber)}` : ""}</td></tr>
<tr><th>Anschrift</th><td>${h([b?.strasse, [b?.plz, b?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "[Anschrift]")}</td></tr>
<tr><th>Rechtsform</th><td>${rechtsform[e.rechtsform]}</td></tr>
<tr><th>Gewinnermittlung</th><td>${e.gewinnermittlung === "bilanz" ? "Bilanzierung (§§ 4 Abs. 1, 5 EStG)" : "Einnahmen-Überschuss-Rechnung (§ 4 Abs. 3 EStG)"}</td></tr>
<tr><th>Kontenrahmen</th><td>${e.kontenrahmen.toUpperCase()}</td></tr>
<tr><th>Umsatzsteuer</th><td>${e.besteuerung === "klein" ? "Kleinunternehmer (§ 19 UStG)" : `Regelbesteuerung, ${e.versteuerung === "ist" ? "Ist" : "Soll"}-Versteuerung, Voranmeldung ${e.voranmeldung === "monat" ? "monatlich" : e.voranmeldung === "quartal" ? "vierteljährlich" : "keine"}${e.dauerfrist ? ", mit Dauerfristverlängerung" : ""}`}</td></tr>
<tr><th>Verantwortlich</th><td>[Name, Rolle] · Steuerberatung: [Kanzlei]</td></tr></table>

${p("1. Allgemeine Beschreibung",
    "Der Betrieb erbringt mobilen Reifenservice. Aufträge, Lager und Rechnungen werden in MR Assistent (FSM) geführt, die Buchhaltung im Teil Finance derselben Anwendung. [Abgrenzung: was Finance enthält und was weiterhin anderswo gebucht wird – im Pilot nur Vorgänge mit „Rechnung nötig“.]",
    "Belegarten: Ausgangsrechnungen (aus FSM, fortlaufender Nummernkreis ohne Lücken), Eingangsbelege (Foto, PDF, E-Rechnung), Kontoauszüge (CAMT oder CSV), Kassenbuch, Eigenbelege [Beispiele].")}
${p("2. Anwenderdokumentation – wer macht was",
    liste(
      "<b>Ausgangsrechnungen:</b> Ausstellen in FSM oder Finance bucht Forderung, Erlös und Umsatzsteuer sofort; eine Korrektur geschieht nur per Storno-Rechnung.",
      "<b>Eingangsbelege:</b> hochladen, Lieferant und Konto wählen, buchen; die Datei eines gebuchten Belegs lässt sich nicht mehr löschen. [Wer prüft und gibt frei? Bis wann nach Eingang?]",
      "<b>Bank:</b> Kontoauszug [wöchentlich/monatlich] einlesen, Umsätze Rechnungen, Belegen oder Konten zuordnen; doppelte Umsätze erkennt die Anwendung.",
      "<b>Kasse:</b> Bareinnahmen und -ausgaben werden täglich erfasst; Kassensturz [Häufigkeit] mit Protokoll, Differenzen werden gebucht.",
      "<b>Abschreibungen:</b> Anlagen im Verzeichnis, Abschreibung [monatlich/jährlich] über „Abschreibungen buchen“.",
      "<b>Festschreibung:</b> Ein Monat wird nach Abschluss der Abstimmung festgeschrieben [bis zum … des Folgemonats]; danach ist er nicht mehr bebuchbar.",
      "<b>Korrekturen:</b> nie ändern oder löschen, sondern stornieren (Gegenbuchung mit Grund) und neu buchen.",
      "<b>Übergabe:</b> DATEV-Buchungsstapel [monatlich] an die Steuerberatung; jeder Export wird mit Zeitraum und Stand protokolliert.",
    ))}
${p("3. Technische Systemdokumentation",
    liste(
      "Anwendung: MR Assistent (Web-Anwendung/PWA), Datenbank PostgreSQL bei Supabase, Auslieferung über Vercel. [Rechenzentrumsstandort, Auftragsverarbeitungsverträge vom …]",
      "Zugriff nur mit persönlicher Anmeldung (Einladung, kein offenes Registrieren); Rechte je Bereich (lesen, schreiben, löschen), in der Datenbank durchgesetzt.",
      "Unveränderbarkeit: Buchungen und Buchungszeilen sind nur lesbar; geschrieben wird ausschließlich über geprüfte Datenbankfunktionen (Soll = Haben, lückenlose Nummern je Jahr, Festschreibung je Monat, Storno statt Löschen).",
      "Änderungen an Stammdaten und Einstellungen werden im Änderungsprotokoll festgehalten.",
      "Datenexport für die Betriebsprüfung: Finance › Export erzeugt den GoBD-Datenexport (Beschreibungsstandard, index.xml mit CSV).",
    ))}
${p("4. Betriebsdokumentation",
    liste(
      "Datensicherung: [wer, wie oft, wohin – z. B. Sicherung der Datenbank durch den Anbieter, zusätzlich „Alle Daten sichern“ monatlich auf …]. Wiederherstellung getestet am [Datum].",
      "Aufbewahrung: Buchungsbelege acht Jahre (seit 2025), Bücher, Inventare und Abschlüsse zehn Jahre, jeweils ab Ende des Kalenderjahres. Daten werden in dieser Zeit nicht gelöscht; „Alle Daten löschen“ ist nur mit vorheriger Sicherung zulässig.",
      "Belegdateien: im geschützten Speicher der Anwendung; Papierbelege werden [nach dem Hochladen aufbewahrt / nach ersetzendem Scannen vernichtet – Verfahren beschreiben].",
      "Änderungen an der Anwendung werden mit Fassungsnummer ausgeliefert; die Neuigkeiten jeder Fassung stehen in der Anwendung.",
    ))}
${p("5. Internes Kontrollsystem",
    liste(
      "Vier-Augen-Prinzip bei [Zahlungsfreigaben, Stammdatenänderungen] – [wer].",
      "Monatliche Abstimmung: Bankkonto gegen Kontoauszug, Kasse gegen Kassensturz, offene Posten, Umsatzsteuer-Voranmeldung gegen die Konten.",
      "Rechte werden nur nach Bedarf vergeben und [halbjährlich] überprüft.",
    ))}
<p class="klein">Diese Vorlage ersetzt keine Beratung. Sie ist ein Ausgangspunkt für die eigene Verfahrensdokumentation nach den GoBD.</p>
</body></html>
`;
}

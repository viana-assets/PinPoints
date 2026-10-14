// Finance F8 (Migration 96, v154): Jahresabschluss – GuV, Bilanz, Anlagenspiegel und Saldenvortrag ohne Datenbank,
// geprüft in tests/financeAbschluss.test.ts. Die Datenbank liefert Soll/Haben je Konto und Monat
// (`fin_auswertung_salden`, Migration 94) und rechnet den Vortrag (`fin_vortrag_zeilen`, Migration 96); hier wird
// gegliedert.
//
// GuV nach § 275 Abs. 2 HGB (Gesamtkostenverfahren, nur die Posten, die ein Reifenservice bebucht), Bilanz nach § 266 HGB
// in der verkürzten Form für kleine Gesellschaften. Beides ist ein Probelauf aus dem, was in Finance gebucht ist – den
// Jahresabschluss stellt der Steuerberater auf.

import type { FinKonto } from "./buchung";
import type { Kontenrahmen, Rechtsform } from "./einstellungen";
import type { FinSaldo } from "./auswertungen";
import { FIN_SONSTIGE_ERTRAEGE } from "./auswertungen";
import { afaBis, monatIndex, type FinAnlage } from "./anlagen";

const cent = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
type Bereich = [number, number];
const drin = (n: number, b: Bereich[]) => b.some(([v, bis]) => n >= v && n <= bis);

// Feste Konten je Kontenrahmen – wie `fin_abschluss_konto()` (Migration 96, Test vergleicht).
export const FIN_ABSCHLUSS_KONTEN: Record<Kontenrahmen, { rueckstellung: number; rap_aktiv: number; rap_passiv: number; gewinnvortrag: number; kapital: number; ust_vorjahr: number }> = {
  skr03: { rueckstellung: 970, rap_aktiv: 980, rap_passiv: 990, gewinnvortrag: 860, kapital: 880, ust_vorjahr: 1790 },
  skr04: { rueckstellung: 3070, rap_aktiv: 1900, rap_passiv: 3900, gewinnvortrag: 2970, kapital: 2010, ust_vorjahr: 3840 },
};

export type AbschlussArt = "rueckstellung" | "rap_aktiv" | "rap_passiv";
export const FIN_ABSCHLUSS_ARTEN: { wert: AbschlussArt; text: string; kontoArt: "aufwand" | "erloes"; hinweis: string }[] = [
  { wert: "rueckstellung", text: "Rückstellung", kontoArt: "aufwand",
    hinweis: "Aufwand dieses Jahres, der erst später bezahlt wird und dessen Höhe noch nicht feststeht (z. B. Abschlusskosten). Verbraucht wird sie mit der Zahlung: Bank an Rückstellung." },
  { wert: "rap_aktiv", text: "Aktive Abgrenzung", kontoArt: "aufwand",
    hinweis: "Schon bezahlt, gehört aber ins nächste Jahr (z. B. Miete Januar im Dezember überwiesen). Wird am 01.01. aufgelöst." },
  { wert: "rap_passiv", text: "Passive Abgrenzung", kontoArt: "erloes",
    hinweis: "Schon eingenommen, die Leistung kommt aber erst im nächsten Jahr (z. B. Vorkasse für Januar). Wird am 01.01. aufgelöst." },
];

export type FinAbschlussposten = {
  id: string; jahr: number; art: AbschlussArt; konto: number; betrag: number; text: string;
  buchung_id: string; aufloesung_buchung_id: string | null; erstellt_am: string;
};

// ---------------------------------------------------------------- GuV
type GuvDef = { nr: string; text: string; bereiche: Record<Kontenrahmen, Bereich[]> };
// Aufwandsposten in Prüfreihenfolge (das erste Passende gewinnt); was nirgends liegt: sonstige betriebliche Aufwendungen.
export const FIN_GUV_AUFWAND: GuvDef[] = [
  { nr: "13", text: "Zinsen und ähnliche Aufwendungen", bereiche: { skr03: [[2100, 2199]], skr04: [[7300, 7399]] } },
  { nr: "14", text: "Steuern vom Einkommen und vom Ertrag", bereiche: { skr03: [[2200, 2289], [4320, 4320]], skr04: [[7600, 7649]] } },
  { nr: "16", text: "Sonstige Steuern", bereiche: { skr03: [[4340, 4349], [4510, 4510]], skr04: [[7650, 7699]] } },
  { nr: "5", text: "Materialaufwand", bereiche: { skr03: [[3000, 3999]], skr04: [[5000, 5999]] } },
  { nr: "6", text: "Personalaufwand", bereiche: { skr03: [[4100, 4199]], skr04: [[6000, 6199]] } },
  { nr: "7", text: "Abschreibungen", bereiche: { skr03: [[4820, 4869]], skr04: [[6200, 6299]] } },
];
// Zinserträge (Posten 11) – vor den sonstigen Erträgen geprüft.
export const FIN_GUV_ZINSERTRAEGE: Record<Kontenrahmen, Bereich[]> = { skr03: [[2650, 2689]], skr04: [[7100, 7199]] };

export type GuvZeile = { nr: string; text: string; betrag: number; summe?: boolean };
export type Guv = { zeilen: GuvZeile[]; jahresergebnis: number };

// Januar bis `bis`. Erträge positiv, Aufwendungen negativ – wie im Abschluss gelesen.
export function guv(salden: FinSaldo[], konten: FinKonto[], rahmen: Kontenrahmen, bis: number): Guv {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  const w: Record<string, number> = { "1": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "11": 0, "13": 0, "14": 0, "16": 0 };
  for (const s of salden) {
    if (s.monat > bis) continue;
    const k = kat.get(s.konto);
    if (k === "erloes") {
      const nr = drin(s.konto, FIN_GUV_ZINSERTRAEGE[rahmen]) ? "11" : drin(s.konto, FIN_SONSTIGE_ERTRAEGE[rahmen]) ? "4" : "1";
      w[nr] += s.haben - s.soll;
    } else if (k === "aufwand") {
      const d = FIN_GUV_AUFWAND.find((x) => drin(s.konto, x.bereiche[rahmen]));
      w[d?.nr ?? "8"] -= s.soll - s.haben;
    }
  }
  for (const k of Object.keys(w)) w[k] = cent(w[k]);
  const nachSteuern = cent(w["1"] + w["4"] + w["5"] + w["6"] + w["7"] + w["8"] + w["11"] + w["13"] + w["14"]);
  const jahresergebnis = cent(nachSteuern + w["16"]);
  const zeile = (nr: string, text: string): GuvZeile => ({ nr, text, betrag: w[nr] });
  const alle: GuvZeile[] = [
    zeile("1", "Umsatzerlöse"),
    zeile("4", "Sonstige betriebliche Erträge"),
    zeile("5", "Materialaufwand"),
    { nr: "", text: "Rohergebnis", betrag: cent(w["1"] + w["4"] + w["5"]), summe: true },
    zeile("6", "Personalaufwand"),
    zeile("7", "Abschreibungen"),
    zeile("8", "Sonstige betriebliche Aufwendungen"),
    zeile("11", "Sonstige Zinsen und ähnliche Erträge"),
    zeile("13", "Zinsen und ähnliche Aufwendungen"),
    zeile("14", "Steuern vom Einkommen und vom Ertrag"),
    { nr: "15", text: "Ergebnis nach Steuern", betrag: nachSteuern, summe: true },
    zeile("16", "Sonstige Steuern"),
    { nr: "17", text: jahresergebnis >= 0 ? "Jahresüberschuss" : "Jahresfehlbetrag", betrag: jahresergebnis, summe: true },
  ];
  const zeilen = alle.filter((z) => z.summe || z.betrag !== 0 || ["1", "5", "8"].includes(z.nr));
  return { zeilen, jahresergebnis };
}

// ---------------------------------------------------------------- Bilanz
export const FIN_BILANZ_BEREICHE: Record<"immateriell" | "rapAktiv" | "rueckstellungen" | "rapPassiv", Record<Kontenrahmen, Bereich[]>> = {
  immateriell: { skr03: [[1, 99]], skr04: [[1, 199]] },
  rapAktiv: { skr03: [[980, 989]], skr04: [[1900, 1949]] },
  rueckstellungen: { skr03: [[950, 979]], skr04: [[3000, 3099]] },
  rapPassiv: { skr03: [[990, 999]], skr04: [[3900, 3999]] },
};

export type BilanzZeile = { text: string; betrag: number; konten: number[] };
export type BilanzGruppe = { titel: string; zeilen: BilanzZeile[]; summe: number };
export type Bilanz = { aktiva: BilanzGruppe[]; passiva: BilanzGruppe[]; summeAktiva: number; summePassiva: number; ergebnis: number; vortragOffen: number; kapitalgesellschaft: boolean };

// Stand Ende Monat `bis`. Konten nach Saldo: ein Bankkonto im Minus steht bei den Verbindlichkeiten, Vorsteuer bei
// den Forderungen, Umsatzsteuer bei den Verbindlichkeiten (je Konto, nicht verrechnet).
export function bilanz(salden: FinSaldo[], konten: FinKonto[], rahmen: Kontenrahmen, rechtsform: Rechtsform, bis: number): Bilanz {
  const kat = new Map(konten.map((k) => [k.nummer, k]));
  const saldo = new Map<number, number>();
  for (const s of salden) if (s.monat <= bis) saldo.set(s.konto, (saldo.get(s.konto) ?? 0) + s.soll - s.haben);
  const kapg = rechtsform === "ug" || rechtsform === "gmbh";
  const posten = new Map<string, BilanzZeile>();
  const dazu = (key: string, text: string, konto: number, betrag: number) => {
    const p = posten.get(key) ?? { text, betrag: 0, konten: [] };
    p.betrag += betrag; p.konten.push(konto);
    posten.set(key, p);
  };
  let ergebnis = 0, vortragOffen = 0, privat = 0;
  const B = FIN_BILANZ_BEREICHE;
  for (const [konto, roh] of [...saldo.entries()].sort((a, c) => a[0] - c[0])) {
    const s = cent(roh);
    if (s === 0) continue;
    const k = kat.get(konto);
    const kategorie = k?.kategorie;
    if (kategorie === "erloes" || kategorie === "aufwand") { ergebnis -= s; continue; }
    if (kategorie === "vortrag") { vortragOffen += s; continue; }
    if (kategorie === "privat") { privat -= s; continue; }
    if (kategorie === "kapital") { dazu(`ek-${konto}`, k?.bezeichnung ?? String(konto), konto, -s); continue; }
    if (kategorie === "anlage") {
      if (drin(konto, B.immateriell[rahmen])) dazu("immateriell", "Immaterielle Vermögensgegenstände", konto, s);
      else dazu("sachanlagen", "Sachanlagen", konto, s);
      continue;
    }
    if (drin(konto, B.rapAktiv[rahmen]) || drin(konto, B.rapPassiv[rahmen])) {
      if (s > 0) dazu("rapAktiv", "Aktive Rechnungsabgrenzung", konto, s); else dazu("rapPassiv", "Passive Rechnungsabgrenzung", konto, -s);
      continue;
    }
    if (drin(konto, B.rueckstellungen[rahmen])) { dazu("rueckstellungen", "Sonstige Rückstellungen", konto, -s); continue; }
    if (kategorie === "geld") {
      if (s > 0) dazu("geld", "Kassenbestand, Guthaben bei Kreditinstituten", konto, s); else dazu("bank", "Verbindlichkeiten gegenüber Kreditinstituten", konto, -s);
      continue;
    }
    if (kategorie === "forderung" && s > 0) { dazu("ford", "Forderungen aus Lieferungen und Leistungen", konto, s); continue; }
    if (kategorie === "verbindlichkeit" && s < 0 && k && /lieferungen und leistungen/i.test(k.bezeichnung)) {
      dazu("vll", "Verbindlichkeiten aus Lieferungen und Leistungen", konto, -s); continue;
    }
    // übrige Forderungen, Verbindlichkeiten, Steuer und unbekannte Konten nach Saldo
    if (s > 0) dazu("svg", "Sonstige Vermögensgegenstände", konto, s); else dazu("sv", "Sonstige Verbindlichkeiten", konto, -s);
  }
  ergebnis = cent(ergebnis);
  const z = (key: string) => posten.get(key);
  const gruppe = (titel: string, keys: string[]): BilanzGruppe | null => {
    const zeilen = keys.map(z).filter((x): x is BilanzZeile => !!x).map((x) => ({ ...x, betrag: cent(x.betrag) }));
    return zeilen.length ? { titel, zeilen, summe: cent(zeilen.reduce((t, x) => t + x.betrag, 0)) } : null;
  };
  const ekKeys = [...posten.keys()].filter((k) => k.startsWith("ek-"));
  const ekZeilen: BilanzZeile[] = [
    ...ekKeys.map((k) => ({ ...posten.get(k)!, betrag: cent(posten.get(k)!.betrag) })),
    ...(privat !== 0 ? [{ text: "Privatentnahmen und -einlagen", betrag: cent(privat), konten: [] }] : []),
    ...(vortragOffen !== 0 ? [{ text: "Saldenvorträge nicht ausgeglichen (Konto 9000)", betrag: cent(-vortragOffen), konten: [9000] }] : []),
    { text: kapg ? (ergebnis >= 0 ? "Jahresüberschuss" : "Jahresfehlbetrag") : (ergebnis >= 0 ? "Gewinn" : "Verlust"), betrag: ergebnis, konten: [] },
  ];
  const ek: BilanzGruppe = { titel: "A. Eigenkapital", zeilen: ekZeilen, summe: cent(ekZeilen.reduce((t, x) => t + x.betrag, 0)) };
  const aktiva = [
    gruppe("A. Anlagevermögen", ["immateriell", "sachanlagen"]),
    gruppe("B. Umlaufvermögen", ["ford", "svg", "geld"]),
    gruppe("C. Rechnungsabgrenzungsposten", ["rapAktiv"]),
  ].filter((g): g is BilanzGruppe => !!g);
  const passiva = [
    ek,
    gruppe("B. Rückstellungen", ["rueckstellungen"]),
    gruppe("C. Verbindlichkeiten", ["bank", "vll", "sv"]),
    gruppe("D. Rechnungsabgrenzungsposten", ["rapPassiv"]),
  ].filter((g): g is BilanzGruppe => !!g);
  return {
    aktiva, passiva, ergebnis, vortragOffen: cent(vortragOffen), kapitalgesellschaft: kapg,
    summeAktiva: cent(aktiva.reduce((t, g) => t + g.summe, 0)), summePassiva: cent(passiva.reduce((t, g) => t + g.summe, 0)),
  };
}

// ---------------------------------------------------------------- Saldenvortrag
export type VortragZeile = { konto: number; betrag: number };
export type FinVortragStand =
  | { eingerichtet: false }
  | { eingerichtet: true; folgejahr: boolean; folgejahrRahmen: Kontenrahmen | null; zeilen: VortragZeile[]; gebucht: { nr: number; datum: string; zeilen: VortragZeile[] } | null; vonHand: number };

export function vortragLesen(roh: unknown): FinVortragStand {
  const r = (roh ?? {}) as Record<string, unknown>;
  if (!r.eingerichtet) return { eingerichtet: false };
  const zeilen = (x: unknown): VortragZeile[] => ((x ?? []) as Record<string, unknown>[]).map((z) => ({ konto: Number(z.konto), betrag: Number(z.betrag) }));
  const g = r.gebucht as Record<string, unknown> | null;
  return {
    eingerichtet: true, folgejahr: !!r.folgejahr, folgejahrRahmen: (r.folgejahr_rahmen as Kontenrahmen | null) ?? null,
    zeilen: zeilen(r.zeilen), vonHand: Number(r.von_hand ?? 0),
    gebucht: g ? { nr: Number(g.nr), datum: String(g.datum), zeilen: zeilen(g.zeilen) } : null,
  };
}

// Stimmt der gebuchte Vortrag noch mit dem Jahr überein? (Nach einer Buchung im alten Jahr nicht mehr.)
export function vortragAktuell(zeilen: VortragZeile[], gebucht: VortragZeile[]): boolean {
  const a = new Map(zeilen.map((z) => [z.konto, cent(z.betrag)]));
  const b = new Map(gebucht.filter((z) => cent(z.betrag) !== 0).map((z) => [z.konto, cent(z.betrag)]));
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

// ---------------------------------------------------------------- Anlagenspiegel
export type SpiegelZeile = {
  konto: number; akBeginn: number; zugang: number; abgang: number; akEnde: number;
  afaBeginn: number; afaJahr: number; afaAbgang: number; afaEnde: number; buchwertEnde: number; buchwertVorjahr: number;
};

// Je Anlagekonto für das Jahr: Anschaffungskosten und kumulierte Abschreibung am Anfang und Ende, Zu- und Abgänge.
// Sammelposten bleiben bis zum Ende ihrer fünf Jahre stehen; GWG wie jede Anlage (Zugang und volle Abschreibung).
export function anlagenspiegel(anlagen: FinAnlage[], jahr: number): { zeilen: SpiegelZeile[]; summe: SpiegelZeile } {
  const vor = jahr * 12 - 1, ende = jahr * 12 + 11;
  const je = new Map<number, SpiegelZeile>();
  const leer = (konto: number): SpiegelZeile => ({ konto, akBeginn: 0, zugang: 0, abgang: 0, akEnde: 0, afaBeginn: 0, afaJahr: 0, afaAbgang: 0, afaEnde: 0, buchwertEnde: 0, buchwertVorjahr: 0 });
  for (const a of anlagen) {
    const ja = monatIndex(a.anschaffung);
    if (ja > ende) continue;
    const abgangT = a.abgang && a.art !== "sammelposten" ? monatIndex(a.abgang) : null;
    // Sammelposten: nach fünf Jahren ganz abgeschrieben und aus dem Spiegel.
    const spEnde = a.art === "sammelposten" ? (Number(a.anschaffung.slice(0, 4)) + 4) * 12 + 11 : null;
    const weg = abgangT ?? spEnde;
    if (weg !== null && weg <= vor) continue;
    const z = je.get(a.konto) ?? leer(a.konto);
    const drinBeginn = ja <= vor;
    const afaVor = drinBeginn ? afaBis(a, vor) : 0;
    const afaEnde = afaBis(a, ende);
    if (drinBeginn) { z.akBeginn += a.ak; z.afaBeginn += afaVor; z.buchwertVorjahr += a.ak - afaVor; } else z.zugang += a.ak;
    z.afaJahr += afaEnde - afaVor;
    if (weg !== null && weg <= ende) { z.abgang += a.ak; z.afaAbgang += afaEnde; }
    je.set(a.konto, z);
  }
  const zeilen = [...je.values()].sort((a, c) => a.konto - c.konto).map((z) => {
    const akEnde = z.akBeginn + z.zugang - z.abgang;
    const afaEnde = z.afaBeginn + z.afaJahr - z.afaAbgang;
    const r = { ...z, akEnde, afaEnde, buchwertEnde: akEnde - afaEnde };
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "konto" ? v : cent(v)])) as SpiegelZeile;
  });
  const summe = leer(0);
  for (const z of zeilen) for (const k of Object.keys(summe) as (keyof SpiegelZeile)[]) if (k !== "konto") summe[k] = cent(summe[k] + z[k]);
  return { zeilen, summe };
}

// ---------------------------------------------------------------- Schritte zum Abschluss
export type AbschlussSchritt = { key: string; text: string; erledigt: boolean; hinweis: string };

export function abschlussSchritte(x: {
  jahr: number; festgeschrieben: number; afaOffen: number; vortragOffen: number; bilanz: boolean; abschlussposten: number;
  vortrag: FinVortragStand | null;
}): AbschlussSchritt[] {
  const v = x.vortrag && x.vortrag.eingerichtet ? x.vortrag : null;
  const schritte: AbschlussSchritt[] = [
    { key: "afa", text: "Abschreibungen bis Dezember gebucht", erledigt: x.afaOffen === 0,
      hinweis: x.afaOffen === 0 ? "Nichts mehr offen." : `Noch ${x.afaOffen.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} – unter Anlagen buchen.` },
    { key: "eb", text: "Anfangsbestände ausgeglichen (Konto 9000)", erledigt: x.vortragOffen === 0,
      hinweis: x.vortragOffen === 0 ? "Saldo 0." : "Konto 9000 steht nicht auf 0 – ein Anfangsbestand fehlt oder ist doppelt. Der Rest landet sonst im Kapital." },
  ];
  if (x.bilanz) schritte.push({ key: "abschluss", text: "Rückstellungen und Abgrenzungen geprüft", erledigt: x.abschlussposten > 0,
    hinweis: x.abschlussposten > 0 ? `${x.abschlussposten} gebucht.` : "Noch keine – mit dem Steuerberater klären, ob welche nötig sind." });
  schritte.push({ key: "fest", text: "Alle zwölf Monate festgeschrieben", erledigt: x.festgeschrieben >= 12,
    hinweis: `${x.festgeschrieben} von 12 – unter Buchungen.` });
  schritte.push({ key: "vortrag", text: `Saldenvortrag nach ${x.jahr + 1}`, erledigt: !!v?.gebucht && vortragAktuell(v.zeilen, v.gebucht.zeilen),
    hinweis: !v ? "–" : !v.gebucht ? "Noch nicht gebucht." : vortragAktuell(v.zeilen, v.gebucht.zeilen) ? `Gebucht (Nr. ${v.gebucht.nr}).` : "Gebucht, aber im alten Jahr hat sich seitdem etwas geändert – neu vortragen." });
  return schritte;
}

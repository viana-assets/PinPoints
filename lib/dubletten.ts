import type { Customer } from "./types";
import { telefonVergleich } from "./telefon";

// Dubletten finden (Fahrplan E1, v103).
//
// Bei telefonischer Neuanlage entstehen Karteileichen zwangsläufig: Herr Müller ruft an, niemand
// findet ihn unter „Müller Hans", und er wird ein zweites Mal angelegt. Diese Datei sagt, wann
// zwei Kunden vermutlich dieselbe Person sind – an zwei Stellen:
//
//   * beim Anlegen („Neuer Kunde"): ein Hinweis, der nichts sperrt (`aehnlicheKunden`),
//   * im Adminbereich unter „Dubletten": alle Paare im Bestand (`dublettenPaare`), mit
//     „Zusammenführen" (Datenbank: `kunden_zusammenfuehren()`, Migration 64) oder „keine Dublette".
//
// Die Gründe, schwach bis stark:
//   name      – der getippte Name steckt in Name oder Firma (nur beim Anlegen, ab vier Zeichen)
//   name_plz  – gleicher Name (Reihenfolge der Wörter egal, Umlaute gleichgestellt) und gleiche PLZ
//   email     – gleiche E-Mail-Adresse
//   telefon   – eine Nummer gleich, egal in welcher Schreibweise (Vergleichsform aus D10)
//
// Reine Funktionen, geprüft in tests/dubletten.test.ts.

export type DublettenGrund = "telefon" | "email" | "name_plz" | "name";

export const DUBLETTEN_GRUND_LABEL: Record<DublettenGrund, string> = {
  telefon: "gleiche Telefonnummer",
  email: "gleiche E-Mail",
  name_plz: "gleicher Name und PLZ",
  name: "ähnlicher Name",
};

// Reihenfolge der Stärke – die erste genannte Begründung ist die überzeugendste.
const STAERKE: DublettenGrund[] = ["telefon", "email", "name_plz", "name"];

type Vergleichbar = Pick<Customer, "name" | "company" | "address" | "phone_mobile" | "phone_landline" | "email">;

// Die Postleitzahl aus einer Adresse: die letzte fünfstellige Zahl („Weg 12, 90513 Zirndorf").
export function plzAus(adresse: string | null | undefined): string | null {
  const treffer = (adresse ?? "").match(/(?<!\d)\d{5}(?!\d)/g);
  return treffer ? treffer[treffer.length - 1] : null;
}

// Wörter, die zur Anrede gehören und nicht zum Namen.
const FUELLWOERTER = new Set(["herr", "herrn", "frau", "familie", "fam", "dr", "prof"]);

// Der Name in einer Form, in der „Müller, Hans", „Hans Mueller" und „Herr Hans Müller" gleich sind.
// Mehr wird nicht geraten: „Hans" und „Hannes" bleiben verschieden.
export function nameSchluessel(name: string | null | undefined): string {
  const t = (name ?? "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  return t.split(" ").filter((w) => w && !FUELLWOERTER.has(w)).sort().join(" ");
}

function emailSchluessel(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

// Nummern in Vergleichsform, nur solche mit mindestens sechs Zeichen – „12345" ohne Vorwahl
// gibt es in jeder Stadt einmal.
function nummern(k: Vergleichbar): string[] {
  return [k.phone_mobile, k.phone_landline]
    .map((n) => telefonVergleich(n))
    .filter((n): n is string => !!n && n.length >= 6);
}

function namen(k: Vergleichbar): string[] {
  return [nameSchluessel(k.name), nameSchluessel(k.company)].filter((n) => n.length >= 3);
}

// Warum a und b dieselbe Person sein könnten – leer heißt: nichts spricht dafür.
export function dublettenGruende(a: Vergleichbar, b: Vergleichbar): DublettenGrund[] {
  const gruende: DublettenGrund[] = [];
  const nb = nummern(b);
  if (nummern(a).some((n) => nb.includes(n))) gruende.push("telefon");
  const ea = emailSchluessel(a.email);
  if (ea && ea === emailSchluessel(b.email)) gruende.push("email");
  const pa = plzAus(a.address);
  if (pa && pa === plzAus(b.address)) {
    const nbn = namen(b);
    if (namen(a).some((n) => nbn.includes(n))) gruende.push("name_plz");
  }
  return gruende;
}

export function starkerGrund(gruende: DublettenGrund[]): boolean {
  return gruende.some((g) => g !== "name");
}

export type AehnlicherKunde = { kunde: Customer; gruende: DublettenGrund[] };

// Beim Anlegen: welche vorhandenen Kunden der Eingabe ähneln. Die Laufkundschaft ist ein
// Sammelkunde und nie gemeint. Deaktivierte zählen mit – gerade die werden neu angelegt.
export function aehnlicheKunden(eingabe: Vergleichbar, kunden: Customer[], hoechstens = 3): AehnlicherKunde[] {
  const q = eingabe.name.trim().toLowerCase();
  const treffer: AehnlicherKunde[] = [];
  for (const k of kunden) {
    if (k.laufkundschaft || k.deleted_at) continue;
    const gruende = dublettenGruende(eingabe, k);
    if (q.length >= 4 && gruende.length === 0 && [k.name, k.company ?? ""].some((x) => x.toLowerCase().includes(q))) gruende.push("name");
    if (gruende.length > 0) treffer.push({ kunde: k, gruende });
  }
  return treffer
    .sort((x, y) => staerke(x.gruende) - staerke(y.gruende) || y.gruende.length - x.gruende.length || x.kunde.name.localeCompare(y.kunde.name, "de"))
    .slice(0, hoechstens);
}

function staerke(gruende: DublettenGrund[]): number {
  return Math.min(...gruende.map((g) => STAERKE.indexOf(g)));
}

// Ein Paar immer in derselben Reihenfolge – dieselbe Regel wie die Prüfbedingung
// `kunden_keine_dublette_reihenfolge` (Migration 64): kleinere Kennung zuerst. Kennungen sind
// kleingeschriebene UUIDs; ihre Textreihenfolge ist die der Datenbank.
export function paarSchluessel(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type DublettenPaar = { a: Customer; b: Customer; gruende: DublettenGrund[] };

// Alle vermuteten Dubletten im Bestand. Statt jeden mit jedem zu vergleichen (bei 900 Kunden
// 400 000 Paare), wird über die Merkmale gruppiert: gleiche Nummer, gleiche E-Mail, gleicher
// Name mit PLZ. Nur innerhalb einer Gruppe entstehen Paare.
//
// Testkunden und die Laufkundschaft sind nie dabei, gelöschte auch nicht. Paare, die ein Mensch
// als „keine Dublette" vermerkt hat, fallen heraus.
export function dublettenPaare(kunden: Customer[], keineDublette: Set<string>): DublettenPaar[] {
  const gruppen = new Map<string, Customer[]>();
  const merke = (schluessel: string, k: Customer) => {
    const liste = gruppen.get(schluessel);
    if (liste) { if (!liste.includes(k)) liste.push(k); } else gruppen.set(schluessel, [k]);
  };
  for (const k of kunden) {
    if (k.laufkundschaft || k.testkunde || k.deleted_at) continue;
    for (const n of nummern(k)) merke("t:" + n, k);
    const e = emailSchluessel(k.email);
    if (e) merke("e:" + e, k);
    const plz = plzAus(k.address);
    if (plz) for (const n of namen(k)) merke(`n:${n}|${plz}`, k);
  }
  const paare = new Map<string, DublettenPaar>();
  for (const liste of gruppen.values()) {
    // Eine Gruppe mit sehr vielen Mitgliedern ist keine Dublette, sondern eine Sammelnummer
    // (Zentrale einer Firma, Hausverwaltung). Sie würde die Liste nur füllen.
    if (liste.length < 2 || liste.length > 6) continue;
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const [x, y] = paarSchluessel(liste[i].id, liste[j].id);
        const schluessel = `${x}|${y}`;
        if (paare.has(schluessel) || keineDublette.has(schluessel)) continue;
        const a = liste[i].id === x ? liste[i] : liste[j];
        const b = a === liste[i] ? liste[j] : liste[i];
        paare.set(schluessel, { a, b, gruende: dublettenGruende(a, b) });
      }
    }
  }
  return [...paare.values()]
    .filter((p) => p.gruende.length > 0)
    .sort((p, q) => q.gruende.length - p.gruende.length || staerke(p.gruende) - staerke(q.gruende)
      || p.a.name.localeCompare(q.a.name, "de"));
}

// Welcher von beiden bleibt, wenn niemand etwas anderes wählt: der mit der kleineren
// Kundennummer – er ist der ältere, seine Nummer steht auf den früheren Rechnungen.
export function vorschlagBehalten(a: Customer, b: Customer): Customer {
  const na = a.kundennummer ?? Number.MAX_SAFE_INTEGER;
  const nb = b.kundennummer ?? Number.MAX_SAFE_INTEGER;
  return na <= nb ? a : b;
}

// Was beim Zusammenführen vom anderen herüberkommt – zum Anzeigen VOR dem Klick. Die Regel selbst
// steht in `kunden_zusammenfuehren()` (Migration 64): Leere Felder des bleibenden Kunden werden
// gefüllt, nichts Vorhandenes wird überschrieben, eine zweite Nummer wandert ins freie Feld oder
// in die Notiz. Wer eine Stelle ändert, ändert beide.
export function uebernommeneFelder(behalten: Customer, weg: Customer): string[] {
  const leer = (s: string | null | undefined) => !(s ?? "").trim();
  const felder: string[] = [];
  if (leer(behalten.company) && !leer(weg.company)) felder.push("Firma");
  if (!behalten.anrede && weg.anrede) felder.push("Anrede");
  if (leer(behalten.email) && !leer(weg.email)) felder.push("E-Mail");
  if (leer(behalten.phone_mobile) && !leer(weg.phone_mobile)) felder.push("Mobilnummer");
  const zweiteMobil = !leer(behalten.phone_mobile) && !!telefonVergleich(weg.phone_mobile)
    && telefonVergleich(weg.phone_mobile) !== telefonVergleich(behalten.phone_mobile);
  if (leer(behalten.phone_landline) && (zweiteMobil || !leer(weg.phone_landline))) felder.push("Festnetz");
  if (behalten.lat == null && weg.lat != null) felder.push("Kartenposition");
  if (!leer(weg.note) && weg.note !== behalten.note) felder.push("Notiz (angehängt)");
  return felder;
}

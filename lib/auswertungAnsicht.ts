import type { Customer, Order, Rechnung, TireStorage, Employee } from "./types";
import type { Zeitraum } from "./auswertung";
import { addDays, auftragsZeitraum, toDateStr } from "./calendar";
import { rechnungOffen } from "./helpers";

// Die Rechnungen hinter der neu gestalteten Auswertungsseite (26.09.2026, Entwurf
// „M · Auswertungen", Fahrplan E13). Reine Funktionen, geprüft in tests/auswertungAnsicht.test.ts.
//
// Die bestehenden Rechnungen in lib/auswertung.ts (Kennzahlen, je Mitarbeiter, je Artikel,
// Artikel im Detail) bleiben – sie beantworten weiterhin „was wurde erbracht" aus den erledigten
// Aufträgen. Hier kommt dazu: Zeiträume mit Saison und Vorjahr, der Umsatz aus dem
// Rechnungsbuch, Kunden, Einsatzzeit und Lager.

// ---------------------------------------------------------------- Zeiträume
export type AuswertungsZeitraum = "monat" | "saison" | "quartal" | "jahr" | "l12" | "frei";

export const AUSWERTUNGS_ZEITRAUM_LABEL: Record<AuswertungsZeitraum, string> = {
  monat: "Monat", saison: "Saison", quartal: "Quartal", jahr: "Jahr", l12: "12 Monate", frei: "Frei",
};

// Die beiden Wechselsaisons eines Reifenservice, als Monate (1 = Januar, jeweils einschließlich).
// Bewusst enger als `naechsteSaison()` in lib/helpers.ts: Jene sagt, welche REIFEN als Nächstes
// dran sind (ab August Winter), diese, wann gewechselt wird. Entschieden am 26.09.2026.
export const WECHSELSAISON = {
  fruehjahr: { von: 3, bis: 5, name: "Frühjahr" },
  herbst: { von: 9, bis: 11, name: "Herbst" },
} as const;

export type SaisonArt = keyof typeof WECHSELSAISON;
export type Saisonfenster = { art: SaisonArt; jahr: number; von: string; bis: string };

const zwei = (n: number) => String(n).padStart(2, "0");
const letzterTag = (jahr: number, monat: number) => new Date(jahr, monat, 0).getDate();

export function saisonFenster(art: SaisonArt, jahr: number): Saisonfenster {
  const s = WECHSELSAISON[art];
  return { art, jahr, von: `${jahr}-${zwei(s.von)}-01`, bis: `${jahr}-${zwei(s.bis)}-${zwei(letzterTag(jahr, s.bis))}` };
}

// Die Saison, in der `heute` liegt – sonst die nächste.
export function aktuelleOderNaechsteSaison(heute: string): Saisonfenster {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7));
  if (m <= WECHSELSAISON.fruehjahr.bis) return saisonFenster("fruehjahr", j);
  if (m <= WECHSELSAISON.herbst.bis) return saisonFenster("herbst", j);
  return saisonFenster("fruehjahr", j + 1);
}

// Die Saison, in der `heute` liegt – sonst die zuletzt beendete.
export function aktuelleOderLetzteSaison(heute: string): Saisonfenster {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7));
  if (m < WECHSELSAISON.fruehjahr.von) return saisonFenster("herbst", j - 1);
  if (m < WECHSELSAISON.herbst.von) return saisonFenster("fruehjahr", j);
  return saisonFenster("herbst", j);
}

export function vorigeSaison(s: Saisonfenster): Saisonfenster {
  return s.art === "herbst" ? saisonFenster("fruehjahr", s.jahr) : saisonFenster("herbst", s.jahr - 1);
}

export function zeitraumFuer(art: Exclude<AuswertungsZeitraum, "frei">, heute: string): Zeitraum {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7));
  if (art === "monat") return { von: `${j}-${zwei(m)}-01`, bis: heute };
  if (art === "quartal") return { von: `${j}-${zwei(Math.floor((m - 1) / 3) * 3 + 1)}-01`, bis: heute };
  if (art === "jahr") return { von: `${j}-01-01`, bis: heute };
  if (art === "l12") return { von: toDateStr(addDays(new Date(verschiebeJahr(heute, -1) + "T12:00:00"), 1)), bis: heute };
  const s = aktuelleOderLetzteSaison(heute);
  return { von: s.von, bis: s.bis < heute ? s.bis : heute };
}

// Ein Datum um Jahre verschieben; der 29. Februar wird im Nicht-Schaltjahr zum 28.
export function verschiebeJahr(iso: string, jahre: number): string {
  const j = Number(iso.slice(0, 4)) + jahre;
  const m = Number(iso.slice(5, 7));
  const t = Math.min(Number(iso.slice(8, 10)), letzterTag(j, m));
  return `${j}-${zwei(m)}-${zwei(t)}`;
}

// Derselbe Zeitraum ein Jahr früher – bis zum SELBEN Tag. Steht heute der 25. September, wird
// mit dem 1.–25. September des Vorjahres verglichen, nicht mit dem ganzen Monat: Sonst stünde
// ein halber Monat gegen einen ganzen.
export function vorjahr(z: Zeitraum): Zeitraum {
  return { von: verschiebeJahr(z.von, -1), bis: verschiebeJahr(z.bis, -1) };
}

const MONAT_NAME = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONAT_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
// „3.9.2026"
export function tagDeutsch(iso: string): string {
  return `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}`;
}
const deutsch = tagDeutsch;

export function zeitraumTitel(art: AuswertungsZeitraum, z: Zeitraum): string {
  const j = z.von.slice(0, 4);
  const m = Number(z.von.slice(5, 7));
  if (art === "monat") return `${MONAT_NAME[m - 1]} ${j}`;
  if (art === "quartal") return `${Math.floor((m - 1) / 3) + 1}. Quartal ${j}`;
  if (art === "jahr") return `${j} bis heute`;
  if (art === "l12") return "Letzte 12 Monate";
  if (art === "saison") return `${m >= WECHSELSAISON.herbst.von ? "Herbstsaison" : "Frühjahrssaison"} ${j}`;
  return `${deutsch(z.von)} – ${deutsch(z.bis)}`;
}

export function monatKurz(schluessel: string): string {
  return MONAT_KURZ[Number(schluessel.slice(5, 7)) - 1];
}
export function monatLang(schluessel: string): string {
  return `${MONAT_NAME[Number(schluessel.slice(5, 7)) - 1]} ${schluessel.slice(0, 4)}`;
}

// Die Monate der Säulen: mindestens die letzten zwölf bis zum Ende des Zeitraums, damit auch
// „dieser Monat" im Jahreslauf steht – bei einem Saisongeschäft ist der Vergleich mit den
// Nachbarmonaten die halbe Aussage. Ist der Zeitraum länger, alle seine Monate.
export function monatsreihe(z: Zeitraum): string[] {
  const ende = new Date(Number(z.bis.slice(0, 4)), Number(z.bis.slice(5, 7)) - 1, 1);
  const startZ = new Date(Number(z.von.slice(0, 4)), Number(z.von.slice(5, 7)) - 1, 1);
  const start12 = new Date(ende.getFullYear(), ende.getMonth() - 11, 1);
  const start = startZ < start12 ? startZ : start12;
  const reihe: string[] = [];
  for (let d = new Date(start); d <= ende; d.setMonth(d.getMonth() + 1)) reihe.push(`${d.getFullYear()}-${zwei(d.getMonth() + 1)}`);
  return reihe;
}

export function monatImZeitraum(schluessel: string, z: Zeitraum): boolean {
  return schluessel >= z.von.slice(0, 7) && schluessel <= z.bis.slice(0, 7);
}

// Veränderung in Prozent, gerundet; null, wenn es im Vorjahr nichts gab (dann ist jede Zahl
// „unendlich mehr" und keine Auskunft).
export function veraenderung(jetzt: number, vorher: number): number | null {
  if (!vorher) return null;
  return Math.round(((jetzt - vorher) / Math.abs(vorher)) * 100);
}

// ---------------------------------------------------------------- Umsatz
//
// Seit PinPoints die Rechnungen ausstellt (Migration 48), ist das Rechnungsbuch die Quelle des
// Umsatzes: gezählt am Rechnungsdatum, ein Storno mit seinem negativen Betrag an seinem Datum.
// Dazu kommen erledigte Aufträge OHNE „Rechnung nötig" – die gibt es (Barzahlung ohne Beleg),
// und sie tauchen in keinem Rechnungsbuch auf. Erledigte Aufträge MIT „Rechnung nötig", aber ohne
// Rechnung, sind noch kein Umsatz: Sie stehen als „Erbracht, noch nicht abgerechnet" daneben.
//
// Ohne Leserecht auf das Rechnungsbuch (`rechnungen · lesen`) liefert die Datenbank schlicht
// keine Rechnungen – still, ohne Fehler. Dann wäre der Umsatz zu klein, ohne dass es jemand
// merkt. Für diesen Fall rechnet `umsatzposten` wie bisher aus allen erledigten Aufträgen.
export type Umsatzposten = {
  datum: string;
  netto: number;
  steuer: number;
  quelle: "rechnung" | "storno" | "ohne";
  customer_id: string | null;
  order_id: string | null;
  rechnung: Rechnung | null;
};

export function umsatzposten(
  rechnungen: Rechnung[],
  orders: Order[],
  auftragSumme: (o: Order) => { net: number; vat: number },
  mitRechnungsbuch: boolean
): Umsatzposten[] {
  const posten: Umsatzposten[] = [];
  if (mitRechnungsbuch) {
    const mitBeleg = new Set(rechnungen.map((r) => r.order_id).filter(Boolean));
    for (const r of rechnungen) {
      posten.push({ datum: r.datum, netto: r.netto, steuer: r.steuer, quelle: r.art === "storno" ? "storno" : "rechnung", customer_id: r.customer_id, order_id: r.order_id, rechnung: r });
    }
    for (const o of orders) {
      if (o.deleted_at || o.status !== "erledigt" || o.rechnung_noetig || mitBeleg.has(o.id)) continue;
      const s = auftragSumme(o);
      posten.push({ datum: o.order_date, netto: s.net, steuer: s.vat, quelle: "ohne", customer_id: o.customer_id, order_id: o.id, rechnung: null });
    }
  } else {
    for (const o of orders) {
      if (o.deleted_at || o.status !== "erledigt") continue;
      const s = auftragSumme(o);
      posten.push({ datum: o.order_date, netto: s.net, steuer: s.vat, quelle: "ohne", customer_id: o.customer_id, order_id: o.id, rechnung: null });
    }
  }
  return posten;
}

// Nur die Posten, an deren Auftrag der Mitarbeiter beteiligt war. Eine Rechnung ohne Auftrag
// gehört niemandem und fällt beim Filtern heraus.
export function postenFuerPerson(posten: Umsatzposten[], person: string | null, orderEmployees: Record<string, string[]>): Umsatzposten[] {
  if (!person) return posten;
  return posten.filter((p) => p.order_id && (orderEmployees[p.order_id] ?? []).includes(person));
}

export type Umsatzsumme = {
  netto: number; steuer: number; brutto: number;
  mitRechnung: number; ohneRechnung: number;
  rechnungen: number; stornos: number; ohneAnzahl: number;
};

export function umsatzSumme(posten: Umsatzposten[], z: Zeitraum): Umsatzsumme {
  const s: Umsatzsumme = { netto: 0, steuer: 0, brutto: 0, mitRechnung: 0, ohneRechnung: 0, rechnungen: 0, stornos: 0, ohneAnzahl: 0 };
  for (const p of posten) {
    if (p.datum < z.von || p.datum > z.bis) continue;
    s.netto += p.netto;
    s.steuer += p.steuer;
    if (p.quelle === "ohne") { s.ohneRechnung += p.netto; s.ohneAnzahl += 1; }
    else s.mitRechnung += p.netto;
    if (p.quelle === "rechnung") s.rechnungen += 1;
    if (p.quelle === "storno") s.stornos += 1;
  }
  s.brutto = s.netto + s.steuer;
  return s;
}

export function umsatzJeMonat(posten: Umsatzposten[], monate: string[]): Record<string, number> {
  const r: Record<string, number> = Object.fromEntries(monate.map((m) => [m, 0]));
  for (const p of posten) {
    const m = p.datum.slice(0, 7);
    if (m in r) r[m] += p.netto;
  }
  return r;
}

// Erledigt, „Rechnung nötig", aber noch keine Rechnung – der Umsatz ist erbracht, steht aber in
// keinem Rechnungsbuch. Unabhängig vom Zeitraum: Eine vergessene Rechnung vom Frühjahr ist
// genauso offen wie eine von gestern. Dieselbe Regel wie `rechnungOffen()` in lib/helpers.ts.
export function erbrachtNichtAbgerechnet<O extends Order>(orders: O[]): O[] {
  return orders.filter(rechnungOffen).sort((a, b) => a.order_date.localeCompare(b.order_date));
}

// ---------------------------------------------------------------- Kunden
const istSammel = (c: Customer | undefined) => !!c && (c.laufkundschaft || c.einmalkunde);

// Wie viele Kunden der vorigen Saison sind in dieser wieder da? „Da" heißt: ein Auftrag in der
// Saison, der nicht storniert ist – auch ein geplanter zählt, denn wer einen Termin hat, ist
// gewonnen. Grundlage sind die in der vorigen Saison ERLEDIGTEN Aufträge. Laufkundschaft und
// Einmalkunden zählen nicht: Von ihnen erwartet niemand, dass sie wiederkommen.
export type Wiederkehr = { saison: Saisonfenster; vorige: Saisonfenster; basis: number; wieder: number; ohne: string[]; quote: number | null };

export function wiederkehr(orders: Order[], customers: Customer[], saison: Saisonfenster): Wiederkehr {
  const vorige = vorigeSaison(saison);
  const kunde = new Map(customers.map((c) => [c.id, c]));
  const zaehlt = (o: Order) => !o.deleted_at && !istSammel(kunde.get(o.customer_id));
  const basis = new Set(orders.filter((o) => zaehlt(o) && o.status === "erledigt" && o.order_date >= vorige.von && o.order_date <= vorige.bis).map((o) => o.customer_id));
  const jetzt = new Set(orders.filter((o) => zaehlt(o) && o.status !== "storniert" && o.order_date >= saison.von && o.order_date <= saison.bis).map((o) => o.customer_id));
  const wieder = [...basis].filter((id) => jetzt.has(id));
  const ohne = [...basis].filter((id) => !jetzt.has(id));
  return { saison, vorige, basis: basis.size, wieder: wieder.length, ohne, quote: basis.size ? Math.round((wieder.length / basis.size) * 100) : null };
}

export type KundeUmsatz = { id: string; name: string; netto: number; auftraege: number };

export function umsatzstaerksteKunden(posten: Umsatzposten[], z: Zeitraum, customers: Customer[], anzahl: number): KundeUmsatz[] {
  const kunde = new Map(customers.map((c) => [c.id, c]));
  const je = new Map<string, KundeUmsatz>();
  for (const p of posten) {
    if (!p.customer_id || p.datum < z.von || p.datum > z.bis) continue;
    const c = kunde.get(p.customer_id);
    if (istSammel(c)) continue;
    const e = je.get(p.customer_id) ?? {
      id: p.customer_id,
      name: ((c?.company || "").trim() || c?.name || (p.rechnung?.empfaenger?.company || "").trim() || p.rechnung?.empfaenger?.name || "Unbekannt"),
      netto: 0, auftraege: 0,
    };
    e.netto += p.netto;
    if (p.quelle !== "storno") e.auftraege += 1;
    je.set(p.customer_id, e);
  }
  return [...je.values()].filter((e) => e.netto > 0).sort((a, b) => b.netto - a.netto || a.name.localeCompare(b.name, "de")).slice(0, anzahl);
}

// Je Monat: wie viele Kunden wurden bedient, und wie viele davon wurden in diesem Monat erst
// angelegt? „Neu angelegt" statt „zum ersten Mal da", weil die Aufträge vor Einführung der App
// fehlen – ein Kunde aus dem Altbestand wäre sonst bei seinem ersten Auftrag in PinPoints „neu".
export function neuUndBestand(orders: Order[], customers: Customer[], monate: string[]): { monat: string; neu: number; bestand: number }[] {
  const kunde = new Map(customers.map((c) => [c.id, c]));
  return monate.map((monat) => {
    const ids = new Set(orders.filter((o) => !o.deleted_at && o.status === "erledigt" && o.order_date.slice(0, 7) === monat && !istSammel(kunde.get(o.customer_id))).map((o) => o.customer_id));
    let neu = 0;
    for (const id of ids) if ((kunde.get(id)?.created_at ?? "").slice(0, 7) === monat) neu++;
    return { monat, neu, bestand: ids.size - neu };
  });
}

export function neuAngelegteKunden(orders: Order[], customers: Customer[], z: Zeitraum): number {
  const kunde = new Map(customers.map((c) => [c.id, c]));
  const ids = new Set(orders.filter((o) => !o.deleted_at && o.status === "erledigt" && o.order_date >= z.von && o.order_date <= z.bis).map((o) => o.customer_id));
  let n = 0;
  for (const id of ids) {
    const c = kunde.get(id);
    const angelegt = (c?.created_at ?? "").slice(0, 10);
    if (c && !istSammel(c) && angelegt >= z.von && angelegt <= z.bis) n++;
  }
  return n;
}

// Was liegt im Regal und geht beim nächsten Wechsel wieder hinaus? Je Satz ein Wechsel – der
// Wert ist Satz × heutiger Preis der Wechselleistung. Eine Schätzung, kein Umsatz; so steht es
// auch in der Ansicht. „Mit Termin" heißt: Der Kunde hat einen offenen Auftrag ab heute.
export type AusDemRegal = { saetze: number; mitTermin: number; ohneTermin: number; kundenOhneTermin: number; wertMit: number | null; wertOhne: number | null };

export function ausDemRegal(saetze: TireStorage[], orders: Order[], saison: "sommer" | "winter", heute: string, preisJeSatz: number | null): AusDemRegal {
  const mitTerminKunden = new Set(orders.filter((o) => !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit") && o.order_date >= heute).map((o) => o.customer_id));
  const liegend = saetze.filter((s) => !s.removed_at && s.saison === saison);
  const mit = liegend.filter((s) => mitTerminKunden.has(s.customer_id));
  const ohne = liegend.filter((s) => !mitTerminKunden.has(s.customer_id));
  return {
    saetze: liegend.length, mitTermin: mit.length, ohneTermin: ohne.length,
    kundenOhneTermin: new Set(ohne.map((s) => s.customer_id)).size,
    wertMit: preisJeSatz == null ? null : mit.length * preisJeSatz,
    wertOhne: preisJeSatz == null ? null : ohne.length * preisJeSatz,
  };
}

// ---------------------------------------------------------------- Einsatz
//
// Die Einsatzzeit aus den erledigten Terminen: Beginn bis Ende, ohne Endzeit die Standarddauer
// (wie im Stundenraster). Fahrzeit steht in keinem Auftrag und fehlt deshalb – die Zahl ist
// die Zeit beim Kunden. Ein Termin mit zwei Technikern zählt bei beiden voll (wie in
// `jeMitarbeiter`), in der Summe aber einmal.
export type EinsatzPerson = { id: string; name: string; minuten: number; termine: number };
export type Einsatz = {
  minuten: number; termine: number; tage: number; ohneEnde: number; ohneZeit: number;
  jePerson: EinsatzPerson[];
  // Zeilen Montag … Sonntag, Spalten ab EINSATZ_RASTER_VON je eine Stunde.
  raster: number[][];
};

export const EINSATZ_RASTER_VON = 7;
export const EINSATZ_RASTER_BIS = 19; // ausschließlich

export function einsatz(orders: Order[], orderEmployees: Record<string, string[]>, employees: Employee[], standardMin: number, z: Zeitraum): Einsatz {
  const stunden = EINSATZ_RASTER_BIS - EINSATZ_RASTER_VON;
  const raster = Array.from({ length: 7 }, () => Array<number>(stunden).fill(0));
  const je = new Map<string, EinsatzPerson>();
  const tage = new Set<string>();
  let minuten = 0, termine = 0, ohneEnde = 0, ohneZeit = 0;
  for (const o of orders) {
    if (o.deleted_at || o.status !== "erledigt" || o.order_date < z.von || o.order_date > z.bis) continue;
    const zr = auftragsZeitraum(o, standardMin);
    if (!zr) { ohneZeit++; continue; }
    const dauer = zr.ende - zr.start;
    minuten += dauer; termine++; tage.add(o.order_date);
    if (zr.geschaetzt) ohneEnde++;
    const wt = (new Date(o.order_date + "T12:00:00").getDay() + 6) % 7; // 0 = Montag
    for (let h = 0; h < stunden; h++) {
      const a = (EINSATZ_RASTER_VON + h) * 60;
      if (zr.start < a + 60 && zr.ende > a) raster[wt][h]++;
    }
    for (const id of orderEmployees[o.id] ?? []) {
      const e = je.get(id) ?? { id, name: employees.find((x) => x.id === id)?.name ?? "Unbekannt", minuten: 0, termine: 0 };
      e.minuten += dauer; e.termine++;
      je.set(id, e);
    }
  }
  return {
    minuten, termine, tage: tage.size, ohneEnde, ohneZeit,
    jePerson: [...je.values()].sort((a, b) => b.minuten - a.minuten || a.name.localeCompare(b.name, "de")),
    raster,
  };
}

const WOCHENTAG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Der Satz unter dem Raster: wo es am vollsten ist, und an welchem Werktagnachmittag am meisten
// Platz war. Null, wenn es zu wenig Termine für eine Aussage gibt.
export function rasterHinweis(raster: number[][], mindestTermine = 10): string | null {
  const summe = raster.flat().reduce((a, b) => a + b, 0);
  if (summe < mindestTermine) return null;
  let max = -1, maxTag = 0, maxH = 0;
  raster.forEach((zeile, t) => zeile.forEach((v, h) => { if (v > max) { max = v; maxTag = t; maxH = h; } }));
  // Nachmittag 13–17 Uhr, Montag bis Freitag.
  const von = 13 - EINSATZ_RASTER_VON, bis = 17 - EINSATZ_RASTER_VON;
  let min = Infinity, minTag = 0;
  for (let t = 0; t < 5; t++) {
    const v = raster[t].slice(von, bis).reduce((a, b) => a + b, 0);
    if (v < min) { min = v; minTag = t; }
  }
  const h = EINSATZ_RASTER_VON + maxH;
  return `Am vollsten: ${WOCHENTAG[maxTag]} ${h}–${h + 1} Uhr. Am meisten Platz: ${WOCHENTAG[minTag]}nachmittag – dort passen Termine aus der Anrufliste hin.`;
}

// ---------------------------------------------------------------- Lager
//
// Belegt an einem Stichtag: eingelagert bis zu diesem Tag und noch nicht ausgelagert. Der
// Verlauf beginnt mit der ersten Erfassung in PinPoints – was vorher im Regal lag und bei der
// Übernahme erfasst wurde, steht ab dem Tag der Übernahme drin.
export function belegtAm(saetze: TireStorage[], stichtag: string): number {
  const ende = stichtag + "T23:59:59.999";
  let n = 0;
  for (const s of saetze) {
    if (s.created_at <= ende && (!s.removed_at || s.removed_at > ende)) n++;
  }
  return n;
}

export function monatsende(schluessel: string): string {
  const j = Number(schluessel.slice(0, 4));
  const m = Number(schluessel.slice(5, 7));
  return `${schluessel}-${zwei(letzterTag(j, m))}`;
}

// Je Monat die Belegung am Monatsende – im laufenden Monat heute.
export function belegungVerlauf(saetze: TireStorage[], monate: string[], heute: string): number[] {
  return monate.map((m) => { const e = monatsende(m); return belegtAm(saetze, e < heute ? e : heute); });
}

export function lagerBewegung(saetze: TireStorage[], z: Zeitraum): { ein: number; aus: number; liegedauerMonate: number | null } {
  const drin = (iso: string | null) => !!iso && iso.slice(0, 10) >= z.von && iso.slice(0, 10) <= z.bis;
  const ein = saetze.filter((s) => drin(s.created_at)).length;
  const raus = saetze.filter((s) => drin(s.removed_at));
  const tage = raus.map((s) => (new Date(s.removed_at!).getTime() - new Date(s.created_at).getTime()) / 86400000).filter((t) => t >= 0);
  return { ein, aus: raus.length, liegedauerMonate: tage.length ? Math.round((tage.reduce((a, b) => a + b, 0) / tage.length / 30.44) * 10) / 10 : null };
}

// Der Blick nach vorn: Wie veränderte sich die Belegung im Vorjahr im kommenden Monat? Auf die
// heutige Belegung gelegt, ergibt das die Erwartung. Null, wenn es im Vorjahr noch keinen
// Bestand gab – dann gibt es nichts, worauf man sich stützen könnte.
export function lagerAusblick(saetze: TireStorage[], heute: string): { monat: string; zuwachsVorjahr: number; erwartet: number } | null {
  const j = Number(heute.slice(0, 4));
  const m = Number(heute.slice(5, 7));
  const naechster = m === 12 ? `${j + 1}-01` : `${j}-${zwei(m + 1)}`;
  const diesVJ = monatsende(`${j - 1}-${zwei(m)}`);
  const naechsterVJ = monatsende(`${Number(naechster.slice(0, 4)) - 1}-${naechster.slice(5, 7)}`);
  const vorher = belegtAm(saetze, diesVJ);
  if (vorher === 0) return null;
  const zuwachs = belegtAm(saetze, naechsterVJ) - vorher;
  return { monat: naechster, zuwachsVorjahr: zuwachs, erwartet: belegtAm(saetze, heute) + zuwachs };
}

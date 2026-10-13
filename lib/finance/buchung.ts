// Finance F1 (Migration 88, v146): Konten, Steuerschlüssel, Journal – die Regeln ohne Datenbank.
//
// `postenZeilen()` rechnet dieselben Zeilen wie `fin_posten_schreiben()` in Migration 88 und dient der
// VORSCHAU im Buchungsfenster. Gebucht wird nur in der Datenbank; sie entscheidet. Wer eine Regel hier
// ändert, ändert sie dort (und umgekehrt) – geprüft in tests/financeBuchung.test.ts mit den Fällen aus
// pgtest/t88.sql.

import type { Besteuerung, FinEinstellungen, Kontenrahmen } from "./einstellungen";

export type KontoKategorie =
  | "anlage" | "geld" | "forderung" | "verbindlichkeit" | "steuer" | "kapital" | "privat" | "erloes" | "aufwand" | "vortrag";

// Reihenfolge = Reihenfolge in Auswahllisten und in der Kontenübersicht (wie eine Bilanz, dann GuV).
export const FIN_KONTO_KATEGORIEN: { wert: KontoKategorie; text: string }[] = [
  { wert: "geld", text: "Kasse und Bank" },
  { wert: "forderung", text: "Forderungen" },
  { wert: "verbindlichkeit", text: "Verbindlichkeiten" },
  { wert: "steuer", text: "Steuerkonten" },
  { wert: "erloes", text: "Erlöse" },
  { wert: "aufwand", text: "Aufwand und Wareneinkauf" },
  { wert: "anlage", text: "Anlagen" },
  { wert: "kapital", text: "Kapital" },
  { wert: "privat", text: "Privat" },
  { wert: "vortrag", text: "Anfangsbestände" },
];

export type FinKonto = {
  kontenrahmen: Kontenrahmen;
  nummer: number;
  bezeichnung: string;
  kategorie: KontoKategorie;
  eigen: boolean;
  aktiv: boolean;
};

export type SteuerArt = "ust" | "vst" | "r13b" | "ige" | "ohne";

export type FinSteuerschluessel = {
  kontenrahmen: Kontenrahmen;
  schluessel: string;
  bezeichnung: string;
  satz: number;
  art: SteuerArt;
  ust_konto: number | null;
  vst_konto: number | null;
};

export type FinZeile = {
  id?: number;
  posten: number;
  seite: "S" | "H";
  konto: number;
  betrag: number;
  steuerschluessel: string | null;
  ist_steuer: boolean;
};

export type FinBuchung = {
  id: string;
  jahr: number;
  nr: number;
  datum: string;
  text: string;
  beleg: string | null;
  quelle: "manuell" | "rechnung";
  quelle_id: string | null;
  storno_von: string | null;
  storniert_durch: string | null;
  grund: string | null;
  erstellt_am: string;
  fin_buchungszeilen: FinZeile[];
};

export type FinFestschreibung = { jahr: number; monat: number; am: string };

// Ein Posten so, wie er ins Fenster getippt und an `fin_buchen()` geschickt wird.
export type FinPosten = { soll: number | null; haben: number | null; betrag: number | null; steuer: string | null };

// Konten, auf denen die Steuer abgespalten wird (Migration 88: `erfolg`).
const STEUER_SEITE: KontoKategorie[] = ["erloes", "aufwand", "anlage"];

export const KONTO_STELLEN = 4;
export function kontoNr(n: number): string {
  return String(n).padStart(KONTO_STELLEN, "0");
}

const cent = (x: number) => Math.round(x * 100) / 100;

export type PostenErgebnis = { zeilen: FinZeile[] } | { fehler: string };

// Die Zeilen eines Postens – oder der Satz, mit dem die Datenbank ablehnen würde.
export function postenZeilen(
  p: FinPosten, nr: number, konten: FinKonto[], schluessel: FinSteuerschluessel[],
  e: Pick<FinEinstellungen, "besteuerung" | "r13b_empfaenger" | "innergemeinschaftlich" | "kontenrahmen">,
): PostenErgebnis {
  const f = (t: string): PostenErgebnis => ({ fehler: `Posten ${nr}: ${t}` });
  if (p.soll == null || p.haben == null) return f("Soll- und Haben-Konto angeben.");
  if (p.soll === p.haben) return f("Soll und Haben sind dasselbe Konto.");
  const betrag = p.betrag == null ? null : cent(p.betrag);
  if (betrag == null || !(betrag > 0)) return f("Der Betrag muss größer als 0 sein.");
  const sk = konten.find((k) => k.kontenrahmen === e.kontenrahmen && k.nummer === p.soll && k.aktiv);
  if (!sk) return f(`Konto ${kontoNr(p.soll)} gibt es im ${e.kontenrahmen.toUpperCase()} nicht oder es ist ausgeblendet.`);
  const hk = konten.find((k) => k.kontenrahmen === e.kontenrahmen && k.nummer === p.haben && k.aktiv);
  if (!hk) return f(`Konto ${kontoNr(p.haben)} gibt es im ${e.kontenrahmen.toUpperCase()} nicht oder es ist ausgeblendet.`);
  const z = (seite: "S" | "H", konto: number, b: number, ist_steuer = false, st: string | null = p.steuer): FinZeile =>
    ({ posten: nr, seite, konto, betrag: cent(b), steuerschluessel: st, ist_steuer });

  if (!p.steuer) return { zeilen: [z("S", p.soll, betrag, false, null), z("H", p.haben, betrag, false, null)] };
  const st = schluessel.find((s) => s.kontenrahmen === e.kontenrahmen && s.schluessel === p.steuer);
  if (!st) return f(`Steuerschlüssel „${p.steuer}“ gibt es nicht.`);
  if (sk.kategorie === "steuer" || hk.kategorie === "steuer") return f("Auf ein Steuerkonto wird ohne Steuerschlüssel gebucht.");
  const klein = e.besteuerung === "klein";
  if (klein && (st.art === "ust" || st.art === "vst")) return f(`Als Kleinunternehmer gibt es keine Umsatzsteuer und keinen Vorsteuerabzug – Schlüssel „${st.bezeichnung}“ passt nicht (Finance › Einstellungen).`);
  if (!klein && st.schluessel === "ku") return f("„Kleinunternehmer“ gilt nur bei der Besteuerung als Kleinunternehmer (Finance › Einstellungen).");
  if (st.art === "r13b" && !e.r13b_empfaenger) return f("§ 13b ist in Finance › Einstellungen ausgeschaltet.");
  if ((st.art === "ige" || st.schluessel === "igl") && !e.innergemeinschaftlich) return f("Innergemeinschaftliche Geschäfte sind in Finance › Einstellungen ausgeschaltet.");
  if (st.art === "ohne") return { zeilen: [z("S", p.soll, betrag), z("H", p.haben, betrag)] };

  const links = STEUER_SEITE.includes(sk.kategorie);
  if (links === STEUER_SEITE.includes(hk.kategorie)) return f("Mit Steuerschlüssel braucht der Posten genau ein Erlös-, Aufwands- oder Anlagekonto.");

  if (st.art === "ust" || st.art === "vst") {
    const steuer = cent((betrag * st.satz) / (100 + st.satz));
    const netto = cent(betrag - steuer);
    const zeilen = [z("S", p.soll, links ? netto : betrag), z("H", p.haben, links ? betrag : netto)];
    if (steuer > 0) zeilen.push(z(links ? "S" : "H", (st.art === "ust" ? st.ust_konto : st.vst_konto) as number, steuer, true));
    return { zeilen };
  }
  // § 13b / ig. Erwerb: netto, Steuer obendrauf; Kleinunternehmer ohne Vorsteuer (die Steuer wird Aufwand).
  const steuer = cent((betrag * st.satz) / 100);
  const zeilen = [
    z("S", p.soll, links && klein ? betrag + steuer : betrag),
    z("H", p.haben, !links && klein ? betrag + steuer : betrag),
  ];
  if (steuer > 0) {
    zeilen.push(z(links ? "H" : "S", st.ust_konto as number, steuer, true));
    if (!klein) zeilen.push(z(links ? "S" : "H", st.vst_konto as number, steuer, true));
  }
  return { zeilen };
}

// Alle Posten einer Buchung: Zeilen, Summen und der erste Fehler.
export function buchungVorschau(
  posten: FinPosten[], konten: FinKonto[], schluessel: FinSteuerschluessel[],
  e: Pick<FinEinstellungen, "besteuerung" | "r13b_empfaenger" | "innergemeinschaftlich" | "kontenrahmen">,
): { zeilen: FinZeile[]; soll: number; haben: number; fehler: string | null } {
  const zeilen: FinZeile[] = [];
  let fehler: string | null = null;
  posten.forEach((p, i) => {
    const r = postenZeilen(p, i + 1, konten, schluessel, e);
    if ("fehler" in r) fehler ??= r.fehler; else zeilen.push(...r.zeilen);
  });
  if (!posten.length) fehler = "Die Buchung braucht mindestens einen Posten.";
  const soll = cent(zeilen.filter((z) => z.seite === "S").reduce((s, z) => s + z.betrag, 0));
  const haben = cent(zeilen.filter((z) => z.seite === "H").reduce((s, z) => s + z.betrag, 0));
  return { zeilen, soll, haben, fehler };
}

// Welche Steuerschlüssel zur Besteuerung passen (die Datenbank lehnt die anderen ab).
export function passendeSchluessel(
  schluessel: FinSteuerschluessel[],
  e: Pick<FinEinstellungen, "besteuerung" | "r13b_empfaenger" | "innergemeinschaftlich" | "kontenrahmen">,
): FinSteuerschluessel[] {
  const klein: Besteuerung = "klein";
  return schluessel.filter((s) => {
    if (s.kontenrahmen !== e.kontenrahmen) return false;
    if (e.besteuerung === klein && (s.art === "ust" || s.art === "vst")) return false;
    if (e.besteuerung !== klein && s.schluessel === "ku") return false;
    if (s.art === "r13b" && !e.r13b_empfaenger) return false;
    if ((s.art === "ige" || s.schluessel === "igl") && !e.innergemeinschaftlich) return false;
    return true;
  });
}

// Betrag einer Buchung für die Liste: Summe der Sollseite.
export function buchungBetrag(b: Pick<FinBuchung, "fin_buchungszeilen">): number {
  return cent(b.fin_buchungszeilen.filter((z) => z.seite === "S").reduce((s, z) => s + Number(z.betrag), 0));
}

export type KontoSaldo = { konto: number; soll: number; haben: number; saldo: number; anzahl: number };

// Summen und Saldo je Konto (Soll minus Haben) über die gegebenen Buchungen.
export function kontenSalden(buchungen: Pick<FinBuchung, "fin_buchungszeilen">[]): Map<number, KontoSaldo> {
  const m = new Map<number, KontoSaldo>();
  for (const b of buchungen) for (const z of b.fin_buchungszeilen) {
    const s = m.get(z.konto) ?? { konto: z.konto, soll: 0, haben: 0, saldo: 0, anzahl: 0 };
    if (z.seite === "S") s.soll = cent(s.soll + Number(z.betrag)); else s.haben = cent(s.haben + Number(z.betrag));
    s.saldo = cent(s.soll - s.haben);
    s.anzahl += 1;
    m.set(z.konto, s);
  }
  return m;
}

// Zustand einer Buchung in einem Wort.
export function buchungZustand(b: Pick<FinBuchung, "storno_von" | "storniert_durch" | "datum">, fest: FinFestschreibung[]):
  { storno: boolean; storniert: boolean; festgeschrieben: boolean } {
  const [j, m] = b.datum.split("-").map(Number);
  return { storno: !!b.storno_von, storniert: !!b.storniert_durch, festgeschrieben: fest.some((f) => f.jahr === j && f.monat === m) };
}

// Ein Text im Feld → Betrag: „1.234,56“, „1234,56“, „1234.56“. Ungültig → null.
export function betragLesen(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "");
  if (!t) return null;
  const normal = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") // „1.234“ = Tausenderpunkt
    : t; // ein Komma ohne zwei Nachkommastellen ist kein Betrag
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Number(normal);
}

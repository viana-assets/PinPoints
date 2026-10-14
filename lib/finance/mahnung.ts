// Finance: Mahnwesen (Migration 99, v157) – Stufen, Vorschlag, Verzugszinsen und Brieftext ohne Datenbank, geprüft in
// tests/financeMahnung.test.ts. Erstellt wird über `fin_mahnung_erstellen()`, die dieselben Regeln prüft (Stufe für
// Stufe, nach der Fälligkeit, nach Ablauf der vorigen Frist, höchstens drei).
//
// Stand Oktober 2026: Verzugszinsen § 288 BGB – Verbraucher 5, Unternehmer 9 Prozentpunkte über dem Basiszinssatz
// (§ 247 BGB, Deutsche Bundesbank, je Halbjahr); gegenüber Unternehmern zusätzlich 40 € Pauschale (§ 288 Abs. 5 BGB).
// Verzug tritt mit der ersten Mahnung ein, wenn nichts anderes gilt (§ 286 BGB) – Zinsen rechnet die App deshalb erst
// ab dem Tag nach der Frist der Zahlungserinnerung.

import type { FinRechnungZeile } from "./rechnungen";
import { rechnungRest, rechnungZustand } from "./rechnungen";

export type FinMahnung = {
  id: string; rechnung_id: string; stufe: number; datum: string; frist: string; nummer_text: string; rechnung_datum: string; faellig_am: string;
  brutto: number; bezahlt: number; offen: number; gebuehr: number; zinsen: number; zinssatz: number | null; text: string;
  absender: Record<string, string | null>; empfaenger: Record<string, string | number | null>; zurueckgezogen_am: string | null; zurueck_grund: string | null; erstellt_am: string;
};

// Die drei Stufen: Titel, Abstand nach Fälligkeit bzw. voriger Frist (Vorschlag), neue Frist in Tagen.
export const FIN_MAHNSTUFEN: { stufe: number; titel: string; nachTagen: number; fristTage: number }[] = [
  { stufe: 1, titel: "Zahlungserinnerung", nachTagen: 7, fristTage: 10 },
  { stufe: 2, titel: "Mahnung", nachTagen: 3, fristTage: 10 },
  { stufe: 3, titel: "Letzte Mahnung", nachTagen: 3, fristTage: 7 },
];

// Basiszinssatz nach § 247 BGB, je ab dem Tag (Deutsche Bundesbank). Neue Werte zum 1. Januar und 1. Juli nachtragen.
export const FIN_BASISZINS: { ab: string; satz: number }[] = [
  { ab: "2024-01-01", satz: 3.62 }, { ab: "2024-07-01", satz: 3.37 }, { ab: "2025-01-01", satz: 2.27 },
  { ab: "2025-07-01", satz: 1.27 }, { ab: "2026-01-01", satz: 1.27 }, { ab: "2026-07-01", satz: 1.52 },
];
export const FIN_VERZUG_PUNKTE: Record<"verbraucher" | "unternehmer", number> = { verbraucher: 5, unternehmer: 9 };
export const FIN_MAHNPAUSCHALE_UNTERNEHMER = 40;

const cent = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
const tag = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const iso = (t: number) => new Date(t * 86_400_000).toISOString().slice(0, 10);
export const tagePlus = (d: string, n: number) => iso(tag(d) + n);

export function basiszins(datum: string): number | null {
  let s: number | null = null;
  for (const b of FIN_BASISZINS) if (b.ab <= datum) s = b.satz;
  return s;
}

// Verzugszinsen auf `offen` vom Tag `von` bis einschließlich `bis`, taggenau, Jahr = 365 Tage, Satz je Halbjahr.
export function verzugszinsen(offen: number, von: string, bis: string, art: "verbraucher" | "unternehmer"): { zinsen: number; satz: number | null; tage: number } {
  const s = basiszins(bis);
  const satz = s == null ? null : cent(s + FIN_VERZUG_PUNKTE[art]);
  if (!(offen > 0) || bis < von) return { zinsen: 0, satz, tage: 0 };
  let summe = 0;
  for (let t = tag(von); t <= tag(bis); t++) {
    const b = basiszins(iso(t));
    if (b == null) continue;
    summe += (offen * (b + FIN_VERZUG_PUNKTE[art])) / 100 / 365;
  }
  return { zinsen: cent(summe), satz, tage: tag(bis) - tag(von) + 1 };
}

export const aktiveMahnungen = (alle: FinMahnung[], rechnung: string) =>
  alle.filter((m) => m.rechnung_id === rechnung && !m.zurueckgezogen_am).sort((a, b) => a.stufe - b.stufe);

export type MahnVorschlag =
  | { art: "keine"; grund: string }
  // `moeglich`: schon erlaubt (nach Fälligkeit bzw. voriger Frist), nur der Vorschlag kommt später.
  | { art: "noch_nicht"; stufe: number; ab: string; moeglich: boolean; grund: string }
  | { art: "jetzt"; stufe: number; datum: string; frist: string; verzugAb: string | null };

// Was als Nächstes dran ist. Wie `fin_mahnung_erstellen()`: offen und gebucht, nach der Fälligkeit, nach der vorigen Frist.
export function mahnVorschlag(r: FinRechnungZeile, mahnungen: FinMahnung[], heute: string): MahnVorschlag {
  const z = rechnungZustand(r, heute);
  if (z.art !== "offen" && z.art !== "ueberfaellig") return { art: "keine", grund: z.art === "bezahlt" ? "bezahlt" : z.art === "storniert" ? "storniert" : "nicht gebucht" };
  if (rechnungRest(r) <= 0) return { art: "keine", grund: "nichts offen" };
  const m = aktiveMahnungen(mahnungen, r.rechnung_id);
  const letzte = m[m.length - 1];
  if (letzte && letzte.stufe >= 3) return { art: "keine", grund: "letzte Mahnung verschickt – Inkasso oder Mahnbescheid klären" };
  const stufe = (letzte?.stufe ?? 0) + 1;
  const def = FIN_MAHNSTUFEN[stufe - 1];
  const basis = letzte ? letzte.frist : z.faellig;
  const ab = tagePlus(basis, def.nachTagen);
  const fruehestens = tagePlus(basis, 1);
  if (heute < fruehestens) return { art: "noch_nicht", stufe, ab: fruehestens, moeglich: false, grund: letzte ? `Frist der ${FIN_MAHNSTUFEN[letzte.stufe - 1].titel} läuft bis ${datumDe(letzte.frist)}` : `fällig am ${datumDe(z.faellig)}` };
  if (heute < ab) return { art: "noch_nicht", stufe, ab, moeglich: true, grund: `${def.titel} vorgeschlagen ab ${datumDe(ab)}` };
  const erste = m.find((x) => x.stufe === 1);
  return { art: "jetzt", stufe, datum: heute, frist: tagePlus(heute, def.fristTage), verzugAb: erste ? tagePlus(erste.frist, 1) : null };
}

// Wie viele offene Rechnungen jetzt eine Mahnung (oder Erinnerung) bekommen sollten.
export function mahnZuErledigen(rechnungen: FinRechnungZeile[], mahnungen: FinMahnung[], heute: string): number {
  return rechnungen.filter((r) => mahnVorschlag(r, mahnungen, heute).art === "jetzt").length;
}

function datumDe(d: string): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// Der Vorschlag für den Brieftext (vor dem Erstellen änderbar; gespeichert wird, was dasteht).
export function mahnText(x: { stufe: number; nummer: string; rechnungDatum: string; offen: number; gesamt: number; frist: string; anrede?: string | null }): string {
  const an = x.anrede?.trim() ? `${x.anrede.trim()},` : "Sehr geehrte Damen und Herren,";
  const re = `unsere Rechnung ${x.nummer} vom ${datumDe(x.rechnungDatum)}`;
  if (x.stufe === 1) {
    return `${an}\n\nsicher ist es Ihrer Aufmerksamkeit entgangen: ${re} ist noch offen. Bitte überweisen Sie ${eur(x.gesamt)} bis zum ${datumDe(x.frist)}.\n\nHaben Sie inzwischen bezahlt, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen`;
  }
  if (x.stufe === 2) {
    return `${an}\n\ntrotz unserer Zahlungserinnerung ist ${re} noch nicht beglichen. Wir bitten Sie, ${eur(x.gesamt)} bis zum ${datumDe(x.frist)} zu überweisen.\n\nSollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, danken wir Ihnen.\n\nMit freundlichen Grüßen`;
  }
  return `${an}\n\n${re} ist trotz Erinnerung und Mahnung weiterhin offen. Bitte überweisen Sie ${eur(x.gesamt)} spätestens bis zum ${datumDe(x.frist)}. Geht bis dahin keine Zahlung ein, werden wir die Forderung ohne weitere Ankündigung gerichtlich geltend machen oder an ein Inkassounternehmen abgeben.\n\nMit freundlichen Grüßen`;
}

export const mahnGesamt = (m: Pick<FinMahnung, "offen" | "gebuehr" | "zinsen">) => cent(Number(m.offen) + Number(m.gebuehr) + Number(m.zinsen));

export function mailtoMahnung(m: FinMahnung): string | null {
  const an = String(m.empfaenger.email ?? "").trim();
  if (!an) return null;
  const titel = FIN_MAHNSTUFEN[m.stufe - 1]?.titel ?? "Mahnung";
  const betreff = `${titel} zur Rechnung ${m.nummer_text}`;
  return `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(m.text + "\n\n" + String(m.absender.firma ?? ""))}`;
}

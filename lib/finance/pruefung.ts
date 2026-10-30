// Finance Stufe H (Migration 116, v186): die Prüfliste für Monats- und Jahresabschluss. Die Datenbank sammelt
// (`fin_pruefung`), hier wird gelesen und zu Punkten mit Ziel verdichtet. Geprüft in tests/financePruefung.test.ts.

import type { FinanceSeiteKey } from "./seiten";
import { MONATSNAMEN } from "./auswertungen";

export type FinPruefung = {
  eingerichtet: boolean;
  luecken_buchungen: number[];
  luecken_rechnungen: number[];
  ohne_beleg_zahl: number;
  ohne_beleg: { id: string; nr: number; datum: string; text: string; betrag: number }[];
  ohne_personenkonto: number;
  bank_offen: { zahl: number; summe: number; aeltester: string | null };
  entwuerfe_alt: number;
  monate_offen: number[];
};

const zahl = (x: unknown) => (x == null ? 0 : Number(x));
const liste = (x: unknown) => (Array.isArray(x) ? x.map(Number) : []);

export function pruefungLesen(roh: unknown): FinPruefung {
  const r = (roh ?? {}) as Record<string, unknown>;
  const bank = (r.bank_offen ?? {}) as Record<string, unknown>;
  return {
    eingerichtet: !!r.eingerichtet,
    luecken_buchungen: liste(r.luecken_buchungen),
    luecken_rechnungen: liste(r.luecken_rechnungen),
    ohne_beleg_zahl: zahl(r.ohne_beleg_zahl),
    ohne_beleg: (Array.isArray(r.ohne_beleg) ? r.ohne_beleg : []).map((x: Record<string, unknown>) => ({
      id: String(x.id), nr: zahl(x.nr), datum: String(x.datum), text: String(x.text ?? ""), betrag: zahl(x.betrag),
    })),
    ohne_personenkonto: zahl(r.ohne_personenkonto),
    bank_offen: { zahl: zahl(bank.zahl), summe: zahl(bank.summe), aeltester: bank.aeltester ? String(bank.aeltester) : null },
    entwuerfe_alt: zahl(r.entwuerfe_alt),
    monate_offen: liste(r.monate_offen),
  };
}

// Lücken zusammenfassen: [3,4,5,9] → „3–5, 9“.
export function lueckenText(n: readonly number[]): string {
  const teile: string[] = [];
  let i = 0;
  while (i < n.length) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    teile.push(j > i ? `${n[i]}–${n[j]}` : String(n[i]));
    i = j + 1;
  }
  return teile.join(", ");
}

export type PruefPunkt = { key: string; text: string; hinweis: string; anzahl: number; ok: boolean; seite: FinanceSeiteKey | null };

// Was die App außerhalb der Datenbankprüfung weiß (null = nicht sichtbar für diese Rolle, der Punkt fällt weg).
export type PruefZusatz = { rechnungenUngebucht: number | null; kasseNegativ: boolean | null; zahlauftraegeOffen: number | null; ustOffen: number | null };

export function pruefPunkte(p: FinPruefung, z: PruefZusatz): PruefPunkt[] {
  const punkte: PruefPunkt[] = [
    { key: "nummern", text: "Buchungsnummern lückenlos", anzahl: p.luecken_buchungen.length, ok: p.luecken_buchungen.length === 0, seite: "buchungen",
      hinweis: p.luecken_buchungen.length ? `Es fehlen Nr. ${lueckenText(p.luecken_buchungen)} – das darf nicht sein; mit dem Protokoll klären.` : "Jede Nummer ist vergeben." },
    { key: "rechnungskreis", text: "Rechnungsnummern lückenlos", anzahl: p.luecken_rechnungen.length, ok: p.luecken_rechnungen.length === 0, seite: "rechnungen",
      hinweis: p.luecken_rechnungen.length ? `Es fehlen ${lueckenText(p.luecken_rechnungen)} im Rechnungskreis – Grund dokumentieren.` : "Keine Lücke im Rechnungskreis." },
    { key: "beleg", text: "Jede Buchung von Hand hat einen Beleg", anzahl: p.ohne_beleg_zahl, ok: p.ohne_beleg_zahl === 0, seite: "buchungen",
      hinweis: p.ohne_beleg_zahl ? "Belegnummer fehlt und kein Belegbild angehängt – im Journal ein Bild anhängen." : "Alle haben eine Belegnummer oder ein Belegbild." },
    { key: "personen", text: "Forderungen und Verbindlichkeiten am Personenkonto", anzahl: p.ohne_personenkonto, ok: p.ohne_personenkonto === 0, seite: "buchungen",
      hinweis: p.ohne_personenkonto ? "Von Hand auf das Sammelkonto gebucht – in DATEV fehlt dann der Kunde bzw. Lieferant." : "Alles hängt an einem Debitor oder Kreditor." },
    { key: "bank", text: "Bankumsätze zugeordnet", anzahl: p.bank_offen.zahl, ok: p.bank_offen.zahl === 0, seite: "bank",
      hinweis: p.bank_offen.zahl ? `Seit mehr als 14 Tagen offen${p.bank_offen.aeltester ? `, der älteste vom ${datum(p.bank_offen.aeltester)}` : ""}.` : "Nichts älter als 14 Tage offen." },
    { key: "entwuerfe", text: "Keine alten Belegentwürfe", anzahl: p.entwuerfe_alt, ok: p.entwuerfe_alt === 0, seite: "belege",
      hinweis: p.entwuerfe_alt ? "Seit mehr als 30 Tagen im Entwurf – buchen oder verwerfen." : "Kein Entwurf älter als 30 Tage." },
    { key: "fest", text: "Vergangene Monate festgeschrieben", anzahl: p.monate_offen.length, ok: p.monate_offen.length === 0, seite: "buchungen",
      hinweis: p.monate_offen.length ? `Offen: ${p.monate_offen.map((m) => MONATSNAMEN[m - 1]).join(", ")} – nach der Abstimmung unter Buchungen › Monate festschreiben.` : "Alle vergangenen Monate sind festgeschrieben." },
  ];
  if (z.rechnungenUngebucht != null) punkte.splice(2, 0, { key: "rechnungen", text: "Rechnungen aus FSM gebucht", anzahl: z.rechnungenUngebucht, ok: z.rechnungenUngebucht === 0, seite: "rechnungen",
    hinweis: z.rechnungenUngebucht ? "Rechnungen ohne Buchung – unter Rechnungen nachbuchen." : "Jede Rechnung ist gebucht." });
  if (z.kasseNegativ != null) punkte.push({ key: "kasse", text: "Kasse nie unter null", anzahl: z.kasseNegativ ? 1 : 0, ok: !z.kasseNegativ, seite: "bank",
    hinweis: z.kasseNegativ ? "Der Kassenbestand war zeitweise negativ – fehlt eine Einnahme oder der Anfangsbestand?" : "Der Bestand war immer positiv." });
  if (z.zahlauftraegeOffen != null) punkte.push({ key: "zahlungen", text: "Zahlaufträge abgeglichen", anzahl: z.zahlauftraegeOffen, ok: z.zahlauftraegeOffen === 0, seite: "bank",
    hinweis: z.zahlauftraegeOffen ? "SEPA-Dateien, deren Abbuchungen noch nicht zugeordnet sind – Kontoauszug einlesen oder verwerfen." : "Keine offene SEPA-Datei." });
  if (z.ustOffen != null) punkte.push({ key: "ust", text: "Voranmeldungen abgegeben", anzahl: z.ustOffen, ok: z.ustOffen === 0, seite: "steuern",
    hinweis: z.ustOffen ? "Überfällige oder seit der Abgabe geänderte Voranmeldungen – unter Steuern festhalten bzw. berichtigen." : "Nichts überfällig." });
  return punkte;
}

function datum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

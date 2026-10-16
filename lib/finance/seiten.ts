import type { ReactNode } from "react";

// Die Seiten von Finance (v145, Phase F0, docs/finance.md Abschnitt 5). EINE Liste für Navigation,
// Übersicht und „Mehr“ am Handy (Konstanten-Regel). `phase`: in welcher Phase die Seite Inhalt
// bekommt – bis dahin zeigt sie, was kommt. `primaer`: steht am Handy in der unteren Leiste, die
// übrigen unter „Mehr“.

export type FinanceSeiteKey =
  | "uebersicht" | "rechnungen" | "belege" | "bank" | "op" | "buchungen"
  | "steuern" | "anlagen" | "auswertungen" | "abschluss" | "export" | "einstellungen";

export type FinanceSeite = {
  key: FinanceSeiteKey;
  label: string;
  beschreibung: string;
  // Kurz für die Kachel unter „Weitere“ am Handy (v162); sonst steht die Beschreibung da.
  kurz?: string;
  // Lese-Recht, das die Seite sichtbar macht.
  recht: string;
  // Phase, in der sie gebaut wird; `null` = steht schon (Übersicht, Einstellungen).
  phase: string | null;
  primaer?: boolean;
};

export const FINANCE_SEITEN: FinanceSeite[] = [
  { key: "uebersicht", label: "Übersicht", beschreibung: "Was ansteht und wie der Pilot läuft", recht: "finance", phase: null, primaer: true },
  { key: "rechnungen", label: "Rechnungen", beschreibung: "Aufträge mit Haken „Rechnung nötig“: vorgemerkt, zu erstellen, ausgestellt", recht: "finance.rechnungen", phase: null, primaer: true },
  { key: "belege", label: "Belege", beschreibung: "Eingangsrechnungen und Quittungen: Foto, PDF oder E-Rechnung, buchen, bezahlen", recht: "finance.belege", phase: null, primaer: true },
  { key: "bank", label: "Bank & Kasse", beschreibung: "Kontoauszug (CAMT oder CSV) einlesen, Umsätze Rechnungen, Belegen oder Konten zuordnen; Kassenbuch", recht: "finance.bank", phase: null, primaer: true },
  { key: "op", label: "Offene Posten", beschreibung: "Wer noch zahlen muss und was wir schulden", kurz: "Wer noch zahlen muss, was wir schulden", recht: "finance.rechnungen", phase: null },
  { key: "buchungen", label: "Buchungen", beschreibung: "Journal, Konten mit Saldo, Monate festschreiben", kurz: "Journal, Konten, Monate festschreiben", recht: "finance.buchen", phase: null },
  { key: "steuern", label: "Steuern", beschreibung: "Umsatzsteuer-Voranmeldung mit Kennzahlen, Fristen und Zahllast – als Probelauf", kurz: "Umsatzsteuer-Voranmeldung, Fristen", recht: "finance.steuer", phase: null },
  { key: "anlagen", label: "Anlagen", beschreibung: "Anlagenverzeichnis, Abschreibungsplan, Abschreibungen buchen, Abgang", kurz: "Verzeichnis und Abschreibungen", recht: "finance.abschluss", phase: null },
  { key: "auswertungen", label: "Auswertungen", beschreibung: "Summen und Salden, Kontenblätter, BWA mit Vorjahr, EÜR und Liquidität – auch als CSV", kurz: "BWA, EÜR, Liquidität", recht: "finance.abschluss", phase: null },
  { key: "abschluss", label: "Jahresabschluss", beschreibung: "GuV, Bilanz, Anlagenspiegel, Rückstellungen und Abgrenzungen, Saldenvortrag ins neue Jahr", kurz: "GuV, Bilanz, Saldenvortrag", recht: "finance.abschluss", phase: null },
  { key: "export", label: "Export", beschreibung: "DATEV-Buchungsstapel des Journals, GoBD-Datenexport, Verfahrensdokumentation", kurz: "DATEV und GoBD für die Kanzlei", recht: "finance.abschluss", phase: null },
  // Sichtbar für alle mit Finance; ÄNDERN braucht „finance.einstellungen“ schreiben.
  { key: "einstellungen", label: "Einstellungen", beschreibung: "Rechtsform, EÜR oder Bilanz, Kontenrahmen, Umsatzsteuer", kurz: "Rechtsform, Kontenrahmen, Steuer", recht: "finance", phase: null },
];

// Die Gruppen der Kachelseite „Weitere“ am Handy (v162, Wunsch Vitali 16.10.2026: gegliedert wie in FSM,
// `WEITERE_GRUPPEN` in lib/module.ts). Eine Seite, die hier fehlt, landet in „Sonstiges“ – sie verschwindet
// nicht, wenn jemand eine neue Seite ergänzt und diese Liste vergisst (`financeWeitereGruppen`).
export const FINANCE_WEITERE_GRUPPEN: { titel: string; seiten: FinanceSeiteKey[] }[] = [
  { titel: "Zahlungen", seiten: ["op"] },
  { titel: "Buchführung", seiten: ["buchungen", "anlagen"] },
  { titel: "Steuern und Auswertungen", seiten: ["steuern", "auswertungen"] },
  { titel: "Jahresende und Kanzlei", seiten: ["abschluss", "export"] },
  { titel: "System", seiten: ["einstellungen"] },
];

export function financeWeitereGruppen(seiten: FinanceSeite[]): { titel: string; seiten: FinanceSeite[] }[] {
  const vergeben = new Set(FINANCE_WEITERE_GRUPPEN.flatMap((g) => g.seiten));
  const gruppen = FINANCE_WEITERE_GRUPPEN.map((g) => ({
    titel: g.titel,
    seiten: g.seiten.map((k) => seiten.find((x) => x.key === k)).filter((x): x is FinanceSeite => !!x),
  }));
  const rest = seiten.filter((x) => !vergeben.has(x.key));
  if (rest.length) gruppen.push({ titel: "Sonstiges", seiten: rest });
  return gruppen;
}

export function sichtbareFinanceSeiten(darf: (recht: string) => boolean): FinanceSeite[] {
  return FINANCE_SEITEN.filter((s) => darf(s.recht));
}

// Icons liegen in components/icons.tsx; die Zuordnung steht in components/finance/FinanceBereich.tsx,
// damit diese Datei ohne React-Komponenten auskommt (und in Tests ohne jsdom läuft).
export type FinanceIconFuer = (key: FinanceSeiteKey) => ReactNode;

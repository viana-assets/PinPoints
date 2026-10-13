import type { ReactNode } from "react";

// Die Seiten von Finance (v145, Phase F0, docs/finance.md Abschnitt 5). EINE Liste für Navigation,
// Übersicht und „Mehr“ am Handy (Konstanten-Regel). `phase`: in welcher Phase die Seite Inhalt
// bekommt – bis dahin zeigt sie, was kommt. `primaer`: steht am Handy in der unteren Leiste, die
// übrigen unter „Mehr“.

export type FinanceSeiteKey =
  | "uebersicht" | "rechnungen" | "belege" | "bank" | "op" | "buchungen"
  | "steuern" | "anlagen" | "auswertungen" | "export" | "einstellungen";

export type FinanceSeite = {
  key: FinanceSeiteKey;
  label: string;
  beschreibung: string;
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
  { key: "bank", label: "Bank & Kasse", beschreibung: "Kontoauszüge einlesen, zuordnen; Kassenbuch für Barzahlungen", recht: "finance.bank", phase: "F4", primaer: true },
  { key: "op", label: "Offene Posten", beschreibung: "Wer noch zahlen muss und was wir schulden", recht: "finance.rechnungen", phase: null },
  { key: "buchungen", label: "Buchungen", beschreibung: "Journal, Konten mit Saldo, Monate festschreiben", recht: "finance.buchen", phase: null },
  { key: "steuern", label: "Steuern", beschreibung: "Umsatzsteuer-Voranmeldung und Zahllast – als Probelauf", recht: "finance.steuer", phase: "F5" },
  { key: "anlagen", label: "Anlagen", beschreibung: "Anlagevermögen und Abschreibungen", recht: "finance.abschluss", phase: "F7" },
  { key: "auswertungen", label: "Auswertungen", beschreibung: "BWA, EÜR oder GuV und Summen-Salden", recht: "finance.abschluss", phase: "F6" },
  { key: "export", label: "Export", beschreibung: "DATEV-Buchungsstapel für den Steuerberater", recht: "finance.abschluss", phase: "F9" },
  // Sichtbar für alle mit Finance; ÄNDERN braucht „finance.einstellungen“ schreiben.
  { key: "einstellungen", label: "Einstellungen", beschreibung: "Rechtsform, EÜR oder Bilanz, Kontenrahmen, Umsatzsteuer", recht: "finance", phase: null },
];

export function sichtbareFinanceSeiten(darf: (recht: string) => boolean): FinanceSeite[] {
  return FINANCE_SEITEN.filter((s) => darf(s.recht));
}

// Icons liegen in components/icons.tsx; die Zuordnung steht in components/finance/FinanceBereich.tsx,
// damit diese Datei ohne React-Komponenten auskommt (und in Tests ohne jsdom läuft).
export type FinanceIconFuer = (key: FinanceSeiteKey) => ReactNode;

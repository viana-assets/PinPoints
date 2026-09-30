import { datumKurz } from "./dashboard";

// Wann war ein Termin – und wann ist er jetzt? (30.09.2026)
//
// Anlass: Ein Termin war im Kalender versehentlich verschoben worden, und niemand wusste mehr,
// wo er vorher stand. Das Protokoll hatte es festgehalten – aber erst nach dem Aufklappen, als
// drei Zeilen „Datum / Uhrzeit / Uhrzeit bis" mit Rohwerten wie „10:00:00". Die Frage „von wann
// auf wann?" muss sich ohne Aufklappen beantworten.
//
// Reine Funktionen, geprüft in tests/terminAenderung.test.ts. Dieselbe Schreibweise im Hinweis
// nach dem Verschieben (EinsatzplanungPanel) und in der Historie (ProtokollZeile) – zwei
// Schreibweisen desselben Termins wären zwei Gelegenheiten, ihn zu verwechseln.

export type TerminStand = { datum: string; von: string | null; bis: string | null };

// Die Datenbank liefert die Uhrzeit als „10:00:00", die Oberfläche als „10:00".
function hhmm(wert: unknown): string | null {
  if (typeof wert !== "string" || !wert.trim()) return null;
  return wert.slice(0, 5);
}

// Aus einer Auftragszeile (im Protokoll ein jsonb, also untypisiert) den Termin lesen.
export function terminAusZeile(zeile: Record<string, unknown> | null | undefined): TerminStand | null {
  if (!zeile) return null;
  const datum = zeile.order_date;
  if (typeof datum !== "string" || !datum) return null;
  return { datum: datum.slice(0, 10), von: hhmm(zeile.time), bis: hhmm(zeile.end_time) };
}

export function gleicherTermin(a: TerminStand | null, b: TerminStand | null): boolean {
  if (!a || !b) return a === b;
  return a.datum === b.datum && a.von === b.von && a.bis === b.bis;
}

// „Di 29.9. 10:00–11:00", „Di 29.9. 10:00", „Di 29.9. ohne Uhrzeit". Mit `mitJahr` hängt das
// Jahr am Datum – in der Historie stehen Einträge aus Jahren, im Hinweis nach dem Verschieben
// nicht.
export function terminText(t: TerminStand, mitJahr = false): string {
  const tag = datumKurz(t.datum) + (mitJahr ? t.datum.slice(0, 4) : "");
  if (!t.von) return `${tag} ohne Uhrzeit`;
  return `${tag} ${t.von}${t.bis ? `–${t.bis}` : ""}`;
}

// Was ein Protokolleintrag am Termin eines Auftrags getan hat. `null`, wenn er ihn nicht
// berührt hat. Beim Anlegen gibt es kein „vorher", beim Löschen kein „nachher".
export function terminAenderung(
  alt: Record<string, unknown> | null | undefined,
  neu: Record<string, unknown> | null | undefined
): { vorher: TerminStand | null; nachher: TerminStand | null } | null {
  const vorher = terminAusZeile(alt);
  const nachher = terminAusZeile(neu);
  if (!vorher && !nachher) return null;
  if (vorher && nachher && gleicherTermin(vorher, nachher)) return null;
  return { vorher, nachher };
}

// Der Satz dazu, ohne Aufklappen lesbar.
export function terminAenderungText(
  a: { vorher: TerminStand | null; nachher: TerminStand | null },
  mitJahr = true
): string {
  if (a.vorher && a.nachher) return `Termin ${terminText(a.vorher, mitJahr)} → ${terminText(a.nachher, mitJahr)}`;
  if (a.nachher) return `Termin ${terminText(a.nachher, mitJahr)}`;
  return `Termin war ${terminText(a.vorher!, mitJahr)}`;
}

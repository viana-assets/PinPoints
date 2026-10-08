import { datumKurz } from "./dashboard";

// Die Regeln hinter der Stempeluhr (Migration 82, v131, Entwurf „Stempeluhr“ vom 08.10.2026).
// Reine Funktionen, geprüft in tests/zeiterfassung.test.ts. Datenzugriff in lib/api/zeiterfassung.ts,
// Oberfläche in components/zeit/.
//
// Gespeichert werden Schichten (Beginn, Ende) mit Pausen. Gezählt wird die Arbeitszeit OHNE Pausen.
// Eine Schicht gehört zu dem Tag, an dem sie begonnen hat – auch wenn sie über Mitternacht geht.
// Die Hinweise (Pause zu kurz, über 10 Stunden, offen) sind Hinweise, keine Entscheidungen: Es wird
// nichts gekürzt und nichts von selbst beendet.

export type ZeitPause = { id?: string; beginn: string; ende: string | null };
export type ZeitSchicht = {
  id: string;
  profile_id: string;
  beginn: string;
  ende: string | null;
  korrigiert_am?: string | null;
  korrigiert_von?: string | null;
  korrektur_grund?: string | null;
  pausen: ZeitPause[];
};
export type ZeitStatus = { jetzt: string; schicht: ZeitSchicht | null };
export type ZeitPerson = { id: string; name: string; rolle: string };
export type StempelZustand = "aus" | "laeuft" | "pause";
export type StempelArt = "ein" | "pause" | "weiter" | "aus";

// § 4 ArbZG: mehr als 6 Stunden → 30 Minuten Pause, mehr als 9 Stunden → 45 Minuten.
export const ZEIT_PAUSE_REGELN = [
  { abMinuten: 9 * 60, pauseMinuten: 45 },
  { abMinuten: 6 * 60, pauseMinuten: 30 },
] as const;
// § 3 ArbZG: werktäglich höchstens 10 Stunden.
export const ZEIT_TAG_MAX_MINUTEN = 10 * 60;
// So oft fragt die Stempeluhr ihren Stand neu ab (die Sekunden zählt das Gerät selbst).
export const ZEIT_STATUS_ABFRAGE_MS = 60_000;

export type TagHinweis = "pause" | "lang" | "offen" | "korrigiert";
export const ZEIT_HINWEIS_TEXT: Record<TagHinweis, string> = {
  pause: "Pause zu kurz",
  lang: "über 10 h",
  offen: "offen",
  korrigiert: "korrigiert",
};

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();

export function pauseMs(s: Pick<ZeitSchicht, "pausen">, jetzt: number): number {
  return s.pausen.reduce((sum, p) => sum + Math.max(0, (p.ende ? t(p.ende) : jetzt) - t(p.beginn)), 0);
}

export function arbeitMs(s: Pick<ZeitSchicht, "beginn" | "ende" | "pausen">, jetzt: number): number {
  return Math.max(0, (s.ende ? t(s.ende) : jetzt) - t(s.beginn) - pauseMs(s, jetzt));
}

export function zustand(s: Pick<ZeitSchicht, "ende" | "pausen"> | null | undefined): StempelZustand {
  if (!s || s.ende) return "aus";
  return s.pausen.some((p) => !p.ende) ? "pause" : "laeuft";
}

export function laufendePause(s: Pick<ZeitSchicht, "pausen"> | null | undefined): ZeitPause | null {
  return s?.pausen.find((p) => !p.ende) ?? null;
}

// „8:42“ – Stunden und Minuten.
export function dauerText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / MIN);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

// „3:17:42“ – mit Sekunden, für die laufende Uhr.
export function uhrText(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function zweistellig(n: number) { return String(n).padStart(2, "0"); }

// Der Kalendertag in der Uhr des Geräts (gemeint ist die Wand in Nürnberg).
export function tagVon(datum: Date): string {
  return `${datum.getFullYear()}-${zweistellig(datum.getMonth() + 1)}-${zweistellig(datum.getDate())}`;
}
export function tagSchluessel(iso: string): string {
  return tagVon(new Date(iso));
}
export function uhrzeitVon(iso: string): string {
  const d = new Date(iso);
  return `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;
}

// Der Montag der Woche als JJJJ-MM-TT.
export function wochenMontag(tag: string): string {
  const d = new Date(`${tag}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return tagVon(d);
}
export function tagPlus(tag: string, tage: number): string {
  const d = new Date(`${tag}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return tagVon(d);
}
export function wochenTage(montag: string): string[] {
  return Array.from({ length: 7 }, (_, i) => tagPlus(montag, i));
}
// Die Grenzen für die Abfrage: Montag 00:00 bis Montag darauf 00:00, in der Uhr des Geräts.
export function wocheVonBis(montag: string): { von: string; bis: string } {
  return { von: new Date(`${montag}T00:00:00`).toISOString(), bis: new Date(`${tagPlus(montag, 7)}T00:00:00`).toISOString() };
}
// ISO-Kalenderwoche.
export function kalenderwoche(tag: string): number {
  const d = new Date(`${tag}T12:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const erste = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - erste.getTime()) / 86_400_000 - 3 + ((erste.getDay() + 6) % 7)) / 7);
}
export function wochenTitel(montag: string): string {
  const s = new Date(`${montag}T12:00:00`), e = new Date(`${tagPlus(montag, 6)}T12:00:00`);
  return `KW ${kalenderwoche(montag)} · ${s.getDate()}.${s.getMonth() !== e.getMonth() ? `${s.getMonth() + 1}.` : ""}–${e.getDate()}.${e.getMonth() + 1}.`;
}
export function tagTitel(tag: string): string {
  return datumKurz(tag);
}

// Fehlt die Mindestpause? Nach der Arbeitszeit des TAGES, nicht je Schicht.
export function pauseZuKurz(arbeitMinuten: number, pauseMinuten: number): boolean {
  const regel = ZEIT_PAUSE_REGELN.find((r) => arbeitMinuten > r.abMinuten);
  return !!regel && pauseMinuten < regel.pauseMinuten;
}

export type TagAuswertung = {
  tag: string;
  arbeitMs: number;
  pauseMs: number;
  schichten: ZeitSchicht[];
  laeuft: boolean;
  hinweise: TagHinweis[];
};

export function tagAuswerten(schichten: ZeitSchicht[], tag: string, heute: string, jetzt: number): TagAuswertung {
  const liste = schichten.filter((s) => tagSchluessel(s.beginn) === tag).sort((a, b) => a.beginn.localeCompare(b.beginn));
  // Eine vergessene Schicht von einem früheren Tag zählt nicht mit, bis sie korrigiert ist – sonst
  // stünden in der Wochensumme 78 Stunden, die niemand gearbeitet hat.
  const zaehlt = (s: ZeitSchicht) => !!s.ende || tag >= heute;
  const arbeit = liste.filter(zaehlt).reduce((sum, s) => sum + arbeitMs(s, jetzt), 0);
  const pause = liste.filter(zaehlt).reduce((sum, s) => sum + pauseMs(s, jetzt), 0);
  const hinweise: TagHinweis[] = [];
  const offen = liste.some((s) => !s.ende);
  if (offen && tag < heute) hinweise.push("offen");
  if (pauseZuKurz(arbeit / MIN, pause / MIN) && !(offen && tag === heute)) hinweise.push("pause");
  if (arbeit / MIN > ZEIT_TAG_MAX_MINUTEN) hinweise.push("lang");
  if (liste.some((s) => s.korrigiert_am)) hinweise.push("korrigiert");
  return { tag, arbeitMs: arbeit, pauseMs: pause, schichten: liste, laeuft: offen && tag === heute, hinweise };
}

export type WochenAuswertung = { tage: TagAuswertung[]; arbeitMs: number; pauseMs: number; arbeitstage: number };

export function wocheAuswerten(schichten: ZeitSchicht[], montag: string, heute: string, jetzt: number): WochenAuswertung {
  const tage = wochenTage(montag).map((tag) => tagAuswerten(schichten, tag, heute, jetzt));
  return {
    tage,
    arbeitMs: tage.reduce((s, x) => s + x.arbeitMs, 0),
    pauseMs: tage.reduce((s, x) => s + x.pauseMs, 0),
    arbeitstage: tage.filter((x) => x.schichten.length > 0).length,
  };
}

// Die Wochentabelle aller: je Person eine Zeile. Wer eine Schicht hat, aber (nicht mehr) in der
// Personenliste steht, erscheint trotzdem – sonst fehlten Stunden in der Summe.
export function personenWoche(
  schichten: ZeitSchicht[], personen: ZeitPerson[], montag: string, heute: string, jetzt: number
): { person: ZeitPerson; woche: WochenAuswertung }[] {
  const bekannt = new Map(personen.map((p) => [p.id, p]));
  for (const s of schichten) if (!bekannt.has(s.profile_id)) bekannt.set(s.profile_id, { id: s.profile_id, name: "Ehemaliger Zugang", rolle: "" });
  return Array.from(bekannt.values())
    .map((person) => ({ person, woche: wocheAuswerten(schichten.filter((s) => s.profile_id === person.id), montag, heute, jetzt) }))
    .sort((a, b) => a.person.name.localeCompare(b.person.name, "de"));
}

// Schichten, die an einem früheren Tag begonnen haben und noch offen sind: vergessenes Ausstempeln.
export function offeneSchichten(schichten: ZeitSchicht[], heute: string): ZeitSchicht[] {
  return schichten.filter((s) => !s.ende && tagSchluessel(s.beginn) < heute);
}

// ---------------------------------------------------------------------------------------------
// Korrektur-Formular: Uhrzeiten eines Tages → Zeitpunkte
// ---------------------------------------------------------------------------------------------

export type SchichtFormular = { tag: string; beginn: string; ende: string; pausen: { von: string; bis: string }[] };
export type SchichtZeiten = { beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[] };

const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;

// Ein Zeitpunkt am Tag der Schicht; liegt er vor dem Beginn, ist der Folgetag gemeint (Nachtschicht).
function zeitpunkt(tag: string, uhr: string, nichtVor?: number): number {
  let ms = new Date(`${tag}T${uhr}:00`).getTime();
  if (nichtVor !== undefined && ms < nichtVor) ms = new Date(`${tagPlus(tag, 1)}T${uhr}:00`).getTime();
  return ms;
}

export function schichtAusFormular(f: SchichtFormular): { zeiten: SchichtZeiten | null; fehler: string | null } {
  if (!UHR.test(f.beginn)) return { zeiten: null, fehler: "Bitte den Beginn als Uhrzeit angeben (z. B. 07:15)." };
  if (f.ende && !UHR.test(f.ende)) return { zeiten: null, fehler: "Bitte das Ende als Uhrzeit angeben – oder leer lassen, wenn die Schicht noch läuft." };
  if (f.ende && f.ende === f.beginn) return { zeiten: null, fehler: "Beginn und Ende sind gleich." };
  const b = zeitpunkt(f.tag, f.beginn);
  const e = f.ende ? zeitpunkt(f.tag, f.ende, b + 1) : null;
  if (e !== null && e - b > 24 * 60 * MIN) return { zeiten: null, fehler: "Eine Schicht kann nicht länger als 24 Stunden sein." };
  const pausen: { beginn: string; ende: string }[] = [];
  for (const p of f.pausen) {
    if (!p.von && !p.bis) continue;
    if (!UHR.test(p.von) || !UHR.test(p.bis)) return { zeiten: null, fehler: "Jede Pause braucht „von“ und „bis“ als Uhrzeit." };
    const pb = zeitpunkt(f.tag, p.von, b);
    const pe = zeitpunkt(f.tag, p.bis, pb + 1);
    if (pb < b || (e !== null && pe > e)) return { zeiten: null, fehler: "Eine Pause liegt außerhalb der Schicht." };
    pausen.push({ beginn: new Date(pb).toISOString(), ende: new Date(pe).toISOString() });
  }
  pausen.sort((x, y) => x.beginn.localeCompare(y.beginn));
  for (let i = 1; i < pausen.length; i++) {
    if (pausen[i].beginn < pausen[i - 1].ende) return { zeiten: null, fehler: "Zwei Pausen überschneiden sich." };
  }
  return { zeiten: { beginn: new Date(b).toISOString(), ende: e === null ? null : new Date(e).toISOString(), pausen }, fehler: null };
}

export function formularAusSchicht(s: ZeitSchicht | null, tag: string): SchichtFormular {
  if (!s) return { tag, beginn: "", ende: "", pausen: [] };
  return {
    tag: tagSchluessel(s.beginn),
    beginn: uhrzeitVon(s.beginn),
    ende: s.ende ? uhrzeitVon(s.ende) : "",
    pausen: s.pausen.filter((p) => p.ende).map((p) => ({ von: uhrzeitVon(p.beginn), bis: uhrzeitVon(p.ende as string) })),
  };
}

// „07:15 – 15:55“ bzw. „07:15 – jetzt“.
export function schichtSpanne(s: Pick<ZeitSchicht, "beginn" | "ende">): string {
  return `${uhrzeitVon(s.beginn)} – ${s.ende ? uhrzeitVon(s.ende) : "jetzt"}`;
}

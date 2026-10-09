import type { OrderStatus } from "./types";
import { STANDARD_DAUER_MIN, STEMPEL_PARAMETER } from "./constants";
import { minutenAusUhrzeit } from "./helpers";
import type { PushInhalt } from "./pushInhalt";

// Die Stempel-Erinnerung (Migration 85, v138, Wunsch Vitali 09.10.2026) – die Regeln ohne Datenbank,
// geprüft in tests/stempelErinnerung.test.ts. Versand im Minutentakt: lib/stempelErinnerungVersand.ts.
//
//   EIN – 30 Minuten vor dem ersten eigenen Termin des Tages „Einstempeln nicht vergessen“, wenn
//         die Person nicht eingestempelt ist.
//   AUS – 30 Minuten nach dem geplanten Ende des letzten eigenen Termins „Ausstempeln vergessen?“,
//         wenn sie noch eingestempelt ist UND dieser letzte Auftrag nicht erledigt ist. Ist er
//         erledigt, hat die App beim Abschließen schon „Für heute fertig?“ gefragt – wer „Noch
//         nicht“ sagt, arbeitet bewusst weiter und wird nicht erinnert.
//
// Gezählt werden die Termine mit Uhrzeit, die nicht storniert sind. Ohne Endzeit gilt
// STANDARD_DAUER_MIN wie im Kalender. Jede Art höchstens einmal am Tag (`push_stempel_erinnerung`).

// So viele Minuten vor dem ersten bzw. nach dem letzten Termin.
export const STEMPEL_ERINNERUNG_MINUTEN = 30;
// So lange nach dem fälligen Zeitpunkt wird eine verpasste Erinnerung noch nachgeholt (fällt ein
// Minutenlauf aus). Danach ist Schweigen besser als eine Meldung zur falschen Zeit.
export const STEMPEL_ERINNERUNG_NACHHOLEN_MIN = 60;

export type StempelArt = "ein" | "aus";

export type StempelTermin = { profileId: string; time: string | null; end_time: string | null; status: OrderStatus };

export type StempelErinnerung = { profileId: string; art: StempelArt; uhrzeit: string };

function hhmm(minuten: number): string {
  const m = ((minuten % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Erster Beginn und letztes Ende je Person, dazu ob der letzte erledigt ist.
export function stempelTage(termine: StempelTermin[]): Map<string, { beginn: number; ende: number; letzterErledigt: boolean }> {
  const tage = new Map<string, { beginn: number; ende: number; letzterErledigt: boolean }>();
  for (const x of termine) {
    if (x.status === "storniert") continue;
    const beginn = minutenAusUhrzeit(x.time);
    if (beginn === null) continue;
    const endeAngabe = minutenAusUhrzeit(x.end_time);
    const ende = endeAngabe !== null && endeAngabe > beginn ? endeAngabe : beginn + STANDARD_DAUER_MIN;
    const alt = tage.get(x.profileId);
    if (!alt) { tage.set(x.profileId, { beginn, ende, letzterErledigt: x.status === "erledigt" }); continue; }
    alt.beginn = Math.min(alt.beginn, beginn);
    // Gleich spätes Ende: „erledigt“ nur, wenn alle mit diesem Ende erledigt sind.
    if (ende > alt.ende) { alt.ende = ende; alt.letzterErledigt = x.status === "erledigt"; }
    else if (ende === alt.ende) alt.letzterErledigt = alt.letzterErledigt && x.status === "erledigt";
  }
  return tage;
}

// Welche Erinnerungen sind JETZT fällig? `eingestempelt` = Personen mit offener Schicht. Ohne
// `eingestempelt` (null) nur die Frage, ob überhaupt etwas im Fenster liegt – der Versand spart
// sich dann die Abfrage der Schichten.
export function stempelErinnerungenFaellig(
  termine: StempelTermin[], jetztMinuten: number, eingestempelt: Set<string> | null
): StempelErinnerung[] {
  const ergebnis: StempelErinnerung[] = [];
  for (const [profileId, tag] of stempelTage(termine)) {
    const ein = tag.beginn - STEMPEL_ERINNERUNG_MINUTEN;
    if (jetztMinuten >= ein && jetztMinuten < tag.beginn && (!eingestempelt || !eingestempelt.has(profileId))) {
      ergebnis.push({ profileId, art: "ein", uhrzeit: hhmm(tag.beginn) });
    }
    const aus = tag.ende + STEMPEL_ERINNERUNG_MINUTEN;
    if (jetztMinuten >= aus && jetztMinuten < aus + STEMPEL_ERINNERUNG_NACHHOLEN_MIN && !tag.letzterErledigt
        && (!eingestempelt || eingestempelt.has(profileId))) {
      ergebnis.push({ profileId, art: "aus", uhrzeit: hhmm(tag.ende) });
    }
  }
  return ergebnis;
}

// Der Inhalt der Meldung. Antippen öffnet die Stempeluhr (`/?stempeluhr=1`).
export function stempelPushInhalt(e: StempelErinnerung, datum: string): PushInhalt {
  return e.art === "ein"
    ? {
      titel: "Einstempeln nicht vergessen",
      text: `Dein erster Termin heute beginnt um ${e.uhrzeit} – du bist noch nicht eingestempelt.`,
      url: `/?${STEMPEL_PARAMETER}=1`,
      kennung: `stempel-ein-${datum}`,
    }
    : {
      titel: "Ausstempeln vergessen?",
      text: `Dein letzter Termin heute war bis ${e.uhrzeit} geplant – du bist noch eingestempelt. Antippen öffnet die Stempeluhr.`,
      url: `/?${STEMPEL_PARAMETER}=1`,
      kennung: `stempel-aus-${datum}`,
    };
}

import { ERSCHEINUNG } from "./erscheinung";

// Der Inhalt einer Push-Meldung – an EINER Stelle zusammengesetzt, für alle Versandwege
// (Terminerinnerung, Abendhinweis, „Auf dem Handy anrufen", Testnachricht).
//
// WARUM ES DAS GIBT (23.09.2026): Die App heißt auf dem Homescreen „Settings" und trägt ein
// Zahnrad (lib/erscheinung.ts). Die Meldungen trugen trotzdem das PinPoints-Symbol, und die
// Testnachricht den Titel „PinPoints" – ausgerechnet auf dem Sperrbildschirm, der viel
// sichtbarer ist als ein App-Symbol. Der Service Worker (public/sw.js) ist eine statische Datei
// und kann `ERSCHEINUNG` nicht lesen. Also reist das Symbol MIT der Meldung: Der Server kennt
// die Erscheinung, der Service Worker zeigt nur an, was ankommt. Damit hängt die Tarnung
// weiterhin an genau einer Zeile (`GETARNT`), und nichts muss beim Zurückstellen zusätzlich
// bedacht werden.
export type PushInhalt = {
  titel: string;
  text: string;
  // Wohin das Antippen führt, z. B. `/?auftrag=‹id›`.
  url: string;
  // Gleiche Kennung ersetzt eine noch offene Meldung, statt eine zweite daneben zu legen.
  kennung?: string;
};

export function pushNutzlast(inhalt: PushInhalt): string {
  return JSON.stringify({
    ...inhalt,
    symbol: ERSCHEINUNG.symbol192,
  });
}

// Titel für Meldungen, die sonst den Namen der App tragen würden (Testnachricht). Folgt der
// Erscheinung: getarnt „Settings", sonst „PinPoints".
export const PUSH_ABSENDER = ERSCHEINUNG.kurzname;

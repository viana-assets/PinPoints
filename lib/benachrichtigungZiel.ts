"use client";

// Übergabe zwischen Service Worker und Anwendung: Wohin soll eine angetippte Benachrichtigung
// führen? (docs/benachrichtigungen-plan.md, Teil 5)
//
// Warum ein Umweg über den Zwischenspeicher nötig ist: Der Service Worker kann das laufende
// Fenster nicht zuverlässig irgendwohin schicken.
//   * `client.navigate()` bewirkt in der installierten App auf iOS nichts – ohne Fehler.
//   * `client.postMessage()` funktioniert grundsätzlich, kommt aber nicht an, wenn die App im
//     Hintergrund eingefroren war und die Nachricht verworfen wurde.
// Deshalb legt der Service Worker das Ziel zusätzlich in der Cache Storage ab – dem einzigen
// Speicher, den beide Seiten sicher erreichen. Die Anwendung sieht dort nach, sobald sie
// sichtbar wird, und holt das Ziel ab. Kommt die Nachricht doch an, ist das Ziel schon
// abgeholt und der zweite Weg läuft ins Leere: Wer zuerst kommt, gewinnt.
//
// Diese drei Namen stehen wortgleich in public/sw.js. Ein Service Worker ist ein eigenständiges
// Skript und kann dieses Modul nicht einbinden – wer hier etwas ändert, muss es dort mitändern.
export const ZIEL_SPEICHER = "pinpoints-ziel";
export const ZIEL_SCHLUESSEL = "/__benachrichtigung-ziel";
export const PROTOKOLL_SCHLUESSEL = "/__benachrichtigung-protokoll";

// Wie lange ein hinterlegtes Ziel gilt. Wer die Meldung antippt und das Handy dann weglegt,
// soll nicht Stunden später beim nächsten Öffnen in einem alten Auftrag landen.
const HOECHSTALTER_MS = 5 * 60 * 1000;

type Eintrag = { url: string; zeit: number };

async function lesen(schluessel: string): Promise<Eintrag | null> {
  if (typeof caches === "undefined") return null;
  try {
    const speicher = await caches.open(ZIEL_SPEICHER);
    const antwort = await speicher.match(schluessel);
    if (!antwort) return null;
    const eintrag = (await antwort.json()) as Eintrag;
    return typeof eintrag?.url === "string" ? eintrag : null;
  } catch {
    return null;
  }
}

/** Holt ein hinterlegtes Ziel ab und entfernt es. Null, wenn keins da oder zu alt. */
export async function zielAbholen(): Promise<string | null> {
  const eintrag = await lesen(ZIEL_SCHLUESSEL);
  if (!eintrag) return null;
  try {
    const speicher = await caches.open(ZIEL_SPEICHER);
    await speicher.delete(ZIEL_SCHLUESSEL);
  } catch {
    // Bleibt der Eintrag liegen, verfällt er spätestens über sein Alter.
  }
  if (Date.now() - eintrag.zeit > HOECHSTALTER_MS) return null;
  return eintrag.url;
}

/**
 * Wann wurde zuletzt eine Benachrichtigung angetippt, und wohin sollte es gehen? Wird nie
 * gelöscht und in den Einstellungen angezeigt. Grund: Ohne diese Angabe lässt sich die Frage
 * „hat der Service Worker das Antippen überhaupt mitbekommen?" auf einem iPhone nicht
 * beantworten – dort gibt es keine Entwicklerkonsole, und ein stiller Fehlschlag sieht genauso
 * aus wie ein nicht ausgelöstes Ereignis.
 */
export async function letztesAntippen(): Promise<Eintrag | null> {
  return lesen(PROTOKOLL_SCHLUESSEL);
}

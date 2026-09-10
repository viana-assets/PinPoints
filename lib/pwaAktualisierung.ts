"use client";

// Aktualisierung der installierten App – die unsichtbarste Mechanik im ganzen Projekt.
//
// Der Befund vom 10.09.2026: Auf dem iPhone lief tagelang eine alte Fassung. Kein Balken
// „Neue Version verfügbar", keine neuen Reiter, keine Benachrichtigungen – und nirgends ein
// Fehler. Drei Ursachen kamen zusammen, alle drei still:
//
//   1. Eine installierte App auf iOS wird nie geschlossen, sondern weggelegt und
//      hervorgeholt. Ohne echten Seitenaufruf prüft der Browser gar nicht erst, ob es eine
//      neue Fassung gibt.
//   2. Selbst wenn er prüft, darf er die Datei `sw.js` aus seinem eigenen HTTP-Speicher
//      beantworten – dann vergleicht er die alte Fassung mit sich selbst und findet
//      erwartungsgemäß nichts Neues. Dagegen hilft `updateViaCache: "none"` hier und ein
//      `Cache-Control: no-store` für `/sw.js` in next.config.mjs.
//   3. Schlägt ein Teil der Installation fehl, wird die neue Fassung verworfen und die alte
//      läuft weiter – ebenfalls lautlos (siehe public/sw.js, `install`).
//
// Deshalb: aktiv nachfragen, statt auf den Browser zu hoffen.

export type FassungsPruefung = "neu-bereit" | "aktuell" | "kein-service-worker";

function unterstuetzt(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Fragt den laufenden Service Worker, welche Fassung er ist. `null` heißt entweder „keiner
 * aktiv" oder „eine Fassung, die diese Frage noch nicht kennt" (bis einschließlich v4) – für
 * die Fehlersuche ist beides dieselbe Auskunft: der Stand ist nicht der aktuelle.
 */
export async function fassungAbfragen(): Promise<string | null> {
  if (!unterstuetzt()) return null;
  const steuerung = navigator.serviceWorker.controller;
  if (!steuerung) return null;

  return new Promise((antworten) => {
    const kanal = new MessageChannel();
    // Ohne Zeitgrenze bliebe das Versprechen bei einer alten Fassung für immer offen, und die
    // Anzeige stünde ewig auf „wird geprüft".
    const uhr = setTimeout(() => antworten(null), 1500);
    kanal.port1.onmessage = (e) => {
      clearTimeout(uhr);
      antworten(typeof e.data === "string" ? e.data : null);
    };
    try {
      steuerung.postMessage("WELCHE_FASSUNG", [kanal.port2]);
    } catch {
      clearTimeout(uhr);
      antworten(null);
    }
  });
}

/**
 * Sucht aktiv nach einer neuen Fassung. Gibt zurück, ob eine bereitliegt – der Aufrufer
 * entscheidet, ob er das als Balken zeigt oder als Antwort auf einen Knopfdruck.
 */
export async function nachNeuerFassungSuchen(): Promise<FassungsPruefung> {
  if (!unterstuetzt()) return "kein-service-worker";
  try {
    const anmeldung = await navigator.serviceWorker.getRegistration();
    if (!anmeldung) return "kein-service-worker";
    // `update()` holt sw.js neu und stößt bei Unterschieden die Installation an. Das kann ein
    // paar Sekunden dauern – deshalb danach noch einmal nachsehen, was bereitliegt.
    await anmeldung.update();
    if (anmeldung.waiting) return "neu-bereit";
    if (anmeldung.installing) {
      await new Promise<void>((fertig) => {
        const neue = anmeldung.installing;
        if (!neue) { fertig(); return; }
        const zusehen = () => {
          if (neue.state === "installed" || neue.state === "redundant" || neue.state === "activated") {
            neue.removeEventListener("statechange", zusehen);
            fertig();
          }
        };
        neue.addEventListener("statechange", zusehen);
        setTimeout(fertig, 8000);
      });
    }
    return anmeldung.waiting ? "neu-bereit" : "aktuell";
  } catch {
    return "kein-service-worker";
  }
}

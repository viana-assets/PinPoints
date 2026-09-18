// Wie die Anwendung von AUSSEN heißt und aussieht: auf dem Homescreen des Handys, im
// Installationsdialog und in der App-Übersicht. INNEN ändert sich davon nichts – Kopfzeile,
// Marke, Favicon und jeder Text in der Anwendung bleiben „Viana PinPoints".
//
// Warum (18.09.2026): Die App liegt auf einem auch privat genutzten Telefon. Wer darüberschaut
// oder es kurz in die Hand nimmt, soll nicht sehen, dass dort ein Betrieb mitläuft – und erst
// recht nicht neugierig hineintippen.
//
// Das ist SICHTSCHUTZ, keine Sicherheitsmaßnahme. Wer die App öffnet, steht weiterhin vor der
// Anmeldung, und die Daten schützt die Row-Level-Security in der Datenbank. Ein unauffälliges
// Symbol ersetzt kein Recht – es erspart nur die Frage „was ist das denn?".
//
// ZURÜCKSTELLEN, wenn das Projekt etabliert ist: `GETARNT` auf `false` setzen. Sonst nichts.
// Beide Erscheinungen stehen vollständig nebeneinander, die ursprünglichen Symbole liegen
// unverändert in `public/icons/`. „Ich weiß schon noch, wie es vorher war" ist keine Zusage,
// die ein halbes Jahr hält; eine Zeile im Code schon.
export const GETARNT = true;

export type Erscheinung = {
  // Vollständiger Name im Installationsdialog und in der App-Liste (Android).
  name: string;
  // Kurzname unter dem Symbol, wenn der Platz knapp ist.
  kurzname: string;
  // Was iOS unter das Symbol schreibt. Wird NICHT aus dem Manifest gelesen – Apple verlangt
  // dafür eine eigene Angabe, deshalb steht sie hier getrennt.
  appleTitel: string;
  beschreibung: string;
  symbol192: string;
  symbol512: string;
  symbolMaskable512: string;
  appleSymbol: string;
};

const ECHT: Erscheinung = {
  name: "Viana PinPoints",
  kurzname: "PinPoints",
  appleTitel: "PinPoints",
  beschreibung: "Kunden, Termine und Aufträge im mobilen Reifenservice",
  symbol192: "/icons/icon-192.png",
  symbol512: "/icons/icon-512.png",
  symbolMaskable512: "/icons/icon-maskable-512.png",
  appleSymbol: "/apple-touch-icon.png",
};

// „Settings" und ein Zahnrad: das Unauffälligste, was auf einem Telefon liegen kann. Bewusst
// KEIN Nachbau des Apple-Symbols – ein eigenes, schlichtes Zahnrad reicht für den Zweck und
// borgt sich keine fremde Bildmarke.
const TARNUNG: Erscheinung = {
  name: "Settings",
  kurzname: "Settings",
  appleTitel: "Settings",
  beschreibung: "Einstellungen",
  symbol192: "/icons/settings-192.png",
  symbol512: "/icons/settings-512.png",
  symbolMaskable512: "/icons/settings-maskable-512.png",
  appleSymbol: "/icons/settings-180.png",
};

export const ERSCHEINUNG: Erscheinung = GETARNT ? TARNUNG : ECHT;

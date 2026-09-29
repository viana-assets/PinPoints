// Wie die Anwendung von AUSSEN heißt und aussieht: auf dem Homescreen des Handys, im
// Installationsdialog und in der App-Übersicht.
//
// Seit v88 (29.09.2026): Die App heißt „MR Assistent" und trägt das Signet des Mobilen
// Reifenservice (petrolfarbener Kreis mit Auto, `public/icons/mr-*`). Innen steht die Marke
// „Mobiler Reifenservice". Die Tarnung als „Settings" ist aufgehoben (Wunsch vom 29.09.2026) –
// die Beschreibung unten bleibt als Begründung, falls sie je wieder gebraucht wird.
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
export const GETARNT = false;

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

// Neue Dateinamen statt die alten zu überschreiben: Handys halten ein Symbol unter derselben
// Adresse hartnäckig fest. Die alten Viana-Symbole (`icon-*`, `apple-touch-icon.png`) bleiben
// liegen und werden nicht mehr verwendet.
const ECHT: Erscheinung = {
  name: "MR Assistent",
  kurzname: "MR Assistent",
  appleTitel: "MR Assistent",
  beschreibung: "Mobiler Reifenservice – Kunden, Termine, Aufträge und Lager",
  symbol192: "/icons/mr-192.png",
  symbol512: "/icons/mr-512.png",
  symbolMaskable512: "/icons/mr-maskable-512.png",
  appleSymbol: "/icons/mr-apple-180.png",
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

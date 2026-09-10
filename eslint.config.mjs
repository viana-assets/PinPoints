// ESLint-Einstellungen im „Flat Config"-Format.
//
// Warum diese Datei seit dem Sprung auf Next.js 16 existiert: `next lint` gibt es nicht mehr,
// ESLint wird direkt aufgerufen (`npm run lint` → `eslint .`), und ESLint 9 liest keine
// `.eslintrc.json` mehr. Die alte Datei ist deshalb entfallen; die Regeln sind dieselben,
// nur in der neuen Schreibweise – plus die zwei Einstufungen am Ende.
import next from "eslint-config-next";

const einstellungen = [
  {
    // Entspricht dem früheren "ignorePatterns". `supabase/` enthält SQL, kein JavaScript.
    ignores: ["node_modules/**", ".next/**", "supabase/**"],
  },
  ...next,
  {
    rules: {
      // Bilder werden bewusst als <img> eingebunden: die Anwendung liefert keine eigenen
      // Bilddateien aus, für die sich next/image lohnen würde.
      "@next/next/no-img-element": "off",
      // Funktionen dürfen vor ihrer Deklaration benutzt werden (sie werden hochgezogen),
      // Variablen nicht. app/page.tsx lebt von dieser Freiheit: die Ereignis-Effekte stehen
      // oben, die Handler weiter unten.
      "no-use-before-define": ["error", { functions: false, classes: false, variables: true }],

      // ------------------------------------------------------------------
      // Zwei Regeln, die mit eslint-config-next 16 neu dazukamen, stehen hier auf „Hinweis"
      // statt „Fehler". Bewusst nicht abgeschaltet: Sie sollen sichtbar bleiben.
      //
      // `set-state-in-effect` trifft in diesem Projekt durchweg denselben, richtigen Fall:
      // einen Wert, den es auf dem Server nicht gibt, nach dem ersten Zeichnen nachtragen
      // (`window.location.origin`, `navigator.onLine`, der Zustand der Push-Anmeldung). Als
      // Fehler behandelt würde die Regel dazu verleiten, den Wert direkt beim Zeichnen zu
      // lesen – und genau das bricht das Vorberechnen der Seite.
      //
      // `refs` trifft das Muster „immer der neueste Rückruf in einer Referenz"
      // (QrScanner, Karten-Popups in app/page.tsx). Es ist dort Absicht und in den
      // betreffenden Dateien begründet: ohne es startet die Kamera bei jedem Neuzeichnen neu.
      //
      // Neue Treffer bitte einzeln ansehen, statt sie als Rauschen zu übergehen.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default einstellungen;

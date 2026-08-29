// Nav-/UI-Icons als saubere Linien-SVGs (siehe docs/design-system.md) – ausgelagert aus
// app/page.tsx als erster Schritt von docs/roadmap.md Phase 2 (Aufteilen des Monolithen in
// eigene Dateien). Reine, zustandslose Komponenten ohne Abhängigkeit zu HomePage-State,
// deshalb risikolos verschiebbar.


export function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M6 19v-8M12 19V6M18 19v-5" strokeLinecap="round" />
    </svg>
  );
}
export function IconKunden() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}
export function IconTermine() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="5" width="16" height="15" rx="4" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}
export function IconModule() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}
export function IconNeu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconInaktiv() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 8l8 8" />
    </svg>
  );
}
export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z" />
    </svg>
  );
}
export function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function IconLager() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 9 12 3l9 6v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
    </svg>
  );
}
export function IconAuftraege() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M14 5 7 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconMore() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
export function IconEinsatzplanung() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="4.5" width="18" height="16" rx="2" strokeLinejoin="round" />
      <path d="M3 9.5h18M8 3v3M16 3v3" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconArtikel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M11 3H5a1 1 0 0 0-1 1v6l10 10 7-7L11 3Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
// Navigations-Button (Auftrag/Termin): ein Standort-Pin statt eines dünnen Linien-Icons wie die
// übrigen Icons hier – er bleibt auch klein sofort als "Navigation/Karte" erkennbar und sieht,
// anders als das früher genutzte Kompass-Emoji, auf jedem Betriebssystem gleich aus.
//
// Farbe aus der eigenen Palette (--accent), NICHT die Markenfarben von Google Maps: der Button
// öffnet wahlweise Google Maps oder Apple Karten, ein fremdes Bildzeichen wäre hier weder
// zutreffend noch zulässig.
//
// BEWUSST OHNE `<defs>`, ohne Verlauf und ohne jede ID: dieses Icon war schon zweimal unsichtbar,
// beide Male wegen einer internen SVG-Referenz. Erst über ein `clipPath`, dessen ID aus useId()
// stammte und Doppelpunkte enthielt (`url(#:r5:)` lösen Browser nicht auf), dann über einen
// Farbverlauf mit demselben Verweismuster. Ein ungültiger Verweis führt in SVG dazu, dass das
// Element GAR NICHT gezeichnet wird – und ein weißer Punkt auf hellem Grund fällt niemandem als
// Fehler auf, er sieht einfach aus wie nichts. Zwei einfache Formen mit fester Farbe können
// nicht fehlschlagen. Wer hier später einen Verlauf will: erst prüfen, ob er wirklich ankommt.
//
// Die Maße stehen zusätzlich als Attribute am Element, damit der Pin auch dann eine sinnvolle
// Größe hat, wenn die CSS-Regel dazu einmal nicht greift.
export function IconNavPin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"
        fill="#FF5A1F"
      />
      <circle cx="12" cy="9" r="3.05" fill="#fff" />
    </svg>
  );
}
export function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Firmenlogo (Bildmarke) ----------------
   Die echte Bildmarke aus der Logodatei des Unternehmens: das stilisierte blaue „V" mit rotem
   Startpunkt, weißer Route und grünem Zielpunkt mit Haken. Pfade, Verläufe und Filter sind
   unverändert aus `Logos/viana-pinpoints-logo-editable.svg` übernommen – nur die Bezeichner
   haben ein `vp`-Präfix bekommen (siehe unten) und der Ausschnitt zeigt allein das Zeichen,
   ohne Wortmarke.

   Warum ohne Wortmarke: „VIANA PINPOINTS" mit der Zeile „PLAN • TRACK • COMPLETE" ist für
   1400 px Breite gezeichnet. In der 232 px schmalen Navigationsspalte wäre die Zeile keine
   4 px hoch und damit unlesbarer Schmutz. Der Schriftzug steht an den Stellen, wo Platz ist,
   ohnehin als echter Text daneben (`<h1>`), in der Hausschrift und suchbar. Das vollständige
   Logo bleibt für Druck, Signaturen und Ähnliches in `Logos/`.

   Warum inline und nicht als Datei unter `public/`: das Projekt hat kein `public/`-Verzeichnis,
   Dateien werden einzeln über die GitHub-Oberfläche hochgeladen, und aus derselben Quelle
   lassen sich hier beliebige Ausschnitte zeigen, was mit einem `<img>` nicht ginge.

   ZU DEN BEZEICHNERN: `docs/design-system.md` verlangt bei Icons feste Farben ohne `<defs>`,
   IDs und `url(#…)`. Hier ist bewusst eine Ausnahme, und der Unterschied ist wichtig: der
   damalige Fehlschlag lag an IDs aus `useId()`, die Doppelpunkte enthielten (`url(#:r5:)` löst
   kein Browser auf). Feste, selbst geschriebene Bezeichner funktionieren. Sie stehen hier auch
   nicht zur Wahl – die Verläufe SIND das Logo, eine einfarbige Nachbildung wäre ein anderes
   Zeichen. Kommt die Marke zweimal gleichzeitig ins Dokument (Seitenleiste und Kopfzeile), sind
   die Bezeichner doppelt vergeben; Browser nehmen dann den ersten, und da beide identisch sind,
   ändert das am Bild nichts.

   Keine width/height am Element: die Größe kommt aus dem CSS der jeweiligen Stelle – dort
   ausdrücklich in Breite UND Höhe, mit `flex:0 0 auto`, sonst quetscht der Flex-Container das
   SVG auf Breite 0 (siehe design-system.md). Seitenverhältnis des Ausschnitts: 314 : 396. */
export function IconMarke() {
  return (
    <svg viewBox="40 14 314 396" fill="none" role="img" aria-label="Viana PinPoints">
      <defs>
        <linearGradient id="vpVLinks" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#1DC8FF" /><stop offset="1" stopColor="#0055FF" />
        </linearGradient>
        <linearGradient id="vpVRechts" x1="0" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.50" stopColor="#7CC6EE" /><stop offset="1" stopColor="#0A2545" />
        </linearGradient>
        <linearGradient id="vpPinRot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF3344" /><stop offset="1" stopColor="#B00020" />
        </linearGradient>
        <linearGradient id="vpPinGruen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34D058" /><stop offset="1" stopColor="#16A34A" />
        </linearGradient>
        <filter id="vpRouteGlow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="vpPinGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="12" result="b" />
          <feFlood floodColor="#FF3344" floodOpacity=".28" />
          <feComposite in2="b" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g transform="translate(24 26)">
        <path d="M46 120 Q38 103 57 95 L101 95 Q114 95 121 110 L191 279 L162 338 Q153 356 140 338 Z" fill="url(#vpVLinks)" />
        <path d="M140 338 Q132 349 123 333 L101 279 L206 109 Q215 95 230 95 L274 95 Q293 102 284 120 L174 338 Q157 365 140 338 Z" fill="url(#vpVRechts)" />
        <g filter="url(#vpPinGlow)">
          <path d="M159 8 C112 8 84 43 84 84 C84 137 159 213 159 213 C159 213 234 137 234 84 C234 43 206 8 159 8 Z" fill="url(#vpPinRot)" />
          <circle cx="159" cy="81" r="25" fill="#FFFFFF" />
        </g>
        <path
          d="M158 181 C151 226 104 227 91 269 C78 310 112 328 151 321 C193 313 198 272 231 258"
          fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"
          filter="url(#vpRouteGlow)" opacity=".95"
        />
        <circle cx="112" cy="320" r="6" fill="#7DD3FC" />
        <circle cx="129" cy="323" r="5" fill="#38BDF8" />
        <circle cx="145" cy="321" r="4" fill="#0EA5E9" />
        <g transform="translate(191 153)">
          <path d="M58 0 C23 0 0 26 0 59 C0 98 58 152 58 152 C58 152 116 98 116 59 C116 26 93 0 58 0 Z" fill="url(#vpPinGruen)" />
          <path d="M31 58 L48 75 L84 37" fill="none" stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

// Favicon: die vollständige Marke wäre bei 16 px Breite nicht mehr zu erkennen – das „V" mit
// zwei Pins darauf ergibt dort Matsch. Im Browser-Tab steht deshalb nur der grüne Zielpunkt mit
// Haken, das unterscheidbarste Element. Bewusst als eigene, einfache Form: ein `data:`-URI kann
// keine Verläufe aus einem React-Baum beziehen, und bei 16 px sieht man ohnehin keinen.
const MARKE_PIN_PFAD = "M9 0C4.03 0 0 4.03 0 9c0 6.6 9 17 9 17s9-10.4 9-17c0-4.97-4.03-9-9-9Z";
const MARKE_HAKEN_PFAD = "M4.9 9.1 7.7 11.9 13.1 6.3";
export const MARKE_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E" +
  "%3Cg transform='translate(4 0)'%3E" +
  `%3Cpath d='${MARKE_PIN_PFAD}' fill='%231E9B6E'/%3E` +
  `%3Cpath d='${MARKE_HAKEN_PFAD}' fill='none' stroke='%23ffffff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E` +
  "%3C/g%3E%3C/svg%3E";

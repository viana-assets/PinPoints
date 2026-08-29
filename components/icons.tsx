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
   Die Bildmarke aus dem Viana-PinPoints-Logo: roter Startpunkt, blauer Pfeil, grüner
   Zielpunkt mit Haken – also "PLAN • TRACK • COMPLETE" als Bild. Sie ersetzt die frühere
   Flagge an allen vier Stellen (Seitenleiste, Handy-Kopfzeile, Login, Passwort-Setzen).

   Warum keine Bilddatei in public/: das Projekt kommt ohne public/ aus, und Dateien werden
   einzeln über die GitHub-Oberfläche hochgeladen. Ein Inline-SVG bleibt Teil des Quelltexts,
   skaliert verlustfrei und spart eine zusätzliche Netzwerkanfrage.

   Bewusst ohne <defs>, ohne IDs und ohne url(#…)-Verweise, mit festen Farb-Attributen – siehe
   den Kommentar bei IconNavPin und docs/design-system.md. Der Farbverlauf aus dem
   Original-Logo entfällt deshalb; er wäre bei 26–56 px ohnehin nicht zu erkennen.

   Keine width/height am Element: die Größe kommt an jeder Stelle aus dem CSS. Dort ist sie
   jeweils AUSDRÜCKLICH in Breite UND Höhe angegeben und mit flex:0 0 auto geschützt – ein
   SVG in einem Flex-Container wird sonst auf Breite 0 gequetscht und ist unsichtbar. */
export const MARKE_ROT = "#E24C3D";
export const MARKE_BLAU = "#2F6FED";
export const MARKE_GRUEN = "#1E9B6E";

// Ein Kartenpin, 18 breit und 26 hoch, Spitze unten mittig. Beide Pins der Marke benutzen
// dieselbe Form und werden nur verschoben und eingefärbt.
const MARKE_PIN_PFAD = "M9 0C4.03 0 0 4.03 0 9c0 6.6 9 17 9 17s9-10.4 9-17c0-4.97-4.03-9-9-9Z";
const MARKE_HAKEN_PFAD = "M4.9 9.1 7.7 11.9 13.1 6.3";

export function IconMarke() {
  return (
    <svg viewBox="0 0 52 26" fill="none">
      <path d={MARKE_PIN_PFAD} fill={MARKE_ROT} />
      <circle cx="9" cy="9" r="3.7" fill="#ffffff" />
      <path d="M19.8 3.6 34 9 19.8 14.4 23.8 9Z" fill={MARKE_BLAU} />
      <g transform="translate(34 0)">
        <path d={MARKE_PIN_PFAD} fill={MARKE_GRUEN} />
        <path d={MARKE_HAKEN_PFAD} stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// Favicon: dieselbe Marke wäre bei 16 px Breite nicht mehr zu erkennen (zwei Pins nebeneinander
// ergeben dort Matsch). Deshalb steht im Browser-Tab nur der grüne Zielpunkt mit Haken – das
// unterscheidbarste Element der Marke. Form, Haken und Farbe kommen aus denselben Konstanten
// wie oben, damit es keine zweite Quelle für dasselbe Bild gibt (app/layout.tsx bindet nur ein).
const alsUri = (farbe: string) => "%23" + farbe.slice(1);
export const MARKE_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E" +
  "%3Cg transform='translate(4 0)'%3E" +
  `%3Cpath d='${MARKE_PIN_PFAD}' fill='${alsUri(MARKE_GRUEN)}'/%3E` +
  `%3Cpath d='${MARKE_HAKEN_PFAD}' fill='none' stroke='%23ffffff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E` +
  "%3C/g%3E%3C/svg%3E";

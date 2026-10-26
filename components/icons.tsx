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
// Saisonliste: ein Reifen (Kreis mit Profil) – das Sinnbild des Reifenhotels. Bewusst kein
// Sonne/Schneeflocke-Paar: zwei Motive in 24 Pixeln werden zu Grafikbrei.
export function IconSaison() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" strokeLinecap="round" />
    </svg>
  );
}

// Packliste (v171): Klemmbrett mit zwei abgehakten Zeilen.
export function IconPackliste() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
      <path d="M9.5 3h5v3h-5z" />
      <path d="m8.5 11 1.3 1.3 2.2-2.4M14 11h2M8.5 16l1.3 1.3 2.2-2.4M14 16h2" />
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
// Auswertungen (Block D): drei Säulen unterschiedlicher Höhe. Bewusst NICHT ein Kreisdiagramm
// oder eine Lupe – das Register beantwortet „wie hat es sich entwickelt", und Entwicklung
// zeichnet man als Verlauf.
export function IconAuswertung() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 20h16" strokeLinecap="round" />
      <rect x="6" y="12" width="3.4" height="6" rx="1" />
      <rect x="11.3" y="7" width="3.4" height="11" rx="1" />
      <rect x="16.6" y="10" width="3.4" height="8" rx="1" />
    </svg>
  );
}

// Rechnungen: ein Blatt mit Betragszeilen und einer Summenlinie darunter. Bewusst KEIN
// Geldschein und kein Eurozeichen – das Register führt Belege, nicht Kasse.
export function IconRechnung() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" />
      <path d="M14 3v4h4" strokeLinejoin="round" />
      <path d="M9 11h6M9 14h6M13 17.5h2" strokeLinecap="round" />
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
//
// Form und Farbe stehen als Konstanten daneben. Bis v78 gab es den Pin zusätzlich als
// HTML-Zeichenkette für das Leaflet-Popup (navPinSvgHtml); die Kundenkarte auf der Karte ist
// seit v79 ein React-Bauteil (components/karte/KartenKundeKarte.tsx) und braucht sie nicht mehr.
const NAV_PIN_PFAD = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z";
const NAV_PIN_FARBE = "#FF5A1F";

export function IconNavPin() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <path d={NAV_PIN_PFAD} fill={NAV_PIN_FARBE} />
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
   Seit v88 (29.09.2026) das Signet des Mobilen Reifenservice: der petrolfarbene Kreis mit dem
   Auto aus `Logos/Rechnungslogo/2_petrol_signet.png`. Nur der Kreis, ohne die Reifenspuren
   daneben – als Zeichen in 32 px Höhe muss es rund sein, und die Spuren wären dort Rauschen.
   Die Vorlage ist ein 320-px-Bild; `public/icons/mr-marke.svg` ist daraus nachgezeichnet
   (potrace), damit es auf jedem Bildschirm scharf bleibt. Ein Vektor-Original vom Gestalter
   würde es noch sauberer machen.

   Als Datei und nicht inline: 64 kB Pfaddaten gehören nicht in jede Seite, die Datei kommt
   einmal und liegt danach im Zwischenspeicher. Der Schriftzug steht daneben als echter Text.

   Bis v87 stand hier die Viana-Bildmarke (blaues „V" mit zwei Pins) als Inline-SVG. */
export function IconMarke() {
  return <img className="marke" src="/icons/mr-marke.svg" alt="Mobiler Reifenservice" width={36} height={36} />;
}

// Das Favicon im Browser-Reiter: dasselbe Signet als kleines Bild.
export const MARKE_FAVICON = "/icons/mr-64.png";

// Stempeluhr (Migration 82, v131): Uhr mit Zeiger.
export function IconZeit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 3h6" />
    </svg>
  );
}

// Finance (v145, docs/finance.md). Gleiche Linienstärke wie oben.
// Belege: ein Kassenbon mit gezacktem Unterrand.
export function IconBeleg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 11.5h6M9 15h3" strokeLinecap="round" />
    </svg>
  );
}
// Bank: Giebel mit Säulen.
export function IconBank() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 9.5 12 4l9 5.5H3Z" strokeLinejoin="round" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7M4 20h16" strokeLinecap="round" />
    </svg>
  );
}
// Buchungen: zwei Pfeile gegeneinander – Soll an Haben.
export function IconBuchen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </svg>
  );
}
// System wechseln (v162): zwei Pfeile im Kreis – FSM und Finance.
export function IconWechsel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
    </svg>
  );
}
// Steuern: Prozentzeichen.
export function IconSteuer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M18 6 6 18" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  );
}
// Offene Posten: Blatt mit Uhr.
export function IconOffen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M13 3H6v18h6" strokeLinejoin="round" />
      <circle cx="17" cy="16" r="4.5" />
      <path d="M17 13.8V16l1.5 1M9 8h4M9 11.5h2" strokeLinecap="round" />
    </svg>
  );
}
// Anlagen: ein Würfel – Anlagevermögen.
export function IconAnlage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </svg>
  );
}
// Jahresabschluss: Waage (Aktiva und Passiva im Gleichgewicht).
export function IconAbschluss() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0L5 7ZM19 7l-2.5 6a2.5 2.5 0 0 0 5 0L19 7Z" />
    </svg>
  );
}
// Export: Pfeil aus der Kiste.
export function IconExport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}

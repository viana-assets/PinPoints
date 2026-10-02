// Wo ein aufklappendes Menü steht, wenn die Seite gezoomt ist (html{zoom}, v83).
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

// ---------------------------------------------------------------- Menülage bei Seitenzoom
//
// Ein Menü, das an einem angeklickten Knopf aufgeht (Anrufen, Navigation, Mitarbeiter), steht
// fest (`position:fixed`) und bekommt seine Lage in CSS-Punkten. Der Knopf liefert seine Lage
// aber in BILDSCHIRMpunkten (`getBoundingClientRect`), und seit der Desktop-Skalierung (v83,
// globals.css ganz oben) ist die Seite auf großen Monitoren vergrößert: 1 CSS-Punkt = `zoom`
// Bildschirmpunkte. Ohne das Teilen ging das Menü auf 27 Zoll ein Drittel weiter unten und
// rechts auf, als der Knopf steht.
//
// Reicht der Platz unter dem Knopf nicht, geht das Menü nach oben auf – dieselbe Regel wie
// vorher (`clampMenuTop` in app/page.tsx), nur in einer geprüften Funktion.
export function menuLage(
  knopf: { top: number; bottom: number; left: number },
  menu: { hoehe: number; breite: number },
  fenster: { breite: number; hoehe: number },
  zoom: number
): { top: number; left: number } {
  const z = zoom > 0 ? zoom : 1;
  const rand = 8;
  const hoehe = menu.hoehe * z;
  const breite = menu.breite * z;
  const top = knopf.bottom + 4 + hoehe <= fenster.hoehe - rand
    ? knopf.bottom + 4
    : Math.max(rand, knopf.top - 4 - hoehe);
  const left = Math.max(rand, Math.min(knopf.left, fenster.breite - breite));
  return { top: top / z, left: left / z };
}

// Der aktuelle Seitenzoom aus der CSS-Variable `--z` (globals.css). 1, wenn nichts gesetzt ist
// oder das Dokument fehlt (Server, Tests).
export function seitenZoom(): number {
  if (typeof document === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z"));
  return Number.isFinite(z) && z > 0 ? z : 1;
}

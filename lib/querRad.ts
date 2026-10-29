// Mausrad über einer seitlich scrollenden Leiste (v177): Wer am Rechner über den Filterpillen oder einem Umschalter
// das Rad dreht, scrollt die Leiste zur Seite statt die Seite nach unten – sonst kommt man ohne Touchpad oder
// Umschalttaste nicht an die hinteren Einträge (Bildschirmfoto Vitali 29.10.2026, Termine). Ist die Leiste am Ende
// oder passt sie ganz hinein, scrollt die Seite wie gewohnt weiter. Dazu zeigt app/globals.css einen dünnen Balken
// (Abschnitt „Seitlich scrollende Leisten“, dort dieselbe Liste). Geprüft in tests/querRad.test.ts.

export const QUER_LEISTEN = ".pl-filter, .lg-lagerwahl, .au-filter, .am-reiter, .am-filter, .ad-reiter, .ad-filter";

type Leiste = { scrollLeft: number; scrollWidth: number; clientWidth: number };

// Wie weit die Leiste wandert – 0 heißt: nichts zu tun, die Seite scrollt normal.
export function querSchritt(l: Leiste, deltaX: number, deltaY: number): number {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return 0; // schon seitlich (Touchpad) – das kann der Browser selbst
  const max = l.scrollWidth - l.clientWidth;
  if (max <= 1) return 0;
  if (deltaY > 0 && l.scrollLeft >= max - 1) return 0;
  if (deltaY < 0 && l.scrollLeft <= 0) return 0;
  return deltaY;
}

// Einmal am Dokument; gibt die Abmeldung zurück (für den Effekt in app/page.tsx).
export function querRadAktivieren(doc: Document): () => void {
  const beimRad = (e: WheelEvent) => {
    if (e.ctrlKey) return; // Strg + Rad ist Vergrößern
    const ziel = e.target instanceof Element ? e.target.closest(QUER_LEISTEN) : null;
    if (!(ziel instanceof HTMLElement)) return;
    const schritt = querSchritt(ziel, e.deltaX, e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    if (!schritt) return;
    ziel.scrollLeft += schritt;
    e.preventDefault();
  };
  doc.addEventListener("wheel", beimRad, { passive: false });
  return () => doc.removeEventListener("wheel", beimRad);
}

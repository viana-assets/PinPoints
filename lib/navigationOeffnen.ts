// Karten-App zur Navigation öffnen (v140, gemeldet 09.10.2026).
//
// DAS PROBLEM: In der installierten App auf dem iPhone öffnete „Navigation › Google Maps“ den
// https-Link in einem eingebauten Browserfenster; das reichte an Google Maps weiter. Wer danach
// in unsere App zurückwischte, sah nur dieses Fenster – weiß, mit „Suchbegriff oder Websitenamen
// eingeben“ und ✕. Es sah aus, als ginge die App nicht mehr.
//
// DIE LÖSUNG: Auf iOS die App-Adresse (`comgooglemaps://`, `maps://`) direkt aufrufen – dann gibt es
// kein Browserfenster. Ist Google Maps nicht installiert, passiert dabei nichts; bleibt die Seite
// deshalb sichtbar, kommt nach kurzer Zeit der https-Link als Rückfall (dann eben mit dem Fenster,
// in dem Google Maps im Browser läuft). Auf allen anderen Geräten bleibt es beim https-Link.

// So lange warten, ob die Karten-App übernommen hat, bevor der Rückfall kommt.
export const NAVIGATION_RUECKFALL_MS = 1500;

export function appOderWebOeffnen(app: string | null, web: string, ios: boolean): void {
  if (!ios || !app) {
    window.open(web, "_blank");
    return;
  }
  let verlassen = false;
  const weg = () => { verlassen = true; };
  const sichtbar = () => { if (document.visibilityState === "hidden") verlassen = true; };
  window.addEventListener("pagehide", weg);
  window.addEventListener("blur", weg);
  document.addEventListener("visibilitychange", sichtbar);
  window.location.href = app;
  window.setTimeout(() => {
    window.removeEventListener("pagehide", weg);
    window.removeEventListener("blur", weg);
    document.removeEventListener("visibilitychange", sichtbar);
    if (!verlassen && document.visibilityState === "visible") window.open(web, "_blank");
  }, NAVIGATION_RUECKFALL_MS);
}

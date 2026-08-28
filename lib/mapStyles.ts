// "hell" (CARTO light_all) und "dunkel" (CARTO dark_all) wurden entfernt:
// CARTOs kostenlose Basemap-Kacheln verlangen inzwischen einen API-Key,
// ohne Key erscheint nur noch ein "API KEY REQUIRED"-Wasserzeichen.
export type MapStyleKey = "strasse" | "satellit" | "satellit_labels";

// Kartenmittelpunkt/Zoom beim ersten Laden (Nürnberg-Region) – zentral hier benannt statt
// als literale Zahlen im Karten-Init-Effekt in app/page.tsx (siehe
// docs/konstanten-register.md). Wächst das Geschäft über die Region hinaus, hier anpassen.
export const DEFAULT_MAP_CENTER: [number, number] = [49.4521, 11.0767];
export const DEFAULT_MAP_ZOOM = 12;

export const MAP_STYLES: Record<
  MapStyleKey,
  { label: string; baseUrl: string; baseAttr: string; overlayUrl?: string; overlayAttr?: string }
> = {
  strasse: {
    label: "Straße (Standard)",
    baseUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    baseAttr: "&copy; OpenStreetMap-Mitwirkende",
  },
  satellit: {
    label: "Satellit",
    baseUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    baseAttr: "Esri, Maxar, Earthstar Geographics",
  },
  satellit_labels: {
    label: "Satellit mit Beschriftung",
    baseUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    baseAttr: "Esri, Maxar, Earthstar Geographics",
    overlayUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    overlayAttr: "Esri",
  },
};

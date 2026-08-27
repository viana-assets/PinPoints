// "hell" (CARTO light_all) und "dunkel" (CARTO dark_all) wurden entfernt:
// CARTOs kostenlose Basemap-Kacheln verlangen inzwischen einen API-Key,
// ohne Key erscheint nur noch ein "API KEY REQUIRED"-Wasserzeichen.
export type MapStyleKey = "strasse" | "satellit" | "satellit_labels";

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

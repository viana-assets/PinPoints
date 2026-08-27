export type MapStyleKey = "strasse" | "hell" | "dunkel" | "satellit" | "satellit_labels";

export const MAP_STYLES: Record<
  MapStyleKey,
  { label: string; baseUrl: string; baseAttr: string; overlayUrl?: string; overlayAttr?: string }
> = {
  strasse: {
    label: "Straße (Standard)",
    baseUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    baseAttr: "&copy; OpenStreetMap-Mitwirkende",
  },
  hell: {
    label: "Straße (Hell/Minimal)",
    baseUrl: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    baseAttr: "&copy; OpenStreetMap-Mitwirkende &copy; CARTO",
  },
  dunkel: {
    label: "Straße (Dunkel)",
    baseUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    baseAttr: "&copy; OpenStreetMap-Mitwirkende &copy; CARTO",
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

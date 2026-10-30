"use client";
import { useSyncExternalStore } from "react";
import { istHandy } from "./helpers";

// Sitzt hier ein Rechner? Für Ansichten, die am Rechner anders aussehen als am Handy (v178: der Finance-Arbeitsplatz
// mit Tabelle statt Kartenliste). Dieselbe Weiche wie `amRechner()` in app/page.tsx – die Begründung steht bei
// `istHandy` in lib/helpers.ts (die Medienabfrage nach Maus und Schweben irrte auf dem Arbeitsnotebook).
//
// Auf dem Server und beim ersten Zeichnen im Browser gilt „Handy“ – sonst passte das HTML vom Server nicht (Hydration);
// gleich danach steht die richtige Ansicht. Die Geräteart ändert sich nicht, deshalb gibt es nichts zu abonnieren.
const nichts = () => () => {};
const imBrowser = () => typeof navigator !== "undefined" && !istHandy(navigator.userAgent, navigator.maxTouchPoints || 0);
const aufDemServer = () => false;

export function useAmRechner(): boolean {
  return useSyncExternalStore(nichts, imBrowser, aufDemServer);
}

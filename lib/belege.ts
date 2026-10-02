import type { AuftragBeleg, BelegArt } from "./types";
import { BELEG_ARTEN } from "./constants";

// Foto und Unterschrift am Auftrag (Fahrplan E3, Migration 65) – die Regeln ohne Browser.
// Geprüft in tests/belege.test.ts. Das Verkleinern selbst (Canvas) steht in lib/belegBild.ts.

// Lange Kante nach dem Verkleinern. Ein Handyfoto hat 4000 Pixel und 3–6 MB; mit 1600 Pixeln ist
// ein Profil, eine DOT-Nummer oder ein Kratzer an der Felge noch klar zu erkennen, und die Datei
// hat meist 200–500 kB – wichtig, weil am Straßenrand oft nur Mobilfunk da ist.
export const BELEG_MAX_KANTE_PX = 1600;
export const BELEG_JPEG_QUALITAET = 0.8;

// Die Maße nach dem Verkleinern – nie vergrößern, Seitenverhältnis bleibt.
export function zielMasse(breite: number, hoehe: number, maxKante = BELEG_MAX_KANTE_PX): { breite: number; hoehe: number } {
  const lang = Math.max(breite, hoehe);
  if (lang <= maxKante || lang <= 0) return { breite, hoehe };
  const f = maxKante / lang;
  return { breite: Math.round(breite * f), hoehe: Math.round(hoehe * f) };
}

// Der Pfad im Bucket: erst die Auftrags-Kennung (danach richten sich die Speicher-Richtlinien und die
// Prüfregel `auftrag_belege_pfad_passt`), dann Art, Zeitstempel und eine Zufallskennung.
export function belegPfad(orderId: string, art: BelegArt, zufall: string, zeit: Date, endung: "jpg" | "png"): string {
  const stempel = zeit.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${orderId}/${art}-${stempel}-${zufall}.${endung}`;
}

export type BelegStand = { fotos: number; unterschrift: AuftragBeleg | null };

export function belegStand(belege: AuftragBeleg[]): BelegStand {
  const unterschriften = belege.filter((b) => b.art === "unterschrift").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { fotos: belege.length - unterschriften.length, unterschrift: unterschriften[0] ?? null };
}

// Fotos nach Art gruppiert, in der Reihenfolge vorher → nachher → Schaden, je Gruppe nach Zeit.
export function belegeNachArt(belege: AuftragBeleg[]): { art: BelegArt; belege: AuftragBeleg[] }[] {
  return BELEG_ARTEN.filter((a) => a !== "unterschrift")
    .map((art) => ({ art, belege: belege.filter((b) => b.art === art).sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
    .filter((g) => g.belege.length > 0);
}

// Der Satz unter der Unterschrift – er steht in der App und wird mit ins Bild gezeichnet, damit die
// Unterschrift später nicht ohne den Satz dasteht, unter den sie gesetzt wurde.
export function unterschriftSatz(auftragsNr: string, datum: string): string {
  const [j, m, t] = datum.slice(0, 10).split("-");
  return `Arbeiten zu Auftrag ${auftragsNr} am ${t}.${m}.${j} ausgeführt, Fahrzeug übernommen.`;
}

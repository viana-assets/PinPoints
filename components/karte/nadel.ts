import type { KundenZustand } from "@/lib/helpers";
import type { TerminPhase } from "@/lib/terminAnsicht";
import { buendelGroesse, ringVerlauf, zahlText } from "@/lib/karte";

// Die Nadeln als HTML-Zeichenkette – EINE Quelle für die Karte (Leaflet-divIcon in app/page.tsx)
// und die Legende daneben (KartenBedienung). Zwei getrennt gepflegte Fassungen wären zwei
// Nadeln, die irgendwann unterschiedlich aussehen, und die Legende erklärte dann eine Form, die
// es auf der Karte nicht gibt.
//
// Farben und Formen stehen in app/globals.css (Abschnitt „Karte: Nadeln"), nicht hier: Das
// divIcon landet im Dokument der App, die Klassen greifen dort wie überall. Bis v78 standen die
// Farben als Hex-Werte im style-Attribut (MARKER_FARBE) und liefen den Tokens davon.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Maße für Leaflet: Größe des Elements und der Punkt darin, der auf der Koordinate sitzt.
export const NADEL_MASS = { breite: 26, hoehe: 32, spitzeY: 31 } as const;
export const KREIS_MASS = 22;
export const STATION_MASS = 30;

// Vier Zustände, vier Farben – und zwei Formen, die mehr sagen als die Farbe:
//  - „kein Interesse" ist ein weißer Kreis mit rotem Kreuz, kein Tropfen. Es soll sich auf einen
//    Blick von allem unterscheiden, was noch anzurufen ist; Farbe allein trägt das nicht.
//  - „ungefähr" (Migration 35) macht die Nadel hohl und gestrichelt. Ein Punkt, der nur die
//    Straßenmitte ist, soll nicht aussehen wie einer, der stimmt.
// `schild` ist die kleine Beschriftung darüber – bei Terminen die Uhrzeit (nadelTerminText).
export function nadelHtml(zustand: KundenZustand, ungefaehr = false, schild?: string | null): string {
  const beschriftung = schild ? `<span class="pin-schild">${esc(schild)}</span>` : "";
  if (zustand === "kein-interesse") {
    return `<span class="pin pin-kreis${ungefaehr ? " ungefaehr" : ""}"><span class="pin-x">×</span>${beschriftung}</span>`;
  }
  return `<span class="pin z-${zustand}${ungefaehr ? " ungefaehr" : ""}"><span class="pin-kopf"><span class="pin-kern"></span></span>${beschriftung}</span>`;
}

// Eine Station im Tagesmodus: Nummer im Kreis. Vorbei grau, läuft orange, kommt dunkelblau mit
// dem Ring in der Farbe des Mitarbeiters – dieselbe Sprache wie die Zeitleiste im Reiter Termine.
export function stationHtml(nr: number, phase: TerminPhase, farbe: string | null, zeit: string): string {
  const ring = farbe ? ` style="--ma:${esc(farbe)}"` : "";
  return `<span class="pin-station p-${phase}"${ring}><b>${nr}</b><span class="pin-schild">${esc(zeit)}</span></span>`;
}

export function buendelHtml(anzahl: number, anteile: Parameters<typeof ringVerlauf>[0]): { html: string; groesse: number } {
  const g = buendelGroesse(anzahl);
  return {
    groesse: g,
    html: `<span class="pin-buendel" style="width:${g}px;height:${g}px;background:${ringVerlauf(anteile)}"><b>${zahlText(anzahl)}</b></span>`,
  };
}

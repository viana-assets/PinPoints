import { LAGERPLATZ_PARAMETER, SATZ_PARAMETER, VERKAUFSREIFEN_PARAMETER } from "./aufkleberCode";
import { ANRUF_PARAMETER, AUFTRAG_PARAMETER, CHAT_PARAMETER, KUNDE_PARAMETER, MITNEHMEN_PARAMETER } from "./constants";

// Ein Sprung über die Adresse (QR-Aufkleber `?lagerplatz=`/`?satz=`/`?reifen=`, Terminerinnerung
// `?auftrag=`, …) übersteht das erste Neuladen durch den Service Worker (Fahrplan D19, v106).
//
// Was passierte: Öffnet ein Gerät die App zum ersten Mal, gibt es noch keinen Service Worker. Der
// neue übernimmt (`clients.claim()` in public/sw.js), `PwaBereit` lädt bei `controllerchange` neu –
// und die Adresszeile ist zu diesem Zeitpunkt schon bereinigt (app/page.tsx entfernt die Parameter
// sofort, damit sie nicht in Lesezeichen landen). Der Sprung war weg; der Nutzer stand auf der
// Startseite und scannte noch einmal.
//
// Abhilfe: Den Sprung beim Lesen kurz in `sessionStorage` merken. Läuft schon ein Service Worker,
// kommt kein Neuladen – dann wird der Merker gleich wieder gelöscht. Läuft keiner, bleibt er stehen
// und wird nach dem Neuladen eingelöst, höchstens SPRUNG_MERKEN_MS lang. `sessionStorage` gilt nur
// für diesen Reiter und verschwindet mit ihm – ein Sprung wandert so nicht in ein anderes Fenster.
//
// Reine Funktionen bis auf den Speicher, der hereingereicht wird; geprüft in tests/sprungMerker.test.ts.

export const SPRUNG_PARAMETER = [
  LAGERPLATZ_PARAMETER, SATZ_PARAMETER, VERKAUFSREIFEN_PARAMETER,
  AUFTRAG_PARAMETER, KUNDE_PARAMETER, ANRUF_PARAMETER, MITNEHMEN_PARAMETER, CHAT_PARAMETER,
] as const;

// Länger als ein Neuladen dauert, kürzer als „ich lade später selbst neu und wundere mich".
export const SPRUNG_MERKEN_MS = 60_000;

const SCHLUESSEL = "mr-sprung";

type Speicher = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Nur die Sprung-Parameter, alles andere bleibt in der Adresse.
export function sprungTeile(suche: string): { sprung: URLSearchParams | null; rest: string } {
  const alle = new URLSearchParams(suche);
  const sprung = new URLSearchParams();
  for (const name of SPRUNG_PARAMETER) {
    const wert = alle.get(name);
    if (wert) sprung.set(name, wert);
    alle.delete(name);
  }
  return { sprung: sprung.toString() ? sprung : null, rest: alle.toString() };
}

// Der Sprung dieser Seitenladung: aus der Adresse, sonst aus dem Merker (wenn frisch genug).
//  - `hatController`: Steuert schon ein Service Worker diese Seite? Dann kommt kein Neuladen,
//    und der Merker wird nicht gebraucht.
export function sprungLesen(suche: string, speicher: Speicher | null, jetzt: number, hatController: boolean): URLSearchParams | null {
  const { sprung } = sprungTeile(suche);
  let ergebnis = sprung;
  try {
    if (sprung) {
      if (speicher && !hatController) speicher.setItem(SCHLUESSEL, JSON.stringify({ q: sprung.toString(), t: jetzt }));
    } else if (speicher) {
      const roh = speicher.getItem(SCHLUESSEL);
      if (roh) {
        const m = JSON.parse(roh) as { q?: unknown; t?: unknown };
        if (typeof m.q === "string" && typeof m.t === "number" && jetzt - m.t >= 0 && jetzt - m.t <= SPRUNG_MERKEN_MS) {
          ergebnis = sprungTeile(m.q).sprung;
        }
      }
    }
    // Mit Service Worker ist dies die endgültige Ladung – der Merker ist eingelöst oder unnötig.
    if (speicher && hatController) speicher.removeItem(SCHLUESSEL);
  } catch {
    // Privater Modus, gesperrter Speicher, kaputter Eintrag: dann eben ohne Merker.
  }
  return ergebnis;
}

// Einmal je Seitenladung – die beiden Stellen in app/page.tsx (Aufkleber, Benachrichtigung) lesen
// dasselbe Ergebnis, statt sich gegenseitig den Merker wegzunehmen.
let dieseLadung: URLSearchParams | null | undefined;
export function sprungDieserLadung(): URLSearchParams {
  if (dieseLadung === undefined) {
    let speicher: Speicher | null = null;
    try { speicher = window.sessionStorage; } catch { speicher = null; }
    const hatController = typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
    dieseLadung = sprungLesen(window.location.search, speicher, Date.now(), hatController);
    // Adresszeile bereinigen: sonst landet der Parameter in Lesezeichen und im Verlauf.
    const { sprung, rest } = sprungTeile(window.location.search);
    if (sprung) window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  }
  return new URLSearchParams(dieseLadung?.toString() ?? "");
}

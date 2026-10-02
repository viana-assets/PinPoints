import { useEffect } from "react";
import { istNetzfehler } from "@/lib/offline/ausgang";

// Die zentrale Fehlermeldung der App (aus app/page.tsx herausgelöst, Fahrplan C5/C6, v106).
//
// Jede Funktion in lib/api wirft bei einem Supabase-Fehler eine ApiError (lib/api/client.ts). Bricht
// ein Klick-Handler dadurch ab, landet das als unbehandelte Promise-Ablehnung hier – eine einzige
// Stelle statt einer Fehlerbehandlung an ~60 Aufrufstellen. Nebeneffekt, der so gewollt ist: das
// Neuladen nach dem fehlgeschlagenen Schreibvorgang läuft nicht mehr, die Eingabe bleibt stehen.
//
// Die Meldung einer Datenbankregel (Trigger, `raise exception '…'`) kommt dabei im Klartext an:
// „<was nicht ging>: <warum>". Dass das so bleibt, prüft tests/fehlerHinweis.test.tsx.

export const NETZ_FEHLER_TEXT =
  "Keine Verbindung – das geht nur mit Netz. Ohne Netz lassen sich Notiz, Termin, Titel und Beschreibung, Leistungen und die Radmessung ändern.";
const UNBEKANNT_TEXT = "Es ist ein unerwarteter Fehler aufgetreten.";

// Was der Nutzer liest. Ohne Netz ist „Failed to fetch" keine Auskunft. Was offline geht, geht über
// den Ausgangskorb (F1) und landet gar nicht hier; alles andere braucht Netz.
export function fehlerText(grund: unknown): string {
  if (istNetzfehler(grund)) return NETZ_FEHLER_TEXT;
  const text = (grund as { message?: unknown } | null | undefined)?.message;
  return typeof text === "string" && text.trim() ? text : UNBEKANNT_TEXT;
}

// Hört auf unbehandelte Ablehnungen und reicht den Text weiter.
export function useAblehnungenAlsFehler(melden: (text: string) => void): void {
  useEffect(() => {
    function beiAblehnung(e: PromiseRejectionEvent) {
      melden(fehlerText(e.reason));
      e.preventDefault();
    }
    window.addEventListener("unhandledrejection", beiAblehnung);
    return () => window.removeEventListener("unhandledrejection", beiAblehnung);
  }, [melden]);
}

export function FehlerHinweis({ text, onSchliessen }: { text: string | null; onSchliessen: () => void }) {
  if (!text) return null;
  return (
    <div className="fehler-hinweis" role="alert">
      <span>{text}</span>
      <button type="button" onClick={onSchliessen} aria-label="Meldung schließen">×</button>
    </div>
  );
}

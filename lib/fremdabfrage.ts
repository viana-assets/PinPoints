// Darf jetzt eine Anfrage an einen Adressdienst nach draußen gehen? (B3, Migration 62)
//
// Die Bremse im Speicher der Route (`drosseln()`) wirkt nur je Server-Instanz. Auf Vercel laufen
// mehrere davon, und ein angemeldeter Nutzer könnte die Route in einer Schleife aufrufen – im
// Ernstfall sperrt der kostenlose Dienst die Firma aus. Die Zählung je Nutzer und Minute liegt
// deshalb in der Datenbank (`fremdabfrage_erlaubt()`), die alle Instanzen teilen.
//
// Fehlt die Funktion (Migration 62 noch nicht ausgeführt) oder antwortet die Datenbank nicht,
// gilt „ja": Dann bremst wie bisher nur die Route selbst. Eine Adresssuche, die an der Bremse
// scheitert, weil die Bremse selbst nicht erreichbar ist, wäre der schlechtere Fehler.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Fremddienst = "nominatim" | "photon";

export const FREMDABFRAGE_ZU_VIEL =
  "Zu viele Adressabfragen in kurzer Zeit – bitte eine Minute warten und dann noch einmal versuchen.";

export async function fremdabfrageErlaubt(supabase: SupabaseClient, dienst: Fremddienst): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("fremdabfrage_erlaubt", { p_dienst: dienst });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

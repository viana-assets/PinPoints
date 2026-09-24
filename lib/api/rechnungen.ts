import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rechnung } from "@/lib/types";
import type { RechnungEntwurf } from "@/lib/rechnung";
import { q, qOne, fetchPaged } from "./client";

// Der Zugriff auf die Belege (Migration 48/49).
//
// Auffällig kurz, und das ist Absicht: Es gibt genau zwei schreibende Vorgänge – ausstellen
// und stornieren – und keinen einzigen zum Ändern oder Löschen. Die Datenbank lässt beides
// nicht zu; eine Funktion dafür hier wäre ein Versprechen, das sie bricht.

export async function fetchRechnungen(supabase: SupabaseClient): Promise<Rechnung[]> {
  return fetchPaged<Rechnung>("Die Rechnungen konnten nicht geladen werden", (von, bis) =>
    supabase.from("rechnungen").select("*").order("nummer", { ascending: false }).range(von, bis)
  );
}

// Die höchste je vergebene Rechnungsnummer (Rechnungen UND Stornos teilen sich den Kreis), oder
// null, wenn es noch keinen Beleg gibt. Für die Prüfung des Nummernkreises (Fahrplan D7).
export async function hoechsteRechnungsnummer(supabase: SupabaseClient): Promise<number | null> {
  const zeilen = await q<{ nummer: number }[]>(
    "Die zuletzt vergebene Rechnungsnummer konnte nicht gelesen werden",
    supabase.from("rechnungen").select("nummer").order("nummer", { ascending: false }).limit(1)
  );
  return zeilen && zeilen.length > 0 ? zeilen[0].nummer : null;
}

// Die Belege zu EINEM Auftrag – für das Rechnungsfenster. Getrennt vom Vollabzug, weil das
// Auftragsfenster nicht alle Rechnungen des Hauses laden soll, um eine anzuzeigen.
export async function fetchRechnungenZuAuftrag(supabase: SupabaseClient, orderId: string): Promise<Rechnung[]> {
  const zeilen = await q<Rechnung[]>(
    "Die Rechnungen zu diesem Auftrag konnten nicht geladen werden",
    supabase.from("rechnungen").select("*").eq("order_id", orderId).order("nummer")
  );
  return zeilen ?? [];
}

// Ausstellen. Nummer und Nummerntext kommen von der Datenbank – deshalb werden sie hier NICHT
// mitgeschickt und deshalb muss die Antwort gelesen werden: Erst sie sagt, welche Nummer der
// Beleg trägt.
//
// `.select().single()` ist hier keine Bequemlichkeit, sondern die einzige Möglichkeit, die
// vergebene Nummer zu erfahren, ohne sie in einer zweiten Abfrage zu suchen – und eine zweite
// Abfrage könnte die falsche finden, wenn zwei Leute gleichzeitig ausstellen.
export async function stelleRechnungAus(supabase: SupabaseClient, entwurf: RechnungEntwurf): Promise<Rechnung> {
  return qOne<Rechnung>(
    "Die Rechnung konnte nicht ausgestellt werden",
    supabase.from("rechnungen").insert(entwurf).select("*").single()
  );
}

// Stornieren: eine ZWEITE Rechnung mit umgekehrtem Vorzeichen, kein Löschen und kein Ändern.
// Dass die aufgehobene Rechnung dabei gekennzeichnet wird, erledigt der Trigger aus
// Migration 49 – in derselben Transaktion, damit es nicht halb passieren kann.
export async function storniereRechnung(
  supabase: SupabaseClient,
  entwurf: RechnungEntwurf & { hebt_auf: string; storno_grund: string }
): Promise<Rechnung> {
  return qOne<Rechnung>(
    "Die Rechnung konnte nicht storniert werden",
    supabase.from("rechnungen").insert(entwurf).select("*").single()
  );
}

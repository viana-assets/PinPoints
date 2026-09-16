import type { SupabaseClient } from "@supabase/supabase-js";
import type { Betrieb } from "@/lib/types";
import { q, qWrite } from "./client";

// Einstellungen, die für den BETRIEB gelten und nicht für einen Nutzer (Migration 38).
//
// Der Unterschied zu `user_settings` ist keine Formsache: Kartenstil und
// Wiedervorlage-Zeitraum sind Ansichtssachen jedes Einzelnen. Das Terminraster dagegen
// bestimmt, was in die AUFTRÄGE geschrieben wird – hätte jeder seinen eigenen Wert, hinge die
// Dauer eines Termins davon ab, wer ihn angelegt hat.
//
// Es gibt garantiert genau eine Zeile; die Datenbank lässt keine zweite zu.

export async function fetchBetrieb(supabase: SupabaseClient): Promise<Betrieb | null> {
  const zeilen = await q<Betrieb[]>(
    "Die Betriebseinstellungen konnten nicht geladen werden",
    supabase.from("betrieb").select("termin_intervall_min, updated_at, updated_by").limit(1)
  );
  return zeilen?.[0] ?? null;
}

export async function setzeTerminIntervall(supabase: SupabaseClient, minuten: number): Promise<void> {
  await qWrite(
    "Das Terminraster konnte nicht gespeichert werden",
    // `eq("id", true)` statt eines Treffers auf alles: Die Tabelle hat genau eine Zeile, und
    // ein Update ohne Bedingung lehnt PostgREST aus gutem Grund ab.
    supabase.from("betrieb").update({ termin_intervall_min: minuten, updated_at: new Date().toISOString() }).eq("id", true)
  );
}

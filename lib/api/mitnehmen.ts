import type { SupabaseClient } from "@supabase/supabase-js";
import type { MitnehmenGepackt } from "@/lib/types";
import { fetchPaged, qWrite } from "./client";

// „Reifen mitnehmen" abhaken (Migration 58). Eine Zeile je Satz und Einsatztag; wer und wann
// setzt die Datenbank. Fürs ganze Team sichtbar – entschieden am 25.09.2026.

export async function fetchGepackt(supabase: SupabaseClient, daten: string[]): Promise<MitnehmenGepackt[]> {
  if (daten.length === 0) return [];
  return fetchPaged<MitnehmenGepackt>(
    "Die Haken bei „Reifen mitnehmen“ konnten nicht geladen werden",
    (von, bis) => supabase.from("mitnehmen_gepackt").select("*").in("fuer_datum", daten).range(von, bis)
  );
}

export async function setzeGepackt(supabase: SupabaseClient, satzId: string, datum: string, gepackt: boolean): Promise<void> {
  if (gepackt) {
    // `upsert` mit ignoreDuplicates: Haken zwei Leute gleichzeitig ab, bleibt es eine Zeile –
    // und der Zweite bekommt keinen Fehler für etwas, das ohnehin stimmt.
    await qWrite(
      "Der Haken konnte nicht gesetzt werden",
      supabase.from("mitnehmen_gepackt")
        .upsert({ tire_storage_id: satzId, fuer_datum: datum }, { onConflict: "tire_storage_id,fuer_datum", ignoreDuplicates: true })
    );
  } else {
    await qWrite(
      "Der Haken konnte nicht entfernt werden",
      supabase.from("mitnehmen_gepackt").delete().eq("tire_storage_id", satzId).eq("fuer_datum", datum)
    );
  }
}

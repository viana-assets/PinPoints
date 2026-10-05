import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verfuegbarkeit } from "@/lib/types";
import type { Fenster } from "@/lib/verfuegbarkeit";
import { fetchPaged, qWrite } from "./client";

// Datenzugriff für die Verfügbarkeit der Mitarbeiter (Migration 68, v112).
//
// Wer was sieht, entscheidet die Datenbank: die eigene Zeile jeder mit verknüpftem Mitarbeiter,
// alle nur mit `einsatzplanung.verfuegbarkeit · lesen`. Die Abfrage hier fragt deshalb einfach
// nach allem – zurück kommt, was die Rolle sehen darf.

// Ab einem Tag. Was älter ist als zwei Monate, braucht die Planung nicht mehr; die Datenbank
// räumt nach zwölf Monaten selbst auf.
export async function fetchVerfuegbarkeiten(supabase: SupabaseClient, ab: string): Promise<Verfuegbarkeit[]> {
  return fetchPaged<Verfuegbarkeit>("Die Verfügbarkeiten konnten nicht geladen werden", (von, bis) =>
    supabase.from("verfuegbarkeiten").select("*").gte("datum", ab)
      .order("datum").order("employee_id").order("id").range(von, bis)
  );
}

// Einen Tag eintragen oder ändern: ganzer Tag (`fenster` null) oder ein Zeitfenster.
export async function verfuegbarkeitSetzen(supabase: SupabaseClient, employeeId: string, datum: string, fenster: Fenster): Promise<void> {
  await qWrite(
    "Die Verfügbarkeit konnte nicht gespeichert werden",
    supabase.from("verfuegbarkeiten").upsert(
      { employee_id: employeeId, datum, von: fenster?.von ?? null, bis: fenster?.bis ?? null },
      { onConflict: "employee_id,datum" }
    )
  );
}

// Austragen: Der Tag steht danach wieder auf „nichts eingetragen".
export async function verfuegbarkeitAustragen(supabase: SupabaseClient, employeeId: string, datum: string): Promise<void> {
  await qWrite(
    "Der Tag konnte nicht ausgetragen werden",
    supabase.from("verfuegbarkeiten").delete().eq("employee_id", employeeId).eq("datum", datum)
  );
}

// Vorlage („jede Woche Mo–Fr"): viele Tage auf einmal. Was schon eingetragen ist, bleibt
// (`ignoreDuplicates`) – die Vorlage füllt nur Lücken.
export async function verfuegbarkeitVorlage(supabase: SupabaseClient, employeeId: string, tage: string[], fenster: Fenster): Promise<void> {
  if (tage.length === 0) return;
  await qWrite(
    "Die Vorlage konnte nicht eingetragen werden",
    supabase.from("verfuegbarkeiten").upsert(
      tage.map((datum) => ({ employee_id: employeeId, datum, von: fenster?.von ?? null, bis: fenster?.bis ?? null })),
      { onConflict: "employee_id,datum", ignoreDuplicates: true }
    )
  );
}

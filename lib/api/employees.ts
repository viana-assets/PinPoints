import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee } from "@/lib/types";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für Mitarbeiter (Einsatzplanung). Reine Supabase-Wrapper ohne
// React-State – die Komponente ruft diese Funktionen auf und aktualisiert ihren eigenen
// State mit dem Ergebnis (Muster: `setX(await fetchX(supabase))`). Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 3.

export async function fetchEmployees(supabase: SupabaseClient): Promise<Employee[]> {
  return fetchPaged<Employee>("Die Mitarbeiter konnten nicht geladen werden", (von, bis) =>
    supabase.from("employees").select("*").order("name").range(von, bis)
  );
}

export async function insertEmployee(supabase: SupabaseClient, name: string): Promise<void> {
  await qWrite("Der Mitarbeiter konnte nicht angelegt werden", supabase.from("employees").insert({ name }));
}

export async function deleteEmployeeById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Der Mitarbeiter konnte nicht gelöscht werden", supabase.from("employees").delete().eq("id", id));
}

// Verknüpft (oder löst) einen Mitarbeiter-Stammdatensatz mit einem eingeladenen Login-Account
// (`profiles.id`) – manuell im Admin-Panel gepflegt (Phase 4). Erst dadurch kann sich ein
// Techniker-Account per RLS als "der zugeordnete Mitarbeiter" eines Auftrags ausweisen, siehe
// Migration 13/15 (`public.current_employee_id()`).
export async function updateEmployeeProfileId(supabase: SupabaseClient, employeeId: string, profileId: string | null): Promise<void> {
  await qWrite(
    "Die Verknüpfung mit dem Login-Account konnte nicht gespeichert werden",
    supabase.from("employees").update({ profile_id: profileId }).eq("id", employeeId)
  );
}

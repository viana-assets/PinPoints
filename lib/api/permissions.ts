import type { SupabaseClient } from "@supabase/supabase-js";

// Datenzugriffsschicht für die Modul-Berechtigungen (Migration 09): pro Modul-Schlüssel, welche
// Rollen dort etwas dürfen. Reine Supabase-Wrapper ohne React-State – siehe
// lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md
// Phase 3.

export async function fetchModulePermissions(supabase: SupabaseClient): Promise<Record<string, string[]>> {
  const { data } = await supabase.from("module_permissions").select("*");
  const map: Record<string, string[]> = {};
  (data as { module_key: string; edit_roles: string[] }[] | null)?.forEach((r) => { map[r.module_key] = r.edit_roles || []; });
  return map;
}

export async function upsertModulePermissions(supabase: SupabaseClient, moduleKey: string, roles: string[]): Promise<void> {
  await supabase.from("module_permissions").upsert({ module_key: moduleKey, edit_roles: roles });
}

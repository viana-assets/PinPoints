import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für die Modul-Berechtigungen (Migration 09/10/16): pro Modul-Schlüssel,
// welche Rollen dort etwas dürfen. Seit Migration 16 wertet die Datenbank diese Tabelle selbst
// aus (`public.has_module_permission()`) – ein Haken in der Modulverwaltung ändert damit
// tatsächlich, was möglich ist, nicht nur, was sichtbar ist.

export async function fetchModulePermissions(supabase: SupabaseClient): Promise<Record<string, string[]>> {
  const rows = await fetchPaged<{ module_key: string; edit_roles: string[] }>(
    "Die Modul-Berechtigungen konnten nicht geladen werden",
    (von, bis) => supabase.from("module_permissions").select("*").range(von, bis)
  );
  const map: Record<string, string[]> = {};
  rows.forEach((r) => { map[r.module_key] = r.edit_roles || []; });
  return map;
}

export async function upsertModulePermissions(supabase: SupabaseClient, moduleKey: string, roles: string[]): Promise<void> {
  await qWrite(
    "Die Berechtigung konnte nicht gespeichert werden",
    supabase.from("module_permissions").upsert({ module_key: moduleKey, edit_roles: roles })
  );
}

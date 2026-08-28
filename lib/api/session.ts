import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role, UserSettings } from "@/lib/types";

// Datenzugriffsschicht für die Sitzungs-/Profil-Bootstrap-Daten beim Initial-Load: eigene
// Rolle (`profiles`) sowie die persönlichen Anzeige-Einstellungen (`user_settings`, wird beim
// allerersten Login automatisch angelegt). Reine Supabase-Wrapper ohne React-State – siehe
// lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md
// Phase 3.

export async function fetchOwnRole(supabase: SupabaseClient, userId: string): Promise<Role | undefined> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return profile?.role as Role | undefined;
}

// Lädt die Anzeige-Einstellungen des Nutzers, legt beim allerersten Login eine Standardzeile an.
export async function fetchOrCreateUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings | null> {
  let { data: settingsRow } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!settingsRow) {
    const { data: created } = await supabase
      .from("user_settings")
      .insert({ user_id: userId })
      .select("*")
      .single();
    settingsRow = created;
  }
  return (settingsRow as UserSettings) || null;
}

export async function updateUserSettings(supabase: SupabaseClient, userId: string, patch: Partial<UserSettings>): Promise<void> {
  await supabase.from("user_settings").update(patch).eq("user_id", userId);
}

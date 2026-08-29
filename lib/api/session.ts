import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role, UserSettings } from "@/lib/types";
import { q, qOne, qWrite } from "./client";

// Datenzugriffsschicht für die Sitzungs-/Profil-Bootstrap-Daten beim Initial-Load: eigene
// Rolle (`profiles`) sowie die persönlichen Anzeige-Einstellungen (`user_settings`, wird beim
// allerersten Login automatisch angelegt). Reine Supabase-Wrapper ohne React-State – siehe
// lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md
// Phase 3.

export async function fetchOwnRole(supabase: SupabaseClient, userId: string): Promise<Role | undefined> {
  const profile = await q<{ role: string }>(
    "Die eigene Rolle konnte nicht geladen werden",
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
  );
  return (profile?.role as Role | undefined) ?? undefined;
}

// Lädt die Anzeige-Einstellungen des Nutzers, legt beim allerersten Login eine Standardzeile an.
export async function fetchOrCreateUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings> {
  const vorhanden = await q<UserSettings>(
    "Die persönlichen Einstellungen konnten nicht geladen werden",
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle()
  );
  if (vorhanden) return vorhanden;
  return qOne<UserSettings>(
    "Die persönlichen Einstellungen konnten nicht angelegt werden",
    supabase.from("user_settings").insert({ user_id: userId }).select("*").single()
  );
}

export async function updateUserSettings(supabase: SupabaseClient, userId: string, patch: Partial<UserSettings>): Promise<void> {
  // Ohne user_id würde das update auf KEINE Zeile passen und stillschweigend nichts tun –
  // genau der Fall, der auftrat, wenn der Initial-Load der Einstellungen fehlgeschlagen war.
  if (!userId) throw new Error("Einstellungen können erst gespeichert werden, wenn das Profil geladen ist.");
  await qWrite(
    "Die Einstellung konnte nicht gespeichert werden",
    supabase.from("user_settings").update(patch).eq("user_id", userId)
  );
}

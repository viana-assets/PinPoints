import type { SupabaseClient } from "@supabase/supabase-js";
import type { Auftragsvorlage } from "@/lib/types";
import { ApiError, qWrite } from "./client";

// Auftragsvorlagen (Migration 63, E6). Reine Supabase-Wrapper, Muster wie lib/api/employees.ts.
//
// Fehlt die Tabelle noch (Migration 63 nicht ausgeführt), liefert das Laden eine leere Liste
// statt eines roten Fehlerbands: Der Knopf „+ Vorlage" bleibt dann einfach leer, alles andere
// läuft wie bisher.
export async function fetchVorlagen(supabase: SupabaseClient): Promise<Auftragsvorlage[]> {
  const { data, error } = await supabase.from("auftragsvorlagen").select("*")
    .order("sortierung").order("name").order("id").range(0, 999);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /auftragsvorlagen/.test(error.message)) return [];
    throw new ApiError("Die Auftragsvorlagen konnten nicht geladen werden", error);
  }
  return (data ?? []) as Auftragsvorlage[];
}

export type VorlageFelder = Pick<Auftragsvorlage, "name" | "positionen" | "aktiv" | "sortierung">;

export async function insertVorlage(supabase: SupabaseClient, felder: VorlageFelder): Promise<void> {
  await qWrite("Die Vorlage konnte nicht angelegt werden",
    supabase.from("auftragsvorlagen").insert({ ...felder, name: felder.name.trim() }));
}

export async function updateVorlage(supabase: SupabaseClient, id: string, felder: Partial<VorlageFelder>): Promise<void> {
  await qWrite("Die Vorlage konnte nicht gespeichert werden",
    supabase.from("auftragsvorlagen").update({ ...felder, ...(felder.name !== undefined ? { name: felder.name.trim() } : {}) }).eq("id", id));
}

export async function deleteVorlage(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Die Vorlage konnte nicht gelöscht werden", supabase.from("auftragsvorlagen").delete().eq("id", id));
}

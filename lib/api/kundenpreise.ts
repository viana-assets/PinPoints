import type { SupabaseClient } from "@supabase/supabase-js";
import type { KundenPreis } from "@/lib/types";
import { preisLesen, type KundenpreisEntwurf } from "@/lib/kundenpreise";
import { fetchPaged, qWrite } from "./client";

// Kundenpreise (Migration 118, v191). Alle auf einmal – es sind wenige, und das Auftragsfenster braucht die des Kunden
// und seines Hauptkunden. Lesen darf nur, wer „Endpreis überschreiben“ hat; alle anderen bekommen eine leere Liste.
// Eingesetzt wird der Preis ohnehin von der Datenbank (`position_kundenpreis()`), nicht von hier.
export async function fetchKundenpreise(supabase: SupabaseClient): Promise<KundenPreis[]> {
  return fetchPaged<KundenPreis>("Die Kundenpreise konnten nicht geladen werden", (von, bis) =>
    supabase.from("kunden_preise").select("*").order("customer_id").order("article_id").order("id").range(von, bis));
}

const spalten = (e: KundenpreisEntwurf) => ({
  article_id: e.artikelId,
  net_price: preisLesen(e.preis),
  valid_from: e.ab || null,
  valid_to: e.bis || null,
  notiz: e.notiz.trim() || null,
});

export async function kundenpreisAnlegen(supabase: SupabaseClient, kundeId: string, e: KundenpreisEntwurf): Promise<void> {
  await qWrite("Der Kundenpreis konnte nicht angelegt werden", supabase.from("kunden_preise").insert({ customer_id: kundeId, ...spalten(e) }));
}

export async function kundenpreisAendern(supabase: SupabaseClient, id: string, e: KundenpreisEntwurf): Promise<void> {
  await qWrite("Der Kundenpreis konnte nicht gespeichert werden", supabase.from("kunden_preise").update(spalten(e)).eq("id", id));
}

export async function kundenpreisLoeschen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Der Kundenpreis konnte nicht gelöscht werden", supabase.from("kunden_preise").delete().eq("id", id));
}

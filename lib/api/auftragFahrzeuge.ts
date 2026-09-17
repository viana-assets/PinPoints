import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragFahrzeug } from "@/lib/types";
import { fetchPaged, qWrite } from "./client";

// Welche Fahrzeuge betrifft ein Auftrag, und mit welchem Kilometerstand (Migration 44)?
//
// Diese Tabelle ersetzt `orders.vehicle_id`, das nur EINES zuließ. Der Kilometerstand steht
// hier und nicht am Fahrzeug, weil er eine Messung an einem Tag ist und keine Eigenschaft des
// Autos – am Fahrzeug stünde nach dem zweiten Besuch eine Zahl, die zum ersten nicht mehr
// passt.

export async function fetchAuftragFahrzeuge(supabase: SupabaseClient, orderIds: string[]): Promise<AuftragFahrzeug[]> {
  if (orderIds.length === 0) return [];
  // In Blöcken, wie bei den Auswertungen: Eine `in()`-Liste mit tausend Kennungen sprengt die
  // Länge der Adresszeile, und der Fehler sieht dann aus wie ein Netzproblem.
  const BLOCK = 200;
  const alle: AuftragFahrzeug[] = [];
  for (let i = 0; i < orderIds.length; i += BLOCK) {
    const teil = orderIds.slice(i, i + BLOCK);
    const zeilen = await fetchPaged<AuftragFahrzeug>(
      "Die Fahrzeuge am Auftrag konnten nicht geladen werden",
      (von, bis) => supabase.from("auftrag_fahrzeuge").select("*").in("order_id", teil).range(von, bis)
    );
    alle.push(...zeilen);
  }
  return alle;
}

export async function addAuftragFahrzeug(
  supabase: SupabaseClient, orderId: string, vehicleId: string, kilometerstand: number | null
): Promise<void> {
  await qWrite(
    "Das Fahrzeug konnte dem Auftrag nicht zugeordnet werden",
    supabase.from("auftrag_fahrzeuge").insert({ order_id: orderId, vehicle_id: vehicleId, kilometerstand })
  );
}

// `null` heißt „noch nicht abgelesen" und ist etwas anderes als 0 – ein fabrikneuer Wagen hat
// 0 km. Würde beides gleich behandelt, ließe sich so ein Auftrag nie abrechnen.
export async function setKilometerstand(supabase: SupabaseClient, id: string, kilometerstand: number | null): Promise<void> {
  await qWrite(
    "Der Kilometerstand konnte nicht gespeichert werden",
    supabase.from("auftrag_fahrzeuge").update({ kilometerstand }).eq("id", id)
  );
}

export async function removeAuftragFahrzeug(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Das Fahrzeug konnte nicht vom Auftrag entfernt werden",
    supabase.from("auftrag_fahrzeuge").delete().eq("id", id)
  );
}

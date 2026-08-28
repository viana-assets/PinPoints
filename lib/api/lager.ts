import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageSlot, TireStorage, Warehouse } from "@/lib/types";

// Datenzugriffsschicht für das Lager-Modul (Warehouses, Lagerplätze, Reifen-Einlagerung).
// Reine Supabase-Wrapper ohne React-State – siehe lib/api/employees.ts für das Muster.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 3.

export async function fetchWarehouses(supabase: SupabaseClient): Promise<Warehouse[]> {
  const { data } = await supabase.from("warehouses").select("*").order("name");
  return (data as Warehouse[]) || [];
}

export async function fetchStorageSlots(supabase: SupabaseClient): Promise<StorageSlot[]> {
  const { data } = await supabase.from("storage_slots").select("*").order("code");
  return (data as StorageSlot[]) || [];
}

export async function fetchTireStorages(supabase: SupabaseClient): Promise<TireStorage[]> {
  const { data } = await supabase.from("tire_storage").select("*").order("updated_at", { ascending: false });
  return (data as TireStorage[]) || [];
}

export async function insertWarehouse(supabase: SupabaseClient, fields: { name: string; address: string; note: string }): Promise<string | undefined> {
  const { data: created } = await supabase
    .from("warehouses")
    .insert({ name: fields.name, address: fields.address || null, note: fields.note || null })
    .select("id")
    .single();
  return created?.id as string | undefined;
}

export async function updateWarehouseById(supabase: SupabaseClient, id: string, fields: { name: string; address: string; note: string }): Promise<void> {
  await supabase.from("warehouses").update({ name: fields.name, address: fields.address || null, note: fields.note || null }).eq("id", id);
}

export async function deleteWarehouseById(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("warehouses").delete().eq("id", id);
}

export async function insertStorageSlot(supabase: SupabaseClient, warehouseId: string, code: string): Promise<void> {
  await supabase.from("storage_slots").insert({ warehouse_id: warehouseId, code });
}

// Bulk-Anlage von Lagerplätzen nach einer Nummerierungslogik (Präfix + Start/Ende + Stellen),
// z. B. Präfix "A", 1–20, 2-stellig → A-01 … A-20. Wird sowohl beim Anlegen eines neuen Lagers
// als auch später zum Nachrüsten weiterer Plätze verwendet.
export async function insertStorageSlotsBulk(supabase: SupabaseClient, warehouseId: string, codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await supabase.from("storage_slots").insert(codes.map((code) => ({ warehouse_id: warehouseId, code })));
}

export async function deleteStorageSlotById(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("storage_slots").delete().eq("id", id);
}

export async function upsertTireAssignment(supabase: SupabaseClient, fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }): Promise<void> {
  const patch = {
    storage_slot_id: fields.storageSlotId,
    customer_id: fields.customerId,
    dot_date: fields.dotDate || null,
    profiltiefe_mm: fields.profiltiefeMm ? parseFloat(fields.profiltiefeMm.replace(",", ".")) : null,
    note: fields.note || null,
    updated_at: new Date().toISOString(),
  };
  if (fields.id) {
    await supabase.from("tire_storage").update(patch).eq("id", fields.id);
  } else {
    await supabase.from("tire_storage").insert(patch);
  }
}

// Soft-Delete: Zuordnung wird nur als "entfernt" markiert, nicht gelöscht, damit der
// Lagerplatz eine Historie behält (Migration 06).
export async function removeTireAssignmentById(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("tire_storage").update({ removed_at: new Date().toISOString() }).eq("id", id);
}

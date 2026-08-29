import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageSlot, TireStorage, Warehouse } from "@/lib/types";
import { ApiError, fetchPaged, qOne, qWrite } from "./client";

// Datenzugriffsschicht für das Lager-Modul (Warehouses, Lagerplätze, Reifen-Einlagerung).
// Reine Supabase-Wrapper ohne React-State – siehe lib/api/employees.ts für das Muster.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 3.

export async function fetchWarehouses(supabase: SupabaseClient): Promise<Warehouse[]> {
  return fetchPaged<Warehouse>("Die Lager konnten nicht geladen werden", (von, bis) =>
    supabase.from("warehouses").select("*").order("name").range(von, bis)
  );
}

export async function fetchStorageSlots(supabase: SupabaseClient): Promise<StorageSlot[]> {
  return fetchPaged<StorageSlot>("Die Lagerplätze konnten nicht geladen werden", (von, bis) =>
    supabase.from("storage_slots").select("*").order("code").range(von, bis)
  );
}

export async function fetchTireStorages(supabase: SupabaseClient): Promise<TireStorage[]> {
  return fetchPaged<TireStorage>("Die Einlagerungen konnten nicht geladen werden", (von, bis) =>
    supabase.from("tire_storage").select("*").order("updated_at", { ascending: false }).range(von, bis)
  );
}

export async function insertWarehouse(supabase: SupabaseClient, fields: { name: string; address: string; note: string }): Promise<string> {
  const created = await qOne<{ id: string }>(
    "Das Lager konnte nicht angelegt werden",
    supabase
      .from("warehouses")
      .insert({ name: fields.name, address: fields.address || null, note: fields.note || null })
      .select("id")
      .single()
  );
  return created.id;
}

export async function updateWarehouseById(supabase: SupabaseClient, id: string, fields: { name: string; address: string; note: string }): Promise<void> {
  await qWrite(
    "Das Lager konnte nicht gespeichert werden",
    supabase.from("warehouses").update({ name: fields.name, address: fields.address || null, note: fields.note || null }).eq("id", id)
  );
}

export async function deleteWarehouseById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Das Lager konnte nicht gelöscht werden", supabase.from("warehouses").delete().eq("id", id));
}

export async function insertStorageSlot(supabase: SupabaseClient, warehouseId: string, code: string): Promise<void> {
  await qWrite(
    "Der Lagerplatz konnte nicht angelegt werden",
    supabase.from("storage_slots").insert({ warehouse_id: warehouseId, code })
  );
}

// Bulk-Anlage von Lagerplätzen nach einer Nummerierungslogik (Präfix + Start/Ende + Stellen),
// z. B. Präfix "A", 1–20, 2-stellig → A-01 … A-20. Wird sowohl beim Anlegen eines neuen Lagers
// als auch später zum Nachrüsten weiterer Plätze verwendet.
export async function insertStorageSlotsBulk(supabase: SupabaseClient, warehouseId: string, codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await qWrite(
    "Die Lagerplätze konnten nicht angelegt werden",
    supabase.from("storage_slots").insert(codes.map((code) => ({ warehouse_id: warehouseId, code })))
  );
}

export async function deleteStorageSlotById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Der Lagerplatz konnte nicht gelöscht werden", supabase.from("storage_slots").delete().eq("id", id));
}

// Seit Migration 15 stellt ein partieller Unique-Index sicher, dass ein Lagerplatz höchstens
// EINE aktive Belegung hat (removed_at is null). Versucht jemand parallel eine zweite
// Einlagerung auf denselben Platz, lehnt die Datenbank das jetzt ab, statt zwei aktive Zeilen
// entstehen zu lassen, von denen die Oberfläche willkürlich eine anzeigt.
export async function upsertTireAssignment(supabase: SupabaseClient, fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; orderId?: string | null }): Promise<void> {
  const patch = {
    storage_slot_id: fields.storageSlotId,
    customer_id: fields.customerId,
    dot_date: fields.dotDate || null,
    profiltiefe_mm: fields.profiltiefeMm ? parseFloat(fields.profiltiefeMm.replace(",", ".")) : null,
    note: fields.note || null,
    updated_at: new Date().toISOString(),
    // Nur mitschreiben, wenn der Aufrufer sich dazu geäußert hat (Migration 22). Ohne diese
    // Unterscheidung würde das Lager-Modul, das keinen Auftrag kennt, beim Bearbeiten einer
    // Einlagerung deren Auftragsbezug stillschweigend auf null setzen.
    ...(fields.orderId === undefined ? {} : { order_id: fields.orderId }),
  };
  if (fields.id) {
    await qWrite(
      "Die Einlagerung konnte nicht gespeichert werden",
      supabase.from("tire_storage").update(patch).eq("id", fields.id)
    );
  } else {
    await qWrite(
      "Die Einlagerung konnte nicht angelegt werden – ist der Lagerplatz schon belegt?",
      supabase.from("tire_storage").insert(patch)
    );
  }
}

// Soft-Delete: Zuordnung wird nur als "entfernt" markiert, nicht gelöscht, damit der
// Lagerplatz eine Historie behält (Migration 06).
export async function removeTireAssignmentById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Die Einlagerung konnte nicht entfernt werden",
    supabase.from("tire_storage").update({ removed_at: new Date().toISOString() }).eq("id", id)
  );
}

// Kennzahlen für das Dashboard, ohne dafür das ganze Lager zu laden (Roadmap Phase 10).
// Seit Migration 15 belegt eine aktive Einlagerung genau einen Lagerplatz (partieller
// Unique-Index), deshalb ist die Zahl der aktiven Einlagerungen zugleich die Zahl der belegten
// Plätze – ohne die beiden Tabellen im Browser gegeneinander zu rechnen.
export async function fetchLagerKennzahlen(supabase: SupabaseClient): Promise<{ belegt: number; gesamt: number }> {
  const belegt = await supabase
    .from("tire_storage")
    .select("id", { count: "exact", head: true })
    .is("removed_at", null);
  if (belegt.error) throw new ApiError("Die Lager-Kennzahlen konnten nicht geladen werden", belegt.error);

  const gesamt = await supabase.from("storage_slots").select("id", { count: "exact", head: true });
  if (gesamt.error) throw new ApiError("Die Lager-Kennzahlen konnten nicht geladen werden", gesamt.error);

  return { belegt: belegt.count || 0, gesamt: gesamt.count || 0 };
}

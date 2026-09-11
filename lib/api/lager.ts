import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EingelagertesRad, Erfassungsart, Felge, RadPosition, Saison, StorageSlot, TireStorage, Warehouse,
} from "@/lib/types";
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
export async function upsertTireAssignment(supabase: SupabaseClient, fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; orderId?: string | null; vehicleId?: string | null; saison?: Saison | null }): Promise<void> {
  const patch = {
    storage_slot_id: fields.storageSlotId,
    customer_id: fields.customerId,
    dot_date: fields.dotDate || null,
    profiltiefe_mm: fields.profiltiefeMm ? parseFloat(fields.profiltiefeMm.replace(",", ".")) : null,
    note: fields.note || null,
    updated_at: new Date().toISOString(),
    // Fahrzeug und Saison (Migration 30) nur mitschreiben, wenn der Aufrufer sich dazu
    // geäußert hat – aus demselben Grund wie bei `orderId` darunter: Der schnelle Weg im
    // Auftragsfenster ordnet zuerst nur einen Lagerplatz zu und ergänzt den Rest danach. Würde
    // er die Felder als "nicht gesetzt" mitschicken, löschte jede Platzänderung die Angaben.
    ...(fields.vehicleId === undefined ? {} : { vehicle_id: fields.vehicleId }),
    ...(fields.saison === undefined ? {} : { saison: fields.saison }),
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

// Nur die beschreibenden Angaben eines bestehenden Satzes ändern – ohne den Lagerplatz
// anzufassen. Getrennt von `upsertTireAssignment`, weil das im Alltag zwei verschiedene
// Handlungen sind: „der Satz kommt auf A-12" ist eine Bewegung im Regal, „das ist der
// Wintersatz vom N-AB 123" eine Beschreibung. Sie zusammenzulegen hieße, bei jeder
// Beschreibung den Platz erneut zu schreiben – und bei jedem Tippfehler im Platz die
// Beschreibung zu verlieren.
export async function updateTireStorageDetails(
  supabase: SupabaseClient,
  id: string,
  felder: { vehicleId?: string | null; saison?: Saison | null; dotDate?: string; profiltiefeMm?: string; note?: string }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (felder.vehicleId !== undefined) patch.vehicle_id = felder.vehicleId;
  if (felder.saison !== undefined) patch.saison = felder.saison;
  if (felder.dotDate !== undefined) patch.dot_date = felder.dotDate || null;
  if (felder.profiltiefeMm !== undefined) {
    patch.profiltiefe_mm = felder.profiltiefeMm ? parseFloat(felder.profiltiefeMm.replace(",", ".")) : null;
  }
  if (felder.note !== undefined) patch.note = felder.note || null;

  await qWrite(
    "Die Angaben zur Einlagerung konnten nicht gespeichert werden",
    supabase.from("tire_storage").update(patch).eq("id", id)
  );
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

// ---------------------------------------------------------------- Einzelne Räder (Migration 33)
//
// Die Räder hängen am Satz und werden nur bei `erfassungsart = "einzeln"` geführt. Die
// Datenbank hält das auseinander (Trigger in Migration 33) – hier steht nur der Zugriff.

export async function fetchEingelagerteRaeder(supabase: SupabaseClient): Promise<EingelagertesRad[]> {
  return fetchPaged<EingelagertesRad>("Die eingelagerten Räder konnten nicht geladen werden", (von, bis) =>
    supabase.from("eingelagerte_raeder").select("*").order("created_at").range(von, bis)
  );
}

export type RadFelder = {
  position: RadPosition | null;
  reifengroesse: string;
  dotDate: string;
  profiltiefeMm: string;
  felge: Felge | null;
  sensor: boolean;
  bemerkung: string;
};

function radZuZeile(felder: Partial<RadFelder>) {
  const zeile: Record<string, unknown> = {};
  if (felder.position !== undefined) zeile.position = felder.position;
  if (felder.reifengroesse !== undefined) zeile.reifengroesse = felder.reifengroesse.trim() || null;
  if (felder.dotDate !== undefined) zeile.dot_date = felder.dotDate.trim() || null;
  if (felder.profiltiefeMm !== undefined) {
    zeile.profiltiefe_mm = felder.profiltiefeMm ? parseFloat(felder.profiltiefeMm.replace(",", ".")) : null;
  }
  if (felder.felge !== undefined) zeile.felge = felder.felge;
  if (felder.sensor !== undefined) zeile.sensor = felder.sensor;
  if (felder.bemerkung !== undefined) zeile.bemerkung = felder.bemerkung.trim() || null;
  return zeile;
}

export async function insertRad(
  supabase: SupabaseClient,
  tireStorageId: string,
  felder: Partial<RadFelder>
): Promise<void> {
  await qWrite(
    "Das Rad konnte nicht gespeichert werden",
    supabase.from("eingelagerte_raeder").insert({ tire_storage_id: tireStorageId, ...radZuZeile(felder) })
  );
}

export async function updateRadById(
  supabase: SupabaseClient,
  id: string,
  felder: Partial<RadFelder>
): Promise<void> {
  await qWrite(
    "Das Rad konnte nicht gespeichert werden",
    supabase.from("eingelagerte_raeder").update({ ...radZuZeile(felder), updated_at: new Date().toISOString() }).eq("id", id)
  );
}

// Hier wird wirklich gelöscht und nicht nur markiert: Eine Radzeile ist eine Messung, kein
// Beleg. Wer sich vertippt hat, will sie weg haben – und der Satz selbst bleibt ja bestehen.
export async function deleteRadById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Das Rad konnte nicht entfernt werden",
    supabase.from("eingelagerte_raeder").delete().eq("id", id)
  );
}

// Umschalten zwischen Sammelmessung und Einzelerfassung.
//
// Beim Wechsel auf „einzeln" muss der Sammelwert weichen – sonst stünden zwei Wahrheiten da,
// und die Datenbank lehnt es ohnehin ab (Prüfregel aus Migration 33). Beim Wechsel zurück
// verlangt sie, dass vorher die Radzeilen entfernt werden; diese Funktion erledigt das in der
// richtigen Reihenfolge, statt den Nutzer in eine Fehlermeldung laufen zu lassen.
export async function setErfassungsart(
  supabase: SupabaseClient,
  tireStorageId: string,
  art: Erfassungsart
): Promise<void> {
  if (art === "sammel") {
    await qWrite(
      "Die Räder konnten nicht entfernt werden",
      supabase.from("eingelagerte_raeder").delete().eq("tire_storage_id", tireStorageId)
    );
    await qWrite(
      "Die Erfassungsart konnte nicht geändert werden",
      supabase.from("tire_storage").update({ erfassungsart: "sammel", updated_at: new Date().toISOString() }).eq("id", tireStorageId)
    );
    return;
  }
  await qWrite(
    "Die Erfassungsart konnte nicht geändert werden",
    supabase.from("tire_storage")
      .update({ erfassungsart: "einzeln", profiltiefe_mm: null, updated_at: new Date().toISOString() })
      .eq("id", tireStorageId)
  );
}

export async function setAnzahlRaeder(supabase: SupabaseClient, tireStorageId: string, anzahl: number): Promise<void> {
  await qWrite(
    "Die Anzahl der Räder konnte nicht gespeichert werden",
    supabase.from("tire_storage").update({ anzahl_raeder: anzahl, updated_at: new Date().toISOString() }).eq("id", tireStorageId)
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle } from "@/lib/types";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für Fahrzeuge je Kunde. Reine Supabase-Wrapper ohne React-State –
// siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 3.

export type VehicleFields = {
  licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
};

// Aus den Formularfeldern (alles Strings) die Datenbankzeile bauen – einmal für Anlegen und
// Ändern, damit die Umwandlung der Profiltiefe nicht zweimal dasteht.
function toRow(fields: VehicleFields) {
  return {
    license_plate: fields.licensePlate || null,
    make_model: fields.makeModel || null,
    tire_size: fields.tireSize || null,
    tire_dot_date: fields.tireDotDate || null,
    tire_profile_mm: fields.tireProfileMm ? parseFloat(fields.tireProfileMm.replace(",", ".")) : null,
    stored_tire_storage_id: fields.storedTireStorageId || null,
    note: fields.note || null,
  };
}

// Fahrzeuge werden nur noch für den gerade geöffneten Kunden geladen (Roadmap Phase 10).
// Vorher lag die komplette Tabelle im Speicher, obwohl immer nur die Fahrzeuge eines einzigen
// Kunden angezeigt werden – im Kundendetail.
export async function fetchVehiclesFuerKunde(supabase: SupabaseClient, customerId: string): Promise<Vehicle[]> {
  return fetchPaged<Vehicle>("Die Fahrzeuge konnten nicht geladen werden", (von, bis) =>
    supabase.from("vehicles").select("*").eq("customer_id", customerId).order("created_at").range(von, bis)
  );
}

export async function insertVehicle(supabase: SupabaseClient, customerId: string, fields: VehicleFields): Promise<void> {
  await qWrite(
    "Das Fahrzeug konnte nicht angelegt werden",
    supabase.from("vehicles").insert({ customer_id: customerId, ...toRow(fields) })
  );
}

export async function updateVehicleById(supabase: SupabaseClient, id: string, fields: VehicleFields): Promise<void> {
  await qWrite(
    "Das Fahrzeug konnte nicht gespeichert werden",
    supabase.from("vehicles").update({ ...toRow(fields), updated_at: new Date().toISOString() }).eq("id", id)
  );
}

export async function deleteVehicleById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Das Fahrzeug konnte nicht gelöscht werden", supabase.from("vehicles").delete().eq("id", id));
}

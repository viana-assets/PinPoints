import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle } from "@/lib/types";

// Datenzugriffsschicht für Fahrzeuge je Kunde. Reine Supabase-Wrapper ohne React-State –
// siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 3.

export type VehicleFields = {
  licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
};

export async function fetchVehicles(supabase: SupabaseClient): Promise<Vehicle[]> {
  const { data } = await supabase.from("vehicles").select("*").order("created_at");
  return (data as Vehicle[]) || [];
}

export async function insertVehicle(supabase: SupabaseClient, customerId: string, fields: VehicleFields): Promise<void> {
  await supabase.from("vehicles").insert({
    customer_id: customerId,
    license_plate: fields.licensePlate || null,
    make_model: fields.makeModel || null,
    tire_size: fields.tireSize || null,
    tire_dot_date: fields.tireDotDate || null,
    tire_profile_mm: fields.tireProfileMm ? parseFloat(fields.tireProfileMm.replace(",", ".")) : null,
    stored_tire_storage_id: fields.storedTireStorageId || null,
    note: fields.note || null,
  });
}

export async function updateVehicleById(supabase: SupabaseClient, id: string, fields: VehicleFields): Promise<void> {
  await supabase.from("vehicles").update({
    license_plate: fields.licensePlate || null,
    make_model: fields.makeModel || null,
    tire_size: fields.tireSize || null,
    tire_dot_date: fields.tireDotDate || null,
    tire_profile_mm: fields.tireProfileMm ? parseFloat(fields.tireProfileMm.replace(",", ".")) : null,
    stored_tire_storage_id: fields.storedTireStorageId || null,
    note: fields.note || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

export async function deleteVehicleById(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("vehicles").delete().eq("id", id);
}

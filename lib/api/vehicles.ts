import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle } from "@/lib/types";
import { fetchPaged, qOne, qWrite } from "./client";

// Datenzugriffsschicht für Fahrzeuge je Kunde. Reine Supabase-Wrapper ohne React-State –
// siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 3.

export type VehicleFields = {
  licensePlate: string; makeModel: string; tireSize: string; note: string;
};

// Aus den Formularfeldern (alles Strings) die Datenbankzeile bauen – einmal für Anlegen und
// Ändern.
function toRow(fields: VehicleFields) {
  return {
    license_plate: fields.licensePlate || null,
    make_model: fields.makeModel || null,
    tire_size: fields.tireSize || null,
    note: fields.note || null,
  };
}

// Fahrzeuge werden nur noch für den gerade geöffneten Kunden geladen (Roadmap Phase 10).
// Vorher lag die komplette Tabelle im Speicher, obwohl immer nur die Fahrzeuge eines einzigen
// Kunden angezeigt werden – im Kundendetail.
// Alle Fahrzeuge auf einmal. Gebraucht dort, wo nicht ein einzelner Kunde offen ist, sondern
// viele Sätze nebeneinander stehen: im Lager-Modul (welches Auto gehört zu diesem Satz?) und
// in der Saisonliste. Die Tabelle ist klein – ein Auto je Kunde als Größenordnung –, deshalb
// ist ein Vollabzug hier billiger als 400 Einzelabfragen.
export async function fetchVehicles(supabase: SupabaseClient): Promise<Vehicle[]> {
  return fetchPaged<Vehicle>("Die Fahrzeuge konnten nicht geladen werden", (von, bis) =>
    supabase.from("vehicles").select("*").order("created_at").range(von, bis)
  );
}

export async function fetchVehiclesFuerKunde(supabase: SupabaseClient, customerId: string): Promise<Vehicle[]> {
  return fetchPaged<Vehicle>("Die Fahrzeuge konnten nicht geladen werden", (von, bis) =>
    supabase.from("vehicles").select("*").eq("customer_id", customerId).order("created_at").range(von, bis)
  );
}

// Gibt die Kennung des angelegten Fahrzeugs zurück. Gebraucht wird sie dort, wo das Anlegen
// nur der halbe Vorgang ist: Im Auftragsfenster soll das neue Auto dem eingelagerten Satz
// gleich zugeordnet werden – sonst hätte der Techniker es angelegt und müsste es anschließend
// noch in einer Auswahlliste suchen, in der genau ein Eintrag steht.
export async function insertVehicle(supabase: SupabaseClient, customerId: string, fields: VehicleFields): Promise<string> {
  const angelegt = await qOne<{ id: string }>(
    "Das Fahrzeug konnte nicht angelegt werden",
    supabase.from("vehicles").insert({ customer_id: customerId, ...toRow(fields) }).select("id").single()
  );
  return angelegt.id;
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

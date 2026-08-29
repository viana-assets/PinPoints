import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactHistoryEntry, Customer } from "@/lib/types";
import { geocodeAddress } from "@/lib/helpers";
import { fetchPaged, q, qOne, qWrite } from "./client";

// Datenzugriffsschicht für Kunden und deren Kontakt-Historie. Reine Supabase-Wrapper ohne
// React-State – siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 3. Fehlerbehandlung und Seitenweise-Laden: siehe ./client.ts.

export async function fetchCustomers(supabase: SupabaseClient): Promise<Customer[]> {
  return fetchPaged<Customer>("Kunden konnten nicht geladen werden", (von, bis) =>
    supabase.from("customers").select("*").is("deleted_at", null).order("name").range(von, bis)
  );
}

export async function fetchContactHistory(supabase: SupabaseClient, customerId: string): Promise<ContactHistoryEntry[]> {
  const data = await q<ContactHistoryEntry[]>(
    "Die Kontakt-Historie konnte nicht geladen werden",
    supabase
      .from("contact_history")
      .select("*")
      .eq("customer_id", customerId)
      .order("date", { ascending: false })
      .limit(8)
  );
  return data || [];
}

export async function markCustomerContacted(supabase: SupabaseClient, id: string, contactDate: string, note: string): Promise<void> {
  await qWrite(
    "Der Kontakt konnte nicht gespeichert werden",
    supabase.from("customers").update({ status: "kontaktiert", last_contact: contactDate }).eq("id", id)
  );
  await qWrite(
    "Der Eintrag in der Kontakt-Historie konnte nicht gespeichert werden",
    supabase.from("contact_history").insert({ customer_id: id, date: contactDate, note })
  );
}

export async function markCustomerOpen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Der Kunde konnte nicht auf offen gesetzt werden",
    supabase.from("customers").update({ status: "offen" }).eq("id", id)
  );
}

export async function setCustomerActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  await qWrite(
    active ? "Der Kunde konnte nicht reaktiviert werden" : "Der Kunde konnte nicht deaktiviert werden",
    supabase.from("customers").update({ active }).eq("id", id)
  );
}

// Soft-Delete seit Migration 19: der Kunde verschwindet aus allen Listen, bleibt aber
// erhalten – und ein Datenbank-Trigger markiert seine Aufträge (und deren Positionen) mit,
// so wie es vorher die Kettenlöschung über die Fremdschlüssel getan hat.
export async function deleteCustomerRow(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Der Kunde konnte nicht gelöscht werden",
    supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  );
}

// Ändert sich bei diesem Aufruf die Adresse, wird zuerst die Kartenposition zurückgesetzt und
// danach neu geocodiert (statt die alte, jetzt falsche Position stehen zu lassen) – schlägt das
// Geocoding fehl, bleibt der Kunde einfach ohne Kartenposition, statt den ganzen Speichervorgang
// abzubrechen. Das Speichern selbst meldet einen Fehler dagegen sehr wohl.
export async function updateCustomerFieldsById(supabase: SupabaseClient, id: string, fields: Partial<Customer>, previousAddress: string | undefined): Promise<void> {
  const addressChanged = !!fields.address && fields.address !== previousAddress;
  const patch: Partial<Customer> = { ...fields };
  if (!addressChanged) {
    await qWrite("Die Kundendaten konnten nicht gespeichert werden", supabase.from("customers").update(patch).eq("id", id));
    return;
  }
  patch.lat = null;
  patch.lng = null;
  await qWrite("Die Kundendaten konnten nicht gespeichert werden", supabase.from("customers").update(patch).eq("id", id));
  try {
    const res = await geocodeAddress(fields.address!);
    if (res) {
      await qWrite(
        "Die Kartenposition konnte nicht gespeichert werden",
        supabase.from("customers").update({ lat: res.lat, lng: res.lng }).eq("id", id)
      );
    }
  } catch {
    // Geocoding ist bewusst unkritisch: der Kunde ist gespeichert, nur ohne Kartenposition.
  }
}

// Legt einen Kunden an und versucht, die Adresse zu geocodieren – gibt die neue Kunden-ID sowie
// lat/lng zurück (null, wenn das Geocoding fehlschlägt), damit die aufrufende Stelle weiß, ob ein
// Auftrag im gleichen Zug mit angelegt werden kann und ob eine Kartenposition gefunden wurde.
export async function insertCustomer(supabase: SupabaseClient, fields: {
  name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
}): Promise<{ id: string | undefined; lat: number | null; lng: number | null }> {
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const res = await geocodeAddress(fields.address);
    if (res) { lat = res.lat; lng = res.lng; }
  } catch {
    // siehe oben – ohne Kartenposition anlegen ist besser als gar nicht anlegen.
  }
  const { name, address, phone_mobile, phone_landline, note } = fields;
  const created = await qOne<{ id: string }>(
    "Der Kunde konnte nicht angelegt werden",
    supabase
      .from("customers")
      .insert({ name, address, phone_mobile, phone_landline, note, lat, lng, status: "offen", active: true })
      .select("id")
      .single()
  );
  return { id: created.id, lat, lng };
}

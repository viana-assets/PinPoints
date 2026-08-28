import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactHistoryEntry, Customer } from "@/lib/types";
import { geocodeAddress } from "@/lib/helpers";

// Datenzugriffsschicht für Kunden und deren Kontakt-Historie. Reine Supabase-Wrapper ohne
// React-State – siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 3.

export async function fetchCustomers(supabase: SupabaseClient): Promise<Customer[]> {
  const { data } = await supabase.from("customers").select("*").order("name");
  return (data as Customer[]) || [];
}

export async function fetchContactHistory(supabase: SupabaseClient, customerId: string): Promise<ContactHistoryEntry[]> {
  const { data } = await supabase
    .from("contact_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("date", { ascending: false })
    .limit(8);
  return (data as ContactHistoryEntry[]) || [];
}

export async function markCustomerContacted(supabase: SupabaseClient, id: string, contactDate: string, note: string): Promise<void> {
  await supabase.from("customers").update({ status: "kontaktiert", last_contact: contactDate }).eq("id", id);
  await supabase.from("contact_history").insert({ customer_id: id, date: contactDate, note });
}

export async function markCustomerOpen(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("customers").update({ status: "offen" }).eq("id", id);
}

export async function setCustomerActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  await supabase.from("customers").update({ active }).eq("id", id);
}

export async function deleteCustomerRow(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("customers").delete().eq("id", id);
}

// Ändert sich bei diesem Aufruf die Adresse, wird zuerst die Kartenposition zurückgesetzt und
// danach neu geocodiert (statt die alte, jetzt falsche Position stehen zu lassen) – schlägt das
// Geocoding fehl, bleibt der Kunde einfach ohne Kartenposition, statt den ganzen Speichervorgang
// abzubrechen.
export async function updateCustomerFieldsById(supabase: SupabaseClient, id: string, fields: Partial<Customer>, previousAddress: string | undefined): Promise<void> {
  const addressChanged = !!fields.address && fields.address !== previousAddress;
  const patch: Partial<Customer> = { ...fields };
  if (addressChanged) {
    patch.lat = null; patch.lng = null;
    await supabase.from("customers").update(patch).eq("id", id);
    try {
      const res = await geocodeAddress(fields.address!);
      if (res) await supabase.from("customers").update({ lat: res.lat, lng: res.lng }).eq("id", id);
    } catch {}
  } else {
    await supabase.from("customers").update(patch).eq("id", id);
  }
}

// Legt einen Kunden an und versucht, die Adresse zu geocodieren – gibt die neue Kunden-ID sowie
// lat/lng zurück (null, wenn das Geocoding fehlschlägt), damit die aufrufende Stelle weiß, ob ein
// Auftrag im gleichen Zug mit angelegt werden kann und ob eine Kartenposition gefunden wurde.
export async function insertCustomer(supabase: SupabaseClient, fields: {
  name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
}): Promise<{ id: string | undefined; lat: number | null; lng: number | null }> {
  let lat: number | null = null, lng: number | null = null;
  try {
    const res = await geocodeAddress(fields.address);
    if (res) { lat = res.lat; lng = res.lng; }
  } catch {}
  const { name, address, phone_mobile, phone_landline, note } = fields;
  const { data: created } = await supabase
    .from("customers")
    .insert({ name, address, phone_mobile, phone_landline, note, lat, lng, status: "offen", active: true })
    .select("id")
    .single();
  return { id: created?.id as string | undefined, lat, lng };
}

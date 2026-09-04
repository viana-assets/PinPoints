import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactHistoryEntry, Customer, KontaktErgebnis } from "@/lib/types";
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

// Ein Kontakt wird immer mit seinem ERGEBNIS festgehalten (Migration 23). Beides in einem
// Aufruf, weil es fachlich ein Vorgang ist: es gibt keinen Kontakt ohne Ergebnis und kein
// Ergebnis ohne Kontakt. Zwei getrennte Funktionen könnten auseinanderlaufen und einen Kunden
// hinterlassen, der als kontaktiert gilt, aber kein Ergebnis trägt.
export async function markCustomerContacted(
  supabase: SupabaseClient,
  id: string,
  contactDate: string,
  note: string,
  ergebnis: KontaktErgebnis,
  wiedervorlageAm: string | null
): Promise<void> {
  await qWrite(
    "Der Kontakt konnte nicht gespeichert werden",
    supabase.from("customers").update({
      status: "kontaktiert",
      last_contact: contactDate,
      kontakt_ergebnis: ergebnis,
      // Immer mitgeschrieben, auch als null: sonst bliebe die Wiedervorlage eines früheren
      // Anrufs stehen, obwohl der Kunde inzwischen einen Auftrag erteilt oder abgesagt hat –
      // und die Karte zeigte weiter orange.
      wiedervorlage_am: wiedervorlageAm,
    }).eq("id", id)
  );
  await qWrite(
    "Der Eintrag in der Kontakt-Historie konnte nicht gespeichert werden",
    supabase.from("contact_history").insert({ customer_id: id, date: contactDate, note })
  );
}

// „Auf offen setzen" räumt auch das Ergebnis ab: der Kunde soll wieder auf der Anrufliste
// stehen, und ein stehengebliebenes „kein Interesse" oder eine alte Wiedervorlage würden ihn
// auf der Karte weiterhin aus dieser Liste heraushalten.
export async function markCustomerOpen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Der Kunde konnte nicht auf offen gesetzt werden",
    supabase.from("customers").update({ status: "offen", kontakt_ergebnis: null, wiedervorlage_am: null }).eq("id", id)
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
  company: string; email: string; anrede: "" | "Herr" | "Frau";
  // Aus einem angenommenen Adressvorschlag (Migration 25). Ist sie da, entfällt die
  // Geokodierung – die Koordinate stammt dann aus demselben Treffer wie der Adresstext und
  // kann gar nicht dazu unpassend sein.
  koordinate?: { lat: number; lng: number } | null;
}): Promise<{ id: string | undefined; lat: number | null; lng: number | null }> {
  let lat: number | null = fields.koordinate?.lat ?? null;
  let lng: number | null = fields.koordinate?.lng ?? null;
  if (lat === null) {
    try {
      const res = await geocodeAddress(fields.address);
      if (res) { lat = res.lat; lng = res.lng; }
    } catch {
      // siehe oben – ohne Kartenposition anlegen ist besser als gar nicht anlegen.
    }
  }
  const { name, address, phone_mobile, phone_landline, note } = fields;
  const created = await qOne<{ id: string }>(
    "Der Kunde konnte nicht angelegt werden",
    supabase
      .from("customers")
      .insert({
        name, address, phone_mobile, phone_landline, note, lat, lng, status: "offen", active: true,
        // Leere Felder als null, nicht als leere Zeichenkette – sonst stünde "" neben null für
        // dieselbe Aussage, und die Prüfbedingung auf `anrede` lehnt "" ohnehin ab.
        company: fields.company.trim() || null,
        email: fields.email.trim() || null,
        anrede: fields.anrede || null,
      })
      .select("id")
      .single()
  );
  return { id: created.id, lat, lng };
}

// ---------------------------------------------------------------------------------------
// Sammellauf Geokodierung (siehe components/admin/GeokodierLauf.tsx)
// ---------------------------------------------------------------------------------------

// Alle Kunden, die eine Adresse haben, aber keine Kartenposition. Bewusst nur die beiden
// Felder, die der Lauf braucht: bei einigen hundert Zeilen ist das der Unterschied zwischen
// einer schlanken Liste und dem halben Kundenstamm im Arbeitsspeicher.
// Kunden mit Adresse, aber ohne Kartenposition. Benutzt von beiden Werkzeugen unter
// Admin → Wartung: dem Sammellauf (braucht nur die Adresse) und der Korrekturliste (braucht
// zusätzlich den Namen). Bewusst EINE Abfrage mit drei Spalten statt zweier Varianten – der
// Name ist ein Textfeld, und zwei Abfragen für denselben Zweck laufen mit der Zeit auseinander.
export async function fetchKundenOhneKoordinaten(
  supabase: SupabaseClient
): Promise<{ id: string; address: string; name: string }[]> {
  return fetchPaged<{ id: string; address: string; name: string }>(
    "Die Kunden ohne Kartenposition konnten nicht geladen werden",
    (von, bis) =>
      supabase
        .from("customers")
        .select("id,address,name")
        .is("lat", null)
        .is("deleted_at", null)
        .neq("address", "")
        .order("name")
        .range(von, bis)
  );
}

// Adresse UND Koordinate in einem Schreibvorgang. Getrennt zu speichern hieße, einen Moment
// lang eine Adresse mit der Position der alten zu haben – und wenn der zweite Schreibvorgang
// scheitert, bliebe es dabei.
export async function uebernehmeAdresse(
  supabase: SupabaseClient, id: string, address: string, lat: number, lng: number
): Promise<void> {
  await qWrite(
    "Die Adresse konnte nicht übernommen werden",
    supabase.from("customers").update({ address, lat, lng }).eq("id", id)
  );
}

export async function setzeKundenKoordinaten(supabase: SupabaseClient, id: string, lat: number, lng: number): Promise<void> {
  await qWrite(
    "Die Kartenposition konnte nicht gespeichert werden",
    supabase.from("customers").update({ lat, lng }).eq("id", id)
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderStatus } from "@/lib/types";
import { fetchPaged, qOne, qWrite } from "./client";

// Datenzugriffsschicht für Aufträge/Termine (ein Termin ist ein Auftrag mit Uhrzeit, siehe
// Migration 07) und die Mitarbeiter-Zuordnung (`order_employees`, Migration 11). Reine
// Supabase-Wrapper ohne React-State – siehe lib/api/employees.ts für das Muster. Ausgelagert
// aus app/page.tsx, siehe docs/roadmap.md Phase 3.

export async function fetchOrders(supabase: SupabaseClient): Promise<Order[]> {
  return fetchPaged<Order>("Die Aufträge konnten nicht geladen werden", (von, bis) =>
    supabase.from("orders").select("*").is("deleted_at", null).order("order_date", { ascending: false }).range(von, bis)
  );
}

export async function fetchOrderEmployeesMap(supabase: SupabaseClient): Promise<Record<string, string[]>> {
  const rows = await fetchPaged<{ order_id: string; employee_id: string }>(
    "Die Mitarbeiter-Zuordnungen konnten nicht geladen werden",
    (von, bis) => supabase.from("order_employees").select("order_id, employee_id").range(von, bis)
  );
  const map: Record<string, string[]> = {};
  rows.forEach((r) => {
    (map[r.order_id] ||= []).push(r.employee_id);
  });
  return map;
}

// Ersetzt die komplette Mitarbeiter-Zuordnung eines Auftrags (löschen + neu einfügen ist bei
// dieser kleinen Zeilenzahl pro Auftrag einfacher und robuster als ein Diff).
export async function replaceOrderEmployees(supabase: SupabaseClient, orderId: string, employeeIds: string[]): Promise<void> {
  await qWrite(
    "Die bisherige Mitarbeiter-Zuordnung konnte nicht entfernt werden",
    supabase.from("order_employees").delete().eq("order_id", orderId)
  );
  const unique = Array.from(new Set(employeeIds.filter(Boolean)));
  if (unique.length) {
    await qWrite(
      "Die Mitarbeiter-Zuordnung konnte nicht gespeichert werden",
      supabase.from("order_employees").insert(unique.map((employeeId) => ({ order_id: orderId, employee_id: employeeId })))
    );
  }
}

// Legt einen Auftrag/Termin an und gibt seine ID zurück – die aufrufende Stelle entscheidet
// selbst, ob/welche Mitarbeiter im Anschluss zugeordnet werden (z. B. beim gleichzeitigen
// Anlegen von Kunde + erstem Auftrag).
export async function insertOrder(supabase: SupabaseClient, fields: {
  customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus;
}): Promise<string> {
  const created = await qOne<{ id: string }>(
    "Der Auftrag konnte nicht angelegt werden",
    supabase.from("orders").insert({
      customer_id: fields.customerId, title: fields.title, description: fields.description || null,
      order_date: fields.orderDate, time: fields.time || null, status: fields.status,
    }).select("id").single()
  );
  return created.id;
}

export async function updateOrderById(supabase: SupabaseClient, id: string, fields: {
  title: string; description: string; orderDate: string; time: string; status: OrderStatus;
}): Promise<void> {
  await qWrite(
    "Der Auftrag konnte nicht gespeichert werden",
    supabase.from("orders").update({
      title: fields.title, description: fields.description || null, order_date: fields.orderDate,
      time: fields.time || null, status: fields.status,
    }).eq("id", id)
  );
}

export async function updateOrderStatusById(supabase: SupabaseClient, id: string, status: OrderStatus): Promise<void> {
  await qWrite(
    "Der Status konnte nicht geändert werden",
    supabase.from("orders").update({ status }).eq("id", id)
  );
}

// Freitext-Notiz der zugeordneten Techniker-Rolle (siehe lib/types.ts Order.techniker_notiz).
// Migration 13/15 erlaubt der Techniker-Rolle per RLS nur, `status` und `techniker_notiz` an
// einem ihr zugeordneten Auftrag zu ändern – jeder andere Spaltenwert wird von einem
// Datenbank-Trigger abgelehnt, auch wenn hier versehentlich mehr mitgeschickt würde.
export async function updateOrderTechnikerNotiz(supabase: SupabaseClient, id: string, notiz: string): Promise<void> {
  await qWrite(
    "Die Notiz konnte nicht gespeichert werden",
    supabase.from("orders").update({ techniker_notiz: notiz || null }).eq("id", id)
  );
}

// Soft-Delete seit Migration 19 (siehe lib/api/customers.ts). Die zugeordneten Leistungen
// markiert ein Trigger mit – sie bleiben für eine spätere Rechnung nachvollziehbar.
export async function deleteOrderById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Der Auftrag konnte nicht gelöscht werden",
    supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderArticle, OrderStatus } from "@/lib/types";
import { fetchPaged, qOne, qWrite } from "./client";

// Datenzugriffsschicht für Aufträge/Termine (ein Termin ist ein Auftrag mit Uhrzeit, siehe
// Migration 07) und die Mitarbeiter-Zuordnung (`order_employees`, Migration 11). Reine
// Supabase-Wrapper ohne React-State – siehe lib/api/employees.ts für das Muster. Ausgelagert
// aus app/page.tsx, siehe docs/roadmap.md Phase 3.

// Anders als Kunden (feste Größe, ~4500) wachsen Aufträge über die Jahre unbegrenzt. Deshalb
// wird nicht mehr die ganze Tabelle geladen, sondern ein Zeitfenster – umschaltbar in der
// Oberfläche (Roadmap Phase 10). "aktuell" ist der Standard und enthält immer ALLE offenen
// Aufträge, egal wie alt: was noch zu tun ist, darf nie aus dem Blick geraten.
export type AuftragsFenster = "aktuell" | "jahr" | "alles";

export const AUFTRAGSFENSTER_LABEL: Record<AuftragsFenster, string> = {
  aktuell: "Aktuell",
  jahr: "Dieses Jahr",
  alles: "Alle",
};

// Ab welchem Datum erledigte Aufträge noch mitgeladen werden. null = ohne Begrenzung.
export function fensterStartdatum(fenster: AuftragsFenster): string | null {
  if (fenster === "alles") return null;
  if (fenster === "jahr") return `${new Date().getFullYear()}-01-01`;
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Ein Auftrag samt seiner Mitarbeiter- und Leistungs-Zuordnungen. Die beiden Verknüpfungen
// kommen in derselben Abfrage mit, statt als zwei weitere Vollabzüge über eigene Tabellen –
// so passen sie immer zum geladenen Zeitfenster und können gar nicht auseinanderlaufen.
type AuftragMitBezug = Order & {
  order_employees: { employee_id: string }[] | null;
  order_articles: OrderArticle[] | null;
};

export type Auftragsdaten = {
  orders: Order[];
  orderEmployees: Record<string, string[]>;
  orderArticles: OrderArticle[];
};

const AUFTRAG_MIT_BEZUG = "*, order_employees(employee_id), order_articles(*)";

// Zerlegt die verschachtelte Antwort in die drei flachen Strukturen, die die Oberfläche
// erwartet – dort ändert sich dadurch nichts.
function aufteilen(zeilen: AuftragMitBezug[]): Auftragsdaten {
  const orders: Order[] = [];
  const orderEmployees: Record<string, string[]> = {};
  const orderArticles: OrderArticle[] = [];
  zeilen.forEach((zeile) => {
    const { order_employees, order_articles, ...auftrag } = zeile;
    orders.push(auftrag as Order);
    orderEmployees[zeile.id] = (order_employees || []).map((z) => z.employee_id);
    // Soft-gelöschte Positionen hier herausfiltern statt in der Abfrage: das Filtern auf
    // eingebetteten Tabellen verhält sich je nach PostgREST-Version unterschiedlich, und die
    // Zeilenzahl je Auftrag ist klein genug, dass es keinen Unterschied macht.
    (order_articles || []).forEach((pos) => {
      if (!pos.deleted_at) orderArticles.push(pos);
    });
  });
  return { orders, orderEmployees, orderArticles };
}

export async function fetchOrders(supabase: SupabaseClient, fenster: AuftragsFenster = "aktuell"): Promise<Auftragsdaten> {
  const ab = fensterStartdatum(fenster);
  const zeilen = await fetchPaged<AuftragMitBezug>("Die Aufträge konnten nicht geladen werden", (von, bis) => {
    const abfrage = supabase
      .from("orders")
      .select(AUFTRAG_MIT_BEZUG)
      .is("deleted_at", null)
      .order("order_date", { ascending: false })
      .range(von, bis);
    // Offene Aufträge kommen immer mit, auch wenn sie älter sind als das Fenster.
    return ab ? abfrage.or(`order_date.gte.${ab},status.neq.erledigt`) : abfrage;
  });
  return aufteilen(zeilen);
}

// Vollständige Auftragshistorie eines einzelnen Kunden – ohne Zeitfenster. Das Kundendetail
// soll alles zeigen, was es zu diesem Kunden je gab; die Zeilenzahl ist dabei je Kunde klein.
export async function fetchOrdersFuerKunde(supabase: SupabaseClient, customerId: string): Promise<Auftragsdaten> {
  const zeilen = await fetchPaged<AuftragMitBezug>(
    "Die Aufträge dieses Kunden konnten nicht geladen werden",
    (von, bis) =>
      supabase
        .from("orders")
        .select(AUFTRAG_MIT_BEZUG)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .range(von, bis)
  );
  return aufteilen(zeilen);
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
  vehicleId?: string | null;
}): Promise<string> {
  const created = await qOne<{ id: string }>(
    "Der Auftrag konnte nicht angelegt werden",
    supabase.from("orders").insert({
      customer_id: fields.customerId, title: fields.title, description: fields.description || null,
      order_date: fields.orderDate, time: fields.time || null, status: fields.status,
      vehicle_id: fields.vehicleId || null,
    }).select("id").single()
  );
  return created.id;
}

export async function updateOrderById(supabase: SupabaseClient, id: string, fields: {
  title: string; description: string; orderDate: string; time: string; status: OrderStatus;
  vehicleId?: string | null;
}): Promise<void> {
  await qWrite(
    "Der Auftrag konnte nicht gespeichert werden",
    supabase.from("orders").update({
      title: fields.title, description: fields.description || null, order_date: fields.orderDate,
      time: fields.time || null, status: fields.status,
      ...(fields.vehicleId === undefined ? {} : { vehicle_id: fields.vehicleId || null }),
    }).eq("id", id)
  );
}

// Nur das Fahrzeug ändern – im Auftragsfenster wird die Auswahl sofort gespeichert, ohne dass
// dafür das ganze Formular abgeschickt werden muss.
export async function updateOrderVehicle(supabase: SupabaseClient, id: string, vehicleId: string | null): Promise<void> {
  await qWrite(
    "Das Fahrzeug konnte nicht gespeichert werden",
    supabase.from("orders").update({ vehicle_id: vehicleId || null }).eq("id", id)
  );
}

// Zustandswechsel eines Auftrags (Migration 20). Welche Übergänge erlaubt sind, entscheidet ein
// Datenbank-Trigger – nicht diese Funktion: eine Prüfung im Browser wäre eine Bitte, keine Regel.
// Lehnt die Datenbank ab, kommt der Grund als Fehlermeldung zurück und landet über die zentrale
// Anzeige beim Nutzer (siehe lib/api/client.ts).
//
// `grund` wird bei einer Stornierung und bei einer Wiedereröffnung verlangt; die Zeitstempel
// (completed_at, cancelled_at) und die handelnde Person setzt die Datenbank selbst.
export async function updateOrderStatusById(
  supabase: SupabaseClient,
  id: string,
  status: OrderStatus,
  grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }
): Promise<void> {
  const felder: Record<string, unknown> = { status };
  if (grund?.stornoGrund !== undefined) felder.cancel_reason = grund.stornoGrund;
  if (grund?.wiedereroeffnungsGrund !== undefined) felder.reopen_reason = grund.wiedereroeffnungsGrund;
  await qWrite(
    "Der Status konnte nicht geändert werden",
    supabase.from("orders").update(felder).eq("id", id)
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

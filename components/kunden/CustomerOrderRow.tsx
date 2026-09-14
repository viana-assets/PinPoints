import type { Employee, Order, OrderArticle } from "@/lib/types";
import { formatEUR, formatOrderDateTime, isOrderPast, orderArticleTotals } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, istAbgeschlossen } from "@/lib/constants";

// Ein Auftrag/Termin im Kunden-Detailfenster – als ZUSAMMENFASSUNG mit einem Weg hinein,
// nicht als zweite Bearbeitungsmaske.
//
// Bis zum 12.09.2026 stand hier ein eigenes Formular: Titel, Datum, Uhrzeit, Beschreibung,
// Mitarbeiter – und darunter die Leistungen. Ein zweites Auftragsfenster also, nur kleiner
// und mit weniger Möglichkeiten. Wer daran Lagerplatz, Saison oder Profiltiefe pflegen
// wollte, musste das Kundenfenster verlassen und den Auftrag über den Auftrags-Reiter neu
// suchen. Der Befund aus dem Betrieb war entsprechend: „Das ist nicht konsistent."
//
// Jetzt gibt es genau EINE Stelle, an der ein Auftrag bearbeitet wird – das Auftragsfenster.
// Hier steht, was man im Überblick braucht: wann, welcher Zustand, wer fährt, was drauf
// steht. Und ein Knopf, der das richtige Fenster öffnet.
//
// Das ist dieselbe Entscheidung wie bei `vehicles.stored_tire_storage_id` (Migration 30) und
// bei der Profiltiefe (Migration 33), nur für Oberflächen statt für Daten: Es gibt die Sache
// einmal, nicht zweimal.

export function CustomerOrderRow({ order, employees, assignedEmployeeIds, orderArticles, onOpen, onDelete }: {
  order: Order;
  employees: Employee[];
  assignedEmployeeIds: string[];
  // Nur zum Anzeigen – geändert werden die Positionen im Auftragsfenster.
  orderArticles: OrderArticle[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const gesperrt = istAbgeschlossen(order.status);
  const past = isOrderPast(order);
  const empNames = employees.filter((e) => assignedEmployeeIds.includes(e.id)).map((e) => e.name).join(", ");
  const summen = orderArticleTotals(orderArticles);

  return (
    <div className="appt-item klickbar" onClick={() => onOpen(order.id)} title="Auftrag öffnen">
      <div>
        <span className="appt-date">{formatOrderDateTime(order)}</span>
        {past && !gesperrt ? " (vergangen)" : ""}{" "}
        <span className={`badge ${ORDER_STATUS_FARBE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
      </div>
      <div><span className="small">Auftrag {order.order_number}</span> · {order.title}{order.description ? ` – ${order.description}` : ""}</div>
      {empNames && <div className="small">👤 {empNames}</div>}
      <div className="small">
        {orderArticles.length === 0
          ? "Noch keine Leistungen zugeordnet."
          : `${orderArticles.length} ${orderArticles.length === 1 ? "Leistung" : "Leistungen"} · ${formatEUR(summen.gross)} brutto`}
      </div>
      {/* Die Knöpfe halten den Klick an, damit ein „Löschen" nicht nebenbei auch das
          Auftragsfenster öffnet. */}
      <div className="appt-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-primary" onClick={() => onOpen(order.id)}>Auftrag öffnen</button>
        <button
          type="button" className="btn-secondary" style={{ color: "#b33" }}
          onClick={() => { if (confirm("Diesen Auftrag wirklich löschen?")) onDelete(order.id); }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

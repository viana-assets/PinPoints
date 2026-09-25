import type { Employee, Order, OrderArticle } from "@/lib/types";
import { formatEUR, formatOrderDateTime, isOrderPast, orderArticleTotals } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, istAbgeschlossen } from "@/lib/constants";
import { datumKurz } from "@/lib/dashboard";
import { auftragsNr } from "@/lib/testkunde";

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

// Seit 26.09.2026 (Entwurf O) eine Karte wie in der Auftragsliste: Datum links, Titel und
// Angaben in der Mitte, Zustand rechts. Das Löschen steht nicht mehr hier, sondern im Menü
// des Auftragsfensters – dort, wo auch die Rechte dazu geprüft und erklärt werden.

export function CustomerOrderRow({ order, employees, assignedEmployeeIds, orderArticles, onOpen }: {
  order: Order;
  employees: Employee[];
  assignedEmployeeIds: string[];
  // Nur zum Anzeigen – geändert werden die Positionen im Auftragsfenster.
  orderArticles: OrderArticle[];
  onOpen: (id: string) => void;
}) {
  const gesperrt = istAbgeschlossen(order.status);
  const past = isOrderPast(order);
  const empNames = employees.filter((e) => assignedEmployeeIds.includes(e.id)).map((e) => e.name).join(", ");
  const summen = orderArticleTotals(orderArticles, order.rechnung_noetig);
  const angaben = [
    `#${auftragsNr(order.order_number)}`,
    order.time ? `${order.time.slice(0, 5)} Uhr` : null,
    empNames || null,
    orderArticles.length === 0 ? "keine Leistungen" : `${formatEUR(order.rechnung_noetig ? summen.gross : summen.net)}${order.rechnung_noetig ? " brutto" : " netto"}`,
  ].filter(Boolean).join(" · ");

  return (
    <button type="button" className={"dm-auftrag" + (past && !gesperrt ? " vergangen" : "")} onClick={() => onOpen(order.id)} title={`Auftrag öffnen – ${formatOrderDateTime(order)}`}>
      <span className="dm-datum">
        <b>{order.order_date ? datumKurz(order.order_date) : "ohne"}</b>
        <span>{order.order_date ? order.order_date.slice(0, 4) : "Datum"}</span>
      </span>
      <span className="dm-auftrag-text">
        <b>{order.title}{past && !gesperrt ? " (vergangen)" : ""}</b>
        <span className="small">{angaben}</span>
        {/* Nur bei Aufträgen der Laufkundschaft gefüllt (Migration 57): In deren Kundenakte ist das
            die Liste aller Barverkäufe – und hier steht, wer es jeweils war. */}
        {(order.laufkunde_name || order.laufkunde_ort) && (
          <span className="small">🧾 {[order.laufkunde_name, order.laufkunde_telefon, order.laufkunde_ort].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <span className={`dm-status ${ORDER_STATUS_FARBE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
    </button>
  );
}

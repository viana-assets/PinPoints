import { useState } from "react";
import type { Article, Employee, Order, OrderArticle, OrderStatus } from "@/lib/types";
import { formatOrderDateTime, isOrderPast } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, istAbgeschlossen } from "@/lib/constants";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { ArticleAssignPanel } from "@/components/auftraege/ArticleAssignPanel";

// Ein Auftrag/Termin-Eintrag im Kunden-Detailfenster: Anzeige, Inline-Bearbeitung sowie die
// eingebettete Leistungen/Artikel-Zuordnung (ArticleAssignPanel). Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 2.
export function CustomerOrderRow({
  order, employees, assignedEmployeeIds, onUpdate, onDelete,
  articles, orderArticles, onAddArticle, onUpdateArticleQty, onUpdateArticleDiscount, onRemoveArticle,
}: {
  order: Order; employees: Employee[]; assignedEmployeeIds: string[];
  onUpdate: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onDelete: (id: string) => void;
  articles: Article[];
  orderArticles: OrderArticle[];
  onAddArticle: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateArticleDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemoveArticle: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(order.title);
  const [date, setDate] = useState(order.order_date);
  const [time, setTime] = useState(order.time || "");
  const [desc, setDesc] = useState(order.description || "");
  const [empIds, setEmpIds] = useState<string[]>(assignedEmployeeIds);
  // Der Status wird hier nicht mehr bearbeitet: seit Migration 20 sind Zustandswechsel benannte
  // Handlungen im Auftragsfenster, keine Auswahl in einem Formular (docs/auftragsablauf.md).
  const status: OrderStatus = order.status;
  const gesperrt = istAbgeschlossen(order.status);
  const past = isOrderPast(order);
  const statusLabel = ORDER_STATUS_LABEL;
  const empNames = employees.filter((e) => assignedEmployeeIds.includes(e.id)).map((e) => e.name).join(", ");

  if (editing) {
    return (
      <div className="appt-item">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={{ marginBottom: 4 }} />
        <div className="row" style={{ marginBottom: 4 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Beschreibung" />
        <div className="small" style={{ marginBottom: 2 }}>Mitarbeiter</div>
        <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
        <div className="appt-actions">
          <button className="btn-primary" onClick={() => { onUpdate(order.id, { title, description: desc, orderDate: date, time, status, assignedEmployeeIds: empIds }); setEditing(false); }}>Speichern</button>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appt-item">
      <div><span className="appt-date">{formatOrderDateTime(order)}</span>{past && !gesperrt ? " (vergangen)" : ""} <span className={`badge ${ORDER_STATUS_FARBE[order.status]}`}>{statusLabel[order.status]}</span></div>
      <div><span className="small">Auftrag {order.order_number}</span> · {order.title}{order.description ? ` – ${order.description}` : ""}</div>
      {empNames && <div className="small">👤 {empNames}</div>}
      <div className="appt-actions">
        {!gesperrt && <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>}
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Diesen Auftrag wirklich löschen?")) onDelete(order.id); }}>Löschen</button>
      </div>
      <hr style={{ margin: "6px 0" }} />
      <ArticleAssignPanel
        orderId={order.id}
        articles={articles}
        rows={orderArticles}
        gesperrt={gesperrt}
        onAdd={onAddArticle}
        onUpdateQty={onUpdateArticleQty}
        onUpdateDiscount={onUpdateArticleDiscount}
        onRemove={onRemoveArticle}
      />
    </div>
  );
}

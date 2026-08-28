import { useState } from "react";
import type { Article, Employee, Order, OrderArticle, OrderStatus } from "@/lib/types";
import { formatOrderDateTime, isOrderPast } from "@/lib/helpers";
import { ORDER_STATUS_LABEL } from "@/lib/constants";
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
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [empIds, setEmpIds] = useState<string[]>(assignedEmployeeIds);
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
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={{ marginBottom: 4 }}>
          <option value="offen">Offen</option>
          <option value="in_arbeit">In Arbeit</option>
          <option value="erledigt">Erledigt</option>
        </select>
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
      <div><span className="appt-date">{formatOrderDateTime(order)}</span>{past && order.status !== "erledigt" ? " (vergangen)" : ""} <span className={`badge ${order.status === "erledigt" ? "green" : order.status === "in_arbeit" ? "orange" : "red"}`}>{statusLabel[order.status]}</span></div>
      <div>{order.title}{order.description ? ` – ${order.description}` : ""}</div>
      {empNames && <div className="small">👤 {empNames}</div>}
      <div className="appt-actions">
        <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Diesen Auftrag wirklich löschen?")) onDelete(order.id); }}>Löschen</button>
      </div>
      <hr style={{ margin: "6px 0" }} />
      <ArticleAssignPanel
        orderId={order.id}
        articles={articles}
        rows={orderArticles}
        onAdd={onAddArticle}
        onUpdateQty={onUpdateArticleQty}
        onUpdateDiscount={onUpdateArticleDiscount}
        onRemove={onRemoveArticle}
      />
    </div>
  );
}

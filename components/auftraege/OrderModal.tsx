import { useState } from "react";
import type { Customer, Employee, OrderStatus } from "@/lib/types";
import { todayStr } from "@/lib/helpers";
import { CustomerPicker } from "@/components/CustomerPicker";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";

// Modal zum Anlegen eines neuen Auftrags aus dem Aufträge-Tab heraus (Kunde wird hier erst
// ausgewählt, im Gegensatz zu AddOrderInline im Kunden-Detailfenster, wo der Kunde schon
// feststeht). Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
export function OrderModal({ customers, employees, onClose, onAdd }: {
  customers: Customer[]; employees: Employee[]; onClose: () => void;
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<OrderStatus>("offen");
  const [empIds, setEmpIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId || !title.trim()) return;
    setSaving(true);
    await onAdd({ customerId, title: title.trim(), description, orderDate, time, status, assignedEmployeeIds: empIds });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Neuer Auftrag</h2>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
        <div className="field"><label>Titel *</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Reifenwechsel Sommer/Winter" /></div>
        <div className="field"><label>Beschreibung (optional)</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Datum</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div className="field"><label>Uhrzeit (optional)</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            <option value="offen">Offen</option>
            <option value="in_arbeit">In Arbeit</option>
            <option value="erledigt">Erledigt</option>
          </select>
        </div>
        <div className="field">
          <label>Mitarbeiter (optional, mehrere möglich)</label>
          <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
        </div>
        <button className="btn-primary btn-block" disabled={!customerId || !title.trim() || saving} onClick={save}>Auftrag anlegen</button>
      </div>
    </div>
  );
}

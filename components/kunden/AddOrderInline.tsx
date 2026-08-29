import { useState } from "react";
import type { Employee, OrderStatus } from "@/lib/types";
import { terminTitel, todayStr } from "@/lib/helpers";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";

// Formular zum Hinzufügen eines weiteren Auftrags/Termins direkt im Kunden-Detailfenster.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
export function AddOrderInline({ employees, kundenName, onAdd }: {
  employees: Employee[];
  kundenName: string;
  onAdd: (fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Vorbelegt mit "Termin – ‹Kunde›" statt nur "Termin": in einer Liste unterscheidet ein
  // blanker Titel "Termin" nichts von jedem anderen.
  const [title, setTitle] = useState(terminTitel(kundenName));
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [desc, setDesc] = useState("");
  const [empIds, setEmpIds] = useState<string[]>([]);
  if (!open) {
    return <button className="btn-secondary btn-block" onClick={() => setOpen(true)}>+ Auftrag / Termin hinzufügen</button>;
  }
  return (
    <div className="appt-item">
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={{ marginBottom: 4 }} />
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Was ist zu tun?" />
      <div className="small" style={{ margin: "2px 0" }}>Mitarbeiter (optional, mehrere möglich)</div>
      <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
      <div className="appt-actions">
        <button
          className="btn-primary"
          onClick={() => {
            if (!title.trim()) return;
            onAdd({ title: title.trim(), description: desc, orderDate: date, time, status: "offen", assignedEmployeeIds: empIds });
            setOpen(false); setTitle("Termin"); setDate(todayStr()); setTime(""); setDesc(""); setEmpIds([]);
          }}
        >
          Speichern
        </button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { Customer, Employee, OrderStatus } from "@/lib/types";
import { terminTitel, todayStr } from "@/lib/helpers";
import { CustomerPicker } from "@/components/CustomerPicker";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";

// Modal zum Anlegen eines neuen Auftrags. Zwei Aufrufwege:
//
//  1. aus dem Aufträge-Tab: der Kunde wird hier erst ausgewählt (`festerKunde` bleibt leer);
//  2. aus dem Karten-Popup: der Kunde steht bereits fest und wird nur noch angezeigt.
//
// Der zweite Weg ist neu (29.08.2026, siehe docs/termine-kontakt-auftrag-analyse.md). Vorher
// hing am Karten-Popup ein Ankreuzfeld "Termin dabei vereinbart", das im Hintergrund einen
// Auftrag ohne Fahrzeug, ohne Mitarbeiter und ohne Leistungen anlegte – technisch ein Auftrag,
// praktisch eine leere Hülle. Jetzt führt der Weg über dieselbe Maske wie überall sonst.
//
// Kein Status-Auswahlfeld mehr: ein neu angelegter Auftrag ist immer "offen". Zustände werden
// seit Migration 20 nicht ausgewählt, sondern durch Handlungen erreicht (docs/auftragsablauf.md)
// – ein Auswahlfeld, mit dem man einen Auftrag direkt als "erledigt" anlegen kann, widersprach
// genau dem und hätte am Trigger ohnehin keinen Abschluss-Zeitstempel erzeugt.
export function OrderModal({ customers, employees, festerKunde, onClose, onAdd }: {
  customers: Customer[]; employees: Employee[];
  festerKunde?: Customer;
  onClose: () => void;
  // Gibt die Id des angelegten Auftrags zurück, damit der Aufrufer ihn sofort öffnen kann.
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<string | undefined>;
}) {
  const [customerId, setCustomerId] = useState(festerKunde?.id || "");
  const [title, setTitle] = useState(festerKunde ? terminTitel(festerKunde.name) : "");
  // Sobald ein Kunde gewählt ist, wird der Titel mit "Termin – ‹Kunde›" vorbelegt – aber nur,
  // solange der Nutzer nichts Eigenes hineingeschrieben hat. Sonst würde ein Kundenwechsel
  // seinen Text überschreiben.
  const [titelVonHand, setTitelVonHand] = useState(false);
  const [description, setDescription] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [empIds, setEmpIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId || !title.trim()) return;
    setSaving(true);
    await onAdd({ customerId, title: title.trim(), description, orderDate, time, status: "offen", assignedEmployeeIds: empIds });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Neuer Auftrag</h2>
        {festerKunde ? (
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Kunde</div>
            <div><strong>{festerKunde.name}</strong></div>
            {festerKunde.address && <div className="small">{festerKunde.address}</div>}
          </div>
        ) : (
          <CustomerPicker
            customers={customers}
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              if (!titelVonHand) setTitle(terminTitel(customers.find((c) => c.id === id)?.name));
            }}
          />
        )}
        <div className="field"><label>Titel *</label><input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setTitelVonHand(true); }} placeholder="z. B. Reifenwechsel Sommer/Winter" /></div>
        <div className="field"><label>Beschreibung (optional)</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Datum</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div className="field"><label>Uhrzeit (optional)</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Mitarbeiter (optional, mehrere möglich)</label>
          <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
        </div>
        <button className="btn-primary btn-block" disabled={!customerId || !title.trim() || saving} onClick={save}>
          Auftrag anlegen
        </button>
        <div className="small" style={{ marginTop: 6, textAlign: "center" }}>
          Fahrzeug und Leistungen trägst du gleich danach im Auftragsfenster ein.
        </div>
      </div>
    </div>
  );
}

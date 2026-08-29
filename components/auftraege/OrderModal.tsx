import { useState } from "react";
import type { Customer, Employee, OrderStatus } from "@/lib/types";
import { terminTitel, todayStr } from "@/lib/helpers";
import { CustomerPicker } from "@/components/CustomerPicker";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";

// Modal zum Anlegen eines neuen Auftrags aus dem Aufträge-Tab heraus. Es gibt es nur hier,
// weil an dieser Stelle der Kunde noch fehlt und erst ausgewählt werden muss.
//
// Überall dort, wo der Kunde schon feststeht – Karten-Popup, Kundenfenster –, gibt es dieses
// Zwischenformular bewusst NICHT: dort wird die Auftragszeile sofort angelegt und direkt das
// vollständige Auftragsfenster geöffnet. Grund ist kein Geschmack, sondern das Datenmodell:
// Leistungen und Positionen hängen an einer Auftrags-Id, ein Formular ohne gespeicherte Zeile
// könnte sie gar nicht anbieten. Siehe docs/termine-kontakt-auftrag-analyse.md.
//
// Kein Status-Auswahlfeld: ein neu angelegter Auftrag ist immer "offen". Zustände werden seit
// Migration 20 nicht ausgewählt, sondern durch Handlungen erreicht (docs/auftragsablauf.md) –
// ein Auswahlfeld, mit dem man einen Auftrag direkt als "erledigt" anlegen kann, widersprach
// genau dem und hätte am Trigger ohnehin keinen Abschluss-Zeitstempel erzeugt.
export function OrderModal({ customers, employees, onClose, onAdd }: {
  customers: Customer[]; employees: Employee[];
  onClose: () => void;
  // Gibt die Id des angelegten Auftrags zurück, damit der Aufrufer ihn sofort öffnen kann.
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<string | undefined>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
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
        <CustomerPicker
          customers={customers}
          value={customerId}
          onChange={(id) => {
            setCustomerId(id);
            if (!titelVonHand) setTitle(terminTitel(customers.find((c) => c.id === id)?.name));
          }}
        />
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
          Fahrzeug und Leistungen trägst du gleich danach im Auftragsfenster ein, das sich
          automatisch öffnet.
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { CustomerPicker } from "@/components/CustomerPicker";

// Kundenauswahl vor dem Anlegen eines Auftrags – aus dem Aufträge-Tab heraus.
//
// Es gibt dieses Fenster nur noch, weil an dieser Stelle der Kunde fehlt und ein Auftrag ohne
// Kunden nicht existieren kann. Alles Weitere – Titel, Termin, Fahrzeug, Mitarbeiter,
// Leistungen, Notiz – wird im Auftragsfenster erfasst, das sich unmittelbar danach öffnet.
//
// Vorher fragte diese Maske zusätzlich Titel, Beschreibung, Datum, Uhrzeit und Mitarbeiter ab.
// Das war die zweite von vier verschiedenen Masken für dieselbe Sache und konnte – wie die
// anderen drei – keine Leistungen erfassen. Wer einen Auftrag anlegte, musste ihn danach noch
// einmal öffnen. Siehe docs/auftragsablauf.md.
export function OrderModal({ customers, onClose, onWeiter }: {
  customers: Customer[];
  onClose: () => void;
  onWeiter: (customerId: string) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function weiter() {
    if (!customerId || laeuft) return;
    setLaeuft(true);
    try {
      await onWeiter(customerId);
      onClose();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative", maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Neuer Auftrag</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Für welchen Kunden? Danach öffnet sich das Auftragsfenster mit Termin, Fahrzeug,
          Mitarbeitern und Leistungen.
        </p>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
        <button className="btn-primary btn-block" style={{ marginTop: 10 }} disabled={!customerId || laeuft} onClick={weiter}>
          {laeuft ? "Wird angelegt …" : "Weiter zum Auftrag"}
        </button>
      </div>
    </div>
  );
}

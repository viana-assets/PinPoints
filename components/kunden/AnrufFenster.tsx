import type { Customer } from "@/lib/types";
import { getPhoneNumbers, telHref } from "@/lib/helpers";

// Das Fenster, das nach dem Antippen der Meldung „Anrufen: ‹Kunde›" aufgeht (Weg 3 in
// docs/auftraege.md: am Rechner klicken, auf dem Handy telefonieren).
//
// WARUM ES ÜBERHAUPT EIN FENSTER GIBT und die Meldung nicht direkt wählt: Ein `tel:` ohne
// menschlichen Anstoß wird vom Browser abgewiesen – und das ist richtig so. Eine Seite, die
// beim bloßen Öffnen wählen dürfte, wäre ein Werkzeug für teure Überraschungen. Ein großer
// Knopf ist ein Tippen mehr und dafür ein Weg, der immer funktioniert.
//
// ALLE Nummern des Kunden stehen hier, nicht die eine, die der Rechner ausgewählt hat: Wer
// unterwegs anruft, erreicht den Festnetzanschluss ohnehin nicht – die Wahl gehört an das
// Gerät, an dem telefoniert wird.
export function AnrufFenster({ kunde, onClose, onKundeOeffnen }: {
  kunde: Customer;
  onClose: () => void;
  onKundeOeffnen: () => void;
}) {
  const nummern = getPhoneNumbers(kunde);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box anruf-fenster" style={{ position: "relative", maxWidth: 380 }}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        <h2 style={{ marginBottom: 2 }}>{kunde.name}</h2>
        {kunde.address && <p className="small" style={{ marginTop: 0 }}>{kunde.address}</p>}

        {nummern.length === 0 ? (
          <div className="empty">Für diesen Kunden ist keine Rufnummer hinterlegt.</div>
        ) : (
          nummern.map((n) => (
            <a key={n.label} className="btn-primary btn-block anruf-knopf" href={"tel:" + telHref(n.number)}>
              <span className="ak-label">{n.label}</span>
              <span className="ak-nummer">{n.number}</span>
            </a>
          ))
        )}

        <button className="btn-secondary btn-rand btn-block" style={{ marginTop: 10 }} onClick={onKundeOeffnen}>
          Kundenakte öffnen
        </button>
      </div>
    </div>
  );
}

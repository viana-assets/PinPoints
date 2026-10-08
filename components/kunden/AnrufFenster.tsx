import type { Customer } from "@/lib/types";
import { getPhoneNumbers, telHref } from "@/lib/helpers";
import { Blatt } from "@/components/Blatt";

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

  // Seit v134 ein Blatt (components/Blatt.tsx): am Handy von unten, wo der Daumen ist.
  return (
    <Blatt titel={kunde.name} unter={kunde.address || undefined} className="anruf-fenster" onClose={onClose}
      fuss={<button type="button" className="btn-secondary" onClick={onKundeOeffnen}>Kundenakte öffnen</button>}>
      {nummern.length === 0 ? (
        <div className="empty">Für diesen Kunden ist keine Rufnummer hinterlegt.</div>
      ) : (
        nummern.map((n) => (
          <a key={n.label} className="btn-primary anruf-knopf" href={"tel:" + telHref(n.number)}>
            <span className="ak-label">{n.label}</span>
            <span className="ak-nummer">{n.number}</span>
          </a>
        ))
      )}
    </Blatt>
  );
}

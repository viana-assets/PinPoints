"use client";

// Vor dem Abschluss (v170, Wunsch 26.10.2026): Mit dem Auftrag gehen Reifen aus dem Lager, eingelagert ist aber nichts.
// Dann wird der Platz frei, und die abmontierten Reifen der anderen Saison stünden nirgends – meist ein vergessener
// Tausch. Eine Frage, keine Sperre (wie die Altreifen-Frage): erste Wahl ist der Tausch auf denselben Platz, dann ein
// anderer Platz, sonst abschließen und den Platz freigeben.
export function AuslagerFrage({ saetze, laeuft, onTausch, onAndererPlatz, onAbschliessen, onClose }: {
  // Die Sätze, die gehen – mit Lager und Platz als Text („Halle · B7“).
  saetze: { id: string; platz: string }[];
  laeuft?: boolean;
  // Fehlt ohne das Recht „Reifentausch“.
  onTausch?: (satzId: string) => void | Promise<void>;
  onAndererPlatz: () => void;
  onAbschliessen: () => void;
  onClose: () => void;
}) {
  const einer = saetze.length === 1;
  return (
    <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="auswahl-blatt ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reifen aus dem Lager">
        <div className="ab-griff" />
        <div className="ab-titel">Abmontierte Reifen nicht einlagern?</div>
        <span className="small">
          Mit dem Abschluss {einer ? "geht ein Satz" : `gehen ${saetze.length} Sätze`} aus dem Lager, und {einer ? "der Platz wird" : "die Plätze werden"} frei
          ({saetze.map((s) => s.platz).join(", ")}). Eingelagert ist auf diesem Auftrag nichts – die Reifen der anderen Saison stünden damit nirgends.
        </span>
        {onTausch && saetze.map((s) => (
          <button key={s.id} type="button" className="ab-option" disabled={laeuft} onClick={() => void onTausch(s.id)}>
            <span className="ab-text"><b>Tauschen – auf {s.platz} einlagern</b> <span className="small">· der abmontierte Satz kommt auf denselben Platz</span></span>
          </button>
        ))}
        <button type="button" className="ab-option" disabled={laeuft} onClick={onAndererPlatz}>
          <span className="ab-text"><b>Auf einem anderen Platz einlagern</b></span>
        </button>
        <button type="button" className="am-knopf gruen" disabled={laeuft} onClick={onAbschliessen}>
          Kunde behält sie – {einer ? "Platz" : "Plätze"} freigeben und abschließen
        </button>
      </div>
    </div>
  );
}

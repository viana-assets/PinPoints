"use client";

// Runder Knopf „Fehlt was?“ im Schnellmenü (v173, Migration 104) – gleiche Form wie Chat, Stoppuhr und „Zum Lager“.
export function BestellKnopf({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ch-blase im-menue bw-blase" onClick={onClick} aria-label="Fehlt was? Auf die Bestellliste" title="Fehlt was? Auf die Bestellliste">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.5-1.2L20 8H6.2z" /><circle cx="9.5" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></svg>
    </button>
  );
}

"use client";

// Runder Knopf „Zum Lager“ im Schnellmenü (v169) – gleiche Form wie Chat-Blase und Stoppuhr im Menü. Was er tut
// (Lager bestimmen, Navigation anbieten), entscheidet die Seite; siehe lib/lagerNavigation.ts.
export function LagerNavKnopf({ onClick }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className="ch-blase im-menue lg-nav-blase" onClick={onClick} aria-label="Zum Lager navigieren" title="Zum Lager navigieren">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.2 12 4l9 6.2V20a1 1 0 0 1-1 1h-3v-7H7v7H4a1 1 0 0 1-1-1z" /><path d="M9 16h6v2H9zm0 3h6v2H9z" /></svg>
    </button>
  );
}

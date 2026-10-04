"use client";

import { useRef } from "react";

// Das Suchfeld oben in den Listen (Kunden, Aufträge, Lager, Rechnungen …) – mit einem ×, das
// den Suchtext auf einmal löscht (04.10.2026, v110).
//
// Anlass: Am Rechner zeigt der Browser in einem `type="search"`-Feld selbst ein ×. Safari am
// iPhone tut das nicht – dort musste man den Text Buchstabe für Buchstabe zurücklöschen. Das ×
// kommt deshalb jetzt aus der App, überall gleich, und das eigene × des Browsers ist per Stil
// ausgeblendet (sonst stünden am Rechner zwei nebeneinander).
//
// Das × erscheint nur, wenn etwas drinsteht. Nach dem Löschen bleibt der Cursor im Feld –
// meist will man gleich das Nächste suchen. `onMouseDown` verhindert, dass das Feld beim
// Antippen kurz den Fokus verliert und die Tastatur am Handy zu- und wieder aufklappt.
export function SuchFeld({ value, onWert, placeholder, ariaLabel, className, autoFocus }: {
  value: string;
  onWert: (wert: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const feld = useRef<HTMLInputElement>(null);
  return (
    <label className={"lg-suchfeld" + (className ? " " + className : "")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
      <input ref={feld} type="search" placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={(e) => onWert(e.target.value)} aria-label={ariaLabel} />
      {value !== "" && (
        <button type="button" className="lg-leeren" aria-label="Suche leeren" title="Suche leeren"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.preventDefault(); onWert(""); feld.current?.focus(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </label>
  );
}

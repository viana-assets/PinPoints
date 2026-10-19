"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { zahlText } from "@/lib/chat";

// Das Schnellmenü oben rechts am Handy (v159, Wunsch Vitali 16.10.2026): Stoppuhr und Chat-Blase
// standen unten rechts dauerhaft über Liste und Leiste. Am Handy sitzen sie jetzt hinter einem runden
// Knopf mit drei Punkten; ein Tipp klappt sie darunter auf. Die Zahl am Knopf ist die Summe der
// Zahlen der Einträge (heute nur der Chat) – so sieht man auch zugeklappt, dass etwas da ist.
// Am Rechner bleibt alles unten rechts (`.sm-menue` ist dort ausgeblendet, app/globals.css).
export type SchnellEintrag = {
  key: string;
  // Beschriftung links neben dem runden Knopf.
  text: string;
  // Der runde Knopf selbst (ZeitBlase / ChatBlase mit `imMenue`).
  knopf: (zu: () => void) => ReactNode;
  zahl?: number;
};

export function SchnellMenue({ eintraege, versteckt }: { eintraege: SchnellEintrag[]; versteckt?: boolean }) {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const zahl = eintraege.reduce((s, e) => s + (e.zahl ?? 0), 0);

  useEffect(() => {
    if (!offen) return;
    const weg = (ev: PointerEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOffen(false); };
    const taste = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOffen(false); };
    document.addEventListener("pointerdown", weg);
    document.addEventListener("keydown", taste);
    return () => { document.removeEventListener("pointerdown", weg); document.removeEventListener("keydown", taste); };
  }, [offen]);

  if (!eintraege.length || versteckt) return null;
  return (
    <div className={"sm-menue" + (offen ? " offen" : "")} ref={ref}>
      <button type="button" className="sm-knopf" aria-expanded={offen} aria-haspopup="true"
        aria-label={zahl > 0 ? `Schnellmenü, ${zahl} neu` : "Schnellmenü"} title="Zeiterfassung, Chat, Lager"
        onClick={() => setOffen(!offen)}>
        {offen
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>}
        {zahl > 0 && !offen && <span className="ch-zahl">{zahlText(zahl)}</span>}
      </button>
      {offen && (
        <div className="sm-liste" role="menu">
          {eintraege.map((e) => (
            <div key={e.key} className="sm-eintrag" role="none">
              <span className="sm-text" aria-hidden="true">{e.text}</span>
              {e.knopf(() => setOffen(false))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

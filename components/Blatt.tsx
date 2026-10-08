"use client";

import type { ReactNode } from "react";

// Ein Fenster im Stil der App (v134, Runde 2 der Designprüfung): am Rechner eine Karte in der
// Mitte, am Handy ein Blatt von unten mit Griff. Dasselbe Aussehen wie die Blätter der Filter,
// des Artikels und der Stempeluhr (`.auswahl-blatt`), nur mit Kopf, Breite und Fußzeile fertig.
//
// Bis v133 hatten neun Fenster ihren eigenen Rahmen (`.modal-box`): Titel 16 px statt 18, ✕
// oben rechts frei schwebend, am Handy bildschirmfüllend statt als Blatt, Knöpfe in drei
// Größen. Wer ein neues Fenster baut, nimmt dieses hier – `docs/design-system.md`, „Fenster“.
//
// - `ebene`: zusätzliche Klasse am Hintergrund, z. B. `modal-auslagern` (z-index 10002, über dem
//   Auftrag). Ohne Angabe liegt das Fenster wie bisher auf 10000.
// - `kopf`: was links vom ✕ in der Kopfzeile steht, wenn es mehr als der Titel ist (‹ › zum
//   Blättern im Mitnehmen-Fenster).
// - `fuss`: die Knöpfe. Sie bleiben beim Scrollen unten stehen – bei einem langen Formular
//   (Einlagern) muss „Speichern“ erreichbar sein, ohne erst ans Ende zu rollen.
export function Blatt({ titel, unter, breite = "schmal", ebene, kopf, fuss, label, className, onClose, children }: {
  titel: ReactNode;
  unter?: ReactNode;
  breite?: "schmal" | "mittel" | "breit";
  ebene?: string;
  kopf?: ReactNode;
  fuss?: ReactNode;
  label?: string;
  className?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={"modal-overlay auswahl-overlay" + (ebene ? " " + ebene : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"auswahl-blatt bl-blatt bl-" + breite + (className ? " " + className : "")}
        role="dialog" aria-modal="true" aria-label={label ?? (typeof titel === "string" ? titel : undefined)}>
        <div className="ab-griff" />
        <div className="bl-kopf">
          {kopf ?? (
            <div className="bl-titel">
              <h2 className="ab-titel">{titel}</h2>
              {unter && <span className="bl-unter">{unter}</span>}
            </div>
          )}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        {children}
        {fuss && <div className="bl-fuss">{fuss}</div>}
      </div>
    </div>
  );
}

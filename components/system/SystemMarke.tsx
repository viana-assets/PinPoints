"use client";

import { IconMarke } from "@/components/icons";
import type { SystemEintrag } from "@/lib/systeme";

// Die Marke oben links mit dem laufenden System (v145, docs/finance.md Abschnitt 1):
// „Mobiler Reifenservice“, darunter „MR Assistent · FSM“. Wer mehr als ein System sehen darf,
// bekommt den Namen als Knopf mit ▾ – er öffnet die Systemauswahl. Der Knopf deckt über `::after`
// den ganzen Markenblock ab (`.marke-knopf`), bleibt aber im HTML ein Knopf IN der Überschrift:
// Eine Überschrift darf nicht in einem Knopf stehen.
//
// Zweimal im Seitenaufbau: `nav-brand` (Seitenleiste am Rechner) und `app-brand` (Kopf am Handy);
// das CSS zeigt immer nur eine davon.
export function SystemMarke({ klasse, system, wechselbar, onWechseln }: {
  klasse: "nav-brand" | "app-brand";
  system: SystemEintrag;
  wechselbar: boolean;
  onWechseln: () => void;
}) {
  return (
    <div className={klasse + (wechselbar ? " marke-wechsel" : "")}>
      <IconMarke />
      <h1 className="marke-text">
        <b>Mobiler Reifenservice</b>
        <small>
          MR Assistent ·{" "}
          {wechselbar ? (
            <button type="button" className="marke-knopf" onClick={onWechseln} aria-haspopup="dialog"
              aria-label={`System wechseln – aktiv: ${system.kurz}`}>
              <span className={"sys-pille sys-" + system.key}>{system.kurz}</span>
              <span className="sys-pfeil" aria-hidden="true">▾</span>
            </button>
          ) : (
            <span className={"sys-name sys-" + system.key}>{system.kurz}</span>
          )}
        </small>
      </h1>
    </div>
  );
}

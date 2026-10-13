"use client";

import { Blatt } from "@/components/Blatt";
import type { SystemEintrag, SystemKey } from "@/lib/systeme";

// Die Systemauswahl (v145): FSM, Finance, CRM („bald“). Welche Systeme hier stehen, entscheidet
// `sichtbareSysteme()` in lib/systeme.ts aus den Rechten – die Datenbank setzt dieselben Rechte durch.
export function SystemWahl({ systeme, aktiv, istSuperAdmin, onWaehlen, onClose }: {
  systeme: SystemEintrag[];
  aktiv: SystemKey;
  istSuperAdmin: boolean;
  onWaehlen: (s: SystemKey) => void;
  onClose: () => void;
}) {
  return (
    <Blatt titel="System wechseln" unter="MR Assistent" onClose={onClose}>
      <div className="sw-liste">
        {systeme.map((s) => (
          <button key={s.key} type="button"
            className={"sw-sys sys-" + s.key + (s.key === aktiv ? " aktiv" : "") + (s.bald ? " bald" : "")}
            disabled={s.bald}
            aria-current={s.key === aktiv ? "true" : undefined}
            onClick={() => { if (!s.bald) onWaehlen(s.key); }}>
            <span className="sw-zeichen" aria-hidden="true">{s.kurz.slice(0, 3).toUpperCase()}</span>
            <span className="sw-text">
              <b>{s.kurz}{s.bald ? <span className="sw-bald">bald</span> : null}</b>
              <small>{s.name} · {s.beschreibung}</small>
            </span>
            {s.key === aktiv && <span className="sw-haken" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      {istSuperAdmin && (
        <p className="small sw-fuss">
          Finance sieht im Moment nur der Superadmin. Für andere Rollen unter Admin › Rechte „Finance“ freischalten.
        </p>
      )}
    </Blatt>
  );
}

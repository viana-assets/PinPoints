import { useState } from "react";
import type { Role } from "@/lib/types";
import type { Bereichsrechte } from "@/lib/api/permissions";
import {
  ROLE_LABEL, RECHTE_KATALOG, RECHTE_VORGABE, PERMISSION_ROLES, VERBEN, VERB_LABEL,
  type RechtBereich, type Verb,
} from "@/lib/constants";

// Die Rechtematrix: links die Bereiche, daneben drei Spalten – Lesen, Schreiben, Löschen –
// für die oben gewählte Rolle (seit 26.09.2026, Entwurf U; vorher alle Rollen nebeneinander,
// neun Spalten, am Handy nicht lesbar). Jeder Haken wird von der Datenbank durchgesetzt (Migration 42), nicht nur von
// dieser Anzeige.
//
// Zellen für Verben, die es in einem Bereich nicht gibt, sind ausgegraut und tragen im
// Tooltip den Grund. Sie stehen da und fehlen nicht: Eine leere Stelle in einer Spalte sieht
// beim Überfliegen aus wie ein nicht gesetzter Haken, und das ist die gefährlichere
// Verwechslung von beiden.
//
// Jeder Klick speichert sofort und für sich. Ein „Speichern"-Knopf über einer Matrix mit
// neununddreißig Haken ist eine Einladung, die halbe Arbeit zu verlieren.
export function PermissionMatrix({ modulePermissions, onUpdateModulePermissions }: {
  modulePermissions: Record<string, Bereichsrechte>;
  onUpdateModulePermissions: (bereich: string, verb: Verb, rollen: string[], bestand: Bereichsrechte) => Promise<void>;
}) {
  const [speichert, setSpeichert] = useState<string | null>(null);

  // Was gilt gerade – aus der Datenbank, sonst aus der Vorgabe.
  function rechte(bereich: string): Bereichsrechte {
    return modulePermissions[bereich] ?? RECHTE_VORGABE[bereich] ?? {};
  }

  async function umschalten(b: RechtBereich, verb: Verb, rolle: Role) {
    if (b.gesperrt) return;
    const bestand = rechte(b.schluessel);
    const jetzt = bestand[verb] ?? [];
    const neu = jetzt.includes(rolle) ? jetzt.filter((r) => r !== rolle) : [...jetzt, rolle];
    const zelle = `${b.schluessel}.${verb}`;
    setSpeichert(zelle);
    await onUpdateModulePermissions(b.schluessel, verb, neu, bestand);
    setSpeichert(null);
  }

  const [rolle, setRolle] = useState<Role>(PERMISSION_ROLES.includes("techniker") ? "techniker" : PERMISSION_ROLES[0]);
  const [erklaert, setErklaert] = useState<string | null>(null);

  return (
    <div className="rm-seite">
      <div className="db-karte rm-karte">
        <div className="lg-lagerwahl rm-rollen" role="group" aria-label="Rolle">
          {PERMISSION_ROLES.map((r) => (
            <button key={r} type="button" className={rolle === r ? "aktiv" : ""} aria-pressed={rolle === r} onClick={() => setRolle(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="rm-zeile rm-kopf" aria-hidden="true">
          <span>Bereich</span>
          {VERBEN.map((v) => <span key={v}>{VERB_LABEL[v]}</span>)}
        </div>
        {RECHTE_KATALOG.map((b) => {
          const aktuell = rechte(b.schluessel);
          return (
            <div key={b.schluessel} className={"rm-zeile" + (b.unter ? " unter" : " modul")}>
              <button type="button" className="rm-name" title={b.erklaerung} aria-expanded={erklaert === b.schluessel}
                onClick={() => setErklaert(erklaert === b.schluessel ? null : b.schluessel)}>
                {b.label}
                {erklaert === b.schluessel && <span className="small">{b.erklaerung}</span>}
              </button>
              {VERBEN.map((verb) => {
                const gibtEs = b.verben.includes(verb);
                const zelle = `${b.schluessel}.${verb}`;
                const an = b.gesperrt ? true : gibtEs && (aktuell[verb] ?? []).includes(rolle);
                return (
                  <span key={verb} className="rm-zelle" title={gibtEs ? undefined : b.warumNicht}>
                    <button
                      type="button"
                      className={"rm-haken" + (!gibtEs ? " gibts-nicht" : an ? " an" : "")}
                      aria-pressed={gibtEs ? an : undefined}
                      aria-label={`${b.label}: ${VERB_LABEL[verb]} für ${ROLE_LABEL[rolle]}`}
                      title={gibtEs ? `${b.label}: ${VERB_LABEL[verb]}` : b.warumNicht}
                      disabled={!gibtEs || b.gesperrt || speichert === zelle}
                      onClick={() => umschalten(b, verb, rolle)}
                    >
                      {gibtEs && an ? "✓" : ""}
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })}
        <span className="small rm-fuss">
          Jeder Haken wirkt sofort. Grau = gibt es in diesem Bereich nicht (antippen des Namens zeigt,
          was die Zeile genau erlaubt). Fette Zeilen sind <b>Module</b> – ihr Haken entscheidet nur,
          ob der Reiter erscheint; die eingerückten Zeilen darunter heißen nach der <b>Handlung</b>.
          &bdquo;Schreiben&ldquo; umfasst Anlegen und Ändern. Superadmin darf immer alles.
        </span>
      </div>
    </div>
  );
}

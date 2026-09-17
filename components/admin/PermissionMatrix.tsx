import { useState } from "react";
import type { Role } from "@/lib/types";
import type { Bereichsrechte } from "@/lib/api/permissions";
import {
  ROLE_LABEL, RECHTE_KATALOG, RECHTE_VORGABE, PERMISSION_ROLES, VERBEN, VERB_LABEL,
  type RechtBereich, type Verb,
} from "@/lib/constants";

// Die Rechtematrix: links die Bereiche, oben je Rolle drei Spalten – Lesen, Schreiben,
// Löschen. Jeder Haken wird von der Datenbank durchgesetzt (Migration 42), nicht nur von
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

  return (
    <div>
      <div className="small" style={{ marginBottom: 8 }}>
        Wer darf in welchem Bereich <b>lesen</b>, <b>schreiben</b> und <b>löschen</b>?
        &bdquo;Schreiben&ldquo; umfasst Anlegen und Ändern. Graue Zellen gibt es in diesem Bereich nicht –
        fahr darüber, dann steht dort, warum. Superadmin darf immer alles, unabhängig von
        dieser Tabelle, und wird deshalb nicht extra aufgeführt.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="appt-table rechte-matrix">
          <thead>
            <tr>
              <th rowSpan={2}>Bereich</th>
              {PERMISSION_ROLES.map((rolle) => (
                <th key={rolle} colSpan={VERBEN.length} className="rolle-kopf">{ROLE_LABEL[rolle]}</th>
              ))}
            </tr>
            <tr>
              {PERMISSION_ROLES.map((rolle) =>
                VERBEN.map((verb, i) => (
                  <th key={rolle + verb} className={"verb-kopf" + (i === 0 ? " gruppenanfang" : "")}>
                    {VERB_LABEL[verb].slice(0, 1)}
                    <span className="verb-lang">{VERB_LABEL[verb].slice(1)}</span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {RECHTE_KATALOG.map((b) => {
              const aktuell = rechte(b.schluessel);
              return (
                <tr key={b.schluessel}>
                  <td style={{ fontWeight: 700 }}>{b.label}</td>
                  {PERMISSION_ROLES.map((rolle) =>
                    VERBEN.map((verb, i) => {
                      const gibtEs = b.verben.includes(verb);
                      const zelle = `${b.schluessel}.${verb}`;
                      return (
                        <td
                          key={rolle + verb}
                          className={"verb-zelle" + (i === 0 ? " gruppenanfang" : "") + (gibtEs ? "" : " gibts-nicht")}
                          title={gibtEs ? `${b.label}: ${VERB_LABEL[verb]}` : b.warumNicht}
                        >
                          <input
                            type="checkbox"
                            checked={b.gesperrt ? true : gibtEs && (aktuell[verb] ?? []).includes(rolle)}
                            disabled={!gibtEs || b.gesperrt || speichert === zelle}
                            onChange={() => umschalten(b, verb, rolle)}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

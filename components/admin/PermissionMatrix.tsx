import { Fragment, useMemo, useState } from "react";
import type { Role } from "@/lib/types";
import type { Bereichsrechte } from "@/lib/api/permissions";
import {
  ROLE_LABEL, RECHTE_VORGABE, PERMISSION_ROLES, ROLLEN_SONDERREGELN, VERBEN, VERB_LABEL, rechtSchluessel,
  type RechtBereich, type Verb,
} from "@/lib/constants";
import { gruppeZaehlung, rechteGruppen, rechteHinweise, rolleKlartext, type RechtHinweis } from "@/lib/rechteAnsicht";

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
//
// Seit v124 (Schritt 1 der Überarbeitung vom 08.10.2026): Module mit Unterzeilen lassen sich
// einklappen und zeigen zugeklappt „x von y“; Haken, die ins Leere laufen, tragen einen Hinweis
// (`rechteHinweise()`); „Ansehen als …“ zeigt dasselbe in Sätzen, samt der Regeln, die kein Haken
// ändert (`ROLLEN_SONDERREGELN`). Die Logik dazu steht in lib/rechteAnsicht.ts.
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
    const zelle = rechtSchluessel(b.schluessel, verb);
    setSpeichert(zelle);
    await onUpdateModulePermissions(b.schluessel, verb, neu, bestand);
    setSpeichert(null);
  }

  const [rolle, setRolle] = useState<Role>(PERMISSION_ROLES.includes("techniker") ? "techniker" : PERMISSION_ROLES[0]);
  const [erklaert, setErklaert] = useState<string | null>(null);
  // Aufgeklappte Module. Zu Beginn ist alles zu – die Seite zeigt dann nur die Module mit ihrer
  // Zusammenfassung; wer etwas ändern will, klappt das eine Modul auf.
  const [offen, setOffen] = useState<Set<string>>(() => new Set());
  const [alsAnsicht, setAlsAnsicht] = useState(false);

  const gruppen = useMemo(() => rechteGruppen(), []);
  const hinweise = rechteHinweise(rechte, rolle);
  const hinweiseFuer = (bereich: string): RechtHinweis[] => hinweise.filter((h) => h.bereich === bereich);
  const klappbar = gruppen.filter((g) => g.unter.length > 0);
  const allesOffen = klappbar.every((g) => offen.has(g.modul.schluessel));

  function klappen(schluessel: string) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel); else neu.add(schluessel);
      return neu;
    });
  }

  function zeile(b: RechtBereich, gruppe?: { offen: boolean; zusammenfassung: string; anzahlHinweise: number }) {
    const aktuell = rechte(b.schluessel);
    const eigene = hinweiseFuer(b.schluessel);
    return (
      <div key={b.schluessel} className={"rm-zeile" + (b.unter ? " unter" : " modul") + (gruppe ? " klappbar" : "")}>
        <span className="rm-namefeld">
          {gruppe && (
            <button type="button" className={"rm-pfeil" + (gruppe.offen ? " offen" : "")}
              aria-expanded={gruppe.offen} aria-label={`${b.label} ${gruppe.offen ? "zuklappen" : "aufklappen"}`}
              onClick={() => klappen(b.schluessel)}>
              ›
            </button>
          )}
          <button type="button" className="rm-name" title={b.erklaerung} aria-expanded={erklaert === b.schluessel}
            onClick={() => setErklaert(erklaert === b.schluessel ? null : b.schluessel)}>
            {b.label}
            {gruppe && !gruppe.offen && (
              <span className="rm-zusammen">
                {gruppe.zusammenfassung}
                {gruppe.anzahlHinweise > 0 && <span className="rm-warn-zahl"> · {gruppe.anzahlHinweise} Hinweis{gruppe.anzahlHinweise > 1 ? "e" : ""}</span>}
              </span>
            )}
            {erklaert === b.schluessel && <span className="small">{b.erklaerung}</span>}
            {eigene.map((h) => <span key={h.schluessel + h.text} className="rm-hinweis-text">⚠ {h.text}</span>)}
          </button>
        </span>
        {VERBEN.map((verb) => {
          const gibtEs = b.verben.includes(verb);
          const zelle = rechtSchluessel(b.schluessel, verb);
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
  }

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
        <div className="rm-leiste">
          <button type="button" className="es-knopf" aria-pressed={alsAnsicht} onClick={() => setAlsAnsicht(!alsAnsicht)}>
            {alsAnsicht ? "Zurück zu den Haken" : `Ansehen als ${ROLE_LABEL[rolle]}`}
          </button>
          {!alsAnsicht && (
            <button type="button" className="es-knopf"
              onClick={() => setOffen(allesOffen ? new Set() : new Set(klappbar.map((g) => g.modul.schluessel)))}>
              {allesOffen ? "Alle zuklappen" : "Alle aufklappen"}
            </button>
          )}
          {hinweise.length > 0 && !alsAnsicht && (
            <span className="rm-warn-zahl">{hinweise.length} Hinweis{hinweise.length > 1 ? "e" : ""} für {ROLE_LABEL[rolle]}</span>
          )}
        </div>

        {alsAnsicht ? (
          <div className="rm-klartext">
            {rolleKlartext(rechte, rolle).map((g) => (
              <div key={g.titel} className="rm-kt-gruppe">
                <b>{g.titel}</b>
                {g.kann.length > 0 && <span className="rm-kt-kann">Kann: {g.kann.join(" · ")}</span>}
                {g.kannNicht.length > 0 && <span className="rm-kt-nicht">Kann nicht: {g.kannNicht.join(" · ")}</span>}
              </div>
            ))}
            <div className="rm-kt-gruppe rm-kt-sonder">
              <b>Gilt immer, unabhängig von den Haken</b>
              {ROLLEN_SONDERREGELN[rolle].map((t) => <span key={t}>{t}</span>)}
            </div>
            {hinweise.length > 0 && (
              <div className="rm-kt-gruppe">
                <b>Hinweise</b>
                {hinweise.map((h) => <span key={h.schluessel + h.text} className="rm-hinweis-text">⚠ {h.text}</span>)}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rm-zeile rm-kopf" aria-hidden="true">
              <span>Bereich</span>
              {VERBEN.map((v) => <span key={v}>{VERB_LABEL[v]}</span>)}
            </div>
            {gruppen.map((g) => {
              if (g.unter.length === 0) return zeile(g.modul);
              const istOffen = offen.has(g.modul.schluessel);
              const { an, von } = gruppeZaehlung(g, rechte, rolle);
              const anzahlHinweise = [g.modul, ...g.unter].reduce((n, b) => n + hinweiseFuer(b.schluessel).length, 0)
                - hinweiseFuer(g.modul.schluessel).length;
              return (
                <Fragment key={g.modul.schluessel}>
                  {zeile(g.modul, { offen: istOffen, zusammenfassung: `${an} von ${von} erlaubt`, anzahlHinweise })}
                  {istOffen && g.unter.map((u) => zeile(u))}
                </Fragment>
              );
            })}
          </>
        )}
        <span className="small rm-fuss">
          Jeder Haken wirkt sofort. Grau = gibt es in diesem Bereich nicht (antippen des Namens zeigt,
          was die Zeile genau erlaubt). Fette Zeilen sind <b>Module</b> – ihr Haken entscheidet nur,
          ob der Reiter erscheint; die eingerückten Zeilen darunter heißen nach der <b>Handlung</b>
          (mit ›&nbsp;aufklappen). &bdquo;Schreiben&ldquo; umfasst Anlegen und Ändern. ⚠ = dieser Haken läuft
          für die gewählte Rolle ins Leere. Superadmin darf immer alles.
        </span>
      </div>
    </div>
  );
}

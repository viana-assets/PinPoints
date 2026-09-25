import { useState } from "react";
import type { Customer, EingelagertesRad, StorageSlot, TireStorage, Vehicle } from "@/lib/types";
import { PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM, RAD_POSITION_LABEL, RAD_POSITIONEN, SAISON_LABEL } from "@/lib/constants";
import { dotJahr, formatDate, formatEUR, lagermonate, profilLage, profilText, satzProfilMm, todayStr } from "@/lib/helpers";
import { ProfilMarke } from "./ProfilMarke";

// Das Blatt zu einem Lagerplatz (26.09.2026, Entwurf „H · Lager").
//
// Vorher führte ein Klick auf einen Platz direkt ins Bearbeitungsfenster – auch wer nur wissen
// wollte, wem der Satz gehört. Jetzt steht zuerst, was da liegt und was zu tun ist; Bearbeiten,
// Auslagern und die beiden Etiketten sind Knöpfe darin. Das Blatt ist auch für Rollen ohne
// Schreibrecht offen: Lesen darf, wer das Lager sieht (Migration 16) – die Knöpfe fehlen dann.
//
// Am Handy von unten, am Rechner als Fenster in der Mitte – dieselben Regeln wie das
// Auswahlblatt der Einsatzplanung (`.auswahl-overlay`, app/globals.css).
const GRENZEN = { hinweis: PROFIL_HINWEIS_MM, kritisch: PROFIL_KRITISCH_MM };

export function PlatzBlatt({
  slot, wo, satz, kunde, fahrzeug, raeder, gruende, verlauf, customers, raederFuer, lagergebuehrJeMonat,
  canAssign, canDelete, onClose, onKunde, onAuslagern, onBearbeiten, onEtikett, onAufkleber, onLoeschen,
}: {
  slot: StorageSlot;
  // „Hauptlager · Reihe A"
  wo: string;
  satz: TireStorage | null;
  kunde: Customer | null;
  fahrzeug: Vehicle | null;
  raeder: EingelagertesRad[];
  gruende: string[];
  // Frühere Einlagerungen auf diesem Platz, neueste zuerst.
  verlauf: TireStorage[];
  customers: Customer[];
  raederFuer: (satzId: string) => EingelagertesRad[];
  lagergebuehrJeMonat: number | null;
  canAssign: boolean;
  canDelete: boolean;
  onClose: () => void;
  onKunde?: (kundeId: string) => void;
  onAuslagern: (satzId: string) => void;
  // Bearbeiten eines Satzes ODER Einlagern auf den freien Platz – beides ist das Zuordnungsfenster.
  onBearbeiten: () => void;
  onEtikett: (satzId: string) => void;
  onAufkleber: () => void;
  onLoeschen: () => void;
}) {
  const [verlaufOffen, setVerlaufOffen] = useState(false);
  const heute = todayStr();

  const verlaufKnopf = verlauf.length > 0 && (
    <button type="button" className="lg-link" onClick={() => setVerlaufOffen(!verlaufOffen)} aria-expanded={verlaufOffen}>
      Verlauf: {verlauf.length} {verlauf.length === 1 ? "frühere Einlagerung" : "frühere Einlagerungen"} {verlaufOffen ? "▾" : "›"}
    </button>
  );
  const verlaufListe = verlaufOffen && (
    <div className="lg-verlauf">
      {verlauf.map((h) => {
        const k = customers.find((c) => c.id === h.customer_id);
        return (
          <div key={h.id} className="hist-entry">
            <span className="he-cust">{k ? k.name : "Unbekannter Kunde"}</span>
            {h.saison ? ` · ${SAISON_LABEL[h.saison]}` : ""}
            {h.dot_date ? ` · DOT ${h.dot_date}` : ""}
            {" "}
            <ProfilMarke satz={h} raeder={raederFuer(h.id)} praefix="" />
            <br />
            eingelagert {formatDate(h.created_at.slice(0, 10))} · entfernt {h.removed_at ? formatDate(h.removed_at.slice(0, 10)) : "–"}
          </div>
        );
      })}
    </div>
  );

  // Platz löschen: Ein belegter Platz ist gesperrt (Migration 55) – der Knopf erscheint nur am
  // freien. Die Rückfrage nennt, wie viel Verlauf mitgeht (docs/lager.md, „Belegt heißt: nicht
  // löschbar").
  function loeschen() {
    const zusatz = verlauf.length > 0
      ? `\n\nAuf diesem Platz lagen früher ${verlauf.length} ${verlauf.length === 1 ? "Satz" : "Sätze"}. Dieser Verlauf wird mitgelöscht.`
      : "";
    if (confirm(`Lagerplatz "${slot.code}" wirklich löschen?${zusatz}`)) onLoeschen();
  }

  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt lg-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Lagerplatz ${slot.code}`}>
        <div className="ab-griff" />

        {!satz ? (
          <>
            <div className="lg-blatt-kopf">
              <span className="lg-code gross frei">{slot.code}</span>
              <span className="lg-blatt-titel">
                <b>Platz ist frei</b>
                <span className="small">{wo}</span>
              </span>
              <button type="button" className="lg-zu" onClick={onClose} aria-label="Schließen">✕</button>
            </div>
            {canAssign && <button type="button" className="lg-knopf primaer gross" onClick={onBearbeiten}>Reifen einlagern</button>}
            <div className="lg-knoepfe">
              <button type="button" className="lg-knopf" onClick={onAufkleber}>Aufkleber fürs Regal</button>
              {canDelete && <button type="button" className="lg-knopf gefahr" onClick={loeschen}>Platz löschen</button>}
            </div>
            {verlaufKnopf || <span className="small">Auf diesem Platz lag noch kein Satz.</span>}
            {verlaufListe}
          </>
        ) : (
          <>
            <div className="lg-blatt-kopf">
              <span className="lg-code gross">{slot.code}</span>
              <span className="lg-blatt-titel">
                <b>{kunde ? kunde.name : "Unbekannter Kunde"}</b>
                <span className="small">{wo}</span>
              </span>
              {kunde && onKunde
                ? <button type="button" className="lg-pille" onClick={() => onKunde(kunde.id)}>Kunde ›</button>
                : <button type="button" className="lg-zu" onClick={onClose} aria-label="Schließen">✕</button>}
            </div>

            {gruende.length > 0 && (
              <div className="lg-gruende">
                {gruende.map((g) => <span key={g}>{g}</span>)}
              </div>
            )}

            <div className="lg-felder">
              <span className="lg-feld">
                <span className="lg-feld-titel">Fahrzeug</span>
                <span>{fahrzeug ? [fahrzeug.license_plate, fahrzeug.make_model].filter(Boolean).join(" · ") || "ohne Kennzeichen" : "nicht zugeordnet"}</span>
              </span>
              <span className="lg-feld">
                <span className="lg-feld-titel">Saison · Größe</span>
                <span>{[satz.saison ? SAISON_LABEL[satz.saison] : "Saison offen", fahrzeug?.tire_size].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="lg-feld">
                <span className="lg-feld-titel">DOT</span>
                <span>{satz.dot_date ? `${satz.dot_date}${dotJahr(satz.dot_date) ? ` (${dotJahr(satz.dot_date)})` : ""}` : "nicht erfasst"}</span>
              </span>
              <span className="lg-feld">
                <span className="lg-feld-titel">Eingelagert</span>
                <span>
                  {formatDate(satz.created_at.slice(0, 10))}
                  {(() => {
                    const monate = lagermonate(satz.created_at, heute);
                    return ` · ${monate} ${monate === 1 ? "Monat" : "Monate"}`
                      + (lagergebuehrJeMonat != null ? ` · ${formatEUR(monate * lagergebuehrJeMonat)} netto` : "");
                  })()}
                </span>
              </span>
            </div>

            <div className="lg-profil">
              <span className="lg-feld-titel">{(satz.erfassungsart ?? "sammel") === "einzeln" ? "Profiltiefe je Rad" : "Profiltiefe (ein Wert für den Satz)"}</span>
              {(satz.erfassungsart ?? "sammel") === "einzeln" ? (
                <div className="lg-raeder">
                  {RAD_POSITIONEN.map((pos) => {
                    const mm = raeder.find((r) => r.position === pos)?.profiltiefe_mm ?? null;
                    return (
                      <span key={pos} className={`lg-rad ${profilLage(mm, GRENZEN)}`} title={RAD_POSITION_LABEL[pos]}>
                        <span className="lg-rad-pos">{pos}</span>
                        {profilText(mm)}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="lg-raeder eins">
                  <span className={`lg-rad ${profilLage(satzProfilMm(satz, raeder), GRENZEN)}`}>{profilText(satzProfilMm(satz, raeder))}</span>
                </div>
              )}
            </div>

            {satz.note && <div className="lg-notiz">{satz.note}</div>}

            <div className="lg-knoepfe">
              {canAssign && <button type="button" className="lg-knopf primaer" onClick={() => onAuslagern(satz.id)}>Auslagern</button>}
              {canAssign && <button type="button" className="lg-knopf" onClick={onBearbeiten}>Bearbeiten</button>}
              <button type="button" className="lg-knopf klein" onClick={() => onEtikett(satz.id)}>Etikett für den Satz</button>
              <button type="button" className="lg-knopf klein" onClick={onAufkleber}>Aufkleber fürs Regal</button>
            </div>
            {verlaufKnopf}
            {verlaufListe}
          </>
        )}
      </div>
    </div>
  );
}

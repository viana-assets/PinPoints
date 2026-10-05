import type { Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { eingelagerteSaetze, frueherEingelagerteSaetze } from "@/lib/eingelagert";
import { formatDate } from "@/lib/helpers";
import { istVorgemerkt } from "@/lib/lagerVormerkung";
import { auftragsNr } from "@/lib/testkunde";

// Abschnitt „Eingelagerte Reifen" im Kundenfenster (25.09.2026): alle Sätze des Kunden auf
// einen Blick – Lagerplatz, Kennzeichen, Saison, Größe, DOT. Gebaut für Firmenkunden mit vielen
// Autos; bei Privatkunden mit einem Satz ist es eine Zeile.
//
// Als Liste aus Zeilen statt als Tabelle: Am Handy sind fünf Spalten nicht lesbar, und die
// Platznummer ist die eine Angabe, die man im Regal sucht – sie steht deshalb groß vorn.
//
// Antippen springt ins Lager auf diesen Platz – aber nur, wenn die Rolle das Lager sehen darf
// (`onZumPlatz` fehlt sonst).
//
// Seit v111 (Migration 67): Ein Satz, der mit einem Auftrag herausgeht, trägt „vorgemerkt · 1234"
// – er liegt noch im Regal. Darunter, zugeklappt, was früher eingelagert war, mit dem Platz von
// damals.
export function EingelagerteReifen({ saetze, plaetze, lager, fahrzeuge, auftraege = [], onZumPlatz }: {
  saetze: TireStorage[];
  plaetze: StorageSlot[];
  lager: Warehouse[];
  fahrzeuge: Vehicle[];
  // Die Aufträge dieses Kunden – für die Nummer an „vorgemerkt".
  auftraege?: Order[];
  onZumPlatz?: (platzId: string) => void;
}) {
  const liste = eingelagerteSaetze(saetze, plaetze, lager, fahrzeuge);
  const frueher = frueherEingelagerteSaetze(saetze, plaetze, lager, fahrzeuge);
  if (liste.length === 0 && frueher.length === 0) return null;
  const vormerkung = (satz: TireStorage) => {
    if (!istVorgemerkt(satz)) return null;
    const o = auftraege.find((x) => x.id === satz.entnahme_order_id);
    return o ? `vorgemerkt · ${auftragsNr(o.order_number)} am ${formatDate(o.order_date)}` : "vorgemerkt";
  };
  // Der Lagername steht nur da, wenn es mehr als ein Lager gibt – sonst ist er Rauschen.
  const mehrereLager = new Set(liste.map((z) => z.lager)).size > 1;

  return (
    <>
      <h4>Eingelagerte Reifen <span className="small">({liste.length})</span></h4>
      {liste.length === 0 && <span className="small">Zurzeit liegt nichts im Regal.</span>}
      <div className="eingelagert-liste">
        {liste.map(({ satz, lager: halle, platz, platzId, fahrzeug }) => {
          const angaben = [
            satz.saison ? SAISON_LABEL[satz.saison] : null,
            fahrzeug?.tire_size || null,
            satz.dot_date ? `DOT ${satz.dot_date}` : null,
            satz.anzahl_raeder && satz.anzahl_raeder !== 4 ? `${satz.anzahl_raeder} Räder` : null,
          ].filter(Boolean).join(" · ");
          const inhalt = (
            <>
              <span className="el-platz">
                {mehrereLager && <span className="el-lager">{halle}</span>}
                {platz}
              </span>
              <span className="el-text">
                <span className="el-kennzeichen">
                  {fahrzeug
                    ? [fahrzeug.license_plate || "Ohne Kennzeichen", fahrzeug.make_model].filter(Boolean).join(" · ")
                    : <span className="el-ohne">kein Fahrzeug zugeordnet</span>}
                </span>
                {angaben && <span className="small">{angaben}</span>}
                {vormerkung(satz) && <span className="vm-marke">{vormerkung(satz)}</span>}
                {satz.note && <span className="small">{satz.note}</span>}
              </span>
            </>
          );
          return onZumPlatz ? (
            <button key={satz.id} type="button" className="el-zeile" title="Im Lager öffnen" onClick={() => onZumPlatz(platzId)}>
              {inhalt}
            </button>
          ) : (
            <div key={satz.id} className="el-zeile">{inhalt}</div>
          );
        })}
      </div>
      {frueher.length > 0 && (
        <details className="el-frueher">
          <summary>Früher eingelagert <span className="small">({frueher.length})</span></summary>
          <div className="eingelagert-liste">
            {frueher.map(({ satz, lager: halle, platz, fahrzeug }) => (
              <div key={satz.id} className="el-zeile el-alt">
                <span className="el-platz">
                  {mehrereLager && <span className="el-lager">{halle}</span>}
                  {platz}
                </span>
                <span className="el-text">
                  <span className="el-kennzeichen">
                    {[satz.saison ? SAISON_LABEL[satz.saison] : "Reifensatz", fahrzeug?.license_plate].filter(Boolean).join(" · ")}
                  </span>
                  <span className="small">
                    {formatDate(satz.created_at.slice(0, 10))} – {formatDate((satz.removed_at ?? "").slice(0, 10))}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

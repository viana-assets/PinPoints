import type { StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { eingelagerteSaetze } from "@/lib/eingelagert";

// Abschnitt „Eingelagerte Reifen" im Kundenfenster (25.09.2026): alle Sätze des Kunden auf
// einen Blick – Lagerplatz, Kennzeichen, Saison, Größe, DOT. Gebaut für Firmenkunden mit vielen
// Autos; bei Privatkunden mit einem Satz ist es eine Zeile.
//
// Als Liste aus Zeilen statt als Tabelle: Am Handy sind fünf Spalten nicht lesbar, und die
// Platznummer ist die eine Angabe, die man im Regal sucht – sie steht deshalb groß vorn.
//
// Antippen springt ins Lager auf diesen Platz – aber nur, wenn die Rolle das Lager sehen darf
// (`onZumPlatz` fehlt sonst).
export function EingelagerteReifen({ saetze, plaetze, lager, fahrzeuge, onZumPlatz }: {
  saetze: TireStorage[];
  plaetze: StorageSlot[];
  lager: Warehouse[];
  fahrzeuge: Vehicle[];
  onZumPlatz?: (platzId: string) => void;
}) {
  const liste = eingelagerteSaetze(saetze, plaetze, lager, fahrzeuge);
  if (liste.length === 0) return null;
  // Der Lagername steht nur da, wenn es mehr als ein Lager gibt – sonst ist er Rauschen.
  const mehrereLager = new Set(liste.map((z) => z.lager)).size > 1;

  return (
    <>
      <h4>Eingelagerte Reifen <span className="small">({liste.length})</span></h4>
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
    </>
  );
}

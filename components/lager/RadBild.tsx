import { useState } from "react";
import type { EingelagertesRad, Felge, RadPosition } from "@/lib/types";
import {
  RAD_POSITIONEN, RAD_POSITION_LABEL, FELGEN, FELGE_LABEL,
  PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM, PROFIL_GESETZLICH_MM,
} from "@/lib/constants";
import { profilLage, profilText, satzProfilMm } from "@/lib/helpers";
import type { RadFelder } from "@/lib/api/lager";

// Die vier Räder eines eingelagerten Satzes – als Bild statt als Formular
// (docs/lager-ausbaukonzept.md, A1 und „Grafisch arbeiten").
//
// Warum ein Bild: Vier Zeilen mit der Beschriftung „VL/VR/HL/HR" verlangen bei jedem Blick
// eine Übersetzungsleistung – man muss sich das Auto dazu denken. Im Bild ist die Zuordnung
// die Position selbst; man tippt das Rad an, das man gerade in der Hand hat. Dazu zeigt die
// Farbe sofort, wo es eng wird, ohne dass man vier Zahlen vergleichen muss.
//
// Die Ampel meint hier ausdrücklich den ZUSTAND (Profiltiefe), nicht die Belegung – das ist
// dieselbe Bedeutung wie beim Kundenzustand und damit kein zweites Vokabular für dieselben
// Farben (siehe docs/design-system.md).

const GRENZEN = { hinweis: PROFIL_HINWEIS_MM, kritisch: PROFIL_KRITISCH_MM };

export function RadBild({ raeder, anzahlRaeder, gesperrt, onSpeichern, onEntfernen }: {
  raeder: EingelagertesRad[];
  anzahlRaeder: number;
  gesperrt: boolean;
  // Legt an oder ändert – je nachdem, ob für diese Position schon ein Rad existiert.
  onSpeichern: (position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onEntfernen: (radId: string) => Promise<void>;
}) {
  const [offen, setOffen] = useState<RadPosition | null>(null);

  const radAn = (p: RadPosition) => raeder.find((r) => r.position === p) || null;
  const ohnePosition = raeder.filter((r) => !r.position);
  const gesamt = satzProfilMm({ erfassungsart: "einzeln", profiltiefe_mm: null }, raeder);

  return (
    <div>
      <div className="radbild">
        {/* Die Karosserie ist bewusst nur eine Andeutung: Sie beantwortet die Frage „wo ist
            vorne?" und sonst nichts. Ein detailliertes Auto würde vom Wesentlichen ablenken –
            und bei jedem Fahrzeugtyp falsch aussehen. */}
        <div className="radbild-karosserie">
          <span className="radbild-vorne">vorne</span>
        </div>
        {RAD_POSITIONEN.map((p) => {
          const rad = radAn(p);
          const lage = profilLage(rad?.profiltiefe_mm ?? null, GRENZEN);
          return (
            <button
              key={p}
              type="button"
              className={`rad rad-${p.toLowerCase()} rad-${lage}${offen === p ? " rad-offen" : ""}`}
              disabled={gesperrt}
              onClick={() => setOffen(offen === p ? null : p)}
              title={`${RAD_POSITION_LABEL[p]}${rad?.profiltiefe_mm != null ? ` – ${profilText(rad.profiltiefe_mm)}` : " – noch nicht gemessen"}`}
            >
              <span className="rad-pos">{p}</span>
              <span className="rad-wert">{rad?.profiltiefe_mm != null ? rad.profiltiefe_mm.toFixed(1).replace(".", ",") : "–"}</span>
            </button>
          );
        })}
      </div>

      <div className="small" style={{ textAlign: "center", marginTop: 4 }}>
        {gesamt == null
          ? "Noch kein Rad gemessen."
          : `Schwächstes Rad: ${profilText(gesamt)}${gesamt < PROFIL_GESETZLICH_MM ? " – unter dem gesetzlichen Minimum" : ""}`}
      </div>

      {offen && (
        <RadEingabe
          position={offen}
          rad={radAn(offen)}
          onSchliessen={() => setOffen(null)}
          onSpeichern={(felder) => onSpeichern(offen, felder)}
          onEntfernen={onEntfernen}
        />
      )}

      {/* Räder ohne Position: das lose Ersatzrad, der Fall „zwei weggeworfen, zwei
          eingelagert". Sie stehen unter dem Bild, weil sie im Bild keinen Platz haben – aber
          sie zählen mit. */}
      {ohnePosition.length > 0 && (
        <div className="small" style={{ marginTop: 6 }}>
          {ohnePosition.length} {ohnePosition.length === 1 ? "Rad" : "Räder"} ohne Position:{" "}
          {ohnePosition.map((r) => profilText(r.profiltiefe_mm)).join(" · ")}
        </div>
      )}

      {raeder.length > anzahlRaeder && (
        <div className="small" style={{ marginTop: 6, color: "var(--red)" }}>
          Es sind mehr Räder erfasst als vorgesehen ({raeder.length} von {anzahlRaeder}).
        </div>
      )}
    </div>
  );
}

// Die Eingabe zu einem Rad. Große Schaltflächen in 0,1-Schritten statt eines Zahlenfelds:
// gemessen wird mit Handschuhen, im Stehen, mit dem Handy in einer Hand. Die Tastatur wäre
// hier der langsamste Weg – tippbar schlägt tippbar-und-scrollbar.
function RadEingabe({ position, rad, onSchliessen, onSpeichern, onEntfernen }: {
  position: RadPosition;
  rad: EingelagertesRad | null;
  onSchliessen: () => void;
  onSpeichern: (felder: Partial<RadFelder>) => Promise<void>;
  onEntfernen: (radId: string) => Promise<void>;
}) {
  const [mm, setMm] = useState<number>(rad?.profiltiefe_mm ?? 6);
  const [felge, setFelge] = useState<Felge | null>(rad?.felge ?? null);
  const [sensor, setSensor] = useState<boolean>(rad?.sensor ?? false);
  const [groesse, setGroesse] = useState(rad?.reifengroesse || "");
  const [dot, setDot] = useState(rad?.dot_date || "");
  const [bemerkung, setBemerkung] = useState(rad?.bemerkung || "");
  const [laeuft, setLaeuft] = useState(false);

  const lage = profilLage(mm, GRENZEN);

  function stufe(delta: number) {
    // Auf eine Nachkommastelle runden: 5.2 + 0.1 ergibt in Gleitkomma sonst 5.300000000000001,
    // und das steht dann so in der Datenbank.
    setMm((alt) => Math.min(25, Math.max(0, Math.round((alt + delta) * 10) / 10)));
  }

  return (
    <div className="rad-eingabe">
      <div className="rad-eingabe-kopf">
        <b>{RAD_POSITION_LABEL[position]}</b>
        <button type="button" className="btn-secondary" style={{ padding: "3px 8px" }} onClick={onSchliessen}>Schließen</button>
      </div>

      <div className="rad-stufen">
        <button type="button" className="btn-secondary rad-stufe" onClick={() => stufe(-0.1)} aria-label="0,1 mm weniger">−</button>
        <div className={`rad-wert-gross rad-${lage}`}>
          {mm.toFixed(1).replace(".", ",")}<span className="rad-einheit">mm</span>
        </div>
        <button type="button" className="btn-secondary rad-stufe" onClick={() => stufe(0.1)} aria-label="0,1 mm mehr">+</button>
      </div>

      <div className="filterbar" style={{ justifyContent: "center" }}>
        {FELGEN.map((f) => (
          <button key={f} type="button" className={"chip" + (felge === f ? " active" : "")} onClick={() => setFelge(felge === f ? null : f)}>
            {FELGE_LABEL[f]}
          </button>
        ))}
        <button type="button" className={"chip" + (sensor ? " active" : "")} onClick={() => setSensor(!sensor)}>
          Sensor
        </button>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Reifengröße</label>
          <input type="text" placeholder="205/55 R16" value={groesse} onChange={(e) => setGroesse(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>DOT</label>
          <input type="text" placeholder="2523" value={dot} onChange={(e) => setDot(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 6, marginBottom: 0 }}>
        <label>Bemerkung</label>
        <input type="text" placeholder="z. B. Felge Bordsteinschaden" value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
      </div>

      <div className="appt-actions" style={{ marginTop: 8 }}>
        <button
          type="button" className="btn-primary" disabled={laeuft}
          onClick={async () => {
            setLaeuft(true);
            try {
              await onSpeichern({
                profiltiefeMm: String(mm),
                felge,
                sensor,
                reifengroesse: groesse,
                dotDate: dot,
                bemerkung,
              });
              onSchliessen();
            } finally {
              setLaeuft(false);
            }
          }}
        >
          Übernehmen
        </button>
        {rad && (
          <button
            type="button" className="btn-secondary" disabled={laeuft}
            onClick={async () => {
              setLaeuft(true);
              try {
                await onEntfernen(rad.id);
                onSchliessen();
              } finally {
                setLaeuft(false);
              }
            }}
          >
            Messung entfernen
          </button>
        )}
      </div>
    </div>
  );
}

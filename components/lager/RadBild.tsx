import { useState } from "react";
import type { EingelagertesRad, Felge, RadPosition } from "@/lib/types";
import {
  RAD_POSITIONEN, RAD_POSITION_LABEL, FELGEN, FELGE_LABEL,
  PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM, PROFIL_GESETZLICH_MM, PROFIL_MAX_MM,
} from "@/lib/constants";
import { profilAusText, profilLage, profilText, profilZahl, satzProfilMm } from "@/lib/helpers";
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

// Die Eingabe zu einem Rad. BEIDES: große Schaltflächen in 0,1-Schritten UND ein Feld, in das
// man die Zahl direkt tippt.
//
// Zuerst gab es nur die Tasten, mit der Begründung, dass mit Handschuhen im Stehen gemessen
// wird und eine Tastatur der langsamere Weg sei. Das stimmt für die Feinkorrektur und war für
// den Sprung falsch: Von 6,0 auf 1,0 sind es fünfzig Tipper. Gemeldet aus dem Betrieb am
// 21.09.2026.
//
// Die Tasten bleiben trotzdem, und zwar genauso groß: Wer 6,0 abliest und auf 5,8 korrigiert,
// will nicht die Tastatur öffnen. Die beiden Wege widersprechen sich nicht – sie gehören zu
// zwei verschiedenen Bewegungen.
function RadEingabe({ position, rad, onSchliessen, onSpeichern, onEntfernen }: {
  position: RadPosition;
  rad: EingelagertesRad | null;
  onSchliessen: () => void;
  onSpeichern: (felder: Partial<RadFelder>) => Promise<void>;
  onEntfernen: (radId: string) => Promise<void>;
}) {
  const [mm, setMm] = useState<number>(rad?.profiltiefe_mm ?? 6);
  // Was im Feld STEHT, während getippt wird – „1," ist unterwegs ein gültiger Zwischenstand,
  // aber keine Zahl. Würde bei jedem Zeichen durch `mm` ersetzt, ließe sich das Komma nicht
  // tippen. Beim Verlassen des Feldes wird daraus wieder ein Wert.
  const [mmText, setMmText] = useState<string>(profilZahl(rad?.profiltiefe_mm ?? 6));
  const [felge, setFelge] = useState<Felge | null>(rad?.felge ?? null);
  const [sensor, setSensor] = useState<boolean>(rad?.sensor ?? false);
  const [groesse, setGroesse] = useState(rad?.reifengroesse || "");
  const [dot, setDot] = useState(rad?.dot_date || "");
  const [bemerkung, setBemerkung] = useState(rad?.bemerkung || "");
  const [laeuft, setLaeuft] = useState(false);

  const lage = profilLage(mm, GRENZEN);

  function setzen(wert: number) {
    // Auf eine Nachkommastelle runden: 5.2 + 0.1 ergibt in Gleitkomma sonst 5.300000000000001,
    // und das steht dann so in der Datenbank.
    const rund = Math.min(PROFIL_MAX_MM, Math.max(0, Math.round(wert * 10) / 10));
    setMm(rund);
    setMmText(profilZahl(rund));
  }

  function stufe(delta: number) {
    // Grundlage ist, was IM FELD steht – nicht der zuletzt übernommene Wert. Wer 2,0 tippt
    // und ohne Umweg auf Plus drückt, erwartet 2,1. Der Verlust des Fokus und der Klick sind
    // zwei Ereignisse; ob React zwischen ihnen schon neu gezeichnet hat, ist nicht zugesichert
    // – aus 2,0 plus einem Schritt würde dann 6,1. Der Text dagegen ist nach jedem Zeichen
    // aktuell.
    const basis = profilAusText(mmText, PROFIL_MAX_MM) ?? mm;
    setzen(basis + delta);
  }

  // Beim Verlassen des Feldes (oder mit der Eingabetaste) wird aus dem Getippten ein Wert.
  // Unsinn führt zurück auf den letzten gültigen Stand – ein leeres Feld stillschweigend als
  // 0,0 mm zu verbuchen wäre eine Messung, die niemand gemacht hat.
  function textUebernehmen() {
    const zahl = profilAusText(mmText, PROFIL_MAX_MM);
    if (zahl == null) { setMmText(profilZahl(mm)); return; }
    setzen(zahl);
  }

  return (
    <div className="rad-eingabe">
      <div className="rad-eingabe-kopf">
        <b>{RAD_POSITION_LABEL[position]}</b>
        <button type="button" className="btn-secondary" style={{ padding: "3px 8px" }} onClick={onSchliessen}>Schließen</button>
      </div>

      <div className="rad-stufen">
        <button type="button" className="btn-secondary rad-stufe" onClick={() => stufe(-0.1)} aria-label="0,1 mm weniger">−</button>
        <label className={`rad-wert-gross rad-${lage}`}>
          <input
            // `text` mit `inputMode="decimal"`, nicht `type="number"`: Ein Zahlenfeld nimmt in
            // deutscher Eingabe kein Komma an und zeigt auf dem iPhone trotzdem eine Tastatur,
            // auf der das Komma die naheliegende Taste ist. Hier wird beides angenommen.
            type="text" inputMode="decimal" enterKeyHint="done"
            className="rad-wert-feld" aria-label="Profiltiefe in Millimetern"
            value={mmText}
            onChange={(e) => setMmText(e.target.value)}
            // Beim Antippen alles markieren: Wer die Zahl ändert, will sie ersetzen, nicht
            // hinter ihr weiterschreiben. Ohne das entsteht aus 6,0 beim Tippen von 1,0
            // schnell eine 6,01,0.
            onFocus={(e) => e.currentTarget.select()}
            onBlur={textUebernehmen}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          />
          <span className="rad-einheit">mm</span>
        </label>
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

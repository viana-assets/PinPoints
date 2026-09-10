import { useState } from "react";
import type { Firmenfahrzeug } from "@/lib/types";
import type { FirmenfahrzeugFelder } from "@/lib/api/firmenfahrzeuge";

// Stammdaten der eigenen Transporter (Migration 32, Konzept: docs/lager-ausbaukonzept.md C1).
//
// Bewusst schlicht: Kennzeichen, Bezeichnung, Notiz, aktiv. Bei zwei Fahrzeugen ist alles
// darüber hinaus – Kilometerstände, TÜV-Termine, Tankkarten – eine Fuhrparkverwaltung, und
// die gehört nicht in eine Auftragsanwendung.
//
// Kein Löschen, sondern Ausmustern: An alten Aufträgen hängt das Fahrzeug weiter, und die
// Frage „womit waren wir letzten Herbst unterwegs" soll beantwortbar bleiben.
export function FirmenfahrzeugPanel({ fahrzeuge, onAnlegen, onAendern, onAusmustern }: {
  fahrzeuge: Firmenfahrzeug[];
  onAnlegen: (felder: FirmenfahrzeugFelder) => Promise<string | null>;
  onAendern: (id: string, felder: FirmenfahrzeugFelder) => Promise<string | null>;
  onAusmustern: (id: string, aktiv: boolean) => Promise<void>;
}) {
  const [kennzeichen, setKennzeichen] = useState("");
  const [bezeichnung, setBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);

  async function anlegen() {
    if (!kennzeichen.trim()) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const meldung = await onAnlegen({ kennzeichen, bezeichnung, notiz: "", aktiv: true });
      if (meldung) { setFehler(meldung); return; }
      setKennzeichen("");
      setBezeichnung("");
    } finally {
      setLaeuft(false);
    }
  }

  const aktive = fahrzeuge.filter((f) => f.aktiv);
  const ausgemusterte = fahrzeuge.filter((f) => !f.aktiv);

  return (
    <div>
      <h4 style={{ margin: "0 0 4px" }}>Firmenfahrzeuge</h4>
      <div className="small" style={{ marginBottom: 6 }}>
        Die eigenen Transporter – nicht die Autos der Kunden. Sie lassen sich am Auftrag
        einteilen und in der Einsatzplanung filtern.
      </div>

      <div className="row" style={{ maxWidth: 520 }}>
        <input
          type="text" placeholder="Kennzeichen, z. B. N-VI 100"
          value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void anlegen(); }}
        />
        <input
          type="text" placeholder="Bezeichnung, z. B. Sprinter weiß"
          value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void anlegen(); }}
        />
        <button className="btn-primary" style={{ flex: "0 0 auto" }} disabled={laeuft || !kennzeichen.trim()} onClick={() => void anlegen()}>
          + Fahrzeug
        </button>
      </div>
      {fehler && <div className="hinweis-pflicht" style={{ marginTop: 6, maxWidth: 520 }}>{fehler}</div>}

      {fahrzeuge.length === 0 ? (
        <div className="empty" style={{ marginTop: 8 }}>Noch kein Firmenfahrzeug angelegt.</div>
      ) : (
        <table className="appt-table" style={{ maxWidth: 720, marginTop: 8 }}>
          <thead><tr><th>Kennzeichen</th><th>Bezeichnung</th><th>Notiz</th><th></th></tr></thead>
          <tbody>
            {[...aktive, ...ausgemusterte].map((f) => (
              <FahrzeugZeile
                key={f.id}
                fahrzeug={f}
                offen={offen === f.id}
                onOeffnen={() => setOffen(offen === f.id ? null : f.id)}
                onAendern={onAendern}
                onAusmustern={onAusmustern}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FahrzeugZeile({ fahrzeug, offen, onOeffnen, onAendern, onAusmustern }: {
  fahrzeug: Firmenfahrzeug;
  offen: boolean;
  onOeffnen: () => void;
  onAendern: (id: string, felder: FirmenfahrzeugFelder) => Promise<string | null>;
  onAusmustern: (id: string, aktiv: boolean) => Promise<void>;
}) {
  const [kennzeichen, setKennzeichen] = useState(fahrzeug.kennzeichen);
  const [bezeichnung, setBezeichnung] = useState(fahrzeug.bezeichnung || "");
  const [notiz, setNotiz] = useState(fahrzeug.notiz || "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  if (!offen) {
    return (
      <tr style={fahrzeug.aktiv ? undefined : { opacity: 0.55 }}>
        <td style={{ fontWeight: 700 }}>{fahrzeug.kennzeichen}{fahrzeug.aktiv ? "" : " (ausgemustert)"}</td>
        <td>{fahrzeug.bezeichnung || "–"}</td>
        <td className="small">{fahrzeug.notiz || ""}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={onOeffnen}>
            Bearbeiten
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={4} style={{ background: "rgba(0,0,0,.02)" }}>
        <div className="row" style={{ marginBottom: 4 }}>
          <input type="text" className="feld-kompakt" value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)} placeholder="Kennzeichen" />
          <input type="text" className="feld-kompakt" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="Bezeichnung" />
        </div>
        <input type="text" className="feld-kompakt" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz (optional)" />
        {fehler && <div className="hinweis-pflicht" style={{ marginTop: 6 }}>{fehler}</div>}
        <div className="appt-actions" style={{ marginTop: 6 }}>
          <button
            className="btn-primary"
            disabled={laeuft || !kennzeichen.trim()}
            onClick={async () => {
              setLaeuft(true);
              setFehler(null);
              try {
                const meldung = await onAendern(fahrzeug.id, { kennzeichen, bezeichnung, notiz, aktiv: fahrzeug.aktiv });
                if (meldung) { setFehler(meldung); return; }
                onOeffnen();
              } finally {
                setLaeuft(false);
              }
            }}
          >
            Speichern
          </button>
          <button className="btn-secondary" onClick={onOeffnen}>Abbrechen</button>
          <button
            className="btn-secondary"
            disabled={laeuft}
            onClick={async () => {
              // Ausmustern statt löschen – siehe Kopf der Datei. Deshalb auch nur eine kurze
              // Rückfrage: es ist umkehrbar.
              if (fahrzeug.aktiv && !window.confirm(`${fahrzeug.kennzeichen} ausmustern? Es verschwindet aus der Auswahl für neue Aufträge, bleibt aber an den bisherigen erhalten.`)) return;
              setLaeuft(true);
              try {
                await onAusmustern(fahrzeug.id, !fahrzeug.aktiv);
                onOeffnen();
              } finally {
                setLaeuft(false);
              }
            }}
          >
            {fahrzeug.aktiv ? "Ausmustern" : "Wieder in Betrieb nehmen"}
          </button>
        </div>
      </td>
    </tr>
  );
}

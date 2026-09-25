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
    <div className="ad-abschnitt">
      <div className="db-karte ad-aktion">
        <b className="ad-aktion-titel">Transporter anlegen</b>
        <span className="small">Die eigenen Transporter – nicht die Autos der Kunden. Sie lassen sich am Auftrag einteilen und in der Einsatzplanung filtern.</span>
        <div className="ad-aktion-zeile">
          <input
            type="text" placeholder="Kennzeichen, z. B. N-VI 100" aria-label="Kennzeichen"
            value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void anlegen(); }}
          />
          <input
            type="text" placeholder="Bezeichnung, z. B. Sprinter weiß" aria-label="Bezeichnung"
            value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void anlegen(); }}
          />
        </div>
        {fehler && <div className="hinweis-pflicht">{fehler}</div>}
        <button type="button" className="am-knopf" disabled={laeuft || !kennzeichen.trim()} onClick={() => void anlegen()}>
          + Transporter
        </button>
      </div>

      {fahrzeuge.length === 0 ? (
        <div className="db-karte"><div className="db-leer">Noch kein Transporter angelegt.</div></div>
      ) : (
        [...aktive, ...ausgemusterte].map((f, i) => (
          <FahrzeugZeile
            key={f.id}
            fahrzeug={f}
            nr={i + 1}
            offen={offen === f.id}
            onOeffnen={() => setOffen(offen === f.id ? null : f.id)}
            onAendern={onAendern}
            onAusmustern={onAusmustern}
          />
        ))
      )}
    </div>
  );
}

function FahrzeugZeile({ fahrzeug, nr, offen, onOeffnen, onAendern, onAusmustern }: {
  fahrzeug: Firmenfahrzeug;
  nr: number;
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

  async function ausmustern() {
    // Ausmustern statt löschen – siehe Kopf der Datei. Deshalb auch nur eine kurze
    // Rückfrage: es ist umkehrbar.
    if (fahrzeug.aktiv && !window.confirm(`${fahrzeug.kennzeichen} ausmustern? Es verschwindet aus der Auswahl für neue Aufträge, bleibt aber an den bisherigen erhalten.`)) return;
    setLaeuft(true);
    try {
      await onAusmustern(fahrzeug.id, !fahrzeug.aktiv);
      if (offen) onOeffnen();
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <div className={"ad-karte" + (fahrzeug.aktiv ? "" : " blass")}>
        <span className={"ad-kreis" + (fahrzeug.aktiv ? " navy" : " grau")}>{fahrzeug.aktiv ? nr : "–"}</span>
        <span className="ad-karte-text">
          <b>{fahrzeug.kennzeichen}{fahrzeug.bezeichnung ? ` · ${fahrzeug.bezeichnung}` : ""}</b>
          <span className="small">{fahrzeug.aktiv ? (fahrzeug.notiz || "im Einsatz") : `ausgemustert${fahrzeug.notiz ? ` · ${fahrzeug.notiz}` : ""}`}</span>
        </span>
        {fahrzeug.aktiv ? (
          <button type="button" className="db-link" onClick={onOeffnen}>Bearbeiten</button>
        ) : (
          <button type="button" className="db-link" disabled={laeuft} onClick={() => void ausmustern()}>Wieder in Betrieb</button>
        )}
      </div>
    );
  }

  return (
    <div className="db-karte ad-aktion">
      <b className="ad-aktion-titel">{fahrzeug.kennzeichen} bearbeiten</b>
      <div className="ad-aktion-zeile">
        <input type="text" value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)} placeholder="Kennzeichen" aria-label="Kennzeichen" />
        <input type="text" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="Bezeichnung" aria-label="Bezeichnung" />
      </div>
      <input type="text" className="ad-eingabe" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz (optional), z. B. Regal für 8 Sätze" aria-label="Notiz" />
      {fehler && <div className="hinweis-pflicht">{fehler}</div>}
      <div className="ad-knoepfe">
        <button type="button" className="es-knopf ad-gefahr" disabled={laeuft} onClick={() => void ausmustern()}>
          {fahrzeug.aktiv ? "Ausmustern" : "Wieder in Betrieb nehmen"}
        </button>
        <span className="ad-luecke" />
        <button type="button" className="es-knopf" onClick={onOeffnen}>Abbrechen</button>
        <button
          type="button" className="am-mini"
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
      </div>
    </div>
  );
}

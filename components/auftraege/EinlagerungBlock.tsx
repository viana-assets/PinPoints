import { useState } from "react";
import type {
  EingelagertesRad, Erfassungsart, RadPosition, Saison, StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { profilText, satzProfilMm } from "@/lib/helpers";
import { RadBild } from "@/components/lager/RadBild";
import type { RadFelder } from "@/lib/api/lager";
import { lagerplatzIdAusCode } from "@/lib/lagerplatzCode";
import { QrScanner } from "@/components/QrScanner";

// Einlagerung im Auftragsfenster (Migration 22, siehe docs/lager.md).
//
// Vor dieser Ausbaustufe kannte das Lager nur Lagerplatz und Kunde – warum die Reifen dort
// liegen, stand nirgends, und der Techniker vor Ort hatte aus dem Auftrag heraus keinen Weg ins
// Regal. Jetzt gibt es beides an einer Stelle: Platz aus der Liste wählen oder den Aufkleber am
// Regal scannen.
//
// Der Scan ist nicht Bequemlichkeit, sondern Fehlervermeidung: eine Liste mit hundert
// Lagerplätzen auf einem Handy, während man mit Reifen in der Hand vor dem Regal steht, ist die
// zuverlässigste Art, A-12 statt A-21 zu treffen.

export function EinlagerungBlock({
  pflicht, einlagerung, slots, warehouses, belegteSlotIds, gesperrt, vehicles, raeder,
  onEinlagern, onEntfernen, onAngabenAendern, onErfassungsart, onAnzahlRaeder, onRadSpeichern, onRadEntfernen,
  onFahrzeugAnlegen,
}: {
  // Steht im Auftrag eine Leistung mit dem Kennzeichen „braucht Lagerplatz"? Dann verlangt auch
  // die Datenbank vor dem Abschluss einen belegten Platz – dieser Block zeigt nur an, was dort
  // ohnehin erzwungen wird. Ein Hinweis in der Oberfläche ohne Regel in der Datenbank wäre eine
  // Bitte, keine Zusicherung.
  pflicht: boolean;
  einlagerung: TireStorage | null;
  slots: StorageSlot[];
  warehouses: Warehouse[];
  belegteSlotIds: Set<string>;
  gesperrt: boolean;
  // Die Fahrzeuge des Kunden dieses Auftrags. Der Satz gehört seit Migration 30 zu einem
  // Fahrzeug, nicht nur zu einer Person – bei einem Kunden mit zwei Autos ist das der
  // Unterschied zwischen „irgendein Satz von Müller" und „der Wintersatz vom Kombi".
  vehicles: Vehicle[];
  onEinlagern: (lagerplatzId: string) => Promise<void>;
  onEntfernen: (einlagerungId: string) => Promise<void>;
  onAngabenAendern: (einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) => Promise<void>;
  // Die einzeln erfassten Räder DIESES Satzes (Migration 33). Leer, solange der Satz auf
  // Sammelmessung steht – dann gilt der eine Wert am Satz.
  raeder: EingelagertesRad[];
  onErfassungsart: (einlagerungId: string, art: Erfassungsart) => Promise<void>;
  onAnzahlRaeder: (einlagerungId: string, anzahl: number) => Promise<void>;
  onRadSpeichern: (einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onRadEntfernen: (radId: string) => Promise<void>;
  // Ein Fahrzeug direkt hier anlegen und dem Satz zuordnen. Der Techniker steht am Auto, im
  // Auftrag – ihn dafür ins Kundenfenster und wieder zurück zu schicken, war der längste Weg
  // für die kürzeste Eingabe (Kennzeichen + Modell).
  onFahrzeugAnlegen: (kennzeichen: string, modell: string) => Promise<void>;
}) {
  const [wahl, setWahl] = useState("");
  const [neuesKennzeichen, setNeuesKennzeichen] = useState("");
  const [neuesModell, setNeuesModell] = useState("");
  const [fahrzeugFormOffen, setFahrzeugFormOffen] = useState(false);
  const [scannerOffen, setScannerOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Ein belegter Platz taucht nicht in der Auswahl auf – der eigene bleibt sichtbar, sonst
  // verschwände die aktuelle Zuordnung aus ihrer eigenen Liste.
  const freieSlots = slots.filter((s) => !belegteSlotIds.has(s.id) || s.id === einlagerung?.storage_slot_id);

  function lagerName(warehouseId: string): string {
    return warehouses.find((w) => w.id === warehouseId)?.name || "Unbekanntes Lager";
  }
  function platzText(slot: StorageSlot): string {
    return `${slot.code} · ${lagerName(slot.warehouse_id)}`;
  }

  const belegterPlatz = einlagerung ? slots.find((s) => s.id === einlagerung.storage_slot_id) : null;

  function fahrzeugName(v: Vehicle): string {
    return [v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen";
  }
  function fahrzeugText(id: string | null): string {
    if (!id) return "ohne Fahrzeug";
    const v = vehicles.find((f) => f.id === id);
    return v ? fahrzeugName(v) : "Fahrzeug nicht auffindbar";
  }

  async function erfassungsartSetzen(art: Erfassungsart) {
    if (!einlagerung || einlagerung.erfassungsart === art) return;
    // Zurück auf einen Sammelwert wirft die gemessenen Radzeilen weg – das ist echte
    // Messarbeit, also einmal nachfragen. In die andere Richtung gibt es nichts zu verlieren.
    if (art === "sammel" && raeder.length > 0) {
      const sicher = window.confirm(
        `Zurück auf einen Wert für den ganzen Satz? Die ${raeder.length} gemessenen Räder werden dabei gelöscht.`
      );
      if (!sicher) return;
    }
    setLaeuft(true);
    setMeldung(null);
    try {
      await onErfassungsart(einlagerung.id, art);
    } finally {
      setLaeuft(false);
    }
  }

  async function angabenAendern(felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) {
    if (!einlagerung) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      await onAngabenAendern(einlagerung.id, felder);
    } finally {
      setLaeuft(false);
    }
  }

  async function zuordnen(lagerplatzId: string) {
    setLaeuft(true);
    setMeldung(null);
    try {
      await onEinlagern(lagerplatzId);
      setWahl("");
    } finally {
      setLaeuft(false);
    }
  }

  // Der gescannte Text wird hier geprüft und NICHT blind weitergereicht: im Lager hängen auch
  // Paketaufkleber und Reifenetiketten mit Codes herum. Passt er nicht, sagt die Meldung das,
  // statt still nichts zu tun.
  function gescannt(text: string) {
    setScannerOffen(false);
    const id = lagerplatzIdAusCode(text);
    if (!id) { setMeldung("Das war kein Lagerplatz-Aufkleber."); return; }
    const platz = slots.find((s) => s.id === id);
    if (!platz) { setMeldung("Dieser Lagerplatz ist in der App nicht (mehr) vorhanden."); return; }
    if (belegteSlotIds.has(platz.id) && platz.id !== einlagerung?.storage_slot_id) {
      setMeldung(`Lagerplatz ${platz.code} ist bereits belegt.`);
      return;
    }
    void zuordnen(platz.id);
  }

  return (
    <div className="auftrag-block">
      <div className="auftrag-block-titel">
        Einlagerung{pflicht && !einlagerung ? <span className="einlagerung-pflicht"> · Lagerplatz fehlt</span> : ""}
      </div>

      {einlagerung && belegterPlatz ? (
        <>
          <div><b>{belegterPlatz.code}</b> <span className="small">· {lagerName(belegterPlatz.warehouse_id)}</span></div>

          {/* Fahrzeug und Saison stehen HIER und nicht in einem eigenen Fenster: Der Techniker
              hat den Satz gerade in der Hand, das Auto steht vor ihm. Fünf Minuten später weiß
              es niemand mehr. Beides ist Pflicht, aber erst beim Abschließen des Auftrags –
              die Datenbank lehnt den Abschluss sonst ab (Migration 30). */}
          {gesperrt ? (
            <div className="small" style={{ marginTop: 4 }}>
              {fahrzeugText(einlagerung.vehicle_id)} · {einlagerung.saison ? SAISON_LABEL[einlagerung.saison] : "ohne Saison"}
              {" · "}Profil {profilText(satzProfilMm(einlagerung, raeder))}
              {einlagerung.erfassungsart === "einzeln" ? " (schwächstes Rad)" : ""}
            </div>
          ) : (
            <>
              <div className="field" style={{ margin: "8px 0 4px" }}>
                <label>Fahrzeug{einlagerung.vehicle_id ? "" : " – fehlt noch"}</label>
                {vehicles.length > 0 && (
                  <select
                    className={einlagerung.vehicle_id ? undefined : "feld-fehlt"}
                    value={einlagerung.vehicle_id || ""}
                    disabled={laeuft}
                    onChange={(e) => void angabenAendern({ vehicleId: e.target.value || null })}
                  >
                    <option value="">– Fahrzeug wählen –</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{fahrzeugName(v)}</option>
                    ))}
                  </select>
                )}

                {/* Anlegen an Ort und Stelle. Nur Kennzeichen und Modell: Das ist, was am Auto
                    abzulesen ist, während man davorsteht. Alles Weitere (Reifengröße, Notiz)
                    steht im Kundenfenster und kann später nachgetragen werden – ein längeres
                    Formular hier würde nur dazu führen, dass es gar nicht ausgefüllt wird. */}
                {!fahrzeugFormOffen ? (
                  <button
                    type="button"
                    className={"btn-secondary" + (vehicles.length === 0 ? " btn-block" : "")}
                    style={vehicles.length === 0 ? { marginTop: 2 } : { marginTop: 4, padding: "3px 8px", fontSize: 12 }}
                    disabled={laeuft}
                    onClick={() => setFahrzeugFormOffen(true)}
                  >
                    {vehicles.length === 0 ? "+ Fahrzeug dieses Kunden anlegen" : "+ Weiteres Fahrzeug"}
                  </button>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <input
                        type="text" placeholder="Kennzeichen, z. B. N-FS 2013" autoFocus
                        value={neuesKennzeichen} onChange={(e) => setNeuesKennzeichen(e.target.value)}
                      />
                      <input
                        type="text" placeholder="Marke / Modell"
                        value={neuesModell} onChange={(e) => setNeuesModell(e.target.value)}
                      />
                    </div>
                    <div className="appt-actions">
                      <button
                        type="button" className="btn-primary"
                        disabled={laeuft || !neuesKennzeichen.trim()}
                        onClick={async () => {
                          setLaeuft(true);
                          try {
                            await onFahrzeugAnlegen(neuesKennzeichen.trim(), neuesModell.trim());
                            setNeuesKennzeichen("");
                            setNeuesModell("");
                            setFahrzeugFormOffen(false);
                          } finally {
                            setLaeuft(false);
                          }
                        }}
                      >
                        Anlegen und zuordnen
                      </button>
                      <button
                        type="button" className="btn-secondary" disabled={laeuft}
                        onClick={() => { setNeuesKennzeichen(""); setNeuesModell(""); setFahrzeugFormOffen(false); }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {vehicles.length === 0 && !fahrzeugFormOffen && (
                  <div className="small" style={{ marginTop: 4 }}>
                    Ohne Fahrzeug lässt sich der Auftrag nicht abschließen.
                  </div>
                )}
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Saison{einlagerung.saison ? "" : " – fehlt noch"}</label>
                {/* Segmentierte Knöpfe statt Auswahlliste: drei feste Werte, ein Tipp statt
                    Aufklappen-Suchen-Tippen. Dieselbe Optik wie die Filterchips über der
                    Kundenliste – ein Vokabular, nicht zwei. */}
                <div className="filterbar" style={{ marginTop: 2 }}>
                  {SAISON_LISTE.map((wert) => (
                    <button
                      key={wert}
                      type="button"
                      className={"chip" + (einlagerung.saison === wert ? " active" : "")}
                      disabled={laeuft}
                      onClick={() => void angabenAendern({ saison: einlagerung.saison === wert ? null : wert })}
                    >
                      {SAISON_LABEL[wert]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ------------------------------------------------ Profiltiefe */}
              {/* Zwei verschiedene Aussagen, nie gleichzeitig (Migration 33): „der Satz hat
                  etwa 4 mm" oder vier einzelne Werte. Die Sammelmessung ist der Normalfall –
                  zehn Sekunden. Die Einzelmessung kostet eine Minute und ist dafür die
                  Grundlage für ein Verkaufsgespräch („HL 3,1 mm"). */}
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label>Profiltiefe</label>
                <div className="filterbar" style={{ marginTop: 2 }}>
                  <button
                    type="button"
                    className={"chip" + (einlagerung.erfassungsart !== "einzeln" ? " active" : "")}
                    disabled={laeuft}
                    onClick={() => void erfassungsartSetzen("sammel")}
                  >
                    Ein Wert für den Satz
                  </button>
                  <button
                    type="button"
                    className={"chip" + (einlagerung.erfassungsart === "einzeln" ? " active" : "")}
                    disabled={laeuft}
                    onClick={() => void erfassungsartSetzen("einzeln")}
                  >
                    Räder einzeln
                  </button>
                </div>
              </div>

              {einlagerung.erfassungsart === "einzeln" ? (
                <RadBild
                  raeder={raeder}
                  anzahlRaeder={einlagerung.anzahl_raeder}
                  gesperrt={laeuft}
                  onSpeichern={(position, felder) => onRadSpeichern(einlagerung.id, position, felder)}
                  onEntfernen={onRadEntfernen}
                />
              ) : (
                <div className="field" style={{ marginTop: 6, marginBottom: 0, maxWidth: 200 }}>
                  <input
                    type="number" step="0.5" min="0" max="25" placeholder="z. B. 4,5"
                    defaultValue={einlagerung.profiltiefe_mm ?? ""}
                    disabled={laeuft}
                    // Beim Verlassen speichern, nicht bei jedem Tastendruck: Sonst entsteht
                    // für „4,5" unterwegs der Wert 4 – und der stünde eine Sekunde lang als
                    // Wahrheit in der Datenbank.
                    onBlur={(e) => void angabenAendern({ profiltiefeMm: e.target.value })}
                  />
                </div>
              )}

              {einlagerung.erfassungsart === "einzeln" && (
                <div className="field" style={{ marginTop: 8, marginBottom: 0, maxWidth: 220 }}>
                  <label>Räder in diesem Satz</label>
                  {/* Nicht immer vier: „zwei weggeworfen, zwei eingelagert" ist ein realer
                      Fall und soll kein Sonderfall im Kopf des Technikers bleiben. */}
                  <input
                    type="number" min={1} max={8} step={1}
                    defaultValue={einlagerung.anzahl_raeder}
                    disabled={laeuft}
                    onBlur={(e) => {
                      const zahl = Math.round(parseFloat(e.target.value));
                      if (!isNaN(zahl) && zahl >= 1 && zahl <= 8 && zahl !== einlagerung.anzahl_raeder) {
                        void onAnzahlRaeder(einlagerung.id, zahl);
                      } else {
                        e.target.value = String(einlagerung.anzahl_raeder);
                      }
                    }}
                  />
                </div>
              )}

              <button
                type="button" className="btn-secondary" style={{ marginTop: 8 }}
                disabled={laeuft}
                onClick={() => onEntfernen(einlagerung.id)}
              >
                Einlagerung entfernen
              </button>
            </>
          )}
        </>
      ) : einlagerung ? (
        // Zuordnung vorhanden, aber der Platz ist nicht in der geladenen Liste – etwa weil er
        // gelöscht wurde. Lieber ehrlich benennen als eine leere Zeile zeigen.
        <div className="small">Zugeordneter Lagerplatz nicht auffindbar.</div>
      ) : gesperrt ? (
        <div className="small">– kein Lagerplatz belegt –</div>
      ) : (
        <>
          {pflicht && (
            <div className="small" style={{ marginBottom: 6 }}>
              Dieser Auftrag enthält eine Leistung mit Einlagerung. Ohne belegten Lagerplatz
              lässt er sich nicht abschließen.
            </div>
          )}
          <div className="einlagerung-zeile">
            <select value={wahl} onChange={(e) => setWahl(e.target.value)} disabled={laeuft}>
              <option value="">– Lagerplatz wählen –</option>
              {freieSlots.map((s) => <option key={s.id} value={s.id}>{platzText(s)}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={!wahl || laeuft} onClick={() => zuordnen(wahl)}>
              Zuordnen
            </button>
            <button type="button" className="btn-primary" disabled={laeuft} onClick={() => { setMeldung(null); setScannerOffen(true); }}>
              Lagerplatz scannen
            </button>
          </div>
          {freieSlots.length === 0 && (
            <div className="small" style={{ marginTop: 6 }}>Alle Lagerplätze sind belegt.</div>
          )}
        </>
      )}

      {meldung && <div className="small einlagerung-pflicht" style={{ marginTop: 6 }}>{meldung}</div>}

      {scannerOffen && (
        <QrScanner titel="Lagerplatz scannen" onErkannt={gescannt} onClose={() => setScannerOffen(false)} />
      )}
    </div>
  );
}

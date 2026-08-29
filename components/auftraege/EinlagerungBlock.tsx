import { useState } from "react";
import type { StorageSlot, TireStorage, Warehouse } from "@/lib/types";
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
  pflicht, einlagerung, slots, warehouses, belegteSlotIds, gesperrt, onEinlagern, onEntfernen,
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
  onEinlagern: (lagerplatzId: string) => Promise<void>;
  onEntfernen: (einlagerungId: string) => Promise<void>;
}) {
  const [wahl, setWahl] = useState("");
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
          {!gesperrt && (
            <button
              type="button" className="btn-secondary" style={{ marginTop: 6 }}
              disabled={laeuft}
              onClick={() => onEntfernen(einlagerung.id)}
            >
              Einlagerung entfernen
            </button>
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

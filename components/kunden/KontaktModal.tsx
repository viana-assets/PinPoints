import { useState } from "react";
import type { Customer, KontaktErgebnis } from "@/lib/types";
import { todayStr } from "@/lib/helpers";

// Was ist bei dem Kontakt herausgekommen? (Migration 23, siehe docs/kunden-und-karte.md)
//
// Vorher hielt „Kontaktiert speichern" nur fest, DASS telefoniert wurde. Ein Kunde mit
// erteiltem Auftrag, ein Kunde, der im Frühjahr noch einmal angerufen werden will, und ein
// Kunde, der abgesagt hat, sahen danach alle gleich aus – grün auf der Karte, und beim nächsten
// Blick wusste niemand mehr, welcher welcher war.
//
// Drei Ausgänge, bewusst nicht mehr: das sind die, die ein Anruf im Alltag tatsächlich hat.
// Jeder schreibt denselben Kontakteintrag in die Historie, sie unterscheiden sich nur in dem,
// was danach passiert.

// Vorschlag für das Wiedervorlage-Datum: der eingestellte Wiedervorlage-Zeitraum ab heute.
// Damit ist das häufigste Ergebnis („in der nächsten Saison nochmal") ein Klick statt einer
// Datumseingabe – überschreibbar bleibt es trotzdem.
function vorschlagWiedervorlage(monate: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + (monate || 3));
  return d.toISOString().slice(0, 10);
}

const AUSGANG_TEXT: Record<KontaktErgebnis, { titel: string; erklaerung: string }> = {
  auftrag: {
    titel: "Auftrag anlegen",
    erklaerung: "Der Kontakt wird festgehalten, danach öffnet sich gleich das Auftragsfenster.",
  },
  wiedervorlage: {
    titel: "Wiedervorlage",
    erklaerung: "Bis zum gewählten Tag ist der Kunde auf der Karte orange, danach steht er wieder auf der Anrufliste.",
  },
  kein_interesse: {
    titel: "Kein Interesse",
    erklaerung: "Auf der Karte erscheint ein weißer Punkt mit rotem Kreuz. Der Kunde bleibt aktiv – Deaktivieren ist ein eigener Schritt.",
  },
};

export function KontaktModal({ customer, periodMonths, onClose, onSpeichern }: {
  customer: Customer;
  periodMonths: number;
  onClose: () => void;
  onSpeichern: (ergebnis: KontaktErgebnis, kontaktDatum: string, wiedervorlageAm: string | null) => Promise<void>;
}) {
  const [ergebnis, setErgebnis] = useState<KontaktErgebnis | null>(null);
  const [kontaktDatum, setKontaktDatum] = useState(todayStr());
  const [wiedervorlage, setWiedervorlage] = useState(vorschlagWiedervorlage(periodMonths));
  const [laeuft, setLaeuft] = useState(false);

  async function speichern() {
    if (!ergebnis || laeuft) return;
    setLaeuft(true);
    try {
      await onSpeichern(ergebnis, kontaktDatum || todayStr(), ergebnis === "wiedervorlage" ? wiedervorlage : null);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative", maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Kontakt mit {customer.name}</h2>

        <div className="field">
          <label>Kontaktiert am</label>
          {/* Vorbelegt mit HEUTE. Vorher stand hier der LETZTE Kontakt – bei einem Kunden vom
              März bot das Formular also März an, und ein unachtsames Speichern datierte den
              heutigen Anruf ein halbes Jahr zurück. */}
          <input type="date" value={kontaktDatum} onChange={(e) => setKontaktDatum(e.target.value)} />
        </div>

        <label>Was ist dabei herausgekommen?</label>
        <div className="ausgang-liste">
          {(Object.keys(AUSGANG_TEXT) as KontaktErgebnis[]).map((wert) => (
            <button
              key={wert}
              type="button"
              className={`ausgang${ergebnis === wert ? " gewaehlt" : ""}`}
              onClick={() => setErgebnis(wert)}
            >
              <span className="ausgang-titel">{AUSGANG_TEXT[wert].titel}</span>
              <span className="ausgang-erklaerung">{AUSGANG_TEXT[wert].erklaerung}</span>
            </button>
          ))}
        </div>

        {ergebnis === "wiedervorlage" && (
          <div className="field" style={{ marginTop: 10 }}>
            <label>Wieder anrufen am</label>
            <input type="date" min={todayStr()} value={wiedervorlage} onChange={(e) => setWiedervorlage(e.target.value)} />
          </div>
        )}

        <button
          className="btn-primary btn-block"
          style={{ marginTop: 12 }}
          disabled={!ergebnis || laeuft || (ergebnis === "wiedervorlage" && !wiedervorlage)}
          onClick={speichern}
        >
          {laeuft ? "Speichert …" : "Kontakt festhalten"}
        </button>
      </div>
    </div>
  );
}

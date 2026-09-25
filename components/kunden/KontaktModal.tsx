import { useState } from "react";
import type { Customer, KontaktErgebnis } from "@/lib/types";
import { todayStr, formatDate } from "@/lib/helpers";

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

const AUSGANG_TEXT: Record<KontaktErgebnis, { titel: string; erklaerung: string; zeichen: string; knopf: string }> = {
  auftrag: {
    zeichen: "+", knopf: "Festhalten und Auftrag anlegen",
    titel: "Auftrag anlegen",
    erklaerung: "Der Kontakt wird festgehalten, danach öffnet sich gleich das Auftragsfenster.",
  },
  wiedervorlage: {
    zeichen: "↻", knopf: "Wiedervorlage festhalten",
    titel: "Wiedervorlage",
    erklaerung: "Bis zum gewählten Tag ist der Kunde auf der Karte hellblau, danach steht er wieder auf der Anrufliste.",
  },
  kein_interesse: {
    zeichen: "×", knopf: "Kein Interesse festhalten",
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
  const [datumOffen, setDatumOffen] = useState(false);

  async function speichern() {
    if (!ergebnis || laeuft) return;
    setLaeuft(true);
    try {
      await onSpeichern(ergebnis, kontaktDatum || todayStr(), ergebnis === "wiedervorlage" ? wiedervorlage : null);
    } finally {
      setLaeuft(false);
    }
  }

  const heute = todayStr();
  const datumText = kontaktDatum === heute ? `heute, ${formatDate(heute)}` : formatDate(kontaktDatum);

  return (
    // „modal-kontakt" hebt dieses Fenster über das Kundenfenster, aus dem es geöffnet wird.
    // Ohne die Klasse haben beide `z-index: 10000`, und bei gleichem Wert entscheidet die
    // Reihenfolge im Dokument – dort steht das Kontaktfenster VOR dem Kundenfenster, lag also
    // darunter. Aus dem Betrieb sah das so aus, als täte der Knopf nichts; erst beim
    // Schließen des Kundenfensters kam es zum Vorschein.
    //
    // Seit 26.09.2026 (Entwurf O) als Blatt von unten, im Stil der übrigen Auswahlblätter.
    <div className="modal-overlay modal-kontakt auswahl-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auswahl-blatt kt-blatt" role="dialog" aria-label={`Kontakt mit ${customer.name}`}>
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Wie ist das Gespräch ausgegangen?</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <span className="small">{(customer.company || "").trim() || customer.name}</span>

        {/* Vorbelegt mit HEUTE. Vorher stand hier der LETZTE Kontakt – bei einem Kunden vom
            März bot das Formular also März an, und ein unachtsames Speichern datierte den
            heutigen Anruf ein halbes Jahr zurück. */}
        {datumOffen ? (
          <label className="nk-feld"><span>Kontaktiert am</span>
            <input type="date" value={kontaktDatum} max={heute} onChange={(e) => setKontaktDatum(e.target.value)} />
          </label>
        ) : (
          <span className="small">
            Kontaktiert am {datumText} ·{" "}
            <button type="button" className="db-link" onClick={() => setDatumOffen(true)}>ändern</button>
          </span>
        )}

        {(Object.keys(AUSGANG_TEXT) as KontaktErgebnis[]).map((wert) => (
          <button
            key={wert}
            type="button"
            className={"ab-option kt-ausgang " + wert + (ergebnis === wert ? " aktiv" : "")}
            aria-pressed={ergebnis === wert}
            onClick={() => setErgebnis(wert)}
          >
            <span className="kt-zeichen" aria-hidden="true">{AUSGANG_TEXT[wert].zeichen}</span>
            <span className="ab-text kt-text">
              <b>{AUSGANG_TEXT[wert].titel}</b>
              <span className="small">{AUSGANG_TEXT[wert].erklaerung}</span>
            </span>
          </button>
        ))}

        {ergebnis === "wiedervorlage" && (
          <label className="nk-feld"><span>Wieder anrufen am</span>
            <input type="date" min={heute} value={wiedervorlage} onChange={(e) => setWiedervorlage(e.target.value)} />
          </label>
        )}

        <button
          type="button"
          className="am-knopf"
          disabled={!ergebnis || laeuft || (ergebnis === "wiedervorlage" && !wiedervorlage)}
          onClick={speichern}
        >
          {laeuft ? "Speichert …" : ergebnis ? AUSGANG_TEXT[ergebnis].knopf : "Ausgang wählen"}
        </button>
      </div>
    </div>
  );
}

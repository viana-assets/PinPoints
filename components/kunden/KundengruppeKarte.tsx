"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { CustomerPicker } from "@/components/CustomerPicker";
import { Blatt } from "@/components/Blatt";
import { hauptkundeKandidaten, kundenName, unterdebitoren } from "@/lib/kundengruppe";

// Kundengruppe im Kundenfenster (Migration 101, v165): Gehört der Kunde zu einem Hauptkunden, steht der da (antippen
// öffnet ihn) und lässt sich lösen; ist er selbst Hauptkunde, stehen seine Unterdebitoren da. Zuordnen geht über das
// Menü „⋯“ (`HauptkundeBlatt`), damit nicht jeder Kunde eine leere Karte trägt. Gespeichert wird sofort – wie bei Einmalkunde und Laufkundschaft. Die Regeln
// (eine Ebene, keine Laufkundschaft …) prüft `kunde_gruppe_pruefen()`; hier wird nur angeboten, was dort durchgeht.
export function KundengruppeKarte({ kunde, kunden, darfAendern, onSpeichern, onOeffnen }: {
  kunde: Customer;
  kunden: Customer[];
  darfAendern: boolean;
  onSpeichern: (f: Partial<Customer>) => Promise<void>;
  onOeffnen?: (id: string) => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const haupt = kunde.haupt_kunde_id ? kunden.find((k) => k.id === kunde.haupt_kunde_id) ?? null : null;
  const unter = unterdebitoren(kunde.id, kunden);
  if (!haupt && !unter.length) return null;

  async function setzen(id: string | null) {
    setLaeuft(true);
    try { await onSpeichern({ haupt_kunde_id: id }); } finally { setLaeuft(false); }
  }

  return (
    <div className="db-karte dm-gruppe">
      <div className="db-karte-kopf">
        <span className="db-karte-titel">Kundengruppe</span>
        {haupt && darfAendern && <button type="button" className="db-link" disabled={laeuft} onClick={() => void setzen(null)}>Lösen</button>}
      </div>
      {haupt && (
        <button type="button" className="es-zeile" disabled={!onOeffnen} onClick={() => onOeffnen?.(haupt.id)}>
          <span className="db-punkt-text"><b>Unterdebitor von {kundenName(haupt)}</b>
            <span className="small">Aufträge dürfen auf den Hauptkunden laufen; Etikett und Rechnung gehen an diesen Kunden, wenn das Fahrzeug ihm gehört.</span></span>
          {onOeffnen && <span aria-hidden="true">›</span>}
        </button>
      )}
      {unter.length > 0 && (
        <>
          <span className="small">Hauptkunde von {unter.length} {unter.length === 1 ? "Unterdebitor" : "Unterdebitoren"} – deren Fahrzeuge stehen in seinen Aufträgen zur Wahl.</span>
          {unter.map((u) => (
            <button key={u.id} type="button" className="es-zeile" disabled={!onOeffnen} onClick={() => onOeffnen?.(u.id)}>
              <span className="db-punkt-text"><b>{kundenName(u)}</b>
                <span className="small">{[u.kundennummer != null ? `Kd.-Nr. ${u.kundennummer}` : null, u.address].filter(Boolean).join(" · ")}</span></span>
              {onOeffnen && <span aria-hidden="true">›</span>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// „Einem Hauptkunden zuordnen …“ aus dem Menü des Kundenfensters. Angeboten wird nur, was `kunde_gruppe_pruefen()`
// zulässt (`hauptkundeKandidaten`).
export function HauptkundeBlatt({ kunde, kunden, onSpeichern, onClose }: {
  kunde: Customer; kunden: Customer[]; onSpeichern: (f: Partial<Customer>) => Promise<void>; onClose: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const kandidaten = hauptkundeKandidaten(kunde, kunden);
  return (
    <Blatt titel="Einem Hauptkunden zuordnen" onClose={onClose} ebene="modal-storno">
      <p className="bl-hilfe">
        {kundenName(kunde)} wird Unterdebitor. Aufträge dürfen dann auf den Hauptkunden laufen; Fahrzeuge, Etiketten und
        Rechnungen bleiben bei {kundenName(kunde)}. Den Hauptkunden ggf. vorher als eigenen Kunden anlegen (z. B. „… Gruppe“).
      </p>
      {kandidaten.length === 0
        ? <span className="small">Kein Kunde kommt als Hauptkunde in Frage{unterdebitoren(kunde.id, kunden).length ? " – dieser Kunde hat selbst Unterdebitoren" : ""}.</span>
        : <CustomerPicker customers={kandidaten} alle={kunden} value="" label="Hauptkunde" placeholder="Hauptkunde suchen …"
            onChange={(id) => { if (laeuft) return; setLaeuft(true); void onSpeichern({ haupt_kunde_id: id }).then(onClose).finally(() => setLaeuft(false)); }} />}
    </Blatt>
  );
}

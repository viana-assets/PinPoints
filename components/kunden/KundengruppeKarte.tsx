"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { CustomerPicker } from "@/components/CustomerPicker";
import { Blatt } from "@/components/Blatt";
import { gleicheAnschrift, hauptkundeKandidaten, kundenName, unterdebitorKandidaten, unterdebitoren } from "@/lib/kundengruppe";

// Kundengruppe im Kundenfenster (Migration 101, v165; v166 von beiden Seiten): Gehört der Kunde zu einem Hauptkunden,
// steht der da (antippen öffnet ihn) und lässt sich lösen; ist er selbst Hauptkunde, stehen seine Unterdebitoren da,
// und „+ Unterdebitor zuordnen“ holt weitere dazu. Ohne Gruppe erscheint die Karte nur, wo eine Gruppe naheliegt – bei
// einer Firma oder wenn unter derselben Anschrift weitere Kunden stehen –, damit nicht jeder Privatkunde eine leere
// Karte trägt; zuordnen geht außerdem immer über das Menü „⋯“. Gespeichert wird sofort, wie bei Einmalkunde und
// Laufkundschaft. Die Regeln (eine Ebene, keine Laufkundschaft …) prüft `kunde_gruppe_pruefen()`; hier wird nur
// angeboten, was dort durchgeht.
export function KundengruppeKarte({ kunde, kunden, darfAendern, onSpeichern, onOeffnen, onHauptWaehlen, onUnterWaehlen }: {
  kunde: Customer;
  kunden: Customer[];
  darfAendern: boolean;
  onSpeichern: (f: Partial<Customer>) => Promise<void>;
  onOeffnen?: (id: string) => void;
  onHauptWaehlen?: () => void;
  onUnterWaehlen?: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const haupt = kunde.haupt_kunde_id ? kunden.find((k) => k.id === kunde.haupt_kunde_id) ?? null : null;
  const unter = unterdebitoren(kunde.id, kunden);

  async function setzen(id: string | null) {
    setLaeuft(true);
    try { await onSpeichern({ haupt_kunde_id: id }); } finally { setLaeuft(false); }
  }

  if (!haupt && !unter.length) {
    if (!darfAendern || kunde.laufkundschaft || kunde.einmalkunde) return null;
    const nachbarn = gleicheAnschrift(kunde, kunden);
    if (!nachbarn.length && !(kunde.company || "").trim()) return null;
    const kannUnter = !!onUnterWaehlen && unterdebitorKandidaten(kunde, kunden).length > 0;
    const kannHaupt = !!onHauptWaehlen && hauptkundeKandidaten(kunde, kunden).length > 0;
    if (!kannUnter && !kannHaupt) return null;
    return (
      <div className="db-karte dm-gruppe">
        <div className="db-karte-kopf"><span className="db-karte-titel">Kundengruppe</span></div>
        <span className="small">
          {nachbarn.length
            ? `Unter derselben Anschrift ${nachbarn.length === 1 ? "steht ein weiterer Kunde" : `stehen ${nachbarn.length} weitere Kunden`}: ${nachbarn.slice(0, 3).map(kundenName).join(", ")}${nachbarn.length > 3 ? " …" : ""}. Gehören sie zusammen, hier eine Gruppe bilden – jede Firma behält ihre Fahrzeuge, Etiketten und Rechnungen.`
            : "Noch in keiner Gruppe. Mehrere Firmen eines Hauses lassen sich unter einem Hauptkunden zusammenfassen."}
        </span>
        <div className="pk-knoepfe">
          {kannUnter && <button type="button" className="es-knopf" onClick={onUnterWaehlen}>Unterdebitoren zuordnen …</button>}
          {kannHaupt && <button type="button" className="es-knopf" onClick={onHauptWaehlen}>Einem Hauptkunden zuordnen …</button>}
        </div>
      </div>
    );
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
          {darfAendern && onUnterWaehlen && (
            <button type="button" className="es-knopf dm-gruppe-plus" onClick={onUnterWaehlen}>+ Unterdebitor zuordnen</button>
          )}
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

// „Unterdebitoren zuordnen …“ (v166): vom Hauptkunden aus. Wer unter derselben Anschrift steht, kommt zuerst und mit
// einem Knopf; alle anderen über die Suche. Das Blatt bleibt offen, bis „Fertig“ – meist sind es mehrere Firmen.
export function UnterdebitorBlatt({ haupt, kunden, onZuordnen, onLoesen, onClose }: {
  haupt: Customer; kunden: Customer[];
  onZuordnen: (kundeId: string) => Promise<void>;
  onLoesen?: (kundeId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const kandidaten = unterdebitorKandidaten(haupt, kunden);
  const nachbarIds = new Set(gleicheAnschrift(haupt, kunden).map((k) => k.id));
  const vorschlaege = kandidaten.filter((k) => nachbarIds.has(k.id));
  const schon = unterdebitoren(haupt.id, kunden);
  async function tun(id: string, f: (id: string) => Promise<void>) {
    if (laeuft) return;
    setLaeuft(id); setFehler(null);
    try { await f(id); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Zuordnung konnte nicht gespeichert werden."); }
    finally { setLaeuft(null); }
  }
  return (
    <Blatt titel="Unterdebitoren zuordnen" unter={kundenName(haupt)} onClose={onClose} ebene="modal-storno"
      fuss={<button type="button" className="btn-primary" onClick={onClose}>Fertig</button>}>
      <p className="bl-hilfe">
        {kundenName(haupt)} wird Hauptkunde. Aufträge dürfen dann auf ihn laufen und bieten die Fahrzeuge aller
        Unterdebitoren an; Fahrzeuge, Etiketten und Rechnungen bleiben bei der jeweiligen Firma.
      </p>
      {schon.length > 0 && (
        <div className="nk-feld">
          <span className="kp-label">Schon zugeordnet</span>
          {schon.map((k) => (
            <div key={k.id} className="es-zeile ug-zeile">
              <span className="db-punkt-text"><b>{kundenName(k)}</b><span className="small">{k.address}</span></span>
              {onLoesen && <button type="button" className="db-link" disabled={!!laeuft} onClick={() => void tun(k.id, onLoesen)}>Lösen</button>}
            </div>
          ))}
        </div>
      )}
      {vorschlaege.length > 0 && (
        <div className="nk-feld">
          <span className="kp-label">Unter derselben Anschrift</span>
          {vorschlaege.map((k) => (
            <div key={k.id} className="es-zeile ug-zeile">
              <span className="db-punkt-text"><b>{kundenName(k)}</b><span className="small">{[k.company ? k.name : null, k.address].filter(Boolean).join(" · ")}</span></span>
              <button type="button" className="es-knopf" disabled={!!laeuft} onClick={() => void tun(k.id, onZuordnen)}>
                {laeuft === k.id ? "…" : "Zuordnen"}
              </button>
            </div>
          ))}
        </div>
      )}
      {kandidaten.length > 0
        ? <CustomerPicker customers={kandidaten} alle={kunden} value="" label={vorschlaege.length ? "Andere Kunden" : "Kunde"} placeholder="Firma oder Name suchen …"
            onChange={(id) => void tun(id, onZuordnen)} />
        : <span className="small">Kein weiterer Kunde kommt als Unterdebitor in Frage.</span>}
      {fehler && <div className="fehler-hinweis" role="alert"><span>{fehler}</span><button type="button" onClick={() => setFehler(null)} aria-label="Meldung schließen">×</button></div>}
    </Blatt>
  );
}

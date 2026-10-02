import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrBild } from "./QrBild";
import type { StorageSlot } from "@/lib/types";
import { lagerplatzUrl } from "@/lib/aufkleberCode";
import { dateiName, etikettenPdfDatei, mmZuPx, teilenOderSpeichern, type EtikettMasse } from "@/lib/etikettBild";
import { ETIKETT_FORMATE } from "./ReifensatzEtikett";

// Aufkleber mit QR-Code für Lagerplätze. Dieselbe Komponente für einen einzelnen Aufkleber
// (Nachdruck, wenn einer abgerissen ist) und für ein ganzes Lager auf einmal (Erstausstattung)
// – der Unterschied ist allein die Länge der übergebenen Liste.
//
// ZWEI WEGE (seit v99, 02.10.2026)
//
// 1. BROTHER (Vorgabe): ein Aufkleber je Etikett, 58 × 58 oder 60 × 86 mm – dieselben Formate
//    und derselbe Druckweg wie beim Reifensatz-Etikett: ein PDF in genau dieser Größe ins
//    Teilen-Menü, dort „Drucken“ (lib/etikettPdf.ts – warum nicht die Druckfunktion des
//    Browsers, steht dort). Gezeichnet von `etikettZeichnen()`: QR oben, darunter groß der
//    Platz, klein das Lager.
// 2. A4-BOGEN: mehrere Aufkleber nebeneinander, über die Druckfunktion des Browsers – für einen
//    Rechner mit Bürodrucker und Klebebogen. So sah der Aufkleber bis v98 ausschließlich aus.

const A4 = "a4";

// Wie viele Aufkleber auf einmal (D18, v102). Mehrere hundert QR-Bilder in einem Rutsch ließen
// Safari am iPhone hängen – bei der Erstausstattung eines großen Lagers wird deshalb in Teilen
// gedruckt, jeder Teil für sich (Vorschau, PDF, A4-Bogen).
const JE_TEIL = 40;

export function LagerplatzAufkleber({ slots, lagerName, onClose }: {
  slots: StorageSlot[];
  lagerName: string;
  onClose: () => void;
}) {
  // Die Adresse der laufenden Umgebung, nicht eine fest eingetragene: aus einer Testumgebung
  // gedruckte Aufkleber zeigen dann auch auf die Testumgebung, statt still auf die
  // Produktivadresse zu verweisen.
  const [basis, setBasis] = useState("");
  useEffect(() => { setBasis(window.location.origin); }, []);
  const [format, setFormat] = useState<string>(ETIKETT_FORMATE[0].schluessel);
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [teil, setTeil] = useState(0);
  const teile = Math.max(1, Math.ceil(slots.length / JE_TEIL));
  const sichtbar = slots.slice(teil * JE_TEIL, (teil + 1) * JE_TEIL);

  const brother = ETIKETT_FORMATE.find((f) => f.schluessel === format) ?? null;

  async function alsPdfDrucken() {
    if (!brother) return;
    setHinweis(null);
    setLaeuft(true);
    try {
      const masse: EtikettMasse = {
        breiteMm: brother.breiteMm, hoeheMm: brother.hoeheMm, qrMm: brother.qrMm,
        pxProMm: brother.pxProMm, randMm: brother.randMm, schrift: brother.schrift, qrOben: brother.qrOben,
      };
      const liste = [];
      for (const slot of sichtbar) {
        const qr = await QRCode.toDataURL(lagerplatzUrl(slot.id, basis), {
          width: mmZuPx(masse.qrMm, masse.pxProMm), margin: 1, errorCorrectionLevel: "M",
        });
        // Groß der Platz – er wird aus zwei Metern Entfernung gesucht; klein das Lager.
        liste.push({ inhalt: { qr, gross: { links: slot.code, rechts: "" }, zeilen: [lagerName] }, masse });
      }
      const name = dateiName(sichtbar.length === 1 ? `platz-${sichtbar[0].code}` : `plaetze-${teile > 1 ? `teil${teil + 1}-` : ""}${sichtbar.length}`, 1, 1).replace(/\.png$/, ".pdf");
      const pdf = await etikettenPdfDatei(liste, name);
      if (await teilenOderSpeichern([pdf]) === "geteilt") return;
      setHinweis("Dieses Gerät kennt kein Teilen-Menü – das PDF wurde gespeichert. Öffnen und drucken.");
    } catch (fehler) {
      // Abbrechen im Teilen-Menü ist eine Entscheidung, kein Fehler.
      if (fehler instanceof DOMException && fehler.name === "AbortError") return;
      setHinweis(fehler instanceof Error ? fehler.message : "Das PDF konnte nicht erzeugt werden.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay druck-fenster" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box druck-modal" style={{ position: "relative" }}>
        <button className="modal-close druck-weg" onClick={onClose}>✕</button>
        <h2 className="druck-weg">{slots.length === 1 ? `Aufkleber ${slots[0].code}` : `${slots.length} Aufkleber – ${lagerName}`}</h2>
        <p className="small druck-weg">
          Jeder Aufkleber führt genau auf seinen Lagerplatz. Beim Scannen mit der Handy-Kamera
          öffnet sich die App direkt an diesem Platz; im Auftragsfenster ordnet „Lagerplatz
          scannen&ldquo; ihn der Einlagerung zu.
        </p>

        <div className="field druck-weg" style={{ maxWidth: 340 }}>
          <label htmlFor="aufkleber-format">Format</label>
          <select id="aufkleber-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            {ETIKETT_FORMATE.map((f) => <option key={f.schluessel} value={f.schluessel}>{f.text}</option>)}
            <option value={A4}>A4-Bogen (am Rechner, mehrere nebeneinander)</option>
          </select>
          {brother ? (
            <span className="small ek-schritte">
              <b>So druckst du:</b> iPhone mit dem WLAN des Druckers verbinden (Wireless Direct) ·
              &bdquo;Drucken&ldquo; tippen · im Teilen-Menü <b>&bdquo;Drucken&ldquo;</b> · Drucker
              QL-820NWB · Papierformat <b>{brother.papier}</b>.
            </span>
          ) : (
            <span className="small">
              Im Druckdialog die Skalierung auf 100 % stellen – sonst schrumpft der QR-Code.
            </span>
          )}
        </div>

        {teile > 1 && (
          <div className="field druck-weg" style={{ maxWidth: 340 }}>
            <label htmlFor="aufkleber-teil">Teil</label>
            <select id="aufkleber-teil" value={teil} onChange={(e) => setTeil(Number(e.target.value))}>
              {Array.from({ length: teile }, (_, i) => {
                const von = slots[i * JE_TEIL], bis = slots[Math.min(slots.length, (i + 1) * JE_TEIL) - 1];
                return <option key={i} value={i}>Teil {i + 1} von {teile}: {von.code} – {bis.code}</option>;
              })}
            </select>
            <span className="small">{slots.length} Aufkleber, gedruckt in Teilen zu {JE_TEIL} – sonst hängt das iPhone.</span>
          </div>
        )}

        {brother ? (
          <div
            className="druckbogen rolle"
            style={{
              "--etikett-b": `${brother.breiteMm}mm`,
              "--etikett-h": `${brother.hoeheMm}mm`,
              "--etikett-qr": `${brother.qrMm}mm`,
              "--etikett-rand": `${brother.randMm}mm`,
              "--etikett-s": String(brother.schrift),
            } as React.CSSProperties}
          >
            {basis && sichtbar.map((slot) => (
              <div key={slot.id} className="etikett etikett-rad hoch">
                <QrBild text={lagerplatzUrl(slot.id, basis)} alt={`QR-Code Lagerplatz ${slot.code}`} klasse="etikett-qr" />
                <div className="etikett-text">
                  <div className="etikett-rad-kopf"><span className="etikett-pos">{slot.code}</span></div>
                  <div className="etikett-zeile">{lagerName}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Nur dieser Bereich landet auf dem Papier – siehe @media print in globals.css.
          <div className="druckbogen">
            {basis && sichtbar.map((slot) => (
              <div key={slot.id} className="aufkleber">
                <QrBild text={lagerplatzUrl(slot.id, basis)} alt={`QR-Code Lagerplatz ${slot.code}`} klasse="qr-bild" />
                <div className="aufkleber-text">
                  <div className="aufkleber-code">{slot.code}</div>
                  <div className="aufkleber-lager">{lagerName}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="row druck-weg" style={{ marginTop: 12 }}>
          {brother ? (
            <button className="btn-primary" style={{ flex: 1 }} disabled={laeuft || !basis || sichtbar.length === 0} onClick={() => void alsPdfDrucken()}>
              {laeuft ? "einen Moment …" : "Drucken"}
            </button>
          ) : (
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>Drucken</button>
          )}
          <button className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }} onClick={onClose}>Schließen</button>
        </div>

        {hinweis && (
          <div className="fehler-hinweis druck-weg" role="status" style={{ marginTop: 8 }}>
            <span>{hinweis}</span>
            <button type="button" onClick={() => setHinweis(null)} aria-label="Meldung schließen">×</button>
          </div>
        )}
      </div>
    </div>
  );
}

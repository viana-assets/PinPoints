import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { StorageSlot } from "@/lib/types";
import { lagerplatzUrl } from "@/lib/lagerplatzCode";

// Druckbogen mit QR-Aufklebern für Lagerplätze. Dieselbe Komponente für einen einzelnen
// Aufkleber (Nachdruck, wenn einer abgerissen ist) und für ein ganzes Lager auf einmal
// (Erstausstattung) – der Unterschied ist allein die Länge der übergebenen Liste.
//
// Gedruckt wird über die Druckfunktion des Browsers. Kein PDF-Erzeuger im Paketumfang: das
// Ergebnis wäre dasselbe Blatt Papier, nur mit einer weiteren Abhängigkeit und ohne die
// Vorschau, in der man Ränder und Skalierung im Druckdialog noch geradeziehen kann.

// Kantenlänge des QR-Bildes in Pixeln. Großzügig gewählt, weil das Bild beim Drucken auf
// ~26 mm verkleinert wird – ein zu klein erzeugtes Bild wird dabei unscharf, ein zu großes
// kostet nur ein paar Kilobyte im Arbeitsspeicher.
const QR_PIXEL = 512;

function QrBild({ text, alt }: { text: string; alt: string }) {
  const [datenUri, setDatenUri] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    QRCode.toDataURL(text, { width: QR_PIXEL, margin: 1, errorCorrectionLevel: "M" })
      .then((uri) => { if (!abgebrochen) setDatenUri(uri); })
      .catch(() => { if (!abgebrochen) setFehler(true); });
    return () => { abgebrochen = true; };
  }, [text]);

  if (fehler) return <div className="qr-platzhalter">QR-Code konnte nicht erzeugt werden</div>;
  if (!datenUri) return <div className="qr-platzhalter" />;
  return <img src={datenUri} alt={alt} className="qr-bild" />;
}

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

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box druck-modal" style={{ position: "relative" }}>
        <button className="modal-close druck-weg" onClick={onClose}>✕</button>
        <h2 className="druck-weg">{slots.length === 1 ? `Aufkleber ${slots[0].code}` : `${slots.length} Aufkleber – ${lagerName}`}</h2>
        <p className="small druck-weg">
          Jeder Aufkleber führt genau auf seinen Lagerplatz. Beim Scannen mit der Handy-Kamera
          öffnet sich die App direkt an diesem Platz; im Auftragsfenster ordnet „Lagerplatz
          scannen&ldquo; ihn der Einlagerung zu.
        </p>

        {/* Nur dieser Bereich landet auf dem Papier – siehe @media print in globals.css. */}
        <div className="druckbogen">
          {basis && slots.map((slot) => (
            <div key={slot.id} className="aufkleber">
              <QrBild text={lagerplatzUrl(slot.id, basis)} alt={`QR-Code Lagerplatz ${slot.code}`} />
              <div className="aufkleber-text">
                <div className="aufkleber-code">{slot.code}</div>
                <div className="aufkleber-lager">{lagerName}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="row druck-weg" style={{ marginTop: 12 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>Drucken</button>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

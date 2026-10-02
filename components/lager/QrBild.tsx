import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Ein QR-Code als Bild in der Vorschau (Reifensatz-Etikett und Regalaufkleber). Bis v101 stand
// dieselbe Komponente fast wortgleich in beiden Dateien (Fahrplan C2).
//
// Die Kantenlänge ist großzügig: Beim Drucken wird das Bild auf 20–46 mm verkleinert; ein zu
// klein erzeugtes Bild wird dabei unscharf, ein zu großes kostet nur ein paar Kilobyte.
const QR_PIXEL = 512;

export function QrBild({ text, alt, klasse }: { text: string; alt: string; klasse: string }) {
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
  return <img src={datenUri} alt={alt} className={klasse} />;
}

import { useEffect, useRef, useState } from "react";

// Kamera-Scanner für die QR-Aufkleber am Regal.
//
// Zwei Wege, weil es keinen gibt, der überall funktioniert:
//
//  1. `BarcodeDetector` – im Browser eingebaut, gibt es auf Android/Chrome und in
//     Chrome/Edge am Rechner. Nichts nachzuladen, erkennt sehr schnell.
//  2. `jsqr` – eine kleine Bibliothek, die ein einzelnes Kamerabild auswertet. Sie ist der
//     Weg für iPhones: Safari kennt `BarcodeDetector` nicht.
//
// Die Bibliothek wird ERST GELADEN, wenn sie gebraucht wird (`await import`), und nur dort, wo
// der eingebaute Weg fehlt. Wer nie scannt, lädt sie nie.
//
// Voraussetzung in beiden Fällen: eine verschlüsselte Verbindung. Browser geben die Kamera über
// http nicht frei. Auf Vercel ist das gegeben; wer lokal über http testet, bekommt hier die
// entsprechende Meldung statt eines stummen schwarzen Bildes.

type ErkannteForm = { rawValue: string };
// Nur der Teil der jsqr-Schnittstelle, der hier gebraucht wird. Bewusst eigen beschrieben statt
// den Paket-Typ hereinzuziehen: die Bibliothek wird nachgeladen, ihr Typ soll die Datei nicht
// an den genauen Aufbau eines Fremdpakets binden.
type JsQrFunktion = (daten: Uint8ClampedArray, breite: number, hoehe: number) => { data: string } | null;
type DetektorArt = { detect: (quelle: CanvasImageSource) => Promise<ErkannteForm[]> };
type DetektorBauart = new (optionen: { formats: string[] }) => DetektorArt;

// Wie oft ein Bild ausgewertet wird. 10-mal pro Sekunde ist für einen Aufkleber, den man vor
// die Kamera hält, reichlich – und lässt dem Telefon Luft, statt den Akku leerzurechnen.
const TAKT_MS = 100;

export function QrScanner({ titel = "Code scannen", onErkannt, onClose }: {
  titel?: string;
  onErkannt: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hinweis, setHinweis] = useState("Kamera wird gestartet …");
  const [fehler, setFehler] = useState<string | null>(null);

  // Der Rückruf steckt in einer Referenz, damit der Effekt unten nicht bei jedem Neuzeichnen
  // die Kamera neu startet, nur weil der Elternteil eine neue Funktion übergeben hat.
  const erkanntRef = useRef(onErkannt);
  erkanntRef.current = onErkannt;

  useEffect(() => {
    let gestoppt = false;
    let strom: MediaStream | null = null;
    let uhr: ReturnType<typeof setInterval> | null = null;

    function aufraeumen() {
      gestoppt = true;
      if (uhr) clearInterval(uhr);
      strom?.getTracks().forEach((t) => t.stop());
    }

    async function starten() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setFehler(
          window.isSecureContext === false
            ? "Die Kamera ist nur über eine verschlüsselte Verbindung (https) verfügbar."
            : "Dieses Gerät oder dieser Browser gibt keine Kamera frei."
        );
        return;
      }

      try {
        // `environment` ist die Rückkamera – die, mit der man auf ein Regal zielt.
        strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setFehler("Kein Zugriff auf die Kamera. Bitte im Browser die Kameraerlaubnis für diese Seite erteilen.");
        return;
      }
      if (gestoppt) { strom.getTracks().forEach((t) => t.stop()); return; }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = strom;
      // `playsInline` verhindert, dass iOS das Video im Vollbild öffnet und die Oberfläche
      // darunter verschwindet.
      video.playsInline = true;
      try { await video.play(); } catch { /* Autoplay-Sperre – das Bild kommt trotzdem */ }

      const eingebaut = (window as unknown as { BarcodeDetector?: DetektorBauart }).BarcodeDetector;
      let detektor: DetektorArt | null = null;
      let jsQR: JsQrFunktion | null = null;

      if (eingebaut) {
        try { detektor = new eingebaut({ formats: ["qr_code"] }); } catch { detektor = null; }
      }
      if (!detektor) {
        setHinweis("Scanner wird geladen …");
        try {
          const modul = await import("jsqr");
          jsQR = modul.default as unknown as JsQrFunktion;
        } catch {
          setFehler("Der Scanner konnte nicht geladen werden. Der Lagerplatz lässt sich stattdessen aus der Liste wählen.");
          return;
        }
      }
      if (gestoppt) return;
      setHinweis("Aufkleber in den Rahmen halten");

      const leinwand = document.createElement("canvas");
      const stift = leinwand.getContext("2d", { willReadFrequently: true });

      uhr = setInterval(async () => {
        if (gestoppt || !video.videoWidth) return;
        try {
          if (detektor) {
            const funde = await detektor.detect(video);
            if (funde.length > 0 && funde[0].rawValue) {
              aufraeumen();
              erkanntRef.current(funde[0].rawValue);
            }
            return;
          }
          if (!jsQR || !stift) return;
          leinwand.width = video.videoWidth;
          leinwand.height = video.videoHeight;
          stift.drawImage(video, 0, 0, leinwand.width, leinwand.height);
          const bild = stift.getImageData(0, 0, leinwand.width, leinwand.height);
          const fund = jsQR(bild.data, bild.width, bild.height);
          if (fund?.data) {
            aufraeumen();
            erkanntRef.current(fund.data);
          }
        } catch {
          // Ein einzelnes unbrauchbares Bild ist kein Fehler – beim nächsten Takt wieder.
        }
      }, TAKT_MS);
    }

    void starten();
    return aufraeumen;
  }, []);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box scanner-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{titel}</h2>
        {fehler ? (
          <div className="fehler-hinweis" style={{ position: "static", marginBottom: 10 }}>{fehler}</div>
        ) : (
          <>
            <div className="scanner-bild">
              <video ref={videoRef} muted playsInline />
              <div className="scanner-rahmen" />
            </div>
            <div className="small" style={{ textAlign: "center", marginTop: 8 }}>{hinweis}</div>
          </>
        )}
        <button className="btn-secondary btn-block" style={{ marginTop: 10 }} onClick={onClose}>Abbrechen</button>
      </div>
    </div>
  );
}

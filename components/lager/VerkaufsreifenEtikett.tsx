import { useState } from "react";
import QRCode from "qrcode";
import { QrBild } from "./QrBild";
import type { Verkaufsreifen } from "@/lib/types";
import { verkaufsreifenUrl } from "@/lib/aufkleberCode";
import { dateiName, etikettenPdfDatei, mmZuPx, teilenOderSpeichern, type EtikettMasse } from "@/lib/etikettBild";
import { etikettTexte, groesseText } from "@/lib/reifenverkauf";
import { ETIKETT_FORMATE } from "./ReifensatzEtikett";

// Etikett für einen Verkaufsreifen (Fahrplan E17, v103).
//
// Eines je Stück: Vier Reifen auf dem Boden sehen gleich aus, und jeder soll beim Herausziehen
// sagen, was er ist. Groß Größe und Zustand, fett Hersteller und Modell, darunter Saison, DOT und
// Profil. KEIN Preis – er ändert sich, das Etikett bleibt kleben.
//
// Der QR-Code öffnet den Posten (`?reifen=…`, lib/aufkleberCode.ts): mit der Handy-Kamera direkt
// in der App, oder über den Scan-Knopf im Lager. Gedruckt wird wie beim Reifensatz-Etikett: ein
// PDF in Etikettengröße ins Teilen-Menü, dort „Drucken" am Brother.
export function VerkaufsreifenEtikett({ posten, onClose }: { posten: Verkaufsreifen; onClose: () => void }) {
  // Die Adresse der laufenden Umgebung (wie beim Regalaufkleber). Das Fenster öffnet erst auf einen
  // Tipp hin, `window` ist dann immer da – ein Effekt dafür wäre ein Umweg.
  const [basis] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [format, setFormat] = useState<string>(ETIKETT_FORMATE[0].schluessel);
  const gewaehlt = ETIKETT_FORMATE.find((f) => f.schluessel === format) ?? ETIKETT_FORMATE[0];
  const [anzahl, setAnzahl] = useState(Math.max(1, Math.min(posten.bestand, 8)));
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const texte = etikettTexte(posten);

  async function drucken() {
    setHinweis(null);
    setLaeuft(true);
    try {
      const masse: EtikettMasse = {
        breiteMm: gewaehlt.breiteMm, hoeheMm: gewaehlt.hoeheMm, qrMm: gewaehlt.qrMm,
        pxProMm: gewaehlt.pxProMm, randMm: gewaehlt.randMm, schrift: gewaehlt.schrift, qrOben: gewaehlt.qrOben,
      };
      const qr = await QRCode.toDataURL(verkaufsreifenUrl(posten.id, basis), {
        width: mmZuPx(masse.qrMm, masse.pxProMm), margin: 1, errorCorrectionLevel: "M",
      });
      const inhalt = { qr, gross: texte.gross, kopf: texte.kopf, zeilen: texte.zeilen };
      const name = dateiName(`reifen-${groesseText(posten).replace(/[^0-9a-zA-Z]+/g, "-")}`, 1, 1).replace(/\.png$/, ".pdf");
      const pdf = await etikettenPdfDatei(Array.from({ length: anzahl }, () => ({ inhalt, masse })), name);
      if (await teilenOderSpeichern([pdf]) === "geteilt") return;
      setHinweis("Dieses Gerät kennt kein Teilen-Menü – das PDF wurde gespeichert. Öffnen und drucken.");
    } catch (fehler) {
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
        <h2 className="druck-weg">Etikett · {groesseText(posten)} {posten.hersteller}</h2>
        <p className="small druck-weg">Eines je Reifen. Der QR-Code öffnet diesen Posten in der App – mit der Handy-Kamera oder über „Scannen“ im Lager.</p>

        <div className="nk-zeile druck-weg" style={{ maxWidth: 420 }}>
          <label className="nk-feld">
            <span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {ETIKETT_FORMATE.map((f) => <option key={f.schluessel} value={f.schluessel}>{f.text}</option>)}
            </select>
          </label>
          <label className="nk-feld ve-anzahl">
            <span>Anzahl</span>
            <input type="number" min={1} max={20} value={anzahl} onChange={(e) => setAnzahl(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} />
          </label>
        </div>
        <span className="small ek-schritte druck-weg">
          <b>So druckst du:</b> iPhone mit dem WLAN des Druckers verbinden (Wireless Direct) · &bdquo;Drucken&ldquo; tippen ·
          im Teilen-Menü <b>&bdquo;Drucken&ldquo;</b> · Drucker QL-820NWB · Papierformat <b>{gewaehlt.papier}</b>.
        </span>

        <div
          className="druckbogen rolle"
          style={{
            "--etikett-b": `${gewaehlt.breiteMm}mm`, "--etikett-h": `${gewaehlt.hoeheMm}mm`, "--etikett-qr": `${gewaehlt.qrMm}mm`,
            "--etikett-rand": `${gewaehlt.randMm}mm`, "--etikett-s": String(gewaehlt.schrift),
          } as React.CSSProperties}
        >
          {basis && (
            <div className="etikett etikett-rad hoch">
              <QrBild text={verkaufsreifenUrl(posten.id, basis)} alt="QR-Code Verkaufsreifen" klasse="etikett-qr" />
              <div className="etikett-text">
                <div className="etikett-rad-kopf"><span className="etikett-pos">{texte.gross.links}</span><span className="etikett-profil">{texte.gross.rechts}</span></div>
                <div className="etikett-kunde">{texte.kopf}</div>
                {texte.zeilen.map((z) => <div key={z} className="etikett-zeile">{z}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="row druck-weg" style={{ marginTop: 12 }}>
          <button className="btn-primary" style={{ flex: 1 }} disabled={laeuft || !basis} onClick={() => void drucken()}>
            {laeuft ? "einen Moment …" : anzahl === 1 ? "Drucken" : `${anzahl} Etiketten drucken`}
          </button>
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

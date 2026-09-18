"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Customer, EingelagertesRad, RadPosition, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { RAD_POSITIONEN, RAD_POSITION_LABEL, SAISON_LABEL } from "@/lib/constants";
import { formatDate, profilText, satzProfilMm } from "@/lib/helpers";
import { satzUrl } from "@/lib/aufkleberCode";

// Etikett für einen eingelagerten Reifensatz (17.09.2026).
//
// Es beantwortet eine ANDERE Frage als der Aufkleber am Regal. Der am Regal sagt „welcher Platz
// ist das"; dieser sagt „wem gehört der Satz, der hier steht" – die Frage, die entsteht, wenn
// jemand beim Aufräumen vier Sätze in der Hand hat. Deshalb klebt er am Satz und wandert mit
// ihm, und deshalb steht der Lagerplatz zwar lesbar darauf, aber NICHT im QR-Code: Wo der Satz
// liegt, wird beim Scannen nachgeschlagen. Ein Aufkleber, der einen Platz behauptet, wäre in
// dem Moment falsch, in dem jemand umräumt – und genau dann braucht man ihn.
//
// Gedruckt wird über die Druckfunktion des Browsers, wie bei den Regalaufklebern. Für einen
// kleinen Etikettendrucker heißt das: per USB als normaler Systemdrucker. Über Bluetooth laufen
// diese Geräte nur über ihre eigene Hersteller-App, und dorthin kommt eine Webseite nicht.

const QR_PIXEL = 512;

// Die gängigen Rollenformate der kleinen Thermodrucker, plus der A4-Bogen für Klebeetiketten
// aus dem Schreibwarenhandel. Als Liste und nicht als zwei freie Zahlenfelder: Wer hier Millimeter
// tippt, tippt sich vertippt, und ein falsches Format merkt man erst an der schiefen Rolle.
export type EtikettFormat = {
  schluessel: string; text: string; breiteMm: number; hoeheMm: number | null;
  // Kantenlänge des QR-Bildes. Wächst mit der Etikettenhöhe, statt bei 21 mm stehen zu bleiben:
  // Auf einem 40 mm hohen Etikett bliebe sonst ein Drittel leer, und gescannt wird der Code aus
  // der Hüfte heraus über einem Regal – da zählt jeder Millimeter.
  qrMm: number;
};

export const ETIKETT_FORMATE: EtikettFormat[] = [
  { schluessel: "50x30", text: "Rolle 50 × 30 mm (empfohlen)", breiteMm: 50, hoeheMm: 30, qrMm: 21 },
  { schluessel: "40x30", text: "Rolle 40 × 30 mm (eng – lange Namen brechen ab)", breiteMm: 40, hoeheMm: 30, qrMm: 21 },
  { schluessel: "57x40", text: "Rolle 57 × 40 mm", breiteMm: 57, hoeheMm: 40, qrMm: 30 },
  // hoeheMm null = kein Rollenformat, sondern mehrere Etiketten auf einem Blatt.
  { schluessel: "a4", text: "A4-Bogen (mehrere nebeneinander)", breiteMm: 50, hoeheMm: 30, qrMm: 21 },
];

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
  return <img src={datenUri} alt={alt} className="etikett-qr" />;
}

// Ein Etikett je Satz oder eines je Rad.
//
// Das Rad-Etikett beantwortet beim WIEDERAUFZIEHEN eine Frage, die das Satz-Etikett nicht kann:
// Welches der vier gehört wohin, und wie viel Profil hat genau dieses? Vier Räder auf dem Boden
// sehen gleich aus; die Antwort steckt in der Messung, die ein halbes Jahr zurückliegt.
export type EtikettArt = "satz" | "raeder";

export function ReifensatzEtikett({ saetze, raeder, customers, vehicles, slots, warehouses, onClose }: {
  // Eine Liste, auch wenn meistens genau einer darin steht: Aus dem Auftrag heraus druckt man
  // einen, beim Nachdrucken im Lager vielleicht mehrere. Ein zweites Bauteil für denselben
  // Aufkleber wären zwei Etiketten, die auseinanderlaufen.
  saetze: TireStorage[];
  // Die einzeln erfassten Räder dieser Sätze (Migration 33). Leer, solange ein Satz auf
  // Sammelmessung steht – dann gilt der eine Wert am Satz.
  raeder: EingelagertesRad[];
  customers: Customer[];
  vehicles: Vehicle[];
  slots: StorageSlot[];
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const [basis, setBasis] = useState("");
  const [format, setFormat] = useState<string>(ETIKETT_FORMATE[0].schluessel);
  const [art, setArt] = useState<EtikettArt>("satz");
  useEffect(() => { setBasis(window.location.origin); }, []);

  const gewaehlt = ETIKETT_FORMATE.find((f) => f.schluessel === format) ?? ETIKETT_FORMATE[0];
  const rolle = gewaehlt.hoeheMm !== null;

  function platzText(satz: TireStorage): string {
    const platz = slots.find((s) => s.id === satz.storage_slot_id);
    if (!platz) return "–";
    const lager = warehouses.find((w) => w.id === platz.warehouse_id);
    return [lager?.name, platz.code].filter(Boolean).join(" · ");
  }
  function fahrzeugText(satz: TireStorage): string {
    const fz = vehicles.find((v) => v.id === satz.vehicle_id);
    if (!fz) return "Fahrzeug offen";
    return [fz.license_plate, fz.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen";
  }
  function raederZu(satz: TireStorage): EingelagertesRad[] {
    return raeder.filter((r) => r.tire_storage_id === satz.id);
  }
  // Die Reihenfolge ist fest (VL, VR, HL, HR) und nicht die der Datenbank: Vier Etiketten
  // kommen aus dem Drucker wie Spielkarten – wer sie in wechselnder Reihenfolge bekommt,
  // sortiert jedes Mal neu, bevor er sie aufklebt.
  function radZu(satz: TireStorage, position: RadPosition): EingelagertesRad | undefined {
    return raederZu(satz).find((r) => r.position === position);
  }
  // Was auf dem RAD-Etikett als Profil steht.
  //
  // Bei Sammelmessung gibt es keinen Wert je Rad – dann steht der Satzwert da, ausdrücklich als
  // solcher benannt. Ihn ohne Zusatz auf vier Etiketten zu drucken hieße, vier Messungen zu
  // behaupten, die niemand gemacht hat; ihn wegzulassen hieße, eine vorhandene Angabe zu
  // verschweigen.
  function radProfil(satz: TireStorage, rad: EingelagertesRad | undefined): { wert: string; satzwert: boolean } {
    if (rad?.profiltiefe_mm != null) return { wert: profilText(rad.profiltiefe_mm), satzwert: false };
    if ((satz.erfassungsart ?? "sammel") === "sammel" && satz.profiltiefe_mm != null) {
      return { wert: profilText(satz.profiltiefe_mm), satzwert: true };
    }
    return { wert: "– mm", satzwert: false };
  }

  // Wie viele Räder gehören zu diesem Satz? `anzahl_raeder` ist die Angabe am Satz; bei
  // Sammelmessung steht sie trotzdem, weil sie zum Reifensatz gehört und nicht zur Messart.
  function positionenZu(satz: TireStorage): RadPosition[] {
    return RAD_POSITIONEN.slice(0, Math.min(Math.max(satz.anzahl_raeder || 4, 1), RAD_POSITIONEN.length));
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box druck-modal" style={{ position: "relative" }}>
        <button className="modal-close druck-weg" onClick={onClose}>✕</button>
        <h2 className="druck-weg">
          {saetze.length === 1 ? "Etikett für den Reifensatz" : `${saetze.length} Etiketten`}
        </h2>
        <p className="small druck-weg">
          Kommt auf die Reifen, nicht ins Regal. Beim Scannen mit der Handy-Kamera öffnet sich die
          App beim Lagerplatz, auf dem dieser Satz gerade liegt – auch wenn er inzwischen
          umgeräumt wurde. Alle Etiketten eines Satzes tragen denselben Code; sie unterscheiden
          sich in dem, was darauf steht.
        </p>

        {/* Das Seitenformat lässt sich nicht je Element umstellen, `@page` gilt für das ganze
            Dokument. Deshalb wird die Regel hier erzeugt, statt sie im Stilblatt zu hinterlegen:
            Ein Rollendrucker braucht genau eine Etikettengröße als Seitengröße, sonst schiebt
            der Browser ein A4-Blatt durch ein 30 mm hohes Etikett. */}
        {rolle && (
          <style>{`@page { size: ${gewaehlt.breiteMm}mm ${gewaehlt.hoeheMm}mm; margin: 0; }`}</style>
        )}

        <div className="field druck-weg" style={{ maxWidth: 340 }}>
          <label htmlFor="etikett-art">Was wird gedruckt?</label>
          <select id="etikett-art" value={art} onChange={(e) => setArt(e.target.value as EtikettArt)}>
            <option value="satz">Ein Etikett je Satz</option>
            <option value="raeder">Ein Etikett je Rad (VL, VR, HL, HR)</option>
          </select>
          <span className="small">
            {art === "satz"
              ? "Kommt auf den Satz – Kunde, Fahrzeug, Saison, Profil."
              : "Kommt auf jedes einzelne Rad – Position und dessen Profiltiefe. Beim Wiederaufziehen ist damit klar, welches Rad wohin gehört."}
          </span>
        </div>

        <div className="field druck-weg" style={{ maxWidth: 340 }}>
          <label htmlFor="etikett-format">Format</label>
          <select id="etikett-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            {ETIKETT_FORMATE.map((f) => (
              <option key={f.schluessel} value={f.schluessel}>{f.text}</option>
            ))}
          </select>
          {/* Der Hinweis steht hier und nicht in einer Anleitung: Gelesen wird er in der
              Sekunde, in der jemand vor dem Druckdialog steht – und genau dort entscheidet
              sich, ob das Etikett brauchbar aus dem Drucker kommt. */}
          <span className="small">
            {rolle
              ? "Im Druckdialog die Ränder auf null und die Skalierung auf 100 % stellen – sonst schrumpft der QR-Code und wird unlesbar."
              : "Mehrere Etiketten nebeneinander auf einem Blatt Klebeetiketten, zum Ausschneiden."}
          </span>
          {rolle && (
            <span className="small" style={{ marginTop: 4 }}>
              Am Handy: mit dem <b>eigenen WLAN des Druckers</b> verbinden (Wireless Direct),
              nicht über den Handy-Hotspot – und nicht über Bluetooth. Der Browser druckt über
              das Drucksystem des Geräts, und das findet nur Drucker im selben Netz. Für das
              Drucken wird kein Internet gebraucht: Dieses Fenster ist bereits geladen.
              Bietet der Druckdialog nur A4 an, kennt er das Etikettenformat nicht; dann über
              einen Rechner drucken.
            </span>
          )}
        </div>

        <div
          className={"druckbogen" + (rolle ? " rolle" : "")}
          style={{
            "--etikett-b": `${gewaehlt.breiteMm}mm`,
            "--etikett-h": `${gewaehlt.hoeheMm}mm`,
            "--etikett-qr": `${gewaehlt.qrMm}mm`,
          } as React.CSSProperties}
        >
          {basis && saetze.flatMap((satz) => {
            const kunde = customers.find((c) => c.id === satz.customer_id);
            const kundenName = kunde?.company || kunde?.name || "Unbekannter Kunde";
            const qr = <QrBild text={satzUrl(satz.id, basis)} alt="QR-Code Reifensatz" />;

            if (art === "satz") {
              return [(
                <div key={satz.id} className="etikett">
                  {qr}
                  <div className="etikett-text">
                    {/* Der Kundenname steht oben und fett: Er ist die Antwort auf die Frage, die
                        dieses Etikett stellt. Alles andere ist Beleg. */}
                    <div className="etikett-kunde">{kundenName}</div>
                    <div className="etikett-zeile">{fahrzeugText(satz)}</div>
                    <div className="etikett-zeile">
                      {satz.saison ? SAISON_LABEL[satz.saison] : "Saison offen"}
                      {" · "}
                      {/* Das schwächste Rad, wenn einzeln gemessen wurde – dieselbe Regel wie
                          überall sonst in der App. Ein Satz ist so gut wie sein schlechtester
                          Reifen; der Durchschnitt wäre eine beruhigende Zahl ohne Aussage. */}
                      {profilText(satzProfilMm(satz, raederZu(satz)))}
                    </div>
                    <div className="etikett-zeile">
                      {platzText(satz)} · seit {formatDate(satz.created_at.slice(0, 10))}
                    </div>
                  </div>
                </div>
              )];
            }

            return positionenZu(satz).map((position) => {
              const rad = radZu(satz, position);
              const profil = radProfil(satz, rad);
              return (
                <div key={`${satz.id}-${position}`} className="etikett etikett-rad">
                  {qr}
                  <div className="etikett-text">
                    {/* Position und Profil in EINER großen Zeile: Das sind die beiden Angaben,
                        wegen denen man das Etikett überhaupt anschaut, wenn vier gleich
                        aussehende Räder auf dem Boden liegen. */}
                    <div className="etikett-rad-kopf">
                      <span className="etikett-pos">{position}</span>
                      <span className="etikett-profil">{profil.wert}</span>
                    </div>
                    {/* „Satzwert" steht hier unten und nicht oben im Kopf: Der Zusatz ist
                        wichtig (die Zahl ist nicht an DIESEM Rad gemessen), aber er ist ein
                        Vorbehalt, keine Ansage – und im Kopf hat er die Zeile gesprengt. */}
                    <div className="etikett-zeile">
                      {RAD_POSITION_LABEL[position]}{profil.satzwert ? " · Satzwert" : ""}
                    </div>
                    <div className="etikett-zeile">{kundenName}</div>
                    <div className="etikett-zeile">
                      {[rad?.reifengroesse, fahrzeugText(satz)].filter(Boolean).join(" · ")}
                    </div>
                    <div className="etikett-zeile">{platzText(satz)}</div>
                  </div>
                </div>
              );
            });
          })}
        </div>

        <div className="row druck-weg" style={{ marginTop: 12 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>Drucken</button>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

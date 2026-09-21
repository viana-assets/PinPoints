"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Customer, EingelagertesRad, RadPosition, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { RAD_POSITIONEN, RAD_POSITION_LABEL, SAISON_LABEL } from "@/lib/constants";
import { formatDate, profilText, satzProfilMm } from "@/lib/helpers";
import { satzUrl } from "@/lib/aufkleberCode";
import { dateiName, etikettDatei, mmZuPx, type EtikettInhalt } from "@/lib/etikettBild";

// Etikett für einen eingelagerten Reifensatz (17.09.2026).
//
// Es beantwortet eine ANDERE Frage als der Aufkleber am Regal. Der am Regal sagt „welcher Platz
// ist das"; dieser sagt „wem gehört der Satz, der hier steht" – die Frage, die entsteht, wenn
// jemand beim Aufräumen vier Sätze in der Hand hat. Deshalb klebt er am Satz und wandert mit
// ihm, und deshalb steht der Lagerplatz zwar lesbar darauf, aber NICHT im QR-Code: Wo der Satz
// liegt, wird beim Scannen nachgeschlagen. Ein Aufkleber, der einen Platz behauptet, wäre in
// dem Moment falsch, in dem jemand umräumt – und genau dann braucht man ihn.
//
// ZWEI WEGE AUFS PAPIER
//
// 1. DRUCKEN über die Druckfunktion des Browsers. Am Rechner erreicht das jeden Drucker, der
//    als Systemdrucker eingerichtet ist; am iPhone ausschließlich AirPrint-Drucker.
// 2. ALS BILD TEILEN (21.09.2026): Das Etikett wird als PNG in exakt seiner physischen Größe
//    erzeugt und an das Teilen-Menü des Geräts übergeben. Von dort nimmt es die App des
//    Druckers entgegen und druckt über Bluetooth.
//
// Weg 2 gibt es, weil die kleinen Bluetooth-Etikettendrucker kein AirPrint können und ein
// Gerät, das Akku UND AirPrint kann, ein Vielfaches kostet. Er ist zwei Tipper umständlicher
// als „Drucken" – dafür braucht er keinen bestimmten Drucker. Wie das Bild entsteht, steht in
// `lib/etikettBild.ts`.

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
  // 50 × 80 mm steht oben, weil genau diese Rolle im Betrieb liegt (21.09.2026). Sie ist
  // HOCH, nicht breit: Der QR-Code wandert nach oben und wird mit 44 mm mehr als doppelt so
  // groß wie auf dem 30-mm-Etikett – gescannt wird im Regal aus einem Meter Abstand, und
  // dort zählt die Kantenlänge des Codes mehr als jede Beschriftung.
  { schluessel: "50x80", text: "Rolle 50 × 80 mm, hoch (vorhanden)", breiteMm: 50, hoeheMm: 80, qrMm: 44 },
  { schluessel: "50x30", text: "Rolle 50 × 30 mm", breiteMm: 50, hoeheMm: 30, qrMm: 21 },
  { schluessel: "40x30", text: "Rolle 40 × 30 mm (eng – lange Namen brechen ab)", breiteMm: 40, hoeheMm: 30, qrMm: 21 },
  { schluessel: "57x40", text: "Rolle 57 × 40 mm", breiteMm: 57, hoeheMm: 40, qrMm: 30 },
  // hoeheMm null = kein Rollenformat, sondern mehrere Etiketten auf einem Blatt.
  { schluessel: "a4", text: "A4-Bogen (mehrere nebeneinander)", breiteMm: 50, hoeheMm: 30, qrMm: 21 },
];

// Ein Bild im Browser speichern. Nur die Rückfallebene für Geräte ohne Teilen-Menü – am
// Handy, wo dieser Weg gebraucht wird, greift immer das Teilen.
function herunterladen(datei: File) {
  const url = URL.createObjectURL(datei);
  const a = document.createElement("a");
  a.href = url;
  a.download = datei.name;
  a.click();
  // Erst freigeben, wenn der Browser den Download angenommen hat. Sofortiges Freigeben
  // liefert in Safari eine leere Datei.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

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
  const [teilenLaeuft, setTeilenLaeuft] = useState(false);
  const [teilenHinweis, setTeilenHinweis] = useState<string | null>(null);
  useEffect(() => { setBasis(window.location.origin); }, []);

  const gewaehlt = ETIKETT_FORMATE.find((f) => f.schluessel === format) ?? ETIKETT_FORMATE[0];
  const rolle = gewaehlt.hoeheMm !== null;
  // Höher als breit? Dann steht der QR-Code oben und der Text darunter. Abgeleitet und nicht
  // als eigenes Feld gepflegt: Zwei Angaben, die dasselbe sagen, laufen auseinander.
  const hochformat = (gewaehlt.hoeheMm ?? 0) > gewaehlt.breiteMm;

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

  // ------------------------------------------------------------------ Der Inhalt
  //
  // Was auf einem Etikett steht, wird GENAU HIER entschieden – einmal. Die Darstellung auf dem
  // Bildschirm (und damit der Ausdruck) und das geteilte PNG lesen dieselbe Liste. Stünde der
  // Text an zwei Stellen, stünde er irgendwann verschieden da, und man merkte es erst an der
  // Rolle. Was sich zwischen beiden Wegen unterscheiden DARF, ist allein die Geometrie.
  type Bogen = {
    schluessel: string;
    satzId: string;
    rad: boolean;
    // Für den Dateinamen im Teilen-Menü – „Mustermann-VL.png" sagt mehr als „etikett-1.png".
    bezeichnung: string;
    inhalt: Omit<EtikettInhalt, "qr">;
  };

  const etiketten: Bogen[] = saetze.flatMap((satz): Bogen[] => {
    const kunde = customers.find((c) => c.id === satz.customer_id);
    const kundenName = kunde?.company || kunde?.name || "Unbekannter Kunde";

    if (art === "satz") {
      return [{
        schluessel: satz.id, satzId: satz.id, rad: false, bezeichnung: kundenName,
        inhalt: {
          kopf: kundenName,
          zeilen: [
            fahrzeugText(satz),
            // Das schwächste Rad, wenn einzeln gemessen wurde – dieselbe Regel wie überall
            // sonst in der App. Ein Satz ist so gut wie sein schlechtester Reifen; der
            // Durchschnitt wäre eine beruhigende Zahl ohne Aussage.
            `${satz.saison ? SAISON_LABEL[satz.saison] : "Saison offen"} · ${profilText(satzProfilMm(satz, raederZu(satz)))}`,
            `${platzText(satz)} · seit ${formatDate(satz.created_at.slice(0, 10))}`,
          ],
        },
      }];
    }

    return positionenZu(satz).map((position): Bogen => {
      const rad = radZu(satz, position);
      const profil = radProfil(satz, rad);
      return {
        schluessel: `${satz.id}-${position}`, satzId: satz.id, rad: true,
        bezeichnung: `${kundenName} ${position}`,
        inhalt: {
          gross: { links: position, rechts: profil.wert },
          zeilen: [
            // „Satzwert" steht hier unten und nicht oben im Kopf: Der Zusatz ist wichtig (die
            // Zahl ist nicht an DIESEM Rad gemessen), aber er ist ein Vorbehalt, keine Ansage
            // – und im Kopf hat er die Zeile gesprengt.
            `${RAD_POSITION_LABEL[position]}${profil.satzwert ? " · Satzwert" : ""}`,
            kundenName,
            [rad?.reifengroesse, fahrzeugText(satz)].filter(Boolean).join(" · "),
            platzText(satz),
          ],
        },
      };
    });
  });

  // ------------------------------------------------------------------ Als Bild teilen
  //
  // Der Ausweg für Drucker ohne AirPrint. Das Bild entsteht in der Auflösung des Druckers
  // (203 dpi) und in exakt der Größe des gewählten Formats – der Drucker muss dann nichts mehr
  // umrechnen, und genau das Umrechnen macht QR-Codes unlesbar.
  async function alsBildTeilen() {
    setTeilenHinweis(null);
    setTeilenLaeuft(true);
    try {
      const dateien: File[] = [];
      for (const [i, e] of etiketten.entries()) {
        const masse = {
          breiteMm: gewaehlt.breiteMm,
          // Beim A4-Bogen gibt es keine Etikettenhöhe; fürs Bild gilt dann das Maß, das die
          // Vorschau ohnehin zeichnet.
          hoeheMm: gewaehlt.hoeheMm ?? 30,
          // Das Rad-Etikett hat im Querformat einen kleineren QR-Code als das Satz-Etikett –
          // links steht dort eine Angabe, die gelesen werden MUSS, und die braucht die
          // Breite. Im Hochformat gilt das nicht: Dort steht die Angabe unter dem Code, nicht
          // daneben. Derselbe Abzug und dieselbe Ausnahme wie im Stilblatt.
          qrMm: e.rad && !hochformat ? gewaehlt.qrMm - 3 : gewaehlt.qrMm,
        };
        const qr = await QRCode.toDataURL(satzUrl(e.satzId, basis), {
          width: mmZuPx(masse.qrMm), margin: 1, errorCorrectionLevel: "M",
        });
        dateien.push(await etikettDatei(
          { ...e.inhalt, qr }, masse, dateiName(e.bezeichnung, i + 1, etiketten.length)
        ));
      }

      const teilen = navigator.canShare && navigator.canShare({ files: dateien });
      if (teilen) {
        await navigator.share({ files: dateien });
        return;
      }
      // Rechner ohne Teilen-Menü: speichern statt teilen. Von dort lässt sich das Bild in die
      // Drucker-Software ziehen.
      dateien.forEach(herunterladen);
      setTeilenHinweis(
        dateien.length === 1
          ? "Dieses Gerät kennt kein Teilen-Menü – das Etikett wurde stattdessen gespeichert."
          : `Dieses Gerät kennt kein Teilen-Menü – die ${dateien.length} Etiketten wurden stattdessen gespeichert.`
      );
    } catch (fehler) {
      // Im Teilen-Menü auf Abbrechen zu tippen ist eine Entscheidung, kein Fehler. Eine
      // Meldung darauf wäre eine Belehrung.
      if (fehler instanceof DOMException && fehler.name === "AbortError") return;
      setTeilenHinweis(fehler instanceof Error ? fehler.message : "Das Etikett konnte nicht erzeugt werden.");
    } finally {
      setTeilenLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay druck-fenster" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
          {basis && etiketten.map((e) => (
            <div key={e.schluessel} className={"etikett" + (e.rad ? " etikett-rad" : "") + (hochformat ? " hoch" : "")}>
              <QrBild text={satzUrl(e.satzId, basis)} alt="QR-Code Reifensatz" />
              <div className="etikett-text">
                {/* Position und Profil in EINER großen Zeile: Das sind die beiden Angaben,
                    wegen denen man das Etikett überhaupt anschaut, wenn vier gleich
                    aussehende Räder auf dem Boden liegen. */}
                {e.inhalt.gross && (
                  <div className="etikett-rad-kopf">
                    <span className="etikett-pos">{e.inhalt.gross.links}</span>
                    <span className="etikett-profil">{e.inhalt.gross.rechts}</span>
                  </div>
                )}
                {/* Der Kundenname steht oben und fett: Er ist die Antwort auf die Frage, die
                    dieses Etikett stellt. Alles andere ist Beleg. */}
                {e.inhalt.kopf && <div className="etikett-kunde">{e.inhalt.kopf}</div>}
                {e.inhalt.zeilen.map((zeile, i) => (
                  <div key={i} className="etikett-zeile">{zeile}</div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Der Hinweis steht über den Knöpfen und nicht in einer Anleitung: Gelesen wird er in
            der Sekunde, in der jemand vor dem Drucker steht. */}
        <div className="small druck-weg" style={{ marginTop: 12 }}>
          <b>Drucken</b> geht an jeden Drucker, den das Gerät kennt – am Rechner jeden
          Systemdrucker, am Handy nur AirPrint-Drucker. <b>Als Bild teilen</b> ist der Weg für
          Etikettendrucker, die nur über Bluetooth und ihre eigene App erreichbar sind: Das
          Etikett geht als Bild ins Teilen-Menü, von dort in die App des Druckers.
        </div>

        <div className="row druck-weg" style={{ marginTop: 8 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>Drucken</button>
          <button
            className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }}
            disabled={teilenLaeuft || !basis || etiketten.length === 0}
            onClick={() => void alsBildTeilen()}
          >
            {teilenLaeuft
              ? "einen Moment …"
              : etiketten.length > 1 ? `${etiketten.length} Bilder teilen` : "Als Bild teilen"}
          </button>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={onClose}>Schließen</button>
        </div>

        {teilenHinweis && (
          <div className="fehler-hinweis druck-weg" role="status" style={{ marginTop: 8 }}>
            <span>{teilenHinweis}</span>
            <button type="button" onClick={() => setTeilenHinweis(null)} aria-label="Meldung schließen">×</button>
          </div>
        )}
      </div>
    </div>
  );
}

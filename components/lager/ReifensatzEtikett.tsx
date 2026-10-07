"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrBild } from "./QrBild";
import type { Customer, EingelagertesRad, RadPosition, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { RAD_POSITION_LABEL, SAISON_LABEL } from "@/lib/constants";
import { formatDate, profilText, satzProfilMm } from "@/lib/helpers";
import { satzUrl } from "@/lib/aufkleberCode";
import { notizenText, radNotiz, satzPositionen } from "@/lib/lagerNotizen";
import { dateiName, etikettDatei, etikettenPdfDatei, mmZuPx, PX_PRO_MM_300, teilenOderSpeichern, type EtikettInhalt, type EtikettMasse } from "@/lib/etikettBild";

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
// 1. DRUCKEN: Die Etiketten werden als PDF in genau der Etikettengröße erzeugt und ins
//    Teilen-Menü gegeben; dort „Drucken", Brother QL-820NWB, Papierformat wie im Fenster
//    (lib/etikettPdf.ts – warum nicht die Druckfunktion des Browsers, steht dort).
// 2. ALS BILD TEILEN (21.09.2026): Das Etikett als PNG in exakt seiner Größe, für die
//    Brother-App über Bluetooth (Teilen-Menü „Bild sichern", in iPrint&Label unter „Erstellen").
//    Umständlicher, aber ohne WLAN des Druckers. Wie das Bild entsteht: `lib/etikettBild.ts`.
//
// ZWEI FORMATE (seit v99, 02.10.2026): 58 × 58 mm als Vorgabe, 60 × 86 mm (groß) wählbar –
// beide auf der 62-mm-Rolle des Brother. v96 hatte die Auswahl ganz entfernt; gemeint war aber
// „58 × 58 als Standard, die übrigen Formate (kleine 203-dpi-Rollen, A4-Bogen) raus“
// (Klarstellung Vitali 02.10.2026). Dieselbe Liste nutzt der Lagerplatz-Aufkleber.

// Die Maße des Etiketts an EINER Stelle. Als Datensatz und nicht als lose Zahlen im Code: Das
// Bild, das PDF und die Vorschau lesen alle dasselbe, und ein zweites Format wäre ein weiterer
// Datensatz statt einer Suche nach Zahlen.
export type EtikettFormat = {
  schluessel: string; text: string; breiteMm: number; hoeheMm: number;
  // Kantenlänge des QR-Bildes. Gescannt wird aus der Hüfte heraus über einem Regal – da zählt
  // jeder Millimeter, ohne dass der Text darunter in Not gerät.
  qrMm: number;
  // Auflösung (Brother: 300 dpi), Rand (der Drucker bedruckt die äußersten Millimeter der Rolle
  // nicht) und ein Faktor für die Schriften.
  pxProMm: number;
  randMm: number;
  schrift: number;
  // QR-Code oben, Text darunter – auch beim quadratischen Etikett.
  qrOben: boolean;
  // Der Eintrag, der im Druckdialog des iPhones als Papierformat gewählt werden muss.
  papier: string;
};

// Brother QL-820NWBc, 62-mm-Endlosrolle (DK-22205 Papier, DK-22212 Folie). Beides sind
// Papierformate, die der Druckdialog des iPhones für diesen Drucker anbietet – ein eigenes Maß
// kennt er nicht. Getestet 02.10.2026: richtige Größe, QR lesbar. Das erste ist die Vorgabe.
export const ETIKETT_FORMATE: EtikettFormat[] = [
  { schluessel: "58x58", text: "Brother 58 × 58 mm (Standard)", breiteMm: 58, hoeheMm: 58, qrMm: 30,
    pxProMm: PX_PRO_MM_300, randMm: 2.5, schrift: 1.25, qrOben: true, papier: "58 x 58 mm" },
  { schluessel: "60x86", text: "Brother 60 × 86 mm (groß)", breiteMm: 60, hoeheMm: 86, qrMm: 46,
    pxProMm: PX_PRO_MM_300, randMm: 3, schrift: 1.75, qrOben: true, papier: "60 x 86 mm" },
];


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
  // Vorgabe seit v123: eines je Rad (Wunsch 07.10.2026 – gedruckt wird fast immer je Rad, die Wahl
  // jedes Mal umzustellen kostete einen Handgriff). „Ein Etikett je Satz“ bleibt wählbar.
  const [art, setArt] = useState<EtikettArt>("raeder");
  const [teilenLaeuft, setTeilenLaeuft] = useState(false);
  const [teilenHinweis, setTeilenHinweis] = useState<string | null>(null);
  useEffect(() => { setBasis(window.location.origin); }, []);

  const [format, setFormat] = useState<string>(ETIKETT_FORMATE[0].schluessel);
  const gewaehlt = ETIKETT_FORMATE.find((f) => f.schluessel === format) ?? ETIKETT_FORMATE[0];
  // QR-Code oben, Text darunter (Klasse `hoch` im Stilblatt).
  const hochformat = gewaehlt.qrOben;

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
  const positionenZu = (satz: TireStorage): RadPosition[] => satzPositionen(satz);

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
            // Eigene Zeile seit 02.10.2026: hinter Lager und Platz wurde das Datum abgeschnitten.
            platzText(satz),
            `eingelagert seit ${formatDate(satz.created_at.slice(0, 10))}`,
          ],
          // Nur die Notizen je Rad: Sie betreffen den Reifen. Die Satznotiz („Kunde will Rückruf“)
          // gehört ins Lager, nicht auf den Reifen – und das Etikett ist klein.
          notiz: notizenText(satz, false) || null,
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
          notiz: radNotiz(satz, position),
        },
      };
    });
  });

  // ------------------------------------------------------------------ Als Bild teilen
  //
  // Der Weg über Bluetooth. Das Bild entsteht in der Auflösung des Druckers (300 dpi) und in
  // exakt der Etikettengröße – der Drucker muss dann nichts mehr umrechnen, und genau das
  // Umrechnen macht QR-Codes unlesbar.
  // Jedes Etikett mit seinem QR-Code und den Maßen des Formats – für das Bild und für das PDF
  // dieselbe Liste.
  async function etikettenMitMassen(): Promise<{ inhalt: EtikettInhalt; masse: EtikettMasse; name: string }[]> {
    const liste: { inhalt: EtikettInhalt; masse: EtikettMasse; name: string }[] = [];
    for (const [i, e] of etiketten.entries()) {
      const masse: EtikettMasse = {
        pxProMm: gewaehlt.pxProMm, randMm: gewaehlt.randMm, schrift: gewaehlt.schrift, qrOben: gewaehlt.qrOben,
        breiteMm: gewaehlt.breiteMm,
        hoeheMm: gewaehlt.hoeheMm,
        // Satz- und Rad-Etikett haben denselben QR-Code: Die Angabe des Rads steht unter dem
        // Code, nicht daneben (bis v95 gab es Querformate, dort war er beim Rad 3 mm kleiner).
        qrMm: gewaehlt.qrMm,
      };
      const qr = await QRCode.toDataURL(satzUrl(e.satzId, basis), {
        width: mmZuPx(masse.qrMm, masse.pxProMm), margin: 1, errorCorrectionLevel: "M",
      });
      liste.push({ inhalt: { ...e.inhalt, qr }, masse, name: dateiName(e.bezeichnung, i + 1, etiketten.length) });
    }
    return liste;
  }

  // ------------------------------------------------------------------ Drucken als PDF (Brother)
  //
  // Das PDF geht ins Teilen-Menü; dort „Drucken" wählen, den QL-820NWB und das Papierformat
  // `gewaehlt.papier`. Getestet am 02.10.2026: richtige Größe, keine Fußzeile.
  async function alsPdfDrucken() {
    setTeilenHinweis(null);
    setTeilenLaeuft(true);
    try {
      const liste = await etikettenMitMassen();
      const name = dateiName(liste.length === 1 ? etiketten[0].bezeichnung : `etiketten-${liste.length}`, 1, 1).replace(/\.png$/, ".pdf");
      const pdf = await etikettenPdfDatei(liste, name);
      if (await teilenOderSpeichern([pdf]) === "geteilt") return;
      setTeilenHinweis("Dieses Gerät kennt kein Teilen-Menü – das PDF wurde gespeichert. Öffnen und drucken.");
    } catch (fehler) {
      if (fehler instanceof DOMException && fehler.name === "AbortError") return;
      setTeilenHinweis(fehler instanceof Error ? fehler.message : "Das PDF konnte nicht erzeugt werden.");
    } finally {
      setTeilenLaeuft(false);
    }
  }

  async function alsBildTeilen() {
    setTeilenHinweis(null);
    setTeilenLaeuft(true);
    try {
      const dateien: File[] = [];
      for (const e of await etikettenMitMassen()) dateien.push(await etikettDatei(e.inhalt, e.masse, e.name));

      // Rechner ohne Teilen-Menü: speichern statt teilen. Von dort lässt sich das Bild in die
      // Drucker-Software ziehen.
      if (await teilenOderSpeichern(dateien) === "geteilt") return;
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
    <div className="modal-overlay druck-fenster modal-etikett" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            Dokument. Deshalb wird die Regel hier erzeugt, statt sie im Stilblatt zu hinterlegen.
            Gedruckt wird über das PDF; die Regel greift nur, wenn jemand am Rechner die
            Druckfunktion des Browsers nimmt (Strg+P) – dann wenigstens in Etikettengröße. */}
        <style>{`@page { size: ${gewaehlt.breiteMm}mm ${gewaehlt.hoeheMm}mm; margin: 0; }`}</style>

        <div className="field druck-weg" style={{ maxWidth: 340 }}>
          <label htmlFor="etikett-art">Was wird gedruckt?</label>
          <select id="etikett-art" value={art} onChange={(e) => setArt(e.target.value as EtikettArt)}>
            <option value="raeder">Ein Etikett je Rad (VL, VR, HL, HR)</option>
            <option value="satz">Ein Etikett je Satz</option>
          </select>
          <span className="small">
            {art === "satz"
              ? "Kommt auf den Satz – Kunde, Fahrzeug, Saison, Profil."
              : "Kommt auf jedes einzelne Rad – Position und dessen Profiltiefe. Beim Wiederaufziehen ist damit klar, welches Rad wohin gehört."}
          </span>
        </div>

        {/* Die Schritte stehen hier, weil sie in der Sekunde gebraucht werden, in der jemand vor
            dem Druckdialog steht. */}
        <div className="field druck-weg" style={{ maxWidth: 340 }}>
          <label htmlFor="etikett-format">Format</label>
          <select id="etikett-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            {ETIKETT_FORMATE.map((f) => <option key={f.schluessel} value={f.schluessel}>{f.text}</option>)}
          </select>
          <span className="small ek-schritte">
            <b>So druckst du:</b> iPhone mit dem WLAN des Druckers verbinden (Wireless Direct) ·
            &bdquo;Drucken&ldquo; tippen · im Teilen-Menü <b>&bdquo;Drucken&ldquo;</b> · Drucker
            QL-820NWB · Papierformat <b>{gewaehlt.papier}</b>. Für Etiketten direkt auf dem
            Reifen die Folienrolle DK-22212 statt Papier einlegen.
          </span>
        </div>

        <div
          className="druckbogen rolle"
          style={{
            "--etikett-b": `${gewaehlt.breiteMm}mm`,
            "--etikett-h": `${gewaehlt.hoeheMm}mm`,
            "--etikett-qr": `${gewaehlt.qrMm}mm`,
            "--etikett-rand": `${gewaehlt.randMm ?? 1.5}mm`,
            "--etikett-s": String(gewaehlt.schrift ?? 1),
          } as React.CSSProperties}
        >
          {basis && etiketten.map((e) => (
            <div key={e.schluessel} className={"etikett" + (e.rad ? " etikett-rad" : "") + (hochformat ? " hoch" : "")}>
              <QrBild text={satzUrl(e.satzId, basis)} alt="QR-Code Reifensatz" klasse="etikett-qr" />
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
                {e.inhalt.notiz && <div className="etikett-notiz">{e.inhalt.notiz}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Der Hinweis steht über den Knöpfen und nicht in einer Anleitung: Gelesen wird er in
            der Sekunde, in der jemand vor dem Drucker steht. */}
        <div className="small druck-weg" style={{ marginTop: 12 }}>
          <b>Drucken</b> erzeugt ein PDF in genau dieser Größe – ohne Fußzeile, ohne Verkleinern.
          <b> Als Bild teilen</b> ist der Umweg über Bluetooth: im Teilen-Menü &bdquo;Bild
          sichern&ldquo;, dann in iPrint&amp;Label unter &bdquo;Erstellen&ldquo; das Bild wählen.
        </div>

        <div className="row druck-weg" style={{ marginTop: 8 }}>
          <button className="btn-primary" style={{ flex: 1 }} disabled={teilenLaeuft || !basis || etiketten.length === 0}
            onClick={() => void alsPdfDrucken()}>
            {teilenLaeuft ? "einen Moment …" : "Drucken"}
          </button>
          <button
            className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }}
            disabled={teilenLaeuft || !basis || etiketten.length === 0}
            onClick={() => void alsBildTeilen()}
          >
            {teilenLaeuft
              ? "einen Moment …"
              : etiketten.length > 1 ? `${etiketten.length} Bilder teilen` : "Als Bild teilen"}
          </button>
          <button className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }} onClick={onClose}>Schließen</button>
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

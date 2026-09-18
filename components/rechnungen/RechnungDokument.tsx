import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Rechnung } from "@/lib/types";
import { formatDate, formatEUR } from "@/lib/helpers";
import { anschriftZeilen, firmaOhneInhaber, girocodeText, rechnungSummen } from "@/lib/rechnung";
import type { RechnungEntwurf } from "@/lib/rechnung";

// Das Dokument – A4, im Layout der bisherigen Rechnungen des Betriebs.
//
// EIN Bauteil für Vorschau UND Druck. Die Vorschau zeigt dasselbe Papier, nur kleiner
// skaliert; gedruckt wird nicht etwas anderes, sondern genau das, was man vorher gesehen hat.
// Zwei Fassungen wären zwei Layouts, und das zweite merkt man erst, wenn es beim Kunden liegt.
//
// Maße in MILLIMETERN. Eine Rechnung ist eines der wenigen Dinge in einer Anwendung, das eine
// physische Größe HAT – wer sie in Pixeln entwirft und beim Drucken umrechnet, entwirft
// zweimal (dieselbe Überlegung wie beim Etikett, siehe app/globals.css).
//
// Nimmt sowohl eine ausgestellte Rechnung als auch einen Entwurf: Der Entwurf hat noch keine
// Nummer, und genau das soll man ihm ansehen.

export type DokumentDaten =
  | (Rechnung & { entwurf?: false })
  | (RechnungEntwurf & {
      entwurf: true;
      nummer_text?: undefined;
      // Die Nummer, die beim Ausstellen voraussichtlich vergeben wird. Sie ist NICHT
      // reserviert – siehe `voraussichtlicheNummer()` in lib/rechnung.ts.
      voraussichtlich?: string;
    });

export function RechnungDokument({ daten }: { daten: DokumentDaten }) {
  const a = daten.absender;
  const e = daten.empfaenger;
  const t = daten.texte;
  const nummerText = daten.entwurf ? null : daten.nummer_text;
  // Ob mit Steuer ausgewiesen wird, steht im Snapshot und nicht am Auftrag: Der Schalter dort
  // kann sich geändert haben, seit der Beleg gedruckt wurde.
  const mitSteuer = t.mit_steuer ?? daten.steuer !== 0;

  // Die Aufteilung je Steuersatz ergibt sich aus den Positionen – die stehen fest, also steht
  // sie fest. Die SUMMEN dagegen werden bei einem ausgestellten Beleg NICHT neu gerechnet,
  // sondern gelesen: Was einmal auf dem Papier stand, bleibt stehen, auch wenn diese
  // Anwendung morgen anders rundet. Nur der Entwurf rechnet, denn er hat noch keine Zahlen.
  const aufteilung = rechnungSummen(daten.positionen, mitSteuer).saetze;
  const summen = daten.entwurf
    ? rechnungSummen(daten.positionen, mitSteuer)
    : { netto: daten.netto, steuer: daten.steuer, brutto: daten.brutto, saetze: aufteilung };

  // Der Zahlcode entsteht erst, wenn die Nummer feststeht: Er trägt sie im Verwendungszweck,
  // und „Rechnung (Entwurf)" auf einer Überweisung wäre Unsinn.
  const giroText = nummerText
    ? girocodeText({ absender: a, brutto: daten.brutto, nummer_text: nummerText })
    : null;

  const anschrift = anschriftZeilen(e);
  const absenderZeile = [a.firma, a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");

  return (
    <div className="rechnungsseite">
      <div className="rechnung-koerper">
        {/* ------------------------------------------------------------ Briefkopf */}
        <div className="re-kopf">
          <div className="re-kopf-text">
            <div className="re-firma">{a.firma}</div>
            {a.inhaber && <div className="re-inhaber">{a.inhaber}</div>}
          </div>
          {/* Ein gewöhnliches Bild: Das Logo ist eine data:-URI aus der Datenbank, an der
              next/image nichts zu optimieren hat – und es verlangte feste Maße, die ein Logo
              je nach Hoch- oder Querformat gerade nicht hat. */}
          {a.logo && <img className="re-logo" src={a.logo} alt="" />}
        </div>

        {/* --------------------------------------- Anschriftenfeld und Rechnungsdaten */}
        <div className="re-adressteil">
          <div className="re-anschrift">
            {/* Die Absenderzeile über dem Anschriftenfeld: klein, unterstrichen, so wie sie
                im Fenster eines Umschlags über der Adresse steht. */}
            {absenderZeile && <div className="re-absenderzeile">{absenderZeile}</div>}
            {anschrift.map((z, i) => <div key={i}>{z}</div>)}
          </div>
          <div className="re-daten">
            <div>
              <span>Rechnungsnr.</span>
              <b>
                {nummerText ?? (daten.entwurf && daten.voraussichtlich ? daten.voraussichtlich : "—")}
                {/* Der Zusatz steht NEBEN der Nummer und nicht statt ihrer: Wer wissen will,
                    welche Nummer es wird, soll sie sehen – und zugleich, dass sie noch nicht
                    vergeben ist. */}
                {!nummerText && <span className="re-vorbehalt">voraussichtlich</span>}
              </b>
            </div>
            <div><span>Rechnungsdatum</span><b>{formatDate(daten.datum)}</b></div>
            {daten.lieferdatum && <div><span>Lieferdatum</span><b>{formatDate(daten.lieferdatum)}</b></div>}
            {e.kundennummer != null && <div><span>Kundennr.</span><b>{e.kundennummer}</b></div>}
            {t.auftragsnummer != null && <div><span>Auftrag</span><b>{t.auftragsnummer}</b></div>}
          </div>
        </div>

        <h1 className="re-titel">
          {daten.art === "storno" ? "Stornorechnung" : "Rechnung"}
          {nummerText ? ` ${nummerText}` : ""}
          {/* Ein Entwurf, der ausgedruckt wird, muss als solcher erkennbar sein. Ohne diese
              Kennzeichnung sähe ein mit Strg+P erzeugtes PDF aus wie ein Beleg – mit einer
              Nummer, die noch niemandem gehört. */}
          {!nummerText && <span className="re-entwurf-marke">Entwurf</span>}
        </h1>

        {t.kennzeichen.length > 0 && (
          <div className="re-kennzeichen">
            {t.kennzeichen.length === 1 ? "Fahrzeug: " : "Fahrzeuge: "}{t.kennzeichen.join(", ")}
          </div>
        )}

        {t.anschreiben && (
          // `white-space: pre-line` im Stilblatt: Die Leerzeile zwischen Anrede und Text ist
          // Teil des Briefs und keine Formatierung, die die Anwendung erfinden dürfte.
          <div className="re-anschreiben">{t.anschreiben}</div>
        )}

        {/* ------------------------------------------------------------ Positionen */}
        <table className="re-tabelle">
          <thead>
            <tr>
              <th className="re-sp-pos">Pos.</th>
              <th className="re-sp-nr">Artikel</th>
              <th>Bezeichnung</th>
              <th className="re-sp-menge">Menge</th>
              <th className="re-sp-preis">Einzelpreis</th>
              <th className="re-sp-summe">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {daten.positionen.map((p, i) => (
              <tr key={i}>
                <td className="re-sp-pos">{i + 1}</td>
                <td className="re-sp-nr">{p.artikelnummer ?? ""}</td>
                <td>
                  {p.bezeichnung}
                  {p.zusatz && <div className="re-zusatz">{p.zusatz}</div>}
                </td>
                <td className="re-sp-menge">
                  {p.menge.toLocaleString("de-DE")}{p.einheit ? ` ${p.einheit}` : ""}
                </td>
                <td className="re-sp-preis">{formatEUR(p.einzelpreis)}</td>
                <td className="re-sp-summe">{formatEUR(p.netto)}</td>
              </tr>
            ))}
            {daten.positionen.length === 0 && (
              <tr><td colSpan={6} className="re-leer">Noch keine Leistung am Auftrag.</td></tr>
            )}
          </tbody>
        </table>

        {/* ------------------------------------------------------------ Summen */}
        <div className="re-summen">
          <div className="re-summenblock">
            <div><span>Summe netto</span><b>{formatEUR(summen.netto)}</b></div>
            {mitSteuer
              ? summen.saetze.map((s) => (
                  <div key={s.satz}>
                    <span>zzgl. {s.satz.toLocaleString("de-DE")} % USt. auf {formatEUR(s.netto)}</span>
                    <b>{formatEUR(s.steuer)}</b>
                  </div>
                ))
              : (
                // Der Satz ersetzt die Steuerzeile und steht nicht daneben: Eine Rechnung, auf
                // der „0,00 € USt." steht, sieht aus wie ein Rechenfehler.
                <div className="re-ohne-steuer"><span>Ohne Umsatzsteuerausweis</span><b /></div>
              )}
            <div className="re-gesamt"><span>Gesamtbetrag</span><b>{formatEUR(summen.brutto)}</b></div>
          </div>
        </div>

        {t.fuss_zahlung && <div className="re-zahlung">{t.fuss_zahlung}</div>}
        {t.fuss_dank && <div className="re-dank">{t.fuss_dank}</div>}
        {t.fuss_hinweis && <div className="re-hinweis">{t.fuss_hinweis}</div>}

        {giroText && (
          <div className="re-giro">
            <GiroBild text={giroText} />
            <div>
              <b>Bequem überweisen</b>
              <div className="small">Den Code in der Banking-App einlesen – Empfänger, IBAN, Betrag und Verwendungszweck stehen dann schon drin.</div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ Fußzeile */}
      <div className="re-fuss">
        <div>
          {/* Ohne den Inhabernamen – der steht in der Zeile direkt darunter. Oben im
              Briefkopf und in der Absenderzeile bleibt der vollständige Name stehen. */}
          <b>{firmaOhneInhaber(a.firma, a.inhaber)}</b>
          {a.inhaber && <div>Inhaber: {a.inhaber}</div>}
          {a.strasse && <div>{a.strasse}</div>}
          {(a.plz || a.ort) && <div>{[a.plz, a.ort].filter(Boolean).join(" ")}</div>}
        </div>
        <div>
          {a.telefon && <div>{a.telefon}</div>}
          {a.email && <div>{a.email}</div>}
          {a.webseite && <div>{a.webseite}</div>}
          {a.steuernummer && <div>Steuernr.: {a.steuernummer}</div>}
          {a.ust_id && <div>USt-IdNr.: {a.ust_id}</div>}
        </div>
        <div>
          {a.bank && <div>{a.bank}</div>}
          {a.kontoinhaber && <div>{a.kontoinhaber}</div>}
          {a.iban && <div>IBAN: {a.iban}</div>}
          {a.bic && <div>BIC: {a.bic}</div>}
        </div>
      </div>
    </div>
  );
}

// Der Girocode als Bild. Eigenes Bauteil und nicht ein Effekt in der Seite – so wie beim
// Lagerplatz-Aufkleber: Das Erzeugen ist asynchron, und ein Bauteil, das nur dafür da ist,
// braucht dafür keinen Zustand in der Seite.
function GiroBild({ text }: { text: string }) {
  const [bild, setBild] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    // Fehlerkorrektur M: Der Code sitzt auf Papier und wird aus der Hand abfotografiert – L
    // wäre bei einem Knick am Rand schon verloren, H macht ihn ohne Not dichter.
    QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 0, scale: 8 })
      .then((d) => { if (!weg) setBild(d); })
      .catch(() => { /* Ohne Code wird die Rechnung trotzdem gedruckt. */ });
    return () => { weg = true; };
  }, [text]);

  if (!bild) return <span className="re-giro-platz" aria-hidden="true" />;
  return <img src={bild} alt="Girocode zur Überweisung" />;
}

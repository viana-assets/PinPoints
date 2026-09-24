import { useRef, useState } from "react";
import type { Betrieb, BetriebFelder } from "@/lib/types";
import { LOGO_MAX_BYTES, LOGO_TYPEN } from "@/lib/constants";
import { nummernkreisFehler } from "@/lib/rechnung";

// Der Briefkopf (Migration 48). Was hier steht, steht auf jeder Rechnung, die das Haus
// verlässt – und zwar als ABSCHRIFT: Eine Rechnung von letztem Jahr behält den Briefkopf, den
// sie beim Ausstellen hatte. Wer hier die Anschrift korrigiert, ändert damit nichts an
// bereits ausgestellten Belegen. Genau so ist es richtig, und genau deshalb steht der Satz
// auch für den Benutzer unten in der Maske.
//
// Ein Formular mit Speichern-Knopf und nicht wie das Terminraster mit Sofortwirkung: Eine
// IBAN tippt man in mehreren Anläufen, und eine halb getippte IBAN darf nicht eine Sekunde
// lang die gültige sein.

function Feld({ label, wert, onChange, hinweis, breit, mehrzeilig, platzhalter }: {
  label: string;
  wert: string;
  onChange: (w: string) => void;
  hinweis?: string;
  breit?: boolean;
  mehrzeilig?: number;
  platzhalter?: string;
}) {
  return (
    <div className={"bd-feld" + (breit ? " breit" : "")}>
      <label>{label}</label>
      {mehrzeilig ? (
        <textarea rows={mehrzeilig} value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={wert} placeholder={platzhalter} onChange={(e) => onChange(e.target.value)} />
      )}
      {hinweis && <span className="small">{hinweis}</span>}
    </div>
  );
}

export function BetriebsdatenPanel({ betrieb, onSpeichern, onNummernkreis, hoechsteVergebene }: {
  betrieb: Betrieb;
  onSpeichern: (felder: BetriebFelder) => Promise<void>;
  // Getrennt vom Rest: Dieser eine Wert verschiebt einen Nummernkreis. Er gehört nicht in
  // dasselbe Formular wie eine Telefonnummer, die man nebenbei korrigiert.
  onNummernkreis: (nummer: number) => Promise<void>;
  // Die höchste bereits vergebene Nummer (null = noch keine Rechnung). `undefined` heißt: wird
  // noch geladen – dann bleibt der Knopf „Ändern" gesperrt, statt ohne Prüfung zu setzen.
  hoechsteVergebene: number | null | undefined;
}) {
  const [f, setF] = useState<BetriebFelder>({
    firma: betrieb.firma, inhaber: betrieb.inhaber, strasse: betrieb.strasse,
    plz: betrieb.plz, ort: betrieb.ort, telefon: betrieb.telefon, email: betrieb.email,
    webseite: betrieb.webseite, ust_id: betrieb.ust_id, steuernummer: betrieb.steuernummer,
    kontoinhaber: betrieb.kontoinhaber, bank: betrieb.bank, iban: betrieb.iban, bic: betrieb.bic,
    logo: betrieb.logo, anschreiben: betrieb.anschreiben,
    fuss_zahlung: betrieb.fuss_zahlung, fuss_hinweis: betrieb.fuss_hinweis, fuss_dank: betrieb.fuss_dank,
    rechnung_praefix: betrieb.rechnung_praefix,
  });
  const [stand, setStand] = useState<"bereit" | "speichert" | "gespeichert">("bereit");
  const [fehler, setFehler] = useState<string | null>(null);
  const [nummer, setNummer] = useState(String(betrieb.rechnung_naechste_nummer));
  const [nummerOffen, setNummerOffen] = useState(false);
  const dateiFeld = useRef<HTMLInputElement>(null);

  const setz = (teil: Partial<BetriebFelder>) => { setF((alt) => ({ ...alt, ...teil })); setStand("bereit"); };

  async function speichern() {
    setStand("speichert");
    setFehler(null);
    try {
      await onSpeichern(f);
      setStand("gespeichert");
      setTimeout(() => setStand("bereit"), 2500);
    } catch (e) {
      setStand("bereit");
      setFehler(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    }
  }

  // Das Logo als data:-URI und nicht als Datei in einem Speicherdienst: Es gehört zum
  // Briefkopf und reist mit ihm. Kein zweiter Dienst, keine Adresse, die irgendwann ins Leere
  // zeigt, und beim Drucken nichts nachzuladen.
  function logoLesen(datei: File) {
    setFehler(null);
    if (!LOGO_TYPEN.includes(datei.type)) {
      setFehler("Nur PNG, JPEG oder SVG. Für einen Briefkopf ist PNG mit durchsichtigem Hintergrund am unkompliziertesten.");
      return;
    }
    if (datei.size > LOGO_MAX_BYTES) {
      setFehler(`Die Datei ist ${Math.round(datei.size / 1024)} kB groß. Mehr als ${Math.round(LOGO_MAX_BYTES / 1024)} kB gehören nicht in eine Datenbankzeile – bitte vorher auf etwa 300 Pixel Breite verkleinern.`);
      return;
    }
    const leser = new FileReader();
    leser.onload = () => { if (typeof leser.result === "string") setz({ logo: leser.result }); };
    leser.onerror = () => setFehler("Die Datei konnte nicht gelesen werden.");
    leser.readAsDataURL(datei);
  }

  // Fahrplan D7: Die Zahl wird gegen den Bestand geprüft, bevor sie gespeichert wird. Die
  // Datenbank prüft dasselbe noch einmal (Migration 55) – hier steht es, damit die Erklärung
  // kommt, bevor jemand auf „Setzen" drückt, und nicht als Fehlermeldung danach.
  const richtigeNummer = hoechsteVergebene == null ? null : hoechsteVergebene + 1;
  const kreisStimmt = richtigeNummer == null || betrieb.rechnung_naechste_nummer === richtigeNummer;
  const praefix = betrieb.rechnung_praefix || "RE";
  const eingabeFehler = nummerOffen ? nummernkreisFehler(parseInt(nummer, 10), hoechsteVergebene ?? null, praefix) : null;

  async function nummernkreisSetzen(wert = parseInt(nummer, 10)) {
    const grund = nummernkreisFehler(wert, hoechsteVergebene ?? null, praefix);
    if (grund) { setFehler(grund); return; }
    setFehler(null);
    try {
      await onNummernkreis(wert);
      setNummer(String(wert));
      setNummerOffen(false);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Nummer konnte nicht gesetzt werden.");
    }
  }

  return (
    <div className="betriebsdaten">
      <div className="admin-card">
        <h4 style={{ margin: 0 }}>Briefkopf</h4>
        <p className="small" style={{ marginTop: 2 }}>
          Der Absender auf jeder Rechnung. Rechnungen, die bereits ausgestellt sind, behalten
          ihren alten Briefkopf – eine Rechnung ist ein Beleg und ändert sich nicht rückwirkend.
        </p>

        <div className="bd-raster">
          <Feld label="Firma" wert={f.firma} onChange={(w) => setz({ firma: w })} breit
            hinweis="Steht im Kopf und in der Fußzeile. Ohne diese Angabe lässt sich keine Rechnung ausstellen." />
          <Feld label="Inhaber" wert={f.inhaber} onChange={(w) => setz({ inhaber: w })} />
          <Feld label="Straße und Hausnummer" wert={f.strasse} onChange={(w) => setz({ strasse: w })} />
          <Feld label="PLZ" wert={f.plz} onChange={(w) => setz({ plz: w })} />
          <Feld label="Ort" wert={f.ort} onChange={(w) => setz({ ort: w })} />
          <Feld label="Telefon" wert={f.telefon} onChange={(w) => setz({ telefon: w })} />
          <Feld label="E-Mail" wert={f.email} onChange={(w) => setz({ email: w })} />
          <Feld label="Webseite" wert={f.webseite} onChange={(w) => setz({ webseite: w })} />
          <Feld label="USt-IdNr." wert={f.ust_id} onChange={(w) => setz({ ust_id: w })} />
          <Feld label="Steuernummer" wert={f.steuernummer} onChange={(w) => setz({ steuernummer: w })} />
        </div>
      </div>

      <div className="admin-card">
        <h4 style={{ margin: 0 }}>Bankverbindung</h4>
        <p className="small" style={{ marginTop: 2 }}>
          Steht in der Fußzeile und ist die Grundlage des Zahlcodes (Girocode) auf der Rechnung.
          Ohne IBAN wird kein Code gedruckt – ein Code ohne Konto wäre schlimmer als keiner.
        </p>
        <div className="bd-raster">
          <Feld label="Kontoinhaber" wert={f.kontoinhaber} onChange={(w) => setz({ kontoinhaber: w })} />
          <Feld label="Bank" wert={f.bank} onChange={(w) => setz({ bank: w })} />
          <Feld label="IBAN" wert={f.iban} onChange={(w) => setz({ iban: w })} breit />
          <Feld label="BIC" wert={f.bic} onChange={(w) => setz({ bic: w })}
            hinweis="Innerhalb des SEPA-Raums nicht nötig." />
        </div>
      </div>

      <div className="admin-card">
        <h4 style={{ margin: 0 }}>Logo</h4>
        <p className="small" style={{ marginTop: 2 }}>
          Erscheint oben rechts im Briefkopf. PNG mit durchsichtigem Hintergrund, etwa 300 Pixel
          breit – größer bringt beim Druck nichts und bläht jede Rechnung auf.
        </p>
        <div className="bd-logo">
          <div className="bd-logo-feld">
            {/* Eine data:-URI aus der Datenbank: next/image optimiert daran nichts und
                verlangt feste Maße, die ein Logo je nach Hoch- oder Querformat gerade nicht
                hat – deshalb ein gewöhnliches Bild. */}
            {f.logo ? <img src={f.logo} alt="Logo" /> : <span className="small">Kein Logo hinterlegt.</span>}
          </div>
          <div className="bd-logo-knoepfe">
            <input
              ref={dateiFeld} type="file" accept={LOGO_TYPEN.join(",")} style={{ display: "none" }}
              onChange={(e) => { const d = e.target.files?.[0]; if (d) logoLesen(d); e.target.value = ""; }}
            />
            <button type="button" className="btn-secondary btn-rand" onClick={() => dateiFeld.current?.click()}>
              {f.logo ? "Anderes Logo wählen" : "Logo wählen"}
            </button>
            {f.logo && (
              <button type="button" className="btn-secondary btn-rand" onClick={() => setz({ logo: "" })}>
                Entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h4 style={{ margin: 0 }}>Texte auf der Rechnung</h4>
        <p className="small" style={{ marginTop: 2 }}>
          Sie gehören dem Betrieb und nicht der Anwendung – deshalb stehen sie hier und nicht
          im Programm.
        </p>
        <div className="bd-raster">
          <Feld label="Anschreiben" wert={f.anschreiben} onChange={(w) => setz({ anschreiben: w })} breit mehrzeilig={5}
            platzhalter={"Sehr geehrte Damen und Herren\n\nvielen Dank für Ihren Auftrag …"}
            hinweis="Steht zwischen Anschrift und Positionstabelle. Leerzeilen bleiben erhalten." />
          <Feld label="Fußzeile: Zahlung" wert={f.fuss_zahlung} onChange={(w) => setz({ fuss_zahlung: w })} breit
            platzhalter="Zahlbar nach Erhalt der Rechnung" />
          <Feld label="Fußzeile: Hinweis" wert={f.fuss_hinweis} onChange={(w) => setz({ fuss_hinweis: w })} breit mehrzeilig={3}
            platzhalter="Bitte denken Sie daran die Radschrauben nach 50 Kilometern nachzuziehen …" />
          <Feld label="Fußzeile: Dank" wert={f.fuss_dank} onChange={(w) => setz({ fuss_dank: w })} breit mehrzeilig={3}
            platzhalter="Wir bedanken uns für Ihren Auftrag …" />
        </div>
      </div>

      <div className="admin-card">
        <h4 style={{ margin: 0 }}>Der Nummernkreis</h4>
        <div className="bd-raster">
          <Feld label="Präfix" wert={f.rechnung_praefix} onChange={(w) => setz({ rechnung_praefix: w })}
            hinweis={`Ergibt zum Beispiel ${(f.rechnung_praefix || "RE") + betrieb.rechnung_naechste_nummer}.`} />
        </div>
        <div className="bd-nummer">
          <div>
            <b>Nächste Rechnungsnummer: {betrieb.rechnung_praefix}{betrieb.rechnung_naechste_nummer}</b>
            <div className="small">
              Zählt die Datenbank selbst hoch. Von Hand gesetzt wird sie genau einmal: bei der
              Übernahme aus dem Altsystem.
              {hoechsteVergebene != null && <> Zuletzt vergeben: <b>{praefix}{hoechsteVergebene}</b>.</>}
            </div>
          </div>
          {hoechsteVergebene === undefined ? (
            <span className="small">prüft …</span>
          ) : richtigeNummer != null && kreisStimmt ? (
            // Es gibt Belege und der Zähler steht richtig: Dann gibt es nichts zu ändern – jede
            // andere Zahl wäre eine Doppelvergabe oder eine Lücke.
            <span className="small">fest – es gibt bereits Rechnungen</span>
          ) : richtigeNummer != null ? (
            // Der Zähler passt nicht zum Bestand (etwa weil er vor Migration 55 von Hand gesetzt
            // wurde). Dann gibt es genau eine Korrektur, und die bietet der Knopf an.
            <button type="button" className="btn-primary" onClick={() => void nummernkreisSetzen(richtigeNummer)}>
              Auf {praefix}{richtigeNummer} korrigieren
            </button>
          ) : nummerOffen ? (
            <span className="bd-nummer-eingabe">
              <input type="number" min={1} className="feld-kompakt" value={nummer} onChange={(e) => setNummer(e.target.value)} />
              <button type="button" className="btn-primary" disabled={!!eingabeFehler} onClick={() => void nummernkreisSetzen()}>Setzen</button>
              <button type="button" className="btn-secondary btn-rand" onClick={() => { setNummer(String(betrieb.rechnung_naechste_nummer)); setNummerOffen(false); }}>Abbrechen</button>
            </span>
          ) : (
            <button type="button" className="btn-secondary btn-rand" onClick={() => setNummerOffen(true)}>Ändern</button>
          )}
        </div>
        {richtigeNummer != null && !kreisStimmt && (
          <div className="hinweis-pflicht" style={{ marginTop: 6 }}>
            Der Zähler steht auf {praefix}{betrieb.rechnung_naechste_nummer}, zuletzt vergeben wurde
            aber {praefix}{hoechsteVergebene}. Die nächste Rechnung muss {praefix}{richtigeNummer} sein.
          </div>
        )}
        {eingabeFehler && nummer.trim() !== "" && (
          <div className="hinweis-pflicht" style={{ marginTop: 6 }}>{eingabeFehler}</div>
        )}
        {nummerOffen && (
          <div className="hinweis-pflicht" style={{ marginTop: 6 }}>
            Eine bereits vergebene Nummer ein zweites Mal zu vergeben, bekommt man nachträglich
            nicht mehr auseinander. Und eine übersprungene Nummer ist eine Lücke im Kreis, die
            bei der nächsten Prüfung erklärt werden will.
          </div>
        )}
      </div>

      {fehler && <div className="hinweis-pflicht">{fehler}</div>}

      <div className="bd-speichern">
        <button type="button" className="btn-primary" disabled={stand === "speichert"} onClick={() => void speichern()}>
          {stand === "speichert" ? "Speichert …" : "Briefkopf speichern"}
        </button>
        {stand === "gespeichert" && <span className="small" style={{ color: "var(--green)" }}>Gespeichert ✓</span>}
      </div>
    </div>
  );
}

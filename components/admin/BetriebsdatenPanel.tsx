import { useRef, useState, type ReactNode } from "react";
import type { Betrieb, BetriebFelder } from "@/lib/types";
import { LOGO_MAX_BYTES, LOGO_TYPEN } from "@/lib/constants";
import { nummernkreisFehler } from "@/lib/rechnung";
import { datevEinstellungFehler, type DatevEinstellung } from "@/lib/datev";

// Der Briefkopf (Migration 48). Was hier steht, steht auf jeder Rechnung, die das Haus
// verlässt – und zwar als ABSCHRIFT: Eine Rechnung von letztem Jahr behält den Briefkopf, den
// sie beim Ausstellen hatte. Wer hier die Anschrift korrigiert, ändert damit nichts an
// bereits ausgestellten Belegen. Genau so ist es richtig, und genau deshalb steht der Satz
// auch für den Benutzer unten in der Maske.
//
// Ein Formular mit Speichern-Knopf und nicht wie das Terminraster mit Sofortwirkung: Eine
// IBAN tippt man in mehreren Anläufen, und eine halb getippte IBAN darf nicht eine Sekunde
// lang die gültige sein.
//
// Seit 26.09.2026 (Entwurf U) eine Liste mit einer Zeile je Abschnitt; jede Zeile öffnet ein
// Blatt mit eigenem „Speichern". Ein langes Formular mit einem Knopf am Ende verleitete dazu,
// oben etwas zu ändern und unten nie anzukommen. Beim Öffnen eines Blattes wird der Entwurf aus
// dem gespeicherten Stand neu gefüllt – was in einem anderen Blatt verworfen wurde, reist so
// nicht still im nächsten Speichern mit.

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

type Abschnitt = "briefkopf" | "bank" | "logo" | "texte" | "nummernkreis" | "datev" | "terminraster";

function felderAus(b: Betrieb): Omit<BetriebFelder, keyof DatevEinstellung> {
  return {
    firma: b.firma, inhaber: b.inhaber, strasse: b.strasse,
    plz: b.plz, ort: b.ort, telefon: b.telefon, email: b.email,
    webseite: b.webseite, ust_id: b.ust_id, steuernummer: b.steuernummer,
    kontoinhaber: b.kontoinhaber, bank: b.bank, iban: b.iban, bic: b.bic,
    logo: b.logo, anschreiben: b.anschreiben,
    fuss_zahlung: b.fuss_zahlung, fuss_hinweis: b.fuss_hinweis, fuss_dank: b.fuss_dank,
    rechnung_praefix: b.rechnung_praefix,
  };
}

// Die DATEV-Angaben (Migration 59) als Text, solange getippt wird – eine Zahl, die gerade erst
// halb dasteht, ist noch keine. Beim Speichern werden sie umgewandelt und geprüft.
function datevTexteAus(b: Betrieb) {
  return {
    berater: b.datev_berater == null ? "" : String(b.datev_berater),
    mandant: b.datev_mandant == null ? "" : String(b.datev_mandant),
    wj: String(b.datev_wj_beginn_monat ?? 1),
    skl: String(b.datev_sachkontenlaenge ?? 4),
    skr: b.datev_skr ?? "03",
    k19: String(b.datev_konto_19 ?? 8400),
    k7: String(b.datev_konto_7 ?? 8300),
    k0: String(b.datev_konto_0 ?? 8200),
    basis: String(b.datev_debitor_basis ?? 0),
    sammel: String(b.datev_sammeldebitor ?? 69999),
  };
}

export function BetriebsdatenPanel({ betrieb, onSpeichern, onNummernkreis, hoechsteVergebene, terminrasterInfo, terminraster }: {
  betrieb: Betrieb;
  onSpeichern: (felder: BetriebFelder) => Promise<void>;
  // Getrennt vom Rest: Dieser eine Wert verschiebt einen Nummernkreis. Er gehört nicht in
  // dasselbe Formular wie eine Telefonnummer, die man nebenbei korrigiert.
  onNummernkreis: (nummer: number) => Promise<void>;
  // Die höchste bereits vergebene Nummer (null = noch keine Rechnung). `undefined` heißt: wird
  // noch geladen – dann bleibt der Knopf „Ändern" gesperrt, statt ohne Prüfung zu setzen.
  hoechsteVergebene: number | null | undefined;
  // Das Terminraster wirkt sofort und hat deshalb keinen Speichern-Knopf; sein Inhalt kommt
  // fertig aus dem Admin-Bereich, hier steht nur die Zeile dafür.
  terminrasterInfo: string;
  terminraster: ReactNode;
}) {
  const [f, setF] = useState(() => felderAus(betrieb));
  const [stand, setStand] = useState<"bereit" | "speichert" | "gespeichert">("bereit");
  const [d, setD] = useState(() => datevTexteAus(betrieb));
  const [blatt, setBlatt] = useState<Abschnitt | null>(null);
  const setzD = (teil: Partial<typeof d>) => { setD((alt) => ({ ...alt, ...teil })); setStand("bereit"); };
  const zahl = (t: string): number | null => (t.trim() === "" ? null : /^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN);
  const datev: DatevEinstellung = {
    datev_berater: zahl(d.berater), datev_mandant: zahl(d.mandant),
    datev_wj_beginn_monat: zahl(d.wj) ?? 1, datev_sachkontenlaenge: zahl(d.skl) ?? 4,
    datev_skr: d.skr === "04" ? "04" : "03",
    datev_konto_19: zahl(d.k19) ?? NaN, datev_konto_7: zahl(d.k7) ?? NaN, datev_konto_0: zahl(d.k0) ?? NaN,
    datev_debitor_basis: zahl(d.basis) ?? 0, datev_sammeldebitor: zahl(d.sammel) ?? NaN,
  };
  // Berater und Mandant dürfen leer sein (dann ist nur der Export gesperrt). Alles andere muss
  // eine Zahl sein, bevor gespeichert wird.
  const datevHinweise = datevEinstellungFehler(datev);
  const datevUngueltig = Object.entries(datev).some(([k, v]) => typeof v === "number" && Number.isNaN(v) && k !== "datev_skr");

  const [fehler, setFehler] = useState<string | null>(null);
  const [nummer, setNummer] = useState(String(betrieb.rechnung_naechste_nummer));
  const [nummerOffen, setNummerOffen] = useState(false);
  const dateiFeld = useRef<HTMLInputElement>(null);

  const setz = (teil: Partial<BetriebFelder>) => { setF((alt) => ({ ...alt, ...teil })); setStand("bereit"); };

  function oeffnen(a: Abschnitt) {
    setF(felderAus(betrieb));
    setD(datevTexteAus(betrieb));
    setNummer(String(betrieb.rechnung_naechste_nummer));
    setNummerOffen(false);
    setFehler(null);
    setStand("bereit");
    setBlatt(a);
  }

  const entwurfGeaendert =
    JSON.stringify(f) !== JSON.stringify(felderAus(betrieb)) || JSON.stringify(d) !== JSON.stringify(datevTexteAus(betrieb));

  function schliessen() {
    if (entwurfGeaendert && stand !== "speichert" && !window.confirm("Die Änderungen sind noch nicht gespeichert. Verwerfen?")) return;
    setBlatt(null);
  }

  async function speichern() {
    if (datevUngueltig) {
      setFehler("Bei den DATEV-Angaben steht etwas, das keine Zahl ist. Bitte nur Ziffern eintragen.");
      return;
    }
    setStand("speichert");
    setFehler(null);
    try {
      await onSpeichern({ ...f, ...datev });
      setStand("gespeichert");
      setBlatt(null);
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

  // Die Zeilen der Übersicht zeigen den GESPEICHERTEN Stand – nicht den Entwurf.
  const b = betrieb;
  const texte = ([["Anschreiben", b.anschreiben], ["Zahlung", b.fuss_zahlung], ["Hinweis", b.fuss_hinweis], ["Dank", b.fuss_dank]] as const)
    .filter(([, t]) => (t ?? "").trim() !== "").map(([n]) => n);
  const datevGespeichert = datevEinstellungFehler(b);
  const zeilen: { a: Abschnitt; titel: string; info: string; warn?: boolean }[] = [
    { a: "briefkopf", titel: "Briefkopf",
      info: b.firma.trim() ? [b.firma, b.ort, b.ust_id.trim() || b.steuernummer.trim() ? "Steuerangabe ✓" : "ohne USt-IdNr./Steuernummer"].filter(Boolean).join(" · ") : "Firma fehlt – ohne sie keine Rechnung",
      warn: !b.firma.trim() },
    { a: "bank", titel: "Bankverbindung",
      info: b.iban.trim() ? `IBAN …${b.iban.replace(/\s/g, "").slice(-4)} · Girocode an` : "keine IBAN – kein Girocode auf der Rechnung", warn: !b.iban.trim() },
    { a: "logo", titel: "Logo", info: b.logo ? `hinterlegt · ${Math.max(1, Math.round((b.logo.length * 3) / 4 / 1024))} kB` : "kein Logo" },
    { a: "texte", titel: "Texte auf der Rechnung", info: texte.length ? texte.join(", ") : "noch keine eigenen Texte" },
    { a: "nummernkreis", titel: "Nummernkreis",
      info: hoechsteVergebene === undefined ? `nächste ${praefix}${b.rechnung_naechste_nummer} · prüft …`
        : !kreisStimmt ? `Zähler passt nicht – nächste muss ${praefix}${richtigeNummer} sein`
        : `nächste ${praefix}${b.rechnung_naechste_nummer}${richtigeNummer != null ? " · fest" : ""}`,
      warn: !kreisStimmt },
    { a: "datev", titel: "DATEV-Export",
      info: datevGespeichert.length ? (b.datev_berater == null || b.datev_mandant == null ? "Berater- oder Mandantennummer fehlt – Export gesperrt" : "Angaben unvollständig – Export gesperrt")
        : `Berater ${b.datev_berater} · Mandant ${b.datev_mandant} · SKR${b.datev_skr}`,
      warn: datevGespeichert.length > 0 },
    { a: "terminraster", titel: "Terminraster", info: terminrasterInfo },
  ];
  const titel = zeilen.find((z) => z.a === blatt)?.titel ?? "";

  const speichernKnopf = (
    <>
      {fehler && <div className="hinweis-pflicht">{fehler}</div>}
      <button type="button" className="am-knopf" disabled={stand === "speichert" || !entwurfGeaendert} onClick={() => void speichern()}>
        {stand === "speichert" ? "Speichert …" : entwurfGeaendert ? "Speichern" : "Nichts geändert"}
      </button>
    </>
  );

  return (
    <div className="betriebsdaten">
      <div className="db-karte ad-liste">
        {zeilen.map((z) => (
          <button key={z.a} type="button" className="ad-zeile" onClick={() => oeffnen(z.a)}>
            <span className="ad-zeile-text">
              <b>{z.titel}</b>
              <span className={"small" + (z.warn ? " ad-warn" : "")}>{z.info}</span>
            </span>
            <span className="ad-pfeil" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <span className="small ad-hilfe">
        Was hier steht, steht auf jeder neuen Rechnung. Bereits ausgestellte Rechnungen behalten ihren
        alten Briefkopf – eine Rechnung ist ein Beleg und ändert sich nicht rückwirkend.
        {stand === "gespeichert" && <b className="ad-ok"> Gespeichert ✓</b>}
      </span>

      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={schliessen}>
          <div className="auswahl-blatt am-breit ad-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titel}>
            <div className="ab-griff" />
            <div className="ar-blatt-kopf">
              <div className="ab-titel">{titel}</div>
              <button type="button" className="modal-close" onClick={schliessen} aria-label="Schließen">×</button>
            </div>

            {blatt === "briefkopf" && (
              <>
                <span className="small">Der Absender auf jeder Rechnung.</span>
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
                {speichernKnopf}
              </>
            )}

            {blatt === "bank" && (
              <>
                <span className="small">
                  Steht in der Fußzeile und ist die Grundlage des Zahlcodes (Girocode) auf der Rechnung.
                  Ohne IBAN wird kein Code gedruckt – ein Code ohne Konto wäre schlimmer als keiner.
                </span>
                <div className="bd-raster">
                  <Feld label="Kontoinhaber" wert={f.kontoinhaber} onChange={(w) => setz({ kontoinhaber: w })} />
                  <Feld label="Bank" wert={f.bank} onChange={(w) => setz({ bank: w })} />
                  <Feld label="IBAN" wert={f.iban} onChange={(w) => setz({ iban: w })} breit />
                  <Feld label="BIC" wert={f.bic} onChange={(w) => setz({ bic: w })}
                    hinweis="Innerhalb des SEPA-Raums nicht nötig." />
                </div>
                {speichernKnopf}
              </>
            )}

            {blatt === "logo" && (
              <>
                <span className="small">
                  Erscheint oben rechts im Briefkopf. PNG mit durchsichtigem Hintergrund, etwa 300 Pixel
                  breit – größer bringt beim Druck nichts und bläht jede Rechnung auf.
                </span>
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
                      onChange={(e) => { const datei = e.target.files?.[0]; if (datei) logoLesen(datei); e.target.value = ""; }}
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
                {speichernKnopf}
              </>
            )}

            {blatt === "texte" && (
              <>
                <span className="small">
                  Sie gehören dem Betrieb und nicht der Anwendung – deshalb stehen sie hier und nicht
                  im Programm.
                </span>
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
                {speichernKnopf}
              </>
            )}

            {blatt === "nummernkreis" && (
              <>
                <div className="bd-raster">
                  <Feld label="Präfix" wert={f.rechnung_praefix} onChange={(w) => setz({ rechnung_praefix: w })}
                    hinweis={`Ergibt zum Beispiel ${(f.rechnung_praefix || "RE") + betrieb.rechnung_naechste_nummer}. Wird mit „Speichern" übernommen.`} />
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
                  <div className="hinweis-pflicht">
                    Der Zähler steht auf {praefix}{betrieb.rechnung_naechste_nummer}, zuletzt vergeben wurde
                    aber {praefix}{hoechsteVergebene}. Die nächste Rechnung muss {praefix}{richtigeNummer} sein.
                  </div>
                )}
                {eingabeFehler && nummer.trim() !== "" && (
                  <div className="hinweis-pflicht">{eingabeFehler}</div>
                )}
                {nummerOffen && (
                  <div className="hinweis-pflicht">
                    Eine bereits vergebene Nummer ein zweites Mal zu vergeben, bekommt man nachträglich
                    nicht mehr auseinander. Und eine übersprungene Nummer ist eine Lücke im Kreis, die
                    bei der nächsten Prüfung erklärt werden will.
                  </div>
                )}
                {speichernKnopf}
              </>
            )}

            {blatt === "datev" && (
              <>
                <span className="small">
                  Für den Buchungsstapel unter Auswertungen → Export. Berater- und Mandantennummer kommen
                  vom Steuerberater; solange eine fehlt, bleibt der Export gesperrt. Kontenrahmen SKR03, je
                  Kunde ein Debitorenkonto (entschieden am 26.09.2026). Die erste Datei bitte einmal vom
                  Steuerberater probeweise einlesen lassen.
                </span>
                <div className="bd-raster">
                  <Feld label="Beraternummer" wert={d.berater} onChange={(w) => setzD({ berater: w })} platzhalter="z. B. 1234567" />
                  <Feld label="Mandantennummer" wert={d.mandant} onChange={(w) => setzD({ mandant: w })} platzhalter="z. B. 12345" />
                  <Feld label="Wirtschaftsjahr beginnt im Monat" wert={d.wj} onChange={(w) => setzD({ wj: w })} hinweis="1 = Januar (Kalenderjahr)." />
                  <Feld label="Sachkontenlänge" wert={d.skl} onChange={(w) => setzD({ skl: w })} hinweis="Üblich: 4. Debitoren haben dann 5 Stellen." />
                  <div className="bd-feld">
                    <label>Kontenrahmen</label>
                    <select value={d.skr} onChange={(e) => setzD({ skr: e.target.value as "03" | "04" })}>
                      <option value="03">SKR03</option>
                      <option value="04">SKR04</option>
                    </select>
                  </div>
                  <Feld label="Erlöskonto 19 %" wert={d.k19} onChange={(w) => setzD({ k19: w })} hinweis="SKR03: 8400 (Automatikkonto)." />
                  <Feld label="Erlöskonto 7 %" wert={d.k7} onChange={(w) => setzD({ k7: w })} hinweis="SKR03: 8300." />
                  <Feld label="Erlöskonto 0 %" wert={d.k0} onChange={(w) => setzD({ k0: w })} hinweis="Mit dem Steuerberater abstimmen." />
                  <Feld label="Debitor = Kundennummer +" wert={d.basis} onChange={(w) => setzD({ basis: w })}
                    hinweis="0: Die Kundennummern beginnen bei 10000 und sind schon Debitorenkonten." />
                  <Feld label="Sammeldebitor" wert={d.sammel} onChange={(w) => setzD({ sammel: w })} hinweis="Für Rechnungen ohne Kundennummer." />
                </div>
                {datevHinweise.length > 0 && (
                  <div className="small" style={{ color: "var(--muted)" }}>
                    Vor dem ersten Export: {datevHinweise.join(" ")}
                  </div>
                )}
                {speichernKnopf}
              </>
            )}

            {blatt === "terminraster" && terminraster}
          </div>
        </div>
      )}
    </div>
  );
}

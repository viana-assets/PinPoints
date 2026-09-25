import { useState } from "react";
import { AdressFeld } from "@/components/AdressFeld";
import type { Customer } from "@/lib/types";

// Formular "Neuer Kunde".
//
// Es hat GENAU DIESELBEN Felder wie das Kundenfenster – Firma, Anrede, Name, Adresse,
// Rufnummern, E-Mail, Notiz. Vorher fehlten hier Firma, Anrede und E-Mail: ein Kunde, den man
// hier anlegte, musste anschließend noch einmal geöffnet werden, um zu vervollständigen, was
// beim Anlegen schon bekannt war.
//
// Der frühere Block "Gleich einen Auftrag anlegen" (Titel, Beschreibung, Datum, Uhrzeit,
// Mitarbeiter) ist entfallen. Er war die dritte von vier verschiedenen Masken für dieselbe
// Sache und konnte als einzige keine Leistungen erfassen. An seiner Stelle steht ein
// Ankreuzfeld: ist es gesetzt, öffnet sich nach dem Anlegen das vollständige Auftragsfenster –
// dasselbe wie überall sonst. Siehe docs/auftragsablauf.md.
export function AddCustomerForm({ onAdd, terminText, laufkundschaftName = null, kunden, onOpenKunde, onZurLaufkundschaft, darfTestkunde = false }: {
  // Nur der Superadmin legt Testkunden an (Migration 60, `pruefe_testkunde()`). Die Datenbank
  // prüft es ohnehin; der Schalter erscheint nur, wo er auch wirkt.
  darfTestkunde?: boolean;
  // Alle Kunden (auch deaktivierte) für den Hinweis „Gibt es schon?" und der Weg dorthin.
  kunden?: Customer[];
  onOpenKunde?: (id: string) => void;
  // Öffnet die vorhandene Laufkundschaft (dort wird der Barverkauf als Auftrag angelegt).
  onZurLaufkundschaft?: () => void;
  // Name der schon vorhandenen Laufkundschaft, sonst null. Es gibt sie höchstens einmal
  // (Migration 53) – ist sie da, bleibt das Kästchen gesperrt und sagt, wo sie zu finden ist.
  // Vorher lief man in die rohe Datenbankmeldung „customers_eine_laufkundschaft".
  laufkundschaftName?: string | null;
  // Kommt der Weg aus dem Kalender, wartet dort schon ein angeklickter Termin. Dann ist das
  // Ankreuzfeld von vornherein gesetzt und nennt den Termin: Wer den Haken hier übersähe,
  // verlöre den Zeitpunkt, den er zwei Klicks vorher ausgewählt hat – und merkte es erst,
  // wenn der Auftrag im Kalender an der falschen Stelle steht.
  terminText?: string;
  onAdd: (f: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    company: string; email: string; anrede: "" | "Herr" | "Frau";
    koordinate: { lat: number; lng: number } | null;
    auftragAnlegen: boolean;
    laufkundschaft: boolean;
    einmalkunde: boolean;
    testkunde: boolean;
  }) => Promise<boolean>;
}) {
  const [company, setCompany] = useState("");
  const [anrede, setAnrede] = useState<"" | "Herr" | "Frau">("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [koordinate, setKoordinate] = useState<{ lat: number; lng: number } | null>(null);
  const [mobile, setMobile] = useState("");
  const [landline, setLandline] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [auftragAnlegen, setAuftragAnlegen] = useState(!!terminText);
  // Der Sammelkunde für Barverkäufe (Migration 53). Er wird genau einmal angelegt – deshalb
  // steht das Kästchen unten bei den Ausnahmen und nicht oben bei den Feldern.
  const [laufkundschaft, setLaufkundschaft] = useState(false);
  // Einmalkunde (Migration 57): Anschrift wie jeder andere, aber ohne Nadel und ohne Platz in der
  // Anrufliste – außer solange ein Termin vor ihm liegt. Schließt die Laufkundschaft aus.
  const [einmalkunde, setEinmalkunde] = useState(false);
  const [testkunde, setTestkunde] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  // Privat oder Firma – nur die Anzeige des Firmenfelds; gespeichert wird wie bisher `company`.
  const [firma, setFirma] = useState(false);
  // „Laufkundschaft" angetippt, obwohl es sie schon gibt: dann steht statt des Formulars der Weg dorthin.
  const [laufAnsicht, setLaufAnsicht] = useState(false);
  const [busy, setBusy] = useState(false);

  function leeren() {
    setCompany(""); setAnrede(""); setName(""); setAddress(""); setKoordinate(null);
    setMobile(""); setLandline(""); setEmail(""); setNote(""); setAuftragAnlegen(false);
    setLaufkundschaft(false); setEinmalkunde(false); setTestkunde(false); setFirma(false); setLaufAnsicht(false);
  }

  async function speichern() {
    // Die Adresse ist Pflicht – außer bei der Laufkundschaft. Sie ist der eine Kunde, der
    // definitionsgemäß keine hat: der Anruf von der Autobahn, der jedes Mal woanders steht.
    // Ohne diese Ausnahme müsste man eine erfundene Adresse eintippen, und die stünde dann
    // für immer im Datensatz – vermutlich sogar mit einer Nadel irgendwo auf der Karte.
    if (!name.trim() || (!address.trim() && !laufkundschaft)) {
      setStatus({ text: "Bitte Name und Adresse angeben.", ok: false });
      return;
    }
    setBusy(true);
    // Nur wenn die Adresse von Hand getippt wurde, muss noch nachgeschlagen werden – bei einem
    // angenommenen Vorschlag liegt die Koordinate schon vor.
    setStatus({ text: koordinate || laufkundschaft ? "Wird angelegt …" : "Suche Adresse auf der Karte …", ok: true });
    let gefunden: boolean;
    try {
      gefunden = await onAdd({
        name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(),
        phone_landline: landline.trim(), note: note.trim(),
        company: company.trim(), email: email.trim(), anrede,
        koordinate, auftragAnlegen, laufkundschaft, einmalkunde: einmalkunde && !laufkundschaft,
        testkunde: testkunde && darfTestkunde && !laufkundschaft,
      });
    } catch (grund) {
      // Ein Fehler darf den Knopf nicht auf „Wird angelegt …" stehen lassen. Die Eingaben
      // bleiben stehen, damit nichts neu getippt werden muss.
      setBusy(false);
      const text = String(grund instanceof Error ? grund.message : grund);
      setStatus({
        text: text.includes("customers_eine_laufkundschaft")
          ? "Die Laufkundschaft gibt es schon – bitte den Auftrag dort anlegen und den Namen im Auftrag eintragen."
          : text,
        ok: false,
      });
      return;
    }
    setBusy(false);
    leeren();
    setStatus(laufkundschaft
      ? { text: "Laufkundschaft angelegt – ohne Anschrift und ohne Nadel auf der Karte.", ok: true }
      : einmalkunde && gefunden
      ? { text: "Einmalkunde angelegt – eine Nadel erscheint nur, solange ein Termin ansteht.", ok: true }
      : gefunden
      ? { text: "Kunde angelegt und auf der Karte platziert.", ok: true }
      : { text: "Kunde angelegt – Adresse nicht gefunden, er liegt unter „Ohne Karte“.", ok: false });
  }

  const art: "kunde" | "einmal" | "lauf" = laufkundschaft ? "lauf" : einmalkunde ? "einmal" : "kunde";
  function setzeArt(a: "kunde" | "einmal" | "lauf") {
    setLaufkundschaft(a === "lauf" && laufkundschaftName === null);
    setEinmalkunde(a === "einmal");
    setLaufAnsicht(a === "lauf");
    setStatus(null);
  }
  const zeigeLaufGibtEs = laufAnsicht && laufkundschaftName !== null;

  // „Gibt es schon?" (26.09.2026): ab vier Zeichen die Kunden, deren Name oder Firma so beginnt
  // oder das Getippte enthält – auch deaktivierte. Nur ein Hinweis; angelegt werden darf trotzdem.
  const q = name.trim().toLowerCase();
  const aehnlich = q.length >= 4 && kunden
    ? kunden.filter((k) => !k.laufkundschaft && [k.name, k.company ?? ""].some((x) => x.toLowerCase().includes(q))).slice(0, 2)
    : [];
  const ARTEN: { wert: "kunde" | "einmal" | "lauf"; text: string }[] = [
    { wert: "kunde", text: "Kunde" }, { wert: "einmal", text: "Einmalkunde" }, { wert: "lauf", text: "Laufkundschaft" },
  ];
  const HILFE = {
    kunde: "Bekommt eine Nadel auf der Karte und steht in der Anrufliste.",
    einmal: "Mit Anschrift wie jeder andere, aber ohne Nadel und ohne Platz in der Anrufliste – außer solange ein Termin vor ihm liegt. Kommt er doch wieder, im Kundenfenster umstellen.",
    lauf: "Sammelkunde für Barverkäufe ohne Kundenanlage (§ 33 UStDV, bis 250 € brutto): keine Adresse, keine Nadel, beim Abschließen keine Pflicht zu Anschrift oder Fahrzeug. Es gibt ihn nur einmal.",
  };
  const bereit = !!name.trim() && (!!address.trim() || laufkundschaft);

  // Neu gestaltet am 26.09.2026 (Entwurf „R · Neuer Kunde"): Die Art des Kunden steht als
  // Umschalter oben statt als zwei Ankreuzfelder unten, Privat/Firma als zweiter Umschalter,
  // die Felder in Karten, der Knopf bleibt unten stehen.
  return (
    <div className="tabpanel active">
      <div className="nk-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Neuer Kunde</h2>
              <span className="lg-unter">{terminText ? `für den Termin ${terminText}` : "Kundennummer vergibt die Datenbank"}</span>
            </div>
          </div>
          <div className="lg-lagerwahl nk-art" role="group" aria-label="Art des Kunden">
            {ARTEN.map((a) => (
              <button key={a.wert} type="button" className={art === a.wert || (a.wert === "lauf" && zeigeLaufGibtEs) ? "aktiv" : ""}
                aria-pressed={art === a.wert} onClick={() => setzeArt(a.wert)}>{a.text}</button>
            ))}
          </div>
        </div>

        <span className="small nk-hilfe">{HILFE[zeigeLaufGibtEs ? "lauf" : art]}</span>

        {zeigeLaufGibtEs ? (
          <div className="db-karte nk-karte">
            <span className="db-karte-titel">Laufkundschaft gibt es schon</span>
            <span className="small">„{laufkundschaftName}“. Einen Barverkauf dort als Auftrag anlegen – Name, Telefon und Einsatzort des Laufkunden stehen dann am Auftrag.</span>
            {onZurLaufkundschaft && <button type="button" className="am-knopf" onClick={onZurLaufkundschaft}>Laufkundschaft öffnen</button>}
          </div>
        ) : (
          <>
            <div className="db-karte nk-karte">
              {!laufkundschaft && (
                <div className="lg-lagerwahl nk-typ" role="group" aria-label="Privat oder Firma">
                  <button type="button" className={!firma ? "aktiv" : ""} onClick={() => { setFirma(false); setCompany(""); }}>Privat</button>
                  <button type="button" className={firma ? "aktiv" : ""} onClick={() => setFirma(true)}>Firma</button>
                </div>
              )}
              {firma && (
                <label className="nk-feld"><span>Firma</span>
                  <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="z. B. Müller GmbH" />
                </label>
              )}
              <div className="nk-zeile">
                <label className="nk-feld nk-anrede"><span>Anrede</span>
                  <select value={anrede} onChange={(e) => setAnrede(e.target.value as "" | "Herr" | "Frau")}>
                    <option value="">–</option>
                    <option value="Herr">Herr</option>
                    <option value="Frau">Frau</option>
                  </select>
                </label>
                <label className="nk-feld"><span>{firma ? "Ansprechpartner *" : "Name *"}</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" />
                </label>
              </div>
              {aehnlich.map((k) => (
                <div key={k.id} className="nk-dublette">
                  <span className="db-punkt-text">
                    <b>Gibt es schon? {(k.company || "").trim() || k.name}{k.active === false ? " (deaktiviert)" : ""}</b>
                    <span>{[k.address, k.kundennummer != null ? `Kd.-Nr. ${k.kundennummer}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  {onOpenKunde && <button type="button" className="db-link" onClick={() => onOpenKunde(k.id)}>Öffnen ›</button>}
                </div>
              ))}
              {!laufkundschaft && (
                <div className="nk-feld"><span>Adresse *</span>
                  <AdressFeld
                    wert={address}
                    onChange={(v) => { setAddress(v); setKoordinate(null); }}
                    onVorschlagGewaehlt={(v) => setKoordinate({ lat: v.lat, lng: v.lng })}
                    platzhalter="Straße Hausnummer, PLZ Ort"
                  />
                  {koordinate && <span className="nk-ok">📍 Position übernommen</span>}
                </div>
              )}
            </div>

            <div className="db-karte nk-karte">
              <span className="db-karte-titel">Erreichbar unter</span>
              <div className="nk-zeile">
                <label className="nk-feld"><span>Mobil</span><input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0151 …" /></label>
                <label className="nk-feld"><span>Festnetz</span><input type="tel" value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="0911 …" /></label>
              </div>
              <label className="nk-feld"><span>E-Mail – für Rechnungen</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" /></label>
              <label className="nk-feld"><span>Notiz</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Hof hinten, Hund" /></label>
            </div>

            <button type="button" className="sl-chance nk-schalter" aria-pressed={auftragAnlegen} onClick={() => setAuftragAnlegen(!auftragAnlegen)}>
              <span className="db-punkt-text">
                <span className="db-punkt-titel">Gleich einen Auftrag anlegen</span>
                <span className="small">{terminText ? `${terminText} – das Auftragsfenster öffnet sich danach` : "Das Auftragsfenster öffnet sich danach"}</span>
              </span>
              <span className={"nk-spur" + (auftragAnlegen ? " an" : "")} aria-hidden="true"><span /></span>
            </button>

            {/* Testkunde (Migration 60): Aufträge „T1…", Rechnungen „T-RE1…", keine
                Kundennummer, restlos löschbar – die echten Nummernkreise bleiben unberührt. */}
            {darfTestkunde && !laufkundschaft && (
              <button type="button" className={"sl-chance nk-schalter nk-test" + (testkunde ? " an" : "")} aria-pressed={testkunde} onClick={() => setTestkunde(!testkunde)}>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Testkunde <span className="test-marke">TEST</span></span>
                  <span className="small">Zum Ausprobieren: Aufträge T1, T2 …, Rechnungen T-RE1 …, keine Kundennummer. Zählt in keiner Auswertung und lässt sich restlos löschen.</span>
                </span>
                <span className={"nk-spur" + (testkunde ? " an" : "")} aria-hidden="true"><span /></span>
              </button>
            )}
          </>
        )}

        {status && <div className={status.ok ? "login-info" : "login-error"}>{status.text}</div>}

        {!zeigeLaufGibtEs && (
          <div className="nk-fuss">
            {!bereit && <span className="small">Name{laufkundschaft ? "" : " und Adresse"} sind Pflicht</span>}
            <button type="button" className="am-knopf nk-knopf" disabled={busy} onClick={speichern}>
              {busy ? "Wird angelegt …" : laufkundschaft ? "Laufkundschaft anlegen" : testkunde && darfTestkunde ? (auftragAnlegen ? "Testkunde anlegen & Auftrag öffnen" : "Testkunde anlegen") : auftragAnlegen ? "Kunde anlegen & Auftrag öffnen" : "Kunde anlegen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

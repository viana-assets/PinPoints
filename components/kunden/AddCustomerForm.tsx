import { useState } from "react";
import { AdressFeld } from "@/components/AdressFeld";

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
export function AddCustomerForm({ onAdd, terminText }: {
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
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function leeren() {
    setCompany(""); setAnrede(""); setName(""); setAddress(""); setKoordinate(null);
    setMobile(""); setLandline(""); setEmail(""); setNote(""); setAuftragAnlegen(false);
    setLaufkundschaft(false);
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
    const gefunden = await onAdd({
      name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(),
      phone_landline: landline.trim(), note: note.trim(),
      company: company.trim(), email: email.trim(), anrede,
      koordinate, auftragAnlegen, laufkundschaft,
    });
    setBusy(false);
    leeren();
    setStatus(laufkundschaft
      ? { text: "Laufkundschaft angelegt – ohne Anschrift und ohne Nadel auf der Karte.", ok: true }
      : gefunden
      ? { text: "Kunde angelegt und auf der Karte platziert.", ok: true }
      : { text: "Kunde angelegt – Adresse nicht gefunden, er liegt unter „Ohne Karte“.", ok: false });
  }

  return (
    <div className="tabpanel active">
      <h3 style={{ marginTop: 0 }}>Neuer Kunde</h3>

      <div className="field"><label>Firma (leer bei Privatpersonen)</label>
        <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="z. B. Müller GmbH" />
      </div>
      <div className="row">
        <div className="field" style={{ flex: "0 0 110px" }}>
          <label>Anrede</label>
          <select value={anrede} onChange={(e) => setAnrede(e.target.value as "" | "Herr" | "Frau")}>
            <option value="">–</option>
            <option value="Herr">Herr</option>
            <option value="Frau">Frau</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{company ? "Ansprechpartner *" : "Name *"}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Anna Müller" />
        </div>
      </div>
      <div className="field">
        <label>{laufkundschaft ? "Adresse (bei Laufkundschaft nicht nötig)" : "Adresse * (Straße, PLZ Ort)"}</label>
        <AdressFeld
          wert={address}
          onChange={(v) => { setAddress(v); setKoordinate(null); }}
          onVorschlagGewaehlt={(v) => setKoordinate({ lat: v.lat, lng: v.lng })}
          platzhalter="z. B. Fürther Str. 12, 90429 Nürnberg"
        />
      </div>
      <div className="row">
        <div className="field"><label>Mobil (optional)</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0151 …" /></div>
        <div className="field"><label>Festnetz (optional)</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="0911 …" /></div>
      </div>
      <div className="field"><label>E-Mail (optional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Winterreifen 205/55 R16" /></div>

      {/* Die Laufkundschaft (Migration 53) – der einzige Kunde ohne Anschrift. Das Kästchen
          steht unten bei den Ausnahmen und nicht oben bei den Feldern: Es wird genau einmal
          gesetzt, und wer es versehentlich anklickt, legt keinen kaputten Kunden an, sondern
          einen, den es schon gibt (die Datenbank lässt keinen zweiten zu). */}
      <div className="checkbox-row erklaert">
        <input type="checkbox" id="istLaufkundschaft" checked={laufkundschaft}
               onChange={(e) => setLaufkundschaft(e.target.checked)} />
        <label htmlFor="istLaufkundschaft">
          <b>Laufkundschaft</b> – Sammelkunde für Barverkäufe ohne Kundenanlage
          <span className="small" style={{ display: "block" }}>
            Dann ist die Adresse nicht nötig: keine Nadel auf der Karte, kein Eintrag in der
            Anrufliste, und beim Abschließen fragt niemand nach Anschrift oder Fahrzeug.
            Es kann nur einen solchen Kunden geben.
          </span>
        </label>
      </div>

      <div className="checkbox-row">
        <input type="checkbox" id="gleichAuftrag" checked={auftragAnlegen} onChange={(e) => setAuftragAnlegen(e.target.checked)} />
        <label htmlFor="gleichAuftrag">
          {terminText
            ? `Direkt einen Auftrag anlegen – ${terminText} (das Auftragsfenster öffnet sich danach)`
            : "Direkt einen Auftrag anlegen (das Auftragsfenster öffnet sich danach)"}
        </label>
      </div>

      {status && <div className={status.ok ? "login-info" : "login-error"}>{status.text}</div>}

      <button className="btn-primary btn-block" disabled={busy} onClick={speichern}>
        {busy ? "Wird angelegt …" : "Kunde hinzufügen & auf Karte platzieren"}
      </button>
    </div>
  );
}

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
export function AddCustomerForm({ onAdd }: {
  onAdd: (f: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    company: string; email: string; anrede: "" | "Herr" | "Frau";
    koordinate: { lat: number; lng: number } | null;
    auftragAnlegen: boolean;
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
  const [auftragAnlegen, setAuftragAnlegen] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function leeren() {
    setCompany(""); setAnrede(""); setName(""); setAddress(""); setKoordinate(null);
    setMobile(""); setLandline(""); setEmail(""); setNote(""); setAuftragAnlegen(false);
  }

  async function speichern() {
    if (!name.trim() || !address.trim()) {
      setStatus({ text: "Bitte Name und Adresse angeben.", ok: false });
      return;
    }
    setBusy(true);
    // Nur wenn die Adresse von Hand getippt wurde, muss noch nachgeschlagen werden – bei einem
    // angenommenen Vorschlag liegt die Koordinate schon vor.
    setStatus({ text: koordinate ? "Wird angelegt …" : "Suche Adresse auf der Karte …", ok: true });
    const gefunden = await onAdd({
      name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(),
      phone_landline: landline.trim(), note: note.trim(),
      company: company.trim(), email: email.trim(), anrede,
      koordinate, auftragAnlegen,
    });
    setBusy(false);
    leeren();
    setStatus(gefunden
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
        <label>Adresse * (Straße, PLZ Ort)</label>
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

      <div className="checkbox-row">
        <input type="checkbox" id="gleichAuftrag" checked={auftragAnlegen} onChange={(e) => setAuftragAnlegen(e.target.checked)} />
        <label htmlFor="gleichAuftrag">Direkt einen Auftrag anlegen (das Auftragsfenster öffnet sich danach)</label>
      </div>

      {status && <div className={status.ok ? "login-info" : "login-error"}>{status.text}</div>}

      <button className="btn-primary btn-block" disabled={busy} onClick={speichern}>
        {busy ? "Wird angelegt …" : "Kunde hinzufügen & auf Karte platzieren"}
      </button>
    </div>
  );
}

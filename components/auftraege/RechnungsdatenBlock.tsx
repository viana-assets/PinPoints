import { useState } from "react";
import type { AuftragFahrzeug, Customer, Vehicle } from "@/lib/types";
import { rechnungsdatenMaengel } from "@/lib/helpers";

// Die Abhakliste, die erscheint, sobald „Rechnung benötigt" gesetzt ist (Migration 44).
//
// Sie zeigt, was für eine Rechnung noch fehlt – und zwar ALLES auf einmal. Wer dreimal
// hintereinander eine Meldung bekommt, die jeweils einen weiteren Mangel nennt, hält das
// Programm für schikanös, zu Recht.
//
// Was da ist, steht abgehakt und blass da statt zu verschwinden: „Anschrift ✓ Hauptstr. 1"
// beantwortet die Frage „ist das gepflegt?", eine leere Stelle beantwortet sie nicht. Genau
// dieselbe Überlegung wie bei den grauen Zellen in der Rechtematrix.
//
// Sie SPERRT nichts. Man darf den Haken setzen und die Angaben später ergänzen – unterwegs
// fehlt oft die E-Mail-Adresse. Verlangt werden sie erst beim Abschließen, und dort von der
// Datenbank (`pruefe_rechnungsdaten()`), nicht von dieser Anzeige.
// Eine Zeile der Abhakliste. Steht außerhalb der Hauptkomponente, nicht darin: Ein Bauteil,
// das bei jedem Rendern neu entsteht, behandelt React als neues Element und wirft seinen
// Zustand weg – hier wäre das der Fokus im Eingabefeld beim Tippen.
function Zeile({ erfuellt, titel, wert, children }: {
  erfuellt: boolean; titel: string; wert?: string | null; children?: React.ReactNode;
}) {
  return (
    <div className={"rd-zeile" + (erfuellt ? " erfuellt" : "")}>
      <span className="rd-haken" aria-hidden="true">{erfuellt ? "✓" : "○"}</span>
      <span className="rd-text">
        <b>{titel}</b>
        {wert && <span className="small">{wert}</span>}
        {children}
      </span>
    </div>
  );
}

export function RechnungsdatenBlock({
  kunde, fahrzeuge, alleFahrzeuge, gesperrt,
  onEmailSpeichern, onFahrzeugHinzufuegen, onFahrzeugAnlegen, onKilometerstand, onFahrzeugEntfernen,
}: {
  kunde: Customer | null;
  // Die Fahrzeuge DIESES Auftrags, angereichert um das zugehörige Fahrzeug.
  fahrzeuge: (AuftragFahrzeug & { fahrzeug: Vehicle | null })[];
  // Alle Fahrzeuge des Kunden – zur Auswahl.
  alleFahrzeuge: Vehicle[];
  gesperrt?: boolean;
  onEmailSpeichern: (email: string) => Promise<void>;
  onFahrzeugHinzufuegen: (vehicleId: string) => Promise<void>;
  onFahrzeugAnlegen: (kennzeichen: string) => Promise<void>;
  onKilometerstand: (id: string, km: number | null) => Promise<void>;
  onFahrzeugEntfernen: (id: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [neuesKennzeichen, setNeuesKennzeichen] = useState("");
  const [auswahl, setAuswahl] = useState("");

  const maengel = rechnungsdatenMaengel(
    kunde,
    fahrzeuge.map((f) => ({ kennzeichen: f.fahrzeug?.license_plate ?? null, kilometerstand: f.kilometerstand }))
  );
  const fehlt = (schluessel: string) => maengel.some((m) => m.schluessel === schluessel);
  const vollstaendig = maengel.length === 0;

  // Nur Fahrzeuge anbieten, die noch nicht am Auftrag stehen – ein Auto zweimal einzutragen
  // hieße zwei Kilometerstände für denselben Wagen am selben Tag, und die Datenbank lehnt es
  // ohnehin ab (Migration 44).
  const schonDran = new Set(fahrzeuge.map((f) => f.vehicle_id));
  const waehlbar = alleFahrzeuge.filter((v) => !schonDran.has(v.id));

  return (
    <div className={"rechnungsdaten" + (vollstaendig ? " vollstaendig" : "")}>
      <div className="rd-kopf">
        {vollstaendig
          ? "Für die Rechnung ist alles da."
          : `Für die Rechnung fehlt noch: ${maengel.map((m) => m.text).join(", ")}.`}
      </div>

      <Zeile erfuellt={!fehlt("name")} titel="Name" wert={kunde?.name || null} />
      <Zeile erfuellt={!fehlt("adresse")} titel="Anschrift" wert={kunde?.address || null}>
        {fehlt("adresse") && <span className="small">Im Kundenfenster ergänzen – dort hängt auch die Karte daran.</span>}
      </Zeile>

      <Zeile erfuellt={!fehlt("email")} titel="E-Mail-Adresse" wert={kunde?.email || null}>
        {fehlt("email") && !gesperrt && (
          <span className="rd-eingabe">
            <input
              type="email"
              className="feld-kompakt"
              placeholder="name@beispiel.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) { void onEmailSpeichern(email.trim()); setEmail(""); } }}
            />
            <button
              type="button" className="btn-secondary" disabled={!email.trim()}
              onClick={() => { void onEmailSpeichern(email.trim()); setEmail(""); }}
            >
              übernehmen
            </button>
            {/* Der Satz ist wichtig: Was hier eingetippt wird, landet beim Kunden und nicht
                nur an dieser Rechnung. Wer das nicht weiß, tippt beim nächsten Auftrag
                dieselbe Adresse noch einmal. */}
            <span className="small">Wird beim Kunden gespeichert.</span>
          </span>
        )}
      </Zeile>

      <div className="rd-fahrzeuge">
        <div className="rd-fahrzeuge-kopf">Fahrzeuge an diesem Auftrag</div>
        {fahrzeuge.length === 0 && <div className="small">Noch kein Fahrzeug eingetragen.</div>}
        {fahrzeuge.map((f, i) => {
          const kennzeichen = f.fahrzeug?.license_plate?.trim() || "";
          return (
            <div key={f.id} className="rd-fahrzeug">
              <span className="rd-nr">Fahrzeug {i + 1}</span>
              <span className="rd-kennzeichen">
                {kennzeichen || <i>ohne Kennzeichen</i>}
                {f.fahrzeug?.make_model && <span className="small"> · {f.fahrzeug.make_model}</span>}
              </span>
              <label className="rd-km">
                km
                <input
                  type="number" min={0} className="feld-kompakt" placeholder="Stand"
                  disabled={gesperrt}
                  defaultValue={f.kilometerstand ?? ""}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    // Leer heißt „noch nicht abgelesen" (null), nicht 0.
                    const wert = t === "" ? null : Math.round(parseFloat(t.replace(",", ".")));
                    if (wert !== f.kilometerstand && !(wert != null && isNaN(wert))) void onKilometerstand(f.id, wert);
                  }}
                />
              </label>
              {!gesperrt && (
                <button type="button" className="btn-secondary rd-weg" title="Fahrzeug vom Auftrag entfernen"
                  onClick={() => void onFahrzeugEntfernen(f.id)}>×</button>
              )}
            </div>
          );
        })}

        {!gesperrt && (
          <div className="rd-hinzu">
            {waehlbar.length > 0 && (
              <>
                <select value={auswahl} onChange={(e) => { setAuswahl(e.target.value); if (e.target.value) { void onFahrzeugHinzufuegen(e.target.value); setAuswahl(""); } }}>
                  <option value="">– weiteres Fahrzeug des Kunden –</option>
                  {waehlbar.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen"}
                    </option>
                  ))}
                </select>
                <span className="small">oder</span>
              </>
            )}
            <input
              type="text" className="feld-kompakt" placeholder="Neues Kennzeichen"
              value={neuesKennzeichen}
              onChange={(e) => setNeuesKennzeichen(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && neuesKennzeichen.trim()) { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); } }}
            />
            <button
              type="button" className="btn-secondary" disabled={!neuesKennzeichen.trim()}
              onClick={() => { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); }}
            >
              + anlegen
            </button>
            <span className="small">Neue Fahrzeuge werden beim Kunden hinterlegt.</span>
          </div>
        )}
      </div>
    </div>
  );
}

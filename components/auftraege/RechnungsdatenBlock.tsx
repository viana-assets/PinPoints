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
  kunde, fahrzeuge, gesperrt, darfKundeAendern, onEmailSpeichern,
}: {
  kunde: Customer | null;
  // Die Fahrzeuge DIESES Auftrags, angereichert um das zugehörige Fahrzeug. Nur zum PRÜFEN –
  // geändert werden sie im Block „Fahrzeug" weiter oben im Auftragsfenster (siehe
  // `FahrzeugeBlock`). Bis zum 21.09.2026 stand der Fahrzeug-Editor hier drin und war damit
  // hinter dem Rechnungshaken versteckt, während oben ein zweiter Auswahlkasten dieselbe
  // Frage ein zweites Mal stellte und in ein anderes Feld schrieb.
  fahrzeuge: (AuftragFahrzeug & { fahrzeug: Vehicle | null })[];
  gesperrt?: boolean;
  // Darf die aufrufende Rolle Kundenstammdaten ändern (`kunden.schreiben`)? Ein Techniker
  // darf das nicht – ihm hier ein Eingabefeld für die E-Mail-Adresse anzubieten hieße, ihn in
  // eine Fehlermeldung laufen zu lassen. Lieber ein ehrlicher Hinweis als ein totes Feld.
  darfKundeAendern: boolean;
  onEmailSpeichern: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");

  const maengel = rechnungsdatenMaengel(
    kunde,
    fahrzeuge.map((f) => ({ kennzeichen: f.fahrzeug?.license_plate ?? null, kilometerstand: f.kilometerstand }))
  );
  const fehlt = (schluessel: string) => maengel.some((m) => m.schluessel === schluessel);
  const vollstaendig = maengel.length === 0;

  // Was an den Fahrzeugen fehlt, wird hier nur GENANNT und nicht noch einmal zum Ändern
  // angeboten. Ein zweites Eingabefeld für dieselbe Sache wäre genau die Dopplung, die am
  // 18.09.2026 aufgefallen ist.
  const fahrzeugMangel = maengel.find((m) => m.schluessel === "fahrzeug" || m.schluessel === "kennzeichen");
  const kmMangel = maengel.find((m) => m.schluessel === "kilometerstand");

  // Laufkundschaft: Die ganze Prüfliste entfällt – es gibt keinen Empfänger und kein Fahrzeug,
  // nach dem zu fragen wäre. Statt einer Liste aus lauter Haken steht hier der Satz, der
  // erklärt, warum sie fehlt. Und die Grenze, die der Betrieb im Blick behalten muss: Die
  // Datenbank prüft die 250 Euro bewusst nicht (siehe Migration 53).
  if (kunde?.laufkundschaft) {
    return (
      <div className="rechnungsdaten vollstaendig">
        <div className="rd-kopf">Laufkundschaft – Barverkauf ohne Kundenanlage.</div>
        <div className="small" style={{ padding: "0 12px 10px" }}>
          Der Beleg ist eine Kleinbetragsrechnung: Name und Anschrift des Empfängers sind nicht
          erforderlich (§ 33 UStDV), die Umsatzsteuer wird trotzdem gerechnet. Die Grenze liegt
          bei <b>250 € brutto</b> – darüber braucht es einen richtigen Kunden mit Anschrift.
        </div>
      </div>
    );
  }

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
        {fehlt("email") && !gesperrt && darfKundeAendern && (
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
        {fehlt("email") && !darfKundeAendern && (
          <span className="small">Das Büro trägt sie im Kundenfenster nach.</span>
        )}
      </Zeile>

      <Zeile
        erfuellt={!fahrzeugMangel}
        titel="Fahrzeug"
        wert={fahrzeuge.length === 0
          ? null
          : fahrzeuge.map((f) => f.fahrzeug?.license_plate?.trim() || "ohne Kennzeichen").join(", ")}
      >
        {fahrzeugMangel && (
          <span className="small">
            {fahrzeugMangel.schluessel === "fahrzeug"
              ? "Oben im Block Fahrzeug eintragen."
              : "Kennzeichen fehlt – oben im Block Fahrzeug ergänzen."}
          </span>
        )}
      </Zeile>

      <Zeile
        erfuellt={!kmMangel}
        titel="Kilometerstand"
        wert={fahrzeuge.length === 0
          ? null
          : fahrzeuge.map((f) => (f.kilometerstand == null ? "–" : f.kilometerstand.toLocaleString("de-DE"))).join(", ")}
      >
        {kmMangel && <span className="small">Oben im Block Fahrzeug nachtragen.</span>}
      </Zeile>
    </div>
  );
}

import { useState } from "react";
import type { AuftragFahrzeug, Vehicle } from "@/lib/types";
import { doppelteKennzeichen, fahrzeugAuswahlText } from "@/lib/kennzeichen";
import { KennzeichenFeld } from "@/components/KennzeichenFeld";

// Die Fahrzeuge an einem Auftrag – welches Auto (oder welche Autos) wird bearbeitet, und mit
// welchem Kilometerstand.
//
// Bis zum 21.09.2026 gab es dafür ZWEI Stellen im Auftragsfenster: oben einen Auswahlkasten,
// der `orders.vehicle_id` schrieb, und weiter unten – nur sichtbar, wenn „Rechnung benötigt"
// gesetzt war – diese Liste, die auf `auftrag_fahrzeuge` arbeitet. Beide wurden beschrieben,
// keine glich sich mit der anderen ab. Die Rechnung las ausschließlich die Liste, der
// Vorgeschichte-Hinweis ausschließlich das alte Feld: Bei einem Kunden mit zwei Autos konnten
// beide verschiedene Wagen meinen, und ein nur oben gesetztes Fahrzeug erschien auf keiner
// Rechnung. Migration 44 hatte genau das schon verboten („der Code schreibt NUR die neue
// Tabelle") – der alte Kasten hatte es nur nie mitbekommen.
//
// Jetzt ist es ein Ort, und er steht immer da – nicht mehr hinter dem Rechnungshaken. Welches
// Auto bearbeitet wird, ist keine Frage der Abrechnung.
export function FahrzeugeBlock({
  fahrzeuge, alleFahrzeuge, gesperrt,
  onFahrzeugHinzufuegen, onFahrzeugAnlegen, onKilometerstand, onFahrzeugAngaben, onFahrzeugEntfernen, darfAnlegen = true,
}: {
  // Die Fahrzeuge DIESES Auftrags, angereichert um das zugehörige Fahrzeug.
  fahrzeuge: (AuftragFahrzeug & { fahrzeug: Vehicle | null })[];
  // Alle Fahrzeuge des Kunden – zur Auswahl.
  alleFahrzeuge: Vehicle[];
  gesperrt?: boolean;
  onFahrzeugHinzufuegen: (vehicleId: string) => Promise<void>;
  onFahrzeugAnlegen: (kennzeichen: string) => Promise<void>;
  onKilometerstand: (id: string, km: number | null) => Promise<void>;
  // Marke/Modell und Reifengröße ergänzen (Migration 74, v119). Fehlt der Handler, gibt es den
  // Knopf nicht.
  onFahrzeugAngaben?: (vehicleId: string, modell: string, reifengroesse: string) => Promise<void>;
  onFahrzeugEntfernen: (id: string) => Promise<void>;
  // „Fahrzeuge anlegen und ändern“ (Migration 77). Ohne das Recht fehlt „Neues Kennzeichen“; ein
  // vorhandenes Fahrzeug des Kunden lässt sich weiter zuordnen.
  darfAnlegen?: boolean;
}) {
  const [neuesKennzeichen, setNeuesKennzeichen] = useState("");
  const [auswahl, setAuswahl] = useState("");
  // Welches Fahrzeug gerade seine Angaben bekommt – immer nur eins, mit eigenem Entwurf.
  const [angaben, setAngaben] = useState<{ id: string; modell: string; groesse: string } | null>(null);
  const [speichert, setSpeichert] = useState(false);
  async function angabenSpeichern() {
    if (!angaben || !onFahrzeugAngaben) return;
    setSpeichert(true);
    try {
      await onFahrzeugAngaben(angaben.id, angaben.modell.trim(), angaben.groesse.trim());
      setAngaben(null);
    } finally { setSpeichert(false); }
  }

  // Nur Fahrzeuge anbieten, die noch nicht am Auftrag stehen – ein Auto zweimal einzutragen
  // hieße zwei Kilometerstände für denselben Wagen am selben Tag, und die Datenbank lehnt es
  // ohnehin ab (Migration 44).
  const schonDran = new Set(fahrzeuge.map((f) => f.vehicle_id));
  const waehlbar = alleFahrzeuge.filter((v) => !schonDran.has(v.id));
  // Steht ein Kennzeichen mehrfach beim Kunden (aus der Zeit vor v93, als „+ anlegen" jedes
  // Mal ein neues Fahrzeug erzeugte), sagt die Liste das – statt dreimal dieselbe Zeile.
  const doppelt = doppelteKennzeichen(alleFahrzeuge);

  return (
    <div className="ao-fahrzeuge">
      {fahrzeuge.length === 0 && (
        <div className="small">
          {alleFahrzeuge.length === 0
            ? "Für diesen Kunden ist noch kein Fahrzeug hinterlegt – unten eines anlegen oder im Kundenfenster."
            : "Noch kein Fahrzeug eingetragen."}
        </div>
      )}
      {fahrzeuge.map((f) => {
        const kennzeichen = f.fahrzeug?.license_plate?.trim() || "";
        return (
          <div key={f.id} className="ao-fz">
            <div className="dm-fz-kopf">
              <span className="dm-kz">{kennzeichen || "ohne Kz."}</span>
              <span className="dm-fz-text">
                <b>{f.fahrzeug?.make_model || "Fahrzeug"}</b>
                <span className="small">{f.fahrzeug?.tire_size || "keine Reifengröße hinterlegt"}</span>
              </span>
              {!gesperrt && (
                <button type="button" className="ao-weg" title="Fahrzeug vom Auftrag entfernen" aria-label="Fahrzeug vom Auftrag entfernen"
                  onClick={() => void onFahrzeugEntfernen(f.id)}>×</button>
              )}
            </div>
            <label className="ao-km">
              <span>Kilometerstand</span>
              <input
                type="number" min={0} inputMode="numeric" placeholder="ablesen"
                disabled={gesperrt}
                defaultValue={f.kilometerstand ?? ""}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  // Leer heißt „noch nicht abgelesen" (null), nicht 0.
                  const wert = t === "" ? null : Math.round(parseFloat(t.replace(",", ".")));
                  if (wert !== f.kilometerstand && !(wert != null && isNaN(wert))) void onKilometerstand(f.id, wert);
                }}
              />
              <span>km</span>
            </label>
            {onFahrzeugAngaben && !gesperrt && angaben?.id !== f.vehicle_id && (
              <button type="button" className="es-knopf ao-fz-angaben-knopf"
                onClick={() => setAngaben({ id: f.vehicle_id, modell: f.fahrzeug?.make_model ?? "", groesse: f.fahrzeug?.tire_size ?? "" })}>
                {f.fahrzeug?.make_model && f.fahrzeug?.tire_size ? "Modell / Reifengröße ändern" : "Modell / Reifengröße ergänzen"}
              </button>
            )}
            {angaben?.id === f.vehicle_id && (
              <div className="ao-fz-angaben">
                <label className="nk-feld"><span>Marke / Modell</span>
                  <input type="text" placeholder="z. B. VW Golf" value={angaben.modell} maxLength={100}
                    onChange={(e) => setAngaben({ ...angaben, modell: e.target.value })} />
                </label>
                <label className="nk-feld"><span>Reifengröße</span>
                  <input type="text" placeholder="z. B. 205/55 R16" value={angaben.groesse} maxLength={60}
                    onChange={(e) => setAngaben({ ...angaben, groesse: e.target.value })} />
                </label>
                <div className="pk-knoepfe">
                  <button type="button" className="am-mini" disabled={speichert} onClick={() => void angabenSpeichern()}>
                    {speichert ? "Speichert …" : "Speichern"}
                  </button>
                  <button type="button" className="btn-secondary btn-rand" disabled={speichert} onClick={() => setAngaben(null)}>Abbrechen</button>
                </div>
                <span className="small">Wird beim Fahrzeug des Kunden gespeichert.</span>
              </div>
            )}
          </div>
        );
      })}

      {!gesperrt && (
        <div className="ao-fz-hinzu">
          {waehlbar.length > 0 && (
            <select aria-label="Fahrzeug des Kunden wählen" value={auswahl} onChange={(e) => { setAuswahl(e.target.value); if (e.target.value) { void onFahrzeugHinzufuegen(e.target.value); setAuswahl(""); } }}>
              <option value="">
                {fahrzeuge.length === 0 ? "+ Fahrzeug des Kunden wählen" : "+ weiteres Fahrzeug des Kunden"}
              </option>
              {waehlbar.map((v) => (
                <option key={v.id} value={v.id}>
                  {fahrzeugAuswahlText(v, doppelt)}
                </option>
              ))}
            </select>
          )}
          {darfAnlegen && <span className="ao-fz-neu">
            <KennzeichenFeld
              placeholder="Neues Kennzeichen" aria-label="Neues Kennzeichen"
              value={neuesKennzeichen}
              onWert={setNeuesKennzeichen}
              onKeyDown={(e) => { if (e.key === "Enter" && neuesKennzeichen.trim()) { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); } }}
            />
            <button
              type="button" className="es-knopf" disabled={!neuesKennzeichen.trim()}
              onClick={() => { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); }}
            >
              + anlegen
            </button>
          </span>}
          {darfAnlegen && <span className="small">
            Neue Fahrzeuge werden beim Kunden hinterlegt. Hat der Kunde das Kennzeichen schon, wird
            dieses Fahrzeug genommen.
            {doppelt.size > 0 && " Doppelt angelegte Fahrzeuge lassen sich im Kundenfenster unter „Fahrzeuge“ löschen."}
          </span>}
        </div>
      )}
    </div>
  );
}

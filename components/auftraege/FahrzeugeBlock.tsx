import { useState } from "react";
import type { AuftragFahrzeug, Vehicle } from "@/lib/types";

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
  onFahrzeugHinzufuegen, onFahrzeugAnlegen, onKilometerstand, onFahrzeugEntfernen,
}: {
  // Die Fahrzeuge DIESES Auftrags, angereichert um das zugehörige Fahrzeug.
  fahrzeuge: (AuftragFahrzeug & { fahrzeug: Vehicle | null })[];
  // Alle Fahrzeuge des Kunden – zur Auswahl.
  alleFahrzeuge: Vehicle[];
  gesperrt?: boolean;
  onFahrzeugHinzufuegen: (vehicleId: string) => Promise<void>;
  onFahrzeugAnlegen: (kennzeichen: string) => Promise<void>;
  onKilometerstand: (id: string, km: number | null) => Promise<void>;
  onFahrzeugEntfernen: (id: string) => Promise<void>;
}) {
  const [neuesKennzeichen, setNeuesKennzeichen] = useState("");
  const [auswahl, setAuswahl] = useState("");

  // Nur Fahrzeuge anbieten, die noch nicht am Auftrag stehen – ein Auto zweimal einzutragen
  // hieße zwei Kilometerstände für denselben Wagen am selben Tag, und die Datenbank lehnt es
  // ohnehin ab (Migration 44).
  const schonDran = new Set(fahrzeuge.map((f) => f.vehicle_id));
  const waehlbar = alleFahrzeuge.filter((v) => !schonDran.has(v.id));

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
                  {[v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen"}
                </option>
              ))}
            </select>
          )}
          <span className="ao-fz-neu">
            <input
              type="text" placeholder="Neues Kennzeichen" aria-label="Neues Kennzeichen"
              value={neuesKennzeichen}
              onChange={(e) => setNeuesKennzeichen(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && neuesKennzeichen.trim()) { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); } }}
            />
            <button
              type="button" className="es-knopf" disabled={!neuesKennzeichen.trim()}
              onClick={() => { void onFahrzeugAnlegen(neuesKennzeichen.trim()); setNeuesKennzeichen(""); }}
            >
              + anlegen
            </button>
          </span>
          <span className="small">Neue Fahrzeuge werden beim Kunden hinterlegt.</span>
        </div>
      )}
    </div>
  );
}

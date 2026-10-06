import { useState } from "react";
import type { Customer, EingelagertesRad, Erfassungsart, RadPosition, Saison, StorageSlot, TireStorage, Vehicle } from "@/lib/types";
import type { RadFelder } from "@/lib/api/lager";
import { SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { profilText } from "@/lib/helpers";
import { platzZuKlein } from "@/lib/lagerAnsicht";
import { CustomerPicker } from "@/components/CustomerPicker";
import { ErfassungsWahl, RadBild, SatzProfil } from "./RadBild";
import { ReifenNotizenFelder } from "./ReifenNotizen";
import { notizAenderungen, type SatzNotizFeld, type SatzNotizen } from "@/lib/lagerNotizen";

// Einen Satz auf einen Lagerplatz legen oder seine Angaben ändern: Kunde, Fahrzeug, Saison, DOT,
// Profiltiefe (ein Wert oder je Rad), Notiz zum Satz und je Rad (seit v115). Geöffnet aus dem Platz-Blatt der Regalwand
// (LagerPanel.tsx → PlatzBlatt.tsx → „Bearbeiten" bzw. „Einlagern").
//
// Bis v105 stand dieses Fenster unten in LagerPanel.tsx (Fahrplan C5): Die Datei war auf über
// 1.000 Zeilen gewachsen, und das Fenster teilt mit der Regalwand nichts außer den Daten, die es
// über die Props bekommt.
export function TireAssignModal({ slot, customers, vehicles, assignment, gruende, raederFuer, onClose, onAssign, onErfassungsart, onAnzahlRaeder, onRadSpeichern, onRadEntfernen }: {
  slot: StorageSlot; customers: Customer[]; vehicles: Vehicle[]; assignment: TireStorage | null;
  // Warum an diesem Platz etwas zu tun ist. Steht auch im Blatt davor – hier noch einmal, weil
  // man es beim Ändern der Werte vor Augen haben soll.
  gruende: string[];
  raederFuer: (satzId: string) => EingelagertesRad[];
  onClose: () => void;
  onAssign: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null; radNotizen?: SatzNotizen }) => Promise<string>;
  onErfassungsart: (einlagerungId: string, art: Erfassungsart) => Promise<void>;
  onAnzahlRaeder: (einlagerungId: string, anzahl: number) => Promise<void>;
  onRadSpeichern: (einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onRadEntfernen: (radId: string) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(assignment?.customer_id || "");
  const [vehicleId, setVehicleId] = useState(assignment?.vehicle_id || "");
  const [saison, setSaison] = useState<Saison | "">(assignment?.saison || "");
  const [dotDate, setDotDate] = useState(assignment?.dot_date || "");
  const [profiltiefe, setProfiltiefe] = useState(assignment?.profiltiefe_mm != null ? String(assignment.profiltiefe_mm) : "");
  // Die Notizen gelten wie alles hier erst mit dem Knopf unten.
  const notizenVorher: SatzNotizen = {
    note: assignment?.note ?? "", notiz_vl: assignment?.notiz_vl ?? "", notiz_vr: assignment?.notiz_vr ?? "",
    notiz_hl: assignment?.notiz_hl ?? "", notiz_hr: assignment?.notiz_hr ?? "",
  };
  const [notizen, setNotizen] = useState<SatzNotizen>(notizenVorher);
  const note = notizen.note ?? "";
  const [saving, setSaving] = useState(false);
  // Ein Wert für den Satz oder je Rad (Migration 33). Bis v87 ließ sich das nur im
  // Auftragsfenster umstellen; hier stand bei einem neuen Satz immer nur das Sammelfeld
  // (gemeldet 29.09.2026). Bei einem neuen Satz gilt die Wahl erst beim Einlagern – die Räder
  // brauchen einen Satz, an dem sie hängen. Danach bleibt das Fenster offen zum Messen.
  //
  // Seit v98 (02.10.2026) ist die Wahl auch bei einem BESTEHENDEN Satz nur ein Entwurf. Vorher
  // schrieb schon das Umschalten in die Datenbank: „Je Rad messen" löschte den Satzwert sofort,
  // und wer nur nachsehen wollte und zurückschaltete oder mit ✕ schloss, hatte ihn verloren –
  // ohne je „Zuordnung speichern" getippt zu haben (gemeldet 02.10.2026). Jetzt gilt die Wahl
  // erst mit dem Knopf unten – oder mit dem ersten gemessenen Rad, denn das ist eine Eingabe.
  const artGespeichert: Erfassungsart = assignment?.erfassungsart ?? "sammel";
  const [art, setArt] = useState<Erfassungsart>(artGespeichert);
  const [eben, setEben] = useState(false);
  const einzeln = art === "einzeln";
  const gemesseneRaeder = assignment ? raederFuer(assignment.id) : [];

  // Nur die Fahrzeuge des gewählten Kunden. Ein Satz kann nur zu einem Auto DIESES Kunden
  // gehören – die Datenbank lehnt alles andere ab (Migration 30), und eine Auswahl, die
  // Ungültiges anbietet, ist eine Einladung zum Fehler.
  const kundenFahrzeuge = customerId ? vehicles.filter((v) => v.customer_id === customerId) : [];

  // Nur umschalten, nichts speichern. Der Satzwert im Feld bleibt stehen – wer zurückschaltet,
  // sieht ihn wieder.
  function artWaehlen(neu: Erfassungsart) {
    setArt(neu);
  }

  // Das erste gemessene Rad stellt den Satz in der Datenbank auf „je Rad" um – erst dann weicht
  // der Satzwert (die Datenbank erlaubt nie beides, Migration 33). Das Umstellen erledigt seit
  // v101 `radSpeichern` in app/page.tsx, auch ohne Netz (F1).
  async function radSpeichern(position: RadPosition, felder: Partial<RadFelder>) {
    if (!assignment) return;
    await onRadSpeichern(assignment.id, position, felder);
  }

  async function save() {
    if (!customerId) return;
    // Zurück auf einen Wert wirft die gemessenen Räder weg – echte Messarbeit, also einmal
    // nachfragen. Gefragt wird jetzt beim Speichern, nicht schon beim Umschalten.
    const wechsel = !!assignment && art !== (assignment.erfassungsart ?? "sammel");
    if (wechsel && art === "sammel" && gemesseneRaeder.length > 0
      && !window.confirm(`Zurück auf einen Wert für den ganzen Satz? Die ${gemesseneRaeder.length} gemessenen Räder werden dabei gelöscht.`)) return;
    setSaving(true);
    try {
      // Erst die Erfassungsart, dann die Angaben: Beim Wechsel auf „Satz" müssen die Räder weg
      // sein, bevor der Satzwert geschrieben werden darf (Prüfregel aus Migration 33).
      if (wechsel && assignment) await onErfassungsart(assignment.id, art);
      const id = await onAssign({
        id: assignment?.id, storageSlotId: slot.id, customerId,
        dotDate, profiltiefeMm: einzeln ? "" : profiltiefe, note,
        // Nur geänderte Notizen je Rad mitschicken – eine Datenbank vor Migration 71 kennt die
        // Spalten nicht, und ein Satz ohne Notiz soll dort weiter speichern können.
        radNotizen: (() => {
          const { note: _n, ...rad } = notizAenderungen(notizenVorher, notizen) ?? {};
          void _n;
          return Object.keys(rad).length ? rad : undefined;
        })(),
        // Beim Kundenwechsel darf kein Fahrzeug des Vorgängers hängenbleiben.
        vehicleId: kundenFahrzeuge.some((v) => v.id === vehicleId) ? vehicleId : null,
        saison: saison || null,
      });
      // Neuer Satz, je Rad gewählt: umstellen und offen bleiben – jetzt werden die Räder gemessen.
      if (!assignment && einzeln && id) {
        await onErfassungsart(id, "einzeln");
        setEben(true);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{assignment ? `Lagerplatz ${slot.code} bearbeiten` : `Reifen auf ${slot.code} einlagern`}</h2>
        {gruende.length > 0 && (
          <div className="handlung-hinweis">
            <b>Hier ist etwas zu tun:</b>
            <ul>
              {gruende.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        )}
        <CustomerPicker customers={customers} value={customerId} onChange={(id) => { setCustomerId(id); setVehicleId(""); }} />

        <div className="field">
          <label>Fahrzeug</label>
          {!customerId ? (
            <div className="small">Zuerst den Kunden wählen.</div>
          ) : kundenFahrzeuge.length === 0 ? (
            <div className="small">
              Für diesen Kunden ist kein Fahrzeug hinterlegt – im Kundenfenster unter
              &bdquo;Fahrzeuge&ldquo; anlegen.
            </div>
          ) : (
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">– Fahrzeug wählen –</option>
              {kundenFahrzeuge.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen"}
                </option>
              ))}
            </select>
          )}
          {/* E12: großer Reifen, normales Fach – ein Hinweis, keine Sperre. */}
          {(() => {
            const zuKlein = platzZuKlein(slot, kundenFahrzeuge.find((v) => v.id === vehicleId)?.tire_size);
            return zuKlein ? <div className="small einlagerung-pflicht" style={{ marginTop: 4 }}>{zuKlein}</div> : null;
          })()}
        </div>

        <div className="field">
          <label>Saison</label>
          <div className="filterbar" style={{ marginTop: 2 }}>
            {SAISON_LISTE.map((wert) => (
              <button
                key={wert}
                type="button"
                className={"chip" + (saison === wert ? " active" : "")}
                onClick={() => setSaison(saison === wert ? "" : wert)}
              >
                {SAISON_LABEL[wert]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>DOT-Datum</label>
          <input type="text" placeholder="z. B. 2523 (KW 25 / 2023)" value={dotDate} onChange={(e) => setDotDate(e.target.value)} />
        </div>

        {/* Zwei verschiedene Aussagen, nie gleichzeitig (Migration 33): „der Satz hat etwa
            4 mm" oder vier einzelne Werte. Dieselbe Wahl wie im Auftragsfenster. */}
        <div className="field">
          <label>Profiltiefe</label>
          <ErfassungsWahl einzeln={einzeln} gesperrt={saving} onWahl={artWaehlen} />
          {!einzeln && (
            <div style={{ marginTop: 8 }}>
              {/* Ohne `onSpeichern`: Hier speichert erst der Knopf unten das ganze Formular. */}
              <SatzProfil
                wert={profiltiefe === "" ? null : Number(profiltiefe)}
                onWert={(mm) => setProfiltiefe(mm == null ? "" : String(mm))}
              />
              {assignment && artGespeichert === "einzeln" && gemesseneRaeder.length > 0 && (
                <div className="small" style={{ marginTop: 6 }}>
                  Noch gilt die Messung je Rad. Erst mit &bdquo;Zuordnung speichern&ldquo; wird auf
                  einen Wert umgestellt – die {gemesseneRaeder.length} gemessenen Räder werden dann gelöscht.
                </div>
              )}
            </div>
          )}
        </div>

        {einzeln && !assignment && (
          <div className="small" style={{ marginTop: -4, marginBottom: 8 }}>
            Nach &bdquo;Reifen einlagern&ldquo; erscheinen hier die vier Räder zum Antippen und Messen.
          </div>
        )}
        {einzeln && assignment && (
          <div className="field">
            {eben && <div className="small" style={{ marginBottom: 6 }}>Eingelagert. Jetzt jedes Rad antippen und die Profiltiefe eintragen.</div>}
            {/* Der bisherige Satzwert bleibt sichtbar, solange noch kein Rad gemessen ist – und
                bleibt gespeichert, wenn jetzt ✕ getippt wird. */}
            {artGespeichert === "sammel" && assignment.profiltiefe_mm != null && (
              <div className="small" style={{ marginBottom: 6 }}>
                Bisher ein Wert für den Satz: <b>{profilText(assignment.profiltiefe_mm)}</b>. Er bleibt, bis du
                das erste Rad misst oder &bdquo;Zuordnung speichern&ldquo; tippst.
              </div>
            )}
            <RadBild
              raeder={gemesseneRaeder}
              anzahlRaeder={assignment.anzahl_raeder ?? 4}
              gesperrt={saving}
              onSpeichern={radSpeichern}
              onEntfernen={onRadEntfernen}
            />
            <label style={{ marginTop: 8 }}>Räder in diesem Satz</label>
            {/* Nicht immer vier: „zwei weggeworfen, zwei eingelagert" ist ein realer Fall. */}
            <input
              type="number" min={1} max={8} step={1} style={{ maxWidth: 120 }}
              defaultValue={assignment.anzahl_raeder ?? 4}
              disabled={saving}
              onBlur={(e) => {
                const zahl = Math.round(parseFloat(e.target.value));
                if (!isNaN(zahl) && zahl >= 1 && zahl <= 8 && zahl !== assignment.anzahl_raeder) void onAnzahlRaeder(assignment.id, zahl);
                else e.target.value = String(assignment.anzahl_raeder ?? 4);
              }}
            />
          </div>
        )}
        <div className="field">
          <ReifenNotizenFelder werte={notizen} anzahlRaeder={assignment?.anzahl_raeder ?? 4} gesperrt={saving}
            onAendern={(feld: SatzNotizFeld, wert: string) => setNotizen((n) => ({ ...n, [feld]: wert }))} />
        </div>
        <button className="btn-primary btn-block" disabled={!customerId || saving} onClick={() => void save()}>
          {!assignment ? (einzeln ? "Reifen einlagern und Räder messen" : "Reifen einlagern") : eben ? "Fertig" : "Zuordnung speichern"}
        </button>
      </div>
    </div>
  );
}

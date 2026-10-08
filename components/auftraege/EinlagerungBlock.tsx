import { useState } from "react";
import type {
  EingelagertesRad, Erfassungsart, RadPosition, Saison, StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { profilText, satzProfilMm } from "@/lib/helpers";
import { ErfassungsWahl, RadBild, SatzProfil } from "@/components/lager/RadBild";
import { ReifenNotizenAmSatz, ReifenNotizenAnzeige } from "@/components/lager/ReifenNotizen";
import type { SatzNotizen } from "@/lib/lagerNotizen";
import { doppelteKennzeichen, fahrzeugAuswahlText } from "@/lib/kennzeichen";
import type { RadFelder } from "@/lib/api/lager";
import { lagerplatzIdAusCode, satzIdAusCode } from "@/lib/aufkleberCode";
import { groessenAbweichung } from "@/lib/reifenverkauf";
import { brauchtGrossesFach, platzGroesse, platzZuKlein, plaetzeFuerReifen } from "@/lib/lagerAnsicht";
import { QrScanner } from "@/components/QrScanner";
import { KennzeichenFeld } from "@/components/KennzeichenFeld";

// Einlagerung im Auftragsfenster (Migration 22, siehe docs/lager.md).
//
// Vor dieser Ausbaustufe kannte das Lager nur Lagerplatz und Kunde – warum die Reifen dort
// liegen, stand nirgends, und der Techniker vor Ort hatte aus dem Auftrag heraus keinen Weg ins
// Regal. Jetzt gibt es beides an einer Stelle: Platz aus der Liste wählen oder den Aufkleber am
// Regal scannen.
//
// Der Scan ist nicht Bequemlichkeit, sondern Fehlervermeidung: eine Liste mit hundert
// Lagerplätzen auf einem Handy, während man mit Reifen in der Hand vor dem Regal steht, ist die
// zuverlässigste Art, A-12 statt A-21 zu treffen.

export function EinlagerungBlock({
  titel = "Einlagerung",
  einlagerung, slots, warehouses, belegteSlotIds, gesperrt, vehicles, raeder,
  onEinlagern, onEntfernen, onAngabenAendern, onErfassungsart, onAnzahlRaeder, onRadSpeichern, onRadEntfernen, onSatzNotizen,
  onFahrzeugAnlegen, onEtikett, reifengroesse = null, darfFahrzeugAnlegen = true, darfEntfernen = true,
}: {
  // Die Reifengröße des Autos am Auftrag (E12). Braucht sie ein großes Fach, stehen die großen
  // Fächer in der Auswahl oben; ein normales gibt einen Hinweis. Hat der Satz schon ein Fahrzeug,
  // gilt dessen Größe.
  reifengroesse?: string | null;
  // `pflicht` („braucht Lagerplatz", Migration 22) stand hier bis v101 und war an beiden
  // Einbindungsstellen fest `false` – seit Migration 46 gibt es den Zwang nicht mehr (C2).
  // Die Überschrift des Blocks. Standard „Einlagerung"; trägt ein Auftrag mehrere Sätze, steht
  // hier „Satz 2 von 3". Als Prop und nicht als zweite Überschrift darüber: Zwei Titel
  // übereinander lesen sich wie zwei Abschnitte, und der untere wäre der leere.
  titel?: string;
  einlagerung: TireStorage | null;
  slots: StorageSlot[];
  warehouses: Warehouse[];
  belegteSlotIds: Set<string>;
  gesperrt: boolean;
  // Die Fahrzeuge des Kunden dieses Auftrags. Der Satz gehört seit Migration 30 zu einem
  // Fahrzeug, nicht nur zu einer Person – bei einem Kunden mit zwei Autos ist das der
  // Unterschied zwischen „irgendein Satz von Müller" und „der Wintersatz vom Kombi".
  vehicles: Vehicle[];
  onEinlagern: (lagerplatzId: string) => Promise<void>;
  onEntfernen: (einlagerungId: string) => Promise<void>;
  // Ein Tausch-Satz (kommt_rein) lässt sich nur mit „Reifentausch“ verwerfen (Migration 78).
  darfEntfernen?: boolean;
  onAngabenAendern: (einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) => Promise<void>;
  // Die einzeln erfassten Räder DIESES Satzes (Migration 33). Leer, solange der Satz auf
  // Sammelmessung steht – dann gilt der eine Wert am Satz.
  raeder: EingelagertesRad[];
  onErfassungsart: (einlagerungId: string, art: Erfassungsart) => Promise<void>;
  onAnzahlRaeder: (einlagerungId: string, anzahl: number) => Promise<void>;
  onRadSpeichern: (einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onRadEntfernen: (radId: string) => Promise<void>;
  // Notizen am Satz (Migration 71, v115). Fehlt, wo nur angezeigt wird.
  onSatzNotizen?: (satzId: string, felder: SatzNotizen) => Promise<void>;
  // Ein Fahrzeug direkt hier anlegen und dem Satz zuordnen. Der Techniker steht am Auto, im
  // Auftrag – ihn dafür ins Kundenfenster und wieder zurück zu schicken, war der längste Weg
  // für die kürzeste Eingabe (Kennzeichen + Modell).
  onFahrzeugAnlegen: (kennzeichen: string, modell: string) => Promise<void>;
  // „Fahrzeuge anlegen und ändern“ (Migration 77). Ohne das Recht fehlt der Knopf.
  darfFahrzeugAnlegen?: boolean;
  // Öffnet den Etikettendruck für DIESEN Satz. Optional: Wer den Block ohne diese Zusage
  // einbindet, bekommt den Knopf gar nicht erst zu sehen, statt auf einen zu drücken, der
  // nichts tut.
  onEtikett?: (einlagerungId: string) => void;
}) {
  const [wahl, setWahl] = useState("");
  const [neuesKennzeichen, setNeuesKennzeichen] = useState("");
  const [neuesModell, setNeuesModell] = useState("");
  const [fahrzeugFormOffen, setFahrzeugFormOffen] = useState(false);
  const [scannerOffen, setScannerOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  // „Je Rad messen" ist zunächst nur eine Ansicht (v98, 02.10.2026). Vorher löschte schon das
  // Umschalten den Satzwert in der Datenbank – wer nur nachsehen wollte, hatte ihn verloren.
  // Umgestellt wird jetzt mit dem ersten gemessenen Rad. Gemerkt je Satz, damit ein anderer
  // Satz nicht die Ansicht des vorigen erbt.
  const [ansichtJeRad, setAnsichtJeRad] = useState<string | null>(null);
  const einzelnGespeichert = einlagerung?.erfassungsart === "einzeln";
  const einzelnAnzeige = einzelnGespeichert || (!!einlagerung && ansichtJeRad === einlagerung.id);

  // Ein belegter Platz taucht nicht in der Auswahl auf – der eigene bleibt sichtbar, sonst
  // verschwände die aktuelle Zuordnung aus ihrer eigenen Liste.
  const satzFahrzeug = einlagerung?.vehicle_id ? vehicles.find((v) => v.id === einlagerung.vehicle_id) : null;
  const groesse = satzFahrzeug?.tire_size || reifengroesse;
  const gross = brauchtGrossesFach(groesse);
  const freieSlots = plaetzeFuerReifen(slots.filter((s) => !belegteSlotIds.has(s.id) || s.id === einlagerung?.storage_slot_id), gross);
  const optionText = (s: StorageSlot) => s.code + (platzGroesse(s) === "gross" ? " · groß" : "");

  function lagerName(warehouseId: string): string {
    return warehouses.find((w) => w.id === warehouseId)?.name || "Unbekanntes Lager";
  }

  const belegterPlatz = einlagerung ? slots.find((s) => s.id === einlagerung.storage_slot_id) : null;

  function fahrzeugName(v: Vehicle): string {
    return [v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen";
  }
  function fahrzeugText(id: string | null): string {
    if (!id) return "ohne Fahrzeug";
    const v = vehicles.find((f) => f.id === id);
    return v ? fahrzeugName(v) : "Fahrzeug nicht auffindbar";
  }

  async function erfassungsartSetzen(art: Erfassungsart) {
    if (!einlagerung) return;
    // Nur die Ansicht wechseln, solange in der Datenbank noch der Satzwert gilt.
    if (!einzelnGespeichert) { setAnsichtJeRad(art === "einzeln" ? einlagerung.id : null); return; }
    if (art === "einzeln") return;
    // Zurück auf einen Sammelwert wirft die gemessenen Radzeilen weg – das ist echte
    // Messarbeit, also einmal nachfragen. In die andere Richtung gibt es nichts zu verlieren.
    if (art === "sammel" && raeder.length > 0) {
      const sicher = window.confirm(
        `Zurück auf einen Wert für den ganzen Satz? Die ${raeder.length} gemessenen Räder werden dabei gelöscht.`
      );
      if (!sicher) return;
    }
    setLaeuft(true);
    setMeldung(null);
    try {
      await onErfassungsart(einlagerung.id, art);
      setAnsichtJeRad(null);
    } finally {
      setLaeuft(false);
    }
  }

  // Das erste gemessene Rad stellt den Satz um – erst dann weicht der Satzwert (die Datenbank
  // erlaubt nie beides, Migration 33).
  // Umgestellt wird seit v101 in `radSpeichern` (app/page.tsx), auch ohne Netz (F1).
  async function radSpeichern(position: RadPosition, felder: Partial<RadFelder>) {
    if (!einlagerung) return;
    await onRadSpeichern(einlagerung.id, position, felder);
  }

  async function angabenAendern(felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) {
    if (!einlagerung) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      await onAngabenAendern(einlagerung.id, felder);
    } finally {
      setLaeuft(false);
    }
  }

  async function zuordnen(lagerplatzId: string) {
    setLaeuft(true);
    setMeldung(null);
    try {
      await onEinlagern(lagerplatzId);
      setWahl("");
    } finally {
      setLaeuft(false);
    }
  }

  // Der gescannte Text wird hier geprüft und NICHT blind weitergereicht: im Lager hängen auch
  // Paketaufkleber und Reifenetiketten mit Codes herum. Passt er nicht, sagt die Meldung das,
  // statt still nichts zu tun.
  function gescannt(text: string) {
    setScannerOffen(false);
    const id = lagerplatzIdAusCode(text);
    if (!id) {
      // Die beiden Aufklebersorten sehen sich ähnlich; wer das Satz-Etikett vor die Kamera
      // hält, hat nicht „irgendetwas Falsches" gescannt, sondern das Naheliegende verwechselt.
      setMeldung(
        satzIdAusCode(text)
          ? "Das ist das Etikett des Reifensatzes, kein Lagerplatz. Gescannt wird hier der Aufkleber am Regal."
          : "Das war kein Lagerplatz-Aufkleber."
      );
      return;
    }
    const platz = slots.find((s) => s.id === id);
    if (!platz) { setMeldung("Dieser Lagerplatz ist in der App nicht (mehr) vorhanden."); return; }
    if (belegteSlotIds.has(platz.id) && platz.id !== einlagerung?.storage_slot_id) {
      setMeldung(`Lagerplatz ${platz.code} ist bereits belegt.`);
      return;
    }
    void zuordnen(platz.id);
  }

  return (
    <div className="auftrag-block">
      <div className="auftrag-block-titel">
        {titel}
      </div>

      {einlagerung && belegterPlatz ? (
        <>
          <div><b>{belegterPlatz.code}</b> <span className="small">· {lagerName(belegterPlatz.warehouse_id)}{platzGroesse(belegterPlatz) === "gross" ? " · großes Fach" : ""}</span></div>
          {platzZuKlein(belegterPlatz, groesse) && <div className="small einlagerung-pflicht">{platzZuKlein(belegterPlatz, groesse)}</div>}
          {/* Reifentausch (Migration 69): erfasst, aber noch nicht im Regal. */}
          {einlagerung.kommt_rein && (
            <div className="small tausch-hinweis">⇄ Tausch: kommt beim Abschließen des Auftrags auf diesen Platz – der alte Satz geht dann raus.</div>
          )}

          {/* Fahrzeug und Saison stehen HIER und nicht in einem eigenen Fenster: Der Techniker
              hat den Satz gerade in der Hand, das Auto steht vor ihm. Fünf Minuten später weiß
              es niemand mehr. Beides ist Pflicht, aber erst beim Abschließen des Auftrags –
              die Datenbank lehnt den Abschluss sonst ab (Migration 30). */}
          {gesperrt ? (
            <div className="small" style={{ marginTop: 4 }}>
              {fahrzeugText(einlagerung.vehicle_id)} · {einlagerung.saison ? SAISON_LABEL[einlagerung.saison] : "ohne Saison"}
              {" · "}Profil {profilText(satzProfilMm(einlagerung, raeder))}
              {einlagerung.erfassungsart === "einzeln" ? " (schwächstes Rad)" : ""}
              <ReifenNotizenAnzeige satz={einlagerung} klein />
            </div>
          ) : (
            <>
              <div className="field" style={{ margin: "8px 0 4px" }}>
                <label>Fahrzeug{einlagerung.vehicle_id ? "" : " – fehlt noch"}</label>
                {vehicles.length > 0 && (
                  <select
                    className={einlagerung.vehicle_id ? undefined : "feld-fehlt"}
                    value={einlagerung.vehicle_id || ""}
                    disabled={laeuft}
                    onChange={(e) => void angabenAendern({ vehicleId: e.target.value || null })}
                  >
                    <option value="">– Fahrzeug wählen –</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{fahrzeugAuswahlText(v, doppelteKennzeichen(vehicles))}</option>
                    ))}
                  </select>
                )}

                {/* Anlegen an Ort und Stelle. Nur Kennzeichen und Modell: Das ist, was am Auto
                    abzulesen ist, während man davorsteht. Alles Weitere (Reifengröße, Notiz)
                    steht im Kundenfenster und kann später nachgetragen werden – ein längeres
                    Formular hier würde nur dazu führen, dass es gar nicht ausgefüllt wird. */}
                {!darfFahrzeugAnlegen ? null : !fahrzeugFormOffen ? (
                  <button
                    type="button"
                    className={"btn-secondary btn-rand" + (vehicles.length === 0 ? " btn-block" : "")}
                    style={vehicles.length === 0 ? { marginTop: 2 } : { marginTop: 4, padding: "3px 8px", fontSize: 12 }}
                    disabled={laeuft}
                    onClick={() => setFahrzeugFormOffen(true)}
                  >
                    {vehicles.length === 0 ? "+ Fahrzeug dieses Kunden anlegen" : "+ Weiteres Fahrzeug"}
                  </button>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <div className="row" style={{ marginBottom: 4 }}>
                      <KennzeichenFeld
                        placeholder="Kennzeichen, z. B. N-FS 2013" autoFocus
                        value={neuesKennzeichen} onWert={setNeuesKennzeichen}
                      />
                      <input
                        type="text" placeholder="Marke / Modell"
                        value={neuesModell} onChange={(e) => setNeuesModell(e.target.value)}
                      />
                    </div>
                    <div className="appt-actions">
                      <button
                        type="button" className="btn-primary"
                        disabled={laeuft || !neuesKennzeichen.trim()}
                        onClick={async () => {
                          setLaeuft(true);
                          try {
                            await onFahrzeugAnlegen(neuesKennzeichen.trim(), neuesModell.trim());
                            setNeuesKennzeichen("");
                            setNeuesModell("");
                            setFahrzeugFormOffen(false);
                          } finally {
                            setLaeuft(false);
                          }
                        }}
                      >
                        Anlegen und zuordnen
                      </button>
                      <button
                        type="button" className="btn-secondary btn-rand" disabled={laeuft}
                        onClick={() => { setNeuesKennzeichen(""); setNeuesModell(""); setFahrzeugFormOffen(false); }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {vehicles.length === 0 && !fahrzeugFormOffen && (
                  <div className="small" style={{ marginTop: 4 }}>
                    Ohne Fahrzeug lässt sich der Auftrag nicht abschließen.
                  </div>
                )}
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>Saison{einlagerung.saison ? "" : " – fehlt noch"}</label>
                {/* Segmentierte Knöpfe statt Auswahlliste: drei feste Werte, ein Tipp statt
                    Aufklappen-Suchen-Tippen. Dieselbe Optik wie die Filterchips über der
                    Kundenliste – ein Vokabular, nicht zwei. */}
                <div className="filterbar" style={{ marginTop: 2 }}>
                  {SAISON_LISTE.map((wert) => (
                    <button
                      key={wert}
                      type="button"
                      className={"chip" + (einlagerung.saison === wert ? " active" : "")}
                      disabled={laeuft}
                      onClick={() => void angabenAendern({ saison: einlagerung.saison === wert ? null : wert })}
                    >
                      {SAISON_LABEL[wert]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ------------------------------------------------ Profiltiefe */}
              {/* Zwei verschiedene Aussagen, nie gleichzeitig (Migration 33): „der Satz hat
                  etwa 4 mm" oder vier einzelne Werte. Die Sammelmessung ist der Normalfall –
                  zehn Sekunden. Die Einzelmessung kostet eine Minute und ist dafür die
                  Grundlage für ein Verkaufsgespräch („HL 3,1 mm"). */}
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label>Profiltiefe</label>
                <ErfassungsWahl
                  einzeln={einzelnAnzeige}
                  gesperrt={laeuft}
                  onWahl={(art) => void erfassungsartSetzen(art)}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                {einzelnAnzeige ? (
                  <>
                    {!einzelnGespeichert && einlagerung.profiltiefe_mm != null && (
                      <div className="small" style={{ marginBottom: 6 }}>
                        Bisher ein Wert für den Satz: <b>{profilText(einlagerung.profiltiefe_mm)}</b>. Er bleibt,
                        bis du das erste Rad misst.
                      </div>
                    )}
                    <RadBild
                      raeder={raeder}
                      anzahlRaeder={einlagerung.anzahl_raeder}
                      gesperrt={laeuft}
                      onSpeichern={radSpeichern}
                      onEntfernen={onRadEntfernen}
                    />
                    {/* E8: Passt, was gemessen wurde, zur Größe am Fahrzeug? Nur ein Hinweis –
                        Mischbereifung gibt es. */}
                    {(() => {
                      const fz = vehicles.find((v) => v.id === einlagerung.vehicle_id);
                      const text = groessenAbweichung(fz?.tire_size, raeder);
                      return text ? <div className="small einlagerung-pflicht" style={{ marginTop: 6 }}>{text}</div> : null;
                    })()}
                  </>
                ) : (
                  // Gespeichert wird kurz nach der letzten Änderung (SatzProfil) – nicht bei
                  // jedem Tipper, sonst stünde für „4,5" unterwegs der Wert 4 in der Datenbank.
                  <SatzProfil
                    key={einlagerung.id}
                    wert={einlagerung.profiltiefe_mm}
                    onSpeichern={(mm) => angabenAendern({ profiltiefeMm: mm == null ? "" : String(mm) })}
                  />
                )}
              </div>

              {einzelnAnzeige && (
                <div className="field" style={{ marginTop: 8, marginBottom: 0, maxWidth: 220 }}>
                  <label>Räder in diesem Satz</label>
                  {/* Nicht immer vier: „zwei weggeworfen, zwei eingelagert" ist ein realer
                      Fall und soll kein Sonderfall im Kopf des Technikers bleiben. */}
                  <input
                    type="number" min={1} max={8} step={1}
                    defaultValue={einlagerung.anzahl_raeder}
                    disabled={laeuft}
                    onBlur={(e) => {
                      const zahl = Math.round(parseFloat(e.target.value));
                      if (!isNaN(zahl) && zahl >= 1 && zahl <= 8 && zahl !== einlagerung.anzahl_raeder) {
                        void onAnzahlRaeder(einlagerung.id, zahl);
                      } else {
                        e.target.value = String(einlagerung.anzahl_raeder);
                      }
                    }}
                  />
                </div>
              )}

              {/* Notizen (v115): zum Satz und je Rad – „VR: Schraube in der Lauffläche“. Hier, weil
                  der Techniker den Reifen gerade in der Hand hat; gespeichert beim Verlassen. */}
              {onSatzNotizen && (
                <ReifenNotizenAmSatz key={einlagerung.id} satz={einlagerung} gesperrt={laeuft}
                  onSpeichern={(felder) => onSatzNotizen(einlagerung.id, felder)} />
              )}

              {/* Das Etikett steht NEBEN dem Entfernen und nicht weiter oben beim Lagerplatz:
                  Gedruckt wird, wenn der Satz fertig erfasst ist – mit Fahrzeug, Saison und
                  Profil. Ein Etikett, auf dem „Fahrzeug offen" steht, klebt hinterher ein
                  halbes Jahr am Reifen. */}
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                {onEtikett && (
                  <button
                    type="button" className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }}
                    onClick={() => onEtikett(einlagerung.id)}
                  >
                    Etikett drucken
                  </button>
                )}
                {darfEntfernen && (
                  <button
                    type="button" className="btn-secondary btn-rand" style={{ flex: "0 0 auto" }}
                    disabled={laeuft}
                    onClick={() => onEntfernen(einlagerung.id)}
                  >
                    Einlagerung entfernen
                  </button>
                )}
              </div>
              {onEtikett && (!einlagerung.vehicle_id || !einlagerung.saison) && (
                <div className="small" style={{ marginTop: 4 }}>
                  Auf dem Etikett stünde jetzt noch
                  {!einlagerung.vehicle_id ? " „Fahrzeug offen“" : ""}
                  {!einlagerung.vehicle_id && !einlagerung.saison ? " und" : ""}
                  {!einlagerung.saison ? " „Saison offen“" : ""} – erst ergänzen, dann drucken.
                </div>
              )}
            </>
          )}
        </>
      ) : einlagerung ? (
        // Zuordnung vorhanden, aber der Platz ist nicht in der geladenen Liste – etwa weil er
        // gelöscht wurde. Lieber ehrlich benennen als eine leere Zeile zeigen.
        <div className="small">Zugeordneter Lagerplatz nicht auffindbar.</div>
      ) : gesperrt ? (
        <div className="small">– kein Lagerplatz belegt –</div>
      ) : (
        <>
          <div className="einlagerung-zeile">
            <select value={wahl} onChange={(e) => setWahl(e.target.value)} disabled={laeuft}>
              <option value="">– Lagerplatz wählen –</option>
              {/* Nach Lager gruppiert (D14): Am Handy musste man sonst in jeder Zeile den
                  angehängten Lagernamen mitlesen. Bei nur einem Lager keine Gruppe. */}
              {warehouses.length > 1
                ? warehouses
                    .map((w) => ({ w, plaetze: freieSlots.filter((s) => s.warehouse_id === w.id) }))
                    .filter((g) => g.plaetze.length > 0)
                    .map((g) => (
                      <optgroup key={g.w.id} label={`${g.w.name} (${g.plaetze.length} frei)`}>
                        {g.plaetze.map((s) => <option key={s.id} value={s.id}>{optionText(s)}</option>)}
                      </optgroup>
                    ))
                : freieSlots.map((s) => <option key={s.id} value={s.id}>{optionText(s)} · {lagerName(s.warehouse_id)}</option>)}
            </select>
            <button type="button" className="btn-secondary btn-rand" disabled={!wahl || laeuft} onClick={() => zuordnen(wahl)}>
              Zuordnen
            </button>
            <button type="button" className="btn-primary" disabled={laeuft} onClick={() => { setMeldung(null); setScannerOffen(true); }}>
              Lagerplatz scannen
            </button>
          </div>
          {freieSlots.length === 0 && (
            <div className="small" style={{ marginTop: 6 }}>Alle Lagerplätze sind belegt.</div>
          )}
          {/* E12: Hinweis, keine Sperre – wer vor dem Regal steht, sieht, ob es passt. */}
          {(() => {
            const gewaehlt = slots.find((s) => s.id === wahl);
            const zuKlein = gewaehlt ? platzZuKlein(gewaehlt, groesse) : null;
            return zuKlein
              ? <div className="small einlagerung-pflicht" style={{ marginTop: 6 }}>{zuKlein}</div>
              : gross && freieSlots.length > 0 && !wahl
              ? <div className="small" style={{ marginTop: 6 }}>Große Reifen ({groesse}) – die großen Fächer stehen oben.</div>
              : null;
          })()}
        </>
      )}

      {meldung && <div className="small einlagerung-pflicht" style={{ marginTop: 6 }}>{meldung}</div>}

      {scannerOffen && (
        <QrScanner titel="Lagerplatz scannen" onErkannt={gescannt} onClose={() => setScannerOffen(false)} />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Customer, EingelagertesRad, Saison, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import {
  DOT_ALT_JAHRE, LAGERDAUER_HINWEIS_TAGE, PROFIL_KRITISCH_MM, REGAL_LISTE_BREITE_PX,
  SAISON_LABEL, SAISON_LISTE,
} from "@/lib/constants";
import { formatDate, handlungsgruende, nachReihen, raederNachSatz, suchtreffer } from "@/lib/helpers";
import { IconLager, IconTrash } from "@/components/icons";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LagerplatzAufkleber } from "./LagerplatzAufkleber";
import { LangliegerListe } from "./LangliegerListe";
import { ProfilMarke } from "./ProfilMarke";
import { RadBild } from "./RadBild";

// Lager-Modul: zwei Ebenen wie ein eigenständiges Modul – erst die Übersicht aller Lager
// (mit Auslastung), dann – nach Klick auf ein Lager – dessen Lagerplätze, inkl. Reifen-
// Zuordnung über TireAssignModal. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.

// Erzeugt Lagerplatz-Codes aus einer einfachen Nummerierungslogik, z. B.
// Präfix "A", 1–20, 2-stellig gepolstert → A-01 … A-20.
// Exportiert, damit die Nummerierungslogik in tests/lagerplaetze.test.ts geprüft werden kann
// (Roadmap Phase 12) – innerhalb dieser Datei ändert sich dadurch nichts.
// Die Grenzen, ab denen an einem eingelagerten Satz etwas zu tun ist. Einmal hier
// zusammengestellt, damit die Regel (lib/helpers.ts) und die Zahlen (lib/constants.ts)
// getrennt bleiben – dieselbe Aufteilung wie bei ProfilMarke.
const HANDLUNG_GRENZEN = {
  kritischMm: PROFIL_KRITISCH_MM,
  dotJahre: DOT_ALT_JAHRE,
  liegtTage: LAGERDAUER_HINWEIS_TAGE,
};

export function buildSlotCodes(prefix: string, start: number, end: number, digits: number): string[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const codes: string[] = [];
  for (let n = start; n <= end && codes.length < 500; n++) {
    const num = String(n).padStart(Math.max(1, digits), "0");
    codes.push(prefix.trim() ? `${prefix.trim()}-${num}` : num);
  }
  return codes;
}

function SlotNumberingFields({ prefix, setPrefix, start, setStart, end, setEnd, digits, setDigits }: {
  prefix: string; setPrefix: (v: string) => void;
  start: string; setStart: (v: string) => void;
  end: string; setEnd: (v: string) => void;
  digits: string; setDigits: (v: string) => void;
}) {
  const preview = buildSlotCodes(prefix, parseInt(start, 10), parseInt(end, 10), parseInt(digits, 10) || 2);
  return (
    <>
      <div className="row" style={{ marginBottom: 4 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>Präfix (optional)</label><input type="text" placeholder="z. B. A" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Von Nr.</label><input type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Bis Nr.</label><input type="number" min={0} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Stellen</label><input type="number" min={1} max={4} value={digits} onChange={(e) => setDigits(e.target.value)} /></div>
      </div>
      {preview.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          {preview.length} Lagerplätze: {preview.slice(0, 4).join(", ")}{preview.length > 4 ? ` … ${preview[preview.length - 1]}` : ""}
        </div>
      )}
    </>
  );
}

export function LagerPanel({ customers, vehicles, warehouses, storageSlots, tireStorages, eingelagerteRaeder, lagergebuehrJeMonat, onOpenCustomer, onAddWarehouse, onUpdateWarehouse, onDeleteWarehouse, onAddSlot, onAddSlotsBulk, onDeleteSlot, onAssignTire, onRemoveAssignment, onEtikett, canCreateWarehouse, canEditWarehouse, canDeleteWarehouse, canCreateSlot, canDeleteSlot, canAssignTire, springeZuLagerplatzId, onLagerplatzGeoeffnet }: {
  customers: Customer[];
  // Alle Kundenfahrzeuge. Das Lager-Modul arbeitet nicht mit einem geöffneten Kunden, sondern
  // mit vielen Sätzen nebeneinander – deshalb hier der Vollabzug statt der Ausschnitt je Kunde.
  vehicles: Vehicle[]; warehouses: Warehouse[]; storageSlots: StorageSlot[]; tireStorages: TireStorage[];
  // Für die Langlieger-Übersicht (Fahrplan E4): der heute gültige Monatspreis der Lagergebühr
  // (null = keiner gepflegt) und der Weg ins Kundenfenster.
  lagergebuehrJeMonat: number | null;
  onOpenCustomer?: (kundeId: string) => void;
  // Die einzeln gemessenen Räder (Migration 33). Hier nur zum Anzeigen: Bearbeitet werden sie
  // im Auftragsfenster, wo der Satz in der Hand liegt.
  eingelagerteRaeder: EingelagertesRad[];
  onAddWarehouse: (fields: { name: string; address: string; note: string }) => Promise<string | undefined>;
  onUpdateWarehouse: (id: string, fields: { name: string; address: string; note: string }) => Promise<void>;
  onDeleteWarehouse: (id: string) => Promise<void>;
  onAddSlot: (warehouseId: string, code: string) => Promise<void>;
  onAddSlotsBulk: (warehouseId: string, codes: string[]) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onAssignTire: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null }) => Promise<void>;
  onRemoveAssignment: (id: string) => Promise<void>;
  // Etikett für den Satz auf diesem Platz nachdrucken (17.09.2026). Der erste Druck passiert im
  // Auftragsfenster; hier geht es um den abgerissenen – dieselbe Begründung wie beim
  // Nachdruck eines Regalaufklebers.
  onEtikett: (einlagerungId: string) => void;
  // Granulare Modul-Berechtigungen (von einem Superadmin im Admin-Tab unter
  // "Modulverwaltung" konfigurierbar) – jede Struktur-Aktion einzeln steuerbar, damit z. B.
  // ein Techniker Reifen zuordnen, aber kein Lager anlegen/löschen darf.
  canCreateWarehouse: boolean;
  canEditWarehouse: boolean;
  canDeleteWarehouse: boolean;
  canCreateSlot: boolean;
  canDeleteSlot: boolean;
  canAssignTire: boolean;
  // Lagerplatz, der beim Öffnen des Moduls direkt aufgeschlagen werden soll – gesetzt, wenn
  // die App über einen gescannten QR-Aufkleber aufgerufen wurde (?lagerplatz=…). Das Lager
  // dazu wird mit ausgewählt, damit man nicht auf einer Lagerübersicht landet und selbst
  // suchen muss. `onLagerplatzGeoeffnet` meldet zurück, dass der Sprung erledigt ist.
  springeZuLagerplatzId?: string | null;
  onLagerplatzGeoeffnet?: () => void;
}) {
  // Zwei Ebenen wie ein eigenständiges Modul: erst die Übersicht aller Lager
  // (mit Auslastung), dann – nach Klick auf ein Lager – dessen Lagerplätze.
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseAddress, setNewWarehouseAddress] = useState("");
  const [newWarehouseNote, setNewWarehouseNote] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newStart, setNewStart] = useState("1");
  const [newEnd, setNewEnd] = useState("10");
  const [newDigits, setNewDigits] = useState("2");
  const [newSlotCode, setNewSlotCode] = useState("");
  const [assignSlot, setAssignSlot] = useState<StorageSlot | null>(null);
  // Lagerplätze, für die gerade ein Aufkleberbogen offen ist: ein einzelner Platz beim
  // Nachdruck, alle Plätze eines Lagers bei der Erstausstattung.
  const [aufkleberFuer, setAufkleberFuer] = useState<StorageSlot[] | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  const [showAddMoreSlots, setShowAddMoreSlots] = useState(false);
  const [morePrefix, setMorePrefix] = useState("");
  const [moreStart, setMoreStart] = useState("1");
  const [moreEnd, setMoreEnd] = useState("10");
  const [moreDigits, setMoreDigits] = useState("2");

  // Suchen und Filtern. Der Zustand steht hier oben, weil BEIDE Ebenen ihn brauchen: In der
  // Lagerübersicht beantwortet dieselbe Eingabe „wo liegt N-AB 123?" über alle Lager hinweg,
  // im geöffneten Lager filtert sie die Regalwand. Wer sucht, öffnet ein Lager und müsste
  // sonst dieselben acht Zeichen ein zweites Mal tippen.
  const [suche, setSuche] = useState("");
  const [nurHandlung, setNurHandlung] = useState(false);
  // Wand oder Liste. "auto" heißt: die Fensterbreite entscheidet – so war es bisher und so
  // bleibt es, solange niemand widerspricht. Die beiden anderen Werte sind der Widerspruch.
  const [ansicht, setAnsicht] = useState<"auto" | "wand" | "liste">("auto");
  // Ist das Fenster schmal? Früher stand diese Regel im Stilblatt; sie steht jetzt hier, weil
  // sonst der Umschalter dieselben zwanzig Layoutregeln ein zweites Mal gebraucht hätte.
  // `null` heißt „noch nicht gemessen" – auf dem Server gibt es kein Fenster.
  const [schmal, setSchmal] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${REGAL_LISTE_BREITE_PX}px)`);
    const merken = () => setSchmal(mq.matches);
    merken();
    mq.addEventListener("change", merken);
    return () => mq.removeEventListener("change", merken);
  }, []);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || null;
  const slotsInWarehouse = storageSlots.filter((s) => s.warehouse_id === selectedWarehouseId);

  // Kommt die App über einen gescannten Aufkleber (?lagerplatz=…), wird das passende Lager
  // aufgeschlagen und der Platz gleich geöffnet. Läuft erst, wenn die Lagerplätze geladen
  // sind – deshalb hängt der Effekt an `storageSlots` und nicht nur an der Kennung.
  useEffect(() => {
    if (!springeZuLagerplatzId) return;
    const platz = storageSlots.find((sl) => sl.id === springeZuLagerplatzId);
    if (!platz) return;
    setSelectedWarehouseId(platz.warehouse_id);
    if (canAssignTire) setAssignSlot(platz);
    onLagerplatzGeoeffnet?.();
  }, [springeZuLagerplatzId, storageSlots, canAssignTire, onLagerplatzGeoeffnet]);
  const [editName, setEditName] = useState(selectedWarehouse?.name || "");
  const [editAddress, setEditAddress] = useState(selectedWarehouse?.address || "");
  const [editNote, setEditNote] = useState(selectedWarehouse?.note || "");

  // Einmal gruppieren statt je Lagerplatzkarte den ganzen Radbestand zu durchsuchen.
  const raederJeSatz = raederNachSatz(eingelagerteRaeder);
  const raederVon = (satzId: string): EingelagertesRad[] => raederJeSatz.get(satzId) ?? [];

  function currentAssignment(slotId: string): TireStorage | null {
    const matches = tireStorages.filter((t) => t.storage_slot_id === slotId && !t.removed_at);
    if (matches.length === 0) return null;
    return matches.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }
  function historyFor(slotId: string): TireStorage[] {
    return tireStorages
      .filter((t) => t.storage_slot_id === slotId && !!t.removed_at)
      .sort((a, b) => (b.removed_at || "").localeCompare(a.removed_at || ""));
  }
  // Warum an diesem Platz etwas zu tun ist – leere Liste heißt: nichts. Wird zweimal
  // gebraucht (Punkt an der Kachel, Begründung im Zuordnungsfenster), deshalb hier und
  // nicht in der Kachel.
  function gruendeFuer(satz: TireStorage | null): string[] {
    if (!satz) return [];
    return handlungsgruende(satz, raederVon(satz.id), HANDLUNG_GRENZEN);
  }

  // Die Felder, über die ein Lagerplatz gefunden wird – an EINER Stelle zusammengestellt,
  // damit die Suche über alle Lager und der Filter in der Regalwand dieselben Treffer
  // liefern. Zwei Listen wären zwei Suchen, die sich still voneinander entfernen: Man trägt
  // das Kennzeichen an einer Stelle nach und wundert sich an der anderen.
  //
  // Der Platz-Code steht auch bei einem FREIEN Platz drin. „Wo ist A-14" ist eine legitime
  // Frage, und die Antwort „A-14 ist leer" ist eine Antwort.
  function platzFelder(slot: StorageSlot, satz: TireStorage | null): (string | null | undefined)[] {
    if (!satz) return [slot.code];
    const kunde = customers.find((c) => c.id === satz.customer_id);
    const fahrzeug = satz.vehicle_id ? vehicles.find((v) => v.id === satz.vehicle_id) : null;
    return [
      slot.code, kunde?.name, kunde?.company,
      fahrzeug?.license_plate, fahrzeug?.make_model,
      satz.saison ? SAISON_LABEL[satz.saison] : null, satz.note,
    ];
  }

  function occupiedCount(warehouseId: string): number {
    const slotIds = storageSlots.filter((s) => s.warehouse_id === warehouseId).map((s) => s.id);
    return tireStorages.filter((t) => slotIds.includes(t.storage_slot_id) && !t.removed_at).length;
  }

  async function createWarehouse() {
    if (!newWarehouseName.trim()) return;
    const id = await onAddWarehouse({ name: newWarehouseName.trim(), address: newWarehouseAddress.trim(), note: newWarehouseNote.trim() });
    const codes = buildSlotCodes(newPrefix, parseInt(newStart, 10), parseInt(newEnd, 10), parseInt(newDigits, 10) || 2);
    if (id && codes.length > 0) await onAddSlotsBulk(id, codes);
    setNewWarehouseName(""); setNewWarehouseAddress(""); setNewWarehouseNote("");
    setNewPrefix(""); setNewStart("1"); setNewEnd("10"); setNewDigits("2");
    setShowAddWarehouse(false);
  }

  function startEditWarehouse() {
    if (!selectedWarehouse) return;
    setEditName(selectedWarehouse.name);
    setEditAddress(selectedWarehouse.address || "");
    setEditNote(selectedWarehouse.note || "");
    setEditingWarehouse(true);
  }

  async function saveEditWarehouse() {
    if (!selectedWarehouse || !editName.trim()) return;
    await onUpdateWarehouse(selectedWarehouse.id, { name: editName.trim(), address: editAddress.trim(), note: editNote.trim() });
    setEditingWarehouse(false);
  }

  async function addMoreSlots() {
    if (!selectedWarehouse) return;
    const codes = buildSlotCodes(morePrefix, parseInt(moreStart, 10), parseInt(moreEnd, 10), parseInt(moreDigits, 10) || 2);
    if (codes.length === 0) return;
    await onAddSlotsBulk(selectedWarehouse.id, codes);
    setMorePrefix(""); setMoreStart("1"); setMoreEnd("10"); setMoreDigits("2");
    setShowAddMoreSlots(false);
  }

  // ---------------- Ebene 1: alle Lager ----------------
  if (!selectedWarehouse) {
    // „Wo liegt …?" – die Frage, die im Lager tatsächlich gestellt wird. Sie steht hier oben
    // und nicht erst im geöffneten Lager, weil niemand fragt „ist Müller in Lager 2", sondern
    // „wo ist Müller". Deckel bei 60 Treffern: Wer mehr bekommt, hat nicht gesucht, sondern
    // geblättert – und für Blättern gibt es die Regalwand.
    const trefferListe = suche.trim()
      ? storageSlots
          .map((sl) => ({ slot: sl, satz: currentAssignment(sl.id) }))
          .filter(({ slot, satz }) => suchtreffer(platzFelder(slot, satz), suche))
      : [];

    return (
      <div className="tabpanel active">
        <div className="module-page">
          <div className="module-header">
            <div className="mh-icon"><IconLager /></div>
            <div className="mh-text">
              <h2>Lager</h2>
              <p>{warehouses.length} Lager · {storageSlots.length} Lagerplätze insgesamt</p>
            </div>
          </div>

          <div className="regal-filter">
            <input
              type="search"
              placeholder="Wo liegt …? Kunde, Kennzeichen, Platz"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>

          {suche.trim() !== "" && (
            <>
              <div className="regal-treffer">
                {trefferListe.length === 0
                  ? "Kein Lagerplatz passt dazu."
                  : `${trefferListe.length} ${trefferListe.length === 1 ? "Lagerplatz passt" : "Lagerplätze passen"}`}
              </div>
              <div className="card-grid">
                {trefferListe.slice(0, 60).map(({ slot, satz }) => {
                  const lager = warehouses.find((w) => w.id === slot.warehouse_id);
                  const kunde = satz ? customers.find((c) => c.id === satz.customer_id) : null;
                  const fahrzeug = satz?.vehicle_id ? vehicles.find((v) => v.id === satz.vehicle_id) : null;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className="wh-card"
                      onClick={() => { setSelectedWarehouseId(slot.warehouse_id); setAssignSlot(slot); }}
                    >
                      <div className="wh-name">{slot.code}</div>
                      <div className="wh-sub">{lager?.name || "Unbekanntes Lager"}</div>
                      <div className="wh-stats">
                        <span>
                          {satz
                            ? [kunde?.name, fahrzeug?.license_plate].filter(Boolean).join(" · ") || "belegt"
                            : "frei"}
                        </span>
                        {satz?.saison && <span>{SAISON_LABEL[satz.saison]}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {trefferListe.length > 60 && (
                <div className="regal-treffer">Es werden die ersten 60 gezeigt – bitte genauer suchen.</div>
              )}
            </>
          )}

          {tireStorages.some((t) => !t.removed_at) && (
            <LangliegerListe
              tireStorages={tireStorages}
              customers={customers}
              vehicles={vehicles}
              storageSlots={storageSlots}
              warehouses={warehouses}
              monatspreisNetto={lagergebuehrJeMonat}
              onOpenCustomer={onOpenCustomer}
              onOpenWarehouse={(id) => setSelectedWarehouseId(id)}
            />
          )}

          <div className="card-grid">
            {warehouses.map((w) => {
              const total = storageSlots.filter((s) => s.warehouse_id === w.id).length;
              const occ = occupiedCount(w.id);
              const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
              return (
                <button key={w.id} type="button" className="wh-card" onClick={() => setSelectedWarehouseId(w.id)}>
                  <div className="wh-name">{w.name}</div>
                  {w.address && <div className="wh-sub">📍 {w.address}</div>}
                  <div className="occ-bar"><div className="fill" style={{ width: `${pct}%` }}></div></div>
                  <div className="wh-stats">
                    <span>{occ} von {total} belegt</span>
                    <span>{pct}%</span>
                  </div>
                </button>
              );
            })}
            {canCreateWarehouse && !showAddWarehouse && (
              <button type="button" className="add-card" onClick={() => setShowAddWarehouse(true)}>+ Neues Lager</button>
            )}
            {canCreateWarehouse && showAddWarehouse && (
              <div className="wh-card" style={{ cursor: "default" }}>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="z. B. Nürnberg Hauptlager"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Lageradresse (optional)</label>
                  <input type="text" placeholder="Straße, PLZ Ort" value={newWarehouseAddress} onChange={(e) => setNewWarehouseAddress(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Notiz (optional)</label>
                  <input type="text" placeholder="z. B. Zugang nur über Hof" value={newWarehouseNote} onChange={(e) => setNewWarehouseNote(e.target.value)} />
                </div>
                <hr />
                <label>Lagerplätze gleich anlegen (optional)</label>
                <SlotNumberingFields
                  prefix={newPrefix} setPrefix={setNewPrefix}
                  start={newStart} setStart={setNewStart}
                  end={newEnd} setEnd={setNewEnd}
                  digits={newDigits} setDigits={setNewDigits}
                />
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={createWarehouse}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setShowAddWarehouse(false)}>Abbrechen</button>
                </div>
              </div>
            )}
          </div>

          {warehouses.length === 0 && !showAddWarehouse && (
            <div className="empty">
              {canCreateWarehouse
                ? "Noch kein Lager angelegt. Leg dein erstes Lager an, um Lagerplätze zu verwalten."
                : "Noch kein Lager angelegt. Deine Rolle darf kein Lager anlegen."}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Ebene 2: Lagerplätze eines Lagers ----------------

  // Die Regalwand. Die Anordnung steckt schon in den Platz-Codes – „BC-01" ist der erste
  // Platz in Reihe BC –, deshalb braucht diese Ansicht keine Migration und keine
  // Koordinatenfelder am Lagerplatz. Was im Raum nebeneinander liegt, steht nebeneinander
  // im Code (siehe `nachReihen` in lib/helpers.ts).
  const reihen = nachReihen(slotsInWarehouse);
  // Eine einzelne namenlose Reihe ist keine Reihe, sondern einfach das Lager. Dann die
  // Überschrift weglassen, statt „Ohne Reihe" über alles zu schreiben.
  const zeigeReihenNamen = !(reihen.length === 1 && reihen[0].reihe === "");
  const belegungen = slotsInWarehouse.map((sl) => currentAssignment(sl.id));
  const belegtImLager = belegungen.filter(Boolean).length;
  const mitHandlungsbedarf = belegungen.filter((a) => gruendeFuer(a).length > 0).length;

  // Passt dieser Platz zu dem, was gerade gesucht und gefiltert ist?
  function plattzPasst(slot: StorageSlot, satz: TireStorage | null): boolean {
    if (nurHandlung && gruendeFuer(satz).length === 0) return false;
    return suchtreffer(platzFelder(slot, satz), suche);
  }
  const filterAktiv = suche.trim() !== "" || nurHandlung;
  const passendeAnzahl = slotsInWarehouse.filter((sl) => plattzPasst(sl, currentAssignment(sl.id))).length;
  // Die Reihenliste gilt, wenn das Fenster schmal ist ODER der Nutzer sie gewählt hat.
  // `schmal === null` heißt „noch nicht gemessen" – dann gilt die Wand, wie bisher.
  const alsListe = ansicht === "liste" || (ansicht === "auto" && schmal === true);

  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="breadcrumb" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setSelectedWarehouseId(null)}>Lager</button>
            <span className="sep">›</span>
            <span className="current">{selectedWarehouse.name}</span>
          </div>
          {(canEditWarehouse || canDeleteWarehouse) && (
            <div className="row" style={{ flex: "0 0 auto" }}>
              {canEditWarehouse && (
                <button className="btn-secondary" onClick={() => (editingWarehouse ? setEditingWarehouse(false) : startEditWarehouse())}>
                  {editingWarehouse ? "Bearbeiten abbrechen" : "Lager bearbeiten"}
                </button>
              )}
              {canDeleteWarehouse && (
                <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => {
                  // Fahrplan D3: Bis zum 23.09.2026 ließ sich ein Lager mit vierzig
                  // eingelagerten Kundensätzen mit einem Klick und einer nichtssagenden
                  // Rückfrage löschen. Belegt heißt jetzt: gesperrt, auch in der Datenbank
                  // (Migration 55). Ohne Belegung nennt die Rückfrage, was verloren geht.
                  const belegt = occupiedCount(selectedWarehouse.id);
                  if (belegt > 0) {
                    alert(`Lager "${selectedWarehouse.name}" kann nicht gelöscht werden: ${belegt} ${belegt === 1 ? "Platz ist" : "Plätze sind"} belegt. Erst auslagern oder umlagern.`);
                    return;
                  }
                  const plaetze = storageSlots.filter((sl) => sl.warehouse_id === selectedWarehouse.id);
                  const verlauf = tireStorages.filter((t) => plaetze.some((sl) => sl.id === t.storage_slot_id)).length;
                  const text = `Lager "${selectedWarehouse.name}" wirklich löschen?\n\n`
                    + `Mitgelöscht werden ${plaetze.length} ${plaetze.length === 1 ? "Lagerplatz" : "Lagerplätze"}`
                    + (verlauf > 0 ? ` und der Verlauf von ${verlauf} früheren ${verlauf === 1 ? "Einlagerung" : "Einlagerungen"}.` : ".");
                  if (confirm(text)) { onDeleteWarehouse(selectedWarehouse.id); setSelectedWarehouseId(null); }
                }}>
                  Lager löschen
                </button>
              )}
            </div>
          )}
        </div>

        {editingWarehouse ? (
          <div className="wh-card" style={{ cursor: "default", maxWidth: 420 }}>
            <div className="field" style={{ marginBottom: 4 }}><label>Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 4 }}><label>Lageradresse</label><input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 4 }}><label>Notiz</label><input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
            <div className="row">
              <button className="btn-primary" style={{ flex: 1 }} onClick={saveEditWarehouse}>Speichern</button>
              <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setEditingWarehouse(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="module-header">
            <div className="mh-icon"><IconLager /></div>
            <div className="mh-text">
              <h2>{selectedWarehouse.name}</h2>
              <p>
                {belegtImLager} von {slotsInWarehouse.length} Lagerplätzen belegt
                {mitHandlungsbedarf > 0 ? ` · ${mitHandlungsbedarf} mit Handlungsbedarf` : ""}
                {selectedWarehouse.address ? ` · 📍 ${selectedWarehouse.address}` : ""}
              </p>
              {selectedWarehouse.note && <p>{selectedWarehouse.note}</p>}
            </div>
          </div>
        )}

        {canCreateSlot && (
          <>
            <div className="row" style={{ maxWidth: 420 }}>
              <input type="text" placeholder="Neuer Lagerplatz (z. B. A-01)" value={newSlotCode} onChange={(e) => setNewSlotCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSlotCode.trim()) { onAddSlot(selectedWarehouse.id, newSlotCode.trim()); setNewSlotCode(""); } }} />
              <button
                className="btn-primary"
                style={{ flex: "0 0 auto" }}
                onClick={async () => { if (!newSlotCode.trim()) return; await onAddSlot(selectedWarehouse.id, newSlotCode.trim()); setNewSlotCode(""); }}
              >
                + Platz
              </button>
            </div>

            {!showAddMoreSlots ? (
              <button type="button" className="btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setShowAddMoreSlots(true)}>+ Mehrere Lagerplätze nach Nummerierung anlegen</button>
            ) : (
              <div className="wh-card" style={{ cursor: "default", maxWidth: 420 }}>
                <SlotNumberingFields
                  prefix={morePrefix} setPrefix={setMorePrefix}
                  start={moreStart} setStart={setMoreStart}
                  end={moreEnd} setEnd={setMoreEnd}
                  digits={moreDigits} setDigits={setMoreDigits}
                />
                <div className="row">
                  <button className="btn-primary" style={{ flex: 1 }} onClick={addMoreSlots}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setShowAddMoreSlots(false)}>Abbrechen</button>
                </div>
              </div>
            )}
          </>
        )}

        {slotsInWarehouse.length > 0 && (
          <button
            type="button" className="btn-secondary" style={{ alignSelf: "flex-start" }}
            onClick={() => setAufkleberFuer(slotsInWarehouse)}
          >
            🏷 Aufkleber für alle {slotsInWarehouse.length} Lagerplätze drucken
          </button>
        )}

        {slotsInWarehouse.length === 0 && <div className="empty">Noch keine Lagerplätze in diesem Lager.</div>}

        {slotsInWarehouse.length > 0 && (
          <div className="regal-filter">
            <input
              type="search"
              placeholder="Suchen: Kunde, Kennzeichen, Platz"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
            <label className="filter-schalter">
              <input type="checkbox" checked={nurHandlung} onChange={(e) => setNurHandlung(e.target.checked)} />
              nur Handlungsbedarf{mitHandlungsbedarf > 0 ? ` (${mitHandlungsbedarf})` : ""}
            </label>
            {/* Am schmalen Fenster ist die Wand keine ernsthafte Wahl – zwei Spalten mit
                abgeschnittenen Namen sind genau das, wogegen die Liste gebaut wurde.
                Deshalb erscheint der Umschalter dort gar nicht erst. */}
            {schmal === false && (
              <div className="ansicht-umschalter" role="group" aria-label="Darstellung">
                <button type="button" aria-pressed={!alsListe} onClick={() => setAnsicht("wand")}>Wand</button>
                <button type="button" aria-pressed={alsListe} onClick={() => setAnsicht("liste")}>Liste</button>
              </div>
            )}
          </div>
        )}

        {filterAktiv && (
          <div className="regal-treffer">
            {passendeAnzahl === 0
              ? "Kein Lagerplatz passt dazu."
              : `${passendeAnzahl} von ${slotsInWarehouse.length} Lagerplätzen passen`}
          </div>
        )}

        {slotsInWarehouse.length > 0 && (
          <div className="regal-legende">
            <span><i className="leg-frei" aria-hidden="true" /> frei</span>
            <span><i className="leg-belegt" aria-hidden="true" /> belegt</span>
            <span><i className="leg-punkt" aria-hidden="true" /> hier ist etwas zu tun – antippen zeigt was</span>
          </div>
        )}

        <div className={`regalwand${alsListe ? " liste" : ""}${filterAktiv ? " gefiltert" : ""}`}>
          {reihen.map(({ reihe, plaetze }) => {
            // Eine Reihe, in der gar nichts passt, verschwindet ganz. Einzelne Plätze bleiben
            // dagegen stehen und werden nur zurückgeblendet: Wer „A-14" sucht, will auch
            // sehen, dass links davon A-13 steht. Eine Wand, aus der man Plätze herausnimmt,
            // ist keine Wand mehr.
            const reiheAus = filterAktiv && !plaetze.some((sl) => plattzPasst(sl, currentAssignment(sl.id)));
            return (
            <div className={`regal-reihe${reiheAus ? " reihe-aus" : ""}`} key={reihe || "ohne-reihe"}>
              {zeigeReihenNamen && (
                <div className="reihe-name">{reihe ? `Reihe ${reihe}` : "Ohne Reihe"}</div>
              )}
              <div className="reihe-plaetze">
                {plaetze.map((slot) => {
                  const assignment = currentAssignment(slot.id);
                  return (
                    <Regalplatz
                      key={slot.id}
                      aus={filterAktiv && !plattzPasst(slot, assignment)}
                      slot={slot}
                      assignment={assignment}
                      kunde={assignment ? customers.find((c) => c.id === assignment.customer_id) ?? null : null}
                      fahrzeug={assignment?.vehicle_id ? vehicles.find((v) => v.id === assignment.vehicle_id) ?? null : null}
                      raeder={assignment ? raederVon(assignment.id) : []}
                      gruende={gruendeFuer(assignment)}
                      canAssign={canAssignTire}
                      canDelete={canDeleteSlot}
                      onOeffnen={() => setAssignSlot(slot)}
                      onAufkleber={() => setAufkleberFuer([slot])}
                      verlauf={historyFor(slot.id).length}
                      onLoeschen={() => onDeleteSlot(slot.id)}
                    />
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {aufkleberFuer && (
        <LagerplatzAufkleber
          slots={aufkleberFuer}
          lagerName={selectedWarehouse?.name || ""}
          onClose={() => setAufkleberFuer(null)}
        />
      )}

      {assignSlot && (
        <TireAssignModal
          slot={assignSlot}
          customers={customers}
          assignment={currentAssignment(assignSlot.id)}
          gruende={gruendeFuer(currentAssignment(assignSlot.id))}
          history={historyFor(assignSlot.id)}
          raederFuer={raederVon}
          onClose={() => setAssignSlot(null)}
          vehicles={vehicles}
          onAssign={onAssignTire}
          onRemove={onRemoveAssignment}
          onEtikett={onEtikett}
        />
      )}
    </div>
  );
}

// Ein Platz an der Regalwand – dieselbe Komponente für beide Darstellungen.
//
// Breit wird daraus eine Kachel (Code, Kunde, Kennzeichen, Zustand untereinander), schmal
// eine Zeile über die volle Breite. Der Unterschied steht vollständig im Stilblatt
// (app/globals.css, „Regalwand"); hier gibt es dafür weder eine Verzweigung noch einen
// Zustand. Das ist Absicht: Eine zweite Komponente für die Handyansicht wäre eine zweite
// Stelle, an der man das Kennzeichen vergessen kann.
//
// Warum ein div mit role="button" und nicht ein <button>: In der Kachel stecken zwei eigene
// Knöpfe (Aufkleber, Löschen). Ein Knopf im Knopf ist ungültiges HTML – das alte
// Kachelgitter hatte genau das. Tastaturbedienung ist deshalb hier von Hand nachgezogen.
function Regalplatz({ slot, assignment, kunde, fahrzeug, raeder, gruende, aus, canAssign, canDelete, verlauf, onOeffnen, onAufkleber, onLoeschen }: {
  slot: StorageSlot;
  assignment: TireStorage | null;
  kunde: Customer | null;
  fahrzeug: Vehicle | null;
  raeder: EingelagertesRad[];
  // Warum hier etwas zu tun ist. Leer heißt: nichts – dann erscheint auch kein Punkt.
  gruende: string[];
  // Passt dieser Platz NICHT zu Suche/Filter? Dann bleibt er stehen und wird nur
  // zurückgeblendet – das Stilblatt entscheidet, ob das Ausgrauen oder Ausblenden heißt.
  aus?: boolean;
  canAssign: boolean;
  canDelete: boolean;
  // Wie viele FRÜHERE Einlagerungen auf diesem Platz lagen. Sie gehen beim Löschen mit
  // (die Datenbank löscht sie über den Fremdschlüssel mit) – das steht in der Rückfrage.
  verlauf: number;
  onOeffnen: () => void;
  onAufkleber: () => void;
  onLoeschen: () => void;
}) {
  const belegt = !!assignment;
  const kennzeichen = [fahrzeug?.license_plate, fahrzeug?.make_model].filter(Boolean).join(" · ");

  function oeffnen() {
    if (canAssign) onOeffnen();
  }

  const klassen = [
    "regalplatz",
    belegt ? "belegt" : "frei",
    canAssign ? "" : "nicht-klickbar",
    aus ? "platz-aus" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={klassen}
      role={canAssign ? "button" : undefined}
      // Ein zurückgeblendeter Platz ist nicht anklickbar (Stilblatt) – dann darf er auch
      // nicht mit der Tabulatortaste erreichbar sein. Sonst landet der Fokus auf etwas,
      // das man sieht, aber nicht bedienen kann.
      tabIndex={canAssign && !aus ? 0 : undefined}
      aria-label={`Lagerplatz ${slot.code}${belegt ? ` – ${kunde?.name ?? "belegt"}` : " – frei"}`}
      onClick={oeffnen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); oeffnen(); }
      }}
      // In der Kachel wird ein langer Name mit Auslassungspunkten gekürzt – die feste Höhe
      // hält das Raster zusammen. Damit er trotzdem erreichbar bleibt, steht er hier im
      // Tooltip, zusammen mit dem, was an diesem Platz zu tun ist.
      title={[
        belegt ? [kunde?.name, kennzeichen].filter(Boolean).join(" · ") : null,
        ...gruende,
        canAssign ? null : "Deine Rolle darf keine Reifen zuordnen.",
      ].filter(Boolean).join(" · ") || undefined}
    >
      <span className="rp-code">
        {gruende.length > 0 && <span className="rp-punkt" aria-hidden="true" />}
        {slot.code}
      </span>

      {belegt ? (
        <span className="rp-wer">
          <b>{kunde ? kunde.name : "Unbekannter Kunde"}</b>
          {kennzeichen && <span>{kennzeichen}</span>}
        </span>
      ) : (
        <span className="rp-frei">frei</span>
      )}

      <span className="rp-meta">
        {assignment && (
          <>
            <span>{assignment.dot_date ? `DOT ${assignment.dot_date}` : "DOT –"}</span>
            <ProfilMarke satz={assignment} raeder={raeder} praefix="" />
          </>
        )}
      </span>

      <span className="rp-tools">
        <button
          type="button"
          className="btn-secondary"
          title={`Aufkleber für ${slot.code} drucken`}
          onClick={(e) => { e.stopPropagation(); onAufkleber(); }}
        >
          🏷
        </button>
        {canDelete && (
          <button
            type="button"
            className="btn-secondary"
            title={`Lagerplatz ${slot.code} löschen`}
            onClick={(e) => {
              e.stopPropagation();
              // Fahrplan D3: Ein belegter Platz wird nicht gelöscht – das erzwingt seit
              // Migration 55 auch die Datenbank. Hier steht es vorher, damit niemand erst
              // bestätigt und dann eine Fehlermeldung bekommt.
              if (belegt) {
                alert(`Lagerplatz "${slot.code}" ist belegt${kunde ? ` (${kunde.name})` : ""}. Erst den Satz auslagern oder umlagern, dann löschen.`);
                return;
              }
              const zusatz = verlauf > 0
                ? `\n\nAuf diesem Platz lagen früher ${verlauf} ${verlauf === 1 ? "Satz" : "Sätze"}. Dieser Verlauf wird mitgelöscht.`
                : "";
              if (confirm(`Lagerplatz "${slot.code}" wirklich löschen?${zusatz}`)) onLoeschen();
            }}
          >
            <IconTrash />
          </button>
        )}
      </span>
    </div>
  );
}

function TireAssignModal({ slot, customers, vehicles, assignment, gruende, history, raederFuer, onClose, onAssign, onRemove, onEtikett }: {
  slot: StorageSlot; customers: Customer[]; vehicles: Vehicle[]; assignment: TireStorage | null; history: TireStorage[];
  // Warum an der Kachel ein oranger Punkt sitzt. Der Punkt sagt „etwas", diese Liste „was" –
  // wer den Platz öffnet, soll es nicht raten müssen.
  gruende: string[];
  // Die Räder eines Satzes – auch für die Historie, deren Räder beim Auslagern erhalten
  // bleiben (entfernt wird die Einlagerung, nicht ihre Messwerte).
  raederFuer: (satzId: string) => EingelagertesRad[];
  onClose: () => void;
  onAssign: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onEtikett: (einlagerungId: string) => void;
}) {
  const [customerId, setCustomerId] = useState(assignment?.customer_id || "");
  const [vehicleId, setVehicleId] = useState(assignment?.vehicle_id || "");
  const [saison, setSaison] = useState<Saison | "">(assignment?.saison || "");
  const [dotDate, setDotDate] = useState(assignment?.dot_date || "");
  const [profiltiefe, setProfiltiefe] = useState(assignment?.profiltiefe_mm != null ? String(assignment.profiltiefe_mm) : "");
  const [note, setNote] = useState(assignment?.note || "");
  const [saving, setSaving] = useState(false);

  // Nur die Fahrzeuge des gewählten Kunden. Ein Satz kann nur zu einem Auto DIESES Kunden
  // gehören – die Datenbank lehnt alles andere ab (Migration 30), und eine Auswahl, die
  // Ungültiges anbietet, ist eine Einladung zum Fehler.
  const kundenFahrzeuge = customerId ? vehicles.filter((v) => v.customer_id === customerId) : [];
  const einzeln = (assignment?.erfassungsart ?? "sammel") === "einzeln";

  async function save() {
    if (!customerId) return;
    setSaving(true);
    await onAssign({
      id: assignment?.id, storageSlotId: slot.id, customerId,
      dotDate, profiltiefeMm: profiltiefe, note,
      // Beim Kundenwechsel darf kein Fahrzeug des Vorgängers hängenbleiben.
      vehicleId: kundenFahrzeuge.some((v) => v.id === vehicleId) ? vehicleId : null,
      saison: saison || null,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Lagerplatz {slot.code}</h2>
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

        <div className="row">
          <div className="field">
            <label>DOT-Datum</label>
            <input type="text" placeholder="z. B. 2523 (KW 25 / 2023)" value={dotDate} onChange={(e) => setDotDate(e.target.value)} />
          </div>
          {/* Bei Einzelerfassung gibt es hier bewusst kein Eingabefeld: Die Profiltiefe steht
              dann an den Rädern, und ein zweiter Wert am Satz ist in der Datenbank verboten
              (Migration 33). Ein Feld anzubieten, dessen Inhalt beim Speichern abgelehnt wird,
              wäre eine Falle. */}
          {!einzeln && (
            <div className="field">
              <label>Profiltiefe (mm)</label>
              <input type="number" step="0.5" min="0" placeholder="z. B. 6.5" value={profiltiefe} onChange={(e) => setProfiltiefe(e.target.value)} />
            </div>
          )}
        </div>

        {einzeln && assignment && (
          <div className="field">
            <label>Profiltiefe – dieser Satz ist einzeln erfasst</label>
            <RadBild
              raeder={raederFuer(assignment.id)}
              anzahlRaeder={assignment.anzahl_raeder ?? 4}
              gesperrt
              onSpeichern={async () => {}}
              onEntfernen={async () => {}}
            />
            <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
              Geändert wird das im Auftragsfenster – dort, wo der Satz in der Hand liegt.
            </div>
          </div>
        )}
        <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary btn-block" disabled={!customerId || saving} onClick={save}>
          {assignment ? "Zuordnung speichern" : "Reifen einlagern"}
        </button>
        {assignment && (
          <button
            className="btn-secondary btn-block"
            style={{ marginTop: 8 }}
            onClick={() => onEtikett(assignment.id)}
          >
            Etikett nachdrucken
          </button>
        )}
        {assignment && (
          <button
            className="btn-secondary btn-block"
            style={{ marginTop: 8, color: "#b33" }}
            onClick={() => { if (confirm("Zuordnung wirklich entfernen? Der Lagerplatz wird wieder frei.")) { onRemove(assignment.id); onClose(); } }}
          >
            Zuordnung entfernen
          </button>
        )}

        {history.length > 0 && (
          <>
            <h4>Historie dieses Lagerplatzes</h4>
            <div style={{ maxHeight: 160, overflowY: "auto" }}>
              {history.map((h) => {
                const cust = customers.find((c) => c.id === h.customer_id);
                return (
                  <div key={h.id} className="hist-entry">
                    <span className="he-cust">{cust ? cust.name : "Unbekannter Kunde"}</span>
                    {h.saison ? ` · ${SAISON_LABEL[h.saison]}` : ""}
                    {h.dot_date ? ` · DOT ${h.dot_date}` : ""}
                    {" "}
                    <ProfilMarke satz={h} raeder={raederFuer(h.id)} praefix="" />
                    <br />
                    eingelagert {formatDate(h.created_at.slice(0, 10))} · entfernt {h.removed_at ? formatDate(h.removed_at.slice(0, 10)) : "–"}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

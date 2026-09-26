import { useEffect, useState } from "react";
import type { Customer, EingelagertesRad, Saison, StorageSlot, TireStorage, Vehicle, Verkaufsreifen, VerkaufsreifenFelder, Warehouse } from "@/lib/types";
import {
  DOT_ALT_JAHRE, LAGERDAUER_HINWEIS_TAGE, PROFIL_KRITISCH_MM,
  SAISON_LABEL, SAISON_LISTE,
} from "@/lib/constants";
import { handlungsgruende, nachReihen, raederNachSatz, suchtreffer } from "@/lib/helpers";
import { passtZumFilter, reiheTitel, scanZiel, type LagerFilter } from "@/lib/lagerAnsicht";
import { CustomerPicker } from "@/components/CustomerPicker";
import { QrScanner } from "@/components/QrScanner";
import { LagerplatzAufkleber } from "./LagerplatzAufkleber";
import { LangliegerListe } from "./LangliegerListe";
import { PlatzBlatt } from "./PlatzBlatt";
import { ProfilMarke } from "./ProfilMarke";
import { RadBild } from "./RadBild";
import { VerkaufPanel } from "./VerkaufPanel";
import { groesseText, reifenFrei, reifenName } from "@/lib/reifenverkauf";

// Lager-Modul, neu gestaltet am 26.09.2026 (Entwurf „H · Lager", docs/lager.md).
//
// Vorher zwei Ebenen: erst eine Übersicht aller Lager als Kacheln, dann nach Klick die
// Regalwand eines Lagers. Jetzt EINE Seite: oben die Suche über alle Lager, der Scan-Knopf und
// die Lager als Umschalter; darunter die Zahlen des gewählten Lagers, eine Zeile Filter und je
// Reihe eine Karte mit kleiner Regalwand, die sich zu den Plätzen aufklappt. Ein Platz öffnet
// ein Blatt (PlatzBlatt.tsx) statt gleich das Bearbeitungsfenster.

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

export function LagerPanel({ customers, vehicles, warehouses, storageSlots, tireStorages, eingelagerteRaeder, lagergebuehrJeMonat, onOpenCustomer, onAddWarehouse, onUpdateWarehouse, onDeleteWarehouse, onAddSlot, onAddSlotsBulk, onDeleteSlot, onAssignTire, onRemoveAssignment, onEtikett, canCreateWarehouse, canEditWarehouse, canDeleteWarehouse, canCreateSlot, canDeleteSlot, canAssignTire, springeZuLagerplatzId, onLagerplatzGeoeffnet, verkauf }: {
  // Reifenverkauf (Migration 61). Null = kein Leserecht auf „Lager · Reifenverkauf" – dann gibt
  // es den Reiter nicht. Plätze mit Verkaufsreifen sperrt die Datenbank trotzdem für Kundensätze.
  verkauf: {
    verkaufsreifen: Verkaufsreifen[];
    darfSchreiben: boolean;
    darfLoeschen: boolean;
    onSpeichern: (felder: VerkaufsreifenFelder, id: string | null) => Promise<void>;
    onLoeschen: (id: string) => Promise<void>;
  } | null;
  customers: Customer[];
  // Alle Kundenfahrzeuge. Das Lager-Modul arbeitet nicht mit einem geöffneten Kunden, sondern
  // mit vielen Sätzen nebeneinander – deshalb hier der Vollabzug statt der Ausschnitt je Kunde.
  vehicles: Vehicle[]; warehouses: Warehouse[]; storageSlots: StorageSlot[]; tireStorages: TireStorage[];
  // Für die Langlieger-Übersicht (Fahrplan E4) und die Gebühr im Platz-Blatt: der heute
  // gültige Monatspreis der Lagergebühr (null = keiner gepflegt) und der Weg ins Kundenfenster.
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
  // Auslagern. Führt in app/page.tsx über den Auslagern-Dialog (Gebühr, Migration 46) – die
  // Entscheidung „mit oder ohne Dialog" steht dort, nicht hier.
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
  // dazu wird mit ausgewählt. `onLagerplatzGeoeffnet` meldet zurück, dass der Sprung erledigt ist.
  springeZuLagerplatzId?: string | null;
  onLagerplatzGeoeffnet?: () => void;
}) {
  // Welches Lager gezeigt wird. `null` = das erste – so steht beim Öffnen sofort ein Lager da,
  // statt einer Übersicht, die man erst wegklicken muss.
  const [gewaehltesLagerId, setGewaehltesLagerId] = useState<string | null>(null);
  const lager = warehouses.find((w) => w.id === gewaehltesLagerId) ?? warehouses[0] ?? null;
  const plaetzeImLager = lager ? storageSlots.filter((s) => s.warehouse_id === lager.id) : [];

  // „Wo liegt …?" sucht über ALLE Lager – niemand fragt „ist Müller in Lager 2", sondern „wo ist
  // Müller". Der Filter darunter gilt für das gewählte Lager.
  const [suche, setSuche] = useState("");
  const [filter, setFilterRoh] = useState<LagerFilter>("alle");
  // Aufgeklappte Reihen, Schlüssel „Lager|Reihe". Fehlt ein Schlüssel, gilt die Vorgabe: ohne
  // Filter nur die erste Reihe, mit Filter alle – wer filtert, will die Treffer sehen.
  const [offen, setOffen] = useState<Record<string, boolean>>({});
  const setFilter = (f: LagerFilter) => { setFilterRoh(f); setOffen({}); };

  const [blattSlotId, setBlattSlotId] = useState<string | null>(null);
  const [bearbeitenSlot, setBearbeitenSlot] = useState<StorageSlot | null>(null);
  // Lagerplätze, für die gerade ein Aufkleberbogen offen ist: ein einzelner Platz beim
  // Nachdruck, alle Plätze eines Lagers bei der Erstausstattung.
  const [aufkleberFuer, setAufkleberFuer] = useState<StorageSlot[] | null>(null);
  // Das Blatt hinter „⋯": erst die Liste, dann das jeweilige Formular.
  const [menue, setMenue] = useState<null | "liste" | "bearbeiten" | "plaetze" | "neu">(null);
  const [scannerOffen, setScannerOffen] = useState(false);
  // Einlagerung (Kundensätze, Regalwand) oder Verkauf (Migration 61).
  const [ansicht, setAnsicht] = useState<"einlagerung" | "verkauf">("einlagerung");
  const [verkaufOeffneId, setVerkaufOeffneId] = useState<string | null>(null);
  const [scanHinweis, setScanHinweis] = useState<string | null>(null);

  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseAddress, setNewWarehouseAddress] = useState("");
  const [newWarehouseNote, setNewWarehouseNote] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newStart, setNewStart] = useState("1");
  const [newEnd, setNewEnd] = useState("10");
  const [newDigits, setNewDigits] = useState("2");
  const [newSlotCode, setNewSlotCode] = useState("");
  const [morePrefix, setMorePrefix] = useState("");
  const [moreStart, setMoreStart] = useState("1");
  const [moreEnd, setMoreEnd] = useState("10");
  const [moreDigits, setMoreDigits] = useState("2");
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNote, setEditNote] = useState("");

  // Kommt die App über einen gescannten Aufkleber (?lagerplatz=…), wird das passende Lager
  // gewählt und das Blatt des Platzes geöffnet. Läuft erst, wenn die Lagerplätze geladen
  // sind – deshalb hängt der Effekt an `storageSlots` und nicht nur an der Kennung.
  useEffect(() => {
    if (!springeZuLagerplatzId) return;
    const platz = storageSlots.find((sl) => sl.id === springeZuLagerplatzId);
    if (!platz) return;
    setGewaehltesLagerId(platz.warehouse_id);
    setBlattSlotId(platz.id);
    onLagerplatzGeoeffnet?.();
  }, [springeZuLagerplatzId, storageSlots, onLagerplatzGeoeffnet]);

  // Einmal gruppieren statt je Platz den ganzen Radbestand zu durchsuchen.
  const raederJeSatz = raederNachSatz(eingelagerteRaeder);
  const raederVon = (satzId: string): EingelagertesRad[] => raederJeSatz.get(satzId) ?? [];

  function currentAssignment(slotId: string): TireStorage | null {
    const matches = tireStorages.filter((t) => t.storage_slot_id === slotId && !t.removed_at);
    if (matches.length === 0) return null;
    return matches.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }
  // Verkaufsreifen, die auf diesem Platz liegen (Migration 61). Ein Platz mit Verkaufsreifen ist
  // belegt – für Kundensätze gesperrt, das entscheidet auch die Datenbank.
  const verkaufsreifen = verkauf?.verkaufsreifen ?? [];
  const verkaufJePlatz = new Map<string, Verkaufsreifen[]>();
  for (const v of verkaufsreifen) {
    if (v.bestand <= 0 || !v.storage_slot_id) continue;
    verkaufJePlatz.set(v.storage_slot_id, [...(verkaufJePlatz.get(v.storage_slot_id) ?? []), v]);
  }
  const verkaufAuf = (slotId: string): Verkaufsreifen[] => verkaufJePlatz.get(slotId) ?? [];
  function verkaufOeffnen(postenId: string | null) {
    setAnsicht("verkauf");
    setVerkaufOeffneId(postenId);
  }
  function historyFor(slotId: string): TireStorage[] {
    return tireStorages
      .filter((t) => t.storage_slot_id === slotId && !!t.removed_at)
      .sort((a, b) => (b.removed_at || "").localeCompare(a.removed_at || ""));
  }
  // Warum an diesem Platz etwas zu tun ist – leere Liste heißt: nichts.
  function gruendeFuer(satz: TireStorage | null): string[] {
    if (!satz) return [];
    return handlungsgruende(satz, raederVon(satz.id), HANDLUNG_GRENZEN);
  }

  // Die Felder, über die ein Lagerplatz gefunden wird. Der Platz-Code steht auch bei einem
  // FREIEN Platz drin: „Wo ist A-14" ist eine legitime Frage, und „A-14 ist leer" eine Antwort.
  function platzFelder(slot: StorageSlot, satz: TireStorage | null): (string | null | undefined)[] {
    if (!satz) return [slot.code, ...verkaufAuf(slot.id).flatMap((v) => [reifenName(v), groesseText(v), "Verkauf"])];
    const kunde = customers.find((c) => c.id === satz.customer_id);
    const fahrzeug = satz.vehicle_id ? vehicles.find((v) => v.id === satz.vehicle_id) : null;
    return [
      slot.code, kunde?.name, kunde?.company,
      fahrzeug?.license_plate, fahrzeug?.make_model,
      satz.saison ? SAISON_LABEL[satz.saison] : null, satz.note,
    ];
  }

  function occupiedCount(warehouseId: string): number {
    const slotIds = new Set(storageSlots.filter((s) => s.warehouse_id === warehouseId).map((s) => s.id));
    const saetze = tireStorages.filter((t) => slotIds.has(t.storage_slot_id) && !t.removed_at).length;
    const nurVerkauf = [...slotIds].filter((id) => verkaufJePlatz.has(id) && !currentAssignment(id)).length;
    return saetze + nurVerkauf;
  }

  function platzOeffnen(slot: StorageSlot) {
    setGewaehltesLagerId(slot.warehouse_id);
    setBlattSlotId(slot.id);
  }

  // Der Scan-Knopf nimmt Regal-Aufkleber UND Satz-Etikett (lib/lagerAnsicht.ts, `scanZiel`).
  function gescannt(text: string) {
    setScannerOffen(false);
    const ziel = scanZiel(text, storageSlots, tireStorages);
    if (ziel.art === "platz") {
      const platz = storageSlots.find((sl) => sl.id === ziel.slotId);
      if (platz) { setSuche(""); setScanHinweis(null); platzOeffnen(platz); }
      return;
    }
    if (ziel.art === "kunde") {
      setScanHinweis("Dieser Satz ist schon ausgelagert – er liegt auf keinem Platz mehr.");
      onOpenCustomer?.(ziel.kundeId);
      return;
    }
    setScanHinweis(ziel.art === "unbekannt"
      ? "Diesen Platz oder Satz gibt es in der App nicht (mehr)."
      : "Das war kein PinPoints-Aufkleber.");
  }

  async function createWarehouse() {
    if (!newWarehouseName.trim()) return;
    const id = await onAddWarehouse({ name: newWarehouseName.trim(), address: newWarehouseAddress.trim(), note: newWarehouseNote.trim() });
    const codes = buildSlotCodes(newPrefix, parseInt(newStart, 10), parseInt(newEnd, 10), parseInt(newDigits, 10) || 2);
    if (id && codes.length > 0) await onAddSlotsBulk(id, codes);
    setNewWarehouseName(""); setNewWarehouseAddress(""); setNewWarehouseNote("");
    setNewPrefix(""); setNewStart("1"); setNewEnd("10"); setNewDigits("2");
    if (id) setGewaehltesLagerId(id);
    setMenue(null);
  }

  function startEditWarehouse() {
    if (!lager) return;
    setEditName(lager.name);
    setEditAddress(lager.address || "");
    setEditNote(lager.note || "");
    setMenue("bearbeiten");
  }

  async function saveEditWarehouse() {
    if (!lager || !editName.trim()) return;
    await onUpdateWarehouse(lager.id, { name: editName.trim(), address: editAddress.trim(), note: editNote.trim() });
    setMenue(null);
  }

  async function addMoreSlots() {
    if (!lager) return;
    const codes = buildSlotCodes(morePrefix, parseInt(moreStart, 10), parseInt(moreEnd, 10), parseInt(moreDigits, 10) || 2);
    if (codes.length === 0) return;
    await onAddSlotsBulk(lager.id, codes);
    setMorePrefix(""); setMoreStart("1"); setMoreEnd("10"); setMoreDigits("2");
    setMenue(null);
  }

  async function addOneSlot() {
    if (!lager || !newSlotCode.trim()) return;
    await onAddSlot(lager.id, newSlotCode.trim());
    setNewSlotCode("");
  }

  function lagerLoeschen() {
    if (!lager) return;
    // Fahrplan D3: Belegt heißt gesperrt, auch in der Datenbank (Migration 55). Ohne Belegung
    // nennt die Rückfrage, was verloren geht.
    const belegt = occupiedCount(lager.id);
    const verkaufHier = verkaufsreifen.filter((v) => v.warehouse_id === lager.id && v.bestand > 0).length;
    if (verkaufHier > 0) {
      alert(`Lager "${lager.name}" kann nicht gelöscht werden: Dort liegen noch ${verkaufHier} Posten Verkaufsreifen. Erst umlagern oder den Bestand auf 0 setzen.`);
      return;
    }
    if (belegt > 0) {
      alert(`Lager "${lager.name}" kann nicht gelöscht werden: ${belegt} ${belegt === 1 ? "Platz ist" : "Plätze sind"} belegt. Erst auslagern oder umlagern.`);
      return;
    }
    const verlauf = tireStorages.filter((t) => plaetzeImLager.some((sl) => sl.id === t.storage_slot_id)).length;
    const text = `Lager "${lager.name}" wirklich löschen?\n\n`
      + `Mitgelöscht werden ${plaetzeImLager.length} ${plaetzeImLager.length === 1 ? "Lagerplatz" : "Lagerplätze"}`
      + (verlauf > 0 ? ` und der Verlauf von ${verlauf} früheren ${verlauf === 1 ? "Einlagerung" : "Einlagerungen"}.` : ".");
    if (confirm(text)) { onDeleteWarehouse(lager.id); setGewaehltesLagerId(null); setMenue(null); }
  }

  // ---------------------------------------------------------------- Zahlen
  const belegtGesamt = tireStorages.filter((t) => !t.removed_at && storageSlots.some((s) => s.id === t.storage_slot_id)).length;
  const belegungen = plaetzeImLager.map((sl) => ({ slot: sl, satz: currentAssignment(sl.id) }));
  const belegtImLager = belegungen.filter((b) => b.satz || verkaufJePlatz.has(b.slot.id)).length;
  const freiImLager = plaetzeImLager.length - belegtImLager;
  const zuPruefen = belegungen.filter((b) => gruendeFuer(b.satz).length > 0).length;
  const reihen = nachReihen(plaetzeImLager);
  const hatMenue = (lager && (canEditWarehouse || canCreateSlot || canDeleteWarehouse || plaetzeImLager.length > 0)) || canCreateWarehouse;

  const trefferListe = suche.trim()
    ? storageSlots
        .map((sl) => ({ slot: sl, satz: currentAssignment(sl.id) }))
        .filter(({ slot, satz }) => suchtreffer(platzFelder(slot, satz), suche))
    : [];

  // Eine Zeile für einen Platz – in der Suche und in der aufgeklappten Reihe dieselbe.
  function platzZeile(slot: StorageSlot, satz: TireStorage | null, mitLager: boolean) {
    const verkaufHier = satz ? [] : verkaufAuf(slot.id);
    if (verkaufHier.length > 0) {
      const lagerName = mitLager ? warehouses.find((w) => w.id === slot.warehouse_id)?.name : null;
      const erster = verkaufHier[0];
      const frei = verkaufHier.reduce((n, v) => n + reifenFrei(v), 0);
      return (
        <button key={slot.id} type="button" className="lg-zeile" onClick={() => verkaufOeffnen(erster.id)}>
          <span className="lg-code verkauf">{slot.code}</span>
          <span className="lg-zeile-text">
            <span className="lg-zeile-kunde">
              {verkaufHier.length === 1 ? `Verkauf: ${erster.bestand}× ${reifenName(erster)}` : `Verkauf: ${verkaufHier.length} Posten`}
            </span>
            <span className="lg-zeile-info">
              {[lagerName, verkaufHier.map((v) => groesseText(v)).filter((t, i, a) => a.indexOf(t) === i).join(", "), `${frei} frei`].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      );
    }
    const kunde = satz ? customers.find((c) => c.id === satz.customer_id) : null;
    const fahrzeug = satz?.vehicle_id ? vehicles.find((v) => v.id === satz.vehicle_id) : null;
    const gruende = gruendeFuer(satz);
    const lagerName = mitLager ? warehouses.find((w) => w.id === slot.warehouse_id)?.name : null;
    const info = satz
      ? [lagerName, fahrzeug?.license_plate, satz.saison ? SAISON_LABEL[satz.saison] : null, fahrzeug?.tire_size].filter(Boolean).join(" · ")
      : [lagerName, canAssignTire ? "antippen zum Einlagern" : null].filter(Boolean).join(" · ");
    return (
      <button key={slot.id} type="button" className={"lg-zeile" + (satz ? "" : " frei")} onClick={() => platzOeffnen(slot)}>
        <span className={"lg-code" + (satz ? "" : " frei") + (gruende.length ? " pruefen" : "")}>{slot.code}</span>
        <span className="lg-zeile-text">
          <span className="lg-zeile-kunde">{satz ? (kunde?.name ?? "Unbekannter Kunde") : "frei"}</span>
          {info && <span className="lg-zeile-info">{info}</span>}
          {gruende.length > 0 && <span className="lg-zeile-grund">{gruende.join(" · ")}</span>}
        </span>
        {satz && <ProfilMarke satz={satz} raeder={raederVon(satz.id)} praefix="" />}
      </button>
    );
  }

  const blattSlot = blattSlotId ? storageSlots.find((sl) => sl.id === blattSlotId) ?? null : null;
  const blattSatz = blattSlot ? currentAssignment(blattSlot.id) : null;

  return (
    <div className="tabpanel active">
      <div className="module-page lg-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Lager</h2>
              <span className="lg-unter">
                {warehouses.length > 1
                  ? `${warehouses.length} Lager · ${storageSlots.length} Plätze · ${belegtGesamt} ${belegtGesamt === 1 ? "Satz" : "Sätze"} eingelagert`
                  : lager ? `${lager.name} · ${plaetzeImLager.length} Plätze · ${belegtImLager} eingelagert` : "noch kein Lager"}
              </span>
            </div>
            {hatMenue && (
              <button type="button" className="lg-rund" onClick={() => setMenue("liste")} aria-label="Lager verwalten" title="Lager verwalten">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
              </button>
            )}
          </div>
          {verkauf && (
            <div className="lg-lagerwahl lg-ansicht" role="group" aria-label="Ansicht">
              <button type="button" className={ansicht === "einlagerung" ? "aktiv" : ""} aria-pressed={ansicht === "einlagerung"} onClick={() => setAnsicht("einlagerung")}>
                Einlagerung
              </button>
              <button type="button" className={ansicht === "verkauf" ? "aktiv" : ""} aria-pressed={ansicht === "verkauf"} onClick={() => setAnsicht("verkauf")}>
                Verkauf <span className="lg-lagerwahl-zahl">{verkaufsreifen.reduce((n, v) => n + reifenFrei(v), 0)}</span>
              </button>
            </div>
          )}
          {ansicht === "einlagerung" && <>
          <div className="lg-suche">
            <label className="lg-suchfeld">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input type="search" placeholder="Kunde, Kennzeichen, Platz …" value={suche}
                onChange={(e) => setSuche(e.target.value)} aria-label="Wo liegt …? Kunde, Kennzeichen, Platz" />
            </label>
            <button type="button" className="lg-scan" onClick={() => { setScanHinweis(null); setScannerOffen(true); }} aria-label="Aufkleber scannen" title="Regal-Aufkleber oder Satz-Etikett scannen">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9h2v2H8zM14 9h2v2h-2zM8 14h2v2H8zM13 13h3v3" /></svg>
            </button>
          </div>
          {!suche.trim() && warehouses.length > 1 && (
            <div className="lg-lagerwahl" role="group" aria-label="Lager wählen">
              {warehouses.map((w) => {
                const gesamt = storageSlots.filter((s) => s.warehouse_id === w.id).length;
                return (
                  <button key={w.id} type="button" className={lager?.id === w.id ? "aktiv" : ""}
                    onClick={() => { setGewaehltesLagerId(w.id); setOffen({}); }}>
                    {w.name} <span className="lg-lagerwahl-zahl">{occupiedCount(w.id)}/{gesamt}</span>
                  </button>
                );
              })}
            </div>
          )}
          </>}
        </div>

        {ansicht === "verkauf" && verkauf ? (
          <VerkaufPanel
            verkaufsreifen={verkauf.verkaufsreifen}
            warehouses={warehouses}
            storageSlots={storageSlots}
            platzBelegt={new Set(tireStorages.filter((t) => !t.removed_at).map((t) => t.storage_slot_id))}
            darfSchreiben={verkauf.darfSchreiben}
            darfLoeschen={verkauf.darfLoeschen}
            oeffneId={verkaufOeffneId}
            onGeoeffnet={() => setVerkaufOeffneId(null)}
            onSpeichern={verkauf.onSpeichern}
            onLoeschen={verkauf.onLoeschen}
          />
        ) : <>
        {scanHinweis && (
          <div className="lg-hinweis" role="status">
            <span>{scanHinweis}</span>
            <button type="button" onClick={() => setScanHinweis(null)} aria-label="Hinweis schließen">✕</button>
          </div>
        )}

        {suche.trim() ? (
          <div className="lg-treffer">
            <span className="lg-gruppe-titel">
              {trefferListe.length === 0
                ? "KEIN PLATZ PASST DAZU"
                : `${trefferListe.length} ${trefferListe.length === 1 ? "PLATZ" : "PLÄTZE"}${warehouses.length > 1 ? " IN ALLEN LAGERN" : ""}`}
            </span>
            {trefferListe.slice(0, 60).map(({ slot, satz }) => platzZeile(slot, satz, warehouses.length > 1))}
            {trefferListe.length > 60 && <span className="small">Es werden die ersten 60 gezeigt – bitte genauer suchen.</span>}
          </div>
        ) : !lager ? (
          <div className="db-karte">
            <div className="db-leer">
              {canCreateWarehouse
                ? "Noch kein Lager angelegt. Leg dein erstes Lager an, um Lagerplätze zu verwalten."
                : "Noch kein Lager angelegt. Deine Rolle darf kein Lager anlegen."}
            </div>
            {canCreateWarehouse && <button type="button" className="lg-knopf primaer" style={{ marginTop: 10 }} onClick={() => setMenue("neu")}>Neues Lager anlegen</button>}
          </div>
        ) : (
          <>
            {(lager.address || lager.note) && (
              <span className="lg-adresse">{[lager.address, lager.note].filter(Boolean).join(" · ")}</span>
            )}
            {(() => {
              // Im Lager „Zuhause" gibt es oft gar keine Plätze – die Reifen dort stünden sonst
              // nirgends auf dieser Seite.
              const ohnePlatz = verkaufsreifen.filter((v) => v.warehouse_id === lager.id && v.bestand > 0 && !v.storage_slot_id);
              if (ohnePlatz.length === 0) return null;
              const stueck = ohnePlatz.reduce((n, v) => n + v.bestand, 0);
              return (
                <button type="button" className="lg-link" onClick={() => verkaufOeffnen(null)}>
                  {stueck} {stueck === 1 ? "Verkaufsreifen liegt" : "Verkaufsreifen liegen"} hier ohne festen Platz ›
                </button>
              );
            })()}

            {plaetzeImLager.length === 0 ? (
              <div className="db-karte">
                <div className="db-leer">Noch keine Lagerplätze in diesem Lager.</div>
                {canCreateSlot && <button type="button" className="lg-knopf primaer" style={{ marginTop: 10 }} onClick={() => setMenue("plaetze")}>Plätze anlegen</button>}
              </div>
            ) : (
              <>
                <div className="db-kacheln">
                  <div className="db-kachel">
                    <span className="db-k-titel">Belegt</span>
                    <span className="db-k-wert">{belegtImLager} <span className="db-k-von">/ {plaetzeImLager.length}</span></span>
                    <span className="db-fortschritt"><span style={{ width: `${Math.round((belegtImLager / plaetzeImLager.length) * 100)}%` }} /></span>
                  </div>
                  <button type="button" className={"db-kachel" + (filter === "frei" ? " aktiv" : "")} onClick={() => setFilter(filter === "frei" ? "alle" : "frei")}>
                    <span className="db-k-titel">Frei</span>
                    <span className="db-k-wert">{freiImLager}</span>
                    <span className="db-k-unter">{freiImLager === 1 ? "Platz" : "Plätze"}</span>
                  </button>
                  <button type="button" className={"db-kachel" + (filter === "pruefen" ? " aktiv" : "")} onClick={() => setFilter(filter === "pruefen" ? "alle" : "pruefen")}>
                    <span className="db-k-titel">Zu prüfen</span>
                    <span className={"db-k-wert" + (zuPruefen > 0 ? " orange" : "")}>{zuPruefen}</span>
                    <span className="db-k-unter">Profil, Alter, liegt lange</span>
                  </button>
                </div>

                <div className="pl-filter lg-filter" role="group" aria-label="Filter">
                  {([
                    ["alle", "Alle"],
                    ["pruefen", `Zu prüfen · ${zuPruefen}`],
                    ["frei", `Frei · ${freiImLager}`],
                    ...SAISON_LISTE.map((s) => [s, SAISON_LABEL[s]] as const),
                  ] as const).map(([wert, text]) => (
                    <button key={wert} type="button" className={"pl-pille" + (filter === wert ? " aktiv" : "")}
                      aria-pressed={filter === wert} onClick={() => setFilter(wert)}>{text}</button>
                  ))}
                </div>

                {reihen.map(({ reihe, plaetze }, index) => {
                  const schluessel = `${lager.id}|${reihe}`;
                  const istOffen = schluessel in offen ? offen[schluessel] : (filter !== "alle" || index === 0);
                  const zeilen = plaetze.map((sl) => ({ slot: sl, satz: currentAssignment(sl.id) }));
                  const passend = zeilen.filter(({ slot, satz }) => passtZumFilter(satz, gruendeFuer(satz), filter, verkaufJePlatz.has(slot.id)));
                  const belegtHier = zeilen.filter((z) => z.satz || verkaufJePlatz.has(z.slot.id)).length;
                  const pruefenHier = zeilen.filter((z) => gruendeFuer(z.satz).length > 0).length;
                  // Mit Filter verschwindet eine Reihe ohne Treffer ganz – wie bisher an der Wand.
                  if (filter !== "alle" && passend.length === 0) return null;
                  return (
                    <div key={schluessel} className="lg-reihe">
                      <button type="button" className="lg-reihe-kopf" aria-expanded={istOffen}
                        onClick={() => setOffen({ ...offen, [schluessel]: !istOffen })}>
                        <span className="lg-reihe-zeile">
                          <span className="lg-reihe-name">{reiheTitel(reihe, reihen.length)}</span>
                          <span className="lg-reihe-unter">{belegtHier} von {plaetze.length} belegt</span>
                          {pruefenHier > 0 && <span className="lg-reihe-pruefen">{pruefenHier} prüfen</span>}
                          <span className={"db-pfeil" + (istOffen ? " auf" : "")} aria-hidden="true">›</span>
                        </span>
                        {/* Die Regalwand im Kleinen: ein Kästchen je Platz, in der Reihenfolge des
                            Regals. Blau = belegt, grün = Verkaufsreifen, gestrichelt = frei, orange
                            Kante = zu prüfen. */}
                        <span className="lg-wand" aria-hidden="true">
                          {zeilen.map(({ slot, satz }) => (
                            <span key={slot.id} className={[
                              "lg-w", satz ? "belegt" : verkaufJePlatz.has(slot.id) ? "verkauf" : "frei",
                              gruendeFuer(satz).length ? "pruefen" : "",
                              passtZumFilter(satz, gruendeFuer(satz), filter, verkaufJePlatz.has(slot.id)) ? "" : "aus",
                            ].filter(Boolean).join(" ")} />
                          ))}
                        </span>
                      </button>
                      {istOffen && (
                        <div className="lg-zeilen">
                          {passend.map(({ slot, satz }) => platzZeile(slot, satz, false))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                onOpenPlatz={(slotId) => { const sl = storageSlots.find((s) => s.id === slotId); if (sl) platzOeffnen(sl); }}
              />
            )}
          </>
        )}
        </>}
      </div>

      {blattSlot && (
        <PlatzBlatt
          slot={blattSlot}
          wo={[warehouses.find((w) => w.id === blattSlot.warehouse_id)?.name,
            (() => { const r = nachReihen(storageSlots.filter((s) => s.warehouse_id === blattSlot.warehouse_id)); const eigene = r.find((x) => x.plaetze.some((p) => p.id === blattSlot.id)); return eigene ? reiheTitel(eigene.reihe, r.length) : null; })(),
          ].filter(Boolean).join(" · ")}
          satz={blattSatz}
          kunde={blattSatz ? customers.find((c) => c.id === blattSatz.customer_id) ?? null : null}
          fahrzeug={blattSatz?.vehicle_id ? vehicles.find((v) => v.id === blattSatz.vehicle_id) ?? null : null}
          raeder={blattSatz ? raederVon(blattSatz.id) : []}
          gruende={gruendeFuer(blattSatz)}
          verlauf={historyFor(blattSlot.id)}
          customers={customers}
          raederFuer={raederVon}
          lagergebuehrJeMonat={lagergebuehrJeMonat}
          canAssign={canAssignTire}
          canDelete={canDeleteSlot}
          onClose={() => setBlattSlotId(null)}
          onKunde={onOpenCustomer ? (id) => { setBlattSlotId(null); onOpenCustomer(id); } : undefined}
          // Das Blatt schließt, bevor ein anderes Fenster aufgeht: Auslagern-Dialog, Etikett und
          // Aufkleberbogen liegen in eigenen Ebenen, und zwei offene Fenster übereinander sind eins zu viel.
          onAuslagern={(id) => { setBlattSlotId(null); void onRemoveAssignment(id); }}
          onBearbeiten={() => { setBlattSlotId(null); setBearbeitenSlot(blattSlot); }}
          onEtikett={(id) => { setBlattSlotId(null); onEtikett(id); }}
          onAufkleber={() => { setBlattSlotId(null); setAufkleberFuer([blattSlot]); }}
          onLoeschen={() => { setBlattSlotId(null); void onDeleteSlot(blattSlot.id); }}
        />
      )}

      {menue && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setMenue(null)}>
          <div className="auswahl-blatt lg-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lager verwalten">
            <div className="ab-griff" />
            {menue === "liste" && (
              <>
                <div className="ab-titel">{lager ? `${lager.name} verwalten` : "Lager"}</div>
                {lager && canEditWarehouse && (
                  <button type="button" className="ab-option" onClick={startEditWarehouse}>
                    <span className="ab-text">Lager bearbeiten</span><span className="small">Name, Adresse, Notiz</span>
                  </button>
                )}
                {lager && canCreateSlot && (
                  <button type="button" className="ab-option" onClick={() => setMenue("plaetze")}>
                    <span className="ab-text">Plätze anlegen</span><span className="small">einzeln oder nach Nummerierung</span>
                  </button>
                )}
                {lager && plaetzeImLager.length > 0 && (
                  <button type="button" className="ab-option" onClick={() => { setMenue(null); setAufkleberFuer(plaetzeImLager); }}>
                    <span className="ab-text">Aufkleber drucken</span><span className="small">alle {plaetzeImLager.length} Plätze</span>
                  </button>
                )}
                {canCreateWarehouse && (
                  <button type="button" className="ab-option" onClick={() => setMenue("neu")}>
                    <span className="ab-text">Neues Lager</span>
                  </button>
                )}
                {lager && canDeleteWarehouse && (
                  <button type="button" className="ab-option gefahr" onClick={lagerLoeschen}>
                    <span className="ab-text">Lager löschen</span>
                    {belegtImLager > 0 && <span className="small">geht erst, wenn es leer ist</span>}
                  </button>
                )}
              </>
            )}

            {menue === "bearbeiten" && lager && (
              <>
                <div className="ab-titel">Lager bearbeiten</div>
                <div className="field"><label>Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
                <div className="field"><label>Lageradresse</label><input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></div>
                <div className="field"><label>Notiz</label><input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
                <div className="row">
                  <button className="btn-primary" style={{ flex: 1 }} onClick={saveEditWarehouse}>Speichern</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMenue("liste")}>Zurück</button>
                </div>
              </>
            )}

            {menue === "plaetze" && lager && (
              <>
                <div className="ab-titel">Plätze anlegen · {lager.name}</div>
                <label>Ein Platz</label>
                <div className="row">
                  <input type="text" placeholder="z. B. A-01" value={newSlotCode} onChange={(e) => setNewSlotCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addOneSlot(); }} />
                  <button className="btn-primary" style={{ flex: "0 0 auto" }} onClick={() => void addOneSlot()}>+ Platz</button>
                </div>
                <hr />
                <label>Mehrere nach Nummerierung</label>
                <SlotNumberingFields
                  prefix={morePrefix} setPrefix={setMorePrefix}
                  start={moreStart} setStart={setMoreStart}
                  end={moreEnd} setEnd={setMoreEnd}
                  digits={moreDigits} setDigits={setMoreDigits}
                />
                <div className="row">
                  <button className="btn-primary" style={{ flex: 1 }} onClick={addMoreSlots}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMenue(null)}>Fertig</button>
                </div>
              </>
            )}

            {menue === "neu" && (
              <>
                <div className="ab-titel">Neues Lager</div>
                <div className="field">
                  <label>Name</label>
                  <input type="text" autoFocus placeholder="z. B. Nürnberg Hauptlager" value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Lageradresse (optional)</label>
                  <input type="text" placeholder="Straße, PLZ Ort" value={newWarehouseAddress} onChange={(e) => setNewWarehouseAddress(e.target.value)} />
                </div>
                <div className="field">
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
                <div className="row">
                  <button className="btn-primary" style={{ flex: 1 }} onClick={createWarehouse}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMenue(lager ? "liste" : null)}>Abbrechen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {scannerOffen && (
        <QrScanner titel="Aufkleber scannen" onErkannt={gescannt} onClose={() => setScannerOffen(false)} />
      )}

      {aufkleberFuer && (
        <LagerplatzAufkleber
          slots={aufkleberFuer}
          lagerName={warehouses.find((w) => w.id === aufkleberFuer[0]?.warehouse_id)?.name || ""}
          onClose={() => setAufkleberFuer(null)}
        />
      )}

      {bearbeitenSlot && (
        <TireAssignModal
          slot={bearbeitenSlot}
          customers={customers}
          assignment={currentAssignment(bearbeitenSlot.id)}
          gruende={gruendeFuer(currentAssignment(bearbeitenSlot.id))}
          raederFuer={raederVon}
          onClose={() => setBearbeitenSlot(null)}
          vehicles={vehicles}
          onAssign={onAssignTire}
        />
      )}
    </div>
  );
}

function TireAssignModal({ slot, customers, vehicles, assignment, gruende, raederFuer, onClose, onAssign }: {
  slot: StorageSlot; customers: Customer[]; vehicles: Vehicle[]; assignment: TireStorage | null;
  // Warum an diesem Platz etwas zu tun ist. Steht auch im Blatt davor – hier noch einmal, weil
  // man es beim Ändern der Werte vor Augen haben soll.
  gruende: string[];
  raederFuer: (satzId: string) => EingelagertesRad[];
  onClose: () => void;
  onAssign: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null }) => Promise<void>;
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
      </div>
    </div>
  );
}

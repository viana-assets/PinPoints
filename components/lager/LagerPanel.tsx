import { useState } from "react";
import type { Customer, StorageSlot, TireStorage, Warehouse } from "@/lib/types";
import { formatDate } from "@/lib/helpers";
import { IconLager, IconTrash } from "@/components/icons";
import { CustomerPicker } from "@/components/CustomerPicker";

// Lager-Modul: zwei Ebenen wie ein eigenständiges Modul – erst die Übersicht aller Lager
// (mit Auslastung), dann – nach Klick auf ein Lager – dessen Lagerplätze, inkl. Reifen-
// Zuordnung über TireAssignModal. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.

// Erzeugt Lagerplatz-Codes aus einer einfachen Nummerierungslogik, z. B.
// Präfix "A", 1–20, 2-stellig gepolstert → A-01 … A-20.
function buildSlotCodes(prefix: string, start: number, end: number, digits: number): string[] {
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

export function LagerPanel({ customers, warehouses, storageSlots, tireStorages, onAddWarehouse, onUpdateWarehouse, onDeleteWarehouse, onAddSlot, onAddSlotsBulk, onDeleteSlot, onAssignTire, onRemoveAssignment, canCreateWarehouse, canEditWarehouse, canDeleteWarehouse, canCreateSlot, canDeleteSlot, canAssignTire }: {
  customers: Customer[]; warehouses: Warehouse[]; storageSlots: StorageSlot[]; tireStorages: TireStorage[];
  onAddWarehouse: (fields: { name: string; address: string; note: string }) => Promise<string | undefined>;
  onUpdateWarehouse: (id: string, fields: { name: string; address: string; note: string }) => Promise<void>;
  onDeleteWarehouse: (id: string) => Promise<void>;
  onAddSlot: (warehouseId: string, code: string) => Promise<void>;
  onAddSlotsBulk: (warehouseId: string, codes: string[]) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onAssignTire: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) => Promise<void>;
  onRemoveAssignment: (id: string) => Promise<void>;
  // Granulare Modul-Berechtigungen (von einem Superadmin im Admin-Tab unter
  // "Modulverwaltung" konfigurierbar) – jede Struktur-Aktion einzeln steuerbar, damit z. B.
  // ein Techniker Reifen zuordnen, aber kein Lager anlegen/löschen darf.
  canCreateWarehouse: boolean;
  canEditWarehouse: boolean;
  canDeleteWarehouse: boolean;
  canCreateSlot: boolean;
  canDeleteSlot: boolean;
  canAssignTire: boolean;
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
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  const [showAddMoreSlots, setShowAddMoreSlots] = useState(false);
  const [morePrefix, setMorePrefix] = useState("");
  const [moreStart, setMoreStart] = useState("1");
  const [moreEnd, setMoreEnd] = useState("10");
  const [moreDigits, setMoreDigits] = useState("2");

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || null;
  const slotsInWarehouse = storageSlots.filter((s) => s.warehouse_id === selectedWarehouseId);
  const [editName, setEditName] = useState(selectedWarehouse?.name || "");
  const [editAddress, setEditAddress] = useState(selectedWarehouse?.address || "");
  const [editNote, setEditNote] = useState(selectedWarehouse?.note || "");

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
                <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm(`Lager "${selectedWarehouse.name}" wirklich löschen? Alle Lagerplätze und Zuordnungen darin werden mitgelöscht.`)) { onDeleteWarehouse(selectedWarehouse.id); setSelectedWarehouseId(null); } }}>
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
              <p>{slotsInWarehouse.length} Lagerplätze{selectedWarehouse.address ? ` · 📍 ${selectedWarehouse.address}` : ""}</p>
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

        {slotsInWarehouse.length === 0 && <div className="empty">Noch keine Lagerplätze in diesem Lager.</div>}

        <div className="card-grid">
          {slotsInWarehouse.map((slot) => {
            const assignment = currentAssignment(slot.id);
            const cust = assignment ? customers.find((c) => c.id === assignment.customer_id) : null;
            return (
              <button
                key={slot.id}
                type="button"
                className="slot-card"
                onClick={() => { if (canAssignTire) setAssignSlot(slot); }}
                style={canAssignTire ? undefined : { cursor: "default" }}
                title={canAssignTire ? undefined : "Deine Rolle darf keine Reifen zuordnen."}
              >
                <div className="sc-code"><span className={`dot ${assignment ? "green" : "gray"}`}></span>{slot.code}</div>
                {assignment && cust ? (
                  <>
                    <div className="sc-cust">{cust.name}</div>
                    <div className="sc-meta">
                      {assignment.dot_date ? `DOT ${assignment.dot_date}` : "DOT –"}
                      {assignment.profiltiefe_mm != null ? ` · Profil ${assignment.profiltiefe_mm} mm` : ""}
                    </div>
                  </>
                ) : (
                  <div className="sc-meta">Frei</div>
                )}
                {canDeleteSlot && (
                  <button
                    type="button"
                    className="btn-secondary sc-del"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Lagerplatz "${slot.code}" wirklich löschen?`)) onDeleteSlot(slot.id); }}
                  >
                    <IconTrash />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {assignSlot && (
        <TireAssignModal
          slot={assignSlot}
          customers={customers}
          assignment={currentAssignment(assignSlot.id)}
          history={historyFor(assignSlot.id)}
          onClose={() => setAssignSlot(null)}
          onAssign={onAssignTire}
          onRemove={onRemoveAssignment}
        />
      )}
    </div>
  );
}

function TireAssignModal({ slot, customers, assignment, history, onClose, onAssign, onRemove }: {
  slot: StorageSlot; customers: Customer[]; assignment: TireStorage | null; history: TireStorage[];
  onClose: () => void;
  onAssign: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(assignment?.customer_id || "");
  const [dotDate, setDotDate] = useState(assignment?.dot_date || "");
  const [profiltiefe, setProfiltiefe] = useState(assignment?.profiltiefe_mm != null ? String(assignment.profiltiefe_mm) : "");
  const [note, setNote] = useState(assignment?.note || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId) return;
    setSaving(true);
    await onAssign({ id: assignment?.id, storageSlotId: slot.id, customerId, dotDate, profiltiefeMm: profiltiefe, note });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Lagerplatz {slot.code}</h2>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
        <div className="row">
          <div className="field">
            <label>DOT-Datum</label>
            <input type="text" placeholder="z. B. 2523 (KW 25 / 2023)" value={dotDate} onChange={(e) => setDotDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Profiltiefe (mm)</label>
            <input type="number" step="0.5" min="0" placeholder="z. B. 6.5" value={profiltiefe} onChange={(e) => setProfiltiefe(e.target.value)} />
          </div>
        </div>
        <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary btn-block" disabled={!customerId || saving} onClick={save}>
          {assignment ? "Zuordnung speichern" : "Reifen einlagern"}
        </button>
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
                    {h.dot_date ? ` · DOT ${h.dot_date}` : ""}
                    {h.profiltiefe_mm != null ? ` · Profil ${h.profiltiefe_mm} mm` : ""}
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

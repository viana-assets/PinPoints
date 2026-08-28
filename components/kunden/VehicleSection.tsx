import { useState } from "react";
import type { StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";

// Fahrzeuge je Kunde: Anzeige/Bearbeiten bestehender Fahrzeuge (VehicleRow) sowie das
// Hinzufügen eines neuen Fahrzeugs (AddVehicleInline), beide auf demselben Formularlayout
// (VehicleFieldsForm) aufgebaut. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
// Nur innerhalb von components/kunden verwendet (siehe DetailModal.tsx), daher hier gebündelt
// statt in einzelne Dateien je Funktion aufgeteilt.

function tireStorageLabel(t: TireStorage, storageSlots: StorageSlot[], warehouses: Warehouse[]): string {
  const slot = storageSlots.find((s) => s.id === t.storage_slot_id);
  const wh = slot ? warehouses.find((w) => w.id === slot.warehouse_id) : null;
  return `${wh ? wh.name : "?"} · ${slot ? slot.code : "?"}` + (t.dot_date ? ` (DOT ${t.dot_date})` : "");
}

type VehicleFieldValues = {
  licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
};

function VehicleFieldsForm({ values, onChangeField, tireStorages, storageSlots, warehouses }: {
  values: VehicleFieldValues; onChangeField: (key: keyof VehicleFieldValues, value: string) => void;
  tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
}) {
  return (
    <>
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="text" placeholder="Kennzeichen" value={values.licensePlate} onChange={(e) => onChangeField("licensePlate", e.target.value)} />
        <input type="text" placeholder="Marke / Modell" value={values.makeModel} onChange={(e) => onChangeField("makeModel", e.target.value)} />
      </div>
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="text" placeholder="Reifengröße z. B. 205/55 R16" value={values.tireSize} onChange={(e) => onChangeField("tireSize", e.target.value)} />
        <input type="text" placeholder="DOT-Datum" value={values.tireDotDate} onChange={(e) => onChangeField("tireDotDate", e.target.value)} />
        <input type="number" step="0.5" min="0" placeholder="Profil mm" value={values.tireProfileMm} onChange={(e) => onChangeField("tireProfileMm", e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label>Im Lager eingelagert (optional – nur wenn für diesen Kunden ein Satz eingelagert ist)</label>
        <select value={values.storedTireStorageId} onChange={(e) => onChangeField("storedTireStorageId", e.target.value)}>
          <option value="">Kein eingelagerter Satz</option>
          {tireStorages.map((t) => (
            <option key={t.id} value={t.id}>{tireStorageLabel(t, storageSlots, warehouses)}</option>
          ))}
        </select>
      </div>
      <textarea placeholder="Notiz (optional)" value={values.note} onChange={(e) => onChangeField("note", e.target.value)} />
    </>
  );
}

export function VehicleRow({ vehicle, tireStorages, storageSlots, warehouses, onUpdate, onDelete }: {
  vehicle: Vehicle; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onUpdate: (id: string, fields: VehicleFieldValues) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<VehicleFieldValues>({
    licensePlate: vehicle.license_plate || "",
    makeModel: vehicle.make_model || "",
    tireSize: vehicle.tire_size || "",
    tireDotDate: vehicle.tire_dot_date || "",
    tireProfileMm: vehicle.tire_profile_mm != null ? String(vehicle.tire_profile_mm) : "",
    storedTireStorageId: vehicle.stored_tire_storage_id || "",
    note: vehicle.note || "",
  });
  const linked = vehicle.stored_tire_storage_id ? tireStorages.find((t) => t.id === vehicle.stored_tire_storage_id) : null;

  if (editing) {
    return (
      <div className="appt-item">
        <VehicleFieldsForm
          values={values}
          onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
          tireStorages={tireStorages}
          storageSlots={storageSlots}
          warehouses={warehouses}
        />
        <div className="appt-actions">
          <button className="btn-primary" onClick={() => { onUpdate(vehicle.id, values); setEditing(false); }}>Speichern</button>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appt-item">
      <div><span className="appt-date">{vehicle.license_plate || "Ohne Kennzeichen"}</span>{vehicle.make_model ? " – " + vehicle.make_model : ""}</div>
      <div className="small">
        {vehicle.tire_size ? `Reifen: ${vehicle.tire_size}` : "Keine Reifengröße hinterlegt"}
        {vehicle.tire_dot_date ? ` · DOT ${vehicle.tire_dot_date}` : ""}
        {vehicle.tire_profile_mm != null ? ` · Profil ${vehicle.tire_profile_mm} mm` : ""}
      </div>
      {linked && <div className="small">Im Lager: {tireStorageLabel(linked, storageSlots, warehouses)}</div>}
      {vehicle.note && <div className="small">{vehicle.note}</div>}
      <div className="appt-actions">
        <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Dieses Fahrzeug wirklich löschen?")) onDelete(vehicle.id); }}>Löschen</button>
      </div>
    </div>
  );
}

export function AddVehicleInline({ tireStorages, storageSlots, warehouses, onAdd }: {
  tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onAdd: (fields: VehicleFieldValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const empty: VehicleFieldValues = { licensePlate: "", makeModel: "", tireSize: "", tireDotDate: "", tireProfileMm: "", storedTireStorageId: "", note: "" };
  const [values, setValues] = useState<VehicleFieldValues>(empty);

  if (!open) {
    return <button className="btn-secondary btn-block" onClick={() => setOpen(true)}>+ Fahrzeug hinzufügen</button>;
  }
  return (
    <div className="appt-item">
      <VehicleFieldsForm
        values={values}
        onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        tireStorages={tireStorages}
        storageSlots={storageSlots}
        warehouses={warehouses}
      />
      <div className="appt-actions">
        <button className="btn-primary" onClick={() => { onAdd(values); setValues(empty); setOpen(false); }}>Fahrzeug speichern</button>
        <button className="btn-secondary" onClick={() => { setValues(empty); setOpen(false); }}>Abbrechen</button>
      </div>
    </div>
  );
}

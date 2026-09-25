import { useState } from "react";
import type { StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";

// Fahrzeuge je Kunde: Anzeige/Bearbeiten bestehender Fahrzeuge (VehicleRow) sowie das
// Hinzufügen eines neuen Fahrzeugs (AddVehicleInline), beide auf demselben Formularlayout
// (VehicleFieldsForm) aufgebaut. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
// Nur innerhalb von components/kunden verwendet (siehe DetailModal.tsx), daher hier gebündelt
// statt in einzelne Dateien je Funktion aufgeteilt.

function tireStorageLabel(t: TireStorage, storageSlots: StorageSlot[], warehouses: Warehouse[]): string {
  const slot = storageSlots.find((s) => s.id === t.storage_slot_id);
  const wh = slot ? warehouses.find((w) => w.id === slot.warehouse_id) : null;
  const saison = t.saison ? SAISON_LABEL[t.saison] : null;
  return [saison, `${wh ? wh.name : "?"} · ${slot ? slot.code : "?"}`].filter(Boolean).join(" · ")
    + (t.dot_date ? ` (DOT ${t.dot_date})` : "");
}

// Kennzeichen, Modell, Reifengröße, Notiz – mehr beschreibt das AUTO nicht.
// DOT-Datum und Profiltiefe standen hier bis zum 11.09.2026 daneben. Sie beschreiben aber
// einen Reifensatz, und der wechselt zweimal im Jahr: Nach dem ersten Wechsel war der Wert
// am Fahrzeug still falsch – er sah aus wie eine Messung und war die von vorletzter Saison.
// Beides steht jetzt am eingelagerten Satz (Migration 33/34, docs/lager.md).
type VehicleFieldValues = {
  licensePlate: string; makeModel: string; tireSize: string; note: string;
};

function VehicleFieldsForm({ values, onChangeField }: {
  values: VehicleFieldValues; onChangeField: (key: keyof VehicleFieldValues, value: string) => void;
}) {
  return (
    <>
      <div className="nk-zeile">
        <label className="nk-feld"><span>Kennzeichen</span>
          <input type="text" placeholder="z. B. FÜ-AB 123" value={values.licensePlate} onChange={(e) => onChangeField("licensePlate", e.target.value)} />
        </label>
        <label className="nk-feld"><span>Marke / Modell</span>
          <input type="text" placeholder="z. B. VW Golf" value={values.makeModel} onChange={(e) => onChangeField("makeModel", e.target.value)} />
        </label>
      </div>
      <label className="nk-feld"><span>Reifengröße</span>
        <input type="text" placeholder="z. B. 205/55 R16" value={values.tireSize} onChange={(e) => onChangeField("tireSize", e.target.value)} />
      </label>
      <label className="nk-feld"><span>Notiz (optional)</span>
        <textarea rows={2} value={values.note} onChange={(e) => onChangeField("note", e.target.value)} />
      </label>
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
    note: vehicle.note || "",
  });
  // Seit Migration 30 zeigt die Verknüpfung nur noch in eine Richtung: Der eingelagerte Satz
  // weiß, zu welchem Fahrzeug er gehört. Das Fahrzeug hatte vorher ein eigenes Feld dafür, das
  // von Hand gepflegt werden musste – zwei Wahrheiten, von denen eine irgendwann falsch war.
  // Hier steht deshalb nur noch die Anzeige, gelesen aus dem Lager.
  const linked = tireStorages.find((t) => t.vehicle_id === vehicle.id && !t.removed_at) || null;

  if (editing) {
    return (
      <div className="db-karte dm-fahrzeug-form">
        <VehicleFieldsForm
          values={values}
          onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        />
        <div className="ad-knoepfe">
          <button type="button" className="es-knopf ad-gefahr" onClick={() => { if (confirm("Dieses Fahrzeug wirklich löschen?")) onDelete(vehicle.id); }}>Löschen</button>
          <span className="ad-luecke" />
          <button type="button" className="es-knopf" onClick={() => setEditing(false)}>Abbrechen</button>
          <button type="button" className="am-mini" onClick={() => { onUpdate(vehicle.id, values); setEditing(false); }}>Speichern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="db-karte dm-fahrzeug">
      <div className="dm-fz-kopf">
        <span className="dm-kz">{vehicle.license_plate || "ohne Kz."}</span>
        <span className="dm-fz-text">
          <b>{vehicle.make_model || "Fahrzeug"}</b>
          <span className="small">{vehicle.tire_size || "keine Reifengröße hinterlegt"}</span>
        </span>
        <button type="button" className="db-link" onClick={() => setEditing(true)}>Bearbeiten</button>
      </div>
      {linked && <span className="dm-fz-lager">Im Lager: {tireStorageLabel(linked, storageSlots, warehouses)}</span>}
      {vehicle.note && <span className="small">{vehicle.note}</span>}
    </div>
  );
}

export function AddVehicleInline({ tireStorages, storageSlots, warehouses, onAdd }: {
  tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onAdd: (fields: VehicleFieldValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const empty: VehicleFieldValues = { licensePlate: "", makeModel: "", tireSize: "", note: "" };
  const [values, setValues] = useState<VehicleFieldValues>(empty);

  if (!open) {
    return <button type="button" className="dm-plus" onClick={() => setOpen(true)}>+ Fahrzeug hinzufügen</button>;
  }
  return (
    <div className="db-karte dm-fahrzeug-form">
      <b>Neues Fahrzeug</b>
      <VehicleFieldsForm
        values={values}
        onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
      />
      <div className="ad-knoepfe">
        <span className="ad-luecke" />
        <button type="button" className="es-knopf" onClick={() => { setValues(empty); setOpen(false); }}>Abbrechen</button>
        <button type="button" className="am-mini" onClick={() => { onAdd(values); setValues(empty); setOpen(false); }}>Fahrzeug speichern</button>
      </div>
    </div>
  );
}

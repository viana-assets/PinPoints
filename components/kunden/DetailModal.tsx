import { useState } from "react";
import type {
  Article, Customer, ContactHistoryEntry, Employee, Order, OrderArticle, OrderStatus,
  StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { todayStr, formatDate, effectiveColor, getPhoneNumbers } from "@/lib/helpers";
import { VehicleRow, AddVehicleInline } from "./VehicleSection";
import { CustomerOrderRow } from "./CustomerOrderRow";
import { AddOrderInline } from "./AddOrderInline";

// Das große Kunden-Detailfenster (Modal): Kundendaten, Fahrzeuge, Kontakt erfassen,
// Aufträge & Termine (inkl. Leistungen/Artikel je Auftrag), Kontakt-Historie, sowie
// Deaktivieren/Löschen. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
export function DetailModal(props: {
  customer: Customer; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>; history: ContactHistoryEntry[]; periodMonths: number;
  vehicles: Vehicle[]; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  articles: Article[]; orderArticles: OrderArticle[];
  onAddOrderArticle: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateOrderArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateOrderArticleDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemoveOrderArticle: (id: string) => Promise<void>;
  onClose: () => void;
  onSaveFields: (f: Partial<Customer>) => void;
  onMarkContacted: (contactDate: string, apptDate: string | null, apptTime: string, apptDesc: string) => void;
  onMarkOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onAddOrder: (fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onUpdateOrder: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onDeleteOrder: (id: string) => void;
  onAddVehicle: (fields: { licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string }) => void;
  onUpdateVehicle: (id: string, fields: { licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string }) => void;
  onDeleteVehicle: (id: string) => void;
  onCall: (cust: Customer) => void;
}) {
  const { customer: cust } = props;
  const [name, setName] = useState(cust.name);
  const [address, setAddress] = useState(cust.address);
  const [mobile, setMobile] = useState(cust.phone_mobile || "");
  const [landline, setLandline] = useState(cust.phone_landline || "");
  const [note, setNote] = useState(cust.note || "");
  const [contactDate, setContactDate] = useState(cust.last_contact || todayStr());
  const [wantAppt, setWantAppt] = useState(false);
  const [apptDate, setApptDate] = useState(todayStr());
  const [apptTime, setApptTime] = useState("");
  const [apptDesc, setApptDesc] = useState("");

  const color = effectiveColor(cust, props.periodMonths);
  const custOrders = props.orders.slice().sort((a, b) => a.order_date.localeCompare(b.order_date));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={props.onClose}>✕</button>
        <div className="header-row" style={{ paddingRight: 34 }}>
          <h2 style={{ flex: 1 }}>Kunde bearbeiten <span className={`badge ${color}`}>{color === "green" ? "kontaktiert" : "offen"}</span></h2>
          {getPhoneNumbers(cust).length > 0 && (
            <button className="call-icon-btn" onClick={() => props.onCall(cust)}>📞</button>
          )}
        </div>

        <h4>Kundendaten</h4>
        <div className="field"><label>Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Adresse</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Mobil</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div className="field"><label>Festnetz</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} /></div>
        </div>
        <div className="field"><label>Notiz</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary btn-block" onClick={() => props.onSaveFields({ name, address, phone_mobile: mobile, phone_landline: landline, note })}>
          💾 Kundendaten speichern
        </button>
        {cust.lat == null && <div className="small" style={{ color: "var(--red)", marginTop: 4 }}>Für diesen Kunden gibt es noch keine Kartenposition.</div>}

        <h4>Fahrzeuge</h4>
        <div>
          {props.vehicles.length === 0 && <div className="small">Noch keine Fahrzeuge hinterlegt.</div>}
          {props.vehicles.map((v) => (
            <VehicleRow
              key={v.id}
              vehicle={v}
              tireStorages={props.tireStorages}
              storageSlots={props.storageSlots}
              warehouses={props.warehouses}
              onUpdate={props.onUpdateVehicle}
              onDelete={props.onDeleteVehicle}
            />
          ))}
        </div>
        <AddVehicleInline tireStorages={props.tireStorages} storageSlots={props.storageSlots} warehouses={props.warehouses} onAdd={props.onAddVehicle} />

        <h4>Kontakt erfassen</h4>
        <div className="field" style={{ marginBottom: 6 }}>
          <label>Kontaktiert am</label>
          <input type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} />
        </div>
        <div className="checkbox-row">
          <input type="checkbox" checked={wantAppt} onChange={(e) => setWantAppt(e.target.checked)} />
          <label>Dabei einen Termin vereinbaren</label>
        </div>
        {wantAppt && (
          <div id="apptFields" className="show">
            <div className="row" style={{ marginBottom: 4 }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Termin-Datum</label><input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Uhrzeit (optional)</label><input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} /></div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Was ist zu tun?</label><textarea value={apptDesc} onChange={(e) => setApptDesc(e.target.value)} /></div>
          </div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn-green" onClick={() => props.onMarkContacted(contactDate, wantAppt ? apptDate : null, wantAppt ? apptTime : "", wantAppt ? apptDesc : "")}>
            ✔ Kontaktiert speichern
          </button>
          <button className="btn-secondary" onClick={props.onMarkOpen}>Auf offen setzen</button>
        </div>

        <h4>Aufträge &amp; Termine</h4>
        <div>
          {custOrders.length === 0 && <div className="small">Noch keine Aufträge hinterlegt.</div>}
          {custOrders.map((o) => (
            <CustomerOrderRow
              key={o.id}
              order={o}
              employees={props.employees}
              assignedEmployeeIds={props.orderEmployees[o.id] || []}
              onUpdate={props.onUpdateOrder}
              onDelete={props.onDeleteOrder}
              articles={props.articles}
              orderArticles={props.orderArticles.filter((oa) => oa.order_id === o.id)}
              onAddArticle={props.onAddOrderArticle}
              onUpdateArticleQty={props.onUpdateOrderArticleQty}
              onUpdateArticleDiscount={props.onUpdateOrderArticleDiscount}
              onRemoveArticle={props.onRemoveOrderArticle}
            />
          ))}
        </div>
        <AddOrderInline employees={props.employees} kundenName={props.customer.name} onAdd={props.onAddOrder} />

        <h4>Kontakt-Historie</h4>
        {props.history.length === 0 && <div className="small">Noch keine Kontakt-Historie</div>}
        {props.history.map((h) => (
          <div key={h.id} className="histentry">{formatDate(h.date)} – {h.note || "kontaktiert"}</div>
        ))}

        <hr />
        <button className="btn-secondary btn-block" style={{ marginBottom: 8 }} onClick={props.onToggleActive}>
          {cust.active === false ? "✔ Kunde reaktivieren" : "🚫 Kunde deaktivieren"}
        </button>
        <button
          className="btn-secondary btn-block"
          style={{ color: "#b33" }}
          onClick={() => { if (confirm(`Kunde "${cust.name}" wirklich löschen?`)) props.onDelete(); }}
        >
          Kunde löschen
        </button>
      </div>
    </div>
  );
}

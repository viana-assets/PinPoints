import { useState } from "react";
import type {
  Article, Customer, ContactHistoryEntry, Employee, Order, OrderArticle, OrderStatus,
  StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { todayStr, formatDate, effectiveColor, KUNDEN_ZUSTAND_LABEL, getPhoneNumbers } from "@/lib/helpers";
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
  onMarkContacted: () => void;
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
  const [company, setCompany] = useState(cust.company || "");
  const [anrede, setAnrede] = useState<"" | "Herr" | "Frau">(cust.anrede || "");
  const [email, setEmail] = useState(cust.email || "");
  const [address, setAddress] = useState(cust.address);
  const [mobile, setMobile] = useState(cust.phone_mobile || "");
  const [landline, setLandline] = useState(cust.phone_landline || "");
  const [note, setNote] = useState(cust.note || "");

  const color = effectiveColor(cust, props.periodMonths);
  const custOrders = props.orders.slice().sort((a, b) => a.order_date.localeCompare(b.order_date));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={props.onClose}>✕</button>
        <div className="header-row" style={{ paddingRight: 34 }}>
          <h2 style={{ flex: 1 }}>Kunde bearbeiten <span className={`badge ${color}`}>{KUNDEN_ZUSTAND_LABEL[color]}</span></h2>
          {getPhoneNumbers(cust).length > 0 && (
            <button className="call-icon-btn" onClick={() => props.onCall(cust)}>📞</button>
          )}
        </div>

        <h4>Kundendaten</h4>
        {/* Firma steht ÜBER dem Namen, weil sie bei Geschäftskunden die Hauptangabe ist und der
            Name dort den Ansprechpartner trägt (Migration 24). Bei Privatpersonen bleibt das
            Feld leer – dann ist der Name die Hauptangabe. */}
        <div className="field"><label>Firma (leer bei Privatpersonen)</label><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
        <div className="row">
          <div className="field" style={{ flex: "0 0 110px" }}>
            <label>Anrede</label>
            <select value={anrede} onChange={(e) => setAnrede(e.target.value as "" | "Herr" | "Frau")}>
              <option value="">–</option>
              <option value="Herr">Herr</option>
              <option value="Frau">Frau</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}><label>{company ? "Ansprechpartner" : "Name"}</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <div className="field"><label>Adresse</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Mobil</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div className="field"><label>Festnetz</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} /></div>
        </div>
        <div className="field"><label>E-Mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Notiz</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button
          className="btn-primary btn-block"
          onClick={() => props.onSaveFields({
            name, address, phone_mobile: mobile, phone_landline: landline, note,
            // Leere Felder als null und nicht als leere Zeichenkette: sonst stünde in der
            // Datenbank "" neben null für dieselbe Aussage, und jede Abfrage müsste beides
            // abfangen. Die Anrede hat zudem eine Prüfbedingung, die "" ablehnt.
            company: company.trim() || null,
            email: email.trim() || null,
            anrede: anrede || null,
          })}
        >
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

        {/* Kontakt erfassen öffnet denselben Dialog wie auf der Karte (Migration 23): dort wird
            festgehalten, was bei dem Kontakt herauskam – Auftrag, Wiedervorlage oder kein
            Interesse – samt Kontaktdatum. Bewusst EIN Dialog für beide Wege: die Maske gab es
            hier und im Karten-Popup schon einmal doppelt, in zwei verschiedenen Techniken, und
            ist dabei auseinandergelaufen (docs/termine-kontakt-auftrag-analyse.md). */}
        <h4>Kontakt erfassen</h4>
        {cust.kontakt_ergebnis && (
          <div className="small" style={{ marginBottom: 6 }}>
            Zuletzt: {KUNDEN_ZUSTAND_LABEL[color]}
            {cust.wiedervorlage_am ? ` – wieder anrufen am ${formatDate(cust.wiedervorlage_am)}` : ""}
          </div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn-green" onClick={props.onMarkContacted}>
            ✔ Kontakt bestätigen
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

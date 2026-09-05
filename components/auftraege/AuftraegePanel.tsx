import { useState } from "react";
import type { Customer, Employee, Order, OrderStatus } from "@/lib/types";
import { formatOrderDateTime } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL } from "@/lib/constants";
import { IconAuftraege, IconTrash, IconNavPin } from "@/components/icons";
import { OrderModal } from "./OrderModal";

// Aufträge-Modul: filter-/sortierbare Tabelle aller Aufträge (Status, Mitarbeiter, Kunde) sowie
// ein Modal zum Neuanlegen. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Seit Migration 20 (docs/auftragsablauf.md) ist die Tabelle eine ÜBERSICHT, kein Bearbeitungs-
// formular: ein Klick auf die Zeile öffnet das Auftragsfenster, in dem gehandelt wird. Der
// Status ist deshalb nur noch ein farbiges Kennzeichen und kein Auswahlfeld mehr – man wählt
// nicht "erledigt", man schließt den Auftrag ab. Das frühere Leistungen-Popover ist ersatzlos
// entfallen; es war für die Positionserfassung ohnehin zu klein.
export function AuftraegePanel({ customers, orders, employees, orderEmployees, onNeuerAuftrag, onDelete, onEditEmployees, employeeNamesFor, orderArticlesLabel, onOpenCustomer, onOpenOrder, onNavigate, isTechniker, onUpdateTechnikerNotiz }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  // Legt für den gewählten Kunden einen Auftrag an und öffnet das Auftragsfenster – derselbe
  // Weg wie im Karten-Popup und im Kundenfenster (docs/auftragsablauf.md).
  onNeuerAuftrag: (customerId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  employeeNamesFor: (orderId: string) => string;
  orderArticlesLabel: (orderId: string) => string;
  onOpenCustomer: (customerId: string) => void;
  onOpenOrder: (orderId: string) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (siehe Migration 13),
  // darf in der Oberfläche aber zusätzlich keine Aufträge anlegen/löschen und keine
  // Mitarbeiter-/Leistungen-Zuordnung ändern – nur Status und die eigene Techniker-Notiz.
  isTechniker: boolean;
  onUpdateTechnikerNotiz: (id: string, notiz: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [custFilter, setCustFilter] = useState("");
  const filteredOrders = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = customers.find((c) => c.id === o.customer_id);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    });

  return (
    <div className="tabpanel active">
      <div className="module-page" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        <div className="module-header">
          <div className="mh-icon"><IconAuftraege /></div>
          <div className="mh-text">
            <h2>Aufträge &amp; Termine</h2>
            <p>{orders.length} Aufträge insgesamt – ein Termin ist ein Auftrag mit Uhrzeit</p>
          </div>
        </div>

        <div className="header-row">
          <div className="filterbar" style={{ flex: 1 }}>
            <button type="button" className={`chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>Alle</button>
            <button type="button" className={`chip ${statusFilter === "offen" ? "active" : ""}`} onClick={() => setStatusFilter("offen")}>Offen</button>
            <button type="button" className={`chip ${statusFilter === "in_arbeit" ? "active" : ""}`} onClick={() => setStatusFilter("in_arbeit")}>In Arbeit</button>
            <button type="button" className={`chip ${statusFilter === "erledigt" ? "active" : ""}`} onClick={() => setStatusFilter("erledigt")}>Erledigt</button>
            <button type="button" className={`chip ${statusFilter === "storniert" ? "active" : ""}`} onClick={() => setStatusFilter("storniert")}>Storniert</button>
          </div>
          {!isTechniker && <button className="btn-primary" style={{ flex: "0 0 auto" }} onClick={() => setShowAdd(true)}>+ Auftrag</button>}
        </div>
        {employees.length > 0 && (
          <div className="filterbar">
            <button type="button" className={`chip ${empFilter === "all" ? "active" : ""}`} onClick={() => setEmpFilter("all")}>Alle Mitarbeiter</button>
            {employees.map((emp) => (
              <button key={emp.id} type="button" className={`chip ${empFilter === emp.id ? "active" : ""}`} onClick={() => setEmpFilter(emp.id)}>{emp.name}</button>
            ))}
          </div>
        )}
        <input type="text" placeholder="Nach Kunde filtern…" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} style={{ maxWidth: 320 }} />

        <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
          {filteredOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead><tr><th>Nr.</th><th>Termin</th><th>Kunde</th><th>Titel</th><th>Mitarbeiter</th><th>Leistungen</th><th>Status</th><th>Notiz</th><th></th></tr></thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id} className="klickbar" onClick={() => onOpenOrder(o.id)} title="Auftrag öffnen">
                      <td className="small">{o.order_number}</td>
                      <td className="date-cell">{formatOrderDateTime(o)}</td>
                      <td>
                        {cust ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onOpenCustomer(cust.id); }}
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                            >
                              {cust.name}
                            </button>
                            {cust.address.trim() && <><br /><span className="small">{cust.address}</span></>}
                          </>
                        ) : "–"}
                      </td>
                      <td>{o.title}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isTechniker ? employeeNamesFor(o.id) : (
                          <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditEmployees(e, o.id)}>
                            {employeeNamesFor(o.id)}
                          </button>
                        )}
                      </td>
                      <td>{orderArticlesLabel(o.id)}</td>
                      <td>
                        <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isTechniker ? (
                          <input
                            type="text"
                            defaultValue={o.techniker_notiz || ""}
                            placeholder="Notiz…"
                            className="feld-kompakt"
                            style={{ width: 140 }}
                            onBlur={(e) => { if (e.target.value !== (o.techniker_notiz || "")) onUpdateTechnikerNotiz(o.id, e.target.value); }}
                          />
                        ) : (
                          o.techniker_notiz ? <span className="small">{o.techniker_notiz}</span> : "–"
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                        {cust && cust.address.trim() && (
                          <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => onNavigate(e, cust)}>
                            <IconNavPin />
                          </button>
                        )}
                        {!isTechniker && (
                          <button type="button" className="btn-secondary" style={{ padding: "4px 8px" }} onClick={() => { if (confirm(`Auftrag "${o.title}" wirklich löschen?`)) onDelete(o.id); }}>
                            <IconTrash />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Nach dem Anlegen geht der frische Auftrag direkt auf – hier genauso wie beim Weg über
          das Karten-Popup. Ein neu angelegter Auftrag ist nie fertig: Fahrzeug und Leistungen
          fehlen noch, und wer ihn erst in der Liste wiedersuchen muss, trägt sie oft gar nicht
          nach. Siehe docs/termine-kontakt-auftrag-analyse.md. */}
      {showAdd && !isTechniker && (
        <OrderModal
          customers={customers}
          onClose={() => setShowAdd(false)}
          onWeiter={onNeuerAuftrag}
        />
      )}
    </div>
  );
}

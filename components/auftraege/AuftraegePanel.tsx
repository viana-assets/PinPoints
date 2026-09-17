import { useState } from "react";
import type { Customer, Employee, Order, OrderStatus } from "@/lib/types";
import { formatDate, rechnungOffen, sortiere, terminZeitraum } from "@/lib/helpers";
import type { SortRichtung } from "@/lib/helpers";
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
// Ein anklickbarer Spaltenkopf. Der Pfeil steht NUR an der Spalte, nach der gerade sortiert
// wird – ein Pfeil an jeder Spalte sähe aus, als wären alle gleichzeitig sortiert.
//
// Steht außerhalb von AuftraegePanel, nicht darin: Ein Bauteil, das bei jedem Rendern neu
// entsteht, verliert jedes Mal seinen Zustand und wird von React als neues Element behandelt.
function Kopf({ schluessel, aktiv, richtung, onSortieren, children }: {
  schluessel: string;
  aktiv: boolean;
  richtung: SortRichtung;
  onSortieren: (schluessel: string) => void;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`sortierbar${aktiv ? " aktiv" : ""}`}
      onClick={() => onSortieren(schluessel)}
      aria-sort={aktiv ? (richtung === "auf" ? "ascending" : "descending") : "none"}
      title="Zum Sortieren klicken"
    >
      {children}<span className="sort-pfeil">{aktiv ? (richtung === "auf" ? "▲" : "▼") : ""}</span>
    </th>
  );
}

export function AuftraegePanel({ customers, orders, employees, orderEmployees, onNeuerAuftrag, onDelete, onEditEmployees, employeeNamesFor, orderArticlesLabel, onOpenCustomer, onOpenOrder, onNavigate, isTechniker, onUpdateTechnikerNotiz, onRechnungErstellt }: {
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
  // Hakt „Rechnung erstellt" ab (Migration 40). Die Nummer ist freiwillig; Datum und Person
  // setzt die Datenbank.
  onRechnungErstellt: (id: string, nummer: string | null) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [custFilter, setCustFilter] = useState("");
  // „Rechnung offen" ist kein Status, sondern eine Arbeitsliste – deshalb ein eigener
  // Schalter und keine sechste Marke in der Statusleiste. Ist er an, gelten die anderen
  // Filter weiter: Man kann die offenen Rechnungen eines einzelnen Kunden sehen.
  const [nurRechnungOffen, setNurRechnungOffen] = useState(false);
  // Die getippten Rechnungsnummern, je Auftrag. Sie stehen hier und nicht in der Zeile, weil
  // die Zeile nach dem Abhaken aus der Liste verschwindet – ein Zustand in einem Bauteil, das
  // gleich nicht mehr da ist, wäre beim Speichern schon weg.
  const [nummerFuer, setNummerFuer] = useState<Record<string, string>>({});
  // Sortierung. Vorgabe ist der Termin, absteigend – das Jüngste oben, so wie die Liste
  // bisher schon kam. `spalte` ist ein Schlüssel aus SPALTEN weiter unten.
  const [sortSpalte, setSortSpalte] = useState<string>("termin");
  const [sortRichtung, setSortRichtung] = useState<SortRichtung>("ab");
  function sortierenNach(schluessel: string) {
    // Erneutes Klicken auf dieselbe Spalte dreht um; eine andere Spalte fängt aufsteigend an.
    // Aufsteigend ist der ruhigere Anfang: A vor Z, klein vor groß, früh vor spät.
    if (schluessel === sortSpalte) setSortRichtung((r) => (r === "auf" ? "ab" : "auf"));
    else { setSortSpalte(schluessel); setSortRichtung("auf"); }
  }
  async function abhaken(id: string) {
    await onRechnungErstellt(id, nummerFuer[id]?.trim() || null);
    setNummerFuer((v) => { const rest = { ...v }; delete rest[id]; return rest; });
  }
  const offeneRechnungen = orders.filter(rechnungOffen).length;
  const filteredOrders = orders
    .filter((o) => !nurRechnungOffen || rechnungOffen(o))
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = customers.find((c) => c.id === o.customer_id);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    });

  // Woraus sich die Reihenfolge je Spalte ergibt. Bewusst der WERT und nicht der angezeigte
  // Text: „3.11.2026" steht als Text vor „19.10.2026", als Datum dahinter.
  const SORTWERT: Record<string, (o: Order) => unknown> = {
    nr: (o) => o.order_number,
    termin: (o) => o.order_date + (o.time || ""),
    kunde: (o) => customers.find((c) => c.id === o.customer_id)?.name ?? null,
    mitarbeiter: (o) => employeeNamesFor(o.id),
    leistungen: (o) => orderArticlesLabel(o.id),
    status: (o) => ORDER_STATUS_LABEL[o.status],
  };
  const sichtbareOrders = sortiere(filteredOrders, SORTWERT[sortSpalte] ?? SORTWERT.termin, sortRichtung);



  return (
    <div className="tabpanel active">
      <div className="module-page modul-flaeche">
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
        {/* Der Zähler steht am Schalter und nicht daneben: Eine Zahl, die man erst durch
            Anklicken sieht, beantwortet die Frage „muss ich da ran?" nicht. Steht sie auf
            null, verschwindet der Schalter – nichts zu tun ist keine Schaltfläche wert. */}
        {!isTechniker && (offeneRechnungen > 0 || nurRechnungOffen) && (
          <div className="filterbar">
            <button
              type="button"
              className={`chip ${nurRechnungOffen ? "active" : ""}`}
              onClick={() => setNurRechnungOffen((v) => !v)}
            >
              Rechnung offen ({offeneRechnungen})
            </button>
          </div>
        )}

        <input type="text" placeholder="Nach Kunde filtern…" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} style={{ maxWidth: 320 }} />

        <div className="modul-tabelle">
          {filteredOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead><tr>
                  <Kopf schluessel="nr" aktiv={sortSpalte === "nr"} richtung={sortRichtung} onSortieren={sortierenNach}>Nr.</Kopf>
                  <Kopf schluessel="termin" aktiv={sortSpalte === "termin"} richtung={sortRichtung} onSortieren={sortierenNach}>Termin</Kopf>
                  <Kopf schluessel="kunde" aktiv={sortSpalte === "kunde"} richtung={sortRichtung} onSortieren={sortierenNach}>Kunde</Kopf>
                  <Kopf schluessel="mitarbeiter" aktiv={sortSpalte === "mitarbeiter"} richtung={sortRichtung} onSortieren={sortierenNach}>Mitarbeiter</Kopf>
                  <Kopf schluessel="leistungen" aktiv={sortSpalte === "leistungen"} richtung={sortRichtung} onSortieren={sortierenNach}>Leistungen</Kopf>
                  <Kopf schluessel="status" aktiv={sortSpalte === "status"} richtung={sortRichtung} onSortieren={sortierenNach}>Status</Kopf>
                  {nurRechnungOffen && <th>Rechnung</th>}
                  <th></th>
                </tr></thead>
              <tbody>
                {sichtbareOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id} className="klickbar" onClick={() => onOpenOrder(o.id)} title="Auftrag öffnen">
                      <td className="small">{o.order_number}</td>
                      <td className="date-cell">
                        {formatDate(o.order_date)}
                        {/* Die Zeitspanne unter dem Datum statt dahinter: Ein Termin von 9 bis
                            halb 11 ist zwei Angaben, und nebeneinander drängt die zweite das
                            Datum zusammen. Untereinander liest man erst WANN, dann WIE LANGE. */}
                        {terminZeitraum(o) && <><br /><span className="small">{terminZeitraum(o)}</span></>}
                      </td>
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
                      {/* Nur in der Arbeitsliste. Sie steht hier und nicht dauerhaft in der
                          Tabelle, weil sie nur dort etwas zu sagen hat – eine Spalte, die in
                          neun von zehn Ansichten „–" zeigt, kostet Breite und sagt nichts.
                          Nummer und Knopf in derselben Zelle: Wer eine Liste abarbeitet, will
                          tippen und weiter, nicht ein Fenster öffnen und wieder schließen. */}
                      {nurRechnungOffen && (
                        <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                          <input
                            type="text"
                            className="feld-kompakt"
                            style={{ width: 118, marginRight: 6 }}
                            placeholder="Rechnungsnr."
                            value={nummerFuer[o.id] ?? ""}
                            onChange={(e) => setNummerFuer((v) => ({ ...v, [o.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") abhaken(o.id); }}
                          />
                          <button type="button" className="btn-primary" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => abhaken(o.id)}>
                            erstellt
                          </button>
                        </td>
                      )}
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

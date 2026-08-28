import { useState } from "react";
import type { Customer, Employee, Order, OrderStatus } from "@/lib/types";
import { todayStr, formatDate, formatOrderDateTime, orderDateTime } from "@/lib/helpers";
import { ORDER_STATUS_LABEL } from "@/lib/constants";
import { employeeColorFor, startOfWeekMonday, addDays, toDateStr, isoWeekNumber } from "@/lib/calendar";
import { IconEinsatzplanung, IconTrash } from "@/components/icons";

// Einsatzplanung: Monats-Kalender (Mo–So, mit Kalenderwochen), Mitarbeiter-Filter mit
// Einsatz-Punkten je Tag, Tages-Detail beim Anklicken eines Tages, und darunter eine volle,
// filter-/sortierbare Liste aller Aufträge mit Mitarbeiter-Zuordnung. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function EinsatzplanungPanel({ customers, orders, employees, orderEmployees, onEditEmployees, employeeNamesFor, onEditArticles, orderArticlesLabel, onOpenCustomer, onUpdateStatus, onDelete, isTechniker, onUpdateTechnikerNotiz }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  employeeNamesFor: (orderId: string) => string;
  onEditArticles: (e: React.MouseEvent, orderId: string) => void;
  orderArticlesLabel: (orderId: string) => string;
  onOpenCustomer: (customerId: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (Migration 13), darf
  // in der Oberfläche zusätzlich keine Mitarbeiter-/Leistungen-Zuordnung oder Löschung anstoßen –
  // nur Status und die eigene Techniker-Notiz, siehe AuftraegePanel für dasselbe Muster.
  isTechniker: boolean;
  onUpdateTechnikerNotiz: (id: string, notiz: string) => Promise<void>;
}) {
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr());
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [custFilter, setCustFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "kunde" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const statusLabel = ORDER_STATUS_LABEL;
  const monthLabel = monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const gridStart = startOfWeekMonday(monthCursor);
  const gridEndDay = (monthEnd.getDay() + 6) % 7;
  const gridEnd = addDays(monthEnd, 6 - gridEndDay);
  const weeks: { kw: number; days: Date[] }[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    weeks.push({ kw: isoWeekNumber(days[0]), days });
  }

  function ordersOn(dateStr: string): Order[] {
    return orders.filter((o) => o.order_date === dateStr && (empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter)));
  }
  function employeesOnDay(dateStr: string): Employee[] {
    const ids = new Set<string>();
    orders.filter((o) => o.order_date === dateStr).forEach((o) => (orderEmployees[o.id] || []).forEach((id) => ids.add(id)));
    return employees.filter((e) => ids.has(e.id));
  }

  const dayOrders = selectedDay ? ordersOn(selectedDay) : [];
  const dayGroups: { employee: Employee | null; orders: Order[] }[] = [
    ...employees.map((emp) => ({ employee: emp, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).includes(emp.id)) })),
    { employee: null, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).length === 0) },
  ].filter((g) => g.orders.length > 0);

  // Volle Liste unter dem Kalender – unabhängig vom ausgewählten Tag, mit eigenen Filtern/Sortierung.
  const listOrders = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = customers.find((c) => c.id === o.customer_id);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    })
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = orderDateTime(a).getTime() - orderDateTime(b).getTime();
      else if (sortBy === "kunde") {
        const an = customers.find((c) => c.id === a.customer_id)?.name || "";
        const bn = customers.find((c) => c.id === b.customer_id)?.name || "";
        cmp = an.localeCompare(bn);
      } else cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });

  function toggleSort(field: "date" | "kunde" | "status") {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("asc"); }
  }
  function sortArrow(field: "date" | "kunde" | "status") {
    return sortBy === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  }

  return (
    <div className="tabpanel active">
      <div className="module-page" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        <div className="module-header">
          <div className="mh-icon"><IconEinsatzplanung /></div>
          <div className="mh-text">
            <h2>Einsatzplanung</h2>
            <p>{monthLabel}</p>
          </div>
        </div>

        <div className="row" style={{ maxWidth: 420, alignItems: "center" }}>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 700 }}>{monthLabel}</div>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => { const t = new Date(); setMonthCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDay(todayStr()); }}>Heute</button>
        </div>

        {employees.length > 0 && (
          <div className="filterbar">
            <button type="button" className={`chip ${empFilter === "all" ? "active" : ""}`} onClick={() => setEmpFilter("all")}>Alle Mitarbeiter</button>
            {employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                className={`chip emp-chip ${empFilter === emp.id ? "active" : ""}`}
                onClick={() => setEmpFilter(emp.id)}
              >
                <span className="emp-dot" style={{ background: employeeColorFor(employees, emp.id) }} />
                {emp.name}
              </button>
            ))}
          </div>
        )}

        <div className="calendar-grid">
          <div className="calendar-row calendar-head">
            <div className="calendar-kw"></div>
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="calendar-daylabel">{d}</div>)}
          </div>
          {weeks.map((w) => (
            <div className="calendar-row" key={toDateStr(w.days[0])}>
              <div className="calendar-kw">KW {w.kw}</div>
              {w.days.map((d) => {
                const ds = toDateStr(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const empsToday = employeesOnDay(ds).filter((e) => empFilter === "all" || e.id === empFilter);
                const ordersToday = orders.filter((o) => o.order_date === ds);
                const hasUnassigned = ordersToday.some((o) => (orderEmployees[o.id] || []).length === 0);
                return (
                  <button
                    type="button"
                    key={ds}
                    className={`calendar-day ${inMonth ? "" : "outside"} ${ds === todayStr() ? "today" : ""} ${ds === selectedDay ? "selected" : ""}`}
                    onClick={() => setSelectedDay(ds)}
                  >
                    <span className="calendar-daynum">{d.getDate()}</span>
                    {ordersToday.length > 0 && (
                      <span className="calendar-dots">
                        {empsToday.map((e) => <span key={e.id} className="calendar-dot" style={{ background: employeeColorFor(employees, e.id) }} title={e.name} />)}
                        {hasUnassigned && empFilter === "all" && <span className="calendar-dot calendar-dot-unassigned" title="Nicht zugeordnet" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {selectedDay && (
          <>
            <h4 style={{ margin: "6px 0 0" }}>Aufträge am {formatDate(selectedDay)} <span className="small">({dayOrders.length})</span></h4>
            {dayOrders.length === 0 ? (
              <div className="empty">Keine Aufträge für diesen Tag.</div>
            ) : (
              dayGroups.map((g) => (
                <div key={g.employee?.id || "unassigned"}>
                  <h4 style={{ margin: "6px 0 2px", fontSize: 13 }}>{g.employee ? g.employee.name : "Nicht zugeordnet"} <span className="small">({g.orders.length})</span></h4>
                  <table className="appt-table">
                    <thead><tr><th>Uhrzeit</th><th>Kunde</th><th>Titel</th><th>Status</th></tr></thead>
                    <tbody>
                      {g.orders.map((o) => {
                        const cust = customers.find((c) => c.id === o.customer_id);
                        return (
                          <tr key={o.id}>
                            <td className="date-cell">{o.time || "–"}</td>
                            <td>
                              {cust ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenCustomer(cust.id)}
                                  style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                                >
                                  {cust.name}
                                </button>
                              ) : "–"}
                            </td>
                            <td>{o.title}</td>
                            <td><span className={`badge ${o.status === "erledigt" ? "green" : o.status === "in_arbeit" ? "orange" : "red"}`}>{statusLabel[o.status]}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </>
        )}

        <hr />
        <h4 style={{ margin: "4px 0 0" }}>Alle Aufträge</h4>
        <div className="filterbar">
          <button type="button" className={`chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>Alle</button>
          <button type="button" className={`chip ${statusFilter === "offen" ? "active" : ""}`} onClick={() => setStatusFilter("offen")}>Offen</button>
          <button type="button" className={`chip ${statusFilter === "in_arbeit" ? "active" : ""}`} onClick={() => setStatusFilter("in_arbeit")}>In Arbeit</button>
          <button type="button" className={`chip ${statusFilter === "erledigt" ? "active" : ""}`} onClick={() => setStatusFilter("erledigt")}>Erledigt</button>
        </div>
        <input type="text" placeholder="Nach Kunde filtern…" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} style={{ maxWidth: 320 }} />

        <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
          {listOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>Termin{sortArrow("date")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("kunde")}>Kunde{sortArrow("kunde")}</th>
                  <th>Titel</th>
                  <th>Mitarbeiter</th>
                  <th>Leistungen</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  <th>Notiz</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id}>
                      <td className="date-cell">{formatOrderDateTime(o)}</td>
                      <td>
                        {cust ? (
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(cust.id)}
                            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                          >
                            {cust.name}
                          </button>
                        ) : "–"}
                      </td>
                      <td>{o.title}</td>
                      <td>
                        {isTechniker ? employeeNamesFor(o.id) : (
                          <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditEmployees(e, o.id)}>
                            {employeeNamesFor(o.id)}
                          </button>
                        )}
                      </td>
                      <td>
                        {isTechniker ? orderArticlesLabel(o.id) : (
                          <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditArticles(e, o.id)}>
                            {orderArticlesLabel(o.id)}
                          </button>
                        )}
                      </td>
                      <td>
                        <select value={o.status} onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                          <option value="offen">{statusLabel.offen}</option>
                          <option value="in_arbeit">{statusLabel.in_arbeit}</option>
                          <option value="erledigt">{statusLabel.erledigt}</option>
                        </select>
                      </td>
                      <td>
                        {isTechniker ? (
                          <input
                            type="text"
                            defaultValue={o.techniker_notiz || ""}
                            placeholder="Notiz…"
                            style={{ padding: "3px 6px", fontSize: 11.5, width: 140 }}
                            onBlur={(e) => { if (e.target.value !== (o.techniker_notiz || "")) onUpdateTechnikerNotiz(o.id, e.target.value); }}
                          />
                        ) : (
                          o.techniker_notiz ? <span className="small">{o.techniker_notiz}</span> : "–"
                        )}
                      </td>
                      <td>
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
    </div>
  );
}

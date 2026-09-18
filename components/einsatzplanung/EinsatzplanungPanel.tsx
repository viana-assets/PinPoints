import { useState } from "react";
import type { Customer, Employee, Firmenfahrzeug, Order, OrderStatus } from "@/lib/types";
import { todayStr, formatDate, orderDateTime, terminZeitraum } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL } from "@/lib/constants";
import { employeeColorFor, startOfWeekMonday, addDays, toDateStr, isoWeekNumber } from "@/lib/calendar";
import { RasterLegende, Stundenraster } from "./Stundenraster";
import { IconEinsatzplanung, IconTrash, IconNavPin } from "@/components/icons";

// Einsatzplanung: Monats-Kalender (Mo–So, mit Kalenderwochen), Mitarbeiter-Filter mit
// Einsatz-Punkten je Tag, Tages-Detail beim Anklicken eines Tages, und darunter eine volle,
// filter-/sortierbare Liste aller Aufträge mit Mitarbeiter-Zuordnung. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function EinsatzplanungPanel({ customers, orders, employees, firmenfahrzeuge, orderEmployees, standardDauerMin, onEditEmployees, employeeNamesFor, orderArticlesLabel, onOpenCustomer, onOpenOrder, onDelete, onNavigate, isTechniker }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  // Das Terminraster aus den Betriebseinstellungen – dieselbe Zahl wie im Auftragsfenster.
  standardDauerMin: number;
  // Die eigenen Transporter (Migration 32): „welcher Wagen ist wann wo" ist dieselbe Frage
  // wie „wer ist wann wo" – und wird deshalb an derselben Stelle beantwortet.
  firmenfahrzeuge: Firmenfahrzeug[];
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  employeeNamesFor: (orderId: string) => string;
  orderArticlesLabel: (orderId: string) => string;
  // Klick auf eine Auftragszeile öffnet das Auftragsfenster (docs/auftragsablauf.md) – dasselbe
  // wie im Aufträge-Tab und im Kundendetail.
  onOpenOrder: (orderId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onDelete: (id: string) => Promise<void>;
  // Navigation zum Kunden (Google Maps / Apple Karten) – dieselbe Schaltfläche wie im
  // Aufträge-Tab, im Kundenfenster und im Karten-Popup.
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (Migration 13), darf
  // in der Oberfläche zusätzlich keine Mitarbeiter-/Leistungen-Zuordnung oder Löschung anstoßen –
  // nur Status und die eigene Techniker-Notiz, siehe AuftraegePanel für dasselbe Muster.
  isTechniker: boolean;
}) {
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  // Monat, Woche oder Tag. Die drei sind derselbe Bestand in drei Auflösungen, kein eigener
  // Zustand je Ansicht: Der ausgewählte Tag gilt in allen dreien und wandert beim Umschalten
  // mit – sonst landet man beim Wechsel von „Monat, 20.9." unvermittelt wieder bei heute.
  const [ansicht, setAnsicht] = useState<"monat" | "woche" | "tag">("monat");
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr());
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  // Zweiter Filter neben dem Mitarbeiter, mit derselben Bedienung. „Nicht eingeteilt" ist
  // bewusst ein eigener Knopf: Das ist die Lücke, die man vor dem Tag schließen will.
  const [fahrzeugFilter, setFahrzeugFilter] = useState<"all" | "ohne" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [custFilter, setCustFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "kunde" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const statusLabel = ORDER_STATUS_LABEL;
  const monthLabel = monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  // Welche Tage das Raster zeigt: einen in der Tagesansicht, die ganze Mo–So-Woche in der
  // Wochenansicht. Die Auswahl richtet sich nach demselben `selectedDay` wie der
  // Monatskalender – es gibt nur EINEN ausgewählten Tag im Modul.
  const rasterAnker = new Date(selectedDay || todayStr());
  const rasterTage = ansicht === "woche"
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeekMonday(rasterAnker), i))
    : [rasterAnker];
  // Im Raster gelten dieselben Filter wie darunter in der Liste – eine Ansicht, die andere
  // Aufträge zeigt als der Filter darüber verspricht, ist eine Falle.
  const rasterAuftraege = orders.filter((o) => {
    if (empFilter !== "all" && !(orderEmployees[o.id] || []).includes(empFilter)) return false;
    if (fahrzeugFilter === "ohne" && o.firmenfahrzeug_id) return false;
    if (fahrzeugFilter !== "all" && fahrzeugFilter !== "ohne" && o.firmenfahrzeug_id !== fahrzeugFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  });
  // Nur die Mitarbeiter, die im gezeigten Zeitraum überhaupt vorkommen – eine Legende mit
  // acht Namen, von denen zwei zu sehen sind, erklärt nichts.
  const rasterDatumsMenge = new Set(rasterTage.map(toDateStr));
  const rasterMitarbeiterIds = [...new Set(
    rasterAuftraege
      .filter((o) => rasterDatumsMenge.has(o.order_date))
      .flatMap((o) => orderEmployees[o.id] || [])
  )];

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

  function passtZumFahrzeug(o: Order): boolean {
    if (fahrzeugFilter === "all") return true;
    if (fahrzeugFilter === "ohne") return !o.firmenfahrzeug_id;
    return o.firmenfahrzeug_id === fahrzeugFilter;
  }
  function fahrzeugText(id: string | null): string {
    if (!id) return "nicht eingeteilt";
    const f = firmenfahrzeuge.find((x) => x.id === id);
    return f ? f.kennzeichen : "unbekanntes Fahrzeug";
  }

  const dayOrders = (selectedDay ? ordersOn(selectedDay) : []).filter(passtZumFahrzeug);
  const dayGroups: { employee: Employee | null; orders: Order[] }[] = [
    ...employees.map((emp) => ({ employee: emp, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).includes(emp.id)) })),
    { employee: null, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).length === 0) },
  ].filter((g) => g.orders.length > 0);

  // Volle Liste unter dem Kalender – unabhängig vom ausgewählten Tag, mit eigenen Filtern/Sortierung.
  const listOrders = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter(passtZumFahrzeug)
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
      {/* KEIN `modul-flaeche` – in keiner Ansicht mehr (19.09.2026).

          Diese Klasse baut das Muster „Kopf bleibt stehen, die lange Tabelle scrollt für
          sich": Die Fläche bekommt Bildschirmhöhe, und alles darin teilt sie sich. Das trägt,
          solange über der Tabelle nur Kopf und Filterleisten stehen – also im Aufträge-Tab,
          im Lager, im Artikelstamm.

          Hier steht über der Tabelle ein Monatskalender UND, seit der Tagesauswahl, eine
          Tabelle je Mitarbeiter. Beides wächst. In einer Flex-Spalte schrumpfen die Kinder,
          wenn der Platz nicht reicht – die untere Tabelle wurde damit auf wenige Pixel
          zusammengedrückt, und weil die Fläche nie höher war als der Bildschirm, gab es auch
          nichts zu scrollen. „Alle Aufträge" war am Schreibtisch unerreichbar, sobald der Tag
          mehr als zwei Einträge hatte.

          Am Handy fiel es nie auf: Die Handy-Regel im Stilblatt nimmt `modul-flaeche` seit dem
          09.09.2026 ohnehin zurück – aus genau demselben Grund, damals für den Kalender.
          Jetzt gilt überall dasselbe, und die ganze Seite scrollt.

          Dieselbe Falle wie beim Stundenraster im Juli und beim Kalender im September. Drittes
          Mal, dritte Stelle: Wer über einer scrollenden Tabelle etwas Wachsendes einbaut,
          hebt damit das Muster auf. */}
      <div className="module-page">
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

        {firmenfahrzeuge.some((f) => f.aktiv) && (
          <div className="filterbar">
            <button type="button" className={`chip ${fahrzeugFilter === "all" ? "active" : ""}`} onClick={() => setFahrzeugFilter("all")}>Alle Fahrzeuge</button>
            {firmenfahrzeuge.filter((f) => f.aktiv).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip ${fahrzeugFilter === f.id ? "active" : ""}`}
                onClick={() => setFahrzeugFilter(f.id)}
                title={f.bezeichnung || undefined}
              >
                {f.kennzeichen}
              </button>
            ))}
            <button type="button" className={`chip ${fahrzeugFilter === "ohne" ? "active" : ""}`} onClick={() => setFahrzeugFilter("ohne")}>Nicht eingeteilt</button>
          </div>
        )}

        <div className="filterbar" style={{ marginBottom: 2 }}>
          <button type="button" className={`chip ${ansicht === "monat" ? "active" : ""}`} onClick={() => setAnsicht("monat")}>Monat</button>
          <button type="button" className={`chip ${ansicht === "woche" ? "active" : ""}`} onClick={() => setAnsicht("woche")}>Woche</button>
          <button type="button" className={`chip ${ansicht === "tag" ? "active" : ""}`} onClick={() => setAnsicht("tag")}>Tag</button>
          {ansicht !== "monat" && (
            <>
              <button type="button" className="btn-secondary kal-blaettern" onClick={() => setSelectedDay(toDateStr(addDays(new Date(selectedDay || todayStr()), ansicht === "woche" ? -7 : -1)))}>‹</button>
              <button type="button" className="btn-secondary kal-blaettern" onClick={() => setSelectedDay(todayStr())}>heute</button>
              <button type="button" className="btn-secondary kal-blaettern" onClick={() => setSelectedDay(toDateStr(addDays(new Date(selectedDay || todayStr()), ansicht === "woche" ? 7 : 1)))}>›</button>
            </>
          )}
        </div>

        {ansicht !== "monat" && (
          <>
            <Stundenraster
              tage={rasterTage}
              auftraege={rasterAuftraege}
              customers={customers}
              employees={employees}
              orderEmployees={orderEmployees}
              standardDauerMin={standardDauerMin}
              onOeffnen={onOpenOrder}
            />
            <RasterLegende employees={employees} sichtbareIds={rasterMitarbeiterIds} />
          </>
        )}

        {ansicht === "monat" && (
        <div className="calendar-grid">
          <div className="calendar-row calendar-head">
            <div className="calendar-kw"></div>
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="calendar-daylabel">{d}</div>)}
          </div>
          {weeks.map((w) => (
            <div className="calendar-row" key={toDateStr(w.days[0])}>
              {/* Die Kalenderwoche ist der Weg in die Woche. Sie stand bisher nur da – und
                  eine Zahl am Rand einer Zeile, die genau diese Woche meint, will man
                  anklicken. Ausgewählt wird der Montag, weil die Wochenansicht dort anfängt. */}
              <button
                type="button"
                className="calendar-kw calendar-kw-knopf"
                title={`Woche ${w.kw} im Stundenraster öffnen`}
                onClick={() => { setSelectedDay(toDateStr(w.days[0])); setAnsicht("woche"); }}
              >
                KW {w.kw}
              </button>
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
        )}

        {selectedDay && ansicht === "monat" && (
          <>
            <h4 style={{ margin: "6px 0 0" }}>Aufträge am {formatDate(selectedDay)} <span className="small">({dayOrders.length})</span></h4>
            {dayOrders.length === 0 ? (
              <div className="empty">Keine Aufträge für diesen Tag.</div>
            ) : (
              dayGroups.map((g) => (
                <div key={g.employee?.id || "unassigned"}>
                  <h4 style={{ margin: "6px 0 2px", fontSize: 13 }}>{g.employee ? g.employee.name : "Nicht zugeordnet"} <span className="small">({g.orders.length})</span></h4>
                  {/* `table-layout:fixed` und feste Spaltenbreiten: Untereinander stehen
                      mehrere dieser Tabellen – eine je Mitarbeiter. Jede rechnet ihre
                      Spaltenbreiten sonst aus ihrem EIGENEN Inhalt aus, und dann springt die
                      Kundenspalte von Block zu Block. Drei Tabellen, drei Raster, und das
                      Auge findet keine Spalte wieder.

                      Die Spalte „Titel" ist weg: Darin stand bei jedem Auftrag „Termin",
                      beim dritten „Termin – Daniel Hartman" – der Kundenname ein zweites Mal,
                      der links schon steht. Dieselbe Entscheidung wie in der Auftragsliste
                      darunter, nur sechs Runden später an der zweiten Stelle. */}
                  <div className="tabelle-breit">
                  <table className="appt-table tages-tabelle">
                    <colgroup>
                      <col className="tt-zeit" />
                      <col />
                      <col className="tt-fahrzeug" />
                      <col className="tt-status" />
                    </colgroup>
                    <thead><tr><th>Uhrzeit</th><th>Kunde</th><th>Fahrzeug</th><th>Status</th></tr></thead>
                    <tbody>
                      {g.orders.map((o) => {
                        const cust = customers.find((c) => c.id === o.customer_id);
                        return (
                          <tr key={o.id} className="klickbar" onClick={() => onOpenOrder(o.id)} title="Auftrag öffnen">
                            {/* Auch hier von–bis: Die Spalte heißt „Uhrzeit" und zeigte nur
                                den Anfang. In einer Tagesliste ist die Dauer die halbe
                                Auskunft. */}
                            <td className="date-cell">{terminZeitraum(o) || "–"}</td>
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
                                  {cust.address.trim() && (
                                    <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => onNavigate(e, cust)}>
                                      <IconNavPin />
                                    </button>
                                  )}
                                </>
                              ) : "–"}
                            </td>
                            <td className={o.firmenfahrzeug_id ? undefined : "small"}>{fahrzeugText(o.firmenfahrzeug_id)}</td>
                            <td><span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{statusLabel[o.status]}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
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

        {/* Nur noch waagrecht: Senkrecht scrollt jetzt die ganze Seite. Ein zweiter
            Scrollbereich darin hätte zwei Rollbalken übereinander ergeben, von denen keiner
            tut, was man erwartet. */}
        <div className="tabelle-breit">
          {listOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>Termin{sortArrow("date")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("kunde")}>Kunde{sortArrow("kunde")}</th>
                  {/* „Titel" und „Notiz" sind hier am 18.09.2026 entfallen – dieselbe
                      Entscheidung wie in der Auftragsliste. Der Titel ist bei fast jedem
                      Auftrag „Termin – ‹Kunde›" und wiederholt damit die Spalte daneben; die
                      Notiz ist ein Satz Fließtext, der eine Tabellenspalte sprengt. Beides
                      steht im Auftragsfenster, wo es hingehört. Am Handy sind zwei Spalten
                      weniger der Unterschied zwischen Lesen und Wischen. */}
                  <th>Mitarbeiter</th>
                  <th>Leistungen</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id} className="klickbar" onClick={() => onOpenOrder(o.id)} title="Auftrag öffnen">
                      <td className="date-cell">
                        {/* Die Zeitspanne unter dem Datum statt dahinter: Ein Termin von 9 bis
                            halb 11 ist zwei Angaben, und nebeneinander drängt die zweite das
                            Datum zusammen. Untereinander liest man erst WANN, dann WIE LANGE –
                            und die Spalte wird schmal genug fürs Handy. Wortgleich mit der
                            Auftragsliste; zwei Darstellungen desselben Termins wären zwei
                            Wahrheiten. */}
                        {formatDate(o.order_date)}
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
                          {cust.address.trim() && (
                            <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => onNavigate(e, cust)}>
                              <IconNavPin />
                            </button>
                          )}
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
                        <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{statusLabel[o.status]}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {!isTechniker && (
                          <button type="button" className="btn-secondary" style={{ padding: "4px 8px" }} onClick={() => { if (confirm(`Auftrag ${o.order_number} wirklich löschen?`)) onDelete(o.id); }}>
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

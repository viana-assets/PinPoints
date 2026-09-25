import { useEffect, useRef, useState } from "react";
import type { Customer, Employee, Firmenfahrzeug, Order } from "@/lib/types";
import { todayStr, formatDate, orderDateTime, terminZeitraum } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL } from "@/lib/constants";
import { employeeColorFor, startOfWeekMonday, addDays, toDateStr, isoWeekNumber } from "@/lib/calendar";
import { AUFTRAGSFENSTER_LABEL, type AuftragsFenster } from "@/lib/api/orders";
import { RasterLegende, Stundenraster } from "./Stundenraster";
import { OrderModal } from "@/components/auftraege/OrderModal";
import { IconEinsatzplanung, IconTrash, IconNavPin } from "@/components/icons";
import { kundeFuerAuftrag } from "@/lib/laufkunde";
import { terminUeberschneidungen } from "@/lib/ueberschneidung";
import { auftragsNr } from "@/lib/testkunde";

// Einsatzplanung: Monats-Kalender (Mo–So, mit Kalenderwochen), Mitarbeiter-Filter mit
// Einsatz-Punkten je Tag, Tages-Detail beim Anklicken eines Tages, und darunter eine volle,
// filter-/sortierbare Liste aller Aufträge mit Mitarbeiter-Zuordnung. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function EinsatzplanungPanel({ customers, orders, employees, firmenfahrzeuge, orderEmployees, standardDauerMin, onEditEmployees, employeeNamesFor, orderArticlesLabel, onOpenCustomer, onOpenOrder, onDelete, onNavigate, onNeuerAuftrag, onNeuerKunde, onVerschieben, fenster, isTechniker }: {
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
  // Auftrag aus dem Kalender heraus: Klick in eine freie Stelle des Stundenrasters, Kunde
  // wählen, fertig. Es ist DERSELBE Weg wie überall sonst – die Zeile wird sofort angelegt und
  // das vollständige Auftragsfenster geht auf; hier kommen nur Datum und Uhrzeit schon mit.
  // Siehe docs/auftraege.md: Es gibt genau eine Anlegemaske, und das soll so bleiben.
  onNeuerAuftrag: (kundenId: string, termin: { datum: string; von: string | null; bis: string | null }) => Promise<void>;
  // Der Anrufer steht noch nicht in der Kartei: Das Kundenformular geht auf, der angeklickte
  // Termin wird dort gemerkt und nach dem Anlegen eingesetzt.
  onNeuerKunde: (termin: { datum: string; von: string | null; bis: string | null }) => void;
  // Termin im Stundenraster gezogen (25.09.2026). Fehlt es, darf die Rolle Aufträge nicht
  // ändern, und die Termine lassen sich nicht ziehen.
  onVerschieben?: (id: string, datum: string, von: string | null, bis: string | null) => Promise<void>;
  // Der geladene Zeitraum (Aktuell / Dieses Jahr / Alle). Stand bis zur Neugestaltung als
  // eigener Balken über der Einsatzplanung; jetzt ein Auswahlknopf in der Bedienleiste.
  fenster?: { wert: AuftragsFenster; onChange: (w: AuftragsFenster) => void; laedt: boolean };
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
  // Beim Umschalten der Ansicht nach oben (25.09.2026). Die Bedienleiste bleibt stehen – wer
  // unten in den offenen Aufträgen auf „Woche" tippte, behielt aber seine Scrollposition, und
  // das Stundenraster lag unsichtbar darüber. Es sah aus, als gäbe es die Woche nicht.
  // Nur beim Wechsel der Ansicht, nicht beim Blättern: Wer in der Woche bei 16 Uhr steht und
  // eine Woche weiterblättert, will bei 16 Uhr bleiben.
  const flaecheRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = flaecheRef.current;
    if (el && el.scrollTop > 0) el.scrollTop = 0;
  }, [ansicht]);
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr());
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  // Zweiter Filter neben dem Mitarbeiter, mit derselben Bedienung. „Nicht eingeteilt" ist
  // bewusst ein eigener Knopf: Das ist die Lücke, die man vor dem Tag schließen will.
  const [fahrzeugFilter, setFahrzeugFilter] = useState<"all" | "ohne" | string>("all");
  // Nur die Zustände, die noch Arbeit bedeuten (24.09.2026). Erledigte und stornierte Aufträge
  // gehören in den Aufträge-Tab – in der Planung sind sie Ballast, und am Monatsende stand die
  // Liste voller grüner „Erledigt"-Zeilen, zwischen denen die offenen verschwanden. Im Raster
  // bleiben sie sichtbar (✓ / ✕): Dort sagen sie, wo der Tag schon belegt WAR.
  const [statusFilter, setStatusFilter] = useState<"all" | "offen" | "in_arbeit">("all");
  // Der angeklickte Zeitpunkt, solange die Kundenauswahl offen ist.
  const [slot, setSlot] = useState<{ datum: string; von: string | null; bis: string | null } | null>(null);
  const [custFilter, setCustFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "kunde" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const statusLabel = ORDER_STATUS_LABEL;

  // Gezogene Termine, deren Speichern noch läuft: Sie stehen schon an der neuen Stelle, damit
  // der Block nach dem Loslassen nicht erst zurückspringt und dann wieder hinüber.
  const [schwebend, setSchwebend] = useState<Record<string, { order_date: string; time: string | null; end_time: string | null }>>({});
  // Der Hinweis nach dem Loslassen: wohin, ggf. eine Überschneidung, und „Rückgängig".
  const [verschoben, setVerschoben] = useState<{
    text: string; warnung: string | null;
    rueck: { id: string; datum: string; von: string | null; bis: string | null } | null;
  } | null>(null);
  useEffect(() => {
    if (!verschoben) return;
    const t = setTimeout(() => setVerschoben(null), 8000);
    return () => clearTimeout(t);
  }, [verschoben]);

  async function terminSetzen(id: string, datum: string, von: string | null, bis: string | null, rueckgaengig = false) {
    if (!onVerschieben) return;
    const vorher = orders.find((o) => o.id === id);
    if (!vorher) return;
    setSchwebend((s) => ({ ...s, [id]: { order_date: datum, time: von, end_time: bis } }));
    try {
      // Ein Fehler (keine Verbindung, Recht fehlt) fliegt weiter zur zentralen Fehleranzeige;
      // der Block springt dann zurück, weil `schwebend` hier in jedem Fall geräumt wird.
      await onVerschieben(id, datum, von, bis);
    } finally {
      setSchwebend((s) => { const n = { ...s }; delete n[id]; return n; });
    }
    if (rueckgaengig) { setVerschoben({ text: "Rückgängig gemacht", warnung: null, rueck: null }); return; }
    const tag = new Date(datum + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });
    const kunde = kundeFuerAuftrag(vorher, customers)?.name || vorher.title;
    const neu = { ...vorher, order_date: datum, time: von, end_time: bis };
    const treffer = terminUeberschneidungen(neu, orderEmployees[id] || [], vorher.firmenfahrzeug_id, orders, orderEmployees, standardDauerMin)[0];
    const warnung = treffer
      ? `Achtung: ${treffer.art === "mitarbeiter" ? (employees.find((e) => e.id === treffer.werId)?.name || "Mitarbeiter") : fahrzeugText(treffer.werId)} ist ${treffer.von}–${treffer.bis} schon bei ${kundeFuerAuftrag(treffer.auftrag, customers)?.name || treffer.auftrag.title}.`
      : null;
    setVerschoben({
      text: `${kunde}: ${tag}, ${von}${bis ? `–${bis}` : ""}`,
      warnung,
      rueck: { id, datum: vorher.order_date, von: vorher.time, bis: vorher.end_time },
    });
  }

  // Welche Tage das Raster zeigt: einen in der Tagesansicht, die ganze Mo–So-Woche in der
  // Wochenansicht. Die Auswahl richtet sich nach demselben `selectedDay` wie der
  // Monatskalender – es gibt nur EINEN ausgewählten Tag im Modul.
  const rasterAnker = new Date(selectedDay || todayStr());
  const rasterTage = ansicht === "woche"
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeekMonday(rasterAnker), i))
    : [rasterAnker];
  // Im Raster gelten dieselben Filter wie darunter in der Liste – eine Ansicht, die andere
  // Aufträge zeigt als der Filter darüber verspricht, ist eine Falle.
  const rasterAuftraege = orders.map((o) => (schwebend[o.id] ? { ...o, ...schwebend[o.id] } : o)).filter((o) => {
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
    .filter((o) => o.status === "offen" || o.status === "in_arbeit")
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter(passtZumFahrzeug)
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = kundeFuerAuftrag(o, customers);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    })
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = orderDateTime(a).getTime() - orderDateTime(b).getTime();
      else if (sortBy === "kunde") {
        const an = kundeFuerAuftrag(a, customers)?.name || "";
        const bn = kundeFuerAuftrag(b, customers)?.name || "";
        cmp = an.localeCompare(bn);
      } else cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });

  // ---------------------------------------------------------------- Neugestaltung (25.09.2026)
  //
  // Entwurf „F · Gleiche Funktionen, neu gestaltet" (Design-Arbeitsfläche „Einsatzplanung
  // mobil"). Es fällt keine Funktion weg; es ändert sich die Anordnung:
  //   - Bedienleiste in drei schmalen Zeilen statt vier breiten: ‹ Titel › Heute · Monat/Woche/
  //     Tag als EIN Umschalter · Mitarbeiter, Fahrzeug und geladener Zeitraum als Auswahlknöpfe,
  //     die ein Auswahlblatt öffnen. Ein aktiver Filter ist orange umrandet.
  //   - Monat ohne Rahmen um jeden Tag, KW als kleine Zahl am Rand (antippen = Woche).
  //   - Aufträge des Tages und „Offene Aufträge" als Karten statt breiter Tabellen – am Handy
  //     musste man dort seitlich wischen, um den Status zu sehen.
  const [blatt, setBlatt] = useState<null | "person" | "fahrzeug" | "zeitraum">(null);
  const [menuFuer, setMenuFuer] = useState<string | null>(null);
  const aktiveFahrzeuge = firmenfahrzeuge.filter((f) => f.aktiv);
  const heuteStr = todayStr();
  const ankerDatum = new Date((selectedDay || heuteStr) + "T12:00:00");
  const wochenStart = startOfWeekMonday(ankerDatum);
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  let titel: string;
  let untertitel: string;
  if (ansicht === "monat") {
    titel = `${MONATE[monthCursor.getMonth()]} ${monthCursor.getFullYear()}`;
    untertitel = "Tag antippen öffnet den Tagesplan";
  } else if (ansicht === "woche") {
    const ende = addDays(wochenStart, 6);
    titel = `KW ${isoWeekNumber(wochenStart)}`;
    untertitel = `${wochenStart.getDate()}. ${wochenStart.getMonth() !== ende.getMonth() ? MONATE[wochenStart.getMonth()] + " " : ""}– ${ende.getDate()}. ${MONATE[ende.getMonth()]}`;
  } else {
    titel = `${WOCHENTAG[ankerDatum.getDay()]}, ${ankerDatum.getDate()}.`;
    untertitel = `${MONATE[ankerDatum.getMonth()]} · KW ${isoWeekNumber(ankerDatum)}`;
  }
  // ‹ und › tun, was die Ansicht erwartet: Monat, Woche oder Tag weiter. Der Monatskalender
  // folgt dem Tag, damit „Monat" danach den Monat zeigt, in dem man gerade war.
  function blaettern(schritt: number) {
    if (ansicht === "monat") {
      setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + schritt, 1));
      return;
    }
    const neu = addDays(ankerDatum, schritt * (ansicht === "woche" ? 7 : 1));
    setSelectedDay(toDateStr(neu));
    setMonthCursor(new Date(neu.getFullYear(), neu.getMonth(), 1));
  }
  function zuHeute() {
    const t = new Date();
    setMonthCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(todayStr());
  }
  function tagOeffnen(ds: string) {
    setSelectedDay(ds);
    setAnsicht("tag");
  }

  const personName = empFilter === "all" ? "Alle Mitarbeiter" : employees.find((e) => e.id === empFilter)?.name || "Mitarbeiter";
  const fahrzeugName = fahrzeugFilter === "all" ? "Alle Fahrzeuge" : fahrzeugFilter === "ohne" ? "Nicht eingeteilt" : fahrzeugText(fahrzeugFilter);
  function tagesUeberschrift(ds: string): string {
    const d = new Date(ds + "T12:00:00");
    return `${ds === heuteStr ? "Heute, " : WOCHENTAG[d.getDay()] + ", "}${d.getDate()}. ${MONATE[d.getMonth()]}`;
  }
  function kurzesDatum(ds: string): string {
    const d = new Date(ds + "T12:00:00");
    return `${ds === heuteStr ? "HEUTE · " : ""}${WOCHENTAG[d.getDay()].slice(0, 2).toUpperCase()}, ${d.getDate()}. ${MONATE[d.getMonth()].toUpperCase()}`;
  }
  // Die offenen Aufträge nach Tagen – nur, wenn nach Termin sortiert wird. Nach Kunde oder
  // Status sortiert sind Tagesüberschriften zwischen den Zeilen sinnlos.
  const offeneGruppen: { titel: string | null; auftraege: Order[] }[] = [];
  if (sortBy === "date") {
    for (const o of listOrders) {
      const letzte = offeneGruppen[offeneGruppen.length - 1];
      const t = kurzesDatum(o.order_date);
      if (letzte && letzte.titel === t) letzte.auftraege.push(o);
      else offeneGruppen.push({ titel: t, auftraege: [o] });
    }
  } else if (listOrders.length > 0) {
    offeneGruppen.push({ titel: null, auftraege: listOrders });
  }
  const offenZahl = (k: "all" | "offen" | "in_arbeit") => orders
    .filter((o) => (o.status === "offen" || o.status === "in_arbeit") && (k === "all" || o.status === k))
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter(passtZumFahrzeug).length;

  return (
    <div className="tabpanel active" ref={flaecheRef} onClick={() => { if (menuFuer) setMenuFuer(null); }}>
      <div className="module-page planung-neu">
        {/* Der Modulkopf nur am Rechner – am Handy sagt die Bedienleiste schon, wo man ist. */}
        <div className="module-header planung-modulkopf">
          <div className="mh-icon"><IconEinsatzplanung /></div>
          <div className="mh-text">
            <h2>Einsatzplanung</h2>
            <p>{titel}</p>
          </div>
        </div>

        {/* Die Bedienleiste bleibt beim Scrollen stehen (24.09.2026) – seit der Neugestaltung
            drei schmale Zeilen statt vier breiter Knopfreihen. */}
        <div className="planung-leiste">
          <div className="pl-kopf">
            <button type="button" className="pl-rund" aria-label="Zurück" onClick={() => blaettern(-1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <div className="pl-titel">
              <span className="pl-titel-haupt">{titel}</span>
              <span className="pl-titel-unter">{untertitel}</span>
            </div>
            <button type="button" className="pl-rund" aria-label="Weiter" onClick={() => blaettern(1)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <button type="button" className="pl-heute" onClick={zuHeute}>Heute</button>
          </div>

          <div className="pl-segment" role="tablist" aria-label="Ansicht">
            {(["monat", "woche", "tag"] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={ansicht === a}
                className={ansicht === a ? "aktiv" : ""} onClick={() => setAnsicht(a)}>
                {a === "monat" ? "Monat" : a === "woche" ? "Woche" : "Tag"}
              </button>
            ))}
          </div>

          <div className="pl-filter">
            {employees.length > 0 && (
              <button type="button" className={"pl-pille" + (empFilter !== "all" ? " aktiv" : "")} onClick={() => setBlatt("person")}>
                <span className="pl-punkt" style={{ background: empFilter === "all" ? "var(--text)" : employeeColorFor(employees, empFilter) }} />
                {personName}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            )}
            {aktiveFahrzeuge.length > 0 && (
              <button type="button" className={"pl-pille" + (fahrzeugFilter !== "all" ? " aktiv" : "")} onClick={() => setBlatt("fahrzeug")}>
                {fahrzeugName}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            )}
            {fenster && (
              <button type="button" className={"pl-pille" + (fenster.wert !== "aktuell" ? " aktiv" : "")} onClick={() => setBlatt("zeitraum")}>
                Zeitraum: {AUFTRAGSFENSTER_LABEL[fenster.wert]}{fenster.laedt ? " …" : ""}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* ---- Woche und Tag: das Stundenraster (mit Ziehen, v66). In der Tagesansicht steht
            darüber die Woche als Leiste zum Tag-Wechseln. */}
        {ansicht === "tag" && (
          <div className="wochen-leiste" aria-label="Tag wählen">
            {Array.from({ length: 7 }, (_, i) => addDays(wochenStart, i)).map((d) => {
              const ds = toDateStr(d);
              const anzahl = ordersOn(ds).filter(passtZumFahrzeug).length;
              return (
                <button key={ds} type="button"
                  className={"wl-tag" + (ds === selectedDay ? " gewaehlt" : "") + (ds === heuteStr ? " heute" : "")}
                  onClick={() => setSelectedDay(ds)}
                  aria-label={`${WOCHENTAG[d.getDay()]}, ${d.getDate()}. ${MONATE[d.getMonth()]}, ${anzahl} Aufträge`}>
                  <span className="wl-wt">{WOCHENTAG[d.getDay()].slice(0, 2).toUpperCase()}</span>
                  <span className="wl-nr">{d.getDate()}</span>
                  <span className={"wl-punkt" + (anzahl > 0 ? " voll" : "")} />
                </button>
              );
            })}
          </div>
        )}
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
              onSlot={isTechniker ? undefined : (datum, von, bis) => setSlot({ datum, von, bis })}
              onVerschieben={onVerschieben ? (id, datum, von, bis) => { void terminSetzen(id, datum, von, bis); } : undefined}
            />
            <RasterLegende employees={employees} sichtbareIds={rasterMitarbeiterIds} ziehen={!!onVerschieben} />
          </>
        )}

        {/* ---- Monat */}
        {ansicht === "monat" && (
          <div className="monat-karte">
            <div className="monat-reihe monat-kopf">
              <span className="monat-kw-kopf">KW</span>
              {["MO", "DI", "MI", "DO", "FR", "SA", "SO"].map((d, i) => <span key={d} className={"monat-wt" + (i > 4 ? " wochenende" : "")}>{d}</span>)}
            </div>
            {weeks.map((w) => (
              <div className="monat-reihe" key={toDateStr(w.days[0])}>
                {/* Die Kalenderwoche ist der Weg in die Woche – ausgewählt wird der Montag. */}
                <button type="button" className="monat-kw" title={`Woche ${w.kw} öffnen`}
                  onClick={() => { setSelectedDay(toDateStr(w.days[0])); setAnsicht("woche"); }}>
                  {w.kw}
                </button>
                {w.days.map((d, i) => {
                  const ds = toDateStr(d);
                  const inMonth = d.getMonth() === monthCursor.getMonth();
                  const empsToday = employeesOnDay(ds).filter((e) => empFilter === "all" || e.id === empFilter);
                  const ordersToday = orders.filter((o) => o.order_date === ds).filter(passtZumFahrzeug);
                  const hasUnassigned = ordersToday.some((o) => (orderEmployees[o.id] || []).length === 0);
                  return (
                    <button type="button" key={ds}
                      className={"monat-tag" + (inMonth ? "" : " aussen") + (ds === heuteStr ? " heute" : "") + (ds === selectedDay ? " gewaehlt" : "") + (i > 4 ? " wochenende" : "")}
                      // Ein Tag im Monat angetippt = in diesen Tag hineinzoomen (24.09.2026).
                      onClick={() => tagOeffnen(ds)}
                      aria-label={`${d.getDate()}. ${MONATE[d.getMonth()]}, ${ordersToday.length} Aufträge – Tagesplan öffnen`}>
                      <span className="monat-zahl">{d.getDate()}</span>
                      <span className="monat-punkte">
                        {ordersToday.length > 0 && empsToday.slice(0, 4).map((e) => <span key={e.id} style={{ background: employeeColorFor(employees, e.id) }} title={e.name} />)}
                        {ordersToday.length > 0 && hasUnassigned && empFilter === "all" && <span className="ohne" title="Nicht zugeordnet" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ---- Aufträge am gewählten Tag (nur im Monat – in Woche und Tag steht es im Raster) */}
        {selectedDay && ansicht === "monat" && (
          <div className="tag-liste">
            <div className="tag-kopf">
              <span className="tag-titel">{tagesUeberschrift(selectedDay)} <span className="small">({dayOrders.length})</span></span>
              <button type="button" className="text-knopf" onClick={() => setAnsicht("tag")}>Tagesplan ›</button>
            </div>
            {dayOrders.length === 0 ? (
              <div className="empty">Keine Aufträge an diesem Tag.</div>
            ) : dayGroups.map((g) => (
              <div key={g.employee?.id || "unassigned"} className="tag-gruppe">
                <div className="tag-gruppe-titel">
                  <span className="pl-punkt" style={{ background: g.employee ? employeeColorFor(employees, g.employee.id) : "var(--frei-linie)" }} />
                  {g.employee ? g.employee.name : "Nicht zugeordnet"} · {g.orders.length}
                </div>
                {g.orders.map((o) => {
                  const cust = kundeFuerAuftrag(o, customers);
                  return (
                    <div key={o.id} className="tag-karte" role="button" tabIndex={0}
                      onClick={() => onOpenOrder(o.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") onOpenOrder(o.id); }}
                      style={{ borderLeftColor: g.employee ? employeeColorFor(employees, g.employee.id) : "var(--frei-linie)" }}>
                      <span className="tk-text">
                        <span className="tk-zeit">{terminZeitraum(o) || "ohne Uhrzeit"}</span>
                        {cust ? (
                          <button type="button" className="tk-kunde" onClick={(e) => { e.stopPropagation(); onOpenCustomer(cust.id); }}>{cust.name}</button>
                        ) : <span className="tk-kunde">–</span>}
                      </span>
                      <span className={"tk-fahrzeug" + (o.firmenfahrzeug_id ? "" : " leer")}>{fahrzeugText(o.firmenfahrzeug_id)}</span>
                      <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{statusLabel[o.status]}</span>
                      {cust?.address.trim() && (
                        <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => { e.stopPropagation(); onNavigate(e, cust); }}>
                          <IconNavPin />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ---- Offene Aufträge */}
        <div className="op-bereich">
          <div className="op-kopf">
            <h4>Offene Aufträge</h4>
            <span className="small">Erledigte und stornierte unter „Aufträge“</span>
          </div>
          <div className="op-status">
            {([["all", "Alle offenen"], ["offen", "Offen"], ["in_arbeit", "In Arbeit"]] as const).map(([k, t]) => (
              <button key={k} type="button" className={statusFilter === k ? "aktiv" : ""} onClick={() => setStatusFilter(k)}>
                {t} <span className="op-zahl">{offenZahl(k)}</span>
              </button>
            ))}
          </div>
          <div className="op-suche">
            <input type="search" placeholder="Nach Kunde filtern …" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} aria-label="Nach Kunde filtern" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "kunde" | "status")} aria-label="Sortierung">
              <option value="date">Nach Termin</option>
              <option value="kunde">Nach Kunde</option>
              <option value="status">Nach Status</option>
            </select>
            <button type="button" className="op-richtung" aria-label={sortDir === "asc" ? "Aufsteigend – umkehren" : "Absteigend – umkehren"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>{sortDir === "asc" ? "↑" : "↓"}</button>
          </div>

          {listOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine offenen Aufträge für diesen Filter."}</div>
          ) : offeneGruppen.map((g, gi) => (
            <div key={g.titel || gi} className="op-gruppe">
              {g.titel && <div className="op-gruppe-titel">{g.titel}</div>}
              {g.auftraege.map((o) => {
                const cust = kundeFuerAuftrag(o, customers);
                const wer = orderEmployees[o.id] || [];
                const erster = employees.find((e) => e.id === wer[0]);
                return (
                  <div key={o.id} className="op-karte" role="button" tabIndex={0}
                    onClick={() => onOpenOrder(o.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") onOpenOrder(o.id); }}>
                    <button type="button"
                      className={"op-avatar" + (erster ? "" : " leer")}
                      style={erster ? { background: employeeColorFor(employees, erster.id) } : undefined}
                      title={isTechniker ? employeeNamesFor(o.id) : `${employeeNamesFor(o.id)} – Mitarbeiter zuteilen`}
                      disabled={isTechniker}
                      onClick={(e) => { e.stopPropagation(); if (!isTechniker) onEditEmployees(e, o.id); }}>
                      {erster ? erster.name.charAt(0).toUpperCase() : "?"}
                      {wer.length > 1 && <span className="op-mehr">+{wer.length - 1}</span>}
                    </button>
                    <span className="op-text">
                      <span className="op-zeile1">
                        {cust ? (
                          <button type="button" className="op-kunde" onClick={(e) => { e.stopPropagation(); onOpenCustomer(cust.id); }}>{cust.name}</button>
                        ) : <span className="op-kunde">–</span>}
                        {cust?.address.trim() && (
                          <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => { e.stopPropagation(); onNavigate(e, cust); }}>
                            <IconNavPin />
                          </button>
                        )}
                      </span>
                      <span className="op-zeile2">
                        {sortBy !== "date" && <>{formatDate(o.order_date)} · </>}
                        {terminZeitraum(o) || "ohne Uhrzeit"} · {employeeNamesFor(o.id)} · {orderArticlesLabel(o.id)}
                      </span>
                    </span>
                    <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{statusLabel[o.status]}</span>
                    {!isTechniker && (
                      <span className="op-menue-anker">
                        <button type="button" className="op-mehr-knopf" aria-label="Weitere Aktionen"
                          onClick={(e) => { e.stopPropagation(); setMenuFuer(menuFuer === o.id ? null : o.id); }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                        </button>
                        {menuFuer === o.id && (
                          <span className="op-menue" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={(e) => { setMenuFuer(null); onEditEmployees(e, o.id); }}>Mitarbeiter zuteilen</button>
                            <button type="button" className="gefahr" onClick={() => { setMenuFuer(null); if (confirm(`Auftrag ${auftragsNr(o.order_number)} wirklich löschen?`)) onDelete(o.id); }}>
                              <IconTrash /> Löschen
                            </button>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Auswahlblatt für Mitarbeiter, Fahrzeug und Zeitraum. Am Handy von unten, am Rechner
          als kleines Fenster in der Mitte. */}
      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setBlatt(null)}>
          <div className="auswahl-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Auswahl">
            <div className="ab-griff" />
            <div className="ab-titel">{blatt === "person" ? "Mitarbeiter" : blatt === "fahrzeug" ? "Fahrzeug" : "Geladener Zeitraum"}</div>
            {blatt === "person" && [{ id: "all", name: "Alle Mitarbeiter" }, ...employees].map((e) => (
              <button key={e.id} type="button" className={"ab-option" + (empFilter === e.id ? " aktiv" : "")}
                onClick={() => { setEmpFilter(e.id); setBlatt(null); }}>
                <span className="pl-punkt" style={{ background: e.id === "all" ? "var(--text)" : employeeColorFor(employees, e.id) }} />
                <span className="ab-text">{e.name}</span>
                {empFilter === e.id && <span className="ab-haken">✓</span>}
              </button>
            ))}
            {blatt === "fahrzeug" && [
              { id: "all", name: "Alle Fahrzeuge", info: "" },
              ...aktiveFahrzeuge.map((f) => ({ id: f.id, name: f.kennzeichen, info: f.bezeichnung || "" })),
              { id: "ohne", name: "Nicht eingeteilt", info: "noch ohne Transporter" },
            ].map((f) => (
              <button key={f.id} type="button" className={"ab-option" + (fahrzeugFilter === f.id ? " aktiv" : "")}
                onClick={() => { setFahrzeugFilter(f.id); setBlatt(null); }}>
                <span className="ab-text">{f.name}</span>
                {f.info && <span className="small">{f.info}</span>}
                {fahrzeugFilter === f.id && <span className="ab-haken">✓</span>}
              </button>
            ))}
            {blatt === "zeitraum" && fenster && (["aktuell", "jahr", "alles"] as const).map((w) => (
              <button key={w} type="button" className={"ab-option" + (fenster.wert === w ? " aktiv" : "")}
                onClick={() => { fenster.onChange(w); setBlatt(null); }}>
                <span className="ab-text">{AUFTRAGSFENSTER_LABEL[w]}</span>
                {w === "aktuell" && <span className="small">erledigte der letzten 30 Tage, offene immer</span>}
                {fenster.wert === w && <span className="ab-haken">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {verschoben && (
        <div className="verschoben-hinweis" role="status">
          <span className="vh-text">
            <b>Verschoben</b> · {verschoben.text}
            {verschoben.warnung && <span className="vh-warnung">{verschoben.warnung}</span>}
          </span>
          {verschoben.rueck && (
            <button type="button" onClick={() => {
              const r = verschoben.rueck!;
              setVerschoben(null);
              void terminSetzen(r.id, r.datum, r.von, r.bis, true);
            }}>Rückgängig</button>
          )}
          <button type="button" className="vh-zu" aria-label="Hinweis schließen" onClick={() => setVerschoben(null)}>✕</button>
        </div>
      )}

      {/* Kundenauswahl nach einem Klick ins Raster. Dasselbe Fenster wie im Aufträge-Tab –
          nur mit dem angeklickten Termin darüber. */}
      {slot && (
        <OrderModal
          customers={customers}
          terminText={terminVorgabeText(slot)}
          onClose={() => setSlot(null)}
          onWeiter={async (kundenId) => { await onNeuerAuftrag(kundenId, slot); }}
          onNeuerKunde={() => { const s = slot; setSlot(null); onNeuerKunde(s); }}
        />
      )}
    </div>
  );
}

// Die Zeile über der Kundenauswahl: „Di, 22.9.2026 · 10:00–11:00". Ohne Uhrzeit steht dort,
// dass keine gesetzt wird – sonst sieht das Fenster aus, als hätte man danebengeklickt.
function terminVorgabeText(slot: { datum: string; von: string | null; bis: string | null }): string {
  const tag = new Date(slot.datum + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "short", day: "numeric", month: "numeric", year: "numeric",
  });
  return slot.von ? `${tag} · ${slot.von}–${slot.bis}` : `${tag} · ohne Uhrzeit`;
}

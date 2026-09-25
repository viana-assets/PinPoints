import { useState } from "react";
import type { Customer, Employee, Order, OrderStatus } from "@/lib/types";
import { getPhoneNumbers, rechnungOffen, todayStr } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL } from "@/lib/constants";
import { addDays, employeeColorFor, toDateStr } from "@/lib/calendar";
import { AUFTRAGSFENSTER_LABEL, type AuftragsFenster } from "@/lib/api/orders";
import { AUFTRAGS_SORTIERUNG_LABEL, auftragsGruppen, ausgeblendet, type AuftragsSortierung } from "@/lib/auftragsAnsicht";
import { datumKurz } from "@/lib/dashboard";
import { IconTrash, IconNavPin } from "@/components/icons";
import { OrderModal } from "./OrderModal";
import { kundeFuerAuftrag } from "@/lib/laufkunde";
import { auftragsNr } from "@/lib/testkunde";

// Aufträge-Modul (neu gestaltet am 26.09.2026, Entwurf „K · Aufträge").
//
// Seit Migration 20 (docs/auftragsablauf.md) ist die Liste eine ÜBERSICHT, kein Bearbeitungs-
// formular: ein Klick auf einen Auftrag öffnet das Auftragsfenster, in dem gehandelt wird.
//
// Vorher eine breite Tabelle mit sortierbaren Spaltenköpfen, zwei Chip-Reihen und einem
// Zeitraum-Balken darüber. Jetzt Karten im Stil der Einsatzplanung, und die Liste beantwortet
// „was ist noch zu tun?": Oben steht, was liegen geblieben ist, dann heute (auch das heute
// Erledigte) und die nächsten Tage. Abgeschlossene Aufträge von gestern und früher sind
// ausgeblendet – „Vergangene anzeigen" am Ende holt sie zurück. Die Regeln stehen in
// lib/auftragsAnsicht.ts.

const STATUS_WAHL: ("all" | OrderStatus)[] = ["all", "offen", "in_arbeit", "erledigt", "storniert"];

export function AuftraegePanel({ customers, orders, employees, orderEmployees, onNeuerAuftrag, onDelete, onEditEmployees, leistungenText, onOpenCustomer, onOpenOrder, onNavigate, onCall, isTechniker, fenster }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  // Legt für den gewählten Kunden einen Auftrag an und öffnet das Auftragsfenster – derselbe
  // Weg wie im Karten-Popup und im Kundenfenster (docs/auftragsablauf.md).
  onNeuerAuftrag: (customerId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  // „Räderwechsel · Einlagerung · 89,50 €" – Namen der Leistungen und Betrag.
  leistungenText: (orderId: string) => string;
  onOpenCustomer: (customerId: string) => void;
  onOpenOrder: (orderId: string) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  // Anrufen direkt aus der Karte. Dasselbe Menü wie in der Kundenliste und im Kartenpopup –
  // ein Kunde kann Mobil UND Festnetz haben, und welche Nummer gemeint ist, entscheidet nicht
  // die Anwendung.
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (siehe Migration 13),
  // darf in der Oberfläche aber zusätzlich keine Aufträge anlegen/löschen und keine
  // Mitarbeiter-Zuordnung ändern.
  isTechniker: boolean;
  // Der geladene Zeitraum (docs/architektur.md, „Datenladen") – seit dem 26.09.2026 als
  // Auswahlknopf in der Bedienleiste statt als eigener Balken darüber, wie in der Einsatzplanung.
  fenster?: { wert: AuftragsFenster; onChange: (w: AuftragsFenster) => void; laedt: boolean };
}) {
  const heute = todayStr();
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [suche, setSuche] = useState("");
  // „Rechnung offen" ist kein Status, sondern eine Arbeitsliste – deshalb eine eigene Karte und
  // keine sechste Pille. Ist sie an, gelten die anderen Filter weiter.
  const [nurRechnungOffen, setNurRechnungOffen] = useState(false);
  const [sort, setSort] = useState<AuftragsSortierung>("anstehend");
  const [vergangene, setVergangene] = useState(false);
  const [blatt, setBlatt] = useState<null | "person" | "zeitraum" | "sort">(null);
  const [menuFuer, setMenuFuer] = useState<string | null>(null);

  const kundeName = (o: Order) => {
    const c = kundeFuerAuftrag(o, customers);
    return (c?.company || "").trim() || c?.name || o.title;
  };
  const offeneRechnungen = orders.filter(rechnungOffen).length;

  const q = suche.trim().toLowerCase().replace(/^#/, "");
  const vorgefiltert = orders
    .filter((o) => !nurRechnungOffen || rechnungOffen(o))
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!q) return true;
      const cust = kundeFuerAuftrag(o, customers);
      return auftragsNr(o.order_number).toLowerCase().includes(q.toLowerCase())
        || (cust?.name ?? "").toLowerCase().includes(q)
        || (cust?.company ?? "").toLowerCase().includes(q);
    });
  // Wer oben ausdrücklich „Erledigt" oder „Storniert" wählt, will auch die alten sehen.
  const zeigtAlte = vergangene || statusFilter === "erledigt" || statusFilter === "storniert";
  const passtStatus = (o: Order, s: "all" | OrderStatus) => s === "all" || o.status === s;
  const sichtbar = vorgefiltert.filter((o) => passtStatus(o, statusFilter) && (zeigtAlte || !ausgeblendet(o, heute)));
  const versteckt = vorgefiltert.filter((o) => passtStatus(o, statusFilter) && ausgeblendet(o, heute)).length;
  const zahl = (s: "all" | OrderStatus) => vorgefiltert.filter((o) => passtStatus(o, s)
    && (s === "erledigt" || s === "storniert" || vergangene || !ausgeblendet(o, heute))).length;
  const gruppen = auftragsGruppen(sichtbar, heute, sort, kundeName);
  const offenGesamt = orders.filter((o) => o.status === "offen" || o.status === "in_arbeit").length;

  const morgen = toDateStr(addDays(new Date(heute + "T12:00:00"), 1));
  const gestern = toDateStr(addDays(new Date(heute + "T12:00:00"), -1));
  function tagTitel(datum: string): string {
    const vorsatz = datum === heute ? "HEUTE · " : datum === morgen ? "MORGEN · " : datum === gestern ? "GESTERN · " : "";
    return vorsatz + datumKurz(datum).toUpperCase();
  }
  const empName = empFilter === "all" ? "Mitarbeiter" : employees.find((e) => e.id === empFilter)?.name ?? "Mitarbeiter";

  const pfeil = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

  function karte(o: Order) {
    const cust = kundeFuerAuftrag(o, customers);
    const wer = orderEmployees[o.id] || [];
    const vergangenFertig = ausgeblendet(o, heute);
    const offeneRechnung = rechnungOffen(o);
    return (
      <div key={o.id} className={"au-karte" + (vergangenFertig ? " vergangen" : "")} role="button" tabIndex={0}
        onClick={() => onOpenOrder(o.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpenOrder(o.id); }}>
        <span className="au-zeit">
          <b>{o.time ? o.time.slice(0, 5) : "–"}</b>
          {o.end_time && <span>bis {o.end_time.slice(0, 5)}</span>}
        </span>
        <span className="au-strich" style={{ background: wer.length ? employeeColorFor(employees, wer[0]) : "var(--frei-linie)" }} />
        <span className="au-text">
          <span className="au-zeile1">
            <span className="au-kunde">{kundeName(o)}</span>
            <span className="au-nr">#{auftragsNr(o.order_number)}</span>{o.order_number < 0 && <span className="test-marke">TEST</span>}
            {/* Das Menü sitzt in der ersten Zeile und nicht unter Navigation und Anruf – eine
                dritte Knopfreihe machte jede Karte am Handy fast doppelt so hoch. */}
            <span className="au-menue-platz" onClick={(e) => e.stopPropagation()}>
              <span className="op-menue-anker au-menue">
                <button type="button" className="op-mehr-knopf" aria-label="Weitere Aktionen" onClick={() => setMenuFuer(menuFuer === o.id ? null : o.id)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                </button>
                {menuFuer === o.id && (
                  <span className="op-menue">
                    <button type="button" onClick={() => { setMenuFuer(null); onOpenOrder(o.id); }}>Auftrag öffnen</button>
                    {!isTechniker && <button type="button" onClick={(e) => { setMenuFuer(null); onEditEmployees(e, o.id); }}>Mitarbeiter zuteilen</button>}
                    {cust && <button type="button" onClick={() => { setMenuFuer(null); onOpenCustomer(cust.id); }}>Kunde öffnen</button>}
                    {!isTechniker && (
                      <button type="button" className="gefahr" onClick={() => { setMenuFuer(null); if (confirm(`Auftrag ${auftragsNr(o.order_number)} wirklich löschen?`)) onDelete(o.id); }}>
                        <IconTrash /> Löschen
                      </button>
                    )}
                  </span>
                )}
              </span>
            </span>
          </span>
          <span className="au-leistungen">{leistungenText(o.id)}</span>
          <span className="au-marken">
            {wer.map((id) => (
              <span key={id} className="au-wer" style={{ background: employeeColorFor(employees, id) }}>
                {employees.find((e) => e.id === id)?.name ?? "?"}
              </span>
            ))}
            {wer.length === 0 && !isTechniker && (
              <button type="button" className="au-wer leer" onClick={(e) => { e.stopPropagation(); onEditEmployees(e, o.id); }}>+ Mitarbeiter</button>
            )}
            <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
            {offeneRechnung && !nurRechnungOffen && <span className="au-rechnung">Rechnung offen</span>}
          </span>
          {/* In der Arbeitsliste „Rechnungen" der Weg dorthin, wo die Rechnung entsteht – der
              Haken kommt danach von der Datenbank (Migration 40). */}
          {offeneRechnung && nurRechnungOffen && (
            <button type="button" className="au-rechnung-knopf" onClick={(e) => { e.stopPropagation(); onOpenOrder(o.id); }}>Rechnung erstellen</button>
          )}
        </span>
        <span className="au-knoepfe" onClick={(e) => e.stopPropagation()}>
          {cust && cust.address.trim() && (
            <button type="button" className="kl-rund nav" title="Navigation starten (Google Maps / Apple Karten)" aria-label="Navigation" onClick={(e) => onNavigate(e, cust)}>
              <IconNavPin />
            </button>
          )}
          {/* Nur mit hinterlegter Nummer – ein Hörer, der zu einem leeren Menü führt, ist
              schlechter als keiner. Dieselbe Bedingung wie in der Kundenliste. */}
          {cust && getPhoneNumbers(cust).length > 0 && (
            <button type="button" className="kl-rund anruf" title="Kunde anrufen" aria-label="Kunde anrufen" onClick={(e) => onCall(e, cust)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="tabpanel active">
      <div className="module-page au-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Aufträge</h2>
              <span className="lg-unter" title="Ein Termin ist ein Auftrag mit Uhrzeit">{orders.length} Aufträge · {offenGesamt} offen</span>
            </div>
            {!isTechniker && (
              <button type="button" className="kl-neu" onClick={() => setShowAdd(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Auftrag
              </button>
            )}
          </div>
          <label className="lg-suchfeld au-suche">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Kunde oder Auftragsnummer …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Auftrag suchen" />
          </label>
          <div className="pl-filter au-filter" role="group" aria-label="Status">
            {STATUS_WAHL.map((s) => (
              <button key={s} type="button" className={"pl-pille" + (statusFilter === s ? " aktiv" : "")} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s === "all" ? "Alle" : ORDER_STATUS_LABEL[s]}<span className="op-zahl">{zahl(s)}</span>
              </button>
            ))}
          </div>
          <div className="pl-filter au-filter">
            {employees.length > 0 && (
              <button type="button" className={"pl-pille" + (empFilter !== "all" ? " aktiv" : "")} onClick={() => setBlatt("person")}>
                {empFilter !== "all" && <span className="pl-punkt" style={{ background: employeeColorFor(employees, empFilter) }} />}
                {empName}{pfeil}
              </button>
            )}
            {fenster && (
              <button type="button" className={"pl-pille" + (fenster.wert !== "aktuell" ? " aktiv" : "")} onClick={() => setBlatt("zeitraum")}>
                Zeitraum: {AUFTRAGSFENSTER_LABEL[fenster.wert]}{fenster.laedt ? " …" : ""}{pfeil}
              </button>
            )}
            <button type="button" className={"pl-pille" + (sort !== "anstehend" ? " aktiv" : "")} onClick={() => setBlatt("sort")}>
              {AUFTRAGS_SORTIERUNG_LABEL[sort]}{pfeil}
            </button>
          </div>
        </div>

        {/* Der Zähler steht auf der Karte und nicht erst dahinter: Eine Zahl, die man erst durch
            Anklicken sieht, beantwortet die Frage „muss ich da ran?" nicht. Steht sie auf null,
            verschwindet die Karte. */}
        {!isTechniker && (offeneRechnungen > 0 || nurRechnungOffen) && (
          <button type="button" className={"sl-chance au-rechnungen" + (nurRechnungOffen ? " aktiv" : "")} onClick={() => setNurRechnungOffen(!nurRechnungOffen)} aria-pressed={nurRechnungOffen}>
            <span className="db-punkt-zahl rot">{offeneRechnungen}</span>
            <span className="db-punkt-text">
              <span className="db-punkt-titel">{offeneRechnungen === 1 ? "Rechnung noch nicht ausgestellt" : "Rechnungen noch nicht ausgestellt"}</span>
              <span className="small">{nurRechnungOffen ? "nur diese werden gezeigt" : "erledigt, mit „Rechnung nötig“"}</span>
            </span>
            <span className="db-link">{nurRechnungOffen ? "Alle ✕" : "Zeigen ›"}</span>
          </button>
        )}

        {sichtbar.length === 0 && (
          <div className="db-karte">
            <div className="db-leer">
              {orders.length === 0 ? "Noch keine Aufträge angelegt."
                : versteckt > 0 && !zeigtAlte ? "Nichts mehr zu tun – nur abgeschlossene Aufträge aus den letzten Tagen."
                : "Keine Aufträge für diesen Filter."}
            </div>
          </div>
        )}

        {gruppen.map((g, i) => (
          <div key={(g.datum ?? g.art) + i} className="op-gruppe">
            <div className="au-gruppe-kopf">
              <span className={"op-gruppe-titel" + (g.art === "liegen" ? " rot" : g.datum === heute && g.art === "tag" ? " heute" : g.art === "vergangen" ? " grau" : "")}>
                {g.art === "liegen" ? "NOCH ZU ERLEDIGEN"
                  : g.art === "flach" ? AUFTRAGS_SORTIERUNG_LABEL[sort].toUpperCase()
                  : (g.art === "vergangen" ? "VERGANGEN · " : "") + tagTitel(g.datum!)}
              </span>
              <span className="small">{g.auftraege.length} {g.auftraege.length === 1 ? "Auftrag" : "Aufträge"}</span>
            </div>
            {g.auftraege.map(karte)}
          </div>
        ))}

        {((!zeigtAlte && versteckt > 0) || vergangene) && (
          <button type="button" className="au-vergangene" onClick={() => setVergangene(!vergangene)}>
            {vergangene ? "Vergangene wieder ausblenden" : `Vergangene anzeigen · ${versteckt} abgeschlossen`}
          </button>
        )}
      </div>

      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setBlatt(null)}>
          <div className="auswahl-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Auswahl">
            <div className="ab-griff" />
            <div className="ab-titel">{blatt === "person" ? "Mitarbeiter" : blatt === "zeitraum" ? "Geladener Zeitraum" : "Sortieren"}</div>
            {blatt === "person" && [{ id: "all", name: "Alle Mitarbeiter" }, ...employees].map((e) => (
              <button key={e.id} type="button" className={"ab-option" + (empFilter === e.id ? " aktiv" : "")} onClick={() => { setEmpFilter(e.id); setBlatt(null); }}>
                <span className="pl-punkt" style={{ background: e.id === "all" ? "var(--text)" : employeeColorFor(employees, e.id) }} />
                <span className="ab-text">{e.name}</span>
                {empFilter === e.id && <span className="ab-haken">✓</span>}
              </button>
            ))}
            {blatt === "zeitraum" && fenster && (["aktuell", "jahr", "alles"] as const).map((w) => (
              <button key={w} type="button" className={"ab-option" + (fenster.wert === w ? " aktiv" : "")} onClick={() => { fenster.onChange(w); setBlatt(null); }}>
                <span className="ab-text">{AUFTRAGSFENSTER_LABEL[w]}</span>
                {w === "aktuell" && <span className="small">erledigte der letzten 30 Tage, offene immer</span>}
                {fenster.wert === w && <span className="ab-haken">✓</span>}
              </button>
            ))}
            {blatt === "sort" && (Object.keys(AUFTRAGS_SORTIERUNG_LABEL) as AuftragsSortierung[]).map((s) => (
              <button key={s} type="button" className={"ab-option" + (sort === s ? " aktiv" : "")} onClick={() => { setSort(s); setBlatt(null); }}>
                <span className="ab-text">{AUFTRAGS_SORTIERUNG_LABEL[s]}</span>
                {s === "anstehend" && <span className="small">Liegengebliebenes oben, dann heute und die nächsten Tage</span>}
                {s === "neu" && <span className="small">alle Tage, jüngster oben</span>}
                {sort === s && <span className="ab-haken">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nach dem Anlegen geht der frische Auftrag direkt auf. Ein neu angelegter Auftrag ist nie
          fertig: Fahrzeug und Leistungen fehlen noch, und wer ihn erst in der Liste wiedersuchen
          muss, trägt sie oft gar nicht nach. Siehe docs/termine-kontakt-auftrag-analyse.md. */}
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

import { useState } from "react";
import type { Customer, Employee, Order } from "@/lib/types";
import { TERMIN_FILTER, type TerminFilter, ORDER_STATUS_FARBE, ORDER_STATUS_LABEL } from "@/lib/constants";
import { getPhoneNumbers, todayStr } from "@/lib/helpers";
import { employeeColorFor } from "@/lib/calendar";
import { alsNaechstes } from "@/lib/dashboard";
import { lueckeText, naechsterWann, terminTage, terminTagTitel, uhrzeit } from "@/lib/terminAnsicht";
import { IconNavPin } from "@/components/icons";

// Der Reiter „Termine" (neu gestaltet am 26.09.2026, Entwurf „L · Termine") – vorher als
// Tabelle direkt in app/page.tsx: Zeitraum-Knöpfe, darunter vier Spalten Datum/Kunde/Auftrag/
// Knöpfe.
//
// Jetzt im Stil der Einsatzplanung und der Auftragsliste: eine Bedienleiste, die stehen bleibt
// (Zeitraum als Umschalter mit Zahl, Mitarbeiter als Pillen), darunter bei „Heute" der Kasten
// „Als Nächstes" und jeder Tag als Zeitleiste – vorbei grau, läuft gerade orange, kommt noch
// im Ring der Mitarbeiterfarbe, dazu die Jetzt-Linie und freie Lücken ab einer Stunde. Die
// Regeln stehen in lib/terminAnsicht.ts.
//
// Gefiltert wird weiterhin in app/page.tsx, weil dieselbe Auswahl die Nadeln auf der Karte
// steuert (terminKundenIds). Hier wird nur gezeichnet.

type Zeile = { cust: Customer; order: Order };

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONAT = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function TerminePanel(p: {
  // Im gewählten Zeitraum UND beim gewählten Mitarbeiter.
  zeilen: Zeile[];
  // Beim gewählten Mitarbeiter, ohne Zeitraum – für Kopfzeile und „Als Nächstes".
  personZeilen: Zeile[];
  zeitraum: TerminFilter;
  onZeitraum: (z: TerminFilter) => void;
  zahlen: Record<TerminFilter, number>;
  person: string;
  onPerson: (id: string) => void;
  // Die Mitarbeiter für die Pillen (beim Techniker nur er selbst – dann entfällt die Reihe).
  personen: Employee[];
  // Alle Mitarbeiter, für Namen und Farben – dieselbe Farbe wie in der Einsatzplanung.
  employees: Employee[];
  orderEmployees: Record<string, string[]>;
  standardDauerMin: number;
  leistungenText: (orderId: string) => string;
  onOpenOrder: (orderId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  isTechniker: boolean;
}) {
  const [menuFuer, setMenuFuer] = useState<string | null>(null);
  const heute = todayStr();
  const jetzt = new Date();
  const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();

  const tage = terminTage(p.zeilen, heute, jetztMin, p.standardDauerMin);
  const heuteZeilen = p.personZeilen.filter((z) => z.order.order_date === heute && z.order.status !== "storniert");
  const heuteErledigt = heuteZeilen.filter((z) => z.order.status === "erledigt").length;

  // „Als Nächstes" nur bei „Heute" und nur, wenn es heute noch etwas gibt – für morgen steht der
  // Kasten im Dashboard.
  const naechster = p.zeitraum === "heute"
    ? alsNaechstes(heuteZeilen.map((z) => z.order), heute, jetztMin, p.standardDauerMin)
    : null;
  const naechsterZeile = naechster && naechster.order_date === heute ? heuteZeilen.find((z) => z.order.id === naechster.id) ?? null : null;

  const namen = (orderId: string) => (p.orderEmployees[orderId] || [])
    .map((id) => p.employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ");

  const anrufSymbol = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>;

  function jetztLinie() {
    return (
      <div className="te-jetzt" aria-label={`Jetzt, ${uhrzeit(jetztMin)} Uhr`}>
        <b>{uhrzeit(jetztMin)}</b><i /><span />
      </div>
    );
  }

  return (
    <div className="tabpanel active">
      <div className="te-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Termine</h2>
              <span className="lg-unter">
                {WOCHENTAG[jetzt.getDay()]}, {jetzt.getDate()}. {MONAT[jetzt.getMonth()]} · {heuteZeilen.length} heute{heuteZeilen.length > 0 ? `, ${heuteErledigt} erledigt` : ""}
              </span>
            </div>
          </div>
          {/* Zeitraum statt Häkchen (seit 2026): Die Frage lautet „wo bin ich heute" bzw. „wie
              liegen die Termine der Woche". Die Auswahl steuert zugleich die Nadeln auf der Karte. */}
          <div className="lg-lagerwahl" role="group" aria-label="Zeitraum">
            {TERMIN_FILTER.map(({ wert, text }) => (
              <button key={wert} type="button" className={p.zeitraum === wert ? "aktiv" : ""} aria-pressed={p.zeitraum === wert} onClick={() => p.onZeitraum(wert)}>
                {text}<span className="lg-lagerwahl-zahl">{p.zahlen[wert]}</span>
              </button>
            ))}
          </div>
          {p.personen.length > 1 && (
            <div className="pl-filter" role="group" aria-label="Mitarbeiter">
              {[{ id: "alle", name: "Alle Mitarbeiter" }, ...p.personen].map((e) => (
                <button key={e.id} type="button" className={"pl-pille" + (p.person === e.id ? " aktiv" : "")} aria-pressed={p.person === e.id} onClick={() => p.onPerson(e.id)}>
                  {e.id !== "alle" && <span className="pl-punkt" style={{ background: employeeColorFor(p.employees, e.id) }} />}
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {naechsterZeile && (
          <div className="db-naechster">
            <div className="db-n-kopf">
              <span className="db-n-wann">ALS NÄCHSTES · {naechsterWann(naechsterZeile.order, heute, jetztMin)}</span>
              {namen(naechsterZeile.order.id) && <span className="db-n-wer">{namen(naechsterZeile.order.id)}</span>}
            </div>
            <button type="button" className="db-n-titel" onClick={() => p.onOpenOrder(naechsterZeile.order.id)}>
              {naechsterZeile.order.time ? naechsterZeile.order.time.slice(0, 5) + " " : ""}{naechsterZeile.cust.name}
            </button>
            <span className="db-n-unter">{[naechsterZeile.cust.address, p.leistungenText(naechsterZeile.order.id)].filter(Boolean).join(" · ")}</span>
            <div className="db-n-knoepfe">
              {naechsterZeile.cust.address.trim() ? (
                <button type="button" className="primaer" onClick={(e) => p.onNavigate(e, naechsterZeile.cust)}>Navigation</button>
              ) : <span />}
              {getPhoneNumbers(naechsterZeile.cust).length > 0 ? (
                <button type="button" onClick={(e) => p.onCall(e, naechsterZeile.cust)}>Anrufen</button>
              ) : <span />}
              <button type="button" onClick={() => p.onOpenOrder(naechsterZeile.order.id)}>Auftrag</button>
            </div>
          </div>
        )}

        {p.zeilen.length === 0 && (
          <div className="db-karte">
            <div className="db-leer">
              Keine Termine in diesem Zeitraum.
              {p.zahlen.alle > 0 && p.zeitraum !== "alle" && " Unter „Alle“ stehen ältere."}
            </div>
          </div>
        )}

        {tage.map((tag) => (
          <div key={tag.datum} className="te-tag">
            <div className="au-gruppe-kopf">
              <span className={"op-gruppe-titel" + (tag.datum === heute ? " heute" : tag.datum < heute ? " grau" : "")}>{terminTagTitel(tag.datum, heute)}</span>
              <span className="small">{tag.eintraege.length} {tag.eintraege.length === 1 ? "Termin" : "Termine"}</span>
            </div>
            {tag.eintraege.map((e, i) => {
              const { cust, order } = e.zeile;
              const wer = p.orderEmployees[order.id] || [];
              const farbe = wer.length ? employeeColorFor(p.employees, wer[0]) : "var(--frei-linie)";
              const letzter = i === tag.eintraege.length - 1;
              return (
                <div key={order.id} className="te-eintrag">
                  {tag.jetztVor === i && jetztLinie()}
                  <div className="te-reihe">
                    <span className={"te-zeit" + (e.phase === "vorbei" ? " vorbei" : "")}>
                      <b>{e.zeitraum ? uhrzeit(e.zeitraum.start) : "–"}</b>
                      {/* „bis" nur mit eingetragener Endzeit – die geschätzte Standarddauer ist
                          eine Annahme und gehört nicht als Uhrzeit auf die Karte. */}
                      {order.end_time ? <span>bis {order.end_time.slice(0, 5)}</span> : !e.zeitraum && <span>ohne Zeit</span>}
                    </span>
                    <span className="te-achse" aria-hidden="true">
                      <span className={"te-punkt " + e.phase} style={e.phase === "kommt" ? { borderColor: farbe } : undefined} />
                      <span className={"te-linie" + (letzter && !e.luecke ? " ende" : "")} />
                    </span>
                    <div className={"te-karte " + e.phase} role="button" tabIndex={0}
                      onClick={() => p.onOpenOrder(order.id)} onKeyDown={(ev) => { if (ev.key === "Enter") p.onOpenOrder(order.id); }}>
                      <span className="au-text">
                        <span className="au-zeile1">
                          <span className="au-kunde">{cust.name}</span>
                          <span className="au-menue-platz" onClick={(ev) => ev.stopPropagation()}>
                            <span className="op-menue-anker au-menue">
                              <button type="button" className="op-mehr-knopf" aria-label="Weitere Aktionen" onClick={() => setMenuFuer(menuFuer === order.id ? null : order.id)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                              </button>
                              {menuFuer === order.id && (
                                <span className="op-menue">
                                  <button type="button" onClick={() => { setMenuFuer(null); p.onOpenOrder(order.id); }}>Auftrag öffnen</button>
                                  <button type="button" onClick={() => { setMenuFuer(null); p.onOpenCustomer(cust.id); }}>Kunde öffnen</button>
                                  {!p.isTechniker && <button type="button" onClick={(ev) => { setMenuFuer(null); p.onEditEmployees(ev, order.id); }}>Mitarbeiter zuteilen</button>}
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                        {cust.address.trim() && <span className="au-leistungen">{cust.address}</span>}
                        <span className="au-leistungen">{p.leistungenText(order.id)}</span>
                        <span className="au-marken">
                          {wer.map((id) => (
                            <span key={id} className="au-wer" style={{ background: employeeColorFor(p.employees, id) }}>
                              {p.employees.find((x) => x.id === id)?.name ?? "?"}
                            </span>
                          ))}
                          {e.phase === "laeuft" && order.status === "offen"
                            ? <span className="badge te-laeuft">Läuft gerade</span>
                            : <span className={`badge ${ORDER_STATUS_FARBE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>}
                        </span>
                      </span>
                      <span className="au-knoepfe" onClick={(ev) => ev.stopPropagation()}>
                        {cust.address.trim() && (
                          <button type="button" className="kl-rund nav" title="Navigation starten (Google Maps / Apple Karten)" aria-label="Navigation" onClick={(ev) => p.onNavigate(ev, cust)}>
                            <IconNavPin />
                          </button>
                        )}
                        {getPhoneNumbers(cust).length > 0 && (
                          <button type="button" className="kl-rund anruf" title="Kunde anrufen" aria-label="Kunde anrufen" onClick={(ev) => p.onCall(ev, cust)}>
                            {anrufSymbol}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                  {e.luecke && (
                    <div className="te-luecke">
                      <span className="te-zeit" />
                      <span className="te-achse" aria-hidden="true"><span className={"te-linie" + (letzter ? " ende" : "")} /></span>
                      <span className="te-luecke-text">{lueckeText(e.luecke)}</span>
                    </div>
                  )}
                  {letzter && tag.jetztVor === tag.eintraege.length && jetztLinie()}
                </div>
              );
            })}
          </div>
        ))}

        {p.zeilen.length > 0 && <span className="small sl-fuss">Die Karte zeigt in diesem Reiter nur die Kunden dieser Termine.</span>}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type {
  Article, Customer, ContactHistoryEntry, Employee, Order, OrderArticle, OrderStatus,
  StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { todayStr, formatDate, formatEUR, effectiveColor, kundenMitTermin, KUNDEN_ZUSTAND_LABEL, getPhoneNumbers, orderArticleTotals } from "@/lib/helpers";
import { istAbgeschlossen } from "@/lib/constants";
import { employeeColorFor } from "@/lib/calendar";
import { datumKurz } from "@/lib/dashboard";
import { VehicleRow, AddVehicleInline } from "./VehicleSection";
import { AdressFeld } from "@/components/AdressFeld";
import { IconNavPin } from "@/components/icons";
import { EingelagerteReifen } from "./EingelagerteReifen";
import { CustomerOrderRow } from "./CustomerOrderRow";
import { auftragsNr } from "@/lib/testkunde";

// Das große Kunden-Detailfenster (Modal): Kundendaten, Fahrzeuge, Kontakt erfassen,
// Aufträge & Termine (inkl. Leistungen/Artikel je Auftrag), Kontakt-Historie, sowie
// Deaktivieren/Löschen. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Seit 26.09.2026 (Entwurf O) mit Kopf, vier Handgriffen (Anrufen, Navigation, Kontakt,
// Auftrag) und Reitern statt einer langen Seite. Was man an einem Kunden selten tut –
// Einmalkunde, Laufkundschaft, deaktivieren, löschen – steht im Menü „⋯".
type DmReiter = "uebersicht" | "fahrzeuge" | "auftraege" | "verlauf" | "daten";

function initialen(text: string): string {
  const teile = text.split(/\s+/).filter(Boolean);
  return (teile.slice(0, 2).map((t) => t[0]).join("") || "?").toUpperCase();
}
export function DetailModal(props: {
  customer: Customer; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>; history: ContactHistoryEntry[]; periodMonths: number;
  vehicles: Vehicle[]; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  // Nur zum Anzeigen der Zusammenfassung je Auftrag. Bearbeitet werden die Positionen im
  // Auftragsfenster – das Kundenfenster hat dafür kein zweites Formular mehr.
  orderArticles: OrderArticle[];
  // Öffnet das Auftragsfenster über diesem hier.
  onOpenOrder: (id: string) => void;
  // Schließt dieses Fenster und schaltet die Karte in den Modus „Punkt setzen". Für die
  // Adressen, die OpenStreetMap gar nicht oder nur ungenau kennt – Neubaugebiete,
  // Hinterhöfe, Gewerbezufahrten.
  onPositionSetzen: () => void;
  // Lässt den Kartendienst die GESPEICHERTE Adresse dieses Kunden erneut suchen. Liefert
  // `false`, wenn er nichts findet – das ist eine Antwort, kein Fehler, und wird als solche
  // angezeigt.
  onPositionSuchen: () => Promise<boolean>;
  onClose: () => void;
  // Gibt ein Versprechen zurück, damit der Knopf weiß, WANN gespeichert ist. Vorher war das
  // eine Funktion ohne Rückgabe – der Knopf konnte nichts melden, und genau das war der
  // Befund aus dem Betrieb: „wenn ich auf Kundendaten speichern klicke, passiert nichts."
  onSaveFields: (f: Partial<Customer>) => Promise<void>;
  onMarkContacted: () => void;
  onMarkOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  // Testkunde (Migration 60): restlos löschen statt Papierkorb. Nur für den Superadmin gesetzt.
  onTestkundeLoeschen?: () => Promise<void>;
  // Der Schalter „Testkunde" im Menü – nur Superadmin, nur solange der Kunde keinen Auftrag hat.
  darfTestkundeUmschalten?: boolean;
  // Legt einen Auftrag für diesen Kunden an und öffnet das vollständige Auftragsfenster.
  // Kein eigenes Formular mehr an dieser Stelle: es war die dritte von vier Masken für
  // dieselbe Sache und konnte als einzige keine Leistungen erfassen (docs/auftragsablauf.md).
  onNeuerAuftrag: () => void;
  onUpdateOrder: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onDeleteOrder: (id: string) => void;
  onAddVehicle: (fields: { licensePlate: string; makeModel: string; tireSize: string; note: string }) => void;
  onUpdateVehicle: (id: string, fields: { licensePlate: string; makeModel: string; tireSize: string; note: string }) => void;
  onDeleteVehicle: (id: string) => void;
  // Aus der Liste „Eingelagerte Reifen" ins Lager auf diesen Platz springen. Fehlt, wenn die
  // Rolle das Lager nicht sehen darf.
  onZumLagerplatz?: (platzId: string) => void;
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
}) {
  const { customer: cust } = props;
  const [name, setName] = useState(cust.name);
  const [company, setCompany] = useState(cust.company || "");
  const [anrede, setAnrede] = useState<"" | "Herr" | "Frau">(cust.anrede || "");
  const [email, setEmail] = useState(cust.email || "");
  const [address, setAddress] = useState(cust.address);
  // Koordinate aus einem angenommenen Vorschlag. Null heißt: von Hand getippt – dann bestimmt
  // die Speicherfunktion die Position wie bisher selbst.
  const [koordinate, setKoordinate] = useState<{ lat: number; lng: number } | null>(null);
  const [mobile, setMobile] = useState(cust.phone_mobile || "");
  const [landline, setLandline] = useState(cust.phone_landline || "");
  const [note, setNote] = useState(cust.note || "");
  const [istFirma, setIstFirma] = useState(!!(cust.company || "").trim());
  const [reiter, setReiter] = useState<DmReiter>("uebersicht");
  const [menueOffen, setMenueOffen] = useState(false);

  // Ungespeicherte Stammdaten: Wer das Fenster schließt, soll nicht still verlieren, was er
  // im Reiter „Daten" getippt hat.
  const datenGeaendert =
    name !== cust.name || company !== (cust.company || "") || anrede !== (cust.anrede || "") ||
    email !== (cust.email || "") || address !== cust.address || mobile !== (cust.phone_mobile || "") ||
    landline !== (cust.phone_landline || "") || note !== (cust.note || "");
  function schliessen() {
    if (datenGeaendert && !window.confirm("Die Änderungen an den Kundendaten sind noch nicht gespeichert. Verwerfen?")) return;
    props.onClose();
  }

  // Was der Speichern-Knopf gerade sagt. „gespeichert" fällt nach ein paar Sekunden von
  // selbst zurück – eine Bestätigung, die stehen bleibt, ist beim nächsten Blick eine Lüge.
  const [speicherStand, setSpeicherStand] = useState<"bereit" | "speichert" | "gespeichert">("bereit");
  const speicherUhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (speicherUhr.current) clearTimeout(speicherUhr.current); }, []);

  // Dasselbe für die Positionssuche. „nichts" bleibt dagegen stehen, bis sich etwas ändert:
  // Es ist keine Bestätigung, sondern ein Befund, den man lesen soll.
  const [geoStand, setGeoStand] = useState<"bereit" | "sucht" | "nichts">("bereit");

  // Gesucht wird immer die GESPEICHERTE Adresse, nie der Text im Feld. Sonst stünde am Kunden
  // eine Position, die zu einer Adresse gehört, die so nirgends gespeichert ist – derselbe
  // Fehler wie damals DOT-Datum am Fahrzeug: ein Wert an einem Träger, für den er nicht gilt.
  const adresseGeaendert = address.trim() !== (cust.address || "").trim();

  async function speichern() {
    setSpeicherStand("speichert");
    try {
      await props.onSaveFields({
        name, address, phone_mobile: mobile, phone_landline: landline, note,
        // Leere Felder als null und nicht als leere Zeichenkette: sonst stünde in der
        // Datenbank "" neben null für dieselbe Aussage, und jede Abfrage müsste beides
        // abfangen. Die Anrede hat zudem eine Prüfbedingung, die "" ablehnt.
        company: company.trim() || null,
        email: email.trim() || null,
        anrede: anrede || null,
        ...(koordinate ? { lat: koordinate.lat, lng: koordinate.lng } : {}),
      });
      setSpeicherStand("gespeichert");
      if (speicherUhr.current) clearTimeout(speicherUhr.current);
      speicherUhr.current = setTimeout(() => setSpeicherStand("bereit"), 2500);
    } catch (e) {
      // Der Knopf wird wieder benutzbar – die Meldung selbst übernimmt das Fehlerband der
      // App. Deshalb fliegt der Fehler weiter: es soll weiterhin EINE Stelle geben, die
      // Fehler anzeigt, und nicht zwei mit womöglich verschiedenem Wortlaut.
      setSpeicherStand("bereit");
      throw e;
    }
  }

  async function positionSuchen() {
    setGeoStand("sucht");
    try {
      const gefunden = await props.onPositionSuchen();
      setGeoStand(gefunden ? "bereit" : "nichts");
    } catch (e) {
      setGeoStand("bereit");
      throw e;
    }
  }

  // Dieselbe Frage wie auf Karte und Liste, aus denselben Daten: Steht für diesen Kunden noch
  // ein Termin an? `props.orders` sind bereits nur seine – die Menge ist also klein genug, um
  // sie hier zu bilden, statt sie durch das halbe Programm zu reichen.
  const heute = todayStr();
  const color = effectiveColor(cust, props.periodMonths, heute, kundenMitTermin(props.orders).has(cust.id));
  const custOrders = props.orders.slice().sort((a, b) => b.order_date.localeCompare(a.order_date) || (b.time || "").localeCompare(a.time || ""));
  const naechster = props.orders
    .filter((o) => !istAbgeschlossen(o.status) && o.order_date && (o.order_date >= heute || o.status === "in_arbeit"))
    .sort((a, b) => a.order_date.localeCompare(b.order_date) || (a.time || "").localeCompare(b.time || ""))[0];
  const naechsterMa = naechster ? (props.orderEmployees[naechster.id] || []).map((id) => props.employees.find((e) => e.id === id)).filter((e): e is Employee => !!e) : [];

  const erledigte = props.orders.filter((o) => o.status === "erledigt");
  const umsatz = erledigte.reduce((n, o) => n + orderArticleTotals(props.orderArticles.filter((oa) => oa.order_id === o.id), o.rechnung_noetig).net, 0);
  const seitJahr = erledigte.length ? erledigte.map((o) => o.order_date).sort()[0]?.slice(0, 4) : null;

  // Der Verlauf: Kontakte und abgeschlossene Aufträge in einer Zeitleiste. Getrennt standen
  // sie bisher in zwei Abschnitten – und die Frage „wann war zuletzt etwas?" hatte zwei Antworten.
  const verlauf = [
    ...props.history.map((h) => ({ id: "k" + h.id, datum: h.date, titel: "Kontakt", text: h.note || "kontaktiert", art: "kontakt" as const, auftragId: null as string | null })),
    ...props.orders.filter((o) => istAbgeschlossen(o.status)).map((o) => ({
      id: "a" + o.id, datum: o.order_date, titel: o.status === "erledigt" ? `Auftrag #${auftragsNr(o.order_number)} erledigt` : `Auftrag #${auftragsNr(o.order_number)} storniert`,
      text: o.title, art: (o.status === "erledigt" ? "erledigt" : "storniert") as "erledigt" | "storniert", auftragId: o.id,
    })),
  ].sort((a, b) => b.datum.localeCompare(a.datum));

  const telefone = getPhoneNumbers(cust);
  const hauptname = (cust.company || "").trim() || cust.name;
  const unterzeile = [cust.kundennummer != null ? `Kd.-Nr. ${cust.kundennummer}` : null, cust.address.trim() || null, (cust.company || "").trim() ? cust.name : null].filter(Boolean).join(" · ");
  const kontaktText = cust.last_contact
    ? `Zuletzt ${formatDate(cust.last_contact)} · ${KUNDEN_ZUSTAND_LABEL[color]}${cust.wiedervorlage_am ? ` · wieder anrufen am ${formatDate(cust.wiedervorlage_am)}` : ""}`
    : `Noch kein Kontakt erfasst · ${KUNDEN_ZUSTAND_LABEL[color]}`;

  const geoSatz = cust.lat == null ? (
    <span className="small dm-geo rot">Für diesen Kunden gibt es noch keine Kartenposition.</span>
  ) : cust.geo_genauigkeit === "ungefaehr" ? (
    <span className="small dm-geo orange">
      Ungefähre Position: Der Kartendienst kennt die Straße, aber nicht die Hausnummer.
      Die Navigation läuft deshalb über die Adresse, nicht über diesen Punkt.
    </span>
  ) : cust.geo_genauigkeit === "hand" ? (
    <span className="small dm-geo gruen">📍 Position von Hand gesetzt.</span>
  ) : (
    <span className="small dm-geo">📍 Kartenposition vom Kartendienst gefunden.</span>
  );

  const REITER: [DmReiter, string][] = [
    ["uebersicht", "Übersicht"],
    ["fahrzeuge", props.vehicles.length ? `Fahrzeuge ${props.vehicles.length}` : "Fahrzeuge"],
    ["auftraege", props.orders.length ? `Aufträge ${props.orders.length}` : "Aufträge"],
    ["verlauf", "Verlauf"],
    ["daten", "Daten"],
  ];

  return (
    <div className="modal-overlay dm-overlay" onClick={(e) => { if (e.target === e.currentTarget) schliessen(); }}>
      <div className="dm-fenster" role="dialog" aria-label={`Kunde ${hauptname}`}>
        <div className="dm-kopf">
          <div className="dm-kopf-zeile">
            <button type="button" className="dm-zu" onClick={schliessen} aria-label="Schließen">×</button>
            <span className={`kl-kreis ${color} dm-kreis`}>{initialen(hauptname)}</span>
            <span className="dm-titel">
              <b>{hauptname}{cust.testkunde && <span className="test-marke">TEST</span>}</b>
              <span className="small">{unterzeile || KUNDEN_ZUSTAND_LABEL[color]}</span>
            </span>
            <button type="button" className="dm-mehr" onClick={() => setMenueOffen(true)} aria-label="Weitere Aktionen" title="Weitere Aktionen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" /></svg>
            </button>
          </div>
          <div className="dm-aktionen">
            <button type="button" className="dm-aktion" disabled={telefone.length === 0} onClick={(e) => props.onCall(e, cust)} title={telefone.length ? "Anrufen" : "Keine Telefonnummer hinterlegt"}>
              <span className="dm-aktion-zeichen gruen">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
              </span>
              Anrufen
            </button>
            <button type="button" className="dm-aktion" disabled={!cust.address.trim()} onClick={(e) => props.onNavigate(e, cust)} title="Navigation starten (Google Maps / Apple Karten)">
              <span className="dm-aktion-zeichen blau"><IconNavPin /></span>
              Navigation
            </button>
            <button type="button" className="dm-aktion" onClick={props.onMarkContacted} title="Kontakt erfassen">
              <span className="dm-aktion-zeichen hell">☎</span>
              Kontakt
            </button>
            <button type="button" className="dm-aktion" onClick={props.onNeuerAuftrag} title="Neuen Auftrag anlegen">
              <span className="dm-aktion-zeichen orange">+</span>
              Auftrag
            </button>
          </div>
          <div className="ad-reiter dm-reiter" role="tablist" aria-label="Kunde">
            {REITER.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>
                {t}{k === "daten" && datenGeaendert ? " •" : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="dm-inhalt">
          {reiter === "uebersicht" && (
            <>
              {naechster && (
                <div className="dm-termin">
                  <div className="dm-termin-kopf">
                    <span>{naechster.status === "in_arbeit" ? "IN ARBEIT" : "NÄCHSTER TERMIN"}</span>
                    {naechsterMa.map((m) => (
                      <span key={m.id} className="dm-ma" style={{ background: employeeColorFor(props.employees, m.id) }}>{m.name}</span>
                    ))}
                  </div>
                  <b className="dm-termin-wann">
                    {datumKurz(naechster.order_date)}
                    {naechster.time ? ` · ${naechster.time.slice(0, 5)}` : ""}
                  </b>
                  <span className="dm-termin-was">#{auftragsNr(naechster.order_number)} · {naechster.title}</span>
                  <button type="button" className="dm-termin-knopf" onClick={() => props.onOpenOrder(naechster.id)}>Auftrag öffnen</button>
                </div>
              )}

              {/* Kontakt erfassen öffnet denselben Dialog wie auf der Karte (Migration 23): dort
                  wird festgehalten, was bei dem Kontakt herauskam – Auftrag, Wiedervorlage oder
                  kein Interesse – samt Kontaktdatum. Bewusst EIN Dialog für beide Wege
                  (docs/termine-kontakt-auftrag-analyse.md). */}
              <button type="button" className="sl-chance" onClick={props.onMarkContacted}>
                <span className="dm-aktion-zeichen hell">☎</span>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Kontakt</span>
                  <span className="small">{kontaktText}</span>
                </span>
                <span className="db-link">Erfassen ›</span>
              </button>

              <div className="db-karte dm-lager">
                <EingelagerteReifen
                  saetze={props.tireStorages}
                  plaetze={props.storageSlots}
                  lager={props.warehouses}
                  fahrzeuge={props.vehicles}
                  onZumPlatz={props.onZumLagerplatz}
                />
              </div>

              <div className="db-karte dm-kontakt">
                <div className="db-karte-kopf">
                  <span className="db-karte-titel">Kontaktdaten</span>
                  <button type="button" className="db-link" onClick={() => setReiter("daten")}>Bearbeiten</button>
                </div>
                {[["Mobil", cust.phone_mobile], ["Festnetz", cust.phone_landline], ["E-Mail", cust.email], ["Adresse", cust.address], ["Notiz", cust.note]]
                  .filter(([, w]) => (w || "").trim())
                  .map(([t, w]) => (
                    <div key={t} className="dm-kv"><span>{t}</span><b>{w}</b></div>
                  ))}
                {geoSatz}
              </div>
            </>
          )}

          {reiter === "fahrzeuge" && (
            <>
              {props.vehicles.length === 0 && <div className="db-karte"><div className="db-leer">Noch keine Fahrzeuge hinterlegt.</div></div>}
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
              <AddVehicleInline tireStorages={props.tireStorages} storageSlots={props.storageSlots} warehouses={props.warehouses} onAdd={props.onAddVehicle} />
            </>
          )}

          {reiter === "auftraege" && (
            <>
              <button type="button" className="dm-plus orange" onClick={props.onNeuerAuftrag}>+ Neuer Auftrag</button>
              {custOrders.length === 0 && <div className="db-karte"><div className="db-leer">Noch keine Aufträge hinterlegt.</div></div>}
              {custOrders.map((o) => (
                <CustomerOrderRow
                  key={o.id}
                  order={o}
                  employees={props.employees}
                  assignedEmployeeIds={props.orderEmployees[o.id] || []}
                  orderArticles={props.orderArticles.filter((oa) => oa.order_id === o.id)}
                  onOpen={props.onOpenOrder}
                />
              ))}
              {erledigte.length > 0 && (
                <span className="small dm-fuss">
                  Umsatz: {formatEUR(umsatz)} netto aus {erledigte.length} erledigten {erledigte.length === 1 ? "Auftrag" : "Aufträgen"}{seitJahr ? ` seit ${seitJahr}` : ""}
                </span>
              )}
            </>
          )}

          {reiter === "verlauf" && (
            verlauf.length === 0 ? (
              <div className="db-karte"><div className="db-leer">Noch kein Kontakt und kein abgeschlossener Auftrag.</div></div>
            ) : (
              <div className="db-karte dm-verlauf">
                {verlauf.map((v) => (
                  <div key={v.id} className={"dm-v-zeile " + v.art}>
                    <span className="dm-v-punkt" aria-hidden="true" />
                    <span className="dm-v-text">
                      <span className="small">{formatDate(v.datum)}</span>
                      <b>{v.titel}</b>
                      <span className="small">{v.text}</span>
                    </span>
                    {v.auftragId && <button type="button" className="db-link" onClick={() => props.onOpenOrder(v.auftragId as string)}>Öffnen</button>}
                  </div>
                ))}
              </div>
            )
          )}

          {reiter === "daten" && (
            <div className="db-karte dm-daten">
              {/* Firma steht ÜBER dem Namen, weil sie bei Geschäftskunden die Hauptangabe ist und
                  der Name dort den Ansprechpartner trägt (Migration 24). */}
              <div className="lg-lagerwahl nk-typ" role="group" aria-label="Kundenart">
                <button type="button" className={!istFirma ? "aktiv" : ""} aria-pressed={!istFirma} onClick={() => { setIstFirma(false); setCompany(""); }}>Privat</button>
                <button type="button" className={istFirma ? "aktiv" : ""} aria-pressed={istFirma} onClick={() => setIstFirma(true)}>Firma</button>
              </div>
              {istFirma && (
                <label className="nk-feld"><span>Firma</span><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
              )}
              <div className="nk-zeile">
                <label className="nk-feld nk-anrede"><span>Anrede</span>
                  <select value={anrede} onChange={(e) => setAnrede(e.target.value as "" | "Herr" | "Frau")}>
                    <option value="">–</option>
                    <option value="Herr">Herr</option>
                    <option value="Frau">Frau</option>
                  </select>
                </label>
                <label className="nk-feld"><span>{istFirma ? "Ansprechpartner" : "Name"}</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
              </div>
              {/* Wird ein Vorschlag angenommen, kommt die Koordinate gleich mit und wird zusammen
                  mit den übrigen Feldern gespeichert. Ohne das würde beim Speichern erneut
                  geokodiert – mit demselben Ergebnis, aber einer weiteren Anfrage nach draußen. */}
              <div className="nk-feld">
                <span>Adresse</span>
                <AdressFeld
                  wert={address}
                  onChange={(v) => { setAddress(v); setKoordinate(null); }}
                  onVorschlagGewaehlt={(v) => setKoordinate({ lat: v.lat, lng: v.lng })}
                  platzhalter="z. B. Fürther Str. 12, 90429 Nürnberg"
                />
              </div>
              <div className="nk-zeile">
                <label className="nk-feld"><span>Mobil</span><input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></label>
                <label className="nk-feld"><span>Festnetz</span><input type="tel" value={landline} onChange={(e) => setLandline(e.target.value)} /></label>
              </div>
              <label className="nk-feld"><span>E-Mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="nk-feld"><span>Notiz</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>

              {/* Die Kartenposition und wie genau sie ist (Migration 35). Der Satz steht direkt
                  bei der Adresse, weil er sich mit ihr ändert – und weil hier auch der Weg
                  beginnt, ihn selbst zu setzen. */}
              <div className="dm-geo-zeile">
                {geoSatz}
                <span className="dm-geo-knoepfe">
                  <button
                    type="button" className="es-knopf"
                    disabled={geoStand === "sucht" || adresseGeaendert}
                    title={adresseGeaendert
                      ? "Erst speichern – gesucht wird die gespeicherte Adresse."
                      : "Der Kartendienst sucht diese eine Adresse noch einmal."}
                    onClick={() => { void positionSuchen(); }}
                  >
                    {geoStand === "sucht" ? "Sucht …" : "Neu suchen"}
                  </button>
                  <button type="button" className="es-knopf" onClick={props.onPositionSetzen}>
                    {cust.lat == null ? "Auf Karte setzen" : "Auf Karte korrigieren"}
                  </button>
                </span>
              </div>
              {/* Der Befund der Suche. Er steht UNTER der Zeile und nicht als kurzes Aufblitzen im
                  Knopf: „nichts gefunden" ist die Antwort auf eine Frage, die man gestellt hat. */}
              {geoStand === "nichts" && (
                <div className="small dm-geo rot">
                  Der Kartendienst findet zu dieser Adresse nichts. Setz die Position von Hand auf
                  der Karte.
                </div>
              )}
              {adresseGeaendert && (
                <div className="small">
                  Die Adresse im Feld ist noch nicht gespeichert. Nach dem Speichern sucht die App
                  die Position von selbst.
                </div>
              )}
              <button
                type="button"
                className={"am-knopf" + (speicherStand === "gespeichert" ? " ist-gespeichert" : "")}
                disabled={speicherStand === "speichert" || (!datenGeaendert && speicherStand !== "gespeichert")}
                onClick={() => { void speichern(); }}
              >
                {speicherStand === "speichert" ? "Speichert …"
                  : speicherStand === "gespeichert" ? "Gespeichert ✓"
                  : datenGeaendert ? "Kundendaten speichern" : "Nichts geändert"}
              </button>
            </div>
          )}
        </div>
      </div>

      {menueOffen && (
        <div className="modal-overlay auswahl-overlay" onClick={(e) => { e.stopPropagation(); setMenueOffen(false); }}>
          <div className="auswahl-blatt dm-menue" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Weitere Aktionen">
            <div className="ab-griff" />
            <div className="ab-titel">{hauptname}</div>
            {/* Laufkundschaft (Migration 53) und Einmalkunde (Migration 57): Kennzeichen für das,
                was ein Kunde IST – sofort gespeichert und nicht erst mit „Kundendaten speichern":
                Ein Haken, der erst nach einem zweiten Klick gilt, wird vergessen. */}
            {!cust.laufkundschaft && (
              <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={cust.einmalkunde === true}
                onClick={() => { void props.onSaveFields({ einmalkunde: !cust.einmalkunde }); }}>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Einmalkunde</span>
                  <span className="small">
                    Keine Nadel auf der Karte und nicht in der Anrufliste. Solange ein Termin vor ihm
                    liegt, steht er als dunkelblaue Termin-Nadel da. Aus = wieder ein normaler Kunde.
                  </span>
                </span>
                <span className={"nk-spur" + (cust.einmalkunde ? " an" : "")} aria-hidden="true"><span /></span>
              </button>
            )}
{/* Ein Testkunde ist nie die Laufkundschaft (Migration 60, Prüfbedingung). */}
            {!cust.testkunde && (
                        <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={cust.laufkundschaft === true}
              // Beides zugleich lehnt die Datenbank ab (Migration 57) – wer Laufkundschaft setzt,
              // nimmt den Einmalkunden-Haken im selben Zug heraus.
              onClick={() => { void props.onSaveFields(!cust.laufkundschaft ? { laufkundschaft: true, einmalkunde: false } : { laufkundschaft: false }); }}>
              <span className="db-punkt-text">
                <span className="db-punkt-titel">Laufkundschaft</span>
                <span className="small">
                  Sammelkunde für Barverkäufe ohne Kundenanlage. Nicht in der Anrufliste; beim Abschließen
                  weder Anschrift noch Fahrzeug nötig. Kleinbetragsrechnung bis 250 € brutto (§ 33 UStDV).
                  Es kann nur einen solchen Kunden geben.
                </span>
              </span>
              <span className={"nk-spur" + (cust.laufkundschaft ? " an" : "")} aria-hidden="true"><span /></span>
            </button>
            )}
            <button type="button" className="ab-option" onClick={() => { setMenueOffen(false); props.onMarkOpen(); }}>
              <span className="ab-text">Auf „offen“ setzen</span>
            </button>
            <button type="button" className="ab-option" onClick={() => { setMenueOffen(false); props.onToggleActive(); }}>
              <span className="ab-text">{cust.active === false ? "Kunde reaktivieren" : "Kunde deaktivieren"}</span>
            </button>
            {/* Testkunde (Migration 60): Umschalten nur, solange noch kein Auftrag besteht – die
                Datenbank lehnt es sonst ab (`pruefe_testkunde()`). */}
            {props.darfTestkundeUmschalten && !cust.laufkundschaft && props.orders.length === 0 && (
              <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={cust.testkunde === true}
                onClick={() => { void props.onSaveFields({ testkunde: !cust.testkunde }); }}>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Testkunde</span>
                  <span className="small">Aufträge T1 …, Rechnungen T-RE1 …, keine Kundennummer, zählt in keiner Auswertung. Umschalten geht nur, solange es keinen Auftrag gibt.</span>
                </span>
                <span className={"nk-spur" + (cust.testkunde ? " an" : "")} aria-hidden="true"><span /></span>
              </button>
            )}
            {cust.testkunde && props.onTestkundeLoeschen ? (
              <button type="button" className="ab-option gefahr"
                onClick={() => {
                  const lieg = props.tireStorages.filter((t) => !t.removed_at).length;
                  if (!confirm(`Testkunden "${cust.name}" restlos löschen? Weg sind danach auch ${props.orders.length} ${props.orders.length === 1 ? "Auftrag" : "Aufträge"}, alle Testrechnungen${lieg ? `, ${lieg} ${lieg === 1 ? "Reifensatz" : "Reifensätze"} im Regal` : ""}, Fahrzeuge, Kontakte und das Protokoll. Das lässt sich nicht zurückholen.`)) return;
                  setMenueOffen(false);
                  void props.onTestkundeLoeschen?.();
                }}>
                <span className="ab-text">Testkunde restlos löschen <span className="small">· samt Aufträgen und Testrechnungen</span></span>
              </button>
            ) : (
              <button type="button" className="ab-option gefahr"
                onClick={() => { if (confirm(`Kunde "${cust.name}" wirklich löschen? Er kommt in den Papierkorb (Admin) und lässt sich von dort zurückholen.`)) { setMenueOffen(false); props.onDelete(); } }}>
                <span className="ab-text">In den Papierkorb <span className="small">· samt Aufträgen wiederherstellbar</span></span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

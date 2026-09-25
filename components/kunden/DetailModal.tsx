import { useEffect, useRef, useState } from "react";
import type {
  Article, Customer, ContactHistoryEntry, Employee, Order, OrderArticle, OrderStatus,
  StorageSlot, TireStorage, Vehicle, Warehouse,
} from "@/lib/types";
import { todayStr, formatDate, effectiveColor, kundenMitTermin, KUNDEN_ZUSTAND_LABEL, getPhoneNumbers } from "@/lib/helpers";
import { VehicleRow, AddVehicleInline } from "./VehicleSection";
import { AdressFeld } from "@/components/AdressFeld";
import { IconNavPin } from "@/components/icons";
import { EingelagerteReifen } from "./EingelagerteReifen";
import { CustomerOrderRow } from "./CustomerOrderRow";

// Das große Kunden-Detailfenster (Modal): Kundendaten, Fahrzeuge, Kontakt erfassen,
// Aufträge & Termine (inkl. Leistungen/Artikel je Auftrag), Kontakt-Historie, sowie
// Deaktivieren/Löschen. Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
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
  const color = effectiveColor(cust, props.periodMonths, todayStr(), kundenMitTermin(props.orders).has(cust.id));
  const custOrders = props.orders.slice().sort((a, b) => a.order_date.localeCompare(b.order_date));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={props.onClose}>✕</button>
        <div className="header-row" style={{ paddingRight: 34 }}>
          <h2 style={{ flex: 1 }}>Kunde bearbeiten <span className={`badge ${color}`}>{KUNDEN_ZUSTAND_LABEL[color]}</span></h2>
          {cust.address.trim() && (
            <button className="call-icon-btn nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => props.onNavigate(e, cust)}>
              <IconNavPin />
            </button>
          )}
          {getPhoneNumbers(cust).length > 0 && (
            <button className="call-icon-btn" title="Anrufen" onClick={(e) => props.onCall(e, cust)}>📞</button>
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
        {/* Wird ein Vorschlag angenommen, kommt die Koordinate gleich mit und wird zusammen
            mit den übrigen Feldern gespeichert. Ohne das würde beim Speichern erneut
            geokodiert – mit demselben Ergebnis, aber einer weiteren Anfrage nach draußen. */}
        <div className="field">
          <label>Adresse</label>
          <AdressFeld
            wert={address}
            onChange={(v) => { setAddress(v); setKoordinate(null); }}
            onVorschlagGewaehlt={(v) => setKoordinate({ lat: v.lat, lng: v.lng })}
            platzhalter="z. B. Fürther Str. 12, 90429 Nürnberg"
          />
        </div>
        <div className="row">
          <div className="field"><label>Mobil</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div className="field"><label>Festnetz</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} /></div>
        </div>
        <div className="field"><label>E-Mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Notiz</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button
          className={"btn-primary btn-block" + (speicherStand === "gespeichert" ? " ist-gespeichert" : "")}
          disabled={speicherStand === "speichert"}
          onClick={() => { void speichern(); }}
        >
          {speicherStand === "speichert" ? "Speichert …"
            : speicherStand === "gespeichert" ? "Gespeichert ✓"
            : "💾 Kundendaten speichern"}
        </button>
        {/* Die Kartenposition und wie genau sie ist (Migration 35). Der Satz steht direkt unter
            dem Speichern-Knopf, weil er sich mit der Adresse ändert – und weil hier auch der
            Weg beginnt, ihn selbst zu setzen. */}
        <div className="geo-zeile">
          {cust.lat == null ? (
            <span className="small" style={{ color: "var(--red)" }}>Für diesen Kunden gibt es noch keine Kartenposition.</span>
          ) : cust.geo_genauigkeit === "ungefaehr" ? (
            <span className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
              Ungefähre Position: Der Kartendienst kennt die Straße, aber nicht die Hausnummer.
              Die Navigation läuft deshalb über die Adresse, nicht über diesen Punkt.
            </span>
          ) : cust.geo_genauigkeit === "hand" ? (
            <span className="small" style={{ color: "var(--green)" }}>Position von Hand gesetzt.</span>
          ) : (
            <span className="small" style={{ color: "var(--muted)" }}>Position vom Kartendienst gefunden.</span>
          )}
          <button
            type="button" className="btn-secondary geo-knopf"
            disabled={geoStand === "sucht" || adresseGeaendert}
            title={adresseGeaendert
              ? "Erst speichern – gesucht wird die gespeicherte Adresse."
              : "Der Kartendienst sucht diese eine Adresse noch einmal."}
            onClick={() => { void positionSuchen(); }}
          >
            {geoStand === "sucht" ? "Sucht …" : "Position suchen"}
          </button>
          <button type="button" className="btn-secondary geo-knopf" onClick={props.onPositionSetzen}>
            {cust.lat == null ? "Position auf der Karte setzen" : "Position auf der Karte korrigieren"}
          </button>
        </div>
        {/* Der Befund der Suche. Er steht UNTER der Zeile und nicht als kurzes Aufblitzen im
            Knopf: „nichts gefunden" ist die Antwort auf eine Frage, die man gestellt hat –
            die soll man in Ruhe lesen können, statt sie zu verpassen. */}
        {geoStand === "nichts" && (
          <div className="small" style={{ color: "var(--red)" }}>
            Der Kartendienst findet zu dieser Adresse nichts. Setz die Position von Hand auf
            der Karte.
          </div>
        )}
        {adresseGeaendert && (
          <div className="small" style={{ color: "var(--muted)" }}>
            Die Adresse im Feld ist noch nicht gespeichert. Nach dem Speichern sucht die App
            die Position von selbst.
          </div>
        )}

        <EingelagerteReifen
          saetze={props.tireStorages}
          plaetze={props.storageSlots}
          lager={props.warehouses}
          fahrzeuge={props.vehicles}
          onZumPlatz={props.onZumLagerplatz}
        />

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
              orderArticles={props.orderArticles.filter((oa) => oa.order_id === o.id)}
              onOpen={props.onOpenOrder}
              onDelete={props.onDeleteOrder}
            />
          ))}
        </div>
        <button className="btn-secondary btn-block" onClick={props.onNeuerAuftrag}>
          + Auftrag / Termin hinzufügen
        </button>

        <h4>Kontakt-Historie</h4>
        {props.history.length === 0 && <div className="small">Noch keine Kontakt-Historie</div>}
        {props.history.map((h) => (
          <div key={h.id} className="histentry">{formatDate(h.date)} – {h.note || "kontaktiert"}</div>
        ))}

        <hr />
        {/* Laufkundschaft (Migration 53). Der Haken steht hier unten bei den Dingen, die ein
            Kunde IST – nicht oben bei den Feldern, die man bei jedem Besuch ändert. Er wird
            genau einmal gesetzt, an genau einem Datensatz.

            Gespeichert wird sofort und nicht erst mit dem Speichern-Knopf: Er gehört nicht zu
            den Stammdaten im Formular darüber, und ein Haken, der erst nach einem zweiten
            Klick gilt, wird vergessen. */}
        <label className="checkbox-row erklaert" style={{ marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={cust.laufkundschaft === true}
            // Beides zugleich lehnt die Datenbank ab (Migration 57) – wer Laufkundschaft setzt,
            // nimmt den Einmalkunden-Haken im selben Zug heraus.
            onChange={(e) => { void props.onSaveFields(e.target.checked ? { laufkundschaft: true, einmalkunde: false } : { laufkundschaft: false }); }}
          />
          <span>
            <b>Laufkundschaft</b> – Sammelkunde für Barverkäufe ohne Kundenanlage
            <span className="small" style={{ display: "block" }}>
              Nimmt diesen Kunden aus der Anrufliste und verlangt beim Abschließen weder
              Anschrift noch Fahrzeug. Zulässig als Kleinbetragsrechnung bis 250 € brutto
              (§ 33 UStDV). Es kann nur einen solchen Kunden geben.
            </span>
          </span>
        </label>

        {/* Einmalkunde (Migration 57). Derselbe Ort und dieselbe Art wie die Laufkundschaft: ein
            Haken für das, was ein Kunde IST, sofort gespeichert. Kommt er nach Jahren doch
            wieder, nimmt man den Haken heraus – und er läuft wieder im normalen Rhythmus. */}
        {!cust.laufkundschaft && (
          <label className="checkbox-row erklaert" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={cust.einmalkunde === true}
              onChange={(e) => { void props.onSaveFields({ einmalkunde: e.target.checked }); }}
            />
            <span>
              <b>Einmalkunde</b> – für die Nadeln nicht beachten
              <span className="small" style={{ display: "block" }}>
                Keine Nadel auf der Karte und nicht in der Anrufliste. Solange ein Termin vor ihm
                liegt, steht er als dunkelblaue Termin-Nadel da; ist der Termin vorbei,
                verschwindet auch sie. Haken heraus = wieder ein normaler Kunde.
              </span>
            </span>
          </label>
        )}

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

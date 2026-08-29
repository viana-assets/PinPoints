import { useEffect, useRef, useState } from "react";
import type { Article, Customer, Employee, Order, OrderArticle, OrderStatus, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { formatDate, formatOrderDateTime } from "@/lib/helpers";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, istAbgeschlossen } from "@/lib/constants";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { ArticleAssignPanel } from "./ArticleAssignPanel";
import { IconNavPin, IconTrash } from "@/components/icons";
import { EinlagerungBlock } from "./EinlagerungBlock";

// Das Auftragsfenster (Migration 20, Konzept in docs/auftragsablauf.md).
//
// Es ersetzt das frühere Leistungen-Popover ersatzlos: ein 440 Pixel breites Überblendfenster
// mit waagerechtem Rollbalken war der falsche Ort, um Positionen zu erfassen. Hier ist alles zu
// einem Auftrag an einer Stelle – Kunde, Fahrzeug, Termin, Mitarbeiter, Leistungen, Notiz – und
// vor allem: hier wird gehandelt.
//
// Der wichtigste Unterschied zur alten Tabelle: der Status ist kein Auswahlfeld mehr. Man wählt
// nicht "erledigt", man drückt "Auftrag abschließen" – und daraufhin friert die Datenbank die
// Positionen ein. Welche Übergänge erlaubt sind, entscheidet ein Trigger; diese Komponente zeigt
// nur an, was gerade möglich ist.
export function AuftragModal({
  order, customer, vehicles, employees, assignedEmployeeIds, articles, orderArticles,
  isTechniker, darfWiedereroeffnen, frischAngelegt = false,
  einlagerung, brauchtLagerplatz, storageSlots, warehouses, belegteSlotIds,
  onClose, onSaveFields, onSetVehicle, onUpdateTechnikerNotiz, onSetStatus, onDelete,
  onAddArticle, onUpdateArticleQty, onUpdateArticleDiscount, onRemoveArticle, onNavigate,
  onEinlagern, onEinlagerungEntfernen,
}: {
  order: Order;
  customer: Customer | undefined;
  vehicles: Vehicle[];
  employees: Employee[];
  assignedEmployeeIds: string[];
  articles: Article[];
  orderArticles: OrderArticle[];
  isTechniker: boolean;
  darfWiedereroeffnen: boolean;
  // Der Auftrag wurde gerade eben angelegt und ist noch leer. Dann steht oben ein Hinweis, was
  // jetzt zu tun ist, und unten "Verwerfen" statt des Papierkorbs: einen Auftrag, den man vor
  // einer Sekunde selbst erzeugt hat, löscht man nicht – man nimmt ihn zurück. Deshalb dort
  // auch keine Rückfrage; es kann nichts verloren gehen, was es vorher schon gab.
  frischAngelegt?: boolean;
  // Einlagerung (Migration 22, siehe docs/lager.md): welcher Lagerplatz gehört zu diesem
  // Auftrag, und verlangt eine seiner Leistungen überhaupt einen?
  einlagerung: TireStorage | null;
  brauchtLagerplatz: boolean;
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  belegteSlotIds: Set<string>;
  onClose: () => void;
  onSaveFields: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<void>;
  onSetVehicle: (id: string, vehicleId: string | null) => Promise<void>;
  onUpdateTechnikerNotiz: (id: string, notiz: string) => Promise<void>;
  onSetStatus: (id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddArticle: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateArticleDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemoveArticle: (id: string) => Promise<void>;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  onEinlagern: (lagerplatzId: string) => Promise<void>;
  onEinlagerungEntfernen: (einlagerungId: string) => Promise<void>;
}) {
  const gesperrt = istAbgeschlossen(order.status);

  // ---------------------------------------------------------------- Entwurf
  // Alle Angaben dieses Fensters werden ZUERST hier gesammelt und erst auf „Speichern"
  // geschrieben. Vorher liefen Fahrzeug, Mitarbeiter und Technikernotiz sofort in die
  // Datenbank, während Titel/Datum/Uhrzeit an einem eigenen Knopf weiter unten hingen – man
  // konnte also nicht sagen, was schon gespeichert war und was noch nicht. Ein Fenster, ein
  // Speicherpunkt.
  //
  // Ausgenommen bleiben die Leistungen: jede Position ist eine eigene Zeile mit eigenem Knopf,
  // und die Datenbank friert sie beim Abschluss ein (Migration 20). Sie in denselben Entwurf
  // zu ziehen hieße, Menge und Rabatt im Browser zu halten, bis jemand speichert – mehr Risiko
  // als Gewinn.
  const [titel, setTitel] = useState(order.title);
  const [datum, setDatum] = useState(order.order_date);
  const [zeit, setZeit] = useState(order.time || "");
  const [beschreibung, setBeschreibung] = useState(order.description || "");
  const [fahrzeugId, setFahrzeugId] = useState(order.vehicle_id || "");
  const [mitarbeiterIds, setMitarbeiterIds] = useState<string[]>(assignedEmployeeIds);
  const [notiz, setNotiz] = useState(order.techniker_notiz || "");
  const [speichert, setSpeichert] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [schliessenNachfrage, setSchliessenNachfrage] = useState(false);

  // Der Entwurf wird neu aufgesetzt, wenn ein ANDERER Auftrag ins Fenster kommt – nicht bei
  // jeder Prop-Änderung. Sonst würde das Neuladen nach dem Speichern (oder eine Änderung durch
  // jemand anderen) mitten im Tippen die Eingabe überschreiben.
  const zuletztGezeigt = useRef(order.id);
  useEffect(() => {
    if (zuletztGezeigt.current === order.id) return;
    zuletztGezeigt.current = order.id;
    setTitel(order.title);
    setDatum(order.order_date);
    setZeit(order.time || "");
    setBeschreibung(order.description || "");
    setFahrzeugId(order.vehicle_id || "");
    setMitarbeiterIds(assignedEmployeeIds);
    setNotiz(order.techniker_notiz || "");
    setGespeichert(false);
    setSchliessenNachfrage(false);
  }, [order, assignedEmployeeIds]);

  const gleicheListe = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));

  const geaendert =
    titel !== order.title ||
    datum !== order.order_date ||
    zeit !== (order.time || "") ||
    beschreibung !== (order.description || "") ||
    fahrzeugId !== (order.vehicle_id || "") ||
    notiz !== (order.techniker_notiz || "") ||
    !gleicheListe(mitarbeiterIds, assignedEmployeeIds);
  // Zwei Handlungen brauchen eine Begründung. Statt eines Browser-Dialogs klappt hier ein
  // kleiner Block auf – der Nutzer sieht dabei weiterhin den Auftrag, um den es geht.
  const [stornoOffen, setStornoOffen] = useState(false);
  const [stornoGrund, setStornoGrund] = useState("");
  const [wiederOffen, setWiederOffen] = useState(false);
  const [wiederGrund, setWiederGrund] = useState("");

  const fahrzeug = vehicles.find((v) => v.id === fahrzeugId);
  const feldeAendern = !gesperrt && !isTechniker;

  function fahrzeugText(v: Vehicle): string {
    return [v.license_plate, v.make_model, v.tire_size].filter(Boolean).join(" · ") || "Fahrzeug ohne Angaben";
  }

  // Ein Speichervorgang für das ganze Fenster. Die drei Aufrufe dahinter sind bestehende
  // Schnittstellen; nur Fahrzeug und Notiz werden übersprungen, wenn sie sich nicht geändert
  // haben – jedes überflüssige Schreiben wäre ein Eintrag im Änderungsprotokoll (Migration 18)
  // über etwas, das niemand geändert hat.
  async function speichern() {
    if (speichert) return;
    setSpeichert(true);
    try {
      await onSaveFields(order.id, {
        title: titel,
        description: beschreibung,
        orderDate: datum,
        time: zeit,
        status: order.status,
        assignedEmployeeIds: mitarbeiterIds,
      });
      if (fahrzeugId !== (order.vehicle_id || "")) await onSetVehicle(order.id, fahrzeugId || null);
      if (notiz !== (order.techniker_notiz || "")) await onUpdateTechnikerNotiz(order.id, notiz);
      setGespeichert(true);
    } finally {
      setSpeichert(false);
    }
  }

  // Die Bestätigung verschwindet nach kurzer Zeit von selbst. Der Zeitgeber wird beim
  // Verlassen abgeräumt, sonst schriebe er in eine Komponente, die es nicht mehr gibt.
  useEffect(() => {
    if (!gespeichert) return;
    const uhr = setTimeout(() => setGespeichert(false), 2200);
    return () => clearTimeout(uhr);
  }, [gespeichert]);

  // Schließen mit ungespeicherten Änderungen fragt einmal nach, statt sie stillschweigend zu
  // verwerfen. Bewusst als Zeile im Fenster und nicht als Browser-Dialog: der blockiert die
  // Seite und sieht auf jedem Gerät anders aus.
  function schliessenVersuchen() {
    if (geaendert && !gesperrt) { setSchliessenNachfrage(true); return; }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={schliessenVersuchen}>
      <div className="modal-box auftrag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auftrag-kopf">
          <div>
            <h3 style={{ margin: 0 }}>{frischAngelegt ? "Neuer Auftrag" : "Auftrag"} {order.order_number}</h3>
            <span className={`badge ${ORDER_STATUS_FARBE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
          </div>
          {/* Speichern steht oben und nicht unten im Fuß: der Fuß trägt die Zustandswechsel
              („Abschließen", „Stornieren"), und ein Speichern-Knopf daneben lädt dazu ein,
              versehentlich den Auftrag abzuschließen, wenn man nur die Uhrzeit ändern wollte.
              Der Knopf erscheint erst, wenn es etwas zu speichern gibt – ein dauerhaft
              sichtbarer, meist wirkungsloser Knopf sagt nichts über den Zustand aus. */}
          <div className="auftrag-kopf-aktionen">
            {gespeichert && !geaendert && (
              <span className="gespeichert-haken" role="status">✓ Gespeichert</span>
            )}
            {geaendert && !gesperrt && (
              <button type="button" className="btn-primary" onClick={speichern} disabled={speichert}>
                {speichert ? "Speichert …" : "Speichern"}
              </button>
            )}
            <button type="button" className="btn-secondary auftrag-schliessen" onClick={schliessenVersuchen} aria-label="Schließen">×</button>
          </div>
        </div>

        {schliessenNachfrage && (
          <div className="auftrag-nachfrage">
            <span>Es gibt ungespeicherte Änderungen.</span>
            <div className="auftrag-nachfrage-knoepfe">
              <button type="button" className="btn-secondary" onClick={() => setSchliessenNachfrage(false)}>Zurück</button>
              <button type="button" className="btn-secondary" style={{ color: "#b33" }} onClick={onClose}>Verwerfen</button>
              <button type="button" className="btn-primary" disabled={speichert} onClick={async () => { await speichern(); onClose(); }}>
                Speichern und schließen
              </button>
            </div>
          </div>
        )}

        <div className="auftrag-inhalt">
          {frischAngelegt && (
            <div className="auftrag-hinweis">
              Angelegt mit heutigem Datum und dem Titel &bdquo;{order.title}&ldquo;. Termin,
              Fahrzeug, Mitarbeiter und Leistungen jetzt hier eintragen – zum Schluss oben auf
              &bdquo;Speichern&ldquo;.
            </div>
          )}
          {/* ---------------------------------------------------------------- Kunde */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Kunde</div>
            {customer ? (
              <div className="auftrag-kunde">
                <div>
                  <b>{customer.name}</b>
                  {customer.address.trim() && <div className="small">{customer.address}</div>}
                </div>
                {customer.address.trim() && (
                  <button className="call-icon-btn small nav-icon-btn" title="Navigation starten" onClick={(e) => onNavigate(e, customer)}>
                    <IconNavPin />
                  </button>
                )}
              </div>
            ) : (
              <div className="small">Kunde nicht gefunden.</div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Fahrzeug */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Fahrzeug</div>
            {vehicles.length === 0 ? (
              <div className="small">Für diesen Kunden ist kein Fahrzeug hinterlegt (Kundendetail → Fahrzeuge).</div>
            ) : gesperrt || isTechniker ? (
              <div>{fahrzeug ? fahrzeugText(fahrzeug) : "– kein Fahrzeug zugeordnet –"}</div>
            ) : (
              <select value={fahrzeugId} onChange={(e) => setFahrzeugId(e.target.value)}>
                <option value="">– kein Fahrzeug zugeordnet –</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{fahrzeugText(v)}</option>)}
              </select>
            )}
            {fahrzeug && (fahrzeug.tire_dot_date || fahrzeug.tire_profile_mm != null) && (
              <div className="small" style={{ marginTop: 4 }}>
                {fahrzeug.tire_dot_date ? `DOT ${fahrzeug.tire_dot_date}` : ""}
                {fahrzeug.tire_dot_date && fahrzeug.tire_profile_mm != null ? " · " : ""}
                {fahrzeug.tire_profile_mm != null ? `Profil ${fahrzeug.tire_profile_mm} mm` : ""}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Auftragsdaten */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Auftrag</div>
            {feldeAendern ? (
              <>
                <div className="field"><label>Titel</label>
                  <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)} />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}><label>Datum</label>
                    <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}><label>Uhrzeit (optional)</label>
                    <input type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} />
                  </div>
                </div>
                <div className="field"><label>Beschreibung</label>
                  <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div><b>{order.title}</b></div>
                <div className="small">{formatOrderDateTime(order)}</div>
                {order.description && <div style={{ marginTop: 4 }}>{order.description}</div>}
              </>
            )}
          </div>

          {/* ---------------------------------------------------------------- Mitarbeiter */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Mitarbeiter</div>
            {gesperrt || isTechniker ? (
              <div>{employees.filter((e) => mitarbeiterIds.includes(e.id)).map((e) => e.name).join(", ") || "– niemand zugeordnet –"}</div>
            ) : (
              <EmployeeCheckboxList
                employees={employees}
                value={mitarbeiterIds}
                onChange={setMitarbeiterIds}
              />
            )}
          </div>

          {/* ---------------------------------------------------------------- Leistungen */}
          <div className="auftrag-block">
            <ArticleAssignPanel
              orderId={order.id}
              articles={articles}
              rows={orderArticles}
              gesperrt={gesperrt || isTechniker}
              onAdd={onAddArticle}
              onUpdateQty={onUpdateArticleQty}
              onUpdateDiscount={onUpdateArticleDiscount}
              onRemove={onRemoveArticle}
            />
          </div>

          {/* ---------------------------------------------------------------- Einlagerung */}
          {/* Steht direkt hinter den Leistungen, weil die Pflicht von genau dort kommt: erst
              wenn eine Leistung mit dem Kennzeichen im Auftrag steht, wird ein Lagerplatz
              verlangt. Der Block wird auch ohne Pflicht gezeigt, solange eine Einlagerung
              vorhanden ist – sonst verschwände sie beim Entfernen der Leistung aus dem Blick,
              obwohl die Reifen weiter im Regal liegen. */}
          {(brauchtLagerplatz || einlagerung) && (
            <EinlagerungBlock
              pflicht={brauchtLagerplatz}
              einlagerung={einlagerung}
              slots={storageSlots}
              warehouses={warehouses}
              belegteSlotIds={belegteSlotIds}
              gesperrt={gesperrt}
              onEinlagern={onEinlagern}
              onEntfernen={onEinlagerungEntfernen}
            />
          )}

          {/* ---------------------------------------------------------------- Notiz */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Notiz des Technikers</div>
            <textarea
              value={notiz}
              placeholder="Was vor Ort aufgefallen ist …"
              onChange={(e) => setNotiz(e.target.value)}
            />
          </div>

          {/* ---------------------------------------------------------------- Abschluss-Auskunft */}
          {order.status === "erledigt" && order.completed_at && (
            <div className="auftrag-hinweis">Abgeschlossen am {formatDate(order.completed_at.slice(0, 10))}.</div>
          )}
          {order.status === "storniert" && (
            <div className="auftrag-hinweis">
              Storniert{order.cancelled_at ? ` am ${formatDate(order.cancelled_at.slice(0, 10))}` : ""}
              {order.cancel_reason ? ` – ${order.cancel_reason}` : ""}.
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- Handlungen */}
        <div className="auftrag-fuss">
          {stornoOffen ? (
            <div className="auftrag-grund">
              <div className="field"><label>Warum wird der Auftrag storniert?</label>
                <input type="text" value={stornoGrund} onChange={(e) => setStornoGrund(e.target.value)} autoFocus />
              </div>
              <div className="auftrag-grund-knoepfe">
                <button type="button" className="btn-secondary" onClick={() => { setStornoOffen(false); setStornoGrund(""); }}>Abbrechen</button>
                <button
                  type="button" className="btn-red"
                  disabled={!stornoGrund.trim()}
                  onClick={async () => { await onSetStatus(order.id, "storniert", { stornoGrund: stornoGrund.trim() }); setStornoOffen(false); }}
                >
                  Stornierung bestätigen
                </button>
              </div>
            </div>
          ) : wiederOffen ? (
            <div className="auftrag-grund">
              <div className="field"><label>Warum wird der Auftrag wiedereröffnet?</label>
                <input type="text" value={wiederGrund} onChange={(e) => setWiederGrund(e.target.value)} autoFocus />
              </div>
              <div className="auftrag-grund-knoepfe">
                <button type="button" className="btn-secondary" onClick={() => { setWiederOffen(false); setWiederGrund(""); }}>Abbrechen</button>
                <button
                  type="button" className="btn-primary"
                  disabled={!wiederGrund.trim()}
                  onClick={async () => { await onSetStatus(order.id, "in_arbeit", { wiedereroeffnungsGrund: wiederGrund.trim() }); setWiederOffen(false); }}
                >
                  Wiedereröffnen
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="auftrag-fuss-links">
                {!gesperrt && !isTechniker && (
                  <button type="button" className="btn-secondary" onClick={() => setStornoOffen(true)}>Stornieren</button>
                )}
                {!isTechniker && (
                  frischAngelegt ? (
                    <button
                      type="button" className="btn-secondary" style={{ color: "#b33" }}
                      onClick={() => { onDelete(order.id); onClose(); }}
                    >
                      Verwerfen
                    </button>
                  ) : (
                    <button
                      type="button" className="btn-secondary" style={{ color: "#b33" }}
                      onClick={() => { if (confirm(`Auftrag ${order.order_number} wirklich löschen?`)) { onDelete(order.id); onClose(); } }}
                    >
                      <IconTrash />
                    </button>
                  )
                )}
              </div>
              <div className="auftrag-fuss-rechts">
                {order.status === "offen" && (
                  <button type="button" className="btn-secondary" onClick={() => onSetStatus(order.id, "in_arbeit")}>Arbeit beginnen</button>
                )}
                {!gesperrt && (
                  <button type="button" className="btn-green" onClick={() => onSetStatus(order.id, "erledigt")}>Auftrag abschließen</button>
                )}
                {gesperrt && darfWiedereroeffnen && (
                  <button type="button" className="btn-secondary" onClick={() => setWiederOffen(true)}>Wiedereröffnen</button>
                )}
                {gesperrt && !darfWiedereroeffnen && (
                  <span className="small">Zum Wiedereröffnen wird Admin-Recht benötigt.</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Article, ArticlePrice, AuftragFahrzeug, Customer, EingelagertesRad, Employee, Erfassungsart, Firmenfahrzeug, Order, OrderArticle, OrderStatus, RadPosition, Saison, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import type { RadFelder } from "@/lib/api/lager";
import { formatDate, formatOrderDateTime, getPhoneNumbers, handlungsgruende, lagermonate, todayStr } from "@/lib/helpers";
import { hhmmAus, minutenAus } from "@/lib/calendar";
import {
  DOT_ALT_JAHRE, LAGERDAUER_HINWEIS_TAGE, ORDER_STATUS_FARBE, ORDER_STATUS_LABEL,
  PROFIL_KRITISCH_MM, SAISON_LABEL, STANDARD_DAUER_MIN, istAbgeschlossen,
} from "@/lib/constants";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { ArticleAssignPanel } from "./ArticleAssignPanel";
import { IconNavPin, IconTrash } from "@/components/icons";
import { EinlagerungBlock } from "./EinlagerungBlock";
import { RechnungsdatenBlock } from "./RechnungsdatenBlock";
import { AuftragProtokoll } from "./AuftragProtokoll";

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
  order, customer, vehicles, firmenfahrzeuge, employees, assignedEmployeeIds, articles, articlePrices, orderArticles,
  isTechniker, darfWiedereroeffnen, frischAngelegt = false,
  einlagerung, hatLagergebuehr, storageSlots, warehouses, belegteSlotIds, raeder,
  fremdeSaetze, onAuslagern,
  terminIntervallMin, letzterSatz, letzterSatzRaeder,
  onClose, onSaveFields, onSetVehicle, onSetFirmenfahrzeug, onUpdateTechnikerNotiz, onSetStatus, onDelete, onRechnungErstellt, auftragFahrzeuge,
  onEmailSpeichern, onFahrzeugHinzufuegen, onRechnungsFahrzeugAnlegen, onKilometerstand, onFahrzeugEntfernen,
  onAddArticle, onUpdateArticleQty, onUpdateArticleEndpreis, onRemoveArticle, onNavigate, onCall,
  onEinlagern, onEinlagerungEntfernen, onEinlagerungAngaben,
  onErfassungsart, onAnzahlRaeder, onRadSpeichern, onRadEntfernen, onFahrzeugAnlegen,
}: {
  order: Order;
  customer: Customer | undefined;
  vehicles: Vehicle[];
  // Die eigenen Transporter (Migration 32). Ausgemusterte sind mit dabei, damit ein alter
  // Auftrag seinen Wagen weiterhin beim Namen nennen kann – zur Auswahl stehen unten nur die
  // aktiven.
  firmenfahrzeuge: Firmenfahrzeug[];
  employees: Employee[];
  assignedEmployeeIds: string[];
  articles: Article[];
  // Nur zum Anzeigen des gültigen Listenpreises im Zuordnen-Bereich.
  articlePrices: ArticlePrice[];
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
  // Das Terminraster aus den Betriebseinstellungen (Migration 38). Bestimmt, welches Ende
  // beim Eintragen einer Anfangszeit vorgeschlagen wird.
  terminIntervallMin: number;
  // Die Vorgeschichte dieses Fahrzeugs: der letzte eingelagerte Satz samt Rädern, für den
  // Hinweis „beim letzten Wechsel …" (D2/D3). Null heißt: kein verlässlicher Vorgänger –
  // dann steht hier nichts, statt etwas über ein anderes Auto zu behaupten.
  letzterSatz: TireStorage | null;
  letzterSatzRaeder: EingelagertesRad[];
  // Steht auf diesem Auftrag eine Lagergebühr (Migration 46)? Das heißt: Hier wird
  // AUSGELAGERT und abgerechnet – nicht, dass ein Platz zu belegen wäre.
  hatLagergebuehr: boolean;
  // Was für DIESEN Kunden sonst noch im Regal liegt – Sätze aus früheren Aufträgen. Genau die
  // holt der Techniker beim Saisonwechsel heraus, und genau die waren bisher aus dem
  // Auftragsfenster heraus nicht erreichbar: Der Block oben zeigt nur, was an diesem Auftrag
  // hängt. Wer auslagern wollte, musste das Fenster verlassen und die Regalwand durchsuchen.
  fremdeSaetze: TireStorage[];
  onAuslagern: (satzId: string) => void;
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  belegteSlotIds: Set<string>;
  onClose: () => void;
  onSaveFields: (id: string, fields: { title: string; description: string; orderDate: string; time: string; endTime?: string; rechnungNoetig?: boolean; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<void>;
  // Hakt „Rechnung erstellt" ab oder nimmt es zurück (Migration 40). Optional: Wer das Fenster
  // ohne diese Zusage einbindet, bekommt den Block gar nicht erst zu sehen.
  onRechnungErstellt?: (id: string, nummer: string | null, erstellt: boolean) => Promise<void>;
  // Fahrzeuge an diesem Auftrag samt Kilometerstand (Migration 44). Ohne diese Angaben lässt
  // die Datenbank einen Auftrag mit „Rechnung benötigt" nicht abschließen.
  auftragFahrzeuge: AuftragFahrzeug[];
  onEmailSpeichern: (kundeId: string, email: string) => Promise<void>;
  onFahrzeugHinzufuegen: (orderId: string, vehicleId: string) => Promise<void>;
  // Heißt nicht `onFahrzeugAnlegen`: Den Namen gibt es schon für das Anlegen aus dem
  // Einlagerungsblock heraus, mit anderer Bedeutung und anderen Argumenten.
  onRechnungsFahrzeugAnlegen: (orderId: string, kundeId: string, kennzeichen: string) => Promise<void>;
  onKilometerstand: (id: string, km: number | null) => Promise<void>;
  onFahrzeugEntfernen: (id: string) => Promise<void>;
  onSetVehicle: (id: string, vehicleId: string | null) => Promise<void>;
  onSetFirmenfahrzeug: (id: string, firmenfahrzeugId: string | null) => Promise<void>;
  onUpdateTechnikerNotiz: (id: string, notiz: string) => Promise<void>;
  onSetStatus: (id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddArticle: (orderId: string, articleId: string, quantity: number, endpreisNetto: number | null) => Promise<void>;
  onUpdateArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateArticleEndpreis: (id: string, endpreisNetto: number | null) => Promise<void>;
  onRemoveArticle: (id: string) => Promise<void>;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  // Anrufen direkt aus dem Auftragsfenster. Es ist der Bildschirm, auf dem eine angetippte
  // Terminerinnerung landet – wer dort steht, will genau zwei Dinge: hinfahren oder anrufen.
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  onEinlagern: (lagerplatzId: string) => Promise<void>;
  onEinlagerungEntfernen: (einlagerungId: string) => Promise<void>;
  // Fahrzeug und Saison am eingelagerten Satz (Migration 30). Getrennt vom Zuordnen des
  // Lagerplatzes: das eine ist eine Bewegung im Regal, das andere eine Beschreibung.
  onEinlagerungAngaben: (einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) => Promise<void>;
  // Die einzeln erfassten Räder dieses Satzes und ihre Pflege (Migration 33).
  raeder: EingelagertesRad[];
  onErfassungsart: (einlagerungId: string, art: Erfassungsart) => Promise<void>;
  onAnzahlRaeder: (einlagerungId: string, anzahl: number) => Promise<void>;
  onRadSpeichern: (einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onRadEntfernen: (radId: string) => Promise<void>;
  // Legt ein Fahrzeug für den Kunden dieses Auftrags an und ordnet es dem eingelagerten Satz
  // gleich zu – aus dem Auftrag heraus, ohne Umweg über das Kundenfenster.
  onFahrzeugAnlegen: (kennzeichen: string, modell: string) => Promise<void>;
}) {
  const gesperrt = istAbgeschlossen(order.status);

  // Die Vorschau auf die Regeln, die beim Abschließen greifen (Migration 22 und 30). Sie steht
  // hier oben und nicht im Fuß, weil sie dieselben Daten liest wie die Blöcke darüber – und
  // damit es EINE Aufzählung gibt statt zweier, die auseinanderlaufen können.
  //
  // Der 11.09.2026 hat gezeigt, warum das nötig ist: Ohne Fahrzeug und Saison lehnte die
  // Datenbank den Abschluss ab, die Meldung lag aber hinter dem Auftragsfenster – am Handy
  // also unsichtbar. Von außen sah es aus, als täte der Knopf nichts.
  //
  // Die Lagerplatz-Pflicht steht hier seit Migration 46 NICHT mehr: Ein Artikel verlangt
  // keinen Platz mehr, weil der Gebührenartikel inzwischen auf dem AUSLAGERUNGS-Auftrag steht,
  // wo gerade ein Platz frei wird. An die Stelle des Zwangs tritt die Frage weiter unten.
  const abschlussFehlt: string[] = [];
  if (einlagerung && !einlagerung.vehicle_id) abschlussFehlt.push("Fahrzeug");
  if (einlagerung && !einlagerung.saison) abschlussFehlt.push("Saison");

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
  const [zeitBis, setZeitBis] = useState(order.end_time || "");
  // „Rechnung benötigt" (Migration 38). Entscheidet, ob auf den Nettobetrag die Steuer kommt.
  const [rechnungNoetig, setRechnungNoetig] = useState(order.rechnung_noetig);
  // Die getippte Rechnungsnummer. Sie geht NICHT über den Speichern-Knopf, sondern über einen
  // eigenen Aufruf – „Rechnung erstellt" ist eine Handlung mit Zeitstempel, kein Formularfeld.
  // Deshalb steht sie auch nicht in der Änderungserkennung weiter unten.
  const [rechnungNummer, setRechnungNummer] = useState("");
  // Wurde das Ende von der Anwendung vorgeschlagen oder von Hand gesetzt? Nur ein
  // vorgeschlagenes darf beim Ändern der Anfangszeit mitwandern – ein von Hand eingetragenes
  // zu überschreiben wäre genau die Art von Hilfsbereitschaft, die Arbeit vernichtet.
  const [endeVorgeschlagen, setEndeVorgeschlagen] = useState(!order.end_time);

  function anfangAendern(neu: string) {
    setZeit(neu);
    const start = minutenAus(neu);
    if (endeVorgeschlagen && start != null) setZeitBis(hhmmAus(start + terminIntervallMin));
  }
  function endeAendern(neu: string) {
    setZeitBis(neu);
    setEndeVorgeschlagen(false);
  }

  // Was beim letzten Mal an diesem Fahrzeug auffiel (D2/D3). Dieselbe Regel wie der orange
  // Punkt an der Regalwand – eine zweite Regel für dieselbe Frage wären zwei Wahrheiten.
  const vorgeschichte = letzterSatz
    ? handlungsgruende(letzterSatz, letzterSatzRaeder, {
        kritischMm: PROFIL_KRITISCH_MM, dotJahre: DOT_ALT_JAHRE, liegtTage: LAGERDAUER_HINWEIS_TAGE,
      })
    : [];
  const [beschreibung, setBeschreibung] = useState(order.description || "");
  const [fahrzeugId, setFahrzeugId] = useState(order.vehicle_id || "");
  const [firmenfahrzeugId, setFirmenfahrzeugId] = useState(order.firmenfahrzeug_id || "");
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
    setFirmenfahrzeugId(order.firmenfahrzeug_id || "");
    setMitarbeiterIds(assignedEmployeeIds);
    setNotiz(order.techniker_notiz || "");
    setGespeichert(false);
    setSchliessenNachfrage(false);
  }, [order, assignedEmployeeIds]);

  const gleicheListe = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));

  // WICHTIG: Jedes Feld, das man in diesem Fenster ändern kann, MUSS hier stehen. Der
  // Speichern-Knopf erscheint nur, wenn `geaendert` wahr ist – ein Feld, das hier fehlt,
  // lässt sich zwar ändern, aber nicht speichern, und zwar ohne jede Fehlermeldung.
  //
  // Genau das ist am 16.09.2026 passiert: „Bis" und „Rechnung benötigt" kamen mit den
  // Migrationen 37 und 38 dazu, und beide fehlten hier. Wer die Endzeit korrigierte, bekam
  // keinen Knopf zu sehen und hielt die Anwendung für kaputt.
  const geaendert =
    titel !== order.title ||
    datum !== order.order_date ||
    zeit !== (order.time || "") ||
    zeitBis !== (order.end_time || "") ||
    rechnungNoetig !== order.rechnung_noetig ||
    beschreibung !== (order.description || "") ||
    fahrzeugId !== (order.vehicle_id || "") ||
    firmenfahrzeugId !== (order.firmenfahrzeug_id || "") ||
    notiz !== (order.techniker_notiz || "") ||
    !gleicheListe(mitarbeiterIds, assignedEmployeeIds);
  // Zwei Handlungen brauchen eine Begründung. Statt eines Browser-Dialogs klappt hier ein
  // kleiner Block auf – der Nutzer sieht dabei weiterhin den Auftrag, um den es geht.
  const [stornoOffen, setStornoOffen] = useState(false);
  const [stornoGrund, setStornoGrund] = useState("");
  const [wiederOffen, setWiederOffen] = useState(false);
  const [wiederGrund, setWiederGrund] = useState("");

  // Ist der Einlagerungsblock aufgeklappt? Seit Migration 46 hängt er an keinem Artikel mehr,
  // sondern an diesem Knopf – wer nichts einlagert, sieht ihn gar nicht. Liegt schon etwas im
  // Regal, steht er ohnehin offen; dann zählt dieser Schalter nicht mit.
  const [einlagerungOffen, setEinlagerungOffen] = useState(false);
  // Die Rückfrage beim Abschließen (siehe unten). Ersetzt den Zwang aus Migration 22.
  const [altreifenFrage, setAltreifenFrage] = useState(false);
  // Einmal gefragt, nicht wieder. Wer „Nein – einlagern" wählt und es sich dann doch anders
  // überlegt, soll nicht bei jedem Anlauf dieselbe Frage wegklicken müssen – aus einer
  // Erinnerung würde sonst genau die Hürde, die hier abgeschafft wurde.
  const [altreifenGefragt, setAltreifenGefragt] = useState(false);

  // Steht auf diesem Auftrag eine Leistung, bei der Altreifen anfallen (Migration 46)? Das
  // Kennzeichen sitzt am Artikel und nicht an einem Namen im Code: „alles, was ‚wechsel‘
  // heißt" wäre beim ersten Umbenennen still kaputt – und genau so ist Migration 22 damals
  // an ihre Artikel gekommen.
  const fragtAltreifen = orderArticles.some(
    (pos) => articles.find((a) => a.id === pos.article_id)?.fragt_einlagerung
  );
  // Gefragt wird nur, wenn die Frage offen IST: kein Satz im Regal aus diesem Auftrag, und
  // niemand hat den Block schon von Hand aufgeklappt.
  const altreifenOffen = fragtAltreifen && !einlagerung && !gesperrt && !altreifenGefragt;

  const fahrzeug = vehicles.find((v) => v.id === fahrzeugId);
  const aktiveFirmenfahrzeuge = firmenfahrzeuge.filter((f) => f.aktiv);

  // Wer bekommt fünf Minuten vor diesem Termin eine Erinnerung? Die Kette ist: zugeordneter
  // Mitarbeiter → verknüpftes Benutzerkonto → angemeldetes Gerät. Die ersten zwei Glieder
  // sind hier sichtbar, das dritte nicht – deshalb nennt der Hinweis nur, was hier fehlt, und
  // behauptet nichts über den Rest.
  const zugeordnete = employees.filter((e) => mitarbeiterIds.includes(e.id));
  const mitKonto = zugeordnete.filter((e) => e.profile_id);
  const erinnerungsHinweis =
    zugeordnete.length === 0
      ? "Kein Mitarbeiter zugeordnet – für diesen Termin bekommt niemand eine Erinnerung."
      : mitKonto.length === 0
        ? `${zugeordnete.length === 1 ? "Der zugeordnete Mitarbeiter hat" : "Die zugeordneten Mitarbeiter haben"} kein Benutzerkonto (Admin → Mitarbeiter) – ohne Konto gibt es keine Erinnerung.`
        : null;
  function firmenfahrzeugLabel(f: Firmenfahrzeug): string {
    return [f.kennzeichen, f.bezeichnung].filter(Boolean).join(" · ");
  }
  function firmenfahrzeugText(id: string | null): string {
    if (!id) return "";
    const f = firmenfahrzeuge.find((x) => x.id === id);
    return f ? firmenfahrzeugLabel(f) : "Fahrzeug nicht auffindbar";
  }
  // Seit Migration 41 darf auch der Techniker die Auftragsfelder ändern – Titel, Datum,
  // Uhrzeit, Fahrzeug, Transporter, Leistungen. Was er vor Ort sieht, weiß sonst niemand, und
  // der Umweg über einen Anruf ins Büro war keine Sicherheit, sondern eine Warteschlange.
  // Jede Änderung steht mit Person und Zeitpunkt in der Historie unten in diesem Fenster.
  //
  // `gesperrt` bleibt: Ein erledigter oder stornierter Auftrag ist für alle eingefroren.
  const feldeAendern = !gesperrt;

  // Die Uhrzeit ist Pflicht, sobald jemand die Auftragsfelder überhaupt ändern darf.
  //
  // Warum nicht in der Datenbank erzwungen: Der Auftrag entsteht mit einem Klick auf der Karte
  // und ist in dieser Sekunde noch ohne Uhrzeit – eine NOT-NULL-Bedingung würde genau diesen
  // Weg verbauen. Die Regel greift deshalb dort, wo die Angabe hingehört: beim Speichern.
  //
  // Warum an `feldeAendern` gebunden: Ein Techniker darf nur seine Notiz schreiben. Ihn wegen
  // einer fehlenden Uhrzeit auszusperren, die er gar nicht setzen darf, wäre eine Sackgasse.
  const zeitFehlt = feldeAendern && !zeit.trim();
  // Ein Ende VOR dem Anfang lehnt die Datenbank ab (Migration 37). Der Hinweis steht hier,
  // damit das nicht erst beim Speichern als Fehlermeldung auffällt – und der Knopf bleibt
  // gesperrt, weil dieser eine Fall im Browser sicher erkennbar ist. (Anders als beim
  // Abschließen eines Auftrags: dort kennt die Datenbank Bedingungen, die der Browser nicht
  // kennt, und ein gesperrter Knopf würde behaupten, sie alle zu kennen.)
  const endeVorAnfang = !!zeit.trim() && !!zeitBis.trim() && zeitBis <= zeit;

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
        endTime: zeitBis,
        rechnungNoetig,
        status: order.status,
        assignedEmployeeIds: mitarbeiterIds,
      });
      if (fahrzeugId !== (order.vehicle_id || "")) await onSetVehicle(order.id, fahrzeugId || null);
      if (firmenfahrzeugId !== (order.firmenfahrzeug_id || "")) await onSetFirmenfahrzeug(order.id, firmenfahrzeugId || null);
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
    // „modal-auftrag" hebt dieses Fenster über das Kundenfenster: Aus dem Kundenfenster
    // heraus lässt sich ein Auftrag öffnen, und dann liegen beide gleichzeitig offen.
    // Verlässt man sich dabei auf die Reihenfolge im Quelltext, kippt die Anzeige beim
    // nächsten Umsortieren lautlos – die Ebene gehört deshalb ins Stilblatt.
    <div className="modal-overlay modal-auftrag" onClick={schliessenVersuchen}>
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
              <button
                type="button"
                className="btn-primary"
                onClick={speichern}
                disabled={speichert || zeitFehlt || endeVorAnfang}
                title={zeitFehlt ? "Bitte zuerst eine Uhrzeit eintragen." : endeVorAnfang ? "Das Ende muss nach dem Anfang liegen." : undefined}
              >
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
              <button type="button" className="btn-primary" disabled={speichert || zeitFehlt || endeVorAnfang} onClick={async () => { await speichern(); onClose(); }}>
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
                <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                  {customer.address.trim() && (
                    <button className="call-icon-btn small nav-icon-btn" title="Navigation starten" onClick={(e) => onNavigate(e, customer)}>
                      <IconNavPin />
                    </button>
                  )}
                  {getPhoneNumbers(customer).length > 0 && (
                    <button className="call-icon-btn small" title="Anrufen" onClick={(e) => onCall(e, customer)}>📞</button>
                  )}
                </div>
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
            ) : gesperrt ? (
              <div>{fahrzeug ? fahrzeugText(fahrzeug) : "– kein Fahrzeug zugeordnet –"}</div>
            ) : (
              <select value={fahrzeugId} onChange={(e) => setFahrzeugId(e.target.value)}>
                <option value="">– kein Fahrzeug zugeordnet –</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{fahrzeugText(v)}</option>)}
              </select>
            )}
          </div>

          {/* ---------------------------------------------------------------- Unser Fahrzeug */}
          {/* Getrennt vom Block darüber, obwohl beides „Fahrzeug" heißt: Das eine ist das Auto
              des Kunden (was wird gemacht), das andere unser Transporter (wer fährt hin, und
              was ist geladen). Sie in einen Block zu legen wäre genau die Vermischung, wegen
              der es zwei Tabellen gibt. Techniker sehen die Einteilung, ändern dürfen sie sie
              nicht – das macht das Büro, und die Datenbank erzwingt es (Migration 32). */}
          <div className="auftrag-block">
            <div className="auftrag-block-titel">Unser Fahrzeug</div>
            {gesperrt ? (
              <div>{firmenfahrzeugText(order.firmenfahrzeug_id) || "– nicht eingeteilt –"}</div>
            ) : aktiveFirmenfahrzeuge.length === 0 && !firmenfahrzeugId ? (
              <div className="small">
                Es sind noch keine Firmenfahrzeuge angelegt (Admin &rarr; Firmenfahrzeuge).
              </div>
            ) : (
              <select value={firmenfahrzeugId} onChange={(e) => setFirmenfahrzeugId(e.target.value)}>
                <option value="">– nicht eingeteilt –</option>
                {aktiveFirmenfahrzeuge.map((f) => (
                  <option key={f.id} value={f.id}>{firmenfahrzeugLabel(f)}</option>
                ))}
                {/* Ein inzwischen ausgemustertes Fahrzeug bleibt wählbar, solange es an
                    diesem Auftrag hängt – sonst verschwände die Angabe beim nächsten
                    Speichern stillschweigend. */}
                {firmenfahrzeugId && !aktiveFirmenfahrzeuge.some((f) => f.id === firmenfahrzeugId) && (
                  <option value={firmenfahrzeugId}>{firmenfahrzeugText(firmenfahrzeugId)} (ausgemustert)</option>
                )}
              </select>
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
                  {/* Kein `style={{flex:1}}` mehr: Ein Flex-Wert am Element schlägt jede
                      Regel im Stilblatt – auch die Handy-Regel, die diese beiden Felder
                      umbrechen lässt, wenn sie nebeneinander nicht mehr passen. Dieselbe
                      Lehre wie bei der Schriftgröße und beim Modul-Layout: Layoutwerte
                      gehören ins Stilblatt. `.row > *` setzt flex:1 ohnehin. */}
                  <div className="field"><label>Datum</label>
                    <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
                  </div>
                  {/* Von–bis statt einer einzelnen Uhrzeit (Migration 37). Zwei Uhrzeiten
                      und keine Dauer, weil ein Mensch „von acht bis halb zehn" sagt und
                      nicht „um acht für neunzig Minuten" – und weil der Kalender die Höhe
                      eines Blocks direkt daraus rechnet. */}
                  <div className="field">
                    <label>Von</label>
                    <input
                      type="time"
                      value={zeit}
                      onChange={(e) => anfangAendern(e.target.value)}
                      aria-invalid={zeitFehlt}
                      className={zeitFehlt ? "feld-fehlt" : undefined}
                    />
                  </div>
                  <div className="field">
                    <label>Bis (optional)</label>
                    <input
                      type="time"
                      value={zeitBis}
                      onChange={(e) => endeAendern(e.target.value)}
                      aria-invalid={endeVorAnfang}
                      className={endeVorAnfang ? "feld-fehlt" : undefined}
                    />
                  </div>
                </div>
                {endeVorAnfang && (
                  <div className="hinweis-pflicht">
                    Das Ende liegt vor dem Anfang. Termine über Mitternacht kennt der Kalender
                    nicht – so ein Auftrag gehört auf zwei Tage aufgeteilt.
                  </div>
                )}
                {!zeitBis.trim() && !!zeit.trim() && (
                  <div className="small" style={{ color: "var(--muted)" }}>
                    Ohne Ende rechnet der Kalender mit {terminIntervallMin || STANDARD_DAUER_MIN} Minuten
                    und zeichnet die Unterkante gestrichelt.
                  </div>
                )}
                {zeitFehlt && (
                  <div className="hinweis-pflicht">
                    Ohne Uhrzeit lässt sich der Auftrag nicht speichern. Wird sie jetzt nicht
                    festgehalten, muss der Kunde später noch einmal angerufen werden.
                  </div>
                )}
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
            {/* Die Einteilung bleibt beim Büro – `order_employees` lässt einen Techniker per
                RLS weiterhin nur lesen (Migration 15, von 41 nicht angefasst). Wer sich selbst
                Aufträge zuteilen kann, teilt sich auch fremde zu. */}
            {gesperrt || isTechniker ? (
              <div>{employees.filter((e) => mitarbeiterIds.includes(e.id)).map((e) => e.name).join(", ") || "– niemand zugeordnet –"}</div>
            ) : (
              <EmployeeCheckboxList
                employees={employees}
                value={mitarbeiterIds}
                onChange={setMitarbeiterIds}
              />
            )}

            {/* Hinweis zur Terminerinnerung (docs/benachrichtigungen-plan.md).
                Sie geht an die zugeordneten Mitarbeiter – und nur an die, deren Name mit einem
                Benutzerkonto verknüpft ist. Beides ist beim Anlegen leicht zu übersehen, und
                das Ausbleiben einer Erinnerung merkt man erst, wenn sie fehlt. Deshalb steht
                die Lücke hier, im Moment des Einteilens. */}
            {zeit.trim() && erinnerungsHinweis && (
              <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>
                {erinnerungsHinweis}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Leistungen */}
          <div className="auftrag-block">
            {/* D2/D3: Was beim letzten Mal an diesem Fahrzeug auffiel. Der Hinweis steht
                ÜBER den Leistungen, weil genau hier die Entscheidung fällt, ob man Neureifen
                anbietet – darunter wäre er die Antwort auf eine Frage, die niemand mehr
                stellt. */}
            {vorgeschichte.length > 0 && (
              <div className="vorgeschichte">
                <b>Beim letzten Mal an diesem Fahrzeug:</b>
                <ul>
                  {vorgeschichte.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}

            <ArticleAssignPanel
              rechnungNoetig={rechnungNoetig}
              orderId={order.id}
              articles={articles}
              articlePrices={articlePrices}
              rows={orderArticles}
              gesperrt={gesperrt}
              onAdd={onAddArticle}
              onUpdateQty={onUpdateArticleQty}
              onUpdateEndpreis={onUpdateArticleEndpreis}
              onRemove={onRemoveArticle}
            />

            {/* „Rechnung benötigt" (Migration 38) – unter den Leistungen, weil er die Summe
                darüber verändert und man die Wirkung sofort sieht.

                Ein Kontrollkästchen und kein Auswahlfeld: Es gibt zwei Zustände, und ein
                Häkchen sagt beide gleichzeitig. Der Satz daneben nennt die Wirkung, nicht die
                Einstellung – „mit Steuer" ist die Auskunft, „Schalter aktiv" wäre keine. */}
            <label className={"rechnung-schalter" + (gesperrt ? " gesperrt" : "")}>
              <input
                type="checkbox"
                checked={rechnungNoetig}
                disabled={gesperrt}
                onChange={(e) => setRechnungNoetig(e.target.checked)}
              />
              <span>
                <b>Rechnung benötigt</b>
                <span className="small">
                  {rechnungNoetig
                    ? "Auf den Nettobetrag kommt die Umsatzsteuer."
                    : "Es gilt der Nettobetrag, ohne Steuer."}
                </span>
              </span>
            </label>

            {/* Sobald „Rechnung benötigt" gesetzt ist: was dafür noch fehlt (Migration 44).
                Die Liste sperrt nichts – man darf den Haken setzen und später ergänzen.
                Verlangt werden die Angaben erst beim Abschließen, und dort von der Datenbank. */}
            {rechnungNoetig && (
              <RechnungsdatenBlock
                kunde={customer ?? null}
                gesperrt={gesperrt}
                darfKundeAendern={!isTechniker}
                fahrzeuge={auftragFahrzeuge
                  .filter((af) => af.order_id === order.id)
                  .map((af) => ({ ...af, fahrzeug: vehicles.find((v) => v.id === af.vehicle_id) ?? null }))}
                alleFahrzeuge={vehicles}
                onEmailSpeichern={(email) => onEmailSpeichern(order.customer_id, email)}
                onFahrzeugHinzufuegen={(vid) => onFahrzeugHinzufuegen(order.id, vid)}
                onFahrzeugAnlegen={(kz) => onRechnungsFahrzeugAnlegen(order.id, order.customer_id, kz)}
                onKilometerstand={onKilometerstand}
                onFahrzeugEntfernen={onFahrzeugEntfernen}
              />
            )}

            {/* Der zweite Halbsatz: ob sie auch geschrieben wurde (Migration 40).
                Er erscheint nur, wenn der Schalter an ist und der Auftrag erledigt – vorher
                gibt es nichts abzuhaken, weil noch nicht feststeht, was abgerechnet wird.

                Hier steht die ganze Wahrheit (wer, wann, welche Nummer); in der Auftragsliste
                steht nur der Knopf zum Abarbeiten. Zwei Orte, ein Vorgang – aber die
                Auskunft gehört dorthin, wo man einen einzelnen Auftrag ansieht. */}
            {rechnungNoetig && order.status === "erledigt" && onRechnungErstellt && (
              <div className={"rechnung-stand" + (order.rechnung_erstellt_am ? " erledigt" : "")}>
                {order.rechnung_erstellt_am ? (
                  <>
                    <span>
                      <b>Rechnung erstellt</b>
                      <span className="small">
                        {formatDate(order.rechnung_erstellt_am.slice(0, 10))}
                        {order.rechnung_nummer ? ` · Nr. ${order.rechnung_nummer}` : ""}
                        {/* Wer es war, steht im Protokoll weiter unten in diesem Fenster –
                            hier den Namen ein zweites Mal zu holen hieße, dieselbe Auskunft
                            aus zwei Quellen zu beziehen. */}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => onRechnungErstellt(order.id, null, false)}
                    >
                      doch nicht
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      <b>Rechnung steht noch aus</b>
                      <span className="small">Im ERP schreiben, dann hier abhaken – die Nummer ist freiwillig.</span>
                    </span>
                    <input
                      type="text"
                      className="feld-kompakt"
                      style={{ width: 130, flex: "0 0 auto" }}
                      placeholder="Rechnungsnr."
                      value={rechnungNummer}
                      onChange={(e) => setRechnungNummer(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => onRechnungErstellt(order.id, rechnungNummer.trim() || null, true)}
                    >
                      Rechnung erstellt
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Einlagerung */}
          {/* Steht direkt hinter den Leistungen, weil die Pflicht von genau dort kommt: erst
              wenn eine Leistung mit dem Kennzeichen im Auftrag steht, wird ein Lagerplatz
              verlangt. Der Block wird auch ohne Pflicht gezeigt, solange eine Einlagerung
              vorhanden ist – sonst verschwände sie beim Entfernen der Leistung aus dem Blick,
              obwohl die Reifen weiter im Regal liegen. */}
          {/* Seit Migration 46 ist der Block IMMER erreichbar – vorher erschien er nur, wenn der
              Gebührenartikel auf dem Auftrag stand. Genau daran hing das Problem: Man kam an
              den Lagerplatz nur heran, indem man die Gebühr buchte, die zu diesem Zeitpunkt
              noch gar nicht bezifferbar ist. Wer nichts einlagert, klappt den Block zu und
              sieht ihn nicht weiter. */}
          {(einlagerungOffen || einlagerung) ? (
            <EinlagerungBlock
              pflicht={false}
              einlagerung={einlagerung}
              slots={storageSlots}
              warehouses={warehouses}
              belegteSlotIds={belegteSlotIds}
              gesperrt={gesperrt}
              vehicles={vehicles}
              raeder={raeder}
              onEinlagern={onEinlagern}
              onEntfernen={onEinlagerungEntfernen}
              onAngabenAendern={onEinlagerungAngaben}
              onErfassungsart={onErfassungsart}
              onAnzahlRaeder={onAnzahlRaeder}
              onRadSpeichern={onRadSpeichern}
              onRadEntfernen={onRadEntfernen}
              onFahrzeugAnlegen={onFahrzeugAnlegen}
            />
          ) : (
            <div className="auftrag-block">
              <div className="auftrag-block-titel">Reifen einlagern</div>
              {/* Der Normalfall beim Saisonwechsel: Auf demselben Auftrag wird ein Satz
                  herausgegeben (das ist die Gebühr) und der andere kommt herein. Beides
                  nebeneinander, beides richtig – genau das konnte die Fassung vor
                  Migration 46 nicht. */}
              {hatLagergebuehr && (
                <p className="small" style={{ margin: "0 0 8px" }}>
                  Auf diesem Auftrag steht eine Lagergebühr – hier wurde also ausgelagert.
                  Kommt der andere Satz jetzt ins Regal, hier weitermachen.
                </p>
              )}
              <p className="small" style={{ margin: "0 0 8px" }}>
                Nimmt der Kunde seine alten Reifen nicht mit, kommen sie hier ins Regal. Das
                kostet an dieser Stelle noch nichts – die Gebühr wird erst beim Auslagern
                fällig, wenn die Zahl der Monate feststeht.
              </p>
              <button
                type="button"
                className="btn-secondary btn-rand"
                disabled={gesperrt}
                onClick={() => setEinlagerungOffen(true)}
              >
                Reifen einlagern
              </button>
              {gesperrt && (
                <div className="small" style={{ marginTop: 6 }}>
                  Der Auftrag ist abgeschlossen – eingelagert wird über die Regalwand.
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------- Was sonst noch im Regal liegt */}
          {/* Der Saisonwechsel besteht aus zwei Hälften: Der eine Satz kommt heraus, der
              andere geht hinein. Die zweite Hälfte stand schon immer oben; die erste fehlte,
              weil der Block dort nur zeigt, was AN DIESEM Auftrag hängt. Der alte Satz gehört
              aber zum Auftrag vom letzten Frühjahr – und war damit hier unsichtbar.

              Die Gebühr entsteht genau hier, deshalb steht der Knopf hier und nicht nur an
              der Regalwand. */}
          {fremdeSaetze.length > 0 && (
            <div className="auftrag-block">
              <div className="auftrag-block-titel">Im Regal für diesen Kunden</div>
              {fremdeSaetze.map((satz) => {
                const platz = storageSlots.find((sl) => sl.id === satz.storage_slot_id);
                const lager = warehouses.find((w) => w.id === platz?.warehouse_id);
                const fz = vehicles.find((v) => v.id === satz.vehicle_id);
                const monate = lagermonate(satz.created_at, todayStr());
                return (
                  <div key={satz.id} className="regalsatz-zeile">
                    <div>
                      <strong>{[lager?.name, platz?.code].filter(Boolean).join(" · ") || "Lagerplatz unbekannt"}</strong>
                      {satz.saison ? ` · ${SAISON_LABEL[satz.saison]}` : ""}
                      {fz ? ` · ${[fz.license_plate, fz.make_model].filter(Boolean).join(" ")}` : ""}
                      <div className="small">
                        seit {formatDate(satz.created_at.slice(0, 10))} · {monate}{" "}
                        {monate === 1 ? "angefangener Monat" : "angefangene Monate"}
                      </div>
                    </div>
                    <button
                      type="button" className="btn-secondary btn-rand"
                      disabled={gesperrt}
                      onClick={() => onAuslagern(satz.id)}
                    >
                      Auslagern
                    </button>
                  </div>
                );
              })}
            </div>
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
          ) : altreifenFrage ? (
            /* Der Ersatz für den Abschluss-Zwang aus Migration 22 (siehe Migration 46).
               Dieselbe Bauart wie der D2/D3-Hinweis: Die Anwendung erinnert an das
               Wahrscheinliche, ohne den Ausnahmefall zu verbieten. Beide Wege führen weiter –
               nur einer davon führt sofort weiter. */
            <div className="auftrag-grund">
              <div className="auftrag-frage-text">
                Auf diesem Auftrag steht eine Leistung, bei der alte Reifen anfallen – es wurde
                aber nichts eingelagert. Nimmt der Kunde die alten Reifen mit?
              </div>
              <div className="auftrag-grund-knoepfe">
                <button
                  type="button" className="btn-secondary"
                  onClick={() => { setAltreifenFrage(false); setEinlagerungOffen(true); }}
                >
                  Nein – einlagern
                </button>
                <button
                  type="button" className="btn-green"
                  onClick={async () => { setAltreifenFrage(false); await onSetStatus(order.id, "erledigt"); }}
                >
                  Ja, mitgenommen – abschließen
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
                {/* Was dem Abschluss noch im Weg steht, steht AM KNOPF – nicht nur weiter oben
                    im Einlagerungsblock, den man dafür erst hochscrollen müsste. Der Knopf
                    bleibt trotzdem anklickbar: Die Regel steht in der Datenbank (Migration 22
                    und 30), und diese Zeile ist nur ihre Vorschau. Ein hier gesperrter Knopf
                    würde behaupten, alle Bedingungen zu kennen – das tut er nicht. */}
                {!gesperrt && abschlussFehlt.length > 0 && (
                  <span className="hinweis-pflicht" style={{ alignSelf: "center" }}>
                    Fehlt noch: {abschlussFehlt.join(", ")}
                  </span>
                )}
                {!gesperrt && (
                  <button
                    type="button" className="btn-green"
                    onClick={() => {
                      // Die Frage schiebt sich EINMAL dazwischen und sperrt nichts: Wer sie
                      // beantwortet, ist im selben Klick fertig.
                      if (altreifenOffen) { setAltreifenFrage(true); setAltreifenGefragt(true); return; }
                      onSetStatus(order.id, "erledigt");
                    }}
                  >
                    Auftrag abschließen
                  </button>
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

        {/* Die Historie steht ganz unten und zugeklappt: Sie beantwortet eine Frage, die man
            selten stellt („wer hat das geändert?"), und wer sie nicht stellt, soll nicht an
            ihr vorbeiscrollen müssen, um zum Abschließen-Knopf zu kommen. */}
        <AuftragProtokoll auftragId={order.id} />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Article, ArticlePrice, AuftragFahrzeug, Customer, EingelagertesRad, Employee, Erfassungsart, Firmenfahrzeug, Order, OrderArticle, OrderStatus, RadPosition, Saison, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import type { RadFelder } from "@/lib/api/lager";
import { formatDate, formatEUR, getPhoneNumbers, handlungsgruende, lagermonate, rechnungsdatenMaengel, todayStr } from "@/lib/helpers";
import { employeeColorFor, hhmmAus, minutenAus } from "@/lib/calendar";
import { datumKurz } from "@/lib/dashboard";
import { terminUeberschneidungen } from "@/lib/ueberschneidung";
import { istLaufkundenAuftrag, kundeZumAuftrag } from "@/lib/laufkunde";
import {
  DOT_ALT_JAHRE, LAGERDAUER_HINWEIS_TAGE, ORDER_STATUS_FARBE, ORDER_STATUS_LABEL,
  PROFIL_KRITISCH_MM, SAISON_LABEL, STANDARD_DAUER_MIN, istAbgeschlossen,
} from "@/lib/constants";
import { ArticleAssignPanel } from "./ArticleAssignPanel";
import { IconNavPin } from "@/components/icons";
import { EinlagerungBlock } from "./EinlagerungBlock";
import { RechnungsdatenBlock } from "./RechnungsdatenBlock";
import { FahrzeugeBlock } from "./FahrzeugeBlock";
import { AuftragProtokoll } from "./AuftragProtokoll";
import { auftragsNr } from "@/lib/testkunde";

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
//
// Seit 26.09.2026 (Entwurf N) in Karten: oben wer, wann, wo (mit Navigation und Anruf), darunter
// was für den Abschluss fehlt, Team & Transporter, Fahrzeug, Leistungen, Rechnung, Reifen,
// Notiz. Termin und Team werden in einem Blatt geändert („Übernehmen" speichert), der Fuß trägt
// genau die eine Handlung, die im jeweiligen Zustand dran ist. Seltenes – Stornieren, Löschen,
// Wiedereröffnen, Historie – steht im Menü „⋯".
export function AuftragModal({
  order, customer, vehicles, firmenfahrzeuge, employees, assignedEmployeeIds, articles, articlePrices, orderArticles,
  isTechniker, darfWiedereroeffnen, frischAngelegt = false,
  einlagerungen, hatLagergebuehr, storageSlots, warehouses, belegteSlotIds, raeder,
  fremdeSaetze, onAuslagern, onEtikett,
  terminIntervallMin, letzterSatz, letzterSatzRaeder,
  onClose, onSaveFields, onSetFirmenfahrzeug, onUpdateTechnikerNotiz, onSetStatus, onDelete, onRechnungOeffnen, auftragFahrzeuge,
  onEmailSpeichern, onFahrzeugHinzufuegen, onRechnungsFahrzeugAnlegen, onKilometerstand, onFahrzeugEntfernen,
  onAddArticle, onUpdateArticleQty, onUpdateArticleEndpreis, onUpdateArticleText, onRemoveArticle, onNavigate, onCall,
  onEinlagern, onEinlagerungEntfernen, onEinlagerungAngaben,
  onErfassungsart, onAnzahlRaeder, onRadSpeichern, onRadEntfernen, onFahrzeugAnlegen,
  andereAuftraege, auftragsZuordnungen, kundeName, onKundeOeffnen,
}: {
  // Springt vom Auftrag in das Kundenfenster. Optional: Wer das Fenster ohne diese Zusage
  // einbindet, bekommt den Knopf „Kunde" nicht zu sehen.
  onKundeOeffnen?: (kundeId: string) => void;
  // Für den Hinweis auf Doppelbuchungen (Fahrplan D1): die geladenen Aufträge samt ihrer
  // Mitarbeiter, und wie der Kunde eines Auftrags heißt. Geprüft wird gegen den ENTWURF in
  // diesem Fenster, nicht gegen das Gespeicherte – der Hinweis soll beim Anhaken kommen, nicht
  // erst nach dem Speichern.
  andereAuftraege: Order[];
  auftragsZuordnungen: Record<string, string[]>;
  kundeName: (kundeId: string) => string;
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
  // ALLE Sätze, die an diesem Auftrag hängen – nicht einer. Seit Migration 44 kann ein Auftrag
  // mehrere Fahrzeuge tragen („3 Autos"), und dann gehören auch mehrere Sätze ins Regal. Bis
  // zum 17.09.2026 stand hier ein einzelner Satz: Wer den zweiten einlagern wollte, fand
  // keinen Knopf dafür – und der erste zog beim nächsten Platz-Wählen einfach um.
  einlagerungen: TireStorage[];
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
  // Öffnet den Etikettendruck für einen Satz (17.09.2026).
  onEtikett: (satzId: string) => void;
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  belegteSlotIds: Set<string>;
  onClose: () => void;
  onSaveFields: (id: string, fields: {
    title: string; description: string; orderDate: string; time: string; endTime?: string; rechnungNoetig?: boolean;
    status: OrderStatus; assignedEmployeeIds: string[];
    // Nur bei der Laufkundschaft (Migration 57). Fehlt das Feld, bleibt der Wert unverändert.
    laufkunde?: { name: string; telefon: string; ort: string };
  }) => Promise<void>;
  // Hakt „Rechnung erstellt" ab oder nimmt es zurück (Migration 40). Optional: Wer das Fenster
  // ohne diese Zusage einbindet, bekommt den Block gar nicht erst zu sehen.
  // Öffnet das Rechnungsfenster. Es liegt NICHT in diesem Bauteil: Es braucht Betriebsdaten
  // und die Belege zu diesem Auftrag, und beides hier durchzureichen hieße, dem
  // Auftragsfenster ein zweites Thema aufzuladen. Der Knopf verweist, das Fenster steht in
  // app/page.tsx – auf derselben Ebene wie dieses hier.
  onRechnungOeffnen?: (orderId: string) => void;
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
  onSetFirmenfahrzeug: (id: string, firmenfahrzeugId: string | null) => Promise<void>;
  onUpdateTechnikerNotiz: (id: string, notiz: string) => Promise<void>;
  onSetStatus: (id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddArticle: (orderId: string, articleId: string, quantity: number, endpreisNetto: number | null, text: string | null) => Promise<void>;
  onUpdateArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateArticleEndpreis: (id: string, endpreisNetto: number | null) => Promise<void>;
  onUpdateArticleText: (id: string, text: string | null) => Promise<void>;
  onRemoveArticle: (id: string) => Promise<void>;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  // Anrufen direkt aus dem Auftragsfenster. Es ist der Bildschirm, auf dem eine angetippte
  // Terminerinnerung landet – wer dort steht, will genau zwei Dinge: hinfahren oder anrufen.
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  // Ohne `einlagerungId` entsteht ein NEUER Satz, mit einer zieht der genannte um. Zwei
  // Bedeutungen an einem Aufruf, aber es ist dieselbe Handlung: „dieser Satz liegt auf diesem
  // Platz". Getrennte Aufrufe hätten die Aufrufstelle gezwungen, vorher zu wissen, ob es den
  // Satz schon gibt – und genau das weiß der Knopf am Regal nicht.
  onEinlagern: (lagerplatzId: string, einlagerungId?: string) => Promise<void>;
  onEinlagerungEntfernen: (einlagerungId: string) => Promise<void>;
  // Fahrzeug und Saison am eingelagerten Satz (Migration 30). Getrennt vom Zuordnen des
  // Lagerplatzes: das eine ist eine Bewegung im Regal, das andere eine Beschreibung.
  onEinlagerungAngaben: (einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) => Promise<void>;
  // Die einzeln erfassten Räder dieses Satzes und ihre Pflege (Migration 33).
  // Die einzeln erfassten Räder ALLER Sätze dieses Auftrags. Aufgeteilt wird hier, je Satz –
  // die Seite müsste sonst für jeden Satz eine eigene Liste durchreichen.
  raeder: EingelagertesRad[];
  onErfassungsart: (einlagerungId: string, art: Erfassungsart) => Promise<void>;
  onAnzahlRaeder: (einlagerungId: string, anzahl: number) => Promise<void>;
  onRadSpeichern: (einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) => Promise<void>;
  onRadEntfernen: (radId: string) => Promise<void>;
  // Legt ein Fahrzeug für den Kunden dieses Auftrags an und ordnet es dem eingelagerten Satz
  // gleich zu – aus dem Auftrag heraus, ohne Umweg über das Kundenfenster.
  //
  // `einlagerungId` sagt, WELCHEM Satz: Bei zwei Autos am selben Auftrag landete das Kennzeichen
  // sonst bei dem, den die Seite zufällig zuerst fand.
  onFahrzeugAnlegen: (kennzeichen: string, modell: string, einlagerungId?: string) => Promise<void>;
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
  // Über ALLE Sätze: Die Datenbank zählt beim Abschließen ebenfalls alle (Migration 30). Fehlt
  // an irgendeinem das Fahrzeug, steht es hier – auch wenn zwei andere vollständig sind.
  if (einlagerungen.some((e) => !e.vehicle_id)) abschlussFehlt.push("Fahrzeug");
  if (einlagerungen.some((e) => !e.saison)) abschlussFehlt.push("Saison");
  // Laufkundschaft (Migration 57): Wer es war, gehört vor dem Abschließen in den Auftrag – die
  // Datenbank verlangt es (`pruefe_laufkunde()`), hier steht es vorher.
  const laufkunde = istLaufkundenAuftrag(customer);
  if (laufkunde && !(order.laufkunde_name ?? "").trim()) abschlussFehlt.push("Name des Laufkunden");

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
  const [firmenfahrzeugId, setFirmenfahrzeugId] = useState(order.firmenfahrzeug_id || "");
  const [mitarbeiterIds, setMitarbeiterIds] = useState<string[]>(assignedEmployeeIds);
  const [notiz, setNotiz] = useState(order.techniker_notiz || "");
  // Der Laufkunde (Migration 57) – Teil des Entwurfs wie Titel und Uhrzeit, gespeichert mit
  // „Speichern". Bei jedem anderen Kunden bleiben die drei Felder unsichtbar und unangetastet.
  const [lkName, setLkName] = useState(order.laufkunde_name || "");
  const [lkTelefon, setLkTelefon] = useState(order.laufkunde_telefon || "");
  const [lkOrt, setLkOrt] = useState(order.laufkunde_ort || "");
  const kundeAnzeige = laufkunde
    ? kundeZumAuftrag({ laufkunde_name: lkName, laufkunde_telefon: lkTelefon, laufkunde_ort: lkOrt }, customer)
    : customer;
  const [speichert, setSpeichert] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [schliessenNachfrage, setSchliessenNachfrage] = useState(false);

  // Wechselt ein ANDERER Auftrag ins Fenster, setzt die Seite dieses Fenster vollständig neu
  // auf (`key={order.id}` in app/page.tsx) – jeder Entwurfszustand beginnt dann von vorn.
  //
  // Bis zum 23.09.2026 stand hier ein Effekt, der beim Auftragswechsel einzelne Felder von
  // Hand zurücksetzte: Titel, Datum, Zeit, Beschreibung, Fahrzeug, Mitarbeiter, Notiz. Nicht
  // dabei waren „Bis", „Rechnung benötigt", die Altreifen-Rückfrage, der Einlagerungsblock und
  // die Storno-/Wiedereröffnen-Blöcke (Fahrplan D6). Sprang man aus einer Benachrichtigung
  // direkt in einen anderen Auftrag, galt die Altreifen-Frage als schon gestellt und blieb aus.
  // Eine Liste, die man bei jedem neuen Feld nachziehen muss, vergisst man; ein neues Bauteil
  // vergisst nichts. Das Neuladen nach dem Speichern trifft denselben Auftrag und damit
  // denselben Schlüssel – die Eingabe bleibt dabei stehen.

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
    firmenfahrzeugId !== (order.firmenfahrzeug_id || "") ||
    notiz !== (order.techniker_notiz || "") ||
    lkName !== (order.laufkunde_name || "") ||
    lkTelefon !== (order.laufkunde_telefon || "") ||
    lkOrt !== (order.laufkunde_ort || "") ||
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
  const altreifenOffen = fragtAltreifen && einlagerungen.length === 0 && !gesperrt && !altreifenGefragt;

  const aktiveFirmenfahrzeuge = firmenfahrzeuge.filter((f) => f.aktiv);

  // Wer bekommt fünf Minuten vor diesem Termin eine Erinnerung? Die Kette ist: zugeordneter
  // Mitarbeiter → verknüpftes Benutzerkonto → angemeldetes Gerät. Die ersten zwei Glieder
  // sind hier sichtbar, das dritte nicht – deshalb nennt der Hinweis nur, was hier fehlt, und
  // behauptet nichts über den Rest.
  const zugeordnete = employees.filter((e) => mitarbeiterIds.includes(e.id));

  // Doppelbuchungen (Fahrplan D1). Nur für die, die einteilen dürfen: Ein Techniker sieht
  // fremde Aufträge ohnehin nicht (RLS, Migration 13/15) und ändert die Einteilung nicht.
  // Ein Hinweis, keine Sperre – siehe lib/ueberschneidung.ts.
  const doppelt = gesperrt || isTechniker ? [] : terminUeberschneidungen(
    { id: order.id, order_date: datum, time: zeit.trim() || null, end_time: zeitBis.trim() || null },
    mitarbeiterIds, firmenfahrzeugId || null, andereAuftraege, auftragsZuordnungen, terminIntervallMin,
  );
  function doppeltText(u: (typeof doppelt)[number]): string {
    const wer = u.art === "mitarbeiter"
      ? employees.find((e) => e.id === u.werId)?.name ?? "Unbekannt"
      : firmenfahrzeugText(u.werId) || "Dieses Fahrzeug";
    return `${wer} ist ${u.von}–${u.bis}${u.geschaetzt ? " (Ende geschätzt)" : ""} schon bei `
      + `Auftrag ${auftragsNr(u.auftrag.order_number)} · ${kundeName(u.auftrag.customer_id)}`;
  }
  const doppeltMitarbeiter = doppelt.filter((u) => u.art === "mitarbeiter");
  const doppeltFahrzeug = doppelt.filter((u) => u.art === "fahrzeug");
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

  // Die Fahrzeuge dieses Auftrags, angereichert um den Stammsatz. Einmal abgeleitet und von
  // zwei Stellen gelesen: dem Block „Fahrzeug" (der sie ändert) und der Abhakliste für die
  // Rechnung (die sie nur prüft). Zwei getrennte Ableitungen wären wieder zwei Wahrheiten.
  const auftragsFahrzeuge = auftragFahrzeuge
    .filter((af) => af.order_id === order.id)
    .map((af) => ({ ...af, fahrzeug: vehicles.find((v) => v.id === af.vehicle_id) ?? null }));

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
        ...(laufkunde ? { laufkunde: { name: lkName, telefon: lkTelefon, ort: lkOrt } } : {}),
      });
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

  // ---------------------------------------------------------------- Blätter
  // „Termin & Team" ändert den Entwurf. Beim Öffnen wird der Stand gemerkt: Wer das Blatt
  // ohne „Übernehmen" schließt, bekommt ihn zurück – sonst trüge das Fenster Änderungen, die
  // man eben verworfen zu haben glaubt.
  const [terminOffen, setTerminOffen] = useState(false);
  const terminStand = useRef<{ datum: string; zeit: string; zeitBis: string; ende: boolean; ma: string[]; ff: string } | null>(null);
  const [menueOffen, setMenueOffen] = useState(false);
  const protokollRef = useRef<HTMLDivElement>(null);

  function terminOeffnen() {
    if (gesperrt) return;
    terminStand.current = { datum, zeit, zeitBis, ende: endeVorgeschlagen, ma: mitarbeiterIds, ff: firmenfahrzeugId };
    setTerminOffen(true);
  }
  function terminVerwerfen() {
    const st = terminStand.current;
    if (st) {
      setDatum(st.datum); setZeit(st.zeit); setZeitBis(st.zeitBis); setEndeVorgeschlagen(st.ende);
      setMitarbeiterIds(st.ma); setFirmenfahrzeugId(st.ff);
    }
    setTerminOffen(false);
  }
  async function terminUebernehmen() {
    await speichern();
    terminStand.current = null;
    setTerminOffen(false);
  }

  // Ein Zustandswechsel mit ungespeichertem Entwurf speichert ihn vorher. Bis zum 26.09.2026
  // blieb der Entwurf beim Abschließen einfach liegen – danach war der Auftrag gesperrt, der
  // Speichern-Knopf verschwand, und die Änderung war still verloren.
  async function erstSpeichern(): Promise<boolean> {
    if (!geaendert || gesperrt) return true;
    if (zeitFehlt || endeVorAnfang) { terminOeffnen(); return false; }
    await speichern();
    return true;
  }
  async function statusSetzen(status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) {
    if (!(await erstSpeichern())) return;
    await onSetStatus(order.id, status, grund);
  }
  function abschliessen() {
    // Die Frage schiebt sich EINMAL dazwischen und sperrt nichts: Wer sie beantwortet, ist im
    // selben Klick fertig.
    if (altreifenOffen) { setAltreifenFrage(true); setAltreifenGefragt(true); return; }
    void statusSetzen("erledigt");
  }

  const zugeteilt = employees.filter((e) => mitarbeiterIds.includes(e.id));
  const terminText = datum
    ? `${datumKurz(datum)}${datum.slice(0, 4) !== todayStr().slice(0, 4) ? datum.slice(0, 4) : ""}`
      + (zeit.trim() ? ` · ${zeit.slice(0, 5)}${zeitBis.trim() ? `–${zeitBis.slice(0, 5)}` : ""}` : " · ohne Uhrzeit")
    : "ohne Datum";
  // Was dem Abschluss noch im Weg steht – dieselbe Liste wie bisher am Knopf, dazu die Uhrzeit.
  // Eine Vorschau: Die Regeln stehen in der Datenbank (Migration 22, 30, 57), und der Knopf
  // bleibt deshalb anklickbar.
  //
  // Dazu die Rechnungsangaben, sobald „Rechnung nötig" gesetzt ist (Migration 44): Ohne sie
  // lehnt die Datenbank den Abschluss ab – dieselbe Liste wie im Rechnungsblock
  // (`rechnungsdatenMaengel`), nicht eine zweite.
  const rechnungsMaengel = rechnungNoetig
    ? rechnungsdatenMaengel(customer ?? null, auftragsFahrzeuge.map((f) => ({ kennzeichen: f.fahrzeug?.license_plate ?? null, kilometerstand: f.kilometerstand })))
    : [];
  const fehltListe = gesperrt ? [] : [...new Set([...(zeitFehlt ? ["Uhrzeit"] : []), ...abschlussFehlt, ...rechnungsMaengel.map((m) => m.text)])];
  const telefonDa = !!kundeAnzeige && getPhoneNumbers(kundeAnzeige).length > 0;
  const adresseDa = !!kundeAnzeige && kundeAnzeige.address.trim() !== "";
  const summen = orderArticles.reduce((n, r) => n + (r.endpreis_netto ?? r.quantity * r.net_price), 0);
  const rechnungDa = !!order.rechnung_nummer;

  // Die eine Handlung, die in diesem Zustand dran ist.
  let fussHinweis: string;
  let fussHinweisArt: "grau" | "warn" | "ok" = "grau";
  if (order.status === "offen") {
    fussHinweis = "„Arbeit beginnen“ stellt den Auftrag auf „In Arbeit“ – das Büro sieht, dass jemand dran ist.";
  } else if (order.status === "in_arbeit") {
    fussHinweis = fehltListe.length ? `Fehlt noch: ${fehltListe.join(" · ")}` : "Bereit zum Abschließen – geprüft wird beim Klick.";
    fussHinweisArt = fehltListe.length ? "warn" : "ok";
  } else if (order.status === "erledigt") {
    fussHinweis = `Abgeschlossen${order.completed_at ? ` am ${formatDate(order.completed_at.slice(0, 10))}` : ""} · die Leistungen stehen fest`;
  } else {
    fussHinweis = `Storniert${order.cancelled_at ? ` am ${formatDate(order.cancelled_at.slice(0, 10))}` : ""}${order.cancel_reason ? ` – ${order.cancel_reason}` : ""}`;
  }

  type MenuePunkt = "termin" | "wieder" | "rechnung" | "historie" | "storno" | "loeschen";
  const menue: { key: MenuePunkt; text: string; info?: string; gefahr?: boolean; aus?: boolean }[] = [];
  if (!gesperrt && feldeAendern) menue.push({ key: "termin", text: "Termin & Team ändern", info: "Datum, von–bis, Mitarbeiter, Transporter" });
  if (gesperrt) {
    menue.push(darfWiedereroeffnen
      ? { key: "wieder", text: "Wiedereröffnen", info: "mit Grund" }
      : { key: "wieder", text: "Wiedereröffnen", info: "dazu wird Admin-Recht benötigt", aus: true });
  }
  if (rechnungDa && onRechnungOeffnen) menue.push({ key: "rechnung", text: "Rechnung ansehen", info: order.rechnung_nummer ?? undefined });
  menue.push({ key: "historie", text: "Historie", info: "wer hat was geändert" });
  if (!gesperrt && !isTechniker) menue.push({ key: "storno", text: "Stornieren", info: "mit Grund – bleibt in der Liste", gefahr: true });
  // Einen Auftrag, den man vor einer Sekunde selbst erzeugt hat, löscht man nicht – man nimmt
  // ihn zurück. Deshalb dort keine Rückfrage; es kann nichts verloren gehen.
  if (!isTechniker) menue.push(frischAngelegt
    ? { key: "loeschen", text: "Verwerfen", info: "der Auftrag wurde eben erst angelegt", gefahr: true }
    : { key: "loeschen", text: "Löschen", info: "mit Rückfrage", gefahr: true });

  function menueAktion(k: MenuePunkt) {
    if (k === "loeschen") {
      if (!frischAngelegt && !confirm(`Auftrag ${auftragsNr(order.order_number)} wirklich löschen?`)) return;
      setMenueOffen(false);
      void onDelete(order.id);
      onClose();
      return;
    }
    setMenueOffen(false);
    if (k === "termin") terminOeffnen();
    else if (k === "wieder") setWiederOffen(true);
    else if (k === "rechnung") onRechnungOeffnen?.(order.id);
    else if (k === "historie") protokollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (k === "storno") setStornoOffen(true);
  }

  const statusKlasse = ORDER_STATUS_FARBE[order.status];

  return (
    // „modal-auftrag" hebt dieses Fenster über das Kundenfenster: Aus dem Kundenfenster
    // heraus lässt sich ein Auftrag öffnen, und dann liegen beide gleichzeitig offen.
    // Verlässt man sich dabei auf die Reihenfolge im Quelltext, kippt die Anzeige beim
    // nächsten Umsortieren lautlos – die Ebene gehört deshalb ins Stilblatt.
    <div className="modal-overlay modal-auftrag ao-overlay" onClick={schliessenVersuchen}>
      <div className="ao-fenster" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Auftrag ${auftragsNr(order.order_number)}`}>
        <div className="ao-kopf">
          <button type="button" className="dm-zu" onClick={schliessenVersuchen} aria-label="Schließen">×</button>
          <span className="ao-kopf-text">
            <b>{frischAngelegt ? "Neuer Auftrag" : "Auftrag"} #{auftragsNr(order.order_number)}{order.order_number < 0 && <span className="test-marke">TEST</span>}</b>
            <span className={"small" + (geaendert && !gesperrt ? " ao-ungespeichert" : "")}>
              {speichert ? "speichert …" : geaendert && !gesperrt ? "Änderungen noch nicht gespeichert" : gespeichert ? "✓ gespeichert" : ORDER_STATUS_LABEL[order.status]}
            </span>
          </span>
          {/* Speichern steht oben und nicht unten im Fuß: der Fuß trägt die Zustandswechsel,
              und ein Speichern-Knopf daneben lädt dazu ein, versehentlich den Auftrag
              abzuschließen, wenn man nur die Uhrzeit ändern wollte. Er erscheint erst, wenn es
              etwas zu speichern gibt. */}
          {geaendert && !gesperrt && (
            <button
              type="button" className="am-mini ao-speichern"
              onClick={speichern}
              disabled={speichert || zeitFehlt || endeVorAnfang}
              title={zeitFehlt ? "Bitte zuerst eine Uhrzeit eintragen." : endeVorAnfang ? "Das Ende muss nach dem Anfang liegen." : undefined}
            >
              {speichert ? "…" : "Speichern"}
            </button>
          )}
          <button type="button" className="dm-mehr" onClick={() => setMenueOffen(true)} aria-label="Weitere Aktionen" title="Weitere Aktionen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" /></svg>
          </button>
        </div>

        {schliessenNachfrage && (
          <div className="auftrag-nachfrage ao-nachfrage">
            <span>Es gibt ungespeicherte Änderungen.</span>
            <div className="auftrag-nachfrage-knoepfe">
              <button type="button" className="es-knopf" onClick={() => setSchliessenNachfrage(false)}>Zurück</button>
              <button type="button" className="es-knopf ad-gefahr" onClick={onClose}>Verwerfen</button>
              <button type="button" className="am-mini" disabled={speichert || zeitFehlt || endeVorAnfang} onClick={async () => { await speichern(); onClose(); }}>
                Speichern und schließen
              </button>
            </div>
          </div>
        )}

        <div className="ao-inhalt">
          {frischAngelegt && (
            <div className="auftrag-hinweis ao-hinweis">
              Angelegt mit heutigem Datum und dem Titel &bdquo;{order.title}&ldquo;. Termin & Team,
              Fahrzeug und Leistungen jetzt eintragen – Termin & Team mit &bdquo;Übernehmen&ldquo;,
              alles andere oben mit &bdquo;Speichern&ldquo;.
            </div>
          )}

          {/* ---------------------------------------------------------------- Wer, wann, wo */}
          <div className="ao-wer">
            <div className="ao-wer-kopf">
              <span className={"ao-status " + statusKlasse}>{ORDER_STATUS_LABEL[order.status]}</span>
              <button type="button" className="ao-termin" disabled={gesperrt || !feldeAendern} onClick={terminOeffnen}>
                {terminText}{!gesperrt && feldeAendern ? " ›" : ""}
              </button>
            </div>
            {customer && laufkunde && kundeAnzeige ? (
              <>
                <b className="ao-wer-name">{lkName.trim() || "Laufkundschaft"}</b>
                <span className="ao-wer-adr">{[lkOrt.trim(), "Barverkauf ohne Kundenanlage"].filter(Boolean).join(" · ")}</span>
              </>
            ) : customer ? (
              <>
                <b className="ao-wer-name">{(customer.company || "").trim() || customer.name}</b>
                <span className="ao-wer-adr">{customer.address.trim() || "ohne Adresse"}</span>
              </>
            ) : (
              <b className="ao-wer-name">Kunde nicht gefunden</b>
            )}
            {kundeAnzeige && (
              <div className="ao-wer-knoepfe">
                <button type="button" disabled={!adresseDa} onClick={(e) => onNavigate(e, kundeAnzeige)} title="Navigation starten">
                  <IconNavPin /> Navigation
                </button>
                {/* Die Knöpfe lesen beim Laufkunden den ENTWURF, damit eine eben eingetippte
                    Nummer sofort anrufbar ist. */}
                <button type="button" disabled={!telefonDa} onClick={(e) => onCall(e, kundeAnzeige)} title="Anrufen">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
                  Anrufen
                </button>
                {onKundeOeffnen && customer && !laufkunde && (
                  <button type="button" className="ao-kunde" onClick={() => { if (geaendert && !gesperrt) { setSchliessenNachfrage(true); return; } onKundeOeffnen(customer.id); }}>Kunde ›</button>
                )}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Laufkunde */}
          {/* Laufkundschaft (Migration 57): Der Sammelkunde hat keinen Namen, keine Nummer und
              keinen Ort – das steht hier am Auftrag, Teil des Entwurfs wie Titel und Uhrzeit. */}
          {customer && laufkunde && (
            <div className="db-karte ao-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Laufkunde</span></div>
              {gesperrt ? (
                <span className="small">
                  {[order.laufkunde_name, order.laufkunde_telefon, order.laufkunde_ort].filter((x) => (x ?? "").trim()).join(" · ") || "– kein Name eingetragen –"}
                </span>
              ) : (
                <>
                  <label className="nk-feld"><span>Name des Laufkunden *</span>
                    <input type="text" value={lkName} onChange={(e) => setLkName(e.target.value)} placeholder="z. B. Max Mustermann" />
                  </label>
                  <div className="nk-zeile">
                    <label className="nk-feld"><span>Telefon</span>
                      <input type="tel" value={lkTelefon} onChange={(e) => setLkTelefon(e.target.value)} placeholder="für Rückfragen" />
                    </label>
                    <label className="nk-feld"><span>Einsatzort</span>
                      <input type="text" value={lkOrt} onChange={(e) => setLkOrt(e.target.value)} placeholder="z. B. Rastplatz A9, Parkplatz Süd" />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- Noch offen */}
          {fehltListe.length > 0 && (
            <div className="ao-fehlt">
              <span className="ao-fehlt-titel">FÜR DEN ABSCHLUSS FEHLT NOCH</span>
              <div className="ao-fehlt-liste">
                {fehltListe.map((f) => <span key={f}>{f}</span>)}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- Worum geht's */}
          <div className="db-karte ao-karte">
            <div className="db-karte-kopf"><span className="db-karte-titel">Auftrag</span></div>
            {feldeAendern ? (
              <>
                <label className="nk-feld"><span>Titel</span>
                  <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)} />
                </label>
                <label className="nk-feld"><span>Beschreibung</span>
                  <textarea rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
                </label>
              </>
            ) : (
              <>
                <b>{order.title}</b>
                {order.description && <span className="small">{order.description}</span>}
              </>
            )}
          </div>

          {/* ---------------------------------------------------------------- Team */}
          {/* Zwei Dinge in einer Karte, weil sie zusammen entschieden werden: wer fährt, und
              womit. Das Auto des Kunden steht darunter getrennt – beides heißt „Fahrzeug", ist
              aber etwas anderes, und genau deshalb gibt es zwei Tabellen. */}
          <div className="db-karte ao-karte">
            <div className="db-karte-kopf">
              <span className="db-karte-titel">Team &amp; Transporter</span>
              {!gesperrt && feldeAendern && <button type="button" className="db-link" onClick={terminOeffnen}>Ändern</button>}
            </div>
            <div className="ao-chips">
              {zugeteilt.length === 0 && <span className="ao-chip leer">niemand zugeteilt</span>}
              {zugeteilt.map((m) => (
                <span key={m.id} className="ao-chip ma" style={{ background: employeeColorFor(employees, m.id) }}>{m.name}</span>
              ))}
              <span className="ao-chip-trenner" aria-hidden="true" />
              <span className="ao-chip">🚐 {firmenfahrzeugText(firmenfahrzeugId || null) || "kein Transporter"}</span>
            </div>
            {doppelt.length > 0 && (
              <div className="doppelbuchung" role="status">
                <b>Überschneidung – kein Hindernis:</b>
                <ul>
                  {doppeltMitarbeiter.map((u) => <li key={`${u.auftrag.id}-${u.werId}`}>{doppeltText(u)}</li>)}
                  {doppeltFahrzeug.map((u) => <li key={`f-${u.auftrag.id}`}>{doppeltText(u)}</li>)}
                </ul>
              </div>
            )}
            {/* Hinweis zur Terminerinnerung (docs/benachrichtigungen-plan.md): Sie geht an die
                zugeordneten Mitarbeiter – und nur an die, deren Name mit einem Benutzerkonto
                verknüpft ist. Die Lücke steht hier, im Moment des Einteilens. */}
            {zeit.trim() && erinnerungsHinweis && <span className="small">{erinnerungsHinweis}</span>}
          </div>

          {/* ---------------------------------------------------------------- Fahrzeug */}
          {/* Ein Auftrag kann mehrere Autos betreffen („die drei Firmenwagen"), und zu jedem
              gehört ein Kilometerstand (Migration 44). Es gibt nur diese Liste – welches Auto
              bearbeitet wird, ist keine Frage der Abrechnung. */}
          <div className="db-karte ao-karte">
            <div className="db-karte-kopf"><span className="db-karte-titel">Fahrzeug</span></div>
            <FahrzeugeBlock
              gesperrt={gesperrt}
              fahrzeuge={auftragsFahrzeuge}
              alleFahrzeuge={vehicles}
              onFahrzeugHinzufuegen={(vid) => onFahrzeugHinzufuegen(order.id, vid)}
              onFahrzeugAnlegen={(kz) => onRechnungsFahrzeugAnlegen(order.id, order.customer_id, kz)}
              onKilometerstand={onKilometerstand}
              onFahrzeugEntfernen={onFahrzeugEntfernen}
            />
          </div>

          {/* ---------------------------------------------------------------- Leistungen */}
          <div className="db-karte ao-karte">
            <div className="db-karte-kopf">
              <span className="db-karte-titel">Leistungen</span>
              {orderArticles.length > 0 && <span className="small">{orderArticles.length} · {formatEUR(summen)} netto</span>}
            </div>
            {/* D2/D3: Was beim letzten Mal an diesem Fahrzeug auffiel. Der Hinweis steht ÜBER
                den Leistungen, weil genau hier die Entscheidung fällt, ob man Neureifen
                anbietet. */}
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
              onUpdateText={onUpdateArticleText}
              onRemove={onRemoveArticle}
            />
          </div>

          {/* ---------------------------------------------------------------- Rechnung */}
          <div className="db-karte ao-karte">
            {/* „Rechnung nötig" (Migration 38) – entscheidet, ob auf den Nettobetrag die Steuer
                kommt. Der Satz darunter nennt die Wirkung, nicht die Einstellung. Teil des
                Entwurfs, gespeichert mit „Speichern". */}
            <button type="button" className="sl-chance nk-schalter ar-schalter ao-schalter" aria-pressed={rechnungNoetig} disabled={gesperrt}
              onClick={() => setRechnungNoetig(!rechnungNoetig)}>
              <span className="db-punkt-text">
                <span className="db-punkt-titel">Rechnung nötig</span>
                <span className="small">{rechnungNoetig ? "Auf den Nettobetrag kommt die Umsatzsteuer." : "Es gilt der Nettobetrag, ohne Steuer."}</span>
              </span>
              <span className={"nk-spur" + (rechnungNoetig ? " an" : "")} aria-hidden="true"><span /></span>
            </button>
            {/* Sobald „Rechnung nötig" gesetzt ist: was dafür noch fehlt (Migration 44). Die
                Liste sperrt nichts – verlangt werden die Angaben erst beim Abschließen, und dort
                von der Datenbank. */}
            {rechnungNoetig && (
              <RechnungsdatenBlock
                kunde={customer ?? null}
                gesperrt={gesperrt}
                darfKundeAendern={!isTechniker}
                fahrzeuge={auftragsFahrzeuge}
                onEmailSpeichern={(email) => onEmailSpeichern(order.customer_id, email)}
              />
            )}
            {/* Die Rechnung selbst (Migration 48/49). Erscheint erst beim erledigten Auftrag:
                Vorher steht nicht fest, was abgerechnet wird, und eine Nummer, die man
                zurücknehmen müsste, ist eine Lücke im Kreis. */}
            {rechnungNoetig && order.status === "erledigt" && onRechnungOeffnen && (
              <div className={"rechnung-stand" + (rechnungDa ? " erledigt" : "")}>
                <span>
                  <b>{rechnungDa ? `Rechnung ${order.rechnung_nummer}` : "Rechnung steht noch aus"}</b>
                  <span className="small">
                    {rechnungDa
                      ? `Ausgestellt am ${order.rechnung_erstellt_am ? formatDate(order.rechnung_erstellt_am.slice(0, 10)) : ""} – ansehen, drucken oder stornieren.`
                      : "Die Leistungen stehen schon drin. Im Fenster erst ansehen, dann ausstellen."}
                  </span>
                </span>
                <button type="button" className={rechnungDa ? "es-knopf" : "am-mini"} onClick={() => onRechnungOeffnen(order.id)}>
                  {rechnungDa ? "Rechnung ansehen" : "Rechnung erstellen"}
                </button>
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- Reifen */}
          {/* Der Saisonwechsel besteht aus zwei Hälften: Der eine Satz kommt heraus (das ist
              die Gebühr), der andere geht hinein. Beides steht hier nebeneinander – was schon im
              Regal liegt, und was an diesem Auftrag eingelagert wird (Migration 46). */}
          <div className="ao-reifen">
            <span className="op-gruppe-titel ao-gruppe">REIFEN</span>
            {fremdeSaetze.length > 0 && (
              <div className="db-karte ao-karte">
                <div className="db-karte-kopf"><span className="db-karte-titel">Im Regal für diesen Kunden</span></div>
                {fremdeSaetze.map((satz) => {
                  const platz = storageSlots.find((sl) => sl.id === satz.storage_slot_id);
                  const lager = warehouses.find((w) => w.id === platz?.warehouse_id);
                  const fz = vehicles.find((v) => v.id === satz.vehicle_id);
                  const monate = lagermonate(satz.created_at, todayStr());
                  return (
                    <div key={satz.id} className="ao-regal">
                      <span className="ao-platz">{platz?.code || "?"}</span>
                      <span className="dm-fz-text">
                        <b>{[satz.saison ? SAISON_LABEL[satz.saison] : "Reifensatz", fz ? [fz.license_plate, fz.make_model].filter(Boolean).join(" ") : null].filter(Boolean).join(" · ")}</b>
                        <span className="small">
                          {lager?.name ? `${lager.name} · ` : ""}seit {formatDate(satz.created_at.slice(0, 10))} · {monate}{" "}
                          {monate === 1 ? "angefangener Monat" : "angefangene Monate"}
                        </span>
                      </span>
                      <button type="button" className="es-knopf" disabled={gesperrt} onClick={() => onAuslagern(satz.id)}>Auslagern</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ein Block je Satz (17.09.2026): Ein Auftrag mit drei Autos braucht drei Plätze,
                drei Fahrzeugzuordnungen und drei Profilmessungen. Eindeutig ist der PLATZ (ein
                aktiver Satz je Platz, Migration 15), nicht der Auftrag. */}
            {einlagerungen.map((satz, i) => (
              <EinlagerungBlock
                key={satz.id}
                /* Die Nummer steht nur da, wenn es mehr als einen gibt. */
                titel={einlagerungen.length > 1 ? `Einlagerung · Satz ${i + 1} von ${einlagerungen.length}` : "Einlagerung"}
                pflicht={false}
                einlagerung={satz}
                slots={storageSlots}
                warehouses={warehouses}
                belegteSlotIds={belegteSlotIds}
                gesperrt={gesperrt}
                vehicles={vehicles}
                raeder={raeder.filter((r) => r.tire_storage_id === satz.id)}
                onEinlagern={(lagerplatzId) => onEinlagern(lagerplatzId, satz.id)}
                onEntfernen={onEinlagerungEntfernen}
                onAngabenAendern={onEinlagerungAngaben}
                onErfassungsart={onErfassungsart}
                onAnzahlRaeder={onAnzahlRaeder}
                onRadSpeichern={onRadSpeichern}
                onRadEntfernen={onRadEntfernen}
                onFahrzeugAnlegen={(kennzeichen, modell) => onFahrzeugAnlegen(kennzeichen, modell, satz.id)}
                onEtikett={onEtikett}
              />
            ))}
            {/* Der leere Block zum Anlegen des nächsten Satzes: Er hat noch keine Zeile in der
                Datenbank, deshalb `einlagerung={null}` und ein `onEinlagern` OHNE Id – erst die
                Platzwahl legt den Satz an. */}
            {einlagerungOffen && (
              <EinlagerungBlock
                titel={einlagerungen.length > 0 ? `Einlagerung · Satz ${einlagerungen.length + 1}` : "Einlagerung"}
                pflicht={false}
                einlagerung={null}
                slots={storageSlots}
                warehouses={warehouses}
                belegteSlotIds={belegteSlotIds}
                gesperrt={gesperrt}
                vehicles={vehicles}
                raeder={[]}
                onEinlagern={async (lagerplatzId) => { await onEinlagern(lagerplatzId); setEinlagerungOffen(false); }}
                onEntfernen={onEinlagerungEntfernen}
                onAngabenAendern={onEinlagerungAngaben}
                onErfassungsart={onErfassungsart}
                onAnzahlRaeder={onAnzahlRaeder}
                onRadSpeichern={onRadSpeichern}
                onRadEntfernen={onRadEntfernen}
                onFahrzeugAnlegen={onFahrzeugAnlegen}
              />
            )}
            {!einlagerungOffen && (
              gesperrt ? (
                einlagerungen.length === 0 && fremdeSaetze.length === 0 && (
                  <span className="small">Nichts eingelagert. Der Auftrag ist abgeschlossen – eingelagert wird jetzt über die Regalwand.</span>
                )
              ) : (
                <>
                  <button type="button" className="dm-plus" onClick={() => setEinlagerungOffen(true)}>
                    {einlagerungen.length > 0 ? "+ Noch einen Satz einlagern" : "+ Reifen einlagern"}
                  </button>
                  <span className="small">
                    {einlagerungen.length > 0
                      ? "Für ein weiteres Fahrzeug auf diesem Auftrag – mit eigenem Platz, Fahrzeug und Profil."
                      : hatLagergebuehr
                        ? "Auf diesem Auftrag steht eine Lagergebühr – hier wurde ausgelagert. Kommt der andere Satz jetzt ins Regal, hier weitermachen."
                        : "Nimmt der Kunde seine alten Reifen nicht mit, kommen sie hier ins Regal. Die Gebühr wird erst beim Auslagern fällig."}
                  </span>
                </>
              )
            )}
          </div>

          {/* ---------------------------------------------------------------- Notiz */}
          <div className="db-karte ao-karte">
            <div className="db-karte-kopf"><span className="db-karte-titel">Notiz des Technikers</span></div>
            <textarea
              className="ao-notiz"
              rows={2}
              value={notiz}
              placeholder="Was vor Ort aufgefallen ist …"
              onChange={(e) => setNotiz(e.target.value)}
            />
          </div>

          {/* Die Historie steht ganz unten und zugeklappt: Sie beantwortet eine Frage, die man
              selten stellt („wer hat das geändert?"). Das Menü „⋯" springt hierher. */}
          <div ref={protokollRef} className="db-karte ao-karte ao-historie">
            <AuftragProtokoll auftragId={order.id} />
          </div>
        </div>

        {/* ---------------------------------------------------------------- Fuß */}
        <div className="ao-fuss">
          <span className={"ao-fuss-hinweis " + fussHinweisArt}>{fussHinweis}</span>
          <div className="ao-fuss-knoepfe">
            {order.status === "offen" && (
              <>
                <button type="button" className="ao-zweit" onClick={abschliessen}>Abschließen</button>
                <button type="button" className="ao-haupt orange" onClick={() => void statusSetzen("in_arbeit")}>Arbeit beginnen</button>
              </>
            )}
            {order.status === "in_arbeit" && (
              <button type="button" className="ao-haupt gruen" onClick={abschliessen}>Auftrag abschließen</button>
            )}
            {order.status === "erledigt" && rechnungNoetig && onRechnungOeffnen && (
              rechnungDa
                ? <button type="button" className="ao-zweit" onClick={() => onRechnungOeffnen(order.id)}>Rechnung {order.rechnung_nummer} ansehen</button>
                : <button type="button" className="ao-haupt orange" onClick={() => onRechnungOeffnen(order.id)}>Rechnung erstellen</button>
            )}
            {gesperrt && darfWiedereroeffnen && !(order.status === "erledigt" && rechnungNoetig && !rechnungDa && onRechnungOeffnen) && (
              <button type="button" className="ao-zweit" onClick={() => setWiederOffen(true)}>Wiedereröffnen</button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- Blatt: Termin & Team */}
      {terminOffen && (
        <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); terminVerwerfen(); }}>
          <div className="auswahl-blatt am-breit ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Termin und Team">
            <div className="ab-griff" />
            <div className="ar-blatt-kopf">
              <div className="ab-titel">Termin &amp; Team</div>
              <button type="button" className="modal-close" onClick={terminVerwerfen} aria-label="Schließen">×</button>
            </div>
            {/* Von–bis statt einer einzelnen Uhrzeit (Migration 37): Ein Mensch sagt „von acht
                bis halb zehn" und nicht „um acht für neunzig Minuten". */}
            <div className="ao-termin-felder">
              <label className="nk-feld"><span>Datum</span>
                <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </label>
              <label className="nk-feld"><span>Von</span>
                <input type="time" value={zeit} onChange={(e) => anfangAendern(e.target.value)} aria-invalid={zeitFehlt} className={zeitFehlt ? "feld-fehlt" : undefined} />
              </label>
              <label className="nk-feld"><span>Bis (optional)</span>
                <input type="time" value={zeitBis} onChange={(e) => endeAendern(e.target.value)} aria-invalid={endeVorAnfang} className={endeVorAnfang ? "feld-fehlt" : undefined} />
              </label>
            </div>
            {endeVorAnfang && (
              <div className="hinweis-pflicht">
                Das Ende liegt vor dem Anfang. Termine über Mitternacht kennt der Kalender nicht –
                so ein Auftrag gehört auf zwei Tage aufgeteilt.
              </div>
            )}
            {!zeitBis.trim() && !!zeit.trim() && (
              <span className="small">Ohne „bis“ rechnet der Kalender mit {terminIntervallMin || STANDARD_DAUER_MIN} Minuten und zeichnet die Unterkante gestrichelt.</span>
            )}
            {zeitFehlt && (
              <div className="hinweis-pflicht">
                Ohne Uhrzeit lässt sich der Auftrag nicht speichern. Wird sie jetzt nicht
                festgehalten, muss der Kunde später noch einmal angerufen werden.
              </div>
            )}

            <span className="op-gruppe-titel">MITARBEITER</span>
            {/* Die Einteilung bleibt beim Büro – `order_employees` lässt einen Techniker per RLS
                nur lesen (Migration 15). Wer sich selbst Aufträge zuteilen kann, teilt sich
                auch fremde zu. */}
            {isTechniker ? (
              <span className="small">{zugeteilt.map((e) => e.name).join(", ") || "– niemand zugeordnet –"} · die Einteilung macht das Büro</span>
            ) : employees.length === 0 ? (
              <span className="small">Noch keine Mitarbeiter angelegt (Admin → Mitarbeiter).</span>
            ) : (
              <div className="ao-wahl">
                {employees.map((m) => {
                  const an = mitarbeiterIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" className={"ao-wahl-chip" + (an ? " an" : "")} aria-pressed={an}
                      onClick={() => setMitarbeiterIds(an ? mitarbeiterIds.filter((x) => x !== m.id) : [...mitarbeiterIds, m.id])}>
                      <span className="ao-wahl-punkt" style={{ background: employeeColorFor(employees, m.id) }} />
                      {m.name}{an ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {doppeltMitarbeiter.length > 0 && (
              <div className="doppelbuchung" role="status">
                <b>Überschneidung:</b>
                <ul>{doppeltMitarbeiter.map((u) => <li key={`${u.auftrag.id}-${u.werId}`}>{doppeltText(u)}</li>)}</ul>
              </div>
            )}

            <span className="op-gruppe-titel">TRANSPORTER</span>
            {/* Techniker sehen die Einteilung, ändern dürfen sie sie nicht – das macht das Büro,
                und die Datenbank erzwingt es (Migration 32). */}
            {isTechniker ? (
              <span className="small">{firmenfahrzeugText(firmenfahrzeugId || null) || "– nicht eingeteilt –"}</span>
            ) : aktiveFirmenfahrzeuge.length === 0 && !firmenfahrzeugId ? (
              <span className="small">Es sind noch keine Transporter angelegt (Admin → Transporter).</span>
            ) : (
              <div className="ao-wahl">
                <button type="button" className={"ao-wahl-chip" + (!firmenfahrzeugId ? " an" : "")} aria-pressed={!firmenfahrzeugId} onClick={() => setFirmenfahrzeugId("")}>keiner</button>
                {aktiveFirmenfahrzeuge.map((f) => (
                  <button key={f.id} type="button" className={"ao-wahl-chip" + (firmenfahrzeugId === f.id ? " an" : "")} aria-pressed={firmenfahrzeugId === f.id} onClick={() => setFirmenfahrzeugId(f.id)}>
                    🚐 {firmenfahrzeugLabel(f)}
                  </button>
                ))}
                {/* Ein inzwischen ausgemustertes Fahrzeug bleibt sichtbar, solange es an diesem
                    Auftrag hängt – sonst verschwände die Angabe beim nächsten Speichern still. */}
                {firmenfahrzeugId && !aktiveFirmenfahrzeuge.some((f) => f.id === firmenfahrzeugId) && (
                  <button type="button" className="ao-wahl-chip an" aria-pressed>{firmenfahrzeugText(firmenfahrzeugId)} (ausgemustert)</button>
                )}
              </div>
            )}
            {doppeltFahrzeug.length > 0 && (
              <div className="doppelbuchung" role="status">
                <b>Überschneidung:</b>
                <ul>{doppeltFahrzeug.map((u) => <li key={u.auftrag.id}>{doppeltText(u)}</li>)}</ul>
              </div>
            )}
            <button type="button" className="am-knopf" disabled={speichert || zeitFehlt || endeVorAnfang} onClick={() => void terminUebernehmen()}>
              {speichert ? "Speichert …" : "Übernehmen"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Blatt: Menü */}
      {menueOffen && (
        <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); setMenueOffen(false); }}>
          <div className="auswahl-blatt ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Weitere Aktionen">
            <div className="ab-griff" />
            <div className="ab-titel">Auftrag #{auftragsNr(order.order_number)}</div>
            {menue.map((m) => (
              <button key={m.key} type="button" className={"ab-option ao-menue-punkt" + (m.gefahr ? " gefahr" : "")} disabled={m.aus} onClick={() => menueAktion(m.key)}>
                <span className="ab-text">
                  <b>{m.text}</b>
                  {m.info && <span className="small">{m.info}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Blatt: Altreifen */}
      {/* Der Ersatz für den Abschluss-Zwang aus Migration 22 (siehe Migration 46). Die
          Anwendung erinnert an das Wahrscheinliche, ohne den Ausnahmefall zu verbieten. Beide
          Wege führen weiter – nur einer davon führt sofort weiter. Eine Frage, keine Warnung:
          kein Rot. */}
      {altreifenFrage && (
        <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); setAltreifenFrage(false); }}>
          <div className="auswahl-blatt ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Altreifen">
            <div className="ab-griff" />
            <div className="ab-titel">Nimmt der Kunde die alten Reifen mit?</div>
            <span className="small">Auf diesem Auftrag steht eine Leistung, bei der alte Reifen anfallen – eingelagert ist aber nichts.</span>
            <button type="button" className="ab-option" onClick={() => { setAltreifenFrage(false); setEinlagerungOffen(true); }}>
              <span className="ab-text"><b>Nein – Reifen einlagern</b></span>
            </button>
            <button type="button" className="am-knopf gruen" onClick={async () => { setAltreifenFrage(false); await statusSetzen("erledigt"); }}>
              Ja, mitgenommen – abschließen
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Blatt: Stornieren */}
      {/* Zwei Handlungen brauchen eine Begründung. Statt eines Browser-Dialogs ein Blatt – der
          Auftrag, um den es geht, bleibt dahinter sichtbar. */}
      {stornoOffen && (
        <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); setStornoOffen(false); setStornoGrund(""); }}>
          <div className="auswahl-blatt ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Stornieren">
            <div className="ab-griff" />
            <div className="ab-titel">Auftrag #{auftragsNr(order.order_number)} stornieren</div>
            <span className="small">Der Auftrag bleibt in der Liste, grau und mit dem Grund.</span>
            <label className="nk-feld"><span>Warum wird der Auftrag storniert?</span>
              <input type="text" value={stornoGrund} onChange={(e) => setStornoGrund(e.target.value)} autoFocus />
            </label>
            <button
              type="button" className="am-knopf rot"
              disabled={!stornoGrund.trim()}
              onClick={async () => { await statusSetzen("storniert", { stornoGrund: stornoGrund.trim() }); setStornoOffen(false); }}
            >
              Stornierung bestätigen
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- Blatt: Wiedereröffnen */}
      {wiederOffen && (
        <div className="modal-overlay auswahl-overlay ao-blatt-overlay" onClick={(e) => { e.stopPropagation(); setWiederOffen(false); setWiederGrund(""); }}>
          <div className="auswahl-blatt ao-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Wiedereröffnen">
            <div className="ab-griff" />
            <div className="ab-titel">Auftrag #{auftragsNr(order.order_number)} wiedereröffnen</div>
            <label className="nk-feld"><span>Warum wird der Auftrag wiedereröffnet?</span>
              <input type="text" value={wiederGrund} onChange={(e) => setWiederGrund(e.target.value)} autoFocus />
            </label>
            <button
              type="button" className="am-knopf"
              disabled={!wiederGrund.trim()}
              onClick={async () => { await onSetStatus(order.id, "in_arbeit", { wiedereroeffnungsGrund: wiederGrund.trim() }); setWiederOffen(false); }}
            >
              Wiedereröffnen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

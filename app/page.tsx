"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type {
  Customer, ContactHistoryEntry, UserSettings,
  Warehouse, StorageSlot, TireStorage, Order, OrderStatus, Vehicle, Role, Profile, Employee,
  Article, ArticlePrice, ArtikelFelder, OrderArticle, KontaktErgebnis, Saison, Firmenfahrzeug,
  EingelagertesRad, Erfassungsart, RadPosition, AuftragFahrzeug, Rechnung,
} from "@/lib/types";
import {
  todayStr, formatDate, formatOrderDateTime, isOrderPast, nextOrder, orderDateTime,
  effectiveColor, kundenMitTermin, KUNDEN_ZUSTAND_LABEL, KUNDEN_ZUSTAND_REIHENFOLGE, type KundenZustand, telHref,
  plzAus, naechsteSaison, raederNachSatz, satzProfilMm, geocodeAddress,
  getPhoneNumbers, navigationUrls, istHandy,
  formatEUR, letzterSatzFuer, orderArticleTotals, terminTitel, terminZeitraum, currentArticlePrice,
} from "@/lib/helpers";
import { MAP_STYLES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, type MapStyleKey } from "@/lib/mapStyles";
import {
  KUNDEN_FILTER, type KundenFilter, TERMIN_FILTER, type TerminFilter,
  ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, RECHTE_VORGABE, KUNDE_PARAMETER, AUFTRAG_PARAMETER,
  ANRUF_PARAMETER, MITNEHMEN_PARAMETER, ABENDHINWEIS_UHRZEIT_STANDARD,
  PROFIL_KRITISCH_MM, STANDARD_DAUER_MIN,
  type Verb,
} from "@/lib/constants";
import { LAGERPLATZ_PARAMETER, SATZ_PARAMETER, lagerplatzIdAusCode } from "@/lib/aufkleberCode";
import { zielAbholen } from "@/lib/benachrichtigungZiel";
import { anrufAufsHandy } from "@/lib/push";
import { MitnehmenFenster } from "@/components/auftraege/MitnehmenFenster";
import { kundeZumAuftrag } from "@/lib/laufkunde";
import { AnrufFenster } from "@/components/kunden/AnrufFenster";
// Die Symbole der Navigation stehen jetzt in der Modulliste (lib/module.ts). Hier bleiben nur
// die, die außerhalb der Navigation gebraucht werden – Dashboard-Kacheln, Karten-Umschalter,
// Marke, Filter.
import {
  IconKunden, IconTermine, IconMap, IconLager, IconAuftraege, IconMore,
  IconNavPin, IconMarke, IconFilter, navPinSvgHtml,
} from "@/components/icons";
import { NavItem } from "@/components/NavItem";
import { MODULE, SEKUNDAERE_TABS, START_TAB, START_TAB_ERSATZ, type TabKey } from "@/lib/module";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { CustomerRowMeta } from "@/components/kunden/CustomerRowMeta";
import { OfflineHinweis, useIstOffline } from "@/components/OfflineHinweis";
import { datenSpeicherLeeren } from "@/app/providers";
import { AddCustomerForm } from "@/components/kunden/AddCustomerForm";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ArticleAdminPanel } from "@/components/admin/artikel/ArticleAdminPanel";
import { AuswertungPanel } from "@/components/auswertung/AuswertungPanel";
import { RechnungenPanel } from "@/components/rechnungen/RechnungenPanel";
import { RechnungModal } from "@/components/rechnungen/RechnungModal";
import { stelleRechnungAus, storniereRechnung } from "@/lib/api/rechnungen";
import type { RechnungEntwurf } from "@/lib/rechnung";
import { AuftragModal } from "@/components/auftraege/AuftragModal";
import { KontaktModal } from "@/components/kunden/KontaktModal";
import { DetailModal } from "@/components/kunden/DetailModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LagerPanel } from "@/components/lager/LagerPanel";
import { AuslagernDialog, type AuslagernWahl } from "@/components/lager/AuslagernDialog";
import { ReifensatzEtikett } from "@/components/lager/ReifensatzEtikett";
import { SaisonPanel, type SaisonZeile } from "@/components/lager/SaisonPanel";
import { AuftraegePanel } from "@/components/auftraege/AuftraegePanel";
import { EinsatzplanungPanel } from "@/components/einsatzplanung/EinsatzplanungPanel";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { insertEmployee, deleteEmployeeById, updateEmployeeProfileId } from "@/lib/api/employees";
import { insertVehicle, updateVehicleById, deleteVehicleById } from "@/lib/api/vehicles";
import {
  insertWarehouse, updateWarehouseById, deleteWarehouseById,
  insertStorageSlot, insertStorageSlotsBulk, deleteStorageSlotById,
  upsertTireAssignment, removeTireAssignmentById, updateTireStorageDetails,
  insertRad, updateRadById, deleteRadById, setErfassungsart, setAnzahlRaeder, type RadFelder,
} from "@/lib/api/lager";
import {
  insertArticle, updateArticleById, updateArticleNumberById, insertArticlePrice,
  updateArticlePrice as updateArticlePriceApi, deleteArticlePrice as deleteArticlePriceApi,
  insertOrderArticle, updateOrderArticleQtyById, updateOrderArticleEndpreisById, updateOrderArticleTextById, deleteOrderArticleById,
} from "@/lib/api/articles";
import {
  replaceOrderEmployees,
  insertOrder, updateOrderById, updateOrderTermin, updateOrderStatusById, updateOrderTechnikerNotiz, deleteOrderById,
  updateOrderFirmenfahrzeug,
  AUFTRAGSFENSTER_LABEL, type AuftragsFenster,
} from "@/lib/api/orders";
import {
  markCustomerContacted, markCustomerOpen, setWiedervorlageBulk,
  setCustomerActive, deleteCustomerRow, updateCustomerFieldsById, insertCustomer,
  setzePositionVonHand, positionNeuSuchen,
} from "@/lib/api/customers";
import { upsertModulePermissions, type Bereichsrechte } from "@/lib/api/permissions";
import { fetchAuftragFahrzeuge, addAuftragFahrzeug, setKilometerstand, removeAuftragFahrzeug } from "@/lib/api/auftragFahrzeuge";
import {
  insertFirmenfahrzeug, updateFirmenfahrzeugById, firmenfahrzeugAusmustern,
  type FirmenfahrzeugFelder,
} from "@/lib/api/firmenfahrzeuge";
import { fetchOwnRole, fetchOrCreateUserSettings, updateUserSettings } from "@/lib/api/session";
import { fetchBetrieb } from "@/lib/api/betrieb";
import { qk } from "@/lib/queries/keys";
import {
  useKunden, useAuftraege, useKundenAuftraege, useKundeFahrzeuge, useKundeHistorie,
  useMitarbeiter, useArtikel, useArtikelpreise, useBetrieb, useRechnungen, useAuftragRechnungen,
  useLager, useLagerplaetze, useEinlagerungen, useLagerKennzahlen, useModulrechte, useFahrzeuge,
  useFirmenfahrzeuge, useEingelagerteRaeder,
} from "@/lib/queries/hooks";

// Stabile leere Listen: `?? []` würde bei jedem Rendern ein neues Array erzeugen und damit
// Effekte auslösen, die eigentlich nur auf echte Datenänderungen reagieren sollen.
const KEINE_KUNDEN: Customer[] = [];
const KEINE_AUFTRAEGE: Order[] = [];
const KEINE_MITARBEITER: Employee[] = [];
const KEINE_ARTIKEL: Article[] = [];
const KEINE_ARTIKELPREISE: ArticlePrice[] = [];
const KEINE_POSITIONEN: OrderArticle[] = [];
const KEINE_LAGER: Warehouse[] = [];
const KEINE_LAGERPLAETZE: StorageSlot[] = [];
const KEINE_EINLAGERUNGEN: TireStorage[] = [];
const KEINE_FAHRZEUGE: Vehicle[] = [];
const KEINE_FIRMENFAHRZEUGE: Firmenfahrzeug[] = [];
const KEINE_RAEDER: EingelagertesRad[] = [];
const KEINE_HISTORIE: ContactHistoryEntry[] = [];
const KEINE_RECHNUNGEN: Rechnung[] = [];
const KEINE_ZUORDNUNGEN: Record<string, Bereichsrechte> = {};

// Höchstzahl gleichzeitig gezeichneter Kartenmarker. Leaflet legt je Marker ein DOM-Element an;
// bei mehreren tausend Kunden im Bild wird das Zoomen und Verschieben spürbar zäh. Es werden
// ohnehin nur Marker im sichtbaren Ausschnitt gezeichnet – diese Grenze fängt den Fall ab, dass
// jemand ganz herauszoomt.
const MAX_MARKER = 600;

// Farben der Kartenmarker je Kundenzustand. Sie stehen hier und nicht als CSS-Variable, weil
// der Marker als HTML-Zeichenkette in einem Leaflet-divIcon entsteht – dort greift kein
// Stylesheet der App. Die Werte entsprechen den Tokens --green / --blau / --red aus
// globals.css; wer sie dort ändert, ändert sie hier mit (siehe docs/konstanten-register.md).
//
// Die Wiedervorlage war bis zum 14.09.2026 orange (--accent, #FF5A1F). Auf einer vollen Karte
// war sie damit von Rot kaum zu unterscheiden: Beides sind warme Töne ähnlicher Helligkeit,
// und bei zwanzig Nadeln nebeneinander zählt nicht der Farbwert, sondern ob sich zwei Gruppen
// noch trennen lassen. Hellblau ist der einzige Ton, der von Rot UND Grün sichtbar wegbleibt –
// und er sagt nebenbei das Richtige: kühl, geplant, nicht dringend. Rot soll die Karte
// beherrschen, denn Rot ist das, was heute zu tun ist.
//
// Der Termin (17.09.2026) bekommt das dunkle Navy der Marke statt eines fünften bunten Tons.
// Hellblau und Dunkelblau sagen zusammen dasselbe – kühl, geplant, nicht dringend – und
// trennen sich durch HELLIGKEIT, nicht durch Farbton: Das bleibt auch dann lesbar, wenn Farben
// schlecht unterschieden werden, und es nimmt Rot nichts weg. Ein fünfter warmer Ton hätte
// genau das getan.
// „kein Interesse" und „Laufkundschaft" fehlen hier mit Absicht: Der erste bekommt eine eigene,
// hohle Nadel (siehe unten), die zweite hat keine Anschrift und damit nie eine Position.
const MARKER_FARBE: Record<Exclude<KundenZustand, "kein-interesse" | "laufkundschaft" | "einmalkunde">, string> = {
  green: "#2f9e5c",
  termin: "#1E3A5F",
  wiedervorlage: "#4FA8DC",
  red: "#e0483f",
};

// Wie viele Kundenzeilen auf einmal gezeichnet werden. Die Suche filtert weiterhin über den
// gesamten Bestand – begrenzt ist nur, wie viele Treffer gleichzeitig im Dokument stehen.
// Ohne diese Grenze legt der Browser bei ~4500 Kunden ebenso viele Zeilen an, was das Scrollen
// und jedes Tippen im Suchfeld spürbar verzögert.
const LISTEN_SCHRITT = 200;

// TabKey und die Modulliste stehen in lib/module.ts – EINE Liste für Seitenleiste und
// Kachelseite „Weitere" (siehe dort, warum).

// Ein aus dem Kalender angeklickter Zeitpunkt. `von`/`bis` sind null, wenn in die Leiste
// „ohne Uhrzeit" geklickt wurde – dann steht nur der Tag fest.
type NeuerTermin = { datum: string; von: string | null; bis: string | null };

// Beschriftung eines gemerkten Termins. Steht hier und nicht in der Komponente, weil sie an
// zwei Stellen gebraucht wird und beide dasselbe sagen müssen.
function terminTextVon(termin: NeuerTermin | null): string | undefined {
  if (!termin) return undefined;
  const tag = new Date(termin.datum + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "short", day: "numeric", month: "numeric", year: "numeric",
  });
  return termin.von ? `${tag}, ${termin.von}–${termin.bis}` : `${tag}, ohne Uhrzeit`;
}

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  // Erst wenn die Anmeldung geprüft und die eigene Rolle geladen ist, dürfen die Datenabfragen
  // starten. Vor Roadmap-Phase 10 ergab sich das von selbst, weil alles Laden nacheinander in
  // einem einzigen Effekt lief; seit die Abfragen eigenständig sind, müssen sie ausdrücklich
  // warten. Sonst überholen sie den Sitzungsstart und gehen mit einem abgelaufenen Token
  // hinaus – Supabase antwortet dann mit 401, während im Hintergrund gerade ein frisches Token
  // geholt wird.
  const [sitzungBereit, setSitzungBereit] = useState(false);
  // Zentrale Fehleranzeige (Roadmap Phase 9). Vorher verschluckte lib/api jeden Fehler:
  // eine abgelehnte Schreiboperation verschwand spurlos und der Nutzer sah nur, wie seine
  // Eingabe wieder verschwand.
  const [fehler, setFehler] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [myRole, setMyRole] = useState<Role>("user");
  const [userEmail, setUserEmail] = useState("");
  // Startet in der Einsatzplanung (START_TAB in lib/module.ts), nicht mehr im Dashboard.
  const [tab, setTab] = useState<TabKey>(START_TAB);
  // Vollseiten-Module: hier ergibt die Karte keinen Sinn, der Inhalt bekommt die volle Breite.
  // Weit oben berechnet (statt erst kurz vor dem Rendern), damit ein Effekt weiter unten, der
  // beim Wechsel zwischen Vollseiten- und normalem Tab einen Reflow erzwingt, sich problemlos
  // darauf verlassen kann (Hooks dürfen nicht erst nach einem bedingten Return kommen).
  const fullPageTabs = tab === "lager" || tab === "einsatzplanung" || tab === "admin" || tab === "auftraege" || tab === "artikel" || tab === "auswertung" || tab === "rechnungen";
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (Migration 13), die
  // Oberfläche blendet zusätzlich Anlegen/Löschen/Mitarbeiter- und Leistungen-Zuordnung aus –
  // siehe AuftraegePanel/EinsatzplanungPanel.
  const isTechniker = myRole === "techniker";


  // Die Datenbestände liegen seit Roadmap-Phase 10 nicht mehr als useState hier, sondern in
  // Abfragen (siehe weiter unten beim "selectedId"-Block und in lib/queries/hooks.ts).
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "", period_months: 3, map_style: "strasse", row_display: "datum",
    abendhinweis_aktiv: true, abendhinweis_uhrzeit: ABENDHINWEIS_UHRZEIT_STANDARD,
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KundenFilter>("all");
  const [plzFilter, setPlzFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  // Zeitraum des Termine-Reiters. Steuert Liste UND Kartennadeln – siehe terminKundenIds.
  const [terminFilter, setTerminFilter] = useState<TerminFilter>("anstehend");

  // Welche Zustände auf der Karte zu sehen sind, dazu der Auf-/Zu-Zustand des Schalters oben
  // rechts auf der Karte. Bewusst nur Sitzungszustand und NICHT in den Einstellungen: das ist
  // eine Ansichtssache für den Moment ("zeig mir nur die offenen"), keine Grundeinstellung.
  // Nach einem Neuladen ist wieder alles sichtbar – ein vergessener Filter kann so nicht
  // dauerhaft Kunden verstecken, die man später vermisst.
  const [sichtbareZustaende, setSichtbareZustaende] = useState<KundenZustand[]>(
    () => [...KUNDEN_ZUSTAND_REIHENFOLGE]
  );
  const [kartenFilterOffen, setKartenFilterOffen] = useState(false);
  // Das Terminraster gilt für den ganzen Betrieb (Migration 38). Bis es geladen ist, steht
  // die Voreinstellung aus den Konstanten – sie ist dieselbe wie in der Datenbank, damit
  // niemand in der ersten Sekunde eine andere Dauer vorgeschlagen bekommt.
  const [terminIntervall, setTerminIntervall] = useState(STANDARD_DAUER_MIN);

  // Erste Quelle für "kein Netz": die Angabe des Browsers. Sie allein reicht nicht – siehe
  // die Ableitung von `istOffline` weiter unten, sobald die Kundenabfrage bekannt ist.
  const offlineLautBrowser = useIstOffline();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Der gerade geöffnete Auftrag (Migration 20, docs/auftragsablauf.md). Er ersetzt das frühere
  // Leistungen-Popover: dort war für die Positionserfassung schlicht kein Platz.
  //
  // Steht bewusst HIER und nicht weiter unten bei den Popover-Zuständen: die Ableitung
  // `offenerAuftrag` weiter unten liest ihn, und eine Deklaration danach wäre ein Zugriff vor
  // der Initialisierung. TypeScript kann das nicht sehen, weil der Zugriff in einem
  // find()-Callback steckt – zur Laufzeit wirft es.
  const [offenerAuftragId, setOffenerAuftragId] = useState<string | null>(null);
  // Abendhinweis „Reifen mitnehmen" (Migration 55): Für welchen Tag ist die Mitnehmen-Liste
  // offen? Null = zu. Gesetzt über `?mitnehmen=YYYY-MM-DD` aus der angetippten Meldung.
  const [mitnehmenDatum, setMitnehmenDatum] = useState<string | null>(null);
  // Zu welchem Auftrag das Rechnungsfenster offen ist. Eigener Zustand und nicht ein Schalter
  // im Auftragsfenster: Die Rechnungsliste öffnet dasselbe Fenster, ohne dass ein Auftrag
  // geöffnet sein muss.
  const [rechnungAuftragId, setRechnungAuftragId] = useState<string | null>(null);
  // Auftrag, der gerade eben neu angelegt wurde. Nur für die Anzeige: das Auftragsfenster weist
  // dann darauf hin, dass es sich um einen frischen Auftrag handelt, und bietet "Verwerfen"
  // statt des Löschknopfs an.
  //
  // Warum überhaupt: "+ Auftrag anlegen" im Karten-Popup legt die Zeile SOFORT an und öffnet
  // direkt das vollständige Auftragsfenster – kein Zwischenformular mehr. Das ist keine
  // Bequemlichkeit, sondern eine Notwendigkeit: Leistungen und Positionen hängen an einer
  // Auftrags-Id, es kann sie ohne eine gespeicherte Zeile gar nicht geben. Ein Formular, das
  // erst beim Absenden schreibt, könnte den wichtigsten Teil des Fensters nicht anbieten.
  // Siehe docs/termine-kontakt-auftrag-analyse.md.
  const [frischerAuftragId, setFrischerAuftragId] = useState<string | null>(null);
  // Ein im Kalender angeklickter Termin, der auf einen Kunden wartet, den es noch nicht gibt.
  // Er überlebt den Wechsel in das Kundenformular und wird nach dem Anlegen eingesetzt.
  const [terminFuerNeuenKunden, setTerminFuerNeuenKunden] = useState<NeuerTermin | null>(null);
  // Lagerplatz aus einem gescannten QR-Aufkleber (?lagerplatz=…, siehe lib/aufkleberCode.ts).
  // Wird beim Start einmal aus der Adresszeile gelesen und danach an das Lager-Modul gereicht.
  const [gescannterLagerplatzId, setGescannterLagerplatzId] = useState<string | null>(null);
  // Reifensatz aus einem gescannten Satz-Etikett (?satz=…). Anders als beim Lagerplatz steht
  // hier NICHT das Ziel im Code: Wo der Satz liegt, wird nachgeschlagen – er wandert ja. Deshalb
  // kann die Auflösung auch nicht beim Start passieren, der Bestand ist da noch nicht geladen.
  const [gescannterSatzId, setGescannterSatzId] = useState<string | null>(null);
  // Kunde, für den der Kontaktdialog offen ist (Migration 23).
  const [kontaktKundeId, setKontaktKundeId] = useState<string | null>(null);
  // Saisonliste (docs/lager-ausbaukonzept.md D1). Die Voreinstellung folgt dem Jahreslauf:
  // im Herbst die Winterliste, im Frühjahr die Sommerliste – wer die Liste öffnet, sieht
  // meistens sofort die richtige.
  const [saisonFilter, setSaisonFilter] = useState<Saison | "alle">(() => naechsteSaison());
  const [saisonPlz, setSaisonPlz] = useState("");
  const [saisonNurFaellige, setSaisonNurFaellige] = useState(false);
  // „Nur mit schwachem Profil" – der Filter, der aus der Anrufliste eine Verkaufsliste macht
  // (docs/lager-ausbaukonzept.md, D2/D3).
  const [saisonNurSchwach, setSaisonNurSchwach] = useState(false);
  // „Punkt setzen": Für welchen Kunden warten wir gerade auf einen Klick in die Karte?
  // (Migration 35). Der Leaflet-Klickhandler wird EINMAL angemeldet und liest den aktuellen
  // Wert über das Ref – ein Handler, der eine React-Zustandsvariable einfängt, sähe für immer
  // den Wert von seiner Anmeldung.
  const [positionSetzenFuer, setPositionSetzenFuer] = useState<string | null>(null);
  const positionSetzenRef = useRef<string | null>(null);
  positionSetzenRef.current = positionSetzenFuer;
  // Wohin die Karte springen soll, sobald sie sichtbar ist. Als Zustand und nicht als direkter
  // setView-Aufruf, weil die Karte beim Reiterwechsel erst eine Größe bekommen muss – ein
  // setView auf eine 0 Pixel breite Karte landet nirgends.
  const [positionSetzenZiel, setPositionSetzenZiel] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [positionSetzenSucht, setPositionSetzenSucht] = useState(false);
  // Welche Nadel ist gerade hervorgehoben? Als Ref und nicht als Zustand: Beim Überfahren der
  // Kundenliste soll NICHT die ganze Seite neu gezeichnet werden – es wird nur eine Klasse an
  // einem einzigen Kartenelement gesetzt. Bei 400 Zeilen ist das der Unterschied zwischen
  // „reagiert sofort" und „hakt".
  const hervorgehobeneNadelRef = useRef<string | null>(null);
  const [saisonSchreibt, setSaisonSchreibt] = useState(false);

  // ---------------------------------------------------------------- Daten (Roadmap Phase 10)
  //
  // Vorher lud diese Komponente beim Start zwölf Tabellen vollständig und nacheinander, bevor
  // überhaupt etwas zu sehen war – und nach jeder Änderung die betroffene Tabelle komplett neu.
  // Jetzt hängt jeder Bestand an einer Abfrage, die erst lädt, wenn er gebraucht wird, danach
  // zwischengespeichert bleibt und nach einer Änderung gezielt für ungültig erklärt wird.
  //
  // Was die Oberfläche sieht, bleibt gleich: `customers`, `orders`, `employees` … sind weiterhin
  // schlichte Arrays mit denselben Namen, deshalb ändert sich an den Panels nichts.
  const queryClient = useQueryClient();
  const [auftragsFenster, setAuftragsFenster] = useState<AuftragsFenster>("aktuell");

  // Kunden und das Auftragsfenster stecken in Karte, Dashboard und fast jeder Liste – die erst
  // beim Tabwechsel zu holen würde nur flackern, ohne etwas zu sparen. Alles andere kommt beim
  // Öffnen des jeweiligen Moduls bzw. des Kundendetails.
  const kundeOffen = selectedId !== null;
  const brauchtMitarbeiter = tab === "auftraege" || tab === "einsatzplanung" || tab === "admin" || tab === "add" || tab === "auswertung" || kundeOffen;
  const brauchtArtikel = tab === "artikel" || tab === "auftraege" || tab === "einsatzplanung" || tab === "auswertung" || kundeOffen;
  // Das Auftragsfenster zeigt seit Migration 22 einen Einlagerungs-Block und braucht dafür
  // Lagerplätze, Lager und Einlagerungen – auch dann, wenn es aus dem Aufträge-Tab heraus
  // geöffnet wurde und gar kein Kundendetail offen ist.
  const brauchtLager = tab === "lager" || tab === "saison" || tab === "dashboard" || kundeOffen || offenerAuftragId !== null || mitnehmenDatum !== null;

  const kundenQuery = useKunden(supabase, sitzungBereit);
  // "Kein Netz" aus DREI Quellen, weil keine für sich zuverlässig ist:
  //
  //  1. `navigator.onLine` – meldet auf iOS auch im Flugmodus gelegentlich weiterhin "online".
  //     Verlässt man sich allein darauf, bleibt der Hinweis genau dort aus, wo er gebraucht
  //     wird. (Gemeldet am 09.09.2026: Flugmodus an, Balken kam nicht.)
  //  2. `fetchStatus === "paused"` – TanStack Query hält Abfragen an, wenn es selbst kein Netz
  //     sieht.
  //  3. `isError` – der Abruf ist tatsächlich gescheitert. Das ist der ehrlichste Beleg
  //     überhaupt: hier wurde es versucht und es kam nichts an.
  //
  // Sobald der Browser wieder "online" meldet, werden die Bestände neu geholt (Effekt weiter
  // unten) – sonst bliebe der Fehlerzustand aus Quelle 3 hängen, obwohl längst wieder Empfang
  // da ist.
  const istOffline =
    offlineLautBrowser || kundenQuery.fetchStatus === "paused" || kundenQuery.isError;
  const auftraegeQuery = useAuftraege(supabase, auftragsFenster, sitzungBereit);
  const mitarbeiterQuery = useMitarbeiter(supabase, sitzungBereit && brauchtMitarbeiter);
  const artikelQuery = useArtikel(supabase, sitzungBereit && brauchtArtikel);
  const artikelpreiseQuery = useArtikelpreise(supabase, sitzungBereit && brauchtArtikel);
  const lagerQuery = useLager(supabase, sitzungBereit && brauchtLager);
  const lagerplaetzeQuery = useLagerplaetze(supabase, sitzungBereit && brauchtLager);
  const einlagerungenQuery = useEinlagerungen(supabase, sitzungBereit && brauchtLager);
  // Die einzeln gemessenen Räder (Migration 33). Gleiche Bedingung wie die Einlagerungen –
  // sie gehören zusammen und werden nie getrennt gebraucht.
  const raederQuery = useEingelagerteRaeder(supabase, sitzungBereit && brauchtLager);
  // Alle Kundenfahrzeuge – nur fürs Lager-Modul. Dort steht kein einzelner Kunde im
  // Mittelpunkt, sondern viele Sätze nebeneinander, und jeder gehört zu einem Auto
  // (Migration 30).
  // Auch für die Artikelauswertung: „wie viel geht auf ein Fahrzeug" braucht die Kennzeichen
  // aller Fahrzeuge, nicht nur die des geöffneten Kunden.
  const alleFahrzeugeQuery = useFahrzeuge(supabase, sitzungBereit && (tab === "lager" || tab === "saison" || tab === "dashboard" || tab === "auswertung" || mitnehmenDatum !== null));
  // Die eigenen Transporter: kleine Stammdatenliste, gebraucht überall dort, wo ein Auftrag
  // gezeigt oder eingeteilt wird (Migration 32).
  const firmenfahrzeugeQuery = useFirmenfahrzeuge(
    supabase,
    sitzungBereit && (brauchtMitarbeiter || offenerAuftragId !== null)
  );
  const lagerKennzahlenQuery = useLagerKennzahlen(supabase, sitzungBereit && tab === "dashboard");
  const modulrechteQuery = useModulrechte(supabase, sitzungBereit);
  // Der Briefkopf. Gebraucht, sobald eine Rechnung entstehen oder gezeigt werden soll –
  // NICHT beim Start: Er steht in keiner Liste und in keiner Karte.
  const betriebQuery = useBetrieb(supabase, sitzungBereit && (tab === "rechnungen" || rechnungAuftragId !== null));
  // Bewusst ohne `canView()` als Bedingung: Die Rechteprüfung steht weiter unten im Bauteil,
  // und eine Abfrage, die eine noch nicht ausgewertete Konstante liest, läuft in die
  // temporale Totzone. Den Reiter erreicht ohnehin nur, wer ihn sehen darf – und was die
  // Datenbank nicht hergibt, gibt sie auch dieser Abfrage nicht.
  const rechnungenQuery = useRechnungen(supabase, sitzungBereit && tab === "rechnungen");
  const auftragRechnungenQuery = useAuftragRechnungen(supabase, rechnungAuftragId, sitzungBereit);
  const kundeFahrzeugeQuery = useKundeFahrzeuge(supabase, selectedId, sitzungBereit);
  const kundeAuftraegeQuery = useKundenAuftraege(supabase, selectedId, sitzungBereit);
  const historieQuery = useKundeHistorie(supabase, selectedId, sitzungBereit);

  // Für das Auftragsfenster werden die Fahrzeuge des zugehörigen Kunden gebraucht – im
  // Aufträge-Tab ist ja kein Kundendetail offen. Gleicher Abfrage-Schlüssel wie im
  // Kundendetail, der Zwischenspeicher wird also geteilt statt doppelt geladen.
  const offenerAuftrag =
    (auftraegeQuery.data?.orders ?? KEINE_AUFTRAEGE).find((o) => o.id === offenerAuftragId) ??
    (kundeAuftraegeQuery.data?.orders ?? KEINE_AUFTRAEGE).find((o) => o.id === offenerAuftragId);
  const auftragFahrzeugeQuery = useKundeFahrzeuge(supabase, offenerAuftrag?.customer_id ?? null, sitzungBereit);
  // Aus derselben Nachbarschaft wie `offenerAuftrag` und aus demselben Grund: die Ableitung
  // liest den Zustand, eine Deklaration danach wäre ein Zugriff vor der Initialisierung.
  const kontaktKunde = (kundenQuery.data ?? KEINE_KUNDEN).find((c) => c.id === kontaktKundeId);

  const customers = kundenQuery.data ?? KEINE_KUNDEN;
  const orders = auftraegeQuery.data?.orders ?? KEINE_AUFTRAEGE;
  const employees = mitarbeiterQuery.data ?? KEINE_MITARBEITER;
  // Welche Mitarbeiter in den FILTERLEISTEN von Auftragsliste und Einsatzplanung auftauchen.
  // Ein Techniker sieht dort nur sich selbst: Die Leiste ist sonst eine vollständige
  // Namensliste der Belegschaft, und die ist keine Auskunft, die er für seine Arbeit braucht.
  //
  // Bewusst NICHT mitgefiltert: die Mitarbeiterspalte an seinen EIGENEN Aufträgen. Steht er
  // mit einem Kollegen auf demselben Auftrag, soll er wissen, mit wem er hinfährt. Fremde
  // Aufträge sieht er ohnehin nicht (Migration 13, per Datenbank).
  //
  // Das ist eine Anzeigeregel, keine Absicherung: `employees` ist für jeden Eingeloggten
  // lesbar (bewusst, siehe Roadmap Phase 7 – der Techniker braucht Namen in seinen eigenen
  // Listen). Wer die API direkt anspricht, sieht die Tabelle weiterhin.
  const sichtbareMitarbeiter = isTechniker
    ? employees.filter((e) => e.profile_id && e.profile_id === settings.user_id)
    : employees;
  const articles = artikelQuery.data ?? KEINE_ARTIKEL;
  const articlePrices = artikelpreiseQuery.data ?? KEINE_ARTIKELPREISE;
  const warehouses = lagerQuery.data ?? KEINE_LAGER;
  const storageSlots = lagerplaetzeQuery.data ?? KEINE_LAGERPLAETZE;
  const tireStorages = einlagerungenQuery.data ?? KEINE_EINLAGERUNGEN;
  const eingelagerteRaeder = raederQuery.data ?? KEINE_RAEDER;
  const vehicles = kundeFahrzeugeQuery.data ?? KEINE_FAHRZEUGE;
  const alleFahrzeuge = alleFahrzeugeQuery.data ?? KEINE_FAHRZEUGE;
  const firmenfahrzeuge = firmenfahrzeugeQuery.data ?? KEINE_FIRMENFAHRZEUGE;
  const history = historieQuery.data ?? KEINE_HISTORIE;
  const modulePermissions = modulrechteQuery.data ?? KEINE_ZUORDNUNGEN;

  // Das Kundendetail zeigt die VOLLSTÄNDIGE Auftragshistorie eines Kunden, unabhängig vom
  // Zeitfenster der Listen – dort will man sehen, was es zu diesem Kunden je gab.
  const gewaehlterKunde = selectedId ? customers.find((c) => c.id === selectedId) : undefined;
  const kundeAuftraege = kundeAuftraegeQuery.data?.orders ?? KEINE_AUFTRAEGE;

  // Mitarbeiter- und Leistungszuordnungen kommen seit Phase 10 verschachtelt mit den Aufträgen
  // (statt als zwei eigene Vollabzüge). Beide Quellen – Zeitfenster und geöffneter Kunde –
  // werden hier zusammengeführt, damit Popover und Kundendetail dieselben Daten sehen.
  const orderEmployees = useMemo(
    () => ({ ...(auftraegeQuery.data?.orderEmployees ?? {}), ...(kundeAuftraegeQuery.data?.orderEmployees ?? {}) }),
    [auftraegeQuery.data, kundeAuftraegeQuery.data]
  );
  const orderArticles = useMemo(() => {
    const nachId = new Map<string, OrderArticle>();
    (auftraegeQuery.data?.orderArticles ?? KEINE_POSITIONEN).forEach((z) => nachId.set(z.id, z));
    (kundeAuftraegeQuery.data?.orderArticles ?? KEINE_POSITIONEN).forEach((z) => nachId.set(z.id, z));
    return Array.from(nachId.values());
  }, [auftraegeQuery.data, kundeAuftraegeQuery.data]);

  // Fehlgeschlagene Abfragen sichtbar machen. TanStack Query fängt Fehler intern ab und legt
  // sie an der Abfrage ab – sie werden also KEINE unbehandelte Promise-Ablehnung und liefen
  // damit an der zentralen Fehleranzeige aus Phase 9 vorbei. Ohne diese Zeilen bliebe ein
  // Panel bei einem Fehler einfach leer, ohne jeden Hinweis: genau die Sorte stiller Fehler,
  // die Phase 9 abstellen sollte.
  const abfrageFehler =
    kundenQuery.error || auftraegeQuery.error || modulrechteQuery.error ||
    mitarbeiterQuery.error || artikelQuery.error || artikelpreiseQuery.error ||
    lagerQuery.error || lagerplaetzeQuery.error || einlagerungenQuery.error ||
    lagerKennzahlenQuery.error || kundeFahrzeugeQuery.error || kundeAuftraegeQuery.error ||
    historieQuery.error;
  useEffect(() => {
    if (abfrageFehler) setFehler(abfrageFehler.message || "Daten konnten nicht geladen werden.");
  }, [abfrageFehler]);

  // Nach einer Änderung gezielt die betroffenen Bestände nachladen lassen – nicht mehr pauschal
  // die ganze Tabelle wie vor Phase 10.
  // Gibt ein Versprechen zurück, das erst hält, wenn die betroffenen Bestände WIRKLICH neu
  // geladen sind. Vorher stand hier `void queryClient.invalidateQueries(...)` – ein
  // `await refreshOrders()` kehrte also sofort zurück, während die Abfrage noch lief. Das fiel
  // erst auf, als ein neu angelegter Auftrag direkt geöffnet werden sollte: die Zeile war in
  // der Datenbank, im Zwischenspeicher aber noch nicht, das Auftragsfenster fand nichts und
  // blieb zu. Wer den Rückgabewert nicht abwartet, bekommt wie bisher ein "nebenher".
  function neuLaden(...schluessel: readonly (readonly unknown[])[]): Promise<void> {
    return Promise.all(
      schluessel.map((key) => queryClient.invalidateQueries({ queryKey: key }))
    ).then(() => undefined);
  }
  // Auftragsdaten hängen an zwei Stellen: am Zeitfenster (Listen, Karte, Kalender) und an der
  // vollständigen Historie des gerade geöffneten Kunden.
  function auftraegeNeuLaden(): Promise<void> {
    return neuLaden(...(selectedId ? [qk.auftraegeAlle(), qk.kundeAuftraege(selectedId)] : [qk.auftraegeAlle()]));
  }

  const [mobileMapVisible, setMobileMapVisible] = useState(false);
  // Wie viele Kunden im aktuellen Ausschnitt nicht gezeichnet wurden, weil die Marker-Grenze
  // erreicht war – daraus wird der Hinweis auf der Karte gespeist.
  const [ausgelasseneMarker, setAusgelasseneMarker] = useState(0);
  // Wie viele Kundenzeilen gerade gezeichnet werden dürfen (siehe LISTEN_SCHRITT).
  const [listenGrenze, setListenGrenze] = useState(LISTEN_SCHRITT);
  const [callMenuFor, setCallMenuFor] = useState<Customer | null>(null);
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Rückmeldung des Knopfes „Auf dem Handy anrufen" – erscheint im selben kleinen Menü, in dem
  // geklickt wurde. Ein Versand ohne sichtbare Antwort wäre schlimmer als gar keiner: Man
  // wüsste nicht, ob man aufs Handy schauen soll.
  const [handyMeldung, setHandyMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  // Kunde, dessen Anruf-Fenster offen ist (nach dem Antippen einer Anruf-Meldung).
  const [anrufKundeId, setAnrufKundeId] = useState<string | null>(null);
  // Navigations-Button (Auftrag/Termin, wenn eine Adresse gepflegt ist): am Smartphone erst
  // fragen, ob mit Google Maps oder Apple Karten navigiert werden soll, statt direkt zu öffnen –
  // genau wie beim Anrufen-Button mit mehreren Nummern.
  const [navMenuFor, setNavMenuFor] = useState<Customer | null>(null);
  const [navMenuPos, setNavMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Mitarbeiter-Zuordnung eines Auftrags (Aufträge-Tab & Einsatzplanung): Klick auf die
  // Mitarbeiter-Zelle öffnet ein kleines Menü mit Checkboxen (mehrere Mitarbeiter möglich), jeder
  // Klick speichert sofort – kein separater "Speichern"-Button, wie beim Modul-Berechtigungen-Raster.
  const [empMenuFor, setEmpMenuFor] = useState<{ orderId: string; ids: string[] } | null>(null);
  const [empMenuPos, setEmpMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const appRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const markerIndexRef = useRef<Record<string, any>>({});
  const baseLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  // Leaflet wird seit Roadmap-Phase 8 als npm-Paket dynamisch geladen (vorher ein <script>
  // von cdnjs ohne integrity-Attribut, siehe app/layout.tsx). Das Modul liegt hier statt in
  // window.L – bewusst als any typisiert, weil der Kartenstil-Schalter mit L.Control.extend
  // arbeitet; eine vollständige Typisierung der Karte ist ein eigener Schritt.
  const leafletRef = useRef<any>(null);

  // Aktuelle Daten/Handler als Ref, damit Leaflet-Popup-Callbacks (die außerhalb
  // des React-Renderzyklus leben) nie mit veralteten Closures arbeiten.
  const liveRef = useRef({ customers, orders, settings, sichtbareZustaende });
  liveRef.current = { customers, orders, settings, sichtbareZustaende };
  // Getrennt von liveRef, weil die Menge erst weiter unten entsteht (sie hängt an den
  // gefilterten Terminen) – und syncMarkers läuft außerhalb des React-Renderzyklus.
  const terminKundenRef = useRef<Set<string> | null>(null);
  const saveSettingsRef = useRef<(patch: Partial<UserSettings>) => Promise<void>>(async () => {});

  // Jede Funktion in lib/api wirft bei einem Supabase-Fehler eine ApiError (siehe
  // lib/api/client.ts). Bricht ein Klick-Handler dadurch ab, landet das als unbehandelte
  // Promise-Ablehnung hier – eine einzige Stelle statt einer Fehlerbehandlung an ~60
  // Aufrufstellen. Nebeneffekt, der so gewollt ist: das refreshX() nach dem fehlgeschlagenen
  // Schreibvorgang läuft nicht mehr, die Eingabe des Nutzers bleibt also stehen.
  useEffect(() => {
    let abgebrochen = false;
    fetchBetrieb(supabase)
      .then((b) => { if (!abgebrochen && b) setTerminIntervall(b.termin_intervall_min); })
      // Ohne Betriebseinstellung läuft alles weiter, nur mit der Voreinstellung. Ein
      // Fehlerband dafür wäre unverhältnismäßig.
      .catch(() => undefined);
    return () => { abgebrochen = true; };
  }, [supabase]);

  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      const grund = e.reason as { message?: string } | undefined;
      setFehler(grund?.message || "Es ist ein unerwarteter Fehler aufgetreten.");
      e.preventDefault();
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  // Die Karte an den Startpunkt schieben – erst NACH dem Rendern, weil sie beim Wechsel von
  // einem Vollseiten-Reiter gerade erst eine Breite bekommt. invalidateSize() sagt Leaflet,
  // dass es sich neu vermessen soll; ohne das rechnet es mit der alten Größe (oder mit 0) und
  // der Ausschnitt sitzt daneben.
  useEffect(() => {
    if (!positionSetzenZiel) return;
    const t = setTimeout(() => {
      const karte = mapRef.current;
      if (!karte) return;
      karte.invalidateSize();
      karte.setView([positionSetzenZiel.lat, positionSetzenZiel.lng], positionSetzenZiel.zoom);
    }, 150);
    return () => clearTimeout(t);
  }, [positionSetzenZiel]);

  // Nach jeder Änderung an Suche oder Filtern wieder von vorn zählen: sonst würde eine zuvor
  // aufgeklappte lange Liste eine neue, kurze Trefferliste unnötig groß halten.
  useEffect(() => {
    setListenGrenze(LISTEN_SCHRITT);
  }, [search, filter, plzFilter, letterFilter]);

  // Meldung nach einer Weile von selbst ausblenden – sie ist ein Hinweis, kein Dialog.
  useEffect(() => {
    if (!fehler) return;
    const t = setTimeout(() => setFehler(null), 9000);
    return () => clearTimeout(t);
  }, [fehler]);

  // ---------------------------------------------------------------- Initial-Load
  useEffect(() => {
    (async () => {
      // `getUser()` fragt beim Server nach und schlägt ohne Netz fehl. Genau dann darf die
      // Anwendung NICHT zur Anmeldeseite springen: die ist ohne Netz nicht bedienbar, und der
      // Techniker in der Tiefgarage stünde vor einer Anmeldemaske, die er nicht ausfüllen
      // kann. `getSession()` liest die gespeicherte Sitzung ohne Netzzugriff – reicht, um zu
      // wissen, WER angemeldet ist, und mehr braucht es offline nicht. Die Datenbank prüft
      // die Berechtigung ohnehin bei jedem Schreibzugriff selbst (Row-Level-Security).
      let user = null;
      try {
        user = (await supabase.auth.getUser()).data.user ?? null;
      } catch { /* kein Netz – unten weiter über die gespeicherte Sitzung */ }
      if (!user) {
        try {
          user = (await supabase.auth.getSession()).data.session?.user ?? null;
        } catch { /* auch das kann ohne Netz fehlschlagen */ }
      }
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      // Rolle und Einstellungen kommen aus der Datenbank und fehlen deshalb ohne Netz. Das
      // darf den Start nicht aufhalten: ohne Rolle gilt die geringste Berechtigung, für die
      // Einstellungen greifen die Voreinstellungen. Beides wird beim nächsten Start mit Netz
      // wieder richtig geladen.
      try {
        const role = await fetchOwnRole(supabase, user.id);
        setIsAdmin(role === "admin" || role === "superadmin");
        setIsSuperAdmin(role === "superadmin");
        if (role) setMyRole(role);

        const settingsRow = await fetchOrCreateUserSettings(supabase, user.id);
        if (settingsRow) setSettings(settingsRow);
      } catch (e) {
        if (typeof navigator !== "undefined" && navigator.onLine) throw e;
      }

      // Ab hier ist das Zugriffstoken frisch – jetzt dürfen die Datenabfragen loslaufen.
      // Auch offline: die Abfragen holen dann nichts, liefern aber den gespeicherten Stand.
      setSitzungBereit(true);

      // Ab hier nichts mehr laden: die Datenbestände hängen an den Abfragen weiter oben und
      // kommen nach und nach an, während die Oberfläche schon steht (Roadmap Phase 10). Vorher
      // wartete der Nutzer hier auf zwölf vollständige Tabellen, bevor er überhaupt etwas sah.
    })()
      .catch((e: { message?: string }) => {
        setFehler(e?.message || "Die Anmeldedaten konnten nicht geladen werden.");
      })
      // Auch im Fehlerfall aus dem Ladezustand herausgehen: mit einer sichtbaren Meldung kommt
      // man weiter als mit einem "Lädt…", das nie verschwindet.
      .finally(() => setLoading(false));
  }, []);

  // Die refreshX()-Funktionen heißen weiter so, holen aber nichts mehr selbst: sie erklären den
  // betroffenen Bestand für ungültig, und nachgeladen wird genau das, was gerade auf dem
  // Bildschirm gebraucht wird. Dadurch konnten alle CRUD-Funktionen darunter unverändert
  // bleiben – ein Häkchen im Mitarbeiter-Popover zieht keinen Vollabzug mehr nach sich.
  async function refreshCustomers() {
    neuLaden(qk.kunden());
  }
  async function refreshEmployees() {
    neuLaden(qk.mitarbeiter());
  }
  async function refreshWarehouses() {
    neuLaden(qk.lager(), qk.lagerKennzahlen());
  }
  async function refreshStorageSlots() {
    neuLaden(qk.lagerplaetze(), qk.lagerKennzahlen());
  }
  async function refreshTireStorages() {
    neuLaden(qk.einlagerungen(), qk.lagerKennzahlen());
  }
  async function refreshOrders() {
    await auftraegeNeuLaden();
  }
  async function refreshOrderEmployees() {
    // Zuordnungen kommen mit den Aufträgen verschachtelt – derselbe Bestand.
    auftraegeNeuLaden();
  }
  // Ersetzt die komplette Mitarbeiter-Zuordnung eines Auftrags.
  async function setOrderEmployees(orderId: string, employeeIds: string[]) {
    await replaceOrderEmployees(supabase, orderId, employeeIds);
    await refreshOrderEmployees();
  }
  // ---------------------------------------------------------------- Artikelstammdaten
  async function refreshArticles() {
    neuLaden(qk.artikel());
  }
  async function refreshArticlePrices() {
    neuLaden(qk.artikelpreise());
  }
  async function refreshOrderArticles() {
    // Auftragspositionen kommen mit den Aufträgen verschachtelt – derselbe Bestand.
    auftraegeNeuLaden();
  }
  async function addArticle(shortName: string, longName: string) {
    await insertArticle(supabase, shortName, longName);
    await refreshArticles();
  }
  async function updateArticle(id: string, fields: ArtikelFelder) {
    await updateArticleById(supabase, id, fields);
    await refreshArticles();
  }
  async function updateArticleNumber(id: string, articleNumber: number) {
    const { error } = await updateArticleNumberById(supabase, id, articleNumber);
    // Eine doppelte Artikelnummer ist ein erwarteter Bedienfehler, keine Störung – deshalb
    // meldet updateArticleNumberById sie als Rückgabewert statt als Ausnahme.
    if (error) setFehler(error);
    await refreshArticles();
  }
  async function addArticlePrice(articleId: string, netPrice: number, vatRate: number, validFrom: string) {
    await insertArticlePrice(supabase, articlePrices, articleId, netPrice, vatRate, validFrom);
    await refreshArticlePrices();
  }
  // Korrektur einer bestehenden Preiszeile (Tippfehler). Ein abgelehnter Zeitraum ist ein
  // Bedienfehler und kommt als Text zurück an die Eingabemaske – nicht als Störungsmeldung.
  async function updateArticlePrice(priceId: string, netPrice: number, vatRate: number, validFrom: string, validTo: string | null): Promise<string | null> {
    const { error } = await updateArticlePriceApi(supabase, articlePrices, priceId, netPrice, vatRate, validFrom, validTo);
    if (error) return error;
    await refreshArticlePrices();
    return null;
  }
  async function deleteArticlePrice(priceId: string) {
    await deleteArticlePriceApi(supabase, articlePrices, priceId);
    await refreshArticlePrices();
  }
  async function addOrderArticle(orderId: string, articleId: string, quantity: number, endpreisNetto: number | null, text: string | null) {
    await insertOrderArticle(supabase, articlePrices, orderId, articleId, quantity, endpreisNetto, text);
    await refreshOrderArticles();
  }
  async function updateOrderArticleQty(id: string, quantity: number) {
    await updateOrderArticleQtyById(supabase, id, quantity);
    await refreshOrderArticles();
  }
  async function updateOrderArticleEndpreis(id: string, endpreisNetto: number | null) {
    await updateOrderArticleEndpreisById(supabase, id, endpreisNetto);
    await refreshOrderArticles();
  }
  async function updateOrderArticleText(id: string, text: string | null) {
    await updateOrderArticleTextById(supabase, id, text);
    await refreshOrderArticles();
  }
  async function removeOrderArticle(id: string) {
    await deleteOrderArticleById(supabase, id);
    await refreshOrderArticles();
  }
  function orderArticlesFor(orderId: string): OrderArticle[] {
    return orderArticles.filter((oa) => oa.order_id === orderId);
  }
  async function refreshVehicles() {
    // Fahrzeuge werden nur noch für den geöffneten Kunden geladen.
    if (selectedId) neuLaden(qk.kundeFahrzeuge(selectedId));
  }
  async function refreshModulePermissions() {
    neuLaden(qk.modulrechte());
  }
  async function updateModulePermissions(bereich: string, verb: Verb, rollen: string[], bestand: Bereichsrechte) {
    await upsertModulePermissions(supabase, bereich, verb, rollen, bestand);
    await refreshModulePermissions();
  }
  // Superadmin darf/sieht immer alles – auch wenn für einen Schlüssel (noch) keine Zeile in
  // `module_permissions` existiert. Für alle anderen Rollen zählt, ob sie in den hinterlegten
  // Rollen des jeweiligen Schlüssels stehen (oder, falls dazu noch keine DB-Zeile existiert,
  // im eingebauten Standardwert `PERMISSION_DEFAULTS`).
  // Darf die eigene Rolle in diesem Bereich dieses Verb? Dieselbe Frage, die die Datenbank
  // mit `public.darf()` beantwortet (Migration 42) – hier nur, um Knöpfe auszublenden, die
  // ohnehin abgelehnt würden. Die Entscheidung fällt in der Datenbank, nicht hier.
  function darf(bereich: string, verb: Verb = "lesen"): boolean {
    if (isSuperAdmin) return true;
    const rechte = modulePermissions[bereich] ?? RECHTE_VORGABE[bereich] ?? {};
    return (rechte[verb] ?? []).includes(myRole);
  }
  // Die Sichtbarkeitsregel eines Moduls ist seit Migration 42 ein Paar aus Bereich und Verb
  // („kunden.schreiben" für „Neuer Kunde"). Ohne Verb gilt „lesen".
  function canView(regel: string): boolean {
    const [bereich, verb] = regel.split(".");
    // Ein Schlüssel, den der Katalog nicht kennt, ergäbe stillschweigend „niemand darf" –
    // der Reiter verschwände für alle außer dem Superadmin, und niemand käme auf die Idee,
    // den Grund in einer Konstantenliste zu suchen. Genau das ist beim Umbau am 17.09.2026
    // zweimal passiert (`neuer_kunde`, `inaktive_kunden`). Deshalb sagt es die Konsole.
    if (process.env.NODE_ENV !== "production" && !RECHTE_VORGABE[bereich]) {
      console.warn(`Unbekannter Rechte-Bereich "${bereich}" – siehe RECHTE_KATALOG in lib/constants.ts`);
    }
    return darf(bereich, (verb as Verb) || "lesen");
  }
  // Die Sichtbarkeitsregel eines Moduls aus lib/module.ts: `null` = immer, `"admin"` = nur
  // Admin/Superadmin, sonst der Modulschlüssel. An einer Stelle, damit Seitenleiste und
  // Kachelseite nicht auseinanderlaufen können.
  function modulSichtbar(regel: string | null): boolean {
    if (regel === null) return true;
    if (regel === "admin") return isAdmin;
    return canView(regel);
  }
  // Rückfall beim Start: Darf diese Rolle die Einsatzplanung nicht sehen, bliebe die Seite beim
  // Öffnen leer. Dann geht es aufs Dashboard – aber erst, wenn Rolle und Modulrechte wirklich
  // geladen sind; vorher gelten Vorgaben, und ein zu früher Wechsel wäre ein Sprung, den der
  // Nutzer nicht bestellt hat. Nur einmal: danach entscheidet allein, wohin jemand tippt.
  //
  // Bewusst im Rendern und nicht in einem Effekt (React-Muster „Zustand beim Rendern
  // anpassen"): So erscheint nie für einen Augenblick eine leere Einsatzplanung, und der Linter
  // (react-hooks/set-state-in-effect) hat nichts einzuwenden.
  const [startGeprueft, setStartGeprueft] = useState(false);
  if (!startGeprueft && sitzungBereit && modulrechteQuery.isSuccess) {
    setStartGeprueft(true);
    const startRegel = MODULE.find((m) => m.tab === START_TAB)?.sichtbar ?? null;
    if (tab === START_TAB && !modulSichtbar(startRegel)) setTab(START_TAB_ERSATZ);
  }
  async function loadHistory(customerId: string) {
    neuLaden(qk.kundeHistorie(customerId));
  }

  // Aufträge einmal nach Kunde gruppieren, statt für jeden Kunden die komplette Auftragsliste
  // erneut zu durchsuchen: die Terminliste tat das vorher einmal pro Kunde, was bei ~4500
  // Kunden in die Tausende von Durchläufen ging.
  const auftraegeJeKunde = useMemo(() => {
    const map: Record<string, Order[]> = {};
    orders.forEach((o) => { (map[o.customer_id] ||= []).push(o); });
    return map;
  }, [orders]);

  function ordersFor(customerId: string): Order[] {
    return auftraegeJeKunde[customerId] || KEINE_AUFTRAEGE;
  }

  // Leaflet rechnet mit einer selbst gemerkten Containergröße weiter und merkt von sich aus
  // nicht, wenn sich die Box ändert. Genau dafür ist ein ResizeObserver da: er feuert, wenn
  // sich die Größe TATSÄCHLICH geändert hat – beim Wechsel zwischen Vollseiten-Modul und
  // normalem Tab, beim Verkleinern des Fensters, beim Öffnen der Entwicklerwerkzeuge, beim
  // Drehen des Handys – und sonst nie.
  //
  // Was hier vorher stand, war ein forceFullReflow(): das gesamte #app-Element kurz auf
  // display:none und zurück, dazu window.scrollTo(0,0) und ein invalidateSize() auf einem
  // 30-ms-Timer, angestoßen von vier globalen Listenern (resize, visibilitychange, pageshow,
  // focus), die nie wieder abgemeldet wurden. Das war der Versuch, ein Layout-Problem durch
  // Erzwingen von Neuberechnungen zu übertönen – mit zwei eigenen Fehlern: der Timer riet die
  // Wartezeit (war das Layout langsamer, maß Leaflet die falsche Breite), und weil sich
  // forceFullReflow den vorherigen Inline-display-Wert merkte, konnten zwei gleichzeitige
  // Aufrufe – beim Öffnen der Entwicklerwerkzeuge feuern resize, focus und visibilitychange
  // praktisch zeitgleich – am Ende display:none stehen lassen.
  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [loading]);

  // Kommt das Netz zurück, gilt der gespeicherte Stand als überholt: alle Bestände werden für
  // ungültig erklärt und die gerade sichtbaren neu geholt. Ohne das säße man nach dem
  // Verlassen des Funklochs weiter auf den alten Daten, bis irgendetwas anderes ein Neuladen
  // auslöst.
  useEffect(() => {
    function beiRueckkehrDesNetzes() {
      void queryClient.invalidateQueries();
    }
    window.addEventListener("online", beiRueckkehrDesNetzes);
    return () => window.removeEventListener("online", beiRueckkehrDesNetzes);
  }, [queryClient]);

  // Rückkehr aus dem Verlaufsspeicher (Zurück-Taste, Wischgeste): dabei ändert sich die
  // Containergröße nicht, der ResizeObserver feuert also nicht – Leaflet braucht hier trotzdem
  // einen Anstoß, weil der Browser die Seite aus einem eingefrorenen Zustand wiederherstellt.
  useEffect(() => {
    function beiRueckkehr(e: PageTransitionEvent) {
      if (e.persisted) mapRef.current?.invalidateSize({ animate: false });
    }
    window.addEventListener("pageshow", beiRueckkehr);
    return () => window.removeEventListener("pageshow", beiRueckkehr);
  }, []);

  // ---------------------------------------------------------------- Karte initialisieren
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function tryInit() {
      const L: any = (await import("leaflet")).default;
      if (cancelled) return;
      leafletRef.current = L;
      if (!mapDivRef.current) {
        setTimeout(tryInit, 60);
        return;
      }
      if (mapRef.current) return;
      const map = L.map(mapDivRef.current, { zoomControl: true }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      applyMapStyle(settings.map_style as MapStyleKey);
      addMapStyleControl(L, map);
      // Beim Verschieben und Zoomen die sichtbaren Marker neu bestimmen (Roadmap Phase 10).
      map.on("moveend", syncMarkers);
      map.on("zoomend", syncMarkers);
      // Punkt von Hand setzen (Migration 35). Der Handler liegt hier, weil die Karte genau
      // einmal entsteht; er tut nichts, solange kein Kunde darauf wartet.
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const kundenId = positionSetzenRef.current;
        if (!kundenId) return;
        void positionAusKarteSpeichern(kundenId, e.latlng.lat, e.latlng.lng);
      });
      // Auch nach einer Größenänderung neu bestimmen: kommt die Karte aus einem
      // Vollseiten-Modul zurück, ist der sichtbare Ausschnitt ein anderer als vorher.
      map.on("resize", syncMarkers);
      // Wer auf die Karte tippt, will die Karte – nicht das offene Filterfeld darüber.
      map.on("click", () => setKartenFilterOffen(false));
      syncMarkers();
    }
    void tryInit();
    return () => { cancelled = true; };
  }, [loading]);

  function applyMapStyle(styleKey: MapStyleKey) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const def = MAP_STYLES[styleKey] || MAP_STYLES.strasse;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    if (overlayLayerRef.current) { map.removeLayer(overlayLayerRef.current); overlayLayerRef.current = null; }
    baseLayerRef.current = L.tileLayer(def.baseUrl, { maxZoom: 19, attribution: def.baseAttr });
    baseLayerRef.current.addTo(map);
    baseLayerRef.current.bringToBack();
    if (def.overlayUrl) {
      overlayLayerRef.current = L.tileLayer(def.overlayUrl, { maxZoom: 19, attribution: def.overlayAttr });
      overlayLayerRef.current.addTo(map);
    }
  }
  useEffect(() => {
    if (mapRef.current) applyMapStyle(settings.map_style as MapStyleKey);
  }, [settings.map_style]);

  // Google-Maps-artiger Ebenen-Schalter direkt auf der Karte (unten links),
  // statt nur über die Einstellungen erreichbar zu sein.
  const STYLE_ORDER: MapStyleKey[] = ["strasse", "satellit", "satellit_labels"];
  function addMapStyleControl(L: any, map: any) {
    const StyleControl = L.Control.extend({
      options: { position: "bottomleft" },
      onAdd: function () {
        const container = L.DomUtil.create("div", "map-style-control");
        const toggle = L.DomUtil.create("button", "map-style-toggle", container);
        toggle.type = "button";
        toggle.innerHTML =
          '<span class="map-style-icon">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 16l10 5 10-5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
          "</span><span>Kartenansicht</span>";
        const panel = L.DomUtil.create("div", "map-style-panel");
        container.appendChild(panel);

        function render() {
          panel.innerHTML = "";
          STYLE_ORDER.forEach((key) => {
            const def = MAP_STYLES[key];
            const isActive = liveRef.current.settings.map_style === key;
            const opt = L.DomUtil.create("div", "map-style-option" + (isActive ? " active" : ""));
            opt.innerHTML =
              '<span class="map-style-swatch swatch-' + key + '"></span><span>' + def.label + "</span>";
            opt.onclick = () => {
              applyMapStyle(key);
              saveSettingsRef.current({ map_style: key });
              panel.classList.remove("open");
              render();
            };
            panel.appendChild(opt);
          });
        }
        render();

        toggle.onclick = () => {
          panel.classList.toggle("open");
        };

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        return container;
      },
    });
    new StyleControl().addTo(map);
  }

  // ---------------------------------------------------------------- Marker synchronisieren
  // Vier Zustände, vier Marker (Migration 23, siehe docs/kunden-und-karte.md).
  //
  // „Kein Interesse" ist bewusst KEIN weiterer farbiger Tropfen, sondern ein weißer Punkt mit
  // rotem Kreuz: er soll sich auf einen Blick von allem unterscheiden, was noch anzurufen ist.
  // Farbe allein trägt das nicht – Rot und Orange nebeneinander sind für einen Teil der
  // Bevölkerung kaum unterscheidbar, und auf einer bunten Karte gehen Farbnuancen unter. Die
  // Form ist der Unterschied, die Farbe die Bestätigung.
  // `ungefaehr` (Migration 35) verändert die FORM, nicht die Farbe: Die Nadel wird hohl. Die
  // Farbe bleibt dem Kundenzustand vorbehalten – dieselbe Regel wie im Lager. Ein Punkt, der
  // nur die Straßenmitte ist, soll nicht aussehen wie einer, der stimmt.
  function makeIcon(zustand: KundenZustand, ungefaehr = false) {
    const L = leafletRef.current;
    if (zustand === "kein-interesse") {
      return L.divIcon({
        className: "custom-pin",
        html: `<div class="pin-kreis" style="width:22px;height:22px;border-radius:50%;background:#fff;
                border:2px solid ${MARKER_FARBE.red};box-shadow:0 1px 4px rgba(0,0,0,.4);
                display:flex;align-items:center;justify-content:center;
                color:${MARKER_FARBE.red};font:700 14px/1 sans-serif;">✕</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11],
      });
    }
    // Die Laufkundschaft hat keine Anschrift und kommt deshalb nie bis hierher. Trotzdem eine
    // Farbe statt eines Absturzes, falls doch einmal eine Position gesetzt wird: Grau sagt
    // „gehört nicht in diese Reihe" und nimmt keinem Zustand seinen Ton weg.
    // Dasselbe für den Einmalkunden ohne Termin (Migration 57): Er fällt schon im Kartenfilter
    // heraus, weil sein Zustand nicht in KUNDEN_ZUSTAND_REIHENFOLGE steht.
    const bg = zustand === "laufkundschaft" || zustand === "einmalkunde" ? "#9a958c" : MARKER_FARBE[zustand];
    return L.divIcon({
      className: "custom-pin",
      html: ungefaehr
        ? `<div class="pin-nadel" style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#fff;
              border:2px dashed ${bg};box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`
        : `<div class="pin-nadel" style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${bg};
              border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
      iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -22],
    });
  }

  // Nadel zu einer Kundenzeile hervorheben. Greift bewusst direkt auf das Kartenelement zu,
  // statt über React zu gehen: Leaflet verwaltet diese Elemente selbst, und ein
  // Zustandswechsel je Mausbewegung wäre hier verschwendet.
  //
  // Hier stand bis zum 14.09.2026 eine Abfrage auf `(hover: hover)` – gedacht als Schutz davor,
  // dass am Handy nach einem Tipp eine Nadel hervorgehoben stehen bleibt. Sie hat die Funktion
  // auf einem Windows-Notebook MIT Touchscreen komplett abgeschaltet: Solche Geräte melden
  // `(hover: none)`, obwohl eine Maus daran hängt. Die Vorsichtsmaßnahme war schädlicher als
  // das, wovor sie schützen sollte – und sie war unsichtbar, weil nichts passierte.
  //
  // Der Touch-Fall ist jetzt anders gelöst: Beim Antippen einer Zeile wird die Hervorhebung
  // ausdrücklich zurückgenommen, bevor das Kundenfenster aufgeht. Kein Raten über Geräte.
  function nadelHervorheben(kundenId: string | null) {
    const vorher = hervorgehobeneNadelRef.current;
    if (vorher === kundenId) return;
    if (vorher) {
      markerIndexRef.current[vorher]?.getElement()?.classList.remove("pin-hervor");
    }
    hervorgehobeneNadelRef.current = kundenId;
    if (kundenId) {
      markerIndexRef.current[kundenId]?.getElement()?.classList.add("pin-hervor");
    }
  }

  function syncMarkers() {
    const L = leafletRef.current;
    if (!L || !markerLayerRef.current) return;
    const { customers: custs, orders: ords, settings: s, sichtbareZustaende: sichtbar } = liveRef.current;
    // Aus `ords` und nicht aus dem Render-Wert: Diese Funktion wird auch von Leaflet-Ereignissen
    // aufgerufen, die einmal registriert wurden. Ein dort eingefangener Wert von damals wäre
    // beim Verschieben der Karte längst veraltet – deshalb liest hier alles aus `liveRef`.
    const mitTerminLive = kundenMitTermin(ords);
    // Nur zeichnen, was im Bild ist (Roadmap Phase 10). Bei ~4500 Kunden legte Leaflet vorher
    // 4500 DOM-Elemente an, von denen fast alle außerhalb des Ausschnitts lagen – Zoomen und
    // Verschieben wurden dadurch spürbar zäh. `pad` nimmt einen Rand mit, damit beim Schieben
    // nichts nachträglich aufpoppt.
    const karte = mapRef.current;
    const grenzen = karte ? karte.getBounds().pad(0.25) : null;
    let gezeichnet = 0;
    let ausgelassen = 0;
    const seen = new Set<string>();
    custs.forEach((cust) => {
      if (cust.active === false || cust.lat == null || cust.lng == null) return;
      if (grenzen && !grenzen.contains([cust.lat, cust.lng])) return;
      // Ausgeblendete Zustände fallen VOR der Obergrenze raus: sonst würden unsichtbare Nadeln
      // das Kontingent aufbrauchen und der Hinweis "weitere Kunden in diesem Ausschnitt"
      // zählte Kunden mit, die man gar nicht sehen will.
      const color = effectiveColor(cust, s.period_months, todayStr(), mitTerminLive.has(cust.id));
      if (!sichtbar.includes(color)) return;
      // Im Reiter „Termine" bleiben alle Kunden ohne Termin im gewählten Zeitraum außen vor.
      const nurTermine = terminKundenRef.current;
      if (nurTermine && !nurTermine.has(cust.id)) return;
      if (gezeichnet >= MAX_MARKER) { ausgelassen++; return; }
      gezeichnet++;
      seen.add(cust.id);
      const ungefaehr = cust.geo_genauigkeit === "ungefaehr";
      const nextOrd = nextOrder(ordersForLive(cust.id, ords));
      let tooltip = `<b>${escapeHtml(cust.name)}</b><br>${escapeHtml(cust.address)}<br>` +
        // „Noch nicht kontaktiert" unmittelbar über einer Terminzeile las sich wie ein
        // Widerspruch. Es stimmt zwar – ein Auftrag ist kein vermerkter Kontakt –, aber die
        // schroffe Fassung gehört zu einem Kunden, bei dem gar nichts ansteht.
        (cust.status === "kontaktiert" && cust.last_contact
          ? `Letzter Kontakt: ${formatDate(cust.last_contact)}`
          : mitTerminLive.has(cust.id) ? "Noch kein Kontakt vermerkt" : "Noch nicht kontaktiert") +
        (ungefaehr ? "<br><i>Ungefähre Position – nur die Straße war auffindbar</i>" : "");
      if (nextOrd) tooltip += `<br>📅 Termin: ${formatOrderDateTime(nextOrd)} – ${escapeHtml(nextOrd.title)}${nextOrd.description ? " (" + escapeHtml(nextOrd.description) + ")" : ""}`;

      let marker = markerIndexRef.current[cust.id];
      if (marker) {
        marker.setIcon(makeIcon(color, ungefaehr));
        marker.setLatLng([cust.lat, cust.lng]);
        marker.setTooltipContent(tooltip);
        // Bewusst KEIN setPopupContent hier: bindPopup() bekommt unten eine Funktion, die
        // Leaflet bei jedem Öffnen neu auswertet – der Inhalt ist also ohnehin frisch. Der
        // Aufruf an dieser Stelle hat den Inhalt eines GEÖFFNETEN Popups mitten im Betrieb
        // neu aufgebaut (syncMarkers läuft bei jedem moveend, und Leaflet schiebt die Karte
        // beim Öffnen selbst zurecht) und damit die sichtbaren Schaltflächen ausgetauscht.
      } else {
        marker = L.marker([cust.lat, cust.lng], { icon: makeIcon(color, ungefaehr) });
        marker.bindTooltip(tooltip, { className: "cust-tip" });
        marker.bindPopup(() => buildPopupEl(cust.id), { minWidth: 240 });
        marker.addTo(markerLayerRef.current);
        markerIndexRef.current[cust.id] = marker;
        // Wird beim Verschieben der Karte eine Nadel neu angelegt, während die Maus noch auf
        // ihrer Zeile steht, muss die Hervorhebung mitkommen.
        if (hervorgehobeneNadelRef.current === cust.id) marker.getElement()?.classList.add("pin-hervor");
      }
    });
    Object.keys(markerIndexRef.current).forEach((id) => {
      if (!seen.has(id)) {
        markerLayerRef.current.removeLayer(markerIndexRef.current[id]);
        delete markerIndexRef.current[id];
      }
    });
    setAusgelasseneMarker((vorher) => (vorher === ausgelassen ? vorher : ausgelassen));
  }
  function ordersForLive(customerId: string, ords: Order[]) {
    return ords.filter((o) => o.customer_id === customerId);
  }
  useEffect(() => { syncMarkers(); }, [customers, orders, settings.period_months, sichtbareZustaende]);

  // ---------------------------------------------------------------- Popup-Inhalt (imperativ, wie im Original)
  function buildPopupEl(customerId: string): HTMLElement {
    const { customers: custs, orders: ords, settings: s } = liveRef.current;
    const cust = custs.find((c) => c.id === customerId);
    const div = document.createElement("div");
    if (!cust) { div.textContent = "Kunde nicht gefunden"; return div; }
    const color = effectiveColor(cust, s.period_months, todayStr(), kundenMitTermin(ords).has(cust.id));
    const nextOrd = nextOrder(ordersForLive(cust.id, ords));
    const phoneLines = getPhoneNumbers(cust).map(n => `<div class="pline">📞 ${escapeHtml(n.label)}: ${escapeHtml(n.number)}</div>`).join("");
    div.innerHTML = `
      <div class="header-row">
        <h3>${escapeHtml(cust.company || cust.name)} <span class="badge ${color}">${KUNDEN_ZUSTAND_LABEL[color]}</span></h3>
        ${buildNavIconHtml(cust)}
        ${buildCallIconHtml(cust)}
      </div>
      ${cust.company ? `<div class="pline">👤 ${escapeHtml(cust.name)}</div>` : ""}
      <div class="pline">📍 ${escapeHtml(cust.address)}</div>
      ${cust.email ? `<div class="pline">✉️ ${escapeHtml(cust.email)}</div>` : ""}
      ${phoneLines}
      ${cust.note ? `<div class="pline">📝 ${escapeHtml(cust.note)}</div>` : ""}
      <div class="pline small">Letzter Kontakt: ${cust.last_contact ? formatDate(cust.last_contact) : "–"}</div>
      ${nextOrd ? `<div class="pline small">📅 Nächster Termin: ${formatOrderDateTime(nextOrd)} – ${escapeHtml(nextOrd.title)}${nextOrd.description ? " (" + escapeHtml(nextOrd.description) + ")" : ""}</div>` : ""}
      ${cust.wiedervorlage_am && color === "wiedervorlage" ? `<div class="pline small">🔁 Wiedervorlage am ${formatDate(cust.wiedervorlage_am)}</div>` : ""}
      <hr>
      <button type="button" data-popup-aktion="neuer-auftrag" data-kunde="${cust.id}" class="btn-primary btn-block" style="margin-bottom:10px;">+ Auftrag anlegen</button>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button type="button" data-popup-aktion="kontakt" data-kunde="${cust.id}" style="flex:1" class="btn-green">✔ Kontakt bestätigen</button>
        <button type="button" data-popup-aktion="offen" data-kunde="${cust.id}" style="flex:1" class="btn-secondary">Auf offen setzen</button>
      </div>
      ${color === "kein-interesse" ? `<button type="button" data-popup-aktion="deaktivieren" data-kunde="${cust.id}" class="btn-secondary btn-block" style="margin-bottom:6px;color:#b33;">Kunde deaktivieren</button>` : ""}
      <button type="button" data-popup-aktion="bearbeiten" data-kunde="${cust.id}" class="btn-secondary btn-block">✏️ Kundendaten &amp; Aufträge bearbeiten</button>
    `;
    return div;
  }

  // Popup-Schaltflächen: EIN Zuhörer am Dokument statt je Schaltfläche einer.
  //
  // Vorher hingen die Handler direkt an den Elementen (Ereignis „popupopen" → getElementById
  // → .onclick). Am Handy war im Popup deshalb nichts anklickbar: Leaflet schiebt die Karte
  // beim Öffnen zurecht, damit das Popup ins Bild passt. Das löst „moveend" aus, „moveend"
  // ruft syncMarkers, und syncMarkers baute den Popup-Inhalt neu auf – die sichtbaren
  // Schaltflächen waren danach andere DOM-Elemente als die, an denen die Handler hingen. Am
  // Desktop ist genug Platz, das Popup passt ohne Verschieben, dort fiel es nie auf.
  //
  // Ein Zuhörer am Dokument kann das nicht passieren: er sucht die Schaltfläche erst im
  // Moment des Klicks. Leaflet hält Klicks aus dem Popup-Inhalt nicht auf – sein
  // disableClickPropagation stoppt mousedown/touchstart/dblclick/contextmenu, nicht „click".
  //
  // Die eigentliche Handlung steht in einer Ref, die bei jedem Rendern neu gesetzt wird
  // (gleiche Technik wie liveRef weiter oben): der Zuhörer wird nur einmal angemeldet, greift
  // aber trotzdem nie auf veraltete Zustände zu.
  const popupAktionRef = useRef<(aktion: string, kundenId: string, ziel: HTMLElement) => void>(() => {});
  popupAktionRef.current = (aktion, kundenId, ziel) => {
    const popupSchliessen = () => mapRef.current?.closePopup();
    switch (aktion) {
      // Auftrag anlegen und Kontakt bestätigen sind seit 29.08.2026 zwei getrennte
      // Handlungen. Der Auftrag öffnet das gewohnte Anlegeformular als Overlay über der
      // Karte – kein Reiterwechsel, nach dem Speichern steht man wieder hier.
      case "neuer-auftrag":
        popupSchliessen(); void neuenAuftragAnlegen(kundenId); return;
      // „Kontakt bestätigen" öffnet den Kontaktdialog, statt direkt zu speichern: erst dort
      // wird festgehalten, WAS herausgekommen ist (Migration 23). Das Kontaktdatum steht
      // ebenfalls dort – ein zweites Datumsfeld im Popup wäre eine zweite Stelle für
      // dieselbe Angabe.
      case "kontakt":
        popupSchliessen(); setKontaktKundeId(kundenId); return;
      case "offen":
        popupSchliessen(); void markOpen(kundenId); return;
      // Erscheint nur bei „kein Interesse": das Deaktivieren bleibt ein eigener, bewusster
      // Schritt und passiert nicht als Nebenwirkung des Anrufergebnisses (Migration 23).
      case "deaktivieren":
        popupSchliessen(); void setActive(kundenId, false); return;
      case "bearbeiten":
        popupSchliessen(); setSelectedId(kundenId); void loadHistory(kundenId); return;
      // Navigation: dasselbe Menü (Google Maps / Apple Karten) wie in den Auftrags- und
      // Kundenlisten. Das Popup bleibt offen – wer das Menü wegtippt, steht wieder beim Kunden.
      case "navigieren": {
        const cust = liveRef.current.customers.find((c) => c.id === kundenId);
        if (!cust) return;
        const rect = ziel.getBoundingClientRect();
        setNavMenuPos({ top: clampMenuTop(rect, 90), left: Math.min(rect.left, window.innerWidth - 190) });
        setNavMenuFor(cust);
        return;
      }
      case "anrufen": {
        const cust = liveRef.current.customers.find((c) => c.id === kundenId);
        if (!cust) return;
        anrufAusloesen(cust, ziel.getBoundingClientRect());
        return;
      }
    }
  };

  useEffect(() => {
    function beiKlick(e: MouseEvent) {
      const ausloeser = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-popup-aktion]") : null;
      const kundenId = ausloeser?.dataset.kunde;
      if (!ausloeser || !kundenId) return;
      e.stopPropagation();
      popupAktionRef.current(ausloeser.dataset.popupAktion || "", kundenId, ausloeser);
    }
    document.addEventListener("click", beiKlick);
    return () => document.removeEventListener("click", beiKlick);
  }, []);

  // Navigations-Pin im Karten-Popup. Gleiche Schaltfläche wie in den Listen, nur als
  // HTML-Zeichenkette, weil Leaflet-Popups nicht von React gebaut werden. Die Pin-Form kommt
  // aus components/icons.tsx – eine Quelle für beide Fassungen.
  function buildNavIconHtml(cust: Customer): string {
    if (!cust.address.trim()) return "";
    return `<button type="button" class="call-icon-btn small nav-icon-btn" data-popup-aktion="navigieren" data-kunde="${cust.id}" title="Navigation starten (Google Maps / Apple Karten)">${navPinSvgHtml(20)}</button>`;
  }

  function buildCallIconHtml(cust: Customer, small = false): string {
    const nums = getPhoneNumbers(cust);
    if (!nums.length) return "";
    return `<button type="button" class="call-icon-btn${small ? " small" : ""}" data-popup-aktion="anrufen" data-kunde="${cust.id}" title="Anrufen">📞</button>`;
  }

  // ---------------------------------------------------------------- CRUD
  // Kontakt bestätigen – und sonst nichts. Bis zum 29.08.2026 hing an dieser Funktion noch ein
  // Ankreuzfeld "Termin dabei vereinbart", das im selben Zug einen Auftrag anlegte. Das hat zwei
  // Dinge verbunden, die nicht zusammengehören: ein Auftrag entsteht auch ohne Anruf (Kunde
  // steht vor Ort, Anschlussauftrag), und ein Anruf führt oft zu keinem Auftrag. Vor allem aber
  // setzte jede Auftragsanlage `last_contact` – und daran hängt die Wiedervorlage-Uhr. Auftrag
  // anlegen geht jetzt über denselben Weg wie überall: das Auftragsformular.
  // Siehe docs/termine-kontakt-auftrag-analyse.md.
  // Kunde, für den gerade der Kontaktdialog offen ist (Migration 23). Der Dialog ersetzt das
  // frühere „Kontaktiert speichern", das nur festhielt, DASS telefoniert wurde.
  // Siehe docs/kunden-und-karte.md.
  async function kontaktFesthalten(id: string, ergebnis: KontaktErgebnis, contactDate: string, wiedervorlageAm: string | null) {
    const notiz =
      ergebnis === "auftrag" ? "Kontaktiert – Auftrag vereinbart"
      : ergebnis === "wiedervorlage" ? `Kontaktiert – Wiedervorlage am ${formatDate(wiedervorlageAm || contactDate)}`
      : "Kontaktiert – kein Interesse";
    await markCustomerContacted(supabase, id, contactDate, notiz, ergebnis, wiedervorlageAm);
    await refreshCustomers();
    if (selectedId === id) loadHistory(id);
    setKontaktKundeId(null);
    // „Auftrag anlegen" führt direkt weiter ins Auftragsfenster – der Kontakt ist zu diesem
    // Zeitpunkt bereits geschrieben, es geht also nichts verloren, falls dort abgebrochen wird.
    if (ergebnis === "auftrag") await neuenAuftragAnlegen(id);
  }
  async function markOpen(id: string) {
    await markCustomerOpen(supabase, id);
    await refreshCustomers();
  }
  async function setActive(id: string, active: boolean) {
    await setCustomerActive(supabase, id, active);
    await refreshCustomers();
  }
  async function deleteCustomerById(id: string) {
    await deleteCustomerRow(supabase, id);
    // Erst das Fenster schließen, DANN neu laden. Umgekehrt stand der Kunde nach dem Neuladen
    // nicht mehr in der Liste, das Fenster war aber noch offen und griff ins Leere – die ganze
    // Seite brach mit „This page couldn't load" ab (24.09.2026, beim Löschen der Laufkundschaft).
    setSelectedId(null);
    await refreshCustomers();
    await refreshOrders();
  }
  async function updateCustomerFields(id: string, fields: Partial<Customer>) {
    const cust = customers.find((c) => c.id === id);
    await updateCustomerFieldsById(supabase, id, fields, cust?.address);
    await refreshCustomers();
  }

  // Die Adresse eines einzelnen Kunden neu suchen lassen. Der Rückgabewert sagt, ob etwas
  // gefunden wurde – das Kundenfenster zeigt den Befund selbst an, damit „nichts gefunden"
  // nicht als Fehler im roten Band erscheint. Ein Fehler ist es nämlich nicht.
  async function positionSuchen(id: string): Promise<boolean> {
    const cust = customers.find((c) => c.id === id);
    if (!cust?.address) return false;
    const gefunden = await positionNeuSuchen(supabase, id, cust.address);
    if (gefunden) await refreshCustomers();
    return gefunden;
  }
  async function addCustomer(fields: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    company: string; email: string; anrede: "" | "Herr" | "Frau";
    koordinate: { lat: number; lng: number } | null;
    auftragAnlegen: boolean;
    laufkundschaft: boolean;
    einmalkunde: boolean;
  }) {
    const { id: createdId, lat } = await insertCustomer(supabase, fields);
    await refreshCustomers();
    // Ruft ein Kunde selbst an und wird dabei neu angelegt, ist meist auch schon klar, worum es
    // geht. Statt eines eigenen kleinen Auftragsformulars hier führt der Weg über dieselbe
    // Maske wie überall: Zeile anlegen, vollständiges Auftragsfenster öffnen.
    if (createdId && fields.auftragAnlegen) {
      // Kam der Weg über einen Klick in den Kalender, ist der Termin schon gewählt – er wartet
      // seit dem Klick in `terminFuerNeuenKunden` und wird jetzt eingesetzt. Danach wird er
      // gelöscht: Der nächste Kunde, der ohne Kalender angelegt wird, soll nicht die Uhrzeit
      // von vorgestern erben.
      const termin = terminFuerNeuenKunden;
      setTerminFuerNeuenKunden(null);
      await neuenAuftragAnlegen(createdId, termin);
    }
    return lat != null;
  }
  // ---------------------------------------------------------------- Lager-Modul
  async function addWarehouse(fields: { name: string; address: string; note: string }): Promise<string | undefined> {
    const id = await insertWarehouse(supabase, fields);
    await refreshWarehouses();
    return id;
  }
  async function updateWarehouse(id: string, fields: { name: string; address: string; note: string }) {
    await updateWarehouseById(supabase, id, fields);
    await refreshWarehouses();
  }
  async function deleteWarehouse(id: string) {
    await deleteWarehouseById(supabase, id);
    await refreshWarehouses();
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function addStorageSlot(warehouseId: string, code: string) {
    await insertStorageSlot(supabase, warehouseId, code);
    await refreshStorageSlots();
  }
  // Bulk-Anlage von Lagerplätzen nach einer Nummerierungslogik (Präfix + Start/Ende + Stellen),
  // z. B. Präfix "A", 1–20, 2-stellig → A-01 … A-20. Wird sowohl beim Anlegen eines neuen Lagers
  // als auch später zum Nachrüsten weiterer Plätze verwendet.
  async function addStorageSlotsBulk(warehouseId: string, codes: string[]) {
    await insertStorageSlotsBulk(supabase, warehouseId, codes);
    await refreshStorageSlots();
  }
  async function deleteStorageSlot(id: string) {
    await deleteStorageSlotById(supabase, id);
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function assignTire(fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null }) {
    await upsertTireAssignment(supabase, fields);
    await refreshTireStorages();
  }
  // Das Herausgeben eines Satzes geht seit Migration 46 durch EINEN Dialog – egal, ob es an
  // der Regalwand oder im Auftragsfenster angestoßen wurde. Vorher war es ein stiller
  // Datenbankschreibvorgang; genau dabei ging die Lagergebühr verloren, weil niemand mehr
  // gefragt wurde, wie viele Monate der Satz denn nun gelegen hat.
  //
  // Ausgenommen bleibt der Fall „ich habe mich beim Einlagern vertan": Wer den Satz entfernt,
  // den er im selben Auftrag HEUTE erst angelegt hat, korrigiert einen Fehler und schuldet
  // dafür nichts.
  //
  // Beides muss zutreffen, und bis zum 21.09.2026 prüfte der Code keines von beidem: Das
  // Auftragsfenster übergab pauschal „ohne Dialog". Ein Satz, der seit acht Monaten im Regal
  // lag und zu einem alten Auftrag gehörte, ging damit über den Knopf „Einlagerung entfernen"
  // kostenlos hinaus – ohne Gebühr, ohne `entnahme_order_id`, ohne dass jemand gefragt wurde.
  // Über die Regalwand lief derselbe Vorgang die ganze Zeit richtig.
  //
  // Die Entscheidung steht deshalb jetzt HIER und nicht mehr am Aufrufer: Ein Aufrufer, der
  // sich vertut, kostet Geld, und man sieht es ihm nicht an.
  const [auslagernSatzId, setAuslagernSatzId] = useState<string | null>(null);
  const [auslagernAusAuftragId, setAuslagernAusAuftragId] = useState<string | null>(null);
  // Für welche Sätze ist gerade der Etikettendruck offen (17.09.2026)? Eine Liste, weil aus dem
  // Lager heraus auch mehrere auf einmal gedruckt werden können.
  const [etikettSatzIds, setEtikettSatzIds] = useState<string[]>([]);

  async function removeTireAssignment(id: string, ausAuftragId?: string | null) {
    const satz = tireStorages.find((t) => t.id === id);
    const heuteAngelegt = !!satz && satz.created_at.slice(0, 10) === todayStr();
    const eigenerSatz = !!satz && !!ausAuftragId && satz.order_id === ausAuftragId;

    if (heuteAngelegt && eigenerSatz) {
      await removeTireAssignmentById(supabase, id, null);
      await refreshTireStorages();
      return;
    }
    if (ausAuftragId) setAuslagernAusAuftragId(ausAuftragId);
    setAuslagernSatzId(id);
  }

  // Der eine Weg nach außen: auslagern, Gebühr buchen, Auftrag notfalls anlegen. Die
  // Reihenfolge ist Absicht – zuerst muss der Auftrag existieren, sonst hat die Gebühr kein
  // Zuhause und `entnahme_order_id` zeigte auf nichts.
  async function auslagernAusfuehren(satzId: string, wahl: AuslagernWahl) {
    const satz = tireStorages.find((t) => t.id === satzId);
    let auftragId = wahl.auftragId;

    if (wahl.neuerAuftrag && satz) {
      const kunde = customers.find((c) => c.id === satz.customer_id);
      auftragId = await addOrder({
        customerId: satz.customer_id, title: terminTitel(kunde?.name), description: "",
        orderDate: todayStr(), time: "", status: "offen", assignedEmployeeIds: [],
      });
    }

    await removeTireAssignmentById(supabase, satzId, auftragId);
    if (auftragId && wahl.artikelId && wahl.menge > 0) {
      // Beim Auslagern gibt es keinen Freitext: Die Lagergebühr ist ein benannter Artikel
      // mit Monaten als Menge, und was sie beschreibt, steht im Artikelstamm.
      await insertOrderArticle(supabase, articlePrices, auftragId, wahl.artikelId, wahl.menge, null, null);
      await refreshOrderArticles();
    }
    await refreshTireStorages();
    setAuslagernSatzId(null);
    setAuslagernAusAuftragId(null);
    // Ein frisch angelegter Auftrag wird geöffnet: Sonst hätte man gerade eine Rechnungszeile
    // erzeugt, die nirgends zu sehen ist.
    if (wahl.neuerAuftrag && auftragId) setOffenerAuftragId(auftragId);
  }

  // ---------------------------------------------------------------- Aufträge-Modul (Termine inklusive)
  // Mitarbeiter-Zuordnung läuft komplett über `order_employees` (Migration 11) – ein Auftrag kann
  // mehreren Mitarbeitern zugeordnet sein (z. B. bei umfangreichen Aufträgen). `assignedEmployeeIds`
  // ist deshalb überall eine Liste, auch wenn sie in vielen Fällen nur ein Element hat.
  async function addOrder(fields: { customerId: string; title: string; description: string; orderDate: string; time: string; endTime?: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    // Rückfallebene für alle Anlagemasken: bleibt der Titel leer, wird "Termin – ‹Kunde›"
    // eingesetzt. Die Masken belegen ihn zwar vor, aber so hängt es nicht daran, dass jede
    // einzelne daran denkt.
    const kunde = customers.find((c) => c.id === fields.customerId);
    const id = await insertOrder(supabase, { ...fields, title: fields.title.trim() || terminTitel(kunde?.name) });
    if (id) await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
    // Die Id geht an den Aufrufer zurück, damit er den frisch angelegten Auftrag sofort öffnen
    // kann – ohne sie müsste er ihn in der Liste wiederfinden, was bei gleichnamigen Aufträgen
    // am selben Tag nicht eindeutig ist.
    return id;
  }
  // Ein Klick, ein Auftrag, ein Fenster: aus dem Karten-Popup heraus wird die Zeile mit
  // sinnvollen Vorgaben sofort angelegt (Titel "Termin – ‹Kunde›", heutiges Datum, Zustand
  // offen) und dann das vollständige Auftragsfenster geöffnet. Titel, Termin, Fahrzeug,
  // Mitarbeiter und Leistungen werden dort geändert – alles an einer Stelle, dieselbe Maske
  // wie bei jedem anderen Auftrag.
  //
  // `addOrder` wartet das Neuladen inzwischen wirklich ab (siehe `neuLaden`), sonst wäre die
  // frische Zeile im Zwischenspeicher noch nicht vorhanden und das Fenster bliebe zu.
  async function neuenAuftragAnlegen(kundenId: string, termin?: NeuerTermin | null) {
    const kunde = customers.find((c) => c.id === kundenId);
    const id = await addOrder({
      customerId: kundenId, title: terminTitel(kunde?.name), description: "",
      // Ohne Vorgabe wie bisher: heute, ohne Uhrzeit. Kommt der Auftrag aus dem Kalender, steht
      // der angeklickte Zeitpunkt schon drin – und der Block sitzt sofort dort, wohin geklickt
      // wurde, statt in der Leiste „ohne Uhrzeit" zu landen.
      orderDate: termin?.datum || todayStr(),
      time: termin?.von || "",
      // Ein Ende nur ZUSAMMEN mit einem Beginn: Die Datenbank lässt seit Migration 37 nichts
      // anderes zu, und ohne Beginn wäre es auch keine Aussage.
      endTime: termin?.von ? (termin.bis || "") : "",
      status: "offen", assignedEmployeeIds: [],
    });
    if (!id) return;
    setFrischerAuftragId(id);
    setOffenerAuftragId(id);
  }
  // ------------------------------------------------------- Einlagerung am Auftrag (Migration 22)
  // Die aktive Einlagerung eines Auftrags. "Aktiv" heißt: noch nicht ausgelagert
  // (`removed_at is null`) – die Historie eines Lagerplatzes bleibt davon unberührt.
  //
  // Eine LISTE und kein einzelner Satz (17.09.2026): Seit Migration 44 trägt ein Auftrag
  // mehrere Fahrzeuge, und damit gehören mehrere Sätze ins Regal. Die Datenbank ließ das immer
  // zu – eindeutig ist der PLATZ (ein aktiver Satz je Platz, Migration 15), nicht der Auftrag.
  // Eingeschränkt hat nur dieses `find` hier.
  function einlagerungenZuAuftrag(orderId: string): TireStorage[] {
    return tireStorages
      .filter((t) => t.order_id === orderId && !t.removed_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  // Steht auf diesem Auftrag eine Lagergebühr? Das heißt: Hier wurde AUSGELAGERT und die
  // Monate werden berechnet – nicht, dass ein Lagerplatz zu belegen wäre. Seit Migration 46
  // ist das Kennzeichen eine Abrechnungsart, kein Lagerplatz-Zwang mehr.
  function auftragHatLagergebuehr(orderId: string): boolean {
    return orderArticlesFor(orderId).some(
      (pos) => articles.find((a) => a.id === pos.article_id)?.abrechnungsart === "lagergebuehr"
    );
  }
  // Mit `einlagerungId` zieht GENAU DIESER Satz auf den neuen Platz, ohne entsteht ein neuer.
  //
  // Vorher suchte diese Funktion sich den Satz selbst („den einen dieses Auftrags") und zog ihn
  // um. Bei zwei Autos war das falsch herum: Wer den zweiten Satz einlagern wollte, verschob
  // den ersten. Welcher Satz gemeint ist, weiß nur die Maske – also sagt sie es.
  async function einlagernFuerAuftrag(order: Order, lagerplatzId: string, einlagerungId?: string) {
    await upsertTireAssignment(supabase, {
      id: einlagerungId,
      storageSlotId: lagerplatzId,
      customerId: order.customer_id,
      dotDate: "", profiltiefeMm: "", note: "",
      orderId: order.id,
    });
    await refreshTireStorages();
  }

  // Fahrzeug und Saison am eingelagerten Satz (Migration 30). Eigener Weg neben
  // `einlagernFuerAuftrag`: dort geht es um den Lagerplatz, hier um die Beschreibung des
  // Satzes. Beides zusammenzulegen hieße, bei jeder Saisonänderung den Platz erneut zu
  // schreiben.
  async function einlagerungAngabenAendern(einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) {
    await updateTireStorageDetails(supabase, einlagerungId, felder);
    await refreshTireStorages();
  }

  // ---------------------------------------------------------------- Räder (Migration 33)
  //
  // Sammelmessung oder Einzelerfassung – nie beides. Das Umschalten räumt in der richtigen
  // Reihenfolge auf (siehe setErfassungsart in lib/api/lager.ts), damit niemand in eine
  // Fehlermeldung der Datenbank läuft.
  async function erfassungsartSetzen(einlagerungId: string, art: Erfassungsart) {
    await setErfassungsart(supabase, einlagerungId, art);
    await Promise.all([refreshTireStorages(), neuLaden(qk.eingelagerteRaeder())]);
  }
  async function anzahlRaederSetzen(einlagerungId: string, anzahl: number) {
    await setAnzahlRaeder(supabase, einlagerungId, anzahl);
    await refreshTireStorages();
  }
  // Ein Rad je Position: Gibt es die Position schon, wird sie geändert, sonst angelegt. Das
  // Unterscheiden gehört hierher und nicht in die Oberfläche – dort wüsste man es nur, wenn
  // man dieselbe Liste noch einmal durchsucht.
  async function radSpeichern(einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) {
    const vorhanden = eingelagerteRaeder.find((r) => r.tire_storage_id === einlagerungId && r.position === position);
    if (vorhanden) {
      await updateRadById(supabase, vorhanden.id, felder);
    } else {
      await insertRad(supabase, einlagerungId, { ...felder, position });
    }
    await neuLaden(qk.eingelagerteRaeder());
  }
  async function radEntfernen(radId: string) {
    await deleteRadById(supabase, radId);
    await neuLaden(qk.eingelagerteRaeder());
  }

  async function updateOrder(id: string, fields: {
    title: string; description: string; orderDate: string; time: string; endTime?: string; rechnungNoetig?: boolean;
    status: OrderStatus; assignedEmployeeIds: string[]; laufkunde?: { name: string; telefon: string; ort: string };
  }) {
    await updateOrderById(supabase, id, fields);
    // Die Einteilung nur anfassen, wenn sie sich wirklich geändert hat. Zwei Gründe, und der
    // zweite ist der wichtigere:
    //
    // 1. `setOrderEmployees` löscht und schreibt neu – bei jedem Speichern ein Ab- und Anmelden
    //    derselben Personen, das jedes Mal im Protokoll landet.
    // 2. Seit Migration 41 darf ein TECHNIKER den Auftrag bearbeiten, aber weiterhin nicht die
    //    Einteilung (`order_employees`, Migration 15). Ohne diesen Vergleich wäre jedes
    //    Speichern durch einen Techniker an der Rechteprüfung gescheitert – obwohl er die
    //    Einteilung gar nicht angefasst hat.
    const vorher = [...(orderEmployees[id] ?? [])].sort();
    const nachher = [...fields.assignedEmployeeIds].sort();
    if (vorher.join(",") !== nachher.join(",")) await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  // Ein Termin wurde im Kalender gezogen (25.09.2026): nur Tag, Beginn und Ende.
  async function terminVerschieben(id: string, datum: string, von: string | null, bis: string | null) {
    await updateOrderTermin(supabase, id, { orderDate: datum, time: von, endTime: bis });
    await refreshOrders();
  }
  // Zustandswechsel eines Auftrags. Welche Übergänge erlaubt sind, entscheidet der Trigger aus
  // Migration 20 – lehnt er ab, kommt der Grund als Fehlermeldung zurück und wird über die
  // zentrale Anzeige sichtbar (siehe lib/api/client.ts).
  async function updateOrderStatus(id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) {
    await updateOrderStatusById(supabase, id, status, grund);
    await refreshOrders();
    // Beim Abschließen schreibt die Datenbank den Kontaktstand des Kunden fort (Migration 47).
    // Ohne dieses Nachladen stünde die Nadel bis zum nächsten Seitenaufruf noch auf dem alten
    // Zustand – die Änderung ist echt, nur nicht zu sehen, und das ist schlimmer als keine.
    if (status === "erledigt") {
      await refreshCustomers();
      const auftrag = orders.find((o) => o.id === id);
      if (auftrag && selectedId === auftrag.customer_id) loadHistory(auftrag.customer_id);
    }
  }
  // Stammdaten der eigenen Transporter. Ein doppeltes Kennzeichen ist ein Bedienfehler und
  // kommt als Text zurück in die Maske – nicht als Störungsmeldung über den ganzen Bildschirm.
  async function firmenfahrzeugAnlegen(felder: FirmenfahrzeugFelder): Promise<string | null> {
    const { error } = await insertFirmenfahrzeug(supabase, felder);
    if (error) return error;
    await neuLaden(qk.firmenfahrzeuge());
    return null;
  }
  async function firmenfahrzeugAendern(id: string, felder: FirmenfahrzeugFelder): Promise<string | null> {
    const { error } = await updateFirmenfahrzeugById(supabase, id, felder);
    if (error) return error;
    await neuLaden(qk.firmenfahrzeuge());
    return null;
  }
  async function firmenfahrzeugStilllegen(id: string, aktiv: boolean) {
    await firmenfahrzeugAusmustern(supabase, id, aktiv);
    await neuLaden(qk.firmenfahrzeuge());
  }

  async function setOrderFirmenfahrzeug(id: string, firmenfahrzeugId: string | null) {
    await updateOrderFirmenfahrzeug(supabase, id, firmenfahrzeugId);
    await refreshOrders();
  }
  async function updateTechnikerNotiz(id: string, notiz: string) {
    await updateOrderTechnikerNotiz(supabase, id, notiz);
    await refreshOrders();
  }
  // „Rechnung erstellt" abhaken oder zurücknehmen (Migration 40).
  // Fahrzeuge am Auftrag (Migration 44). Geladen wird nur für den gerade geöffneten Auftrag –
  // für die Liste braucht es sie nicht, und ein Vollabzug über alle Aufträge wäre derselbe
  // Fehler wie die dreizehn Vollabzüge beim Start, die Phase 10 abgestellt hat.
  const [auftragFahrzeuge, setAuftragFahrzeuge] = useState<AuftragFahrzeug[]>([]);
  useEffect(() => {
    let abgebrochen = false;
    if (!offenerAuftragId) { setAuftragFahrzeuge([]); return; }
    fetchAuftragFahrzeuge(supabase, [offenerAuftragId])
      .then((zeilen) => { if (!abgebrochen) setAuftragFahrzeuge(zeilen); })
      .catch(() => { if (!abgebrochen) setAuftragFahrzeuge([]); });
    return () => { abgebrochen = true; };
  }, [offenerAuftragId, supabase]);

  async function auftragFahrzeugeNeu(orderId: string) {
    setAuftragFahrzeuge(await fetchAuftragFahrzeuge(supabase, [orderId]));
  }
  async function fahrzeugHinzufuegen(orderId: string, vehicleId: string) {
    await addAuftragFahrzeug(supabase, orderId, vehicleId, null);
    await auftragFahrzeugeNeu(orderId);
  }
  // Ein Auto, das der Kunde noch nicht in der Kartei hat: erst anlegen, dann zuordnen. Es
  // bleibt beim Kunden stehen – beim nächsten Auftrag muss niemand das Kennzeichen noch
  // einmal tippen, genau wie bei der E-Mail-Adresse.
  async function rechnungsFahrzeugAnlegen(orderId: string, kundeId: string, kennzeichen: string) {
    const neueId = await insertVehicle(supabase, kundeId, { licensePlate: kennzeichen, makeModel: "", tireSize: "", note: "" });
    await addAuftragFahrzeug(supabase, orderId, neueId, null);
    await auftragFahrzeugeNeu(orderId);
    if (selectedId === kundeId) neuLaden(qk.kundeFahrzeuge(kundeId));
    neuLaden(qk.fahrzeuge());
  }
  async function kilometerstandSetzen(id: string, km: number | null) {
    await setKilometerstand(supabase, id, km);
    if (offenerAuftragId) await auftragFahrzeugeNeu(offenerAuftragId);
  }
  async function fahrzeugEntfernen(id: string) {
    await removeAuftragFahrzeug(supabase, id);
    if (offenerAuftragId) await auftragFahrzeugeNeu(offenerAuftragId);
  }
  // Die E-Mail-Adresse aus der Rechnungs-Abhakliste landet beim KUNDEN, nicht am Auftrag.
  async function kundenEmailSpeichern(kundeId: string, email: string) {
    // `previousAddress` bleibt unverändert: Wir ändern nur die E-Mail-Adresse, und eine
    // unveränderte Adresse soll keine erneute Geokodierung auslösen.
    const kunde = customers.find((c) => c.id === kundeId);
    await updateCustomerFieldsById(supabase, kundeId, { email }, kunde?.address);
    neuLaden(qk.kunden());
  }

  // Eine Rechnung ausstellen. Danach werden DREI Bestände nachgezogen: die Belege dieses
  // Auftrags (das Fenster zeigt sie), die Auftragsliste (der Trigger aus Migration 49 hat den
  // Haken gesetzt) und das Rechnungsbuch. Wer nur den ersten nachlädt, sieht die Rechnung –
  // und daneben weiter „Rechnung steht noch aus".
  // Aus der Rechnungsliste zum Auftrag springen.
  //
  // Nicht bloß `setOffenerAuftragId()`: Die Auftragsliste lädt standardmäßig nur die letzten
  // dreißig Tage. Eine Rechnung von vor einem halben Jahr zeigt auf einen Auftrag, der gar
  // nicht geladen ist – das Fenster fände nichts und bliebe einfach zu. Ein Klick, auf den
  // nichts passiert, ist die schlechteste aller Antworten. Deshalb wird das Zeitfenster
  // zugleich auf „Alle" gestellt; das Fenster geht auf, sobald die Zeile da ist.
  function auftragAusRechnungOeffnen(orderId: string) {
    setAuftragsFenster("alles");
    setTab("auftraege");
    setOffenerAuftragId(orderId);
  }

  async function rechnungAusstellen(entwurf: RechnungEntwurf) {
    const neu = await stelleRechnungAus(supabase, entwurf);
    await neuLaden(qk.auftragRechnungen(entwurf.order_id ?? "-"), qk.rechnungen());
    await refreshOrders();
    return neu;
  }

  async function rechnungStornieren(entwurf: RechnungEntwurf & { hebt_auf: string; storno_grund: string }) {
    const neu = await storniereRechnung(supabase, entwurf);
    await neuLaden(qk.auftragRechnungen(entwurf.order_id ?? "-"), qk.rechnungen());
    await refreshOrders();
    return neu;
  }
  async function deleteOrder(id: string) {
    await deleteOrderById(supabase, id);
    await refreshOrders();
  }

  // ---------------------------------------------------------------- Mitarbeiter (Einsatzplanung)
  async function addEmployee(name: string) {
    await insertEmployee(supabase, name);
    await refreshEmployees();
  }
  async function deleteEmployee(id: string) {
    await deleteEmployeeById(supabase, id);
    await refreshEmployees();
  }
  async function updateEmployeeProfile(employeeId: string, profileId: string | null) {
    await updateEmployeeProfileId(supabase, employeeId, profileId);
    await refreshEmployees();
  }

  // ---------------------------------------------------------------- Fahrzeuge
  async function addVehicle(customerId: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; note: string;
  }) {
    await insertVehicle(supabase, customerId, fields);
    await refreshVehicles();
  }

  // Fahrzeug aus dem Auftragsfenster heraus: anlegen UND dem eingelagerten Satz zuordnen.
  // Beides in einem Schritt, weil es fachlich einer ist – der Techniker steht am Auto und
  // sagt „das hier gehört zu diesem Satz".
  async function fahrzeugAusAuftragAnlegen(orderId: string, kennzeichen: string, modell: string, einlagerungId?: string) {
    const auftrag = orders.find((o) => o.id === orderId);
    if (!auftrag) return;
    const fahrzeugId = await insertVehicle(supabase, auftrag.customer_id, {
      licensePlate: kennzeichen, makeModel: modell, tireSize: "", note: "",
    });
    await refreshVehicles();
    // Dem Satz zuordnen, aus dessen Block heraus das Fahrzeug angelegt wurde. Ohne diese Id
    // landete es bei zwei Sätzen im falschen – vorher gab es nur einen, da war die Frage
    // nicht zu stellen.
    if (einlagerungId) {
      await updateTireStorageDetails(supabase, einlagerungId, { vehicleId: fahrzeugId });
      await refreshTireStorages();
    }
  }
  async function updateVehicle(id: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; note: string;
  }) {
    await updateVehicleById(supabase, id, fields);
    await refreshVehicles();
  }
  async function deleteVehicle(id: string) {
    await deleteVehicleById(supabase, id);
    await refreshVehicles();
  }

  async function saveSettingsPatch(patch: Partial<UserSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
    await updateUserSettings(supabase, liveRef.current.settings.user_id, patch);
  }
  saveSettingsRef.current = saveSettingsPatch;
  async function handleLogout() {
    await supabase.auth.signOut();
    // Der offline gespeicherte Datenbestand gehört zur Anmeldung, nicht zum Gerät. Ohne
    // dieses Leeren läge der Kundenbestand des Vorgängers auf einem weitergegebenen oder
    // verlorenen Handy weiter herum (siehe app/providers.tsx).
    await datenSpeicherLeeren();
    queryClient.clear();
    router.push("/login");
  }

  // ---------------------------------------------------------------- Ableitungen für die Liste
  //
  // Alles hier in useMemo: Filtern und Sortieren laufen über den gesamten Kundenbestand, und
  // localeCompare ist nicht billig – ohne Zwischenspeicherung würde das bei jedem Rendern der
  // Komponente erneut passieren, also auch beim Öffnen eines Popovers.
  const activeCustomers = useMemo(() => customers.filter((c) => c.active !== false), [customers]);
  // Alle Filter AUSSER dem Zustandsfilter. Dieser Zwischenstand ist die Grundlage für die
  // Zahlen an den Filterknöpfen: dort soll stehen, wie viele Kunden ein Klick übrig ließe –
  // also gerechnet auf dem, was Suche, Buchstabe und Postleitzahl schon eingegrenzt haben,
  // aber ohne den Zustandsfilter selbst. Rechnete man ihn mit, stünde am aktiven Knopf seine
  // eigene Trefferzahl und an allen anderen eine Null.
  const vorgefiltert = useMemo(
    () =>
      activeCustomers
        .filter((c) => {
          if (!search) return true;
          const s = search.toLowerCase();
          // Firma und E-Mail gehören mit in die Suche: sonst findet man einen Geschäftskunden
          // nur über den Ansprechpartner, dessen Namen im Alltag niemand parat hat.
          return c.name.toLowerCase().includes(s)
            || c.address.toLowerCase().includes(s)
            || (c.company || "").toLowerCase().includes(s)
            || (c.email || "").toLowerCase().includes(s);
        })
        .filter((c) => !letterFilter || c.name.trim().charAt(0).toUpperCase() === letterFilter)
        .filter((c) => {
          if (!plzFilter.trim()) return true;
          const match = c.address.match(/\b\d{5}\b/);
          return !!match && match[0].startsWith(plzFilter.trim());
        }),
    [activeCustomers, search, letterFilter, plzFilter]
  );

  // Wer hat einen Termin vor sich? Einmal gebildet und dann überall nachgeschlagen – die
  // Kundenliste, die Karte, die Zähler und das Kundenfenster fragen dieselbe Menge.
  const mitTermin = useMemo(() => kundenMitTermin(orders), [orders]);
  // Kurzform, damit die Aufrufstellen nicht jedes Mal dasselbe Set durchreichen müssen.
  // Heißt `kundenZustand` und nicht `zustand`: Im Nadel-Filter weiter unten läuft eine
  // Schleife über `KUNDEN_ZUSTAND_REIHENFOLGE`, deren Laufvariable sonst denselben Namen
  // trüge – zwei verschiedene Dinge unter einem Namen im selben Bauteil.
  const kundenZustand = useCallback(
    (c: Customer) => effectiveColor(c, settings.period_months, todayStr(), mitTermin.has(c.id)),
    [settings.period_months, mitTermin]
  );

  // Ein Durchlauf für alle sechs Zahlen statt sechs Durchläufe. Bei 4500 Kunden ist das der
  // Unterschied zwischen einmal und sechsmal Rechnen bei jedem Tastendruck im Suchfeld.
  const filterZahlen = useMemo(() => {
    const z = { all: vorgefiltert.length, offen: 0, ok: 0, wiedervorlage: 0, termin: 0, kein_interesse: 0, nogeo: 0 };
    vorgefiltert.forEach((c) => {
      if (c.lat == null) z.nogeo++;
      const farbe = kundenZustand(c);
      if (farbe === "red") z.offen++;
      else if (farbe === "green") z.ok++;
      else if (farbe === "wiedervorlage") z.wiedervorlage++;
      else if (farbe === "termin") z.termin++;
      // Nur „kein Interesse" zählt hier. Bis zum 24.09.2026 stand ein bloßes `else` – damit
      // zählte die Laufkundschaft unter „kein Interesse" mit, und der Einmalkunde täte es auch.
      else if (farbe === "kein-interesse") z.kein_interesse++;
    });
    return z;
  }, [vorgefiltert, kundenZustand]);

  // Zahlen für den Kartenfilter: gezählt wird, was überhaupt auf der Karte landen kann – also
  // aktive Kunden MIT Position. Bewusst ohne Such- und Buchstabenfilter, denn die betreffen nur
  // die Liste; die Karte zeigt immer alle. Sonst stünde am Schalter eine Zahl, die nicht zu dem
  // passt, was man vor sich sieht.
  const kartenZahlen = useMemo(() => {
    const z: Record<KundenZustand, number> = { red: 0, wiedervorlage: 0, termin: 0, green: 0, "kein-interesse": 0, laufkundschaft: 0, einmalkunde: 0 };
    activeCustomers.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      z[kundenZustand(c)]++;
    });
    return z;
  }, [activeCustomers, kundenZustand]);

  const listItems = useMemo(
    () =>
      vorgefiltert
        .filter((c) => {
          if (filter === "all") return true;
          if (filter === "nogeo") return c.lat == null;
          const color = kundenZustand(c);
          if (filter === "offen") return color === "red";
          if (filter === "ok") return color === "green";
          if (filter === "wiedervorlage") return color === "wiedervorlage";
          if (filter === "termin") return color === "termin";
          if (filter === "kein_interesse") return color === "kein-interesse";
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [vorgefiltert, filter, kundenZustand]
  );
  // Nur ein Ausschnitt der Treffer landet im Dokument, nachladbar per Knopf am Listenende.
  // Gefiltert und gezählt wird weiterhin über alle Kunden.
  const sichtbareListItems = useMemo(() => listItems.slice(0, listenGrenze), [listItems, listenGrenze]);
  const availableLetters = useMemo(
    () =>
      Array.from(new Set(activeCustomers.map((c) => c.name.trim().charAt(0).toUpperCase()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "de")),
    [activeCustomers]
  );
  const statTotal = activeCustomers.length;
  const statOk = useMemo(
    () => activeCustomers.filter((c) => kundenZustand(c) === "green").length,
    [activeCustomers, kundenZustand]
  );
  const inactiveCustomers = useMemo(
    () => customers.filter((c) => c.active === false).sort((a, b) => a.name.localeCompare(b.name, "de")),
    [customers]
  );

  // Termine-Tab: Auftrag = Termin (siehe Migration 07), hier einfach chronologisch alle
  // Aufträge mit ihrem Kunden – gleiche Datenbasis wie das Aufträge-Modul.
  // Welche Lagerplätze gerade belegt sind – einmal je Neuzeichnen gebildet statt je Zeile neu
  // durch alle Einlagerungen zu laufen. Ein Set, weil danach nur noch nachgeschlagen wird.
  //
  // Steht bewusst HIER, oberhalb des `if (loading) return` weiter unten: ein Hook hinter einem
  // vorzeitigen Rücksprung wird beim nächsten Durchlauf nicht mehr aufgerufen, und React
  // verliert die Zuordnung seiner Hooks. Die ESLint-Regel react-hooks/rules-of-hooks hat genau
  // das hier abgefangen.
  const belegteSlotIds = useMemo(
    () => new Set(tireStorages.filter((t) => !t.removed_at).map((t) => t.storage_slot_id)),
    [tireStorages]
  );

  // Alle Termine (= Aufträge mit Datum) aktiver Kunden, chronologisch. Der Zeitraumfilter
  // greift erst danach, damit an jedem Filterknopf seine eigene Trefferzahl stehen kann –
  // dasselbe Muster wie bei den Kundenfiltern.
  const alleTermine = useMemo(
    () =>
      customers
        .filter((c) => c.active !== false)
        // `kundeZumAuftrag`: Bei der Laufkundschaft steht der eingetragene Laufkunde da, mit
        // seiner Nummer und seinem Einsatzort (Migration 57, lib/laufkunde.ts).
        .flatMap((c) => (auftraegeJeKunde[c.id] || KEINE_AUFTRAEGE).map((o) => ({ cust: kundeZumAuftrag(o, c) ?? c, order: o, past: isOrderPast(o) })))
        .sort((a, b) => orderDateTime(a.order).getTime() - orderDateTime(b.order).getTime()),
    [customers, auftraegeJeKunde]
  );

  function imZeitraum(r: { order: Order; past: boolean }, wert: TerminFilter): boolean {
    if (wert === "alle") return true;
    if (wert === "anstehend") return !r.past;
    const heute = todayStr();
    if (wert === "heute") return r.order.order_date === heute;
    const morgen = new Date(heute + "T00:00:00");
    morgen.setDate(morgen.getDate() + 1);
    const morgenStr = morgen.toISOString().slice(0, 10);
    if (wert === "morgen") return r.order.order_date === morgenStr;
    // 7 Tage: ab heute, sieben Tage nach vorn – die Woche, die man planen kann.
    const grenze = new Date(heute + "T00:00:00");
    grenze.setDate(grenze.getDate() + 7);
    return r.order.order_date >= heute && r.order.order_date <= grenze.toISOString().slice(0, 10);
  }

  const apptRows = useMemo(
    () => alleTermine.filter((r) => imZeitraum(r, terminFilter)),
    [alleTermine, terminFilter]
  );

  const terminZahlen = useMemo(() => {
    const z = { heute: 0, morgen: 0, woche: 0, anstehend: 0, alle: alleTermine.length };
    alleTermine.forEach((r) => {
      if (imZeitraum(r, "heute")) z.heute++;
      if (imZeitraum(r, "morgen")) z.morgen++;
      if (imZeitraum(r, "woche")) z.woche++;
      if (!r.past) z.anstehend++;
    });
    return z;
  }, [alleTermine]);

  // ---------------------------------------------------------------- Saisonliste
  //
  // Eine Sicht auf die aktiven Einlagerungen, keine zweite Datenhaltung: Satz + Saison + Kunde
  // + Fahrzeug + Platz. Sie entsteht vollständig aus dem Feld, das Migration 30 gebracht hat.
  //
  // Sätze OHNE Saison verschwinden nicht, sie tauchen unter „Alle" auf. Sie stillschweigend
  // wegzufiltern hieße, eine Lücke unsichtbar zu machen – und die Liste behauptete
  // Vollständigkeit, die sie nicht hat.
  // Der heute gültige Monatspreis der Lagergebühr, für die Langlieger-Übersicht (Fahrplan E4).
  // Gibt es mehrere Gebührenartikel, zählt der erste aktive – derselbe, den der Auslagern-Dialog
  // vorschlägt. Ohne gepflegten Preis null: Dann rechnet die Übersicht nur in Monaten.
  const lagergebuehrJeMonat = useMemo(() => {
    const artikel = articles.find((a) => a.active && a.abrechnungsart === "lagergebuehr");
    if (!artikel) return null;
    return currentArticlePrice(articlePrices.filter((p) => p.article_id === artikel.id), todayStr())?.net_price ?? null;
  }, [articles, articlePrices]);

  const saisonZeilen = useMemo<SaisonZeile[]>(() => {
    if (tab !== "saison") return [];
    const kundeNach = new Map(customers.map((c) => [c.id, c]));
    const fahrzeugNach = new Map(alleFahrzeuge.map((v) => [v.id, v]));
    const platzNach = new Map(storageSlots.map((sl) => [sl.id, sl]));
    const raederNach = raederNachSatz(eingelagerteRaeder);

    return tireStorages
      .filter((ts) => !ts.removed_at)
      .map((ts) => ({
        einlagerung: ts,
        cust: kundeNach.get(ts.customer_id),
        vehicle: ts.vehicle_id ? fahrzeugNach.get(ts.vehicle_id) ?? null : null,
        slot: platzNach.get(ts.storage_slot_id) ?? null,
        raeder: raederNach.get(ts.id) ?? [],
      }))
      // Ohne Kunden keine Zeile: der Kunde kann gelöscht (Migration 19) oder außerhalb des
      // geladenen Bestands sein. Eine Zeile ohne Namen hilft niemandem beim Telefonieren.
      .filter((z): z is SaisonZeile => Boolean(z.cust))
      .filter((z) => (saisonFilter === "alle" ? true : z.einlagerung.saison === saisonFilter))
      .filter((z) => (saisonPlz ? (plzAus(z.cust.address) || "").startsWith(saisonPlz) : true))
      .filter((z) => (saisonNurFaellige ? kundenZustand(z.cust) === "red" : true))
      // Sätze ohne Messung fallen hier heraus – nicht, weil sie in Ordnung wären, sondern
      // weil über sie nichts bekannt ist. Sie als „schwach" zu führen, wäre eine Behauptung.
      .filter((z) => {
        if (!saisonNurSchwach) return true;
        const mm = satzProfilMm(z.einlagerung, z.raeder);
        return mm != null && mm < PROFIL_KRITISCH_MM;
      })
      .sort((a, b) => a.cust.name.localeCompare(b.cust.name, "de"));
  }, [tab, tireStorages, eingelagerteRaeder, customers, alleFahrzeuge, storageSlots, saisonFilter, saisonPlz, saisonNurFaellige, saisonNurSchwach, kundenZustand]);

  async function saisonWiedervorlageSetzen(kundenIds: string[], datum: string) {
    setSaisonSchreibt(true);
    try {
      await setWiedervorlageBulk(supabase, kundenIds, datum);
      await neuLaden(qk.kunden());
    } finally {
      setSaisonSchreibt(false);
    }
  }

  // Welche Kunden zeigt die Karte? In „Termine" die mit Terminen im gewählten Zeitraum, in
  // „Saisonliste" die mit passendem eingelagerten Satz – sonst stünden dort weiterhin alle
  // 424 Kunden und die eigentliche Frage bliebe unbeantwortet. `null` heißt: keine
  // Einschränkung.
  const terminKundenIds = useMemo(() => {
    if (tab === "termine") return new Set(apptRows.map((r) => r.cust.id));
    if (tab === "saison") return new Set(saisonZeilen.map((z) => z.cust.id));
    return null;
  }, [tab, apptRows, saisonZeilen]);
  terminKundenRef.current = terminKundenIds;
  // Eigener Effekt und nicht als weitere Abhängigkeit oben: `terminKundenIds` entsteht erst
  // hier, der Karteneffekt steht viel weiter oben bei den übrigen Karten-Sachen. Ein Hook, der
  // eine noch nicht deklarierte Variable liest, ist zur Laufzeit ein Fehler – und einer, den
  // TypeScript nur sieht, weil die Abhängigkeitsliste ihn direkt nennt.
  useEffect(() => { syncMarkers(); }, [terminKundenIds]);

  // Ein gemerkter Kalender-Termin gilt nur so lange, wie das Kundenformular offen ist. Wer
  // abbricht und Wochen später einen Kunden anlegt, soll nicht die Uhrzeit von damals erben –
  // das wäre ein Fehler, den man erst im Kalender sieht und dann nicht erklären kann.
  useEffect(() => {
    if (tab !== "add") setTerminFuerNeuenKunden(null);
  }, [tab]);

  // Aufruf über einen QR-Aufkleber am Regal: die App öffnet sich mit ?lagerplatz=‹Kennung›.
  // Bewusst über `window.location` statt `useSearchParams()`: dieser Baum ist vollständig auf
  // dem Client zuhause, und `useSearchParams` verlangte in Next 14 eine Suspense-Grenze und
  // machte die Seite dynamisch – Aufwand ohne Gegenwert für einen einzelnen Parameter.
  //
  // Die Adresszeile wird sofort wieder bereinigt: sonst landet der Parameter in Lesezeichen und
  // im Verlauf, und ein Neuladen springt Wochen später wieder auf denselben Lagerplatz.
  useEffect(() => {
    const parameter = new URLSearchParams(window.location.search);
    const rohPlatz = parameter.get(LAGERPLATZ_PARAMETER);
    const rohSatz = parameter.get(SATZ_PARAMETER);
    if (!rohPlatz && !rohSatz) return;
    const platzId = rohPlatz ? lagerplatzIdAusCode(rohPlatz) : null;
    // Für den Satz genügt hier die reine Kennung – dass es ein Satz-Etikett war, sagt schon der
    // Parametername, und `satzIdAusCode` erwartet den vollen Link.
    parameter.delete(LAGERPLATZ_PARAMETER);
    parameter.delete(SATZ_PARAMETER);
    const rest = parameter.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (platzId) {
      setGescannterLagerplatzId(platzId);
      setTab("lager");
      return;
    }
    if (rohSatz) {
      setGescannterSatzId(rohSatz.toLowerCase());
      setTab("lager");
    }
  }, []);

  // Den gescannten Satz auflösen, sobald der Bestand geladen ist.
  //
  // Liegt er noch im Regal, springt die Regalwand auf seinen PLATZ – dort stehen Kunde,
  // Fahrzeug, Saison und Profil beisammen, also genau die Antwort auf „wem gehört der hier".
  // Ist er schon ausgelagert, wäre das falsch: Auf dem Platz liegt womöglich längst der Satz
  // eines anderen. Dann geht das Kundenfenster auf – die Frage bleibt dieselbe, nur die beste
  // Antwort ist eine andere.
  useEffect(() => {
    if (!gescannterSatzId || tireStorages.length === 0) return;
    const satz = tireStorages.find((t) => t.id === gescannterSatzId);
    setGescannterSatzId(null);
    if (!satz) return;
    if (satz.removed_at) {
      openDetail(satz.customer_id);
      return;
    }
    setGescannterLagerplatzId(satz.storage_slot_id);
  }, [gescannterSatzId, tireStorages]);

  // Ziel einer angetippten Terminerinnerung öffnen (docs/benachrichtigungen-plan.md, Teil 5).
  //
  // `auftrag` hat Vorrang vor `kunde`: Der Techniker steht im Auto und braucht diesen einen
  // Termin mit Fahrzeug, Leistungen, Navigation und Anruf – nicht die Kundenakte.
  //
  // Der Aufruf ist auch dann richtig, wenn die Listen noch laden: beide Fenster merken sich die
  // Kennung und erscheinen, sobald der Bestand da ist.
  function zielOeffnen(parameter: URLSearchParams): void {
    // „Anrufen" zuerst: Diese Meldung hat genau einen Zweck, und wer sie antippt, hat das Handy
    // schon am Ohr im Sinn – da ist jedes andere Fenster im Weg.
    const anrufId = parameter.get(ANRUF_PARAMETER);
    if (anrufId) {
      setAnrufKundeId(anrufId);
      // Der Kunde kann am Rechner neu angelegt worden sein; der gespeicherte Stand auf dem
      // Handy kennt ihn dann nicht. Dasselbe Muster wie beim Auftrag aus der Terminerinnerung.
      void neuLaden(qk.kunden());
      return;
    }
    // Abendhinweis „Reifen mitnehmen": die Liste für den genannten Tag. Nur ein gültiges Datum –
    // ein verstümmelter Parameter öffnet nichts, statt eine leere Liste zu zeigen.
    const mitnehmen = parameter.get(MITNEHMEN_PARAMETER);
    if (mitnehmen && /^\d{4}-\d{2}-\d{2}$/.test(mitnehmen)) {
      setMitnehmenDatum(mitnehmen);
      // Aufträge und Lager frisch holen: Der gespeicherte Stand auf dem Handy kann von heute
      // Mittag sein, der Hinweis rechnet mit dem Stand von eben.
      void auftraegeNeuLaden();
      void neuLaden(qk.einlagerungen());
      return;
    }
    const auftragId = parameter.get(AUFTRAG_PARAMETER);
    if (auftragId) {
      setOffenerAuftragId(auftragId);
      // UND neu laden. Sonst passiert bei genau dem wichtigsten Fall nichts Sichtbares: Der
      // Auftrag wurde am Rechner angelegt, das Handy zeigt seinen gespeicherten Stand von
      // vorhin und kennt ihn deshalb gar nicht – das Fenster hätte nichts anzuzeigen und
      // bliebe stumm zu. Der Auftrag erscheint dann, sobald der Abruf zurück ist.
      void auftraegeNeuLaden();
      return;
    }
    const kundenId = parameter.get(KUNDE_PARAMETER);
    if (kundenId) {
      openDetail(kundenId);
      setTab("list");
      void neuLaden(qk.kunden());
    }
  }

  // Weg 1: Die App war geschlossen. Der Service Worker hat ein Fenster mit `?auftrag=…`
  // geöffnet, hier wird der Parameter gelesen. Die Adresszeile wird sofort bereinigt – sonst
  // landet der Parameter in Lesezeichen und im Verlauf, und ein Neuladen springt Wochen später
  // wieder auf denselben Auftrag.
  useEffect(() => {
    const parameter = new URLSearchParams(window.location.search);
    if (!parameter.get(AUFTRAG_PARAMETER) && !parameter.get(KUNDE_PARAMETER) && !parameter.get(ANRUF_PARAMETER)
      && !parameter.get(MITNEHMEN_PARAMETER)) return;
    const uebrig = new URLSearchParams(window.location.search);
    uebrig.delete(MITNEHMEN_PARAMETER);
    uebrig.delete(AUFTRAG_PARAMETER);
    uebrig.delete(KUNDE_PARAMETER);
    uebrig.delete(ANRUF_PARAMETER);
    const rest = uebrig.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    zielOeffnen(parameter);
  }, []);

  // Weg 2: Die App lief schon (auf dem Handy der Normalfall – sie wird weggelegt, nicht
  // geschlossen). Dann schickt der Service Worker das Ziel als Nachricht hierher.
  //
  // Weg 3 – und das ist der, der auf dem iPhone trägt: Der Service Worker legt das Ziel
  // zusätzlich in der Cache Storage ab, und die Anwendung sieht dort nach, sobald sie sichtbar
  // wird. Nötig, weil die beiden schnelleren Wege in der installierten App auf iOS versagen
  // können: `client.navigate()` bewirkt dort nichts, und eine Nachricht an ein eingefrorenes
  // Fenster kann verworfen werden. Beobachtet am 09.09.2026: Die App kam nach dem Antippen
  // schlicht dort wieder hoch, wo sie zuletzt war.
  //
  // Doppelt geöffnet wird nichts: `zielAbholen` entfernt den Eintrag beim ersten Zugriff.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    function zielAusAdresse(adresse: string) {
      try {
        zielOeffnen(new URL(adresse, window.location.origin).searchParams);
      } catch {
        // Eine unbrauchbare Adresse ist kein Grund, die Anwendung zu stören.
      }
    }
    function beiNachricht(ereignis: MessageEvent) {
      const daten = ereignis.data;
      if (!daten || daten.typ !== "BENACHRICHTIGUNG_ZIEL" || typeof daten.url !== "string") return;
      void zielAbholen();
      zielAusAdresse(daten.url);
    }
    async function ausSpeicherNachsehen() {
      const adresse = await zielAbholen();
      if (adresse) zielAusAdresse(adresse);
    }
    function beiSichtbar() {
      if (document.visibilityState === "visible") void ausSpeicherNachsehen();
    }

    navigator.serviceWorker.addEventListener("message", beiNachricht);
    document.addEventListener("visibilitychange", beiSichtbar);
    window.addEventListener("focus", beiSichtbar);
    // `pageshow` zusätzlich: Holt iOS eine eingefrorene Seite aus dem Vor-/Zurück-Speicher
    // zurück, ist das kein Sichtbarkeitswechsel – dann feuert nur dieses Ereignis. Genau so
    // kommt eine installierte App nach dem Antippen einer Meldung wieder nach vorn.
    window.addEventListener("pageshow", beiSichtbar);
    void ausSpeicherNachsehen();
    return () => {
      navigator.serviceWorker.removeEventListener("message", beiNachricht);
      document.removeEventListener("visibilitychange", beiSichtbar);
      window.removeEventListener("focus", beiSichtbar);
      window.removeEventListener("pageshow", beiSichtbar);
    };
  }, []);

  function openDetail(id: string) {
    setSelectedId(id);
    loadHistory(id);
    const cust = customers.find((c) => c.id === id);
    if (cust?.lat != null && mapRef.current) mapRef.current.setView([cust.lat, cust.lng], Math.max(mapRef.current.getZoom(), 15));
  }

  // Punkt setzen: starten, speichern, abbrechen. Drei kleine Funktionen statt einer großen,
  // weil sie an drei verschiedenen Stellen aufgerufen werden.
  async function positionSetzenStarten(kundenId: string) {
    const kunde = customers.find((c) => c.id === kundenId);
    setSelectedId(null);            // Das Kundenfenster liegt sonst über der Karte.
    // Die Karte legt sich als ganze Fläche über die Seite (CSS-Klasse `punkt-setzen`), statt
    // den Reiter zu wechseln. Grund: Auf Reitern wie Admin, Lager oder Aufträge ist die
    // Kartenspalte auf null zusammengeklappt – „tippe auf die Karte" wäre dort eine Anweisung
    // ins Leere. Ein Reiterwechsel wiederum würde die Adressprüfung ausbauen und beim
    // Zurückkommen ihre 53 Vorschläge neu suchen lassen. Die Karte steckt ohnehin immer im
    // Seitengerüst; sie muss nur sichtbar werden.
    setPositionSetzenFuer(kundenId);

    // Der Startpunkt entscheidet, ob das Ganze etwas taugt: Ohne ihn stünde man irgendwo über
    // Nürnberg und müsste die Straße selbst suchen.
    if (kunde?.lat != null && kunde.lng != null) {
      // Vorhandene Position: nah heran, es geht nur noch ums Feinjustieren.
      setPositionSetzenZiel({ lat: kunde.lat, lng: kunde.lng, zoom: 18 });
      return;
    }
    setPositionSetzenZiel(null);
    if (!kunde?.address) return;
    // Keine Position gespeichert – dann jetzt wenigstens die Straße suchen. Genau dafür gibt
    // es seit Migration 35 den zweiten Versuch ohne Hausnummer: Er liefert die Straßenmitte,
    // und von dort sind es ein paar Meter bis zum richtigen Haus.
    setPositionSetzenSucht(true);
    try {
      const res = await geocodeAddress(kunde.address);
      // Bei einem Straßentreffer eine Stufe weiter weg: Der Punkt ist die Straßenmitte, und
      // die gesuchte Hausnummer kann am anderen Ende liegen. Zoom 18 zeigte womöglich nur
      // Häuser, unter denen die richtige gar nicht ist.
      if (res) setPositionSetzenZiel({ lat: res.lat, lng: res.lng, zoom: res.genauigkeit === "exakt" ? 18 : 17 });
    } catch {
      // Kein Treffer, kein Dienst – dann bleibt die Karte, wo sie ist, und der Balken sagt es.
    } finally {
      setPositionSetzenSucht(false);
    }
  }

  function positionSetzenBeenden(kundenId: string | null, kundeOeffnen: boolean) {
    setPositionSetzenFuer(null);
    setPositionSetzenZiel(null);
    if (kundeOeffnen && kundenId) openDetail(kundenId);
  }

  async function positionAusKarteSpeichern(kundenId: string, lat: number, lng: number) {
    const kunde = liveRef.current.customers.find((c) => c.id === kundenId);
    // Nachfragen, weil ein Fehltipper auf einer Karte schnell passiert – und weil die Angabe
    // danach die genaueste im System ist und von keinem Sammellauf mehr überschrieben wird.
    const sicher = window.confirm(
      `Position für ${kunde ? kunde.name : "diesen Kunden"} hier setzen?\n\n` +
      "Sie gilt ab dann als von Hand gesetzt und wird bei keinem Geokodier-Lauf mehr verändert."
    );
    if (!sicher) return;
    await setzePositionVonHand(supabase, kundenId, lat, lng);
    await refreshCustomers();
    positionSetzenBeenden(kundenId, true);   // Zurück dorthin, wo man hergekommen ist.
  }

  function toggleMobileMap() {
    // Kein invalidateSize() auf Verdacht mehr: die Karte wechselt hier von display:none auf
    // sichtbar, das ist eine echte Größenänderung, und der ResizeObserver weiter oben meldet
    // sie zuverlässiger als ein geschätzter Timer.
    setMobileMapVisible((v) => !v);
  }

  // Popover-Menüs (Anrufen, Navigation, Mitarbeiter-Zuordnung) dürfen nie unten aus dem
  // sichtbaren Fenster herauslaufen, sonst sind die unteren Einträge weder sichtbar noch
  // anklickbar (genau das wurde beim Mitarbeiter-Menü nahe am unteren Bildschirmrand gemeldet).
  // `estHeight` ist eine grobe Schätzung der Menühöhe – reicht sie nicht, öffnet sich das Menü
  // stattdessen nach oben statt nach unten.
  function clampMenuTop(buttonRect: DOMRect, estHeight: number): number {
    const margin = 8;
    if (buttonRect.bottom + 4 + estHeight <= window.innerHeight - margin) return buttonRect.bottom + 4;
    return Math.max(margin, buttonRect.top - 4 - estHeight);
  }

  // Anrufen – die einzige Stelle, an der das entschieden wird. Eine Nummer: sofort wählen,
  // ohne Zwischenfrage. Mehrere: erst fragen, welche. Das stand bis zum 05.09.2026 an drei
  // Stellen fast gleich im Code, mit drei verschiedenen Verhaltensweisen – im Kundenfenster
  // erschien das Menü sogar immer an derselben Bildschirmecke statt am Knopf.
  function anrufAusloesen(cust: Customer, rect: DOMRect) {
    const nums = getPhoneNumbers(cust);
    // Am Handy bleibt alles wie bisher: eine Nummer, sofort wählen. Dort ist das Gerät, mit dem
    // telefoniert wird, ohnehin in der Hand – eine Rückfrage wäre nur ein Tippen mehr.
    //
    // Am Rechner erscheint immer das Menü, auch bei nur einer Nummer: Dort gibt es seit
    // "Weg 3" zwei verschiedene Antworten auf denselben Klick – hier wählen (über den
    // Smartphone-Link) oder die Nummer aufs Handy schicken. Eine Entscheidung, die es gibt,
    // muss man auch treffen können.
    if (!amRechner() && nums.length <= 1) {
      if (nums.length === 1) window.location.href = "tel:" + telHref(nums[0].number);
      return;
    }
    if (nums.length === 0) return;
    setHandyMeldung(null);
    setCallMenuPos({ top: clampMenuTop(rect, 60 + nums.length * 38), left: Math.min(rect.left, window.innerWidth - 220) });
    setCallMenuFor(cust);
  }
  // Sitzt hier ein Handy oder ein Rechner? Die Begründung für diesen Weg steht bei `istHandy`
  // in lib/helpers.ts – kurz: Die Medienabfrage nach Maus und Schweben lieferte auf dem
  // Arbeitsnotebook `false`, weil es einen Touchscreen hat.
  function amRechner(): boolean {
    if (typeof navigator === "undefined") return false;
    return !istHandy(navigator.userAgent, navigator.maxTouchPoints || 0);
  }

  async function aufsHandySchicken(cust: Customer) {
    setHandyMeldung({ ok: true, text: "Wird geschickt …" });
    const ergebnis = await anrufAufsHandy(cust.id);
    setHandyMeldung(ergebnis);
    // Bei Erfolg schließt sich das Menü von selbst – die Antwort steht dann auf dem Handy.
    // Bei einem Fehler bleibt es offen, sonst verschwände die Begründung mit ihm.
    if (ergebnis.ok) window.setTimeout(() => { setCallMenuFor(null); setHandyMeldung(null); }, 1200);
  }

  function openCallMenu(e: React.MouseEvent, cust: Customer) {
    e.stopPropagation();
    anrufAusloesen(cust, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }

  // Navigations-Button in Auftrags-/Termin-Zeilen: fragt per kleinem Menü (wie beim
  // Anrufen-Icon), ob mit Google Maps oder Apple Karten navigiert werden soll.
  function openNavMenu(e: React.MouseEvent, cust: Customer) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setNavMenuPos({ top: clampMenuTop(rect, 90), left: Math.min(rect.left, window.innerWidth - 190) });
    setNavMenuFor(cust);
  }

  // Öffnet das Mitarbeiter-Zuordnungs-Menü für einen Auftrag (Aufträge-Tab & Einsatzplanung).
  function openEmpMenu(e: React.MouseEvent, orderId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const estHeight = 40 + Math.max(1, employees.length) * 34;
    setEmpMenuPos({ top: clampMenuTop(rect, estHeight), left: Math.min(rect.left, window.innerWidth - 210) });
    setEmpMenuFor({ orderId, ids: orderEmployees[orderId] || [] });
  }
  async function toggleEmpMenuEmployee(employeeId: string) {
    if (!empMenuFor) return;
    const next = empMenuFor.ids.includes(employeeId) ? empMenuFor.ids.filter((id) => id !== employeeId) : [...empMenuFor.ids, employeeId];
    setEmpMenuFor({ ...empMenuFor, ids: next });
    await setOrderEmployees(empMenuFor.orderId, next);
  }
  // Kurzform für die Anzeige "Paul, Roman" / "–" in Tabellenzeilen.
  function employeeNamesFor(orderId: string): string {
    const ids = orderEmployees[orderId] || [];
    const names = ids.map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean) as string[];
    return names.length ? names.join(", ") : "–";
  }

  // Kurzform für die Anzeige in Tabellenzeilen: Bruttosumme, oder "–", wenn noch keine Leistung
  // zugeordnet ist.
  function orderArticlesLabel(orderId: string): string {
    const rows = orderArticlesFor(orderId);
    if (rows.length === 0) return "–";
    // Ohne „Rechnung benötigt" gibt es keinen Bruttobetrag – dann ist der Nettobetrag der
    // Betrag. `?? false` ist die ehrliche Annahme, wenn der Auftrag gerade nicht geladen ist:
    // lieber zu wenig behaupten als eine Steuer, die vielleicht gar nicht anfällt.
    const auftrag = orders.find((o) => o.id === orderId);
    const totals = orderArticleTotals(rows, auftrag?.rechnung_noetig ?? false);
    return `${rows.length} · ${formatEUR(totals.gross)}`;
  }

  if (loading) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Lädt…</div>;
  }

  const upcomingApptCount = apptRows.filter((r) => !r.past).length;
  // Belegte und vorhandene Lagerplätze kommen als zwei count-Abfragen aus der Datenbank, statt
  // dafür das komplette Lager in den Browser zu laden und dort gegeneinander zu rechnen
  // (Roadmap Phase 10). Seit Migration 15 belegt eine aktive Einlagerung genau einen Platz.
  const occupiedSlots = lagerKennzahlenQuery.data?.belegt ?? 0;
  const slotsGesamt = lagerKennzahlenQuery.data?.gesamt ?? 0;
  const openOrders = orders.filter((o) => o.status !== "erledigt").length;
  // Hauptnavigation: Dashboard/Einsatzplanung/Aufträge/Kunden stehen vorn (lib/module.ts). Alles andere ist auf dem
  // Desktop Teil der breiten Seitenleiste (wie in einem ERP-System), auf dem Handy dagegen
  // hinter "Weitere" versteckt, damit die schmale Leiste dort nicht überladen wirkt.
  const isMoreActive = SEKUNDAERE_TABS.includes(tab);

  return (
    <div
      id="app"
      ref={appRef}
      className={[fullPageTabs ? "vollseite" : "", positionSetzenFuer ? "punkt-setzen" : ""].filter(Boolean).join(" ") || undefined}
    >
      <OfflineHinweis standVon={kundenQuery.dataUpdatedAt} offline={istOffline} />
      <nav id="iconNav">
        {/* Bildmarke UND Schriftzug. Der Schriftzug ist echter Text, nicht Teil des Bildes:
            er steht damit in der Hausschrift, bleibt bei jeder Vergrößerung scharf, ist
            durchsuchbar und für Vorleseprogramme lesbar. Die Wortmarke aus der Logodatei ist
            für 1400 px Breite gezeichnet und wäre hier unlesbar klein (siehe
            docs/design-system.md). */}
        <div className="nav-brand">
          <IconMarke />
          <h1>Vi<span className="brand-accent">ana</span> PinPoints</h1>
        </div>
        {/* Aus der Modulliste erzeugt (lib/module.ts). Vorher stand dieselbe Aufzählung hier
            UND weiter unten auf der Kachelseite „Weitere" – zweimal von Hand gepflegt, und
            genau deshalb fehlten am 10.09.2026 zwei Module auf dem Handy. */}
        {MODULE.map((m) => {
          if (!modulSichtbar(m.sichtbar)) return null;
          return (
            <Fragment key={m.tab}>
              {m.trennerDavor === "linie" && <div className="nav-divider nav-secondary" />}
              {m.trennerDavor === "abstand" && <div className="nav-spacer nav-secondary" />}
              <NavItem
                className={m.primaer ? undefined : "nav-secondary"}
                active={tab === m.tab}
                onClick={() => setTab(m.tab)}
                icon={<m.Icon />}
                label={m.label}
              />
            </Fragment>
          );
        })}

        <NavItem className="nav-more-btn" active={isMoreActive} onClick={() => setTab("more")} icon={<IconMore />} label="Weitere" />
      </nav>

      <div
        id="sidebar"
        ref={sidebarRef}
        // Die Breite kommt jetzt allein aus der Rasterspalte von #app (siehe globals.css) –
        // dieses Element hat dazu nichts mehr zu sagen. Hier stand vorher ein `key`, der den
        // Knoten bei jedem Wechsel zwischen Vollseiten-Modul und normalem Tab komplett neu
        // aufbauen ließ, weil der Inhalt sonst "abgeschnitten" stehenblieb. Das war die
        // Behandlung eines Symptoms: ein neu erzeugter Knoten umging das widersprüchliche
        // Flexbox-Layout, statt es zu beheben. Mit festen Rasterspalten entsteht der
        // Zwischenzustand gar nicht erst, und der Teilbaum darf erhalten bleiben – was
        // nebenbei Scrollposition und Eingabefokus über einen Tabwechsel hinweg rettet.
        className={mobileMapVisible ? "mobile-hidden" : ""}
      >
        {/* Marke nur auf dem Handy hier zeigen (dort ist .nav-brand in #iconNav per CSS
            ausgeblendet, weil #iconNav zur schmalen Bottom-Bar wird) – auf Desktop/Tablet
            steht die Bildmarke bereits oben in #iconNav, ein zweites Logo hier wäre
            Redundanz (siehe docs/design-system.md). Steuerung über .app-brand-header in
            globals.css, kein zusätzlicher State nötig. */}
        <header className="app-brand-header">
          <div className="app-brand">
            <IconMarke />
            <h1>
              Vi<span className="brand-accent">ana</span> PinPoints
            </h1>
          </div>
        </header>

        {/* Das Dashboard (25.09.2026, Entwurf „G"): was heute und morgen ansteht, was mit muss
            und was noch zu tun ist. Die Rechnungen dahinter stehen in lib/dashboard.ts. */}
        {tab === "dashboard" && (
          <DashboardPanel
            supabase={supabase}
            orders={orders}
            orderEmployees={orderEmployees}
            customers={customers}
            employees={employees}
            tireStorages={tireStorages}
            storageSlots={storageSlots}
            warehouses={warehouses}
            vehicles={alleFahrzeuge}
            lagerLaedt={einlagerungenQuery.isPending || lagerplaetzeQuery.isPending}
            isTechniker={isTechniker}
            standardDauerMin={terminIntervall}
            belegtePlaetze={occupiedSlots}
            gesamtPlaetze={slotsGesamt}
            kundenGesamt={statTotal}
            kundenKontaktiert={statOk}
            darfLager={canView("lager") && darf("lager.einlagerung", "lesen")}
            darfSaison={canView("saison")}
            darfKunden={canView("kunden")}
            darfPlanung={canView("einsatzplanung")}
            betragFuer={(o) => orderArticleTotals(orderArticlesFor(o.id), o.rechnung_noetig).gross}
            istRueckruf={(c) => kundenZustand(c) === "red"}
            onOpenOrder={setOffenerAuftragId}
            onOpenCustomer={openDetail}
            onNavigate={openNavMenu}
            onCall={openCallMenu}
            onZuPlanung={() => setTab("einsatzplanung")}
            onZuLager={() => setTab("lager")}
            onZuSaison={(saison) => { setSaisonFilter(saison); setTab("saison"); }}
            onZuAnrufliste={() => { setFilter("offen"); setTab("list"); }}
            onZuRechnungen={canView("rechnungen") ? () => setTab("rechnungen") : undefined}
          />
        )}

        {tab === "list" && canView("kunden") && (
          <div className="tabpanel active">
            <input id="search" type="text" placeholder="Kunde oder Adresse suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {/* Die Zahl steht an JEDEM Knopf, nicht nur am aktiven. So sieht man, was ein Klick
                bringen würde, bevor man klickt – und dass unter „Ohne Karte" noch etwas liegt,
                ohne erst dorthin zu wechseln. */}
            <div className="filterbar">
              {KUNDEN_FILTER.map(({ wert, text }) => (
                <button
                  key={wert}
                  type="button"
                  className={"chip" + (filter === wert ? " active" : "")}
                  onClick={() => setFilter(wert)}
                >
                  {text}<span className="chip-zahl">{filterZahlen[wert]}</span>
                </button>
              ))}
            </div>
            <input
              className="plz-input"
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="Postleitzahl filtern…"
              value={plzFilter}
              onChange={(e) => setPlzFilter(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <div className="letter-strip">
              <button
                type="button"
                className={"letter-chip" + (letterFilter === null ? " active" : "")}
                onClick={() => setLetterFilter(null)}
              >
                A-Z
              </button>
              {availableLetters.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={"letter-chip" + (letterFilter === l ? " active" : "")}
                  onClick={() => setLetterFilter(letterFilter === l ? null : l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div id="customerList">
              {listItems.length === 0 && (
                <div className="empty">
                  {istOffline
                    ? "Offline und kein gespeicherter Stand vorhanden – bitte einmal mit Netz öffnen."
                    : "Keine Kunden gefunden."}
                </div>
              )}
              {sichtbareListItems.map((c) => {
                const color = c.lat == null ? "gray" : kundenZustand(c);
                const nextOrd = nextOrder(ordersFor(c.id));
                return (
                  <div
                    key={c.id}
                    className="cust-item"
                    onClick={() => { nadelHervorheben(null); openDetail(c.id); }}
                    onMouseEnter={() => nadelHervorheben(c.id)}
                    onMouseLeave={() => nadelHervorheben(null)}
                  >
                    <div className={`dot ${color}`}></div>
                    <div className="info">
                      {/* Bei Firmenkunden ist der Firmenname die Hauptangabe, der Name der
                          Ansprechpartner darunter (Migration 24). */}
                      <div className="name">{c.company || c.name}</div>
                      {c.company && <div className="meta">👤 {c.name}</div>}
                      <div className="addr">{c.address}</div>
                      {/* Die Einstellung "Zeilenanzeige" soll immer greifen, unabhängig davon, ob
                          ein Termin ansteht – ein anstehender Termin wird deshalb zusätzlich
                          angezeigt statt die Einstellung zu ersetzen. */}
                      <CustomerRowMeta customer={c} rowDisplay={settings.row_display} />
                      {nextOrd && (
                        <div className="meta">📅 Termin: {formatDate(nextOrd.order_date)}</div>
                      )}
                    </div>
                    {/* Hinfahren und anrufen direkt aus der Liste: das sind die beiden
                        Handlungen, die im Außendienst auf eine Kundenzeile folgen – nicht das
                        Öffnen des Kundenfensters. Beide Handler halten den Klick auf, die Zeile
                        öffnet also nicht zusätzlich das Fenster. */}
                    <div className="zeilen-aktionen">
                      {c.address.trim() && (
                        <button
                          className="call-icon-btn small nav-icon-btn"
                          title="Navigation starten (Google Maps / Apple Karten)"
                          onClick={(e) => openNavMenu(e, c)}
                        >
                          <IconNavPin />
                        </button>
                      )}
                      {getPhoneNumbers(c).length > 0 && (
                        <button className="call-icon-btn small" title="Anrufen" onClick={(e) => openCallMenu(e, c)}>📞</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {listItems.length > sichtbareListItems.length && (
                <div className="listen-mehr">
                  <span>{sichtbareListItems.length} von {listItems.length} Kunden</span>
                  <button type="button" onClick={() => setListenGrenze((g) => g + LISTEN_SCHRITT)}>
                    Weitere {Math.min(LISTEN_SCHRITT, listItems.length - sichtbareListItems.length)} anzeigen
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Termine = SCHNELLSICHT auf dieselben Aufträge, die der Reiter "Aufträge" ausführlich
            zeigt: wann bin ich wo, bei wem, mit wem. Keine zweite Datenquelle, keine zweite
            Wahrheit – nur eine andere Tiefe (siehe docs/termine-kontakt-auftrag-analyse.md).

            Der Klick auf eine Zeile öffnet seit 29.08.2026 das AUFTRAGSFENSTER und nicht mehr
            das Kundenfenster. Vorher führte aus dem Reiter, der nach dem Termin benannt ist,
            kein einziger Weg zum dazugehörigen Auftrag – das war die Hauptursache für den
            Eindruck, Termin und Auftrag seien nicht verknüpft. Der Kunde bleibt über eine
            eigene Schaltfläche in der Zeile erreichbar. */}
        {tab === "termine" && canView("termine") && (
          <div className="tabpanel active">
            {/* Zeitraum statt Häkchen: „Nur anstehende" beantwortete die eigentliche Frage
                nicht – die lautet „wo bin ich heute" bzw. „wie liegen die Termine der Woche".
                Die Auswahl steuert zugleich die Nadeln auf der Karte. */}
            <div className="filterbar">
              {TERMIN_FILTER.map(({ wert, text }) => (
                <button
                  key={wert}
                  type="button"
                  className={"chip" + (terminFilter === wert ? " active" : "")}
                  onClick={() => setTerminFilter(wert)}
                >
                  {text}<span className="chip-zahl">{terminZahlen[wert]}</span>
                </button>
              ))}
            </div>
            <div className="small" style={{ marginTop: -2 }}>
              Die Karte zeigt in diesem Reiter nur die Kunden mit Terminen aus dem gewählten
              Zeitraum.
            </div>
            <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
              {apptRows.length === 0 ? (
                <div className="empty">
                  Keine Termine in diesem Zeitraum.
                  {terminZahlen.alle > 0 && terminFilter !== "alle" && ' Unter "Alle" stehen ältere.'}
                </div>
              ) : (
                <table className="appt-table">
                  <thead><tr><th>Termin</th><th>Kunde</th><th>Auftrag</th><th></th></tr></thead>
                  <tbody>
                    {apptRows.map(({ cust, order, past }) => {
                      const empNames = employeeNamesFor(order.id);
                      return (
                        <tr key={order.id} className={`klickbar${past ? " past" : ""}`} onClick={() => setOffenerAuftragId(order.id)} title="Auftrag öffnen">
                          {/* Datum, Uhrzeit und der Hinweis „vergangen" untereinander statt in
                              einer Zeile: nebeneinander zwang die Spalte in eine Breite, die auf
                              dem Handy die halbe Liste auffraß. */}
                          <td className="date-cell">
                            <div>{formatDate(order.order_date)}</div>
                            {/* Von–bis, nicht nur von (Migration 37). Die Endzeit stand hier
                                seit ihrer Einführung nicht – man sah, wann der Techniker
                                kommt, aber nicht, wie lange er bleibt, und genau das
                                entscheidet, ob der nächste Termin noch draufpasst.
                                `terminZeitraum` ist dieselbe Regel wie in der Auftragsliste;
                                ohne Endzeit liefert sie weiterhin nur die Anfangszeit. */}
                            {terminZeitraum(order) && <div className="date-zeit">{terminZeitraum(order)}</div>}
                            {past && <div className="date-vergangen">vergangen</div>}
                          </td>
                          <td>{cust.name}<br /><span className="small">{cust.address}</span></td>
                          <td>
                            <span className={`badge ${ORDER_STATUS_FARBE[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>{" "}
                            {order.title}
                            {empNames !== "–" && <><br /><span className="small">👤 {empNames}</span></>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                            <button className="call-icon-btn small" title="Kundenfenster öffnen" onClick={() => openDetail(cust.id)}>👤</button>
                            {cust.address.trim() && (
                              <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => openNavMenu(e, cust)}>
                                <IconNavPin />
                              </button>
                            )}
                            {getPhoneNumbers(cust).length > 0 && (
                              <button className="call-icon-btn small" title="Anrufen" onClick={(e) => openCallMenu(e, cust)}>📞</button>
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
        )}

        {tab === "auftraege" && canView("auftraege") && (
          <>
          <FensterSchalter wert={auftragsFenster} onChange={setAuftragsFenster} laedt={auftraegeQuery.isFetching} />
          <AuftraegePanel
            customers={customers}
            orders={orders}
            employees={sichtbareMitarbeiter}
            orderEmployees={orderEmployees}
            onNeuerAuftrag={neuenAuftragAnlegen}
            onDelete={deleteOrder}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onOpenOrder={setOffenerAuftragId}
            onNavigate={openNavMenu}
            onCall={openCallMenu}
            isTechniker={isTechniker}
            onUpdateTechnikerNotiz={updateTechnikerNotiz}
          />
          </>
        )}

        {tab === "saison" && canView("saison") && (
          <SaisonPanel
            zeilen={saisonZeilen}
            gesamtAktiv={tireStorages.filter((ts) => !ts.removed_at).length}
            saison={saisonFilter}
            onSaisonChange={setSaisonFilter}
            plz={saisonPlz}
            onPlzChange={setSaisonPlz}
            nurFaellige={saisonNurFaellige}
            onNurFaelligeChange={setSaisonNurFaellige}
            nurSchwach={saisonNurSchwach}
            onNurSchwachChange={setSaisonNurSchwach}
            warehouses={warehouses}
            onOpenCustomer={openDetail}
            onCall={openCallMenu}
            onNavigate={openNavMenu}
            onWiedervorlage={saisonWiedervorlageSetzen}
            schreibt={saisonSchreibt}
          />
        )}

        {/* Die Rechteschlüssel sind zweistufig (Migration 42): „lager" entscheidet nur, ob der
            Reiter überhaupt aufgeht – Schreiben und Löschen hängen an den eingerückten Zeilen
            darunter. Hier stand bis zuletzt darf("lager","schreiben") und darf("einlagerung", …);
            beides gibt es im Katalog nicht, beides lieferte also für jeden außer dem Superadmin
            false. Ein Techniker konnte damit keinen Reifen einlagern. */}
        {tab === "lager" && canView("lager") && (
          <LagerPanel
            customers={customers}
            vehicles={alleFahrzeuge}
            warehouses={warehouses}
            storageSlots={storageSlots}
            tireStorages={tireStorages}
            eingelagerteRaeder={eingelagerteRaeder}
            lagergebuehrJeMonat={lagergebuehrJeMonat}
            onOpenCustomer={openDetail}
            onAddWarehouse={addWarehouse}
            onUpdateWarehouse={updateWarehouse}
            onDeleteWarehouse={deleteWarehouse}
            onAddSlot={addStorageSlot}
            onAddSlotsBulk={addStorageSlotsBulk}
            onDeleteSlot={deleteStorageSlot}
            onAssignTire={assignTire}
            onRemoveAssignment={removeTireAssignment}
            onEtikett={(satzId) => setEtikettSatzIds([satzId])}
            canCreateWarehouse={darf("lager.regale", "schreiben")}
            canEditWarehouse={darf("lager.regale", "schreiben")}
            canDeleteWarehouse={darf("lager.regale", "loeschen")}
            canCreateSlot={darf("lager.regale", "schreiben")}
            canDeleteSlot={darf("lager.regale", "loeschen")}
            canAssignTire={darf("lager.einlagerung", "schreiben")}
            springeZuLagerplatzId={gescannterLagerplatzId}
            onLagerplatzGeoeffnet={() => setGescannterLagerplatzId(null)}
          />
        )}

        {tab === "einsatzplanung" && canView("einsatzplanung") && (
          <>
          {/* Der geladene Zeitraum sitzt seit der Neugestaltung (25.09.2026) als Auswahlknopf in
              der Bedienleiste der Einsatzplanung – ein eigener Balken darüber kostete am Handy
              eine ganze Zeile, die beim Scrollen stehen blieb. */}
          <EinsatzplanungPanel
            fenster={{ wert: auftragsFenster, onChange: setAuftragsFenster, laedt: auftraegeQuery.isFetching }}
            standardDauerMin={terminIntervall}
            customers={customers}
            firmenfahrzeuge={firmenfahrzeuge}
            orders={orders}
            employees={sichtbareMitarbeiter}
            orderEmployees={orderEmployees}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onOpenOrder={setOffenerAuftragId}
            onDelete={deleteOrder}
            onNavigate={openNavMenu}
            onNeuerAuftrag={neuenAuftragAnlegen}
            onNeuerKunde={(termin) => { setTerminFuerNeuenKunden(termin); setTab("add"); }}
            onVerschieben={darf("auftraege.auftrag", "schreiben") ? terminVerschieben : undefined}
            isTechniker={isTechniker}
          />
          </>
        )}

        {tab === "more" && (
          <div className="tabpanel active">
            {/* Dieselbe Liste wie die Seitenleiste (lib/module.ts), nur als Kacheln. Das
                Dashboard fehlt bewusst: Es steht am Handy schon unten in der Leiste, und ein
                zweiter Weg zum selben Ort auf derselben Seite ist keine Hilfe, sondern eine
                Frage („warum zweimal?"). */}
            <div className="module-cards">
              {MODULE.filter((m) => !m.primaer && modulSichtbar(m.sichtbar)).map((m) => (
                <div key={m.tab} className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab(m.tab)}>
                  <div className="mc-icon"><m.Icon /></div>
                  <div className="mc-text">
                    <div className="mc-title">{m.label}</div>
                    <div className="mc-sub">{m.beschreibung}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "inactive" && canView("kunden.lesen") && (
          <div className="tabpanel active">
            <div className="small" style={{ marginBottom: 4 }}>Deaktivierte Kunden erscheinen nicht mehr in der normalen Liste und haben keine Flagge auf der Karte.</div>
            <div>
              {inactiveCustomers.length === 0 && <div className="empty">Keine deaktivierten Kunden.</div>}
              {inactiveCustomers.map((c) => (
                <div key={c.id} className="cust-item" style={{ cursor: "default" }}>
                  <div className="dot gray"></div>
                  <div className="info">
                    <div className="name">{c.name}</div>
                    <div className="addr">{c.address}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <button className="btn-secondary" onClick={() => setActive(c.id, true)}>✔ Reaktivieren</button>
                      <button className="btn-secondary" onClick={() => openDetail(c.id)}>Bearbeiten</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "add" && canView("kunden.schreiben") && (
          <AddCustomerForm
            onAdd={addCustomer}
            terminText={terminTextVon(terminFuerNeuenKunden)}
            laufkundschaftName={customers.find((c) => c.laufkundschaft)?.name ?? null}
          />
        )}

        {tab === "settings" && canView("einstellungen") && (
          <SettingsPanel
            settings={settings}
            onChange={saveSettingsPatch}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            userEmail={userEmail}
            datenStand={kundenQuery.dataUpdatedAt}
            onAktualisieren={() => { void queryClient.invalidateQueries(); }}
            laedt={kundenQuery.isFetching || auftraegeQuery.isFetching}
            onLogout={handleLogout}
          />
        )}

        {tab === "admin" && (
          <AdminPanel
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            employees={employees}
            onAddEmployee={addEmployee}
            onDeleteEmployee={deleteEmployee}
            onUpdateEmployeeProfileId={updateEmployeeProfile}
            modulePermissions={modulePermissions}
            onUpdateModulePermissions={updateModulePermissions}
            firmenfahrzeuge={firmenfahrzeuge}
            onFirmenfahrzeugAnlegen={firmenfahrzeugAnlegen}
            onFirmenfahrzeugAendern={firmenfahrzeugAendern}
            onFirmenfahrzeugAusmustern={firmenfahrzeugStilllegen}
            onKundeOeffnen={openDetail}
            onKundenbestandGeaendert={() => { void neuLaden(qk.kunden()); void auftraegeNeuLaden(); }}
          />
        )}

        {tab === "auswertung" && canView("auswertung") && (
          <AuswertungPanel
            employees={employees} articles={articles}
            customers={customers} vehicles={alleFahrzeuge}
          />
        )}

        {tab === "rechnungen" && canView("rechnungen") && (
          <RechnungenPanel
            rechnungen={rechnungenQuery.data ?? KEINE_RECHNUNGEN}
            laedt={rechnungenQuery.isLoading}
            darfSchreiben={darf("rechnungen", "schreiben")}
            onAuftragOeffnen={auftragAusRechnungOeffnen}
            onStornieren={rechnungStornieren}
          />
        )}

        {tab === "artikel" && canView("artikel") && (
          <ArticleAdminPanel
            articles={articles}
            articlePrices={articlePrices}
            onAddArticle={addArticle}
            onUpdateArticle={updateArticle}
            onUpdateArticleNumber={updateArticleNumber}
            onAddArticlePrice={addArticlePrice}
            onUpdateArticlePrice={updateArticlePrice}
            onDeleteArticlePrice={deleteArticlePrice}
          />
        )}
      </div>

      <div id="map" ref={mapDivRef} className={mobileMapVisible ? "mobile-visible" : ""}>
        {/* Die Nadeln kommen aus dem gespeicherten Bestand und sind auch offline da – die
            Kartenkacheln nicht: die liegen bei OpenStreetMap und dürfen nicht auf Vorrat
            heruntergeladen werden (siehe docs/pwa-plan.md). */}
        {istOffline && (
          <div className="map-hinweis">Offline – der Kartenhintergrund fehlt. Die Nadeln stammen aus dem gespeicherten Stand.</div>
        )}
        {tab === "termine" && terminKundenIds?.size === 0 && !istOffline && (
          <div className="map-hinweis">Keine Termine im gewählten Zeitraum.</div>
        )}
        {ausgelasseneMarker > 0 && !fullPageTabs && (
          <div className="map-hinweis">
            {ausgelasseneMarker} weitere Kunden in diesem Ausschnitt – zum Anzeigen näher heranzoomen.
          </div>
        )}
      </div>

      {/* Zustandsfilter der Karte, oben rechts. Steht als Geschwister von #map und nicht darin:
          ein Kind des Leaflet-Containers würde beim Wischen die Karte mitziehen, weil Leaflet
          seine Zieh-Geste am Container abgreift. Am Handy ist er der einzige Weg zu dieser
          Auswahl – dort sieht man die Kundenliste nicht, während die Karte offen ist. Am
          Desktop steht er trotzdem: sonst gäbe es eine Auswahl, die man am Handy trifft und am
          Rechner nicht mehr findet. */}
      {!fullPageTabs && (
        <div id="kartenFilter" className={"map-style-control" + (mobileMapVisible ? " mobile-sichtbar" : "")}>
          <button
            type="button"
            className="map-style-toggle"
            onClick={() => setKartenFilterOffen((o) => !o)}
            aria-expanded={kartenFilterOffen}
            title="Nadeln nach Zustand ein- und ausblenden"
          >
            <IconFilter />
            <span>Nadeln</span>
            {sichtbareZustaende.length < KUNDEN_ZUSTAND_REIHENFOLGE.length && (
              <span className="kartenfilter-badge">{KUNDEN_ZUSTAND_REIHENFOLGE.length - sichtbareZustaende.length}</span>
            )}
          </button>
          {kartenFilterOffen && (
            <div className="karten-filter-liste">
              {KUNDEN_ZUSTAND_REIHENFOLGE.map((zustand) => {
                const an = sichtbareZustaende.includes(zustand);
                return (
                  <button
                    key={zustand}
                    type="button"
                    className={"karten-filter-zeile" + (an ? "" : " aus")}
                    onClick={() =>
                      setSichtbareZustaende((bisher) =>
                        bisher.includes(zustand) ? bisher.filter((z) => z !== zustand) : [...bisher, zustand]
                      )
                    }
                  >
                    <span className="haken">{an ? "✓" : ""}</span>
                    <span className={`dot ${zustand}`}></span>
                    <span>{KUNDEN_ZUSTAND_LABEL[zustand]}</span>
                    <span className="zahl">{kartenZahlen[zustand]}</span>
                  </button>
                );
              })}
              {/* Ein Weg zurück, ohne vier Mal zu tippen – und zugleich die Antwort auf
                  "warum fehlt hier eine Nadel?". */}
              <button
                type="button"
                className="karten-filter-alle"
                onClick={() => setSichtbareZustaende([...KUNDEN_ZUSTAND_REIHENFOLGE])}
                disabled={sichtbareZustaende.length === KUNDEN_ZUSTAND_REIHENFOLGE.length}
              >
                Alle einblenden
              </button>
            </div>
          )}
        </div>
      )}

      {!fullPageTabs && (
        <button id="mapToggleBtn" type="button" onClick={toggleMobileMap} title={mobileMapVisible ? "Liste anzeigen" : "Karte anzeigen"}>
          {mobileMapVisible ? <IconKunden /> : <IconMap />}
        </button>
      )}

      {/* Nach dem Antippen der Meldung „Anrufen: ‹Kunde›". Steht der Kunde noch nicht im
          geladenen Bestand, wartet das Fenster – der Abruf läuft bereits (siehe zielOeffnen). */}
      {anrufKundeId && (() => {
        const kunde = customers.find((c) => c.id === anrufKundeId);
        if (!kunde) return null;
        return (
          <AnrufFenster
            kunde={kunde}
            onClose={() => setAnrufKundeId(null)}
            onKundeOeffnen={() => { setAnrufKundeId(null); openDetail(kunde.id); setTab("list"); }}
          />
        );
      })()}

      {/* Nach dem Antippen des Abendhinweises „Morgen … mitnehmen" (Migration 55). */}
      {mitnehmenDatum && (
        <MitnehmenFenster
          supabase={supabase}
          datum={mitnehmenDatum}
          orders={orders}
          tireStorages={tireStorages}
          customers={customers}
          vehicles={alleFahrzeuge}
          storageSlots={storageSlots}
          warehouses={warehouses}
          laedt={einlagerungenQuery.isPending || lagerplaetzeQuery.isPending}
          onClose={() => setMitnehmenDatum(null)}
          onAuftragOeffnen={(id) => { setMitnehmenDatum(null); setOffenerAuftragId(id); }}
        />
      )}

      {callMenuFor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19999 }} onClick={() => setCallMenuFor(null)} />
          <div className="call-menu" style={{ top: callMenuPos.top, left: callMenuPos.left }}>
            {getPhoneNumbers(callMenuFor).map((n) => (
              <button key={n.label} onClick={() => { window.location.href = "tel:" + telHref(n.number); setCallMenuFor(null); }}>
                {n.label}<span className="num">{n.number}</span>
              </button>
            ))}
            {/* Nur am Rechner: Auf dem Handy wäre „aufs Handy schicken" eine Meldung an sich
                selbst. */}
            {amRechner() && (
              <>
                <div className="cm-trenner" />
                <button className="cm-handy" onClick={() => { void aufsHandySchicken(callMenuFor); }}>
                  Auf dem Handy anrufen<span className="num">Meldung aufs iPhone</span>
                </button>
                {handyMeldung && (
                  <div className={handyMeldung.ok ? "cm-meldung" : "cm-meldung cm-fehler"}>{handyMeldung.text}</div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {navMenuFor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19999 }} onClick={() => setNavMenuFor(null)} />
          <div className="call-menu" style={{ top: navMenuPos.top, left: navMenuPos.left }}>
            {(() => {
              const urls = navigationUrls(navMenuFor);
              return (
                <>
                  <button onClick={() => { window.open(urls.google, "_blank"); setNavMenuFor(null); }}>
                    Google Maps
                  </button>
                  <button onClick={() => { window.open(urls.apple, "_blank"); setNavMenuFor(null); }}>
                    Apple Karten
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {empMenuFor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19999 }} onClick={() => setEmpMenuFor(null)} />
          <div className="call-menu" style={{ top: empMenuPos.top, left: empMenuPos.left, minWidth: 200 }}>
            <div className="small" style={{ padding: "2px 10px 6px", fontWeight: 700 }}>Mitarbeiter zuordnen</div>
            {employees.length === 0 ? (
              <div className="small" style={{ padding: "0 10px 8px" }}>Noch keine Mitarbeiter angelegt.</div>
            ) : (
              employees.map((emp) => (
                <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={empMenuFor.ids.includes(emp.id)} onChange={() => toggleEmpMenuEmployee(emp.id)} />
                  {emp.name}
                </label>
              ))
            )}
          </div>
        </>
      )}

      {/* Kontaktdialog (Migration 23) – aus dem Karten-Popup wie aus dem Kundenfenster derselbe.
          Er liegt hier auf oberster Ebene und nicht in einem der beiden, damit es ihn genau
          einmal gibt: die Kontaktmaske existierte schon einmal doppelt und ist auseinander-
          gelaufen (docs/termine-kontakt-auftrag-analyse.md). */}
      {kontaktKunde && (
        <KontaktModal
          customer={kontaktKunde}
          periodMonths={settings.period_months}
          onClose={() => setKontaktKundeId(null)}
          onSpeichern={(ergebnis, datum, wiedervorlage) => kontaktFesthalten(kontaktKunde.id, ergebnis, datum, wiedervorlage)}
        />
      )}

      {etikettSatzIds.length > 0 && (
        <ReifensatzEtikett
          saetze={tireStorages.filter((t) => etikettSatzIds.includes(t.id))}
          raeder={eingelagerteRaeder.filter((r) => etikettSatzIds.includes(r.tire_storage_id))}
          customers={customers}
          vehicles={alleFahrzeuge}
          slots={storageSlots}
          warehouses={warehouses}
          onClose={() => setEtikettSatzIds([])}
        />
      )}

      {/* Der Auslagern-Dialog steht auf derselben Ebene wie die Fenster, aus denen er
          aufgerufen wird (Regalwand und Auftragsfenster) – sonst läge er unter dem einen und
          über dem anderen. Er kennt seinen Satz, nicht seinen Aufrufer. */}
      {(() => {
        const satz = tireStorages.find((t) => t.id === auslagernSatzId);
        if (!satz) return null;
        const platz = storageSlots.find((sl) => sl.id === satz.storage_slot_id);
        return (
          <AuslagernDialog
            satz={satz}
            kunde={customers.find((c) => c.id === satz.customer_id)}
            fahrzeug={alleFahrzeuge.find((v) => v.id === satz.vehicle_id)}
            slot={platz}
            warehouse={warehouses.find((w) => w.id === platz?.warehouse_id)}
            gebuehrArtikel={articles.filter((a) => a.active && a.abrechnungsart === "lagergebuehr")}
            articlePrices={articlePrices}
            offeneAuftraege={orders
              .filter((o) => o.customer_id === satz.customer_id && !o.deleted_at
                && (o.status === "offen" || o.status === "in_arbeit"))
              .sort((a, b) => b.order_date.localeCompare(a.order_date))}
            vorschlagAuftragId={auslagernAusAuftragId}
            onAbbrechen={() => { setAuslagernSatzId(null); setAuslagernAusAuftragId(null); }}
            onAuslagern={(wahl) => auslagernAusfuehren(satz.id, wahl)}
          />
        );
      })()}

      {offenerAuftrag && (
        <AuftragModal
          // Ein anderer Auftrag = ein neues Fenster mit frischem Entwurf (Fahrplan D6).
          key={offenerAuftrag.id}
          order={offenerAuftrag}
          andereAuftraege={orders}
          auftragsZuordnungen={orderEmployees}
          kundeName={(id) => customers.find((c) => c.id === id)?.name ?? "Unbekannter Kunde"}
          customer={customers.find((c) => c.id === offenerAuftrag.customer_id)}
          vehicles={auftragFahrzeugeQuery.data ?? KEINE_FAHRZEUGE}
          employees={employees}
          assignedEmployeeIds={orderEmployees[offenerAuftrag.id] || []}
          articles={articles}
          articlePrices={articlePrices}
          orderArticles={orderArticlesFor(offenerAuftrag.id)}
          isTechniker={isTechniker}
          darfWiedereroeffnen={isAdmin}
          frischAngelegt={offenerAuftrag.id === frischerAuftragId}
          terminIntervallMin={terminIntervall}
          {...(() => {
            // Die Vorgeschichte dieses Fahrzeugs (D2/D3). Hier gerechnet und nicht im
            // Auftragsfenster, weil nur die Seite den vollen Einlagerungsbestand hat.
            //
            // Die Sätze DIESES Auftrags fallen vorher raus – was gerade eingelagert wird, ist
            // keine Vorgeschichte. Bis zum 17.09.2026 wurde dafür genau ein Satz ausgenommen;
            // bei zwei Autos am selben Auftrag hätte sich der eine als „letztes Mal" über den
            // anderen gelegt.
            const fremde = tireStorages.filter((t) => t.order_id !== offenerAuftrag.id);
            // Welche Autos an diesem Auftrag hängen, steht seit Migration 44 in
            // `auftrag_fahrzeuge`. Bis zum 21.09.2026 wurde hier `orders.vehicle_id` gelesen –
            // dasselbe Fenster, in dem die Rechnung schon die neue Tabelle las. Bei einem
            // Kunden mit zwei Autos konnte die Vorgeschichte damit vom falschen Wagen erzählen.
            const fahrzeugIds = auftragFahrzeuge
              .filter((af) => af.order_id === offenerAuftrag.id)
              .map((af) => af.vehicle_id);
            const letzter = letzterSatzFuer(fremde, offenerAuftrag.customer_id, fahrzeugIds);
            return {
              letzterSatz: letzter,
              letzterSatzRaeder: letzter
                ? eingelagerteRaeder.filter((r) => r.tire_storage_id === letzter.id)
                : [],
            };
          })()}
          einlagerungen={einlagerungenZuAuftrag(offenerAuftrag.id)}
          hatLagergebuehr={auftragHatLagergebuehr(offenerAuftrag.id)}
          fremdeSaetze={tireStorages.filter(
            (t) => t.customer_id === offenerAuftrag.customer_id && !t.removed_at && t.order_id !== offenerAuftrag.id
          )}
          onAuslagern={(satzId) => { setAuslagernAusAuftragId(offenerAuftrag.id); setAuslagernSatzId(satzId); }}
          onEtikett={(satzId) => setEtikettSatzIds([satzId])}
          storageSlots={storageSlots}
          warehouses={warehouses}
          belegteSlotIds={belegteSlotIds}
          onEinlagern={(lagerplatzId, einlagerungId) => einlagernFuerAuftrag(offenerAuftrag, lagerplatzId, einlagerungId)}
          onEinlagerungEntfernen={(id) => removeTireAssignment(id, offenerAuftrag.id)}
          onEinlagerungAngaben={einlagerungAngabenAendern}
          {...(() => {
            // Die Räder ALLER Sätze dieses Auftrags; das Auftragsfenster teilt sie je Satz auf.
            const eigeneIds = new Set(einlagerungenZuAuftrag(offenerAuftrag.id).map((e) => e.id));
            return { raeder: eingelagerteRaeder.filter((r) => eigeneIds.has(r.tire_storage_id)) };
          })()}
          onErfassungsart={erfassungsartSetzen}
          onAnzahlRaeder={anzahlRaederSetzen}
          onRadSpeichern={radSpeichern}
          onRadEntfernen={radEntfernen}
          onFahrzeugAnlegen={(kennzeichen, modell, einlagerungId) => fahrzeugAusAuftragAnlegen(offenerAuftrag.id, kennzeichen, modell, einlagerungId)}
          onClose={() => { setOffenerAuftragId(null); setFrischerAuftragId(null); }}
          onSaveFields={updateOrder}
          firmenfahrzeuge={firmenfahrzeuge}
          onSetFirmenfahrzeug={setOrderFirmenfahrzeug}
          onUpdateTechnikerNotiz={updateTechnikerNotiz}
          onSetStatus={updateOrderStatus}
          // Kein Knopf für den, der Rechnungen nicht einmal lesen darf. Ein Knopf, der ein
          // Fenster mit lauter abgeschalteten Schaltern öffnet, ist schlechter als keiner.
          onRechnungOeffnen={darf("rechnungen", "lesen") ? (id) => setRechnungAuftragId(id) : undefined}
          auftragFahrzeuge={auftragFahrzeuge}
          onEmailSpeichern={kundenEmailSpeichern}
          onFahrzeugHinzufuegen={fahrzeugHinzufuegen}
          onRechnungsFahrzeugAnlegen={rechnungsFahrzeugAnlegen}
          onKilometerstand={kilometerstandSetzen}
          onFahrzeugEntfernen={fahrzeugEntfernen}
          onDelete={deleteOrder}
          onAddArticle={addOrderArticle}
          onUpdateArticleQty={updateOrderArticleQty}
          onUpdateArticleEndpreis={updateOrderArticleEndpreis}
          onUpdateArticleText={updateOrderArticleText}
          onRemoveArticle={removeOrderArticle}
          onNavigate={openNavMenu}
          onCall={openCallMenu}
        />
      )}

      {/* Das Rechnungsfenster (Migration 48/49). Es liegt hier und nicht im Auftragsfenster:
          Es braucht den Briefkopf und die Belege zu diesem Auftrag, und beides durch das
          Auftragsfenster durchzureichen hieße, ihm ein zweites Thema aufzuladen. */}
      {rechnungAuftragId && (() => {
        const auftrag =
          orders.find((o) => o.id === rechnungAuftragId) ??
          kundeAuftraege.find((o) => o.id === rechnungAuftragId);
        if (!auftrag) return null;
        return (
          <RechnungModal
            auftrag={auftrag}
            kunde={customers.find((c) => c.id === auftrag.customer_id) ?? null}
            betrieb={betriebQuery.data ?? null}
            zeilen={orderArticles.filter((z) => z.order_id === auftrag.id && !z.deleted_at)}
            artikel={articles}
            // Die Kennzeichen stehen im Betreff der Rechnung. Sie kommen aus den Fahrzeugen
            // des Auftrags (Migration 44) – bei drei Autos an einem Termin sind es drei.
            kennzeichen={auftragFahrzeuge
              .filter((af) => af.order_id === auftrag.id)
              .map((af) => (auftragFahrzeugeQuery.data ?? KEINE_FAHRZEUGE).find((v) => v.id === af.vehicle_id)?.license_plate?.trim() || "")
              .filter(Boolean)}
            rechnungen={auftragRechnungenQuery.data ?? KEINE_RECHNUNGEN}
            darfSchreiben={darf("rechnungen", "schreiben")}
            onAusstellen={rechnungAusstellen}
            onStornieren={rechnungStornieren}
            onClose={() => setRechnungAuftragId(null)}
          />
        );
      })()}

      {/* Nur öffnen, solange es den Kunden in der Liste gibt: Nach dem Löschen – auch auf einem
          anderen Gerät – ist er weg, und ein Fenster ohne Kunde riss die ganze Seite mit. */}
      {selectedId && gewaehlterKunde && (
        <DetailModal
          customer={gewaehlterKunde}
          orders={kundeAuftraege}
          employees={employees}
          orderEmployees={orderEmployees}
          orderArticles={orderArticles}
          onOpenOrder={(id) => setOffenerAuftragId(id)}
          onPositionSetzen={() => positionSetzenStarten(selectedId)}
          onPositionSuchen={() => positionSuchen(selectedId)}
          history={history}
          periodMonths={settings.period_months}
          vehicles={vehicles}
          tireStorages={tireStorages.filter((t) => t.customer_id === selectedId)}
          storageSlots={storageSlots}
          warehouses={warehouses}
          onClose={() => setSelectedId(null)}
          onSaveFields={(fields) => updateCustomerFields(selectedId, fields)}
          onMarkContacted={() => setKontaktKundeId(selectedId)}
          onMarkOpen={() => markOpen(selectedId)}
          onToggleActive={() => setActive(selectedId, customers.find((c) => c.id === selectedId)?.active === false)}
          onDelete={() => deleteCustomerById(selectedId)}
          onNeuerAuftrag={() => { void neuenAuftragAnlegen(selectedId); }}
          onUpdateOrder={updateOrder}
          onDeleteOrder={deleteOrder}
          onAddVehicle={(fields) => addVehicle(selectedId, fields)}
          onUpdateVehicle={updateVehicle}
          onDeleteVehicle={deleteVehicle}
          onZumLagerplatz={canView("lager") ? (platzId) => { setSelectedId(null); setGescannterLagerplatzId(platzId); setTab("lager"); } : undefined}
          onNavigate={openNavMenu}
          onCall={openCallMenu}
        />
      )}

      {/* Solange ein Punkt gesetzt werden soll, erklärt ein Balken, was die Karte gerade von
          einem will – und bietet den Rückweg an. Ohne ihn wäre die Karte in einem Zustand,
          den man ihr nicht ansieht. */}
      {positionSetzenFuer && (() => {
        const kunde = customers.find((c) => c.id === positionSetzenFuer);
        return (
          <div className="karte-banner" role="status">
            <span>
              <b>Position setzen: {kunde?.name || "Kunde"}</b>
              <br />
              {kunde?.address || "ohne Adresse"}
              <br />
              {positionSetzenSucht
                ? "Die Straße wird gesucht …"
                : positionSetzenZiel
                  ? "Tippe auf das Haus. Die Karte steht auf der Straße – die Hausnummer kennt der Kartendienst nicht."
                  : "Die Straße war nicht auffindbar – bitte selbst hinsteuern und auf das Haus tippen."}
            </span>
            <button
              type="button" className="btn-secondary"
              onClick={() => positionSetzenBeenden(positionSetzenFuer, true)}
            >
              Abbrechen
            </button>
          </div>
        );
      })()}

      {fehler && (
        <div className="fehler-hinweis" role="alert">
          <span>{fehler}</span>
          <button type="button" onClick={() => setFehler(null)} aria-label="Meldung schließen">×</button>
        </div>
      )}
    </div>
  );
}

// Umschaltung des geladenen Auftrags-Zeitfensters (Roadmap Phase 10). Steht über den beiden
// Auftragslisten, weil sie sich dieselbe Abfrage teilen: was hier gewählt wird, gilt für den
// Aufträge-Tab und die Einsatzplanung gleichermaßen.
//
// "Aktuell" enthält immer alle offenen Aufträge, unabhängig vom Alter – nur ERLEDIGTE werden
// nach 30 Tagen ausgeblendet. Was noch zu tun ist, kann also nie aus dem Blick geraten.
function FensterSchalter({ wert, onChange, laedt }: {
  wert: AuftragsFenster;
  onChange: (w: AuftragsFenster) => void;
  laedt: boolean;
}) {
  const fenster: AuftragsFenster[] = ["aktuell", "jahr", "alles"];
  return (
    <div className="fenster-schalter">
      <span className="fs-label">Geladener Zeitraum</span>
      {fenster.map((f) => (
        <button
          key={f}
          type="button"
          className={"fs-btn" + (wert === f ? " active" : "")}
          onClick={() => onChange(f)}
        >
          {AUFTRAGSFENSTER_LABEL[f]}
        </button>
      ))}
      <span className="fs-hinweis">
        {laedt ? "lädt…" : wert === "aktuell" ? "Erledigte der letzten 30 Tage, offene immer" : ""}
      </span>
    </div>
  );
}

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}

// daysSinceContact/CustomerRowMeta sind ausgelagert nach components/kunden/CustomerRowMeta.tsx
// (siehe Importe oben, docs/roadmap.md Phase 2).

// AddCustomerForm ist ausgelagert nach components/kunden/AddCustomerForm.tsx (siehe Importe oben, docs/roadmap.md Phase 2).


// SettingsPanel ist ausgelagert nach components/admin/SettingsPanel.tsx (siehe Importe oben, docs/roadmap.md Phase 2).

// =====================================================================
// Admin-Modul: Nutzerverwaltung – als eigener Tab statt separater Seite,
// damit man wie bei Termine einfach das Fenster wechselt statt zu navigieren.
// (ROLE_LABEL ist zentral in lib/constants.ts definiert, siehe Import oben.)
// =====================================================================

// AdminPanel, PermissionMatrix, ArticleAdminPanel und ArticleDetailEditor sind ausgelagert nach
// components/admin/AdminPanel.tsx, components/admin/PermissionMatrix.tsx,
// components/admin/artikel/ArticleAdminPanel.tsx und components/admin/artikel/ArticleDetailEditor.tsx
// (siehe Importe oben, docs/roadmap.md Phase 2).

// ArticleAssignPanel ist ausgelagert nach components/auftraege/ArticleAssignPanel.tsx
// (siehe Importe oben, docs/roadmap.md Phase 2).

// DetailModal, CustomerOrderRow sowie die Fahrzeug-Komponenten
// (VehicleRow, AddVehicleInline) sind ausgelagert nach components/kunden/DetailModal.tsx,
// components/kunden/CustomerOrderRow.tsx und
// components/kunden/VehicleSection.tsx (siehe Importe oben, docs/roadmap.md Phase 2).

// CustomerPicker ist ausgelagert nach components/CustomerPicker.tsx (siehe Importe oben, docs/roadmap.md Phase 2).

// Das gesamte Lager-Modul (buildSlotCodes, SlotNumberingFields, LagerPanel, TireAssignModal)
// ist ausgelagert nach components/lager/LagerPanel.tsx (siehe Importe oben, docs/roadmap.md Phase 2).

// =====================================================================
// Aufträge-Modul
// =====================================================================
// AuftraegePanel und OrderModal sind ausgelagert nach components/auftraege/AuftraegePanel.tsx
// und components/auftraege/OrderModal.tsx (siehe Importe oben, docs/roadmap.md Phase 2).

// EinsatzplanungPanel ist ausgelagert nach components/einsatzplanung/EinsatzplanungPanel.tsx
// (siehe Importe oben, docs/roadmap.md Phase 2).

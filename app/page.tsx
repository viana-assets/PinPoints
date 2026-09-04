"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type {
  Customer, ContactHistoryEntry, UserSettings,
  Warehouse, StorageSlot, TireStorage, Order, OrderStatus, Vehicle, Role, Profile, Employee,
  Article, ArticlePrice, OrderArticle, KontaktErgebnis,
} from "@/lib/types";
import {
  todayStr, formatDate, formatOrderDateTime, isOrderPast, nextOrder, orderDateTime,
  effectiveColor, KUNDEN_ZUSTAND_LABEL, type KundenZustand, telHref, getPhoneNumbers, navigationUrls,
  formatEUR, orderArticleTotals, terminTitel,
} from "@/lib/helpers";
import { MAP_STYLES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, type MapStyleKey } from "@/lib/mapStyles";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, PERMISSION_DEFAULTS } from "@/lib/constants";
import { LAGERPLATZ_PARAMETER, lagerplatzIdAusCode } from "@/lib/lagerplatzCode";
import {
  IconDashboard, IconKunden, IconTermine, IconModule, IconNeu, IconInaktiv, IconSettings, IconAdmin,
  IconMap, IconLager, IconAuftraege, IconBack, IconMore, IconEinsatzplanung, IconTrash, IconArtikel,
  IconNavPin, IconMarke,
} from "@/components/icons";
import { NavItem } from "@/components/NavItem";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { CustomerRowMeta } from "@/components/kunden/CustomerRowMeta";
import { AddCustomerForm } from "@/components/kunden/AddCustomerForm";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ArticleAdminPanel } from "@/components/admin/artikel/ArticleAdminPanel";
import { AuftragModal } from "@/components/auftraege/AuftragModal";
import { KontaktModal } from "@/components/kunden/KontaktModal";
import { DetailModal } from "@/components/kunden/DetailModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LagerPanel } from "@/components/lager/LagerPanel";
import { AuftraegePanel } from "@/components/auftraege/AuftraegePanel";
import { EinsatzplanungPanel } from "@/components/einsatzplanung/EinsatzplanungPanel";
import { insertEmployee, deleteEmployeeById, updateEmployeeProfileId } from "@/lib/api/employees";
import { insertVehicle, updateVehicleById, deleteVehicleById } from "@/lib/api/vehicles";
import {
  insertWarehouse, updateWarehouseById, deleteWarehouseById,
  insertStorageSlot, insertStorageSlotsBulk, deleteStorageSlotById,
  upsertTireAssignment, removeTireAssignmentById,
} from "@/lib/api/lager";
import {
  insertArticle, updateArticleById, updateArticleNumberById, insertArticlePrice,
  insertOrderArticle, updateOrderArticleQtyById, updateOrderArticleDiscountById, deleteOrderArticleById,
} from "@/lib/api/articles";
import {
  replaceOrderEmployees,
  insertOrder, updateOrderById, updateOrderStatusById, updateOrderTechnikerNotiz, deleteOrderById,
  updateOrderVehicle,
  AUFTRAGSFENSTER_LABEL, type AuftragsFenster,
} from "@/lib/api/orders";
import {
  markCustomerContacted, markCustomerOpen,
  setCustomerActive, deleteCustomerRow, updateCustomerFieldsById, insertCustomer,
} from "@/lib/api/customers";
import { upsertModulePermissions } from "@/lib/api/permissions";
import { fetchOwnRole, fetchOrCreateUserSettings, updateUserSettings } from "@/lib/api/session";
import { qk } from "@/lib/queries/keys";
import {
  useKunden, useAuftraege, useKundenAuftraege, useKundeFahrzeuge, useKundeHistorie,
  useMitarbeiter, useArtikel, useArtikelpreise,
  useLager, useLagerplaetze, useEinlagerungen, useLagerKennzahlen, useModulrechte,
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
const KEINE_HISTORIE: ContactHistoryEntry[] = [];
const KEINE_ZUORDNUNGEN: Record<string, string[]> = {};

// Höchstzahl gleichzeitig gezeichneter Kartenmarker. Leaflet legt je Marker ein DOM-Element an;
// bei mehreren tausend Kunden im Bild wird das Zoomen und Verschieben spürbar zäh. Es werden
// ohnehin nur Marker im sichtbaren Ausschnitt gezeichnet – diese Grenze fängt den Fall ab, dass
// jemand ganz herauszoomt.
const MAX_MARKER = 600;

// Farben der Kartenmarker je Kundenzustand. Sie stehen hier und nicht als CSS-Variable, weil
// der Marker als HTML-Zeichenkette in einem Leaflet-divIcon entsteht – dort greift kein
// Stylesheet der App. Die Werte entsprechen den Tokens --green / --accent / --red aus
// globals.css; wer sie dort ändert, ändert sie hier mit (siehe docs/konstanten-register.md).
const MARKER_FARBE: Record<Exclude<KundenZustand, "kein-interesse">, string> = {
  green: "#2f9e5c",
  orange: "#FF5A1F",
  red: "#e0483f",
};

// Wie viele Kundenzeilen auf einmal gezeichnet werden. Die Suche filtert weiterhin über den
// gesamten Bestand – begrenzt ist nur, wie viele Treffer gleichzeitig im Dokument stehen.
// Ohne diese Grenze legt der Browser bei ~4500 Kunden ebenso viele Zeilen an, was das Scrollen
// und jedes Tippen im Suchfeld spürbar verzögert.
const LISTEN_SCHRITT = 200;

type TabKey = "dashboard" | "list" | "termine" | "lager" | "einsatzplanung" | "auftraege" | "inactive" | "add" | "settings" | "admin" | "artikel" | "more";

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
  const [tab, setTab] = useState<TabKey>("dashboard");
  // Vollseiten-Module: hier ergibt die Karte keinen Sinn, der Inhalt bekommt die volle Breite.
  // Weit oben berechnet (statt erst kurz vor dem Rendern), damit ein Effekt weiter unten, der
  // beim Wechsel zwischen Vollseiten- und normalem Tab einen Reflow erzwingt, sich problemlos
  // darauf verlassen kann (Hooks dürfen nicht erst nach einem bedingten Return kommen).
  const fullPageTabs = tab === "lager" || tab === "einsatzplanung" || tab === "admin" || tab === "auftraege" || tab === "artikel";
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (Migration 13), die
  // Oberfläche blendet zusätzlich Anlegen/Löschen/Mitarbeiter- und Leistungen-Zuordnung aus –
  // siehe AuftraegePanel/EinsatzplanungPanel.
  const isTechniker = myRole === "techniker";

  // Die Datenbestände liegen seit Roadmap-Phase 10 nicht mehr als useState hier, sondern in
  // Abfragen (siehe weiter unten beim "selectedId"-Block und in lib/queries/hooks.ts).
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "", period_months: 3, map_style: "strasse", row_display: "datum",
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "offen" | "ok" | "wiedervorlage" | "kein_interesse" | "nogeo">("all");
  const [plzFilter, setPlzFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Der gerade geöffnete Auftrag (Migration 20, docs/auftragsablauf.md). Er ersetzt das frühere
  // Leistungen-Popover: dort war für die Positionserfassung schlicht kein Platz.
  //
  // Steht bewusst HIER und nicht weiter unten bei den Popover-Zuständen: die Ableitung
  // `offenerAuftrag` weiter unten liest ihn, und eine Deklaration danach wäre ein Zugriff vor
  // der Initialisierung. TypeScript kann das nicht sehen, weil der Zugriff in einem
  // find()-Callback steckt – zur Laufzeit wirft es.
  const [offenerAuftragId, setOffenerAuftragId] = useState<string | null>(null);
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
  // Lagerplatz aus einem gescannten QR-Aufkleber (?lagerplatz=…, siehe lib/lagerplatzCode.ts).
  // Wird beim Start einmal aus der Adresszeile gelesen und danach an das Lager-Modul gereicht.
  const [gescannterLagerplatzId, setGescannterLagerplatzId] = useState<string | null>(null);
  // Kunde, für den der Kontaktdialog offen ist (Migration 23).
  const [kontaktKundeId, setKontaktKundeId] = useState<string | null>(null);

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
  const brauchtMitarbeiter = tab === "auftraege" || tab === "einsatzplanung" || tab === "admin" || tab === "add" || kundeOffen;
  const brauchtArtikel = tab === "artikel" || tab === "auftraege" || tab === "einsatzplanung" || kundeOffen;
  // Das Auftragsfenster zeigt seit Migration 22 einen Einlagerungs-Block und braucht dafür
  // Lagerplätze, Lager und Einlagerungen – auch dann, wenn es aus dem Aufträge-Tab heraus
  // geöffnet wurde und gar kein Kundendetail offen ist.
  const brauchtLager = tab === "lager" || kundeOffen || offenerAuftragId !== null;

  const kundenQuery = useKunden(supabase, sitzungBereit);
  const auftraegeQuery = useAuftraege(supabase, auftragsFenster, sitzungBereit);
  const mitarbeiterQuery = useMitarbeiter(supabase, sitzungBereit && brauchtMitarbeiter);
  const artikelQuery = useArtikel(supabase, sitzungBereit && brauchtArtikel);
  const artikelpreiseQuery = useArtikelpreise(supabase, sitzungBereit && brauchtArtikel);
  const lagerQuery = useLager(supabase, sitzungBereit && brauchtLager);
  const lagerplaetzeQuery = useLagerplaetze(supabase, sitzungBereit && brauchtLager);
  const einlagerungenQuery = useEinlagerungen(supabase, sitzungBereit && brauchtLager);
  const lagerKennzahlenQuery = useLagerKennzahlen(supabase, sitzungBereit && tab === "dashboard");
  const modulrechteQuery = useModulrechte(supabase, sitzungBereit);
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
  const articles = artikelQuery.data ?? KEINE_ARTIKEL;
  const articlePrices = artikelpreiseQuery.data ?? KEINE_ARTIKELPREISE;
  const warehouses = lagerQuery.data ?? KEINE_LAGER;
  const storageSlots = lagerplaetzeQuery.data ?? KEINE_LAGERPLAETZE;
  const tireStorages = einlagerungenQuery.data ?? KEINE_EINLAGERUNGEN;
  const vehicles = kundeFahrzeugeQuery.data ?? KEINE_FAHRZEUGE;
  const history = historieQuery.data ?? KEINE_HISTORIE;
  const modulePermissions = modulrechteQuery.data ?? KEINE_ZUORDNUNGEN;

  // Das Kundendetail zeigt die VOLLSTÄNDIGE Auftragshistorie eines Kunden, unabhängig vom
  // Zeitfenster der Listen – dort will man sehen, was es zu diesem Kunden je gab.
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
  const liveRef = useRef({ customers, orders, settings });
  liveRef.current = { customers, orders, settings };
  const saveSettingsRef = useRef<(patch: Partial<UserSettings>) => Promise<void>>(async () => {});

  // Jede Funktion in lib/api wirft bei einem Supabase-Fehler eine ApiError (siehe
  // lib/api/client.ts). Bricht ein Klick-Handler dadurch ab, landet das als unbehandelte
  // Promise-Ablehnung hier – eine einzige Stelle statt einer Fehlerbehandlung an ~60
  // Aufrufstellen. Nebeneffekt, der so gewollt ist: das refreshX() nach dem fehlgeschlagenen
  // Schreibvorgang läuft nicht mehr, die Eingabe des Nutzers bleibt also stehen.
  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      const grund = e.reason as { message?: string } | undefined;
      setFehler(grund?.message || "Es ist ein unerwarteter Fehler aufgetreten.");
      e.preventDefault();
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      const role = await fetchOwnRole(supabase, user.id);
      setIsAdmin(role === "admin" || role === "superadmin");
      setIsSuperAdmin(role === "superadmin");
      if (role) setMyRole(role);

      const settingsRow = await fetchOrCreateUserSettings(supabase, user.id);
      if (settingsRow) setSettings(settingsRow);

      // Ab hier ist das Zugriffstoken frisch – jetzt dürfen die Datenabfragen loslaufen.
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
  async function updateArticle(id: string, fields: { short_name: string; long_name: string; active: boolean; braucht_lagerplatz: boolean }) {
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
  async function addOrderArticle(orderId: string, articleId: string, quantity: number, discountPercent: number) {
    await insertOrderArticle(supabase, articlePrices, orderId, articleId, quantity, discountPercent);
    await refreshOrderArticles();
  }
  async function updateOrderArticleQty(id: string, quantity: number) {
    await updateOrderArticleQtyById(supabase, id, quantity);
    await refreshOrderArticles();
  }
  async function updateOrderArticleDiscount(id: string, discountPercent: number) {
    await updateOrderArticleDiscountById(supabase, id, discountPercent);
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
  async function updateModulePermissions(moduleKey: string, roles: string[]) {
    await upsertModulePermissions(supabase, moduleKey, roles);
    await refreshModulePermissions();
  }
  // Superadmin darf/sieht immer alles – auch wenn für einen Schlüssel (noch) keine Zeile in
  // `module_permissions` existiert. Für alle anderen Rollen zählt, ob sie in den hinterlegten
  // Rollen des jeweiligen Schlüssels stehen (oder, falls dazu noch keine DB-Zeile existiert,
  // im eingebauten Standardwert `PERMISSION_DEFAULTS`).
  function hasPermission(key: string): boolean {
    if (isSuperAdmin) return true;
    const roles = modulePermissions[key] ?? PERMISSION_DEFAULTS[key] ?? [];
    return roles.includes(myRole);
  }
  function canView(moduleKey: string): boolean {
    return hasPermission("view." + moduleKey);
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
      // Auch nach einer Größenänderung neu bestimmen: kommt die Karte aus einem
      // Vollseiten-Modul zurück, ist der sichtbare Ausschnitt ein anderer als vorher.
      map.on("resize", syncMarkers);
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
  function makeIcon(zustand: KundenZustand) {
    const L = leafletRef.current;
    if (zustand === "kein-interesse") {
      return L.divIcon({
        className: "custom-pin",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#fff;
                border:2px solid ${MARKER_FARBE.red};box-shadow:0 1px 4px rgba(0,0,0,.4);
                display:flex;align-items:center;justify-content:center;
                color:${MARKER_FARBE.red};font:700 14px/1 sans-serif;">✕</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11],
      });
    }
    const bg = MARKER_FARBE[zustand];
    return L.divIcon({
      className: "custom-pin",
      html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${bg};
              transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
      iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -22],
    });
  }

  function syncMarkers() {
    const L = leafletRef.current;
    if (!L || !markerLayerRef.current) return;
    const { customers: custs, orders: ords, settings: s } = liveRef.current;
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
      if (gezeichnet >= MAX_MARKER) { ausgelassen++; return; }
      gezeichnet++;
      seen.add(cust.id);
      const color = effectiveColor(cust, s.period_months);
      const nextOrd = nextOrder(ordersForLive(cust.id, ords));
      let tooltip = `<b>${escapeHtml(cust.name)}</b><br>${escapeHtml(cust.address)}<br>` +
        (cust.status === "kontaktiert" && cust.last_contact ? `Letzter Kontakt: ${formatDate(cust.last_contact)}` : "Noch nicht kontaktiert");
      if (nextOrd) tooltip += `<br>📅 Termin: ${formatOrderDateTime(nextOrd)} – ${escapeHtml(nextOrd.title)}${nextOrd.description ? " (" + escapeHtml(nextOrd.description) + ")" : ""}`;

      let marker = markerIndexRef.current[cust.id];
      if (marker) {
        marker.setIcon(makeIcon(color));
        marker.setLatLng([cust.lat, cust.lng]);
        marker.setTooltipContent(tooltip);
        marker.setPopupContent(() => buildPopupEl(cust.id));
      } else {
        marker = L.marker([cust.lat, cust.lng], { icon: makeIcon(color) });
        marker.bindTooltip(tooltip, { className: "cust-tip" });
        marker.bindPopup(() => buildPopupEl(cust.id), { minWidth: 240 });
        marker.on("popupopen", () => attachPopupHandlers(cust.id, marker));
        marker.addTo(markerLayerRef.current);
        markerIndexRef.current[cust.id] = marker;
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
  useEffect(() => { syncMarkers(); }, [customers, orders, settings.period_months]);

  // ---------------------------------------------------------------- Popup-Inhalt (imperativ, wie im Original)
  function buildPopupEl(customerId: string): HTMLElement {
    const { customers: custs, orders: ords, settings: s } = liveRef.current;
    const cust = custs.find((c) => c.id === customerId);
    const div = document.createElement("div");
    if (!cust) { div.textContent = "Kunde nicht gefunden"; return div; }
    const color = effectiveColor(cust, s.period_months);
    const nextOrd = nextOrder(ordersForLive(cust.id, ords));
    const phoneLines = getPhoneNumbers(cust).map(n => `<div class="pline">📞 ${escapeHtml(n.label)}: ${escapeHtml(n.number)}</div>`).join("");
    div.innerHTML = `
      <div class="header-row">
        <h3>${escapeHtml(cust.company || cust.name)} <span class="badge ${color}">${KUNDEN_ZUSTAND_LABEL[color]}</span></h3>
        ${buildCallIconHtml(cust)}
      </div>
      ${cust.company ? `<div class="pline">👤 ${escapeHtml(cust.name)}</div>` : ""}
      <div class="pline">📍 ${escapeHtml(cust.address)}</div>
      ${cust.email ? `<div class="pline">✉️ ${escapeHtml(cust.email)}</div>` : ""}
      ${phoneLines}
      ${cust.note ? `<div class="pline">📝 ${escapeHtml(cust.note)}</div>` : ""}
      <div class="pline small">Letzter Kontakt: ${cust.last_contact ? formatDate(cust.last_contact) : "–"}</div>
      ${nextOrd ? `<div class="pline small">📅 Nächster Termin: ${formatOrderDateTime(nextOrd)} – ${escapeHtml(nextOrd.title)}${nextOrd.description ? " (" + escapeHtml(nextOrd.description) + ")" : ""}</div>` : ""}
      ${cust.wiedervorlage_am && color === "orange" ? `<div class="pline small">🔁 Wiedervorlage am ${formatDate(cust.wiedervorlage_am)}</div>` : ""}
      <hr>
      <button id="btnNewOrder" class="btn-primary btn-block" style="margin-bottom:10px;">+ Auftrag anlegen</button>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button id="btnMarkContacted" style="flex:1" class="btn-green">✔ Kontakt bestätigen</button>
        <button id="btnMarkOpen" style="flex:1" class="btn-secondary">Auf offen setzen</button>
      </div>
      ${color === "kein-interesse" ? `<button id="btnDeactivate" class="btn-secondary btn-block" style="margin-bottom:6px;color:#b33;">Kunde deaktivieren</button>` : ""}
      <button id="btnEditCust" class="btn-secondary btn-block">✏️ Kundendaten &amp; Aufträge bearbeiten</button>
    `;
    return div;
  }

  function attachPopupHandlers(customerId: string, marker: any) {
    const bN = document.getElementById("btnNewOrder");
    const bC = document.getElementById("btnMarkContacted");
    const bO = document.getElementById("btnMarkOpen");
    const bE = document.getElementById("btnEditCust");
    // Auftrag anlegen und Kontakt bestätigen sind seit 29.08.2026 zwei getrennte Handlungen.
    // Der Auftrag öffnet das gewohnte Anlegeformular als Overlay über der Karte – kein
    // Reiterwechsel, nach dem Speichern steht man wieder hier.
    if (bN) bN.onclick = () => { marker.closePopup(); void neuenAuftragAnlegen(customerId); };
    // „Kontakt bestätigen" öffnet den Kontaktdialog, statt direkt zu speichern: erst dort wird
    // festgehalten, WAS herausgekommen ist (Migration 23). Das Kontaktdatum steht ebenfalls
    // dort – ein zweites Datumsfeld im Popup wäre eine zweite Stelle für dieselbe Angabe.
    if (bC) bC.onclick = () => { marker.closePopup(); setKontaktKundeId(customerId); };
    if (bO) bO.onclick = async () => { await markOpen(customerId); marker.closePopup(); };
    // Erscheint nur bei „kein Interesse": das Deaktivieren bleibt ein eigener, bewusster
    // Schritt und passiert nicht als Nebenwirkung des Anrufergebnisses (siehe Migration 23).
    const bD = document.getElementById("btnDeactivate");
    if (bD) bD.onclick = async () => { await setActive(customerId, false); marker.closePopup(); };
    if (bE) bE.onclick = () => { setSelectedId(customerId); loadHistory(customerId); marker.closePopup(); };
    attachCallIconHandler();
  }

  function buildCallIconHtml(cust: Customer, small = false): string {
    const nums = getPhoneNumbers(cust);
    if (!nums.length) return "";
    return `<button type="button" class="call-icon-btn${small ? " small" : ""}" data-call-cust="${cust.id}" title="Anrufen">📞</button>`;
  }
  function attachCallIconHandler() {
    document.querySelectorAll("[data-call-cust]").forEach((btn) => {
      (btn as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.callCust!;
        const cust = liveRef.current.customers.find((c) => c.id === id);
        if (!cust) return;
        const nums = getPhoneNumbers(cust);
        if (nums.length <= 1) {
          if (nums.length === 1) window.location.href = "tel:" + telHref(nums[0].number);
          return;
        }
        const rect = (btn as HTMLElement).getBoundingClientRect();
        setCallMenuPos({ top: clampMenuTop(rect, 90), left: Math.min(rect.left, window.innerWidth - 190) });
        setCallMenuFor(cust);
      };
    });
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
    await refreshCustomers();
    await refreshOrders();
    setSelectedId(null);
  }
  async function updateCustomerFields(id: string, fields: Partial<Customer>) {
    const cust = customers.find((c) => c.id === id);
    await updateCustomerFieldsById(supabase, id, fields, cust?.address);
    await refreshCustomers();
  }
  async function addCustomer(fields: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    orderTitle: string; orderDescription: string; orderDate: string; orderTime: string; assignedEmployeeId: string;
  }) {
    const { id: createdId, lat } = await insertCustomer(supabase, fields);
    // Ruft ein Kunde selbst an und wird dabei neu angelegt, ist im gleichen Zug meist auch
    // schon klar, worum es geht – deshalb kann direkt ein passender Auftrag mit angelegt werden.
    if (createdId && fields.orderTitle.trim()) {
      const createdOrderId = await insertOrder(supabase, {
        customerId: createdId, title: fields.orderTitle.trim(), description: fields.orderDescription,
        orderDate: fields.orderDate || todayStr(), time: fields.orderTime, status: "offen",
      });
      if (createdOrderId && fields.assignedEmployeeId) await setOrderEmployees(createdOrderId, [fields.assignedEmployeeId]);
      await refreshOrders();
    }
    await refreshCustomers();
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
  async function assignTire(fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) {
    await upsertTireAssignment(supabase, fields);
    await refreshTireStorages();
  }
  async function removeTireAssignment(id: string) {
    await removeTireAssignmentById(supabase, id);
    await refreshTireStorages();
  }

  // ---------------------------------------------------------------- Aufträge-Modul (Termine inklusive)
  // Mitarbeiter-Zuordnung läuft komplett über `order_employees` (Migration 11) – ein Auftrag kann
  // mehreren Mitarbeitern zugeordnet sein (z. B. bei umfangreichen Aufträgen). `assignedEmployeeIds`
  // ist deshalb überall eine Liste, auch wenn sie in vielen Fällen nur ein Element hat.
  async function addOrder(fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
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
  async function neuenAuftragAnlegen(kundenId: string) {
    const kunde = customers.find((c) => c.id === kundenId);
    const id = await addOrder({
      customerId: kundenId, title: terminTitel(kunde?.name), description: "",
      orderDate: todayStr(), time: "", status: "offen", assignedEmployeeIds: [],
    });
    if (!id) return;
    setFrischerAuftragId(id);
    setOffenerAuftragId(id);
  }
  // ------------------------------------------------------- Einlagerung am Auftrag (Migration 22)
  // Die aktive Einlagerung eines Auftrags. "Aktiv" heißt: noch nicht ausgelagert
  // (`removed_at is null`) – die Historie eines Lagerplatzes bleibt davon unberührt.
  function einlagerungZuAuftrag(orderId: string): TireStorage | null {
    return tireStorages.find((t) => t.order_id === orderId && !t.removed_at) || null;
  }
  // Steht im Auftrag eine Leistung, die einen Lagerplatz verlangt? Gefragt wird das Kennzeichen
  // am Artikel, nicht dessen Name – siehe lib/types.ts, `Article.braucht_lagerplatz`.
  function auftragBrauchtLagerplatz(orderId: string): boolean {
    return orderArticlesFor(orderId).some(
      (pos) => articles.find((a) => a.id === pos.article_id)?.braucht_lagerplatz
    );
  }
  async function einlagernFuerAuftrag(order: Order, lagerplatzId: string) {
    await upsertTireAssignment(supabase, {
      // Eine vorhandene Einlagerung dieses Auftrags wird umgezogen statt doppelt angelegt –
      // sonst blieben zwei Plätze belegt, von denen einer niemandem gehört.
      id: einlagerungZuAuftrag(order.id)?.id,
      storageSlotId: lagerplatzId,
      customerId: order.customer_id,
      dotDate: "", profiltiefeMm: "", note: "",
      orderId: order.id,
    });
    await refreshTireStorages();
  }

  async function updateOrder(id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    await updateOrderById(supabase, id, fields);
    await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  // Zustandswechsel eines Auftrags. Welche Übergänge erlaubt sind, entscheidet der Trigger aus
  // Migration 20 – lehnt er ab, kommt der Grund als Fehlermeldung zurück und wird über die
  // zentrale Anzeige sichtbar (siehe lib/api/client.ts).
  async function updateOrderStatus(id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) {
    await updateOrderStatusById(supabase, id, status, grund);
    await refreshOrders();
  }
  async function setOrderVehicle(id: string, vehicleId: string | null) {
    await updateOrderVehicle(supabase, id, vehicleId);
    await refreshOrders();
  }
  async function updateTechnikerNotiz(id: string, notiz: string) {
    await updateOrderTechnikerNotiz(supabase, id, notiz);
    await refreshOrders();
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
    licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
  }) {
    await insertVehicle(supabase, customerId, fields);
    await refreshVehicles();
  }
  async function updateVehicle(id: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
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
    router.push("/login");
  }

  // ---------------------------------------------------------------- Ableitungen für die Liste
  //
  // Alles hier in useMemo: Filtern und Sortieren laufen über den gesamten Kundenbestand, und
  // localeCompare ist nicht billig – ohne Zwischenspeicherung würde das bei jedem Rendern der
  // Komponente erneut passieren, also auch beim Öffnen eines Popovers.
  const activeCustomers = useMemo(() => customers.filter((c) => c.active !== false), [customers]);
  const listItems = useMemo(
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
        .filter((c) => {
          if (filter === "all") return true;
          if (filter === "nogeo") return c.lat == null;
          const color = effectiveColor(c, settings.period_months);
          if (filter === "offen") return color === "red";
          if (filter === "ok") return color === "green";
          if (filter === "wiedervorlage") return color === "orange";
          if (filter === "kein_interesse") return color === "kein-interesse";
          return true;
        })
        .filter((c) => !letterFilter || c.name.trim().charAt(0).toUpperCase() === letterFilter)
        .filter((c) => {
          if (!plzFilter.trim()) return true;
          const match = c.address.match(/\b\d{5}\b/);
          return !!match && match[0].startsWith(plzFilter.trim());
        })
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [activeCustomers, search, filter, letterFilter, plzFilter, settings.period_months]
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
    () => activeCustomers.filter((c) => effectiveColor(c, settings.period_months) === "green").length,
    [activeCustomers, settings.period_months]
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

  const apptRows = useMemo(
    () =>
      customers
        .filter((c) => c.active !== false)
        .flatMap((c) => (auftraegeJeKunde[c.id] || KEINE_AUFTRAEGE).map((o) => ({ cust: c, order: o, past: isOrderPast(o) })))
        .filter((r) => !onlyUpcoming || !r.past)
        .sort((a, b) => orderDateTime(a.order).getTime() - orderDateTime(b.order).getTime()),
    [customers, auftraegeJeKunde, onlyUpcoming]
  );

  // Aufruf über einen QR-Aufkleber am Regal: die App öffnet sich mit ?lagerplatz=‹Kennung›.
  // Bewusst über `window.location` statt `useSearchParams()`: dieser Baum ist vollständig auf
  // dem Client zuhause, und `useSearchParams` verlangte in Next 14 eine Suspense-Grenze und
  // machte die Seite dynamisch – Aufwand ohne Gegenwert für einen einzelnen Parameter.
  //
  // Die Adresszeile wird sofort wieder bereinigt: sonst landet der Parameter in Lesezeichen und
  // im Verlauf, und ein Neuladen springt Wochen später wieder auf denselben Lagerplatz.
  useEffect(() => {
    const parameter = new URLSearchParams(window.location.search);
    const roh = parameter.get(LAGERPLATZ_PARAMETER);
    if (!roh) return;
    const id = lagerplatzIdAusCode(roh);
    parameter.delete(LAGERPLATZ_PARAMETER);
    const rest = parameter.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (!id) return;
    setGescannterLagerplatzId(id);
    setTab("lager");
  }, []);

  function openDetail(id: string) {
    setSelectedId(id);
    loadHistory(id);
    const cust = customers.find((c) => c.id === id);
    if (cust?.lat != null && mapRef.current) mapRef.current.setView([cust.lat, cust.lng], Math.max(mapRef.current.getZoom(), 15));
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
    const totals = orderArticleTotals(rows);
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
  // Hauptnavigation: Dashboard/Kunden/Aufträge sind immer sichtbar. Alles andere ist auf dem
  // Desktop Teil der breiten Seitenleiste (wie in einem ERP-System), auf dem Handy dagegen
  // hinter "Weitere" versteckt, damit die schmale Leiste dort nicht überladen wirkt.
  const SECONDARY_TABS: TabKey[] = ["termine", "lager", "einsatzplanung", "add", "inactive", "artikel", "admin", "settings"];
  const isMoreActive = SECONDARY_TABS.includes(tab);

  return (
    <div id="app" ref={appRef} className={fullPageTabs ? "vollseite" : undefined}>
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
        <NavItem active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<IconDashboard />} label="Dashboard" />
        {canView("kunden") && <NavItem active={tab === "list"} onClick={() => setTab("list")} icon={<IconKunden />} label="Kunden" />}
        {canView("auftraege") && <NavItem active={tab === "auftraege"} onClick={() => setTab("auftraege")} icon={<IconAuftraege />} label="Aufträge" />}

        <div className="nav-divider nav-secondary" />
        {canView("termine") && <NavItem className="nav-secondary" active={tab === "termine"} onClick={() => setTab("termine")} icon={<IconTermine />} label="Termine" />}
        {canView("lager") && <NavItem className="nav-secondary" active={tab === "lager"} onClick={() => setTab("lager")} icon={<IconLager />} label="Lager" />}
        {canView("einsatzplanung") && <NavItem className="nav-secondary" active={tab === "einsatzplanung"} onClick={() => setTab("einsatzplanung")} icon={<IconEinsatzplanung />} label="Einsatzplanung" />}
        {canView("neuer_kunde") && <NavItem className="nav-secondary" active={tab === "add"} onClick={() => setTab("add")} icon={<IconNeu />} label="Neuer Kunde" />}
        {canView("inaktive_kunden") && <NavItem className="nav-secondary" active={tab === "inactive"} onClick={() => setTab("inactive")} icon={<IconInaktiv />} label="Inaktive Kunden" />}
        {canView("artikel") && <NavItem className="nav-secondary" active={tab === "artikel"} onClick={() => setTab("artikel")} icon={<IconArtikel />} label="Artikel" />}

        <div className="nav-spacer nav-secondary" />
        {isAdmin && (
          <NavItem className="nav-secondary" active={tab === "admin"} onClick={() => setTab("admin")} icon={<IconAdmin />} label="Admin" />
        )}
        {canView("einstellungen") && <NavItem className="nav-secondary" active={tab === "settings"} onClick={() => setTab("settings")} icon={<IconSettings />} label="Einstellungen" />}

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

        {tab === "dashboard" && (
          <div className="tabpanel active">
            <div className="stats">
              <div className="stat"><div className="num">{statTotal}</div><div className="lbl">Gesamt</div></div>
              <div className="stat red"><div className="num">{statTotal - statOk}</div><div className="lbl">Offen</div></div>
              <div className="stat green"><div className="num">{statOk}</div><div className="lbl">Kontaktiert</div></div>
            </div>
            <div className="module-cards">
              {canView("termine") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("termine")}>
                  <div className="mc-icon"><IconTermine /></div>
                  <div className="mc-text">
                    <div className="mc-title">Anstehende Termine</div>
                    <div className="mc-sub">Nächste Reifenwechsel-Termine im Blick behalten</div>
                  </div>
                  <div className="mc-tag">{upcomingApptCount}</div>
                </div>
              )}
              {canView("lager") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("lager")}>
                  <div className="mc-icon"><IconLager /></div>
                  <div className="mc-text">
                    <div className="mc-title">Belegte Lagerplätze</div>
                    <div className="mc-sub">von {slotsGesamt} Lagerplätzen insgesamt</div>
                  </div>
                  <div className="mc-tag">{occupiedSlots}</div>
                </div>
              )}
              {canView("auftraege") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("auftraege")}>
                  <div className="mc-icon"><IconAuftraege /></div>
                  <div className="mc-text">
                    <div className="mc-title">Offene Aufträge</div>
                    <div className="mc-sub">von {orders.length} Aufträgen insgesamt</div>
                  </div>
                  <div className="mc-tag">{openOrders}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "list" && canView("kunden") && (
          <div className="tabpanel active">
            <input id="search" type="text" placeholder="Kunde oder Adresse suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="filterbar">
              <button type="button" className={"chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>Alle</button>
              <button type="button" className={"chip" + (filter === "offen" ? " active" : "")} onClick={() => setFilter("offen")}>Offen</button>
              <button type="button" className={"chip" + (filter === "ok" ? " active" : "")} onClick={() => setFilter("ok")}>Kontaktiert</button>
              <button type="button" className={"chip" + (filter === "wiedervorlage" ? " active" : "")} onClick={() => setFilter("wiedervorlage")}>Wiedervorlage</button>
              <button type="button" className={"chip" + (filter === "kein_interesse" ? " active" : "")} onClick={() => setFilter("kein_interesse")}>Kein Interesse</button>
              <button type="button" className={"chip" + (filter === "nogeo" ? " active" : "")} onClick={() => setFilter("nogeo")}>Ohne Karte</button>
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
              {listItems.length === 0 && <div className="empty">Keine Kunden gefunden.</div>}
              {sichtbareListItems.map((c) => {
                const color = c.lat == null ? "gray" : effectiveColor(c, settings.period_months);
                const nextOrd = nextOrder(ordersFor(c.id));
                return (
                  <div key={c.id} className="cust-item" onClick={() => openDetail(c.id)}>
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
            <div className="checkbox-row" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} />
              <label>Nur anstehende Termine zeigen</label>
            </div>
            <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
              {apptRows.length === 0 ? (
                <div className="empty">Keine Termine gefunden.</div>
              ) : (
                <table className="appt-table">
                  <thead><tr><th>Termin</th><th>Kunde</th><th>Auftrag</th><th></th></tr></thead>
                  <tbody>
                    {apptRows.map(({ cust, order, past }) => {
                      const empNames = employeeNamesFor(order.id);
                      return (
                        <tr key={order.id} className={`klickbar${past ? " past" : ""}`} onClick={() => setOffenerAuftragId(order.id)} title="Auftrag öffnen">
                          <td className="date-cell">{formatOrderDateTime(order)}{past ? " (vergangen)" : ""}</td>
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
                              <button
                                className="call-icon-btn small"
                                title="Anrufen"
                                onClick={(e) => {
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setCallMenuPos({ top: clampMenuTop(rect, 90), left: Math.min(rect.left, window.innerWidth - 190) });
                                  setCallMenuFor(cust);
                                }}
                              >📞</button>
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
            employees={employees}
            orderEmployees={orderEmployees}
            onAdd={addOrder}
            onDelete={deleteOrder}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onOpenOrder={setOffenerAuftragId}
            onNavigate={openNavMenu}
            isTechniker={isTechniker}
            onUpdateTechnikerNotiz={updateTechnikerNotiz}
          />
          </>
        )}

        {tab === "lager" && canView("lager") && (
          <LagerPanel
            customers={customers}
            warehouses={warehouses}
            storageSlots={storageSlots}
            tireStorages={tireStorages}
            onAddWarehouse={addWarehouse}
            onUpdateWarehouse={updateWarehouse}
            onDeleteWarehouse={deleteWarehouse}
            onAddSlot={addStorageSlot}
            onAddSlotsBulk={addStorageSlotsBulk}
            onDeleteSlot={deleteStorageSlot}
            onAssignTire={assignTire}
            onRemoveAssignment={removeTireAssignment}
            canCreateWarehouse={hasPermission("action.lager.warehouse_create")}
            canEditWarehouse={hasPermission("action.lager.warehouse_edit")}
            canDeleteWarehouse={hasPermission("action.lager.warehouse_delete")}
            canCreateSlot={hasPermission("action.lager.slot_create")}
            canDeleteSlot={hasPermission("action.lager.slot_delete")}
            canAssignTire={hasPermission("action.lager.tire_assign")}
            springeZuLagerplatzId={gescannterLagerplatzId}
            onLagerplatzGeoeffnet={() => setGescannterLagerplatzId(null)}
          />
        )}

        {tab === "einsatzplanung" && canView("einsatzplanung") && (
          <>
          <FensterSchalter wert={auftragsFenster} onChange={setAuftragsFenster} laedt={auftraegeQuery.isFetching} />
          <EinsatzplanungPanel
            customers={customers}
            orders={orders}
            employees={employees}
            orderEmployees={orderEmployees}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onOpenOrder={setOffenerAuftragId}
            onDelete={deleteOrder}
            isTechniker={isTechniker}
            onUpdateTechnikerNotiz={updateTechnikerNotiz}
          />
          </>
        )}

        {tab === "more" && (
          <div className="tabpanel active">
            <div className="module-cards">
              {canView("termine") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("termine")}>
                  <div className="mc-icon"><IconTermine /></div>
                  <div className="mc-text">
                    <div className="mc-title">Termine</div>
                    <div className="mc-sub">Chronologische Terminübersicht (Aufträge mit Uhrzeit)</div>
                  </div>
                </div>
              )}
              {canView("lager") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("lager")}>
                  <div className="mc-icon"><IconLager /></div>
                  <div className="mc-text">
                    <div className="mc-title">Lager</div>
                    <div className="mc-sub">Lager &amp; Lagerplätze verwalten, Reifen zuordnen</div>
                  </div>
                </div>
              )}
              {canView("einsatzplanung") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("einsatzplanung")}>
                  <div className="mc-icon"><IconEinsatzplanung /></div>
                  <div className="mc-text">
                    <div className="mc-title">Einsatzplanung</div>
                    <div className="mc-sub">Aufträge nach Tag und Mitarbeiter planen</div>
                  </div>
                </div>
              )}
              {canView("neuer_kunde") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("add")}>
                  <div className="mc-icon"><IconNeu /></div>
                  <div className="mc-text">
                    <div className="mc-title">Neuer Kunde</div>
                    <div className="mc-sub">Kunden anlegen, optional gleich mit Auftrag</div>
                  </div>
                </div>
              )}
              {canView("inaktive_kunden") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("inactive")}>
                  <div className="mc-icon"><IconInaktiv /></div>
                  <div className="mc-text">
                    <div className="mc-title">Inaktive Kunden</div>
                    <div className="mc-sub">Deaktivierte Kunden ansehen &amp; reaktivieren</div>
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("admin")}>
                  <div className="mc-icon"><IconAdmin /></div>
                  <div className="mc-text">
                    <div className="mc-title">Admin</div>
                    <div className="mc-sub">Nutzer einladen &amp; verwalten, Mitarbeiter</div>
                  </div>
                </div>
              )}
              {canView("einstellungen") && (
                <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("settings")}>
                  <div className="mc-icon"><IconSettings /></div>
                  <div className="mc-text">
                    <div className="mc-title">Settings</div>
                    <div className="mc-sub">Anzeige, Wiedervorlage-Zeitraum, Abmelden</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "inactive" && canView("inaktive_kunden") && (
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

        {tab === "add" && canView("neuer_kunde") && <AddCustomerForm onAdd={addCustomer} employees={employees} />}

        {tab === "settings" && canView("einstellungen") && (
          <SettingsPanel
            settings={settings}
            onChange={saveSettingsPatch}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            userEmail={userEmail}
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
          />
        )}
      </div>

      <div id="map" ref={mapDivRef} className={mobileMapVisible ? "mobile-visible" : ""}>
        {ausgelasseneMarker > 0 && !fullPageTabs && (
          <div className="map-hinweis">
            {ausgelasseneMarker} weitere Kunden in diesem Ausschnitt – zum Anzeigen näher heranzoomen.
          </div>
        )}
      </div>

      {!fullPageTabs && (
        <button id="mapToggleBtn" type="button" onClick={toggleMobileMap} title={mobileMapVisible ? "Liste anzeigen" : "Karte anzeigen"}>
          {mobileMapVisible ? <IconKunden /> : <IconMap />}
        </button>
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

      {offenerAuftrag && (
        <AuftragModal
          order={offenerAuftrag}
          customer={customers.find((c) => c.id === offenerAuftrag.customer_id)}
          vehicles={auftragFahrzeugeQuery.data ?? KEINE_FAHRZEUGE}
          employees={employees}
          assignedEmployeeIds={orderEmployees[offenerAuftrag.id] || []}
          articles={articles}
          orderArticles={orderArticlesFor(offenerAuftrag.id)}
          isTechniker={isTechniker}
          darfWiedereroeffnen={isAdmin}
          frischAngelegt={offenerAuftrag.id === frischerAuftragId}
          einlagerung={einlagerungZuAuftrag(offenerAuftrag.id)}
          brauchtLagerplatz={auftragBrauchtLagerplatz(offenerAuftrag.id)}
          storageSlots={storageSlots}
          warehouses={warehouses}
          belegteSlotIds={belegteSlotIds}
          onEinlagern={(lagerplatzId) => einlagernFuerAuftrag(offenerAuftrag, lagerplatzId)}
          onEinlagerungEntfernen={removeTireAssignment}
          onClose={() => { setOffenerAuftragId(null); setFrischerAuftragId(null); }}
          onSaveFields={updateOrder}
          onSetVehicle={setOrderVehicle}
          onUpdateTechnikerNotiz={updateTechnikerNotiz}
          onSetStatus={updateOrderStatus}
          onDelete={deleteOrder}
          onAddArticle={addOrderArticle}
          onUpdateArticleQty={updateOrderArticleQty}
          onUpdateArticleDiscount={updateOrderArticleDiscount}
          onRemoveArticle={removeOrderArticle}
          onNavigate={openNavMenu}
        />
      )}

      {selectedId && (
        <DetailModal
          customer={customers.find((c) => c.id === selectedId)!}
          orders={kundeAuftraege}
          employees={employees}
          orderEmployees={orderEmployees}
          articles={articles}
          orderArticles={orderArticles}
          onAddOrderArticle={addOrderArticle}
          onUpdateOrderArticleQty={updateOrderArticleQty}
          onUpdateOrderArticleDiscount={updateOrderArticleDiscount}
          onRemoveOrderArticle={removeOrderArticle}
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
          onAddOrder={(fields) => addOrder({ ...fields, customerId: selectedId })}
          onUpdateOrder={updateOrder}
          onDeleteOrder={deleteOrder}
          onAddVehicle={(fields) => addVehicle(selectedId, fields)}
          onUpdateVehicle={updateVehicle}
          onDeleteVehicle={deleteVehicle}
          onCall={(cust) => {
            const nums = getPhoneNumbers(cust);
            if (nums.length === 1) window.location.href = "tel:" + telHref(nums[0].number);
            else if (nums.length > 1) { setCallMenuPos({ top: 80, left: 80 }); setCallMenuFor(cust); }
          }}
        />
      )}

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

// DetailModal, CustomerOrderRow, AddOrderInline sowie die Fahrzeug-Komponenten
// (VehicleRow, AddVehicleInline) sind ausgelagert nach components/kunden/DetailModal.tsx,
// components/kunden/CustomerOrderRow.tsx, components/kunden/AddOrderInline.tsx und
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

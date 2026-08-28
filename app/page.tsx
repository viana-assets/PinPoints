"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type {
  Customer, ContactHistoryEntry, UserSettings,
  Warehouse, StorageSlot, TireStorage, Order, OrderStatus, Vehicle, Role, Profile, Employee,
  Article, ArticlePrice, OrderArticle,
} from "@/lib/types";
import {
  todayStr, formatDate, formatOrderDateTime, isOrderPast, nextOrder, orderDateTime,
  effectiveColor, telHref, getPhoneNumbers, geocodeAddress, navigationUrls,
  formatEUR, currentArticlePrice, orderArticleTotals,
} from "@/lib/helpers";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";

type TabKey = "dashboard" | "list" | "termine" | "lager" | "einsatzplanung" | "auftraege" | "inactive" | "add" | "settings" | "admin" | "more";

// =====================================================================
// Modul-Berechtigungen: ein fester Katalog von Berechtigungs-"Zeilen", jede mit einem
// eindeutigen Schlüssel (in `module_permissions.module_key` gespeichert). "view.*" steuert,
// ob eine Rolle den jeweiligen Tab überhaupt sieht/öffnen kann; "action.*" steuert einzelne
// Handlungen innerhalb eines Moduls (aktuell nur Lager, weil das konkret gefragt war – lässt
// sich für weitere Module genauso ergänzen). Superadmin darf immer alles, unabhängig von
// dieser Tabelle. Dashboard ist immer für alle sichtbar (Startseite/Absturz-Sicherung), daher
// zwar in der Liste (Transparenz), aber nicht abwählbar.
// =====================================================================
type PermItem = { key: string; label: string; indent?: boolean; locked?: boolean };
const PERMISSION_CATALOG: PermItem[] = [
  { key: "view.dashboard", label: "Dashboard", locked: true },
  { key: "view.kunden", label: "Kunden" },
  { key: "view.auftraege", label: "Aufträge" },
  { key: "view.termine", label: "Termine" },
  { key: "view.lager", label: "Lager" },
  { key: "action.lager.tire_assign", label: "– Reifen einem Lagerplatz zuordnen/entfernen", indent: true },
  { key: "action.lager.slot_create", label: "– Lagerplätze anlegen", indent: true },
  { key: "action.lager.slot_delete", label: "– Lagerplätze löschen", indent: true },
  { key: "action.lager.warehouse_create", label: "– Neues Lager anlegen", indent: true },
  { key: "action.lager.warehouse_edit", label: "– Lager bearbeiten (Name/Adresse/Notiz)", indent: true },
  { key: "action.lager.warehouse_delete", label: "– Lager löschen", indent: true },
  { key: "view.einsatzplanung", label: "Einsatzplanung" },
  { key: "view.neuer_kunde", label: "Neuer Kunde" },
  { key: "view.inaktive_kunden", label: "Inaktive Kunden" },
  { key: "view.einstellungen", label: "Einstellungen" },
];
// Fallback, solange in der Datenbank (noch) keine Zeile für einen Schlüssel existiert –
// entspricht dem Verhalten von vor der Modul-Berechtigungen-Funktion (nichts eingeschränkt),
// außer bei den Lager-Struktur-Aktionen, die von Anfang an nur Admin/Superadmin waren.
const PERMISSION_DEFAULTS: Record<string, string[]> = {
  "view.dashboard": ["admin", "techniker", "user"],
  "view.kunden": ["admin", "techniker", "user"],
  "view.auftraege": ["admin", "techniker", "user"],
  "view.termine": ["admin", "techniker", "user"],
  "view.lager": ["admin", "techniker", "user"],
  "action.lager.tire_assign": ["admin", "techniker", "user"],
  "action.lager.slot_create": ["admin"],
  "action.lager.slot_delete": ["admin"],
  "action.lager.warehouse_create": ["admin"],
  "action.lager.warehouse_edit": ["admin"],
  "action.lager.warehouse_delete": ["admin"],
  "view.einsatzplanung": ["admin", "techniker", "user"],
  "view.neuer_kunde": ["admin", "techniker", "user"],
  "view.inaktive_kunden": ["admin", "techniker", "user"],
  "view.einstellungen": ["admin", "techniker", "user"],
};
const PERMISSION_ROLES: Role[] = ["admin", "techniker", "user"];

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [myRole, setMyRole] = useState<Role>("user");
  const [userEmail, setUserEmail] = useState("");
  const [tab, setTab] = useState<TabKey>("dashboard");
  // Vollseiten-Module: hier ergibt die Karte keinen Sinn, der Inhalt bekommt die volle Breite.
  // Weit oben berechnet (statt erst kurz vor dem Rendern), damit ein Effekt weiter unten, der
  // beim Wechsel zwischen Vollseiten- und normalem Tab einen Reflow erzwingt, sich problemlos
  // darauf verlassen kann (Hooks dürfen nicht erst nach einem bedingten Return kommen).
  const fullPageTabs = tab === "lager" || tab === "einsatzplanung" || tab === "admin" || tab === "auftraege";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [storageSlots, setStorageSlots] = useState<StorageSlot[]>([]);
  const [tireStorages, setTireStorages] = useState<TireStorage[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Mehrere Mitarbeiter je Auftrag (Migration 11, Tabelle `order_employees`): Auftrag-ID → Liste
  // von Mitarbeiter-IDs. `orders.assigned_employee_id` bleibt in der Datenbank als Altlast
  // liegen, wird von der App aber nicht mehr verwendet – Zuordnungen laufen ab sofort komplett
  // über diese Map/Tabelle.
  const [orderEmployees, setOrderEmployeesMap] = useState<Record<string, string[]>>({});
  // Artikelstammdaten (Migration 12): Dienstleistungen/Artikel mit Preis-Historie, die einem
  // Auftrag zugeordnet werden können ("Leistungen"). `orderArticles` ist bewusst eine flache
  // Liste (nicht nach Auftrag gruppiert), analog zu den anderen Rohdaten-States.
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlePrices, setArticlePrices] = useState<ArticlePrice[]>([]);
  const [orderArticles, setOrderArticlesState] = useState<OrderArticle[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // Modul-Berechtigungen: pro Modul (aktuell nur "lager") hinterlegt, welche Rollen dort
  // strukturelle Änderungen vornehmen dürfen (Migration 09). Superadmin darf immer alles,
  // unabhängig vom Inhalt dieser Tabelle (Sicherheitsnetz falls eine Zeile fehlt).
  const [modulePermissions, setModulePermissions] = useState<Record<string, string[]>>({});
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "", period_months: 3, map_style: "strasse", row_display: "datum",
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "offen" | "ok" | "nogeo">("all");
  const [plzFilter, setPlzFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactHistoryEntry[]>([]);

  const [mobileMapVisible, setMobileMapVisible] = useState(false);
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
  // Leistungen/Artikel-Zuordnung eines Auftrags (Aufträge-Tab & Einsatzplanung): gleiches
  // Popover-Muster wie beim Mitarbeiter-Menü, nur mit dem Artikelstamm statt Mitarbeitern.
  const [artMenuFor, setArtMenuFor] = useState<string | null>(null);
  const [artMenuPos, setArtMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const appRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const markerIndexRef = useRef<Record<string, any>>({});
  const baseLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);

  // Aktuelle Daten/Handler als Ref, damit Leaflet-Popup-Callbacks (die außerhalb
  // des React-Renderzyklus leben) nie mit veralteten Closures arbeiten.
  const liveRef = useRef({ customers, orders, settings });
  liveRef.current = { customers, orders, settings };
  const saveSettingsRef = useRef<(patch: Partial<UserSettings>) => Promise<void>>(async () => {});

  // ---------------------------------------------------------------- Initial-Load
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin" || profile?.role === "superadmin");
      setIsSuperAdmin(profile?.role === "superadmin");
      if (profile?.role) setMyRole(profile.role as Role);

      let { data: settingsRow } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (!settingsRow) {
        const { data: created } = await supabase
          .from("user_settings")
          .insert({ user_id: user.id })
          .select("*")
          .single();
        settingsRow = created;
      }
      if (settingsRow) setSettings(settingsRow as UserSettings);

      await refreshCustomers();
      await refreshWarehouses();
      await refreshStorageSlots();
      await refreshTireStorages();
      await refreshOrders();
      await refreshEmployees();
      await refreshOrderEmployees();
      await refreshArticles();
      await refreshArticlePrices();
      await refreshOrderArticles();
      await refreshVehicles();
      await refreshModulePermissions();
      setLoading(false);
    })();
  }, []);

  async function refreshCustomers() {
    const { data } = await supabase.from("customers").select("*").order("name");
    if (data) setCustomers(data as Customer[]);
  }
  async function refreshEmployees() {
    const { data } = await supabase.from("employees").select("*").order("name");
    if (data) setEmployees(data as Employee[]);
  }
  async function refreshWarehouses() {
    const { data } = await supabase.from("warehouses").select("*").order("name");
    if (data) setWarehouses(data as Warehouse[]);
  }
  async function refreshStorageSlots() {
    const { data } = await supabase.from("storage_slots").select("*").order("code");
    if (data) setStorageSlots(data as StorageSlot[]);
  }
  async function refreshTireStorages() {
    const { data } = await supabase.from("tire_storage").select("*").order("updated_at", { ascending: false });
    if (data) setTireStorages(data as TireStorage[]);
  }
  async function refreshOrders() {
    const { data } = await supabase.from("orders").select("*").order("order_date", { ascending: false });
    if (data) setOrders(data as Order[]);
  }
  async function refreshOrderEmployees() {
    const { data } = await supabase.from("order_employees").select("order_id, employee_id");
    if (data) {
      const map: Record<string, string[]> = {};
      (data as { order_id: string; employee_id: string }[]).forEach((r) => {
        (map[r.order_id] ||= []).push(r.employee_id);
      });
      setOrderEmployeesMap(map);
    }
  }
  // Ersetzt die komplette Mitarbeiter-Zuordnung eines Auftrags (löschen + neu einfügen ist bei
  // dieser kleinen Zeilenzahl pro Auftrag einfacher und robuster als ein Diff).
  async function setOrderEmployees(orderId: string, employeeIds: string[]) {
    await supabase.from("order_employees").delete().eq("order_id", orderId);
    const unique = Array.from(new Set(employeeIds.filter(Boolean)));
    if (unique.length) {
      await supabase.from("order_employees").insert(unique.map((employeeId) => ({ order_id: orderId, employee_id: employeeId })));
    }
    await refreshOrderEmployees();
  }
  // ---------------------------------------------------------------- Artikelstammdaten
  async function refreshArticles() {
    const { data } = await supabase.from("articles").select("*").order("short_name");
    if (data) setArticles(data as Article[]);
  }
  async function refreshArticlePrices() {
    const { data } = await supabase.from("article_prices").select("*").order("valid_from", { ascending: false });
    if (data) setArticlePrices(data as ArticlePrice[]);
  }
  async function refreshOrderArticles() {
    const { data } = await supabase.from("order_articles").select("*").order("created_at");
    if (data) setOrderArticlesState(data as OrderArticle[]);
  }
  async function addArticle(shortName: string, longName: string) {
    await supabase.from("articles").insert({ short_name: shortName, long_name: longName });
    await refreshArticles();
  }
  async function updateArticle(id: string, fields: { short_name: string; long_name: string; active: boolean }) {
    await supabase.from("articles").update(fields).eq("id", id);
    await refreshArticles();
  }
  // Neuer Preis für einen Artikel: schließt zunächst einen ggf. noch offenen (oder bis nach dem
  // neuen Startdatum reichenden) bestehenden Preiszeitraum automatisch einen Tag vor dem neuen
  // Startdatum, damit sich Preis-Zeiträume nie überlappen und die Historie lückenlos bleibt.
  async function addArticlePrice(articleId: string, netPrice: number, vatRate: number, validFrom: string) {
    const overlapping = articlePrices.filter(
      (p) => p.article_id === articleId && p.valid_from < validFrom && (!p.valid_to || p.valid_to >= validFrom)
    );
    for (const row of overlapping) {
      const d = new Date(validFrom + "T00:00:00");
      d.setDate(d.getDate() - 1);
      const closeDate = d.toISOString().slice(0, 10);
      await supabase.from("article_prices").update({ valid_to: closeDate }).eq("id", row.id);
    }
    await supabase.from("article_prices").insert({ article_id: articleId, net_price: netPrice, vat_rate: vatRate, valid_from: validFrom });
    await refreshArticlePrices();
  }
  async function addOrderArticle(orderId: string, articleId: string, quantity: number, discountPercent: number) {
    const price = currentArticlePrice(articlePrices.filter((p) => p.article_id === articleId));
    await supabase.from("order_articles").insert({
      order_id: orderId, article_id: articleId, quantity,
      net_price: price ? price.net_price : 0, vat_rate: price ? price.vat_rate : 19,
      discount_percent: discountPercent,
    });
    await refreshOrderArticles();
  }
  async function updateOrderArticleQty(id: string, quantity: number) {
    await supabase.from("order_articles").update({ quantity }).eq("id", id);
    await refreshOrderArticles();
  }
  async function updateOrderArticleDiscount(id: string, discountPercent: number) {
    await supabase.from("order_articles").update({ discount_percent: discountPercent }).eq("id", id);
    await refreshOrderArticles();
  }
  async function removeOrderArticle(id: string) {
    await supabase.from("order_articles").delete().eq("id", id);
    await refreshOrderArticles();
  }
  function orderArticlesFor(orderId: string): OrderArticle[] {
    return orderArticles.filter((oa) => oa.order_id === orderId);
  }
  async function refreshVehicles() {
    const { data } = await supabase.from("vehicles").select("*").order("created_at");
    if (data) setVehicles(data as Vehicle[]);
  }
  async function refreshModulePermissions() {
    const { data } = await supabase.from("module_permissions").select("*");
    if (data) {
      const map: Record<string, string[]> = {};
      (data as { module_key: string; edit_roles: string[] }[]).forEach((r) => { map[r.module_key] = r.edit_roles || []; });
      setModulePermissions(map);
    }
  }
  async function updateModulePermissions(moduleKey: string, roles: string[]) {
    await supabase.from("module_permissions").upsert({ module_key: moduleKey, edit_roles: roles });
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
    const { data } = await supabase
      .from("contact_history")
      .select("*")
      .eq("customer_id", customerId)
      .order("date", { ascending: false })
      .limit(8);
    setHistory((data as ContactHistoryEntry[]) || []);
  }

  function ordersFor(customerId: string): Order[] {
    return orders.filter((o) => o.customer_id === customerId);
  }

  // Erzwingt einen kompletten Reflow (Layout) UND Repaint des gesamten App-Layouts (Nav +
  // Seitenleiste + Karte) – nicht nur einzelner Kindelemente. Browser wie Chromium/Edge geraten
  // nach einer Größenänderung (Fenster verkleinert/vergrößert, DevTools geöffnet/geschlossen,
  // Wechsel zwischen Vollseiten-Modul und normalem Tab, Zurückkehren aus dem Hintergrund/bfcache)
  // manchmal in einen Zustand, in dem die GEZEICHNETEN Pixel nicht mehr zur tatsächlichen
  // Layout-Position passen: Ein Klick landet dann korrekt auf dem darunterliegenden, eigentlich
  // richtig positionierten Element, während optisch noch die alte (verschobene/überlappende)
  // Ansicht zu sehen ist ("Geisterbild") – genau das gemeldete Verhalten, bei dem die Karte über
  // die Seitenleiste geschoben wirkt, aber die Klicks trotzdem bei den darunterliegenden
  // Terminen ankommen. Ein kurzes Aus-/Wiedereinblenden des GESAMTEN #app-Wurzelelements (statt
  // nur von Karte oder Seitenleiste einzeln) zwingt den Browser, Layout und Pixel für die
  // komplette Ansicht neu zu berechnen und zu zeichnen.
  function forceFullReflow() {
    const el = appRef.current;
    if (el) {
      const prevDisplay = el.style.display;
      el.style.display = "none";
      void el.offsetHeight; // erzwingt den Reflow
      el.style.display = prevDisplay;
    }
    window.scrollTo(0, 0);
    setTimeout(() => mapRef.current?.invalidateSize(), 30);
  }

  // ---------------------------------------------------------------- Karte initialisieren
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    function tryInit() {
      const L = (window as any).L;
      if (!L || !mapDivRef.current) {
        if (!cancelled) setTimeout(tryInit, 60);
        return;
      }
      if (mapRef.current) return;
      const map = L.map(mapDivRef.current, { zoomControl: true }).setView([49.4521, 11.0767], 12);
      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      applyMapStyle(settings.map_style as MapStyleKey);
      addMapStyleControl(L, map);
      // Jede Größenänderung des Fensters (auch durch Öffnen/Schließen der Browser-DevTools, nicht
      // nur durch Ziehen am Fensterrand) sowie Rückkehr aus Hintergrund/bfcache lösen den vollen
      // Reflow/Repaint aus – siehe forceFullReflow() oben.
      window.addEventListener("resize", forceFullReflow);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) forceFullReflow(); });
      window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) forceFullReflow(); });
      window.addEventListener("focus", forceFullReflow);
      syncMarkers();
    }
    tryInit();
    return () => { cancelled = true; };
  }, [loading]);

  // Zusätzlich zum Resize-Listener oben: die 700px-Mobil-Schwelle separat abfangen (matchMedia
  // reagiert zuverlässiger auf das Über-/Unterschreiten der Schwelle als ein reiner
  // resize-Listener) und beim Wechsel zwischen Vollseiten-Modul und normalem Tab.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    mq.addEventListener("change", forceFullReflow);
    return () => mq.removeEventListener("change", forceFullReflow);
  }, []);

  useEffect(() => {
    forceFullReflow();
  }, [fullPageTabs]);

  function applyMapStyle(styleKey: MapStyleKey) {
    const L = (window as any).L;
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
  function makeIcon(color: "red" | "green") {
    const L = (window as any).L;
    const bg = color === "green" ? "#2f9e5c" : "#e0483f";
    return L.divIcon({
      className: "custom-pin",
      html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${bg};
              transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
      iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -22],
    });
  }

  function syncMarkers() {
    const L = (window as any).L;
    if (!L || !markerLayerRef.current) return;
    const { customers: custs, orders: ords, settings: s } = liveRef.current;
    const seen = new Set<string>();
    custs.forEach((cust) => {
      if (cust.active === false || cust.lat == null || cust.lng == null) return;
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
        <h3>${escapeHtml(cust.name)} <span class="badge ${color}">${color === "green" ? "kontaktiert" : "offen"}</span></h3>
        ${buildCallIconHtml(cust)}
      </div>
      <div class="pline">📍 ${escapeHtml(cust.address)}</div>
      ${phoneLines}
      ${cust.note ? `<div class="pline">📝 ${escapeHtml(cust.note)}</div>` : ""}
      <div class="pline small">Letzter Kontakt: ${cust.last_contact ? formatDate(cust.last_contact) : "–"}</div>
      ${nextOrd ? `<div class="pline small">📅 Nächster Termin: ${formatOrderDateTime(nextOrd)} – ${escapeHtml(nextOrd.title)}${nextOrd.description ? " (" + escapeHtml(nextOrd.description) + ")" : ""}</div>` : ""}
      <hr>
      <div class="field" style="margin-bottom:6px;">
        <label>Kontaktiert am</label>
        <input type="date" id="popupContactDate" value="${cust.last_contact || todayStr()}">
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="chkAppt">
        <label for="chkAppt">Termin dabei vereinbart</label>
      </div>
      <div id="apptFields">
        <div class="row" style="margin-bottom:4px;">
          <div class="field" style="margin-bottom:0;"><label>Termin-Datum</label><input type="date" id="popupApptDate" value="${todayStr()}"></div>
          <div class="field" style="margin-bottom:0;"><label>Uhrzeit (optional)</label><input type="time" id="popupApptTime"></div>
        </div>
        <div class="field" style="margin-bottom:0;"><label>Was ist zu tun?</label><textarea id="popupApptDesc"></textarea></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button id="btnMarkContacted" style="flex:1" class="btn-green">✔ Kontaktiert speichern</button>
        <button id="btnMarkOpen" style="flex:1" class="btn-secondary">Auf offen setzen</button>
      </div>
      <button id="btnEditCust" class="btn-secondary btn-block">✏️ Kundendaten &amp; Aufträge bearbeiten</button>
    `;
    return div;
  }

  function attachPopupHandlers(customerId: string, marker: any) {
    const chkAppt = document.getElementById("chkAppt") as HTMLInputElement | null;
    const apptFields = document.getElementById("apptFields");
    if (chkAppt && apptFields) {
      chkAppt.onchange = () => apptFields.classList.toggle("show", chkAppt.checked);
    }
    const bC = document.getElementById("btnMarkContacted");
    const bO = document.getElementById("btnMarkOpen");
    const bE = document.getElementById("btnEditCust");
    if (bC) bC.onclick = async () => {
      const contactDate = (document.getElementById("popupContactDate") as HTMLInputElement).value || todayStr();
      const apptDate = chkAppt?.checked ? (document.getElementById("popupApptDate") as HTMLInputElement).value : null;
      const apptTime = chkAppt?.checked ? (document.getElementById("popupApptTime") as HTMLInputElement).value : "";
      const apptDesc = chkAppt?.checked ? (document.getElementById("popupApptDesc") as HTMLInputElement).value : "";
      await markContacted(customerId, contactDate, apptDate, apptTime, apptDesc);
      marker.closePopup();
    };
    if (bO) bO.onclick = async () => { await markOpen(customerId); marker.closePopup(); };
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
  async function markContacted(id: string, contactDate: string, apptDate: string | null, apptTime: string, apptDesc: string) {
    const cust = customers.find((c) => c.id === id);
    if (!cust) return;
    await supabase.from("customers").update({ status: "kontaktiert", last_contact: contactDate }).eq("id", id);
    let note = "Telefonisch kontaktiert";
    if (apptDate) note += ` – Termin vereinbart am ${formatDate(apptDate)}${apptTime ? ", " + apptTime + " Uhr" : ""}`;
    await supabase.from("contact_history").insert({ customer_id: id, date: contactDate, note });
    if (apptDate) {
      await supabase.from("orders").insert({ customer_id: id, title: "Termin", description: apptDesc || null, status: "offen", order_date: apptDate, time: apptTime || null });
      await refreshOrders();
    }
    await refreshCustomers();
    if (selectedId === id) loadHistory(id);
  }
  async function markOpen(id: string) {
    await supabase.from("customers").update({ status: "offen" }).eq("id", id);
    await refreshCustomers();
  }
  async function setActive(id: string, active: boolean) {
    await supabase.from("customers").update({ active }).eq("id", id);
    await refreshCustomers();
  }
  async function deleteCustomerById(id: string) {
    await supabase.from("customers").delete().eq("id", id);
    await refreshCustomers();
    await refreshOrders();
    setSelectedId(null);
  }
  async function updateCustomerFields(id: string, fields: Partial<Customer>) {
    const cust = customers.find((c) => c.id === id);
    const addressChanged = !!fields.address && fields.address !== cust?.address;
    const patch: any = { ...fields };
    if (addressChanged) {
      patch.lat = null; patch.lng = null;
      await supabase.from("customers").update(patch).eq("id", id);
      try {
        const res = await geocodeAddress(fields.address!);
        if (res) await supabase.from("customers").update({ lat: res.lat, lng: res.lng }).eq("id", id);
      } catch {}
    } else {
      await supabase.from("customers").update(patch).eq("id", id);
    }
    await refreshCustomers();
  }
  async function addCustomer(fields: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    orderTitle: string; orderDescription: string; orderDate: string; orderTime: string; assignedEmployeeId: string;
  }) {
    let lat: number | null = null, lng: number | null = null;
    try {
      const res = await geocodeAddress(fields.address);
      if (res) { lat = res.lat; lng = res.lng; }
    } catch {}
    const { name, address, phone_mobile, phone_landline, note } = fields;
    const { data: created } = await supabase
      .from("customers")
      .insert({ name, address, phone_mobile, phone_landline, note, lat, lng, status: "offen", active: true })
      .select("id")
      .single();
    // Ruft ein Kunde selbst an und wird dabei neu angelegt, ist im gleichen Zug meist auch
    // schon klar, worum es geht – deshalb kann direkt ein passender Auftrag mit angelegt werden.
    if (created?.id && fields.orderTitle.trim()) {
      const { data: createdOrder } = await supabase.from("orders").insert({
        customer_id: created.id, title: fields.orderTitle.trim(), description: fields.orderDescription || null,
        status: "offen", order_date: fields.orderDate || todayStr(), time: fields.orderTime || null,
      }).select("id").single();
      if (createdOrder?.id && fields.assignedEmployeeId) await setOrderEmployees(createdOrder.id as string, [fields.assignedEmployeeId]);
      await refreshOrders();
    }
    await refreshCustomers();
    return lat != null;
  }
  // ---------------------------------------------------------------- Lager-Modul
  async function addWarehouse(fields: { name: string; address: string; note: string }): Promise<string | undefined> {
    const { data: created } = await supabase
      .from("warehouses")
      .insert({ name: fields.name, address: fields.address || null, note: fields.note || null })
      .select("id")
      .single();
    await refreshWarehouses();
    return created?.id as string | undefined;
  }
  async function updateWarehouse(id: string, fields: { name: string; address: string; note: string }) {
    await supabase.from("warehouses").update({ name: fields.name, address: fields.address || null, note: fields.note || null }).eq("id", id);
    await refreshWarehouses();
  }
  async function deleteWarehouse(id: string) {
    await supabase.from("warehouses").delete().eq("id", id);
    await refreshWarehouses();
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function addStorageSlot(warehouseId: string, code: string) {
    await supabase.from("storage_slots").insert({ warehouse_id: warehouseId, code });
    await refreshStorageSlots();
  }
  // Bulk-Anlage von Lagerplätzen nach einer Nummerierungslogik (Präfix + Start/Ende + Stellen),
  // z. B. Präfix "A", 1–20, 2-stellig → A-01 … A-20. Wird sowohl beim Anlegen eines neuen Lagers
  // als auch später zum Nachrüsten weiterer Plätze verwendet.
  async function addStorageSlotsBulk(warehouseId: string, codes: string[]) {
    if (codes.length === 0) return;
    await supabase.from("storage_slots").insert(codes.map((code) => ({ warehouse_id: warehouseId, code })));
    await refreshStorageSlots();
  }
  async function deleteStorageSlot(id: string) {
    await supabase.from("storage_slots").delete().eq("id", id);
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function assignTire(fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) {
    const patch = {
      storage_slot_id: fields.storageSlotId,
      customer_id: fields.customerId,
      dot_date: fields.dotDate || null,
      profiltiefe_mm: fields.profiltiefeMm ? parseFloat(fields.profiltiefeMm.replace(",", ".")) : null,
      note: fields.note || null,
      updated_at: new Date().toISOString(),
    };
    if (fields.id) {
      await supabase.from("tire_storage").update(patch).eq("id", fields.id);
    } else {
      await supabase.from("tire_storage").insert(patch);
    }
    await refreshTireStorages();
  }
  async function removeTireAssignment(id: string) {
    // Soft-Delete: Zuordnung wird nur als "entfernt" markiert, nicht gelöscht,
    // damit der Lagerplatz eine Historie behält (Migration 06).
    await supabase.from("tire_storage").update({ removed_at: new Date().toISOString() }).eq("id", id);
    await refreshTireStorages();
  }

  // ---------------------------------------------------------------- Aufträge-Modul (Termine inklusive)
  // Mitarbeiter-Zuordnung läuft komplett über `order_employees` (Migration 11) – ein Auftrag kann
  // mehreren Mitarbeitern zugeordnet sein (z. B. bei umfangreichen Aufträgen). `assignedEmployeeIds`
  // ist deshalb überall eine Liste, auch wenn sie in vielen Fällen nur ein Element hat.
  async function addOrder(fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    const { data: created } = await supabase.from("orders").insert({
      customer_id: fields.customerId, title: fields.title, description: fields.description || null,
      order_date: fields.orderDate, time: fields.time || null, status: fields.status,
    }).select("id").single();
    if (created?.id) await setOrderEmployees(created.id as string, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  async function updateOrder(id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    await supabase.from("orders").update({
      title: fields.title, description: fields.description || null, order_date: fields.orderDate,
      time: fields.time || null, status: fields.status,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  async function updateOrderStatus(id: string, status: OrderStatus) {
    await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    await refreshOrders();
  }
  async function deleteOrder(id: string) {
    await supabase.from("orders").delete().eq("id", id);
    await refreshOrders();
  }

  // ---------------------------------------------------------------- Mitarbeiter (Einsatzplanung)
  async function addEmployee(name: string) {
    await supabase.from("employees").insert({ name });
    await refreshEmployees();
  }
  async function deleteEmployee(id: string) {
    await supabase.from("employees").delete().eq("id", id);
    await refreshEmployees();
  }

  // ---------------------------------------------------------------- Fahrzeuge
  async function addVehicle(customerId: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
  }) {
    await supabase.from("vehicles").insert({
      customer_id: customerId,
      license_plate: fields.licensePlate || null,
      make_model: fields.makeModel || null,
      tire_size: fields.tireSize || null,
      tire_dot_date: fields.tireDotDate || null,
      tire_profile_mm: fields.tireProfileMm ? parseFloat(fields.tireProfileMm.replace(",", ".")) : null,
      stored_tire_storage_id: fields.storedTireStorageId || null,
      note: fields.note || null,
    });
    await refreshVehicles();
  }
  async function updateVehicle(id: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
  }) {
    await supabase.from("vehicles").update({
      license_plate: fields.licensePlate || null,
      make_model: fields.makeModel || null,
      tire_size: fields.tireSize || null,
      tire_dot_date: fields.tireDotDate || null,
      tire_profile_mm: fields.tireProfileMm ? parseFloat(fields.tireProfileMm.replace(",", ".")) : null,
      stored_tire_storage_id: fields.storedTireStorageId || null,
      note: fields.note || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    await refreshVehicles();
  }
  async function deleteVehicle(id: string) {
    await supabase.from("vehicles").delete().eq("id", id);
    await refreshVehicles();
  }

  async function saveSettingsPatch(patch: Partial<UserSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
    await supabase.from("user_settings").update(patch).eq("user_id", liveRef.current.settings.user_id);
  }
  saveSettingsRef.current = saveSettingsPatch;
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ---------------------------------------------------------------- Ableitungen für die Liste
  const activeCustomers = customers.filter((c) => c.active !== false);
  const listItems = activeCustomers
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => {
      if (filter === "all") return true;
      if (filter === "nogeo") return c.lat == null;
      const color = effectiveColor(c, settings.period_months);
      if (filter === "offen") return color === "red";
      if (filter === "ok") return color === "green";
      return true;
    })
    .filter((c) => !letterFilter || c.name.trim().charAt(0).toUpperCase() === letterFilter)
    .filter((c) => {
      if (!plzFilter.trim()) return true;
      const match = c.address.match(/\b\d{5}\b/);
      return !!match && match[0].startsWith(plzFilter.trim());
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const availableLetters = Array.from(
    new Set(activeCustomers.map((c) => c.name.trim().charAt(0).toUpperCase()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "de"));
  const statTotal = activeCustomers.length;
  const statOk = activeCustomers.filter((c) => effectiveColor(c, settings.period_months) === "green").length;
  const inactiveCustomers = customers.filter((c) => c.active === false).sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Termine-Tab: Auftrag = Termin (siehe Migration 07), hier einfach chronologisch alle
  // Aufträge mit ihrem Kunden – gleiche Datenbasis wie das Aufträge-Modul.
  const apptRows = customers
    .filter((c) => c.active !== false)
    .flatMap((c) => ordersFor(c.id).map((o) => ({ cust: c, order: o, past: isOrderPast(o) })))
    .filter((r) => !onlyUpcoming || !r.past)
    .sort((a, b) => orderDateTime(a.order).getTime() - orderDateTime(b.order).getTime());

  function openDetail(id: string) {
    setSelectedId(id);
    loadHistory(id);
    const cust = customers.find((c) => c.id === id);
    if (cust?.lat != null && mapRef.current) mapRef.current.setView([cust.lat, cust.lng], Math.max(mapRef.current.getZoom(), 15));
  }

  function toggleMobileMap() {
    const next = !mobileMapVisible;
    setMobileMapVisible(next);
    if (next) setTimeout(() => mapRef.current?.invalidateSize(), 200);
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

  // Öffnet das Leistungen/Artikel-Zuordnungs-Menü für einen Auftrag (Aufträge-Tab & Einsatzplanung).
  function openArtMenu(e: React.MouseEvent, orderId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const estHeight = 260;
    setArtMenuPos({ top: clampMenuTop(rect, estHeight), left: Math.min(rect.left, window.innerWidth - 380) });
    setArtMenuFor(orderId);
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
  const occupiedSlots = storageSlots.filter((s) => tireStorages.some((t) => t.storage_slot_id === s.id && !t.removed_at)).length;
  const openOrders = orders.filter((o) => o.status !== "erledigt").length;
  // Hauptnavigation: Dashboard/Kunden/Aufträge sind immer sichtbar. Alles andere ist auf dem
  // Desktop Teil der breiten Seitenleiste (wie in einem ERP-System), auf dem Handy dagegen
  // hinter "Weitere" versteckt, damit die schmale Leiste dort nicht überladen wirkt.
  const SECONDARY_TABS: TabKey[] = ["termine", "lager", "einsatzplanung", "add", "inactive", "admin", "settings"];
  const isMoreActive = SECONDARY_TABS.includes(tab);

  return (
    <div id="app" ref={appRef}>
      <nav id="iconNav">
        <div className="nav-brand" title="Viana PinPoints">
          <svg viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="21" x2="6" y2="3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6 3 L19 7.5 L6 12 Z" fill="#5b8dff" />
            <circle cx="6" cy="21" r="1.6" fill="#ffffff" />
          </svg>
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
        // key erzwingt bei jedem Wechsel zwischen Vollseiten-Modul (100% Breite) und normalem
        // Tab (380px + Karte) ein komplettes Neu-Erstellen dieses DOM-Knotens statt eines reinen
        // In-Place-Updates. Genau dieser Breitenwechsel war es, bei dem manche Browser
        // (v. a. Chromium/Edge) den Kindinhalt sichtbar "abgeschnitten" stehen ließen, selbst nach
        // erzwungenem Reflow (display:none/wieder-an) – ein frischer DOM-Knoten hat dieses
        // Problem nicht, weil nichts Altes wiederverwendet wird. React-State in den Eltern- und
        // Geschwister-Komponenten bleibt davon unberührt, nur dieser Teilbaum wird neu gebaut.
        key={fullPageTabs ? "sidebar-full" : "sidebar-normal"}
        className={(fullPageTabs ? "full-page " : "") + (mobileMapVisible ? "mobile-hidden" : "")}
      >
        <header>
          <div className="app-brand">
            <div className="app-brand-badge">
              <svg viewBox="0 0 24 24" fill="none">
                <line x1="6" y1="21" x2="6" y2="3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6 3 L19 7.5 L6 12 Z" fill="#fff" />
                <circle cx="6" cy="21" r="1.6" fill="#fff" />
              </svg>
            </div>
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
                    <div className="mc-sub">von {storageSlots.length} Lagerplätzen insgesamt</div>
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
              {listItems.map((c) => {
                const color = c.lat == null ? "gray" : effectiveColor(c, settings.period_months);
                const nextOrd = nextOrder(ordersFor(c.id));
                return (
                  <div key={c.id} className="cust-item" onClick={() => openDetail(c.id)}>
                    <div className={`dot ${color}`}></div>
                    <div className="info">
                      <div className="name">{c.name}</div>
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
            </div>
          </div>
        )}

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
                        <tr key={order.id} className={past ? "past" : ""} onClick={() => openDetail(cust.id)}>
                          <td className="date-cell">{formatOrderDateTime(order)}{past ? " (vergangen)" : ""}</td>
                          <td>{cust.name}<br /><span className="small">{cust.address}</span></td>
                          <td>{order.title}{order.description ? ` – ${order.description}` : ""}{empNames !== "–" ? <><br /><span className="small">👤 {empNames}</span></> : ""}</td>
                          <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                            {cust.address.trim() && (
                              <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => openNavMenu(e, cust)}>
                                🧭
                              </button>
                            )}
                            {getPhoneNumbers(cust).length > 0 && (
                              <button
                                className="call-icon-btn small"
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
          <AuftraegePanel
            customers={customers}
            orders={orders}
            employees={employees}
            orderEmployees={orderEmployees}
            onAdd={addOrder}
            onUpdateStatus={updateOrderStatus}
            onDelete={deleteOrder}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            onEditArticles={openArtMenu}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onNavigate={openNavMenu}
          />
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
          />
        )}

        {tab === "einsatzplanung" && canView("einsatzplanung") && (
          <EinsatzplanungPanel
            customers={customers}
            orders={orders}
            employees={employees}
            orderEmployees={orderEmployees}
            onEditEmployees={openEmpMenu}
            employeeNamesFor={employeeNamesFor}
            onEditArticles={openArtMenu}
            orderArticlesLabel={orderArticlesLabel}
            onOpenCustomer={openDetail}
            onUpdateStatus={updateOrderStatus}
            onDelete={deleteOrder}
          />
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
            onOpenAdmin={() => setTab("admin")}
          />
        )}

        {tab === "admin" && (
          <AdminPanel
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            employees={employees}
            onAddEmployee={addEmployee}
            onDeleteEmployee={deleteEmployee}
            modulePermissions={modulePermissions}
            onUpdateModulePermissions={updateModulePermissions}
            articles={articles}
            articlePrices={articlePrices}
            onAddArticle={addArticle}
            onUpdateArticle={updateArticle}
            onAddArticlePrice={addArticlePrice}
          />
        )}
      </div>

      <div id="map" ref={mapDivRef} className={fullPageTabs ? "force-hidden" : (mobileMapVisible ? "mobile-visible" : "")}></div>

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

      {artMenuFor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19999 }} onClick={() => setArtMenuFor(null)} />
          <div className="call-menu" style={{ top: artMenuPos.top, left: artMenuPos.left, minWidth: 340, padding: "8px 10px" }}>
            <ArticleAssignPanel
              orderId={artMenuFor}
              articles={articles}
              rows={orderArticlesFor(artMenuFor)}
              onAdd={addOrderArticle}
              onUpdateQty={updateOrderArticleQty}
              onUpdateDiscount={updateOrderArticleDiscount}
              onRemove={removeOrderArticle}
            />
          </div>
        </>
      )}

      {selectedId && (
        <DetailModal
          customer={customers.find((c) => c.id === selectedId)!}
          orders={ordersFor(selectedId)}
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
          vehicles={vehicles.filter((v) => v.customer_id === selectedId)}
          tireStorages={tireStorages.filter((t) => t.customer_id === selectedId)}
          storageSlots={storageSlots}
          warehouses={warehouses}
          onClose={() => setSelectedId(null)}
          onSaveFields={(fields) => updateCustomerFields(selectedId, fields)}
          onMarkContacted={(contactDate, apptDate, apptTime, apptDesc) => markContacted(selectedId, contactDate, apptDate, apptTime, apptDesc)}
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
    </div>
  );
}

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}

function daysSinceContact(lastContact: string | null): number | null {
  if (!lastContact) return null;
  const then = new Date(lastContact + "T00:00:00");
  const now = new Date(todayStr() + "T00:00:00");
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

function CustomerRowMeta({ customer, rowDisplay }: { customer: Customer; rowDisplay: "datum" | "status" | "tage" }) {
  if (customer.lat == null) return <div className="meta">Keine Kartenposition</div>;

  if (rowDisplay === "status") {
    return (
      <div className="meta">
        <span className={`row-pill ${customer.status === "kontaktiert" ? "green" : "red"}`}>
          {customer.status === "kontaktiert" ? "Kontaktiert" : "Offen"}
        </span>
      </div>
    );
  }
  if (rowDisplay === "tage") {
    const d = daysSinceContact(customer.last_contact);
    if (d == null) return <div className="meta">Noch nicht kontaktiert</div>;
    return <div className="meta">{d === 0 ? "Heute kontaktiert" : `Vor ${d} ${d === 1 ? "Tag" : "Tagen"} kontaktiert`}</div>;
  }
  return (
    <div className="meta">
      {customer.last_contact ? `Letzter Kontakt: ${formatDate(customer.last_contact)}` : "Noch nicht kontaktiert"}
    </div>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M6 19v-8M12 19V6M18 19v-5" strokeLinecap="round" />
    </svg>
  );
}
function IconKunden() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}
function IconTermine() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="5" width="16" height="15" rx="4" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  );
}
function IconModule() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}
function IconNeu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconInaktiv() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="8" />
      <path d="M8 8l8 8" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z" />
    </svg>
  );
}
function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function IconLager() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 9 12 3l9 6v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
    </svg>
  );
}
function IconAuftraege() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-3-2V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M14 5 7 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconMore() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}
function IconEinsatzplanung() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="4.5" width="18" height="16" rx="2" strokeLinejoin="round" />
      <path d="M3 9.5h18M8 3v3M16 3v3" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavItem({ active, onClick, icon, label, className }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={`icon-nav-item ${active ? "active" : ""} ${className || ""}`} onClick={onClick}>
      <span className="ic">{icon}</span><span>{label}</span>
    </div>
  );
}

function AddCustomerForm({ onAdd, employees }: {
  onAdd: (f: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    orderTitle: string; orderDescription: string; orderDate: string; orderTime: string; assignedEmployeeId: string;
  }) => Promise<boolean>;
  employees: Employee[];
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [landline, setLandline] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Ruft z. B. ein neuer Kunde direkt an, kann im gleichen Zug schon der passende
  // Auftrag angelegt werden – Titel leer lassen, wenn (noch) kein Auftrag ansteht.
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDesc, setOrderDesc] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [orderTime, setOrderTime] = useState("");
  const [empId, setEmpId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setStatus({ text: "Bitte Name und Adresse angeben.", ok: false });
      return;
    }
    setBusy(true);
    setStatus({ text: "Suche Adresse auf der Karte…", ok: true });
    const found = await onAdd({
      name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(), phone_landline: landline.trim(), note: note.trim(),
      orderTitle, orderDescription: orderDesc, orderDate, orderTime, assignedEmployeeId: empId,
    });
    setBusy(false);
    setStatus(found
      ? { text: orderTitle.trim() ? "✔ Kunde und Auftrag angelegt, Kunde auf Karte platziert." : "✔ Kunde hinzugefügt und auf Karte platziert.", ok: true }
      : { text: "Adresse nicht gefunden – Kunde wurde ohne Kartenposition angelegt.", ok: false });
    setName(""); setAddress(""); setMobile(""); setLandline(""); setNote("");
    setOrderTitle(""); setOrderDesc(""); setOrderDate(todayStr()); setOrderTime(""); setEmpId("");
  }

  return (
    <form className="tabpanel active" onSubmit={submit}>
      <div className="field"><label>Name des Kunden *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Müller GmbH" /></div>
      <div className="field"><label>Adresse * (Straße, PLZ Ort)</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="z. B. Fürther Str. 12, 90429 Nürnberg" /></div>
      <div className="field"><label>Mobil (optional)</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0151 …" /></div>
      <div className="field"><label>Festnetz (optional)</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="0911 …" /></div>
      <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Winterreifen 205/55 R16" /></div>

      <hr />
      <h4 style={{ margin: "0 0 2px" }}>Gleich einen Auftrag anlegen (optional)</h4>
      <div className="small" style={{ marginBottom: 6 }}>Z. B. wenn der Kunde gerade selbst anruft – Titel leer lassen, wenn noch kein Auftrag ansteht.</div>
      <div className="field"><label>Titel</label><input type="text" value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} placeholder="z. B. Reifenwechsel Winter" /></div>
      <div className="field"><label>Beschreibung (optional)</label><textarea value={orderDesc} onChange={(e) => setOrderDesc(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Datum</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div className="field"><label>Uhrzeit (optional)</label><input type="time" value={orderTime} onChange={(e) => setOrderTime(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Mitarbeiter (optional)</label>
        <select value={empId} onChange={(e) => setEmpId(e.target.value)}>
          <option value="">Kein Mitarbeiter</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <button className="btn-primary btn-block" type="submit" disabled={busy}>Kunde hinzufügen &amp; auf Karte platzieren</button>
      {status && <div className="small" style={{ color: status.ok ? "var(--green)" : "var(--red)" }}>{status.text}</div>}
    </form>
  );
}

function SettingsPanel({ settings, onChange, isAdmin, isSuperAdmin, userEmail, onLogout, onOpenAdmin }: {
  settings: UserSettings; onChange: (p: Partial<UserSettings>) => void; isAdmin: boolean; isSuperAdmin: boolean; userEmail: string; onLogout: () => void; onOpenAdmin: () => void;
}) {
  const [period, setPeriod] = useState(settings.period_months);
  return (
    <div className="tabpanel active">
      <div className="field">
        <label>Zeilenanzeige in der Kundenliste</label>
        <select value={settings.row_display} onChange={(e) => onChange({ row_display: e.target.value as UserSettings["row_display"] })}>
          <option value="datum">Datum des letzten Kontakts</option>
          <option value="status">Status-Pille (Offen/Kontaktiert)</option>
          <option value="tage">Tage seit letztem Kontakt</option>
        </select>
      </div>
      <hr />
      <div className="field">
        <label>Wiedervorlage-Zeitraum (Monate) – danach wird eine kontaktierte Flagge wieder rot</label>
        <input type="number" min={1} max={24} value={period} onChange={(e) => setPeriod(parseInt(e.target.value, 10) || 3)} />
      </div>
      <button className="btn-primary btn-block" onClick={() => onChange({ period_months: period })}>Speichern</button>
      <hr />
      <div className="small">Angemeldet als {userEmail}{isSuperAdmin ? " (Superadmin)" : isAdmin ? " (Admin)" : ""}</div>
      {isAdmin && <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onOpenAdmin}>🛡️ Nutzerverwaltung</button>}
      <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onLogout}>Abmelden</button>
    </div>
  );
}

// =====================================================================
// Admin-Modul: Nutzerverwaltung – als eigener Tab statt separater Seite,
// damit man wie bei Termine einfach das Fenster wechselt statt zu navigieren.
// =====================================================================
const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  techniker: "Techniker",
  user: "Nutzer",
};

function AdminPanel({
  isAdmin, isSuperAdmin, employees, onAddEmployee, onDeleteEmployee, modulePermissions, onUpdateModulePermissions,
  articles, articlePrices, onAddArticle, onUpdateArticle, onAddArticlePrice,
}: {
  isAdmin: boolean; isSuperAdmin: boolean; employees: Employee[];
  onAddEmployee: (name: string) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  modulePermissions: Record<string, string[]>;
  onUpdateModulePermissions: (moduleKey: string, roles: string[]) => Promise<void>;
  articles: Article[];
  articlePrices: ArticlePrice[];
  onAddArticle: (shortName: string, longName: string) => Promise<void>;
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean }) => Promise<void>;
  onAddArticlePrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("user");
  const [sending, setSending] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [adminTab, setAdminTab] = useState<"users" | "modules" | "artikel">("users");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setOwnUserId(user?.id || null);
      if (isSuperAdmin) await refreshProfiles();
      else setLoadingList(false);
    })();
  }, [isSuperAdmin]);

  async function refreshProfiles() {
    setLoadingList(true);
    const { data, error } = await supabase.from("profiles").select("*").order("email");
    if (!error && data) setProfiles(data as Profile[]);
    setLoadingList(false);
  }

  async function changeRole(profileId: string, newRole: Role) {
    setStatus(null);
    if (profileId === ownUserId && newRole !== "superadmin") {
      const ok = confirm("Du entziehst dir gerade selbst die Superadmin-Rolle. Fortfahren?");
      if (!ok) return;
    }
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    if (error) {
      setStatus({ type: "error", text: "Rolle konnte nicht geändert werden: " + error.message });
      return;
    }
    await refreshProfiles();
    setStatus({ type: "ok", text: "Rolle aktualisiert." });
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSending(true);
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setStatus({ type: "error", text: data.error || "Einladung fehlgeschlagen." });
      return;
    }
    setStatus({ type: "ok", text: `Einladung an ${email} wurde per E-Mail versendet.` });
    setEmail("");
    setInviteRole("user");
    if (isSuperAdmin) await refreshProfiles();
  }

  if (!isAdmin) {
    return (
      <div className="tabpanel active">
        <div className="empty">Diese Seite ist nur für Admin und Superadmin.</div>
      </div>
    );
  }

  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="module-header">
          <div className="mh-icon"><IconAdmin /></div>
          <div className="mh-text">
            <h2>Admin</h2>
            <p>Nutzerverwaltung und Modulverwaltung.</p>
          </div>
        </div>

        <div className="filterbar" style={{ marginBottom: 4 }}>
          <button type="button" className={`chip ${adminTab === "users" ? "active" : ""}`} onClick={() => setAdminTab("users")}>Nutzerverwaltung</button>
          {isSuperAdmin && (
            <button type="button" className={`chip ${adminTab === "modules" ? "active" : ""}`} onClick={() => setAdminTab("modules")}>Modulverwaltung</button>
          )}
          <button type="button" className={`chip ${adminTab === "artikel" ? "active" : ""}`} onClick={() => setAdminTab("artikel")}>Artikelstamm</button>
        </div>

        {adminTab === "modules" && isSuperAdmin ? (
          <PermissionMatrix modulePermissions={modulePermissions} onUpdateModulePermissions={onUpdateModulePermissions} />
        ) : adminTab === "artikel" ? (
          <ArticleAdminPanel
            articles={articles}
            articlePrices={articlePrices}
            onAddArticle={onAddArticle}
            onUpdateArticle={onUpdateArticle}
            onAddArticlePrice={onAddArticlePrice}
          />
        ) : (
        <>
        {status && (
          <div className={status.type === "ok" ? "login-info" : "login-error"}>{status.text}</div>
        )}

        <h4 style={{ margin: "4px 0 0" }}>Neuen Nutzer einladen</h4>
        <form onSubmit={sendInvite} style={{ maxWidth: 420 }}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>E-Mail-Adresse</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kollege@firma.de" required />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Rolle</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                <option value="user">Nutzer</option>
                <option value="techniker">Techniker</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="superadmin">Superadmin</option>}
              </select>
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={sending}>
            {sending ? "Sende Einladung…" : "Einladung senden"}
          </button>
        </form>

        {isSuperAdmin && (
          <>
            <hr />
            <h4 style={{ margin: 0 }}>Alle Nutzer</h4>
            {loadingList ? (
              <div className="small">Lädt…</div>
            ) : profiles.length === 0 ? (
              <div className="empty">Keine Nutzer gefunden.</div>
            ) : (
              <table className="appt-table" style={{ maxWidth: 560 }}>
                <thead><tr><th>E-Mail</th><th>Rolle</th></tr></thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td>{p.email || "–"}{p.id === ownUserId ? <span className="small"> (Du)</span> : ""}</td>
                      <td>
                        <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value as Role)} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                          <option value="user">{ROLE_LABEL.user}</option>
                          <option value="techniker">{ROLE_LABEL.techniker}</option>
                          <option value="admin">{ROLE_LABEL.admin}</option>
                          <option value="superadmin">{ROLE_LABEL.superadmin}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        <hr />
        <h4 style={{ margin: 0 }}>Mitarbeiter (Einsatzplanung)</h4>
        <div className="small" style={{ marginBottom: 4 }}>
          Für die Zuordnung von Aufträgen – muss kein eingeladener Account sein, auch Namen ohne
          eigenen Login können hier hinterlegt werden.
        </div>
        <div className="row" style={{ maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Name des Mitarbeiters"
            value={newEmployeeName}
            onChange={(e) => setNewEmployeeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newEmployeeName.trim()) { onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); } }}
          />
          <button
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
            onClick={() => { if (!newEmployeeName.trim()) return; onAddEmployee(newEmployeeName.trim()); setNewEmployeeName(""); }}
          >
            + Mitarbeiter
          </button>
        </div>
        {employees.length === 0 ? (
          <div className="empty">Noch keine Mitarbeiter angelegt.</div>
        ) : (
          <div className="filterbar">
            {employees.map((emp) => (
              <div key={emp.id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {emp.name}
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "1px 5px" }}
                  onClick={() => { if (confirm(`Mitarbeiter "${emp.name}" wirklich löschen? Zuordnungen auf Aufträgen werden entfernt.`)) onDeleteEmployee(emp.id); }}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}

        </>
        )}
      </div>
    </div>
  );
}

// Modulverwaltung: eine Matrix, oben die Rollen als Spalten, links die Module (mit eingerückten
// Modulbestandteilen als eigene Zeilen darunter), pro Zelle eine Checkbox. "locked"-Zeilen (z. B.
// Dashboard) sind für alle Rollen fest sichtbar und nicht abwählbar. Superadmin ist implizit immer
// erlaubt und deshalb keine eigene Spalte. Jede Zeile speichert für sich (Checkbox-Klick = sofort
// speichern), damit man nicht versehentlich halb ausgefüllte Formulare verliert.
function PermissionMatrix({ modulePermissions, onUpdateModulePermissions }: {
  modulePermissions: Record<string, string[]>;
  onUpdateModulePermissions: (moduleKey: string, roles: string[]) => Promise<void>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function toggle(item: PermItem, role: Role) {
    if (item.locked) return;
    const current = modulePermissions[item.key] ?? PERMISSION_DEFAULTS[item.key] ?? [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setSavingKey(item.key);
    await onUpdateModulePermissions(item.key, next);
    setSavingKey(null);
  }

  return (
    <div>
      <div className="small" style={{ marginBottom: 8 }}>
        Wer sieht welches Modul, und wer darf welche Aktion innerhalb eines Moduls ausführen?
        Eingerückte Zeilen sind Teilbereiche des Moduls darüber. Superadmin darf hier immer alles,
        unabhängig von dieser Tabelle, und wird deshalb nicht extra aufgeführt.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="appt-table" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Modul / Aktion</th>
              {PERMISSION_ROLES.map((role) => <th key={role} style={{ textAlign: "center" }}>{ROLE_LABEL[role]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map((item) => {
              const current = modulePermissions[item.key] ?? PERMISSION_DEFAULTS[item.key] ?? [];
              return (
                <tr key={item.key}>
                  <td style={item.indent ? { paddingLeft: 22, color: "var(--muted, #667)", fontSize: 12.5 } : { fontWeight: 700 }}>
                    {item.label}
                  </td>
                  {PERMISSION_ROLES.map((role) => (
                    <td key={role} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={item.locked ? true : current.includes(role)}
                        disabled={item.locked || savingKey === item.key}
                        onChange={() => toggle(item, role)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================================
// Artikelstamm (Admin-Bereich, nur Admin/Superadmin – Migration 12): Kurz-/Langbezeichnung je
// Artikel, dazu eine Preis-Historie mit "gültig von/bis" statt nur einem einzigen aktuellen
// Preis. Rabatte werden bewusst NICHT hier, sondern individuell bei der Zuordnung zu einem
// Auftrag vergeben (siehe ArticleAssignPanel).
// =====================================================================
function ArticleAdminPanel({ articles, articlePrices, onAddArticle, onUpdateArticle, onAddArticlePrice }: {
  articles: Article[];
  articlePrices: ArticlePrice[];
  onAddArticle: (shortName: string, longName: string) => Promise<void>;
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean }) => Promise<void>;
  onAddArticlePrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const [newShort, setNewShort] = useState("");
  const [newLong, setNewLong] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="small" style={{ marginBottom: 8 }}>
        Zentrales Artikelstammdatenbuch für Dienstleistungen/Artikel, die einem Auftrag
        zugeordnet werden können. Jeder Artikel hat eine Preis-Historie (Nettopreis + MwSt.,
        jeweils gültig von/bis) statt nur eines einzigen aktuellen Preises – ein neuer Preis
        schließt den vorherigen automatisch einen Tag davor. Rabatte werden individuell bei der
        Zuordnung zu einem Auftrag vergeben, nicht hier am Artikel.
      </div>

      <div className="row" style={{ maxWidth: 560, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kurzbezeichnung</label>
          <input type="text" value={newShort} onChange={(e) => setNewShort(e.target.value)} placeholder="z. B. Reifenwechsel mobil" />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}>
          <label>Langbezeichnung</label>
          <input type="text" value={newLong} onChange={(e) => setNewLong(e.target.value)} placeholder="z. B. Mobiler Reifenwechsel direkt beim Kunden vor Ort" />
        </div>
        <button
          className="btn-primary"
          style={{ flex: "0 0 auto" }}
          onClick={async () => {
            if (!newShort.trim() || !newLong.trim()) return;
            await onAddArticle(newShort.trim(), newLong.trim());
            setNewShort(""); setNewLong("");
          }}
        >
          + Artikel
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="empty">Noch keine Artikel angelegt.</div>
      ) : (
        <table className="appt-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Kurzbezeichnung</th><th>Langbezeichnung</th><th>Aktueller Preis</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>
            {articles.map((a) => {
              const prices = articlePrices.filter((p) => p.article_id === a.id);
              const current = currentArticlePrice(prices);
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td style={{ fontWeight: 700 }}>{a.short_name}</td>
                    <td>{a.long_name}</td>
                    <td>{current ? `${formatEUR(current.net_price)} netto (${current.vat_rate}% MwSt.)` : "– kein Preis hinterlegt –"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={a.active}
                        onChange={(e) => onUpdateArticle(a.id, { short_name: a.short_name, long_name: a.long_name, active: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                        {openId === a.id ? "Schließen" : "Preise & Bearbeiten"}
                      </button>
                    </td>
                  </tr>
                  {openId === a.id && (
                    <tr>
                      <td colSpan={5} style={{ background: "rgba(0,0,0,.02)" }}>
                        <ArticleDetailEditor article={a} prices={prices} onUpdateArticle={onUpdateArticle} onAddPrice={onAddArticlePrice} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ArticleDetailEditor({ article, prices, onUpdateArticle, onAddPrice }: {
  article: Article;
  prices: ArticlePrice[];
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean }) => Promise<void>;
  onAddPrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const [shortName, setShortName] = useState(article.short_name);
  const [longName, setLongName] = useState(article.long_name);
  const [netPrice, setNetPrice] = useState("");
  const [vatRate, setVatRate] = useState("19");
  const [validFrom, setValidFrom] = useState(todayStr());
  const sortedPrices = prices.slice().sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  return (
    <div style={{ padding: "6px 2px" }}>
      <div className="row">
        <div className="field" style={{ marginBottom: 0 }}><label>Kurzbezeichnung</label><input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}><label>Langbezeichnung</label><input type="text" value={longName} onChange={(e) => setLongName(e.target.value)} /></div>
        <button
          className="btn-secondary"
          style={{ flex: "0 0 auto" }}
          onClick={() => onUpdateArticle(article.id, { short_name: shortName.trim() || article.short_name, long_name: longName.trim() || article.long_name, active: article.active })}
        >
          Speichern
        </button>
      </div>

      <h4 style={{ margin: "8px 0 4px", fontSize: 13 }}>Preis-Historie</h4>
      {sortedPrices.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch kein Preis hinterlegt.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6, maxWidth: 480 }}>
          <thead><tr><th>Gültig von</th><th>Gültig bis</th><th>Nettopreis</th><th>MwSt.</th></tr></thead>
          <tbody>
            {sortedPrices.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.valid_from)}</td>
                <td>{p.valid_to ? formatDate(p.valid_to) : "bis auf Weiteres"}</td>
                <td>{formatEUR(p.net_price)}</td>
                <td>{p.vat_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ maxWidth: 480, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Nettopreis (€)</label>
          <input type="number" min={0} step="0.01" value={netPrice} onChange={(e) => setNetPrice(e.target.value)} placeholder="0,00" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>MwSt. %</label>
          <input type="number" min={0} max={100} step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Gültig ab</label>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          style={{ flex: "0 0 auto" }}
          onClick={async () => {
            const price = parseFloat(netPrice.replace(",", "."));
            const vat = parseFloat(vatRate.replace(",", "."));
            if (isNaN(price) || price < 0) return;
            await onAddPrice(article.id, price, isNaN(vat) ? 19 : vat, validFrom);
            setNetPrice("");
          }}
        >
          + Preis
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// Leistungen/Artikel-Zuordnung zu einem Auftrag: Liste bereits zugeordneter Positionen (Menge,
// Rabatt individuell je Position, Preis als Schnappschuss vom Zuordnungszeitpunkt) plus eine
// kleine Zeile zum Hinzufügen weiterer Artikel. Wird sowohl im Popover (Aufträge-Tab &
// Einsatzplanung) als auch direkt inline im Kunden-Detailfenster verwendet.
// =====================================================================
function ArticleAssignPanel({ orderId, articles, rows, onAdd, onUpdateQty, onUpdateDiscount, onRemove }: {
  orderId: string;
  articles: Article[];
  rows: OrderArticle[];
  onAdd: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateQty: (id: string, quantity: number) => Promise<void>;
  onUpdateDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const activeArticles = articles.filter((a) => a.active);
  const [articleId, setArticleId] = useState("");
  const [qty, setQty] = useState("1");
  const [discount, setDiscount] = useState("0");
  const totals = orderArticleTotals(rows);

  return (
    <div>
      <div className="small" style={{ fontWeight: 700, padding: "2px 0 4px" }}>Leistungen / Artikel</div>
      {rows.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch keine Leistungen zugeordnet.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6 }}>
          <thead><tr><th>Artikel</th><th>Menge</th><th>Rabatt %</th><th>Summe netto</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const art = articles.find((a) => a.id === r.article_id);
              const lineNet = r.quantity * r.net_price * (1 - (r.discount_percent || 0) / 100);
              return (
                <tr key={r.id}>
                  <td>{art ? art.short_name : "(gelöschter Artikel)"}<div className="small">{formatEUR(r.net_price)} / Stk.</div></td>
                  <td>
                    <input
                      type="number" min={0.01} step="0.01" value={r.quantity} style={{ width: 56 }}
                      onChange={(e) => onUpdateQty(r.id, parseFloat(e.target.value.replace(",", ".")) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min={0} max={100} step="1" value={r.discount_percent} style={{ width: 52 }}
                      onChange={(e) => onUpdateDiscount(r.id, parseFloat(e.target.value.replace(",", ".")) || 0)}
                    />
                  </td>
                  <td>{formatEUR(lineNet)}</td>
                  <td>
                    <button type="button" className="btn-secondary" style={{ padding: "2px 6px" }} onClick={() => onRemove(r.id)}><IconTrash /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          Netto {formatEUR(totals.net)} · MwSt. {formatEUR(totals.vat)} · <b>Brutto {formatEUR(totals.gross)}</b>
        </div>
      )}
      {activeArticles.length === 0 ? (
        <div className="small">Noch keine Artikel im Artikelstamm angelegt (Admin → Artikelstamm).</div>
      ) : (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Artikel</label>
            <select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">– wählen –</option>
              {activeArticles.map((a) => <option key={a.id} value={a.id}>{a.short_name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Menge</label>
            <input type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Rabatt %</label>
            <input type="number" min={0} max={100} step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
            onClick={() => {
              if (!articleId) return;
              onAdd(orderId, articleId, parseFloat(qty.replace(",", ".")) || 1, parseFloat(discount.replace(",", ".")) || 0);
              setArticleId(""); setQty("1"); setDiscount("0");
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function DetailModal(props: {
  customer: Customer; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>; history: ContactHistoryEntry[]; periodMonths: number;
  vehicles: Vehicle[]; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  articles: Article[]; orderArticles: OrderArticle[];
  onAddOrderArticle: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateOrderArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateOrderArticleDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemoveOrderArticle: (id: string) => Promise<void>;
  onClose: () => void;
  onSaveFields: (f: Partial<Customer>) => void;
  onMarkContacted: (contactDate: string, apptDate: string | null, apptTime: string, apptDesc: string) => void;
  onMarkOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onAddOrder: (fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onUpdateOrder: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onDeleteOrder: (id: string) => void;
  onAddVehicle: (fields: { licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string }) => void;
  onUpdateVehicle: (id: string, fields: { licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string }) => void;
  onDeleteVehicle: (id: string) => void;
  onCall: (cust: Customer) => void;
}) {
  const { customer: cust } = props;
  const [name, setName] = useState(cust.name);
  const [address, setAddress] = useState(cust.address);
  const [mobile, setMobile] = useState(cust.phone_mobile || "");
  const [landline, setLandline] = useState(cust.phone_landline || "");
  const [note, setNote] = useState(cust.note || "");
  const [contactDate, setContactDate] = useState(cust.last_contact || todayStr());
  const [wantAppt, setWantAppt] = useState(false);
  const [apptDate, setApptDate] = useState(todayStr());
  const [apptTime, setApptTime] = useState("");
  const [apptDesc, setApptDesc] = useState("");

  const color = effectiveColor(cust, props.periodMonths);
  const custOrders = props.orders.slice().sort((a, b) => a.order_date.localeCompare(b.order_date));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={props.onClose}>✕</button>
        <div className="header-row" style={{ paddingRight: 34 }}>
          <h2 style={{ flex: 1 }}>Kunde bearbeiten <span className={`badge ${color}`}>{color === "green" ? "kontaktiert" : "offen"}</span></h2>
          {getPhoneNumbers(cust).length > 0 && (
            <button className="call-icon-btn" onClick={() => props.onCall(cust)}>📞</button>
          )}
        </div>

        <h4>Kundendaten</h4>
        <div className="field"><label>Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Adresse</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Mobil</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div className="field"><label>Festnetz</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} /></div>
        </div>
        <div className="field"><label>Notiz</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary btn-block" onClick={() => props.onSaveFields({ name, address, phone_mobile: mobile, phone_landline: landline, note })}>
          💾 Kundendaten speichern
        </button>
        {cust.lat == null && <div className="small" style={{ color: "var(--red)", marginTop: 4 }}>Für diesen Kunden gibt es noch keine Kartenposition.</div>}

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

        <h4>Kontakt erfassen</h4>
        <div className="field" style={{ marginBottom: 6 }}>
          <label>Kontaktiert am</label>
          <input type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} />
        </div>
        <div className="checkbox-row">
          <input type="checkbox" checked={wantAppt} onChange={(e) => setWantAppt(e.target.checked)} />
          <label>Dabei einen Termin vereinbaren</label>
        </div>
        {wantAppt && (
          <div id="apptFields" className="show">
            <div className="row" style={{ marginBottom: 4 }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Termin-Datum</label><input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Uhrzeit (optional)</label><input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} /></div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Was ist zu tun?</label><textarea value={apptDesc} onChange={(e) => setApptDesc(e.target.value)} /></div>
          </div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn-green" onClick={() => props.onMarkContacted(contactDate, wantAppt ? apptDate : null, wantAppt ? apptTime : "", wantAppt ? apptDesc : "")}>
            ✔ Kontaktiert speichern
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
              onUpdate={props.onUpdateOrder}
              onDelete={props.onDeleteOrder}
              articles={props.articles}
              orderArticles={props.orderArticles.filter((oa) => oa.order_id === o.id)}
              onAddArticle={props.onAddOrderArticle}
              onUpdateArticleQty={props.onUpdateOrderArticleQty}
              onUpdateArticleDiscount={props.onUpdateOrderArticleDiscount}
              onRemoveArticle={props.onRemoveOrderArticle}
            />
          ))}
        </div>
        <AddOrderInline employees={props.employees} onAdd={props.onAddOrder} />

        <h4>Kontakt-Historie</h4>
        {props.history.length === 0 && <div className="small">Noch keine Kontakt-Historie</div>}
        {props.history.map((h) => (
          <div key={h.id} className="histentry">{formatDate(h.date)} – {h.note || "kontaktiert"}</div>
        ))}

        <hr />
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

// Mehrfachauswahl von Mitarbeitern als Chips (Kompaktversion des Rollen-Chip-Musters aus der
// alten Modul-Berechtigungen-UI) – wird an mehreren Stellen für Auftrags-Mitarbeiter gebraucht,
// weil ein Auftrag ab sofort mehreren Mitarbeitern zugeordnet werden kann.
function EmployeeCheckboxList({ employees, value, onChange }: {
  employees: Employee[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  if (employees.length === 0) return <div className="small">Noch keine Mitarbeiter angelegt.</div>;
  return (
    <div className="filterbar">
      {employees.map((emp) => (
        <button
          key={emp.id}
          type="button"
          className={`chip ${value.includes(emp.id) ? "active" : ""}`}
          onClick={() => onChange(value.includes(emp.id) ? value.filter((id) => id !== emp.id) : [...value, emp.id])}
        >
          {emp.name}
        </button>
      ))}
    </div>
  );
}

function CustomerOrderRow({
  order, employees, assignedEmployeeIds, onUpdate, onDelete,
  articles, orderArticles, onAddArticle, onUpdateArticleQty, onUpdateArticleDiscount, onRemoveArticle,
}: {
  order: Order; employees: Employee[]; assignedEmployeeIds: string[];
  onUpdate: (id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
  onDelete: (id: string) => void;
  articles: Article[];
  orderArticles: OrderArticle[];
  onAddArticle: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateArticleQty: (id: string, quantity: number) => Promise<void>;
  onUpdateArticleDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemoveArticle: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(order.title);
  const [date, setDate] = useState(order.order_date);
  const [time, setTime] = useState(order.time || "");
  const [desc, setDesc] = useState(order.description || "");
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [empIds, setEmpIds] = useState<string[]>(assignedEmployeeIds);
  const past = isOrderPast(order);
  const statusLabel: Record<OrderStatus, string> = { offen: "Offen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };
  const empNames = employees.filter((e) => assignedEmployeeIds.includes(e.id)).map((e) => e.name).join(", ");

  if (editing) {
    return (
      <div className="appt-item">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={{ marginBottom: 4 }} />
        <div className="row" style={{ marginBottom: 4 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Beschreibung" />
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} style={{ marginBottom: 4 }}>
          <option value="offen">Offen</option>
          <option value="in_arbeit">In Arbeit</option>
          <option value="erledigt">Erledigt</option>
        </select>
        <div className="small" style={{ marginBottom: 2 }}>Mitarbeiter</div>
        <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
        <div className="appt-actions">
          <button className="btn-primary" onClick={() => { onUpdate(order.id, { title, description: desc, orderDate: date, time, status, assignedEmployeeIds: empIds }); setEditing(false); }}>Speichern</button>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appt-item">
      <div><span className="appt-date">{formatOrderDateTime(order)}</span>{past && order.status !== "erledigt" ? " (vergangen)" : ""} <span className={`badge ${order.status === "erledigt" ? "green" : order.status === "in_arbeit" ? "orange" : "red"}`}>{statusLabel[order.status]}</span></div>
      <div>{order.title}{order.description ? ` – ${order.description}` : ""}</div>
      {empNames && <div className="small">👤 {empNames}</div>}
      <div className="appt-actions">
        <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Diesen Auftrag wirklich löschen?")) onDelete(order.id); }}>Löschen</button>
      </div>
      <hr style={{ margin: "6px 0" }} />
      <ArticleAssignPanel
        orderId={order.id}
        articles={articles}
        rows={orderArticles}
        onAdd={onAddArticle}
        onUpdateQty={onUpdateArticleQty}
        onUpdateDiscount={onUpdateArticleDiscount}
        onRemove={onRemoveArticle}
      />
    </div>
  );
}

function AddOrderInline({ employees, onAdd }: {
  employees: Employee[];
  onAdd: (fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Termin");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [desc, setDesc] = useState("");
  const [empIds, setEmpIds] = useState<string[]>([]);
  if (!open) {
    return <button className="btn-secondary btn-block" onClick={() => setOpen(true)}>+ Auftrag / Termin hinzufügen</button>;
  }
  return (
    <div className="appt-item">
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" style={{ marginBottom: 4 }} />
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Was ist zu tun?" />
      <div className="small" style={{ margin: "2px 0" }}>Mitarbeiter (optional, mehrere möglich)</div>
      <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
      <div className="appt-actions">
        <button
          className="btn-primary"
          onClick={() => {
            if (!title.trim()) return;
            onAdd({ title: title.trim(), description: desc, orderDate: date, time, status: "offen", assignedEmployeeIds: empIds });
            setOpen(false); setTitle("Termin"); setDate(todayStr()); setTime(""); setDesc(""); setEmpIds([]);
          }}
        >
          Speichern
        </button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </div>
  );
}

// =====================================================================
// Fahrzeuge je Kunde
// =====================================================================
function tireStorageLabel(t: TireStorage, storageSlots: StorageSlot[], warehouses: Warehouse[]): string {
  const slot = storageSlots.find((s) => s.id === t.storage_slot_id);
  const wh = slot ? warehouses.find((w) => w.id === slot.warehouse_id) : null;
  return `${wh ? wh.name : "?"} · ${slot ? slot.code : "?"}` + (t.dot_date ? ` (DOT ${t.dot_date})` : "");
}

type VehicleFieldValues = {
  licensePlate: string; makeModel: string; tireSize: string; tireDotDate: string; tireProfileMm: string; storedTireStorageId: string; note: string;
};

function VehicleFieldsForm({ values, onChangeField, tireStorages, storageSlots, warehouses }: {
  values: VehicleFieldValues; onChangeField: (key: keyof VehicleFieldValues, value: string) => void;
  tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
}) {
  return (
    <>
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="text" placeholder="Kennzeichen" value={values.licensePlate} onChange={(e) => onChangeField("licensePlate", e.target.value)} />
        <input type="text" placeholder="Marke / Modell" value={values.makeModel} onChange={(e) => onChangeField("makeModel", e.target.value)} />
      </div>
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="text" placeholder="Reifengröße z. B. 205/55 R16" value={values.tireSize} onChange={(e) => onChangeField("tireSize", e.target.value)} />
        <input type="text" placeholder="DOT-Datum" value={values.tireDotDate} onChange={(e) => onChangeField("tireDotDate", e.target.value)} />
        <input type="number" step="0.5" min="0" placeholder="Profil mm" value={values.tireProfileMm} onChange={(e) => onChangeField("tireProfileMm", e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label>Im Lager eingelagert (optional – nur wenn für diesen Kunden ein Satz eingelagert ist)</label>
        <select value={values.storedTireStorageId} onChange={(e) => onChangeField("storedTireStorageId", e.target.value)}>
          <option value="">Kein eingelagerter Satz</option>
          {tireStorages.map((t) => (
            <option key={t.id} value={t.id}>{tireStorageLabel(t, storageSlots, warehouses)}</option>
          ))}
        </select>
      </div>
      <textarea placeholder="Notiz (optional)" value={values.note} onChange={(e) => onChangeField("note", e.target.value)} />
    </>
  );
}

function VehicleRow({ vehicle, tireStorages, storageSlots, warehouses, onUpdate, onDelete }: {
  vehicle: Vehicle; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onUpdate: (id: string, fields: VehicleFieldValues) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<VehicleFieldValues>({
    licensePlate: vehicle.license_plate || "",
    makeModel: vehicle.make_model || "",
    tireSize: vehicle.tire_size || "",
    tireDotDate: vehicle.tire_dot_date || "",
    tireProfileMm: vehicle.tire_profile_mm != null ? String(vehicle.tire_profile_mm) : "",
    storedTireStorageId: vehicle.stored_tire_storage_id || "",
    note: vehicle.note || "",
  });
  const linked = vehicle.stored_tire_storage_id ? tireStorages.find((t) => t.id === vehicle.stored_tire_storage_id) : null;

  if (editing) {
    return (
      <div className="appt-item">
        <VehicleFieldsForm
          values={values}
          onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
          tireStorages={tireStorages}
          storageSlots={storageSlots}
          warehouses={warehouses}
        />
        <div className="appt-actions">
          <button className="btn-primary" onClick={() => { onUpdate(vehicle.id, values); setEditing(false); }}>Speichern</button>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appt-item">
      <div><span className="appt-date">{vehicle.license_plate || "Ohne Kennzeichen"}</span>{vehicle.make_model ? " – " + vehicle.make_model : ""}</div>
      <div className="small">
        {vehicle.tire_size ? `Reifen: ${vehicle.tire_size}` : "Keine Reifengröße hinterlegt"}
        {vehicle.tire_dot_date ? ` · DOT ${vehicle.tire_dot_date}` : ""}
        {vehicle.tire_profile_mm != null ? ` · Profil ${vehicle.tire_profile_mm} mm` : ""}
      </div>
      {linked && <div className="small">Im Lager: {tireStorageLabel(linked, storageSlots, warehouses)}</div>}
      {vehicle.note && <div className="small">{vehicle.note}</div>}
      <div className="appt-actions">
        <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Dieses Fahrzeug wirklich löschen?")) onDelete(vehicle.id); }}>Löschen</button>
      </div>
    </div>
  );
}

function AddVehicleInline({ tireStorages, storageSlots, warehouses, onAdd }: {
  tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onAdd: (fields: VehicleFieldValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const empty: VehicleFieldValues = { licensePlate: "", makeModel: "", tireSize: "", tireDotDate: "", tireProfileMm: "", storedTireStorageId: "", note: "" };
  const [values, setValues] = useState<VehicleFieldValues>(empty);

  if (!open) {
    return <button className="btn-secondary btn-block" onClick={() => setOpen(true)}>+ Fahrzeug hinzufügen</button>;
  }
  return (
    <div className="appt-item">
      <VehicleFieldsForm
        values={values}
        onChangeField={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        tireStorages={tireStorages}
        storageSlots={storageSlots}
        warehouses={warehouses}
      />
      <div className="appt-actions">
        <button className="btn-primary" onClick={() => { onAdd(values); setValues(empty); setOpen(false); }}>Fahrzeug speichern</button>
        <button className="btn-secondary" onClick={() => { setValues(empty); setOpen(false); }}>Abbrechen</button>
      </div>
    </div>
  );
}

// =====================================================================
// Wiederverwendbare Kundenauswahl (Suche + Liste), für Lager- und Aufträge-Modul
// =====================================================================
function CustomerPicker({ customers, value, onChange, placeholder }: {
  customers: Customer[]; value: string; onChange: (customerId: string) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) || null;
  const matches = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.address.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : customers.slice(0, 8);

  if (selected && !open) {
    return (
      <div className="field">
        <label>Kunde</label>
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--input-bg)", fontSize: 13 }}>
            {selected.name} <span className="small">– {selected.address}</span>
          </div>
          <button type="button" className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => { setOpen(true); setQuery(""); }}>Ändern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field" style={{ position: "relative" }}>
      <label>Kunde</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Kunde suchen…"}
      />
      {open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "var(--panel)" }}>
          {matches.length === 0 && <div className="small" style={{ padding: 8 }}>Keine Treffer</div>}
          {matches.map((c) => (
            <div
              key={c.id}
              className="cust-item"
              style={{ borderRadius: 0, boxShadow: "none", border: "none", borderBottom: "1px solid var(--border)" }}
              onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
            >
              <div className="info">
                <div className="name">{c.name}</div>
                <div className="addr">{c.address}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Lager-Modul
// =====================================================================
// Erzeugt Lagerplatz-Codes aus einer einfachen Nummerierungslogik, z. B.
// Präfix "A", 1–20, 2-stellig gepolstert → A-01 … A-20.
function buildSlotCodes(prefix: string, start: number, end: number, digits: number): string[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const codes: string[] = [];
  for (let n = start; n <= end && codes.length < 500; n++) {
    const num = String(n).padStart(Math.max(1, digits), "0");
    codes.push(prefix.trim() ? `${prefix.trim()}-${num}` : num);
  }
  return codes;
}

function SlotNumberingFields({ prefix, setPrefix, start, setStart, end, setEnd, digits, setDigits }: {
  prefix: string; setPrefix: (v: string) => void;
  start: string; setStart: (v: string) => void;
  end: string; setEnd: (v: string) => void;
  digits: string; setDigits: (v: string) => void;
}) {
  const preview = buildSlotCodes(prefix, parseInt(start, 10), parseInt(end, 10), parseInt(digits, 10) || 2);
  return (
    <>
      <div className="row" style={{ marginBottom: 4 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>Präfix (optional)</label><input type="text" placeholder="z. B. A" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Von Nr.</label><input type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Bis Nr.</label><input type="number" min={0} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Stellen</label><input type="number" min={1} max={4} value={digits} onChange={(e) => setDigits(e.target.value)} /></div>
      </div>
      {preview.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          {preview.length} Lagerplätze: {preview.slice(0, 4).join(", ")}{preview.length > 4 ? ` … ${preview[preview.length - 1]}` : ""}
        </div>
      )}
    </>
  );
}

function LagerPanel({ customers, warehouses, storageSlots, tireStorages, onAddWarehouse, onUpdateWarehouse, onDeleteWarehouse, onAddSlot, onAddSlotsBulk, onDeleteSlot, onAssignTire, onRemoveAssignment, canCreateWarehouse, canEditWarehouse, canDeleteWarehouse, canCreateSlot, canDeleteSlot, canAssignTire }: {
  customers: Customer[]; warehouses: Warehouse[]; storageSlots: StorageSlot[]; tireStorages: TireStorage[];
  onAddWarehouse: (fields: { name: string; address: string; note: string }) => Promise<string | undefined>;
  onUpdateWarehouse: (id: string, fields: { name: string; address: string; note: string }) => Promise<void>;
  onDeleteWarehouse: (id: string) => Promise<void>;
  onAddSlot: (warehouseId: string, code: string) => Promise<void>;
  onAddSlotsBulk: (warehouseId: string, codes: string[]) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onAssignTire: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) => Promise<void>;
  onRemoveAssignment: (id: string) => Promise<void>;
  // Granulare Modul-Berechtigungen (von einem Superadmin im Admin-Tab unter
  // "Modulverwaltung" konfigurierbar) – jede Struktur-Aktion einzeln steuerbar, damit z. B.
  // ein Techniker Reifen zuordnen, aber kein Lager anlegen/löschen darf.
  canCreateWarehouse: boolean;
  canEditWarehouse: boolean;
  canDeleteWarehouse: boolean;
  canCreateSlot: boolean;
  canDeleteSlot: boolean;
  canAssignTire: boolean;
}) {
  // Zwei Ebenen wie ein eigenständiges Modul: erst die Übersicht aller Lager
  // (mit Auslastung), dann – nach Klick auf ein Lager – dessen Lagerplätze.
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseAddress, setNewWarehouseAddress] = useState("");
  const [newWarehouseNote, setNewWarehouseNote] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newStart, setNewStart] = useState("1");
  const [newEnd, setNewEnd] = useState("10");
  const [newDigits, setNewDigits] = useState("2");
  const [newSlotCode, setNewSlotCode] = useState("");
  const [assignSlot, setAssignSlot] = useState<StorageSlot | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState(false);
  const [showAddMoreSlots, setShowAddMoreSlots] = useState(false);
  const [morePrefix, setMorePrefix] = useState("");
  const [moreStart, setMoreStart] = useState("1");
  const [moreEnd, setMoreEnd] = useState("10");
  const [moreDigits, setMoreDigits] = useState("2");

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || null;
  const slotsInWarehouse = storageSlots.filter((s) => s.warehouse_id === selectedWarehouseId);
  const [editName, setEditName] = useState(selectedWarehouse?.name || "");
  const [editAddress, setEditAddress] = useState(selectedWarehouse?.address || "");
  const [editNote, setEditNote] = useState(selectedWarehouse?.note || "");

  function currentAssignment(slotId: string): TireStorage | null {
    const matches = tireStorages.filter((t) => t.storage_slot_id === slotId && !t.removed_at);
    if (matches.length === 0) return null;
    return matches.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }
  function historyFor(slotId: string): TireStorage[] {
    return tireStorages
      .filter((t) => t.storage_slot_id === slotId && !!t.removed_at)
      .sort((a, b) => (b.removed_at || "").localeCompare(a.removed_at || ""));
  }
  function occupiedCount(warehouseId: string): number {
    const slotIds = storageSlots.filter((s) => s.warehouse_id === warehouseId).map((s) => s.id);
    return tireStorages.filter((t) => slotIds.includes(t.storage_slot_id) && !t.removed_at).length;
  }

  async function createWarehouse() {
    if (!newWarehouseName.trim()) return;
    const id = await onAddWarehouse({ name: newWarehouseName.trim(), address: newWarehouseAddress.trim(), note: newWarehouseNote.trim() });
    const codes = buildSlotCodes(newPrefix, parseInt(newStart, 10), parseInt(newEnd, 10), parseInt(newDigits, 10) || 2);
    if (id && codes.length > 0) await onAddSlotsBulk(id, codes);
    setNewWarehouseName(""); setNewWarehouseAddress(""); setNewWarehouseNote("");
    setNewPrefix(""); setNewStart("1"); setNewEnd("10"); setNewDigits("2");
    setShowAddWarehouse(false);
  }

  function startEditWarehouse() {
    if (!selectedWarehouse) return;
    setEditName(selectedWarehouse.name);
    setEditAddress(selectedWarehouse.address || "");
    setEditNote(selectedWarehouse.note || "");
    setEditingWarehouse(true);
  }

  async function saveEditWarehouse() {
    if (!selectedWarehouse || !editName.trim()) return;
    await onUpdateWarehouse(selectedWarehouse.id, { name: editName.trim(), address: editAddress.trim(), note: editNote.trim() });
    setEditingWarehouse(false);
  }

  async function addMoreSlots() {
    if (!selectedWarehouse) return;
    const codes = buildSlotCodes(morePrefix, parseInt(moreStart, 10), parseInt(moreEnd, 10), parseInt(moreDigits, 10) || 2);
    if (codes.length === 0) return;
    await onAddSlotsBulk(selectedWarehouse.id, codes);
    setMorePrefix(""); setMoreStart("1"); setMoreEnd("10"); setMoreDigits("2");
    setShowAddMoreSlots(false);
  }

  // ---------------- Ebene 1: alle Lager ----------------
  if (!selectedWarehouse) {
    return (
      <div className="tabpanel active">
        <div className="module-page">
          <div className="module-header">
            <div className="mh-icon"><IconLager /></div>
            <div className="mh-text">
              <h2>Lager</h2>
              <p>{warehouses.length} Lager · {storageSlots.length} Lagerplätze insgesamt</p>
            </div>
          </div>

          <div className="card-grid">
            {warehouses.map((w) => {
              const total = storageSlots.filter((s) => s.warehouse_id === w.id).length;
              const occ = occupiedCount(w.id);
              const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
              return (
                <button key={w.id} type="button" className="wh-card" onClick={() => setSelectedWarehouseId(w.id)}>
                  <div className="wh-name">{w.name}</div>
                  {w.address && <div className="wh-sub">📍 {w.address}</div>}
                  <div className="occ-bar"><div className="fill" style={{ width: `${pct}%` }}></div></div>
                  <div className="wh-stats">
                    <span>{occ} von {total} belegt</span>
                    <span>{pct}%</span>
                  </div>
                </button>
              );
            })}
            {canCreateWarehouse && !showAddWarehouse && (
              <button type="button" className="add-card" onClick={() => setShowAddWarehouse(true)}>+ Neues Lager</button>
            )}
            {canCreateWarehouse && showAddWarehouse && (
              <div className="wh-card" style={{ cursor: "default" }}>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="z. B. Nürnberg Hauptlager"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Lageradresse (optional)</label>
                  <input type="text" placeholder="Straße, PLZ Ort" value={newWarehouseAddress} onChange={(e) => setNewWarehouseAddress(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label>Notiz (optional)</label>
                  <input type="text" placeholder="z. B. Zugang nur über Hof" value={newWarehouseNote} onChange={(e) => setNewWarehouseNote(e.target.value)} />
                </div>
                <hr />
                <label>Lagerplätze gleich anlegen (optional)</label>
                <SlotNumberingFields
                  prefix={newPrefix} setPrefix={setNewPrefix}
                  start={newStart} setStart={setNewStart}
                  end={newEnd} setEnd={setNewEnd}
                  digits={newDigits} setDigits={setNewDigits}
                />
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={createWarehouse}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setShowAddWarehouse(false)}>Abbrechen</button>
                </div>
              </div>
            )}
          </div>

          {warehouses.length === 0 && !showAddWarehouse && (
            <div className="empty">
              {canCreateWarehouse
                ? "Noch kein Lager angelegt. Leg dein erstes Lager an, um Lagerplätze zu verwalten."
                : "Noch kein Lager angelegt. Deine Rolle darf kein Lager anlegen."}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Ebene 2: Lagerplätze eines Lagers ----------------
  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="breadcrumb" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setSelectedWarehouseId(null)}>Lager</button>
            <span className="sep">›</span>
            <span className="current">{selectedWarehouse.name}</span>
          </div>
          {(canEditWarehouse || canDeleteWarehouse) && (
            <div className="row" style={{ flex: "0 0 auto" }}>
              {canEditWarehouse && (
                <button className="btn-secondary" onClick={() => (editingWarehouse ? setEditingWarehouse(false) : startEditWarehouse())}>
                  {editingWarehouse ? "Bearbeiten abbrechen" : "Lager bearbeiten"}
                </button>
              )}
              {canDeleteWarehouse && (
                <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm(`Lager "${selectedWarehouse.name}" wirklich löschen? Alle Lagerplätze und Zuordnungen darin werden mitgelöscht.`)) { onDeleteWarehouse(selectedWarehouse.id); setSelectedWarehouseId(null); } }}>
                  Lager löschen
                </button>
              )}
            </div>
          )}
        </div>

        {editingWarehouse ? (
          <div className="wh-card" style={{ cursor: "default", maxWidth: 420 }}>
            <div className="field" style={{ marginBottom: 4 }}><label>Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 4 }}><label>Lageradresse</label><input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 4 }}><label>Notiz</label><input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} /></div>
            <div className="row">
              <button className="btn-primary" style={{ flex: 1 }} onClick={saveEditWarehouse}>Speichern</button>
              <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setEditingWarehouse(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="module-header">
            <div className="mh-icon"><IconLager /></div>
            <div className="mh-text">
              <h2>{selectedWarehouse.name}</h2>
              <p>{slotsInWarehouse.length} Lagerplätze{selectedWarehouse.address ? ` · 📍 ${selectedWarehouse.address}` : ""}</p>
              {selectedWarehouse.note && <p>{selectedWarehouse.note}</p>}
            </div>
          </div>
        )}

        {canCreateSlot && (
          <>
            <div className="row" style={{ maxWidth: 420 }}>
              <input type="text" placeholder="Neuer Lagerplatz (z. B. A-01)" value={newSlotCode} onChange={(e) => setNewSlotCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSlotCode.trim()) { onAddSlot(selectedWarehouse.id, newSlotCode.trim()); setNewSlotCode(""); } }} />
              <button
                className="btn-primary"
                style={{ flex: "0 0 auto" }}
                onClick={async () => { if (!newSlotCode.trim()) return; await onAddSlot(selectedWarehouse.id, newSlotCode.trim()); setNewSlotCode(""); }}
              >
                + Platz
              </button>
            </div>

            {!showAddMoreSlots ? (
              <button type="button" className="btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setShowAddMoreSlots(true)}>+ Mehrere Lagerplätze nach Nummerierung anlegen</button>
            ) : (
              <div className="wh-card" style={{ cursor: "default", maxWidth: 420 }}>
                <SlotNumberingFields
                  prefix={morePrefix} setPrefix={setMorePrefix}
                  start={moreStart} setStart={setMoreStart}
                  end={moreEnd} setEnd={setMoreEnd}
                  digits={moreDigits} setDigits={setMoreDigits}
                />
                <div className="row">
                  <button className="btn-primary" style={{ flex: 1 }} onClick={addMoreSlots}>Anlegen</button>
                  <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setShowAddMoreSlots(false)}>Abbrechen</button>
                </div>
              </div>
            )}
          </>
        )}

        {slotsInWarehouse.length === 0 && <div className="empty">Noch keine Lagerplätze in diesem Lager.</div>}

        <div className="card-grid">
          {slotsInWarehouse.map((slot) => {
            const assignment = currentAssignment(slot.id);
            const cust = assignment ? customers.find((c) => c.id === assignment.customer_id) : null;
            return (
              <button
                key={slot.id}
                type="button"
                className="slot-card"
                onClick={() => { if (canAssignTire) setAssignSlot(slot); }}
                style={canAssignTire ? undefined : { cursor: "default" }}
                title={canAssignTire ? undefined : "Deine Rolle darf keine Reifen zuordnen."}
              >
                <div className="sc-code"><span className={`dot ${assignment ? "green" : "gray"}`}></span>{slot.code}</div>
                {assignment && cust ? (
                  <>
                    <div className="sc-cust">{cust.name}</div>
                    <div className="sc-meta">
                      {assignment.dot_date ? `DOT ${assignment.dot_date}` : "DOT –"}
                      {assignment.profiltiefe_mm != null ? ` · Profil ${assignment.profiltiefe_mm} mm` : ""}
                    </div>
                  </>
                ) : (
                  <div className="sc-meta">Frei</div>
                )}
                {canDeleteSlot && (
                  <button
                    type="button"
                    className="btn-secondary sc-del"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Lagerplatz "${slot.code}" wirklich löschen?`)) onDeleteSlot(slot.id); }}
                  >
                    <IconTrash />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {assignSlot && (
        <TireAssignModal
          slot={assignSlot}
          customers={customers}
          assignment={currentAssignment(assignSlot.id)}
          history={historyFor(assignSlot.id)}
          onClose={() => setAssignSlot(null)}
          onAssign={onAssignTire}
          onRemove={onRemoveAssignment}
        />
      )}
    </div>
  );
}

function TireAssignModal({ slot, customers, assignment, history, onClose, onAssign, onRemove }: {
  slot: StorageSlot; customers: Customer[]; assignment: TireStorage | null; history: TireStorage[];
  onClose: () => void;
  onAssign: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(assignment?.customer_id || "");
  const [dotDate, setDotDate] = useState(assignment?.dot_date || "");
  const [profiltiefe, setProfiltiefe] = useState(assignment?.profiltiefe_mm != null ? String(assignment.profiltiefe_mm) : "");
  const [note, setNote] = useState(assignment?.note || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId) return;
    setSaving(true);
    await onAssign({ id: assignment?.id, storageSlotId: slot.id, customerId, dotDate, profiltiefeMm: profiltiefe, note });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Lagerplatz {slot.code}</h2>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
        <div className="row">
          <div className="field">
            <label>DOT-Datum</label>
            <input type="text" placeholder="z. B. 2523 (KW 25 / 2023)" value={dotDate} onChange={(e) => setDotDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Profiltiefe (mm)</label>
            <input type="number" step="0.5" min="0" placeholder="z. B. 6.5" value={profiltiefe} onChange={(e) => setProfiltiefe(e.target.value)} />
          </div>
        </div>
        <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary btn-block" disabled={!customerId || saving} onClick={save}>
          {assignment ? "Zuordnung speichern" : "Reifen einlagern"}
        </button>
        {assignment && (
          <button
            className="btn-secondary btn-block"
            style={{ marginTop: 8, color: "#b33" }}
            onClick={() => { if (confirm("Zuordnung wirklich entfernen? Der Lagerplatz wird wieder frei.")) { onRemove(assignment.id); onClose(); } }}
          >
            Zuordnung entfernen
          </button>
        )}

        {history.length > 0 && (
          <>
            <h4>Historie dieses Lagerplatzes</h4>
            <div style={{ maxHeight: 160, overflowY: "auto" }}>
              {history.map((h) => {
                const cust = customers.find((c) => c.id === h.customer_id);
                return (
                  <div key={h.id} className="hist-entry">
                    <span className="he-cust">{cust ? cust.name : "Unbekannter Kunde"}</span>
                    {h.dot_date ? ` · DOT ${h.dot_date}` : ""}
                    {h.profiltiefe_mm != null ? ` · Profil ${h.profiltiefe_mm} mm` : ""}
                    <br />
                    eingelagert {formatDate(h.created_at.slice(0, 10))} · entfernt {h.removed_at ? formatDate(h.removed_at.slice(0, 10)) : "–"}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Aufträge-Modul
// =====================================================================
function AuftraegePanel({ customers, orders, employees, orderEmployees, onAdd, onUpdateStatus, onDelete, onEditEmployees, employeeNamesFor, onEditArticles, orderArticlesLabel, onOpenCustomer, onNavigate }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<void>;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  employeeNamesFor: (orderId: string) => string;
  onEditArticles: (e: React.MouseEvent, orderId: string) => void;
  orderArticlesLabel: (orderId: string) => string;
  onOpenCustomer: (customerId: string) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [custFilter, setCustFilter] = useState("");
  const statusLabel: Record<OrderStatus, string> = { offen: "Offen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };

  const filteredOrders = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = customers.find((c) => c.id === o.customer_id);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    });

  return (
    <div className="tabpanel active">
      <div className="module-page" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        <div className="module-header">
          <div className="mh-icon"><IconAuftraege /></div>
          <div className="mh-text">
            <h2>Aufträge &amp; Termine</h2>
            <p>{orders.length} Aufträge insgesamt – ein Termin ist ein Auftrag mit Uhrzeit</p>
          </div>
        </div>

        <div className="header-row">
          <div className="filterbar" style={{ flex: 1 }}>
            <button type="button" className={`chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>Alle</button>
            <button type="button" className={`chip ${statusFilter === "offen" ? "active" : ""}`} onClick={() => setStatusFilter("offen")}>Offen</button>
            <button type="button" className={`chip ${statusFilter === "in_arbeit" ? "active" : ""}`} onClick={() => setStatusFilter("in_arbeit")}>In Arbeit</button>
            <button type="button" className={`chip ${statusFilter === "erledigt" ? "active" : ""}`} onClick={() => setStatusFilter("erledigt")}>Erledigt</button>
          </div>
          <button className="btn-primary" style={{ flex: "0 0 auto" }} onClick={() => setShowAdd(true)}>+ Auftrag</button>
        </div>
        {employees.length > 0 && (
          <div className="filterbar">
            <button type="button" className={`chip ${empFilter === "all" ? "active" : ""}`} onClick={() => setEmpFilter("all")}>Alle Mitarbeiter</button>
            {employees.map((emp) => (
              <button key={emp.id} type="button" className={`chip ${empFilter === emp.id ? "active" : ""}`} onClick={() => setEmpFilter(emp.id)}>{emp.name}</button>
            ))}
          </div>
        )}
        <input type="text" placeholder="Nach Kunde filtern…" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} style={{ maxWidth: 320 }} />

        <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
          {filteredOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead><tr><th>Termin</th><th>Kunde</th><th>Titel</th><th>Mitarbeiter</th><th>Leistungen</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id}>
                      <td className="date-cell">{formatOrderDateTime(o)}</td>
                      <td>
                        {cust ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onOpenCustomer(cust.id); }}
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                            >
                              {cust.name}
                            </button>
                            {cust.address.trim() && <><br /><span className="small">{cust.address}</span></>}
                          </>
                        ) : "–"}
                      </td>
                      <td>{o.title}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditEmployees(e, o.id)}>
                          {employeeNamesFor(o.id)}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditArticles(e, o.id)}>
                          {orderArticlesLabel(o.id)}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={o.status} onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                          <option value="offen">{statusLabel.offen}</option>
                          <option value="in_arbeit">{statusLabel.in_arbeit}</option>
                          <option value="erledigt">{statusLabel.erledigt}</option>
                        </select>
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                        {cust && cust.address.trim() && (
                          <button className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)" onClick={(e) => onNavigate(e, cust)}>
                            🧭
                          </button>
                        )}
                        <button type="button" className="btn-secondary" style={{ padding: "4px 8px" }} onClick={() => { if (confirm(`Auftrag "${o.title}" wirklich löschen?`)) onDelete(o.id); }}>
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && <OrderModal customers={customers} employees={employees} onClose={() => setShowAdd(false)} onAdd={onAdd} />}
    </div>
  );
}

function OrderModal({ customers, employees, onClose, onAdd }: {
  customers: Customer[]; employees: Employee[]; onClose: () => void;
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<OrderStatus>("offen");
  const [empIds, setEmpIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId || !title.trim()) return;
    setSaving(true);
    await onAdd({ customerId, title: title.trim(), description, orderDate, time, status, assignedEmployeeIds: empIds });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Neuer Auftrag</h2>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} />
        <div className="field"><label>Titel *</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Reifenwechsel Sommer/Winter" /></div>
        <div className="field"><label>Beschreibung (optional)</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="row">
          <div className="field"><label>Datum</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div className="field"><label>Uhrzeit (optional)</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            <option value="offen">Offen</option>
            <option value="in_arbeit">In Arbeit</option>
            <option value="erledigt">Erledigt</option>
          </select>
        </div>
        <div className="field">
          <label>Mitarbeiter (optional, mehrere möglich)</label>
          <EmployeeCheckboxList employees={employees} value={empIds} onChange={setEmpIds} />
        </div>
        <button className="btn-primary btn-block" disabled={!customerId || !title.trim() || saving} onClick={save}>Auftrag anlegen</button>
      </div>
    </div>
  );
}

// =====================================================================
// Einsatzplanung: Aufträge nach Tag und Mitarbeiter, für die Übersicht
// "wer macht welchen Auftrag wann".
// =====================================================================
// Kalender-Hilfsfunktionen (Montag als Wochenstart, ISO-Kalenderwochen).
const EMP_COLORS = ["#FF5A1F", "#1E9B6E", "#1E3A5F", "#8a5cf6", "#e0447a", "#c9a227", "#2f8fd1", "#a15c2e"];
function employeeColorFor(employees: Employee[], employeeId: string): string {
  const idx = employees.findIndex((e) => e.id === employeeId);
  return EMP_COLORS[(idx < 0 ? 0 : idx) % EMP_COLORS.length];
}
function startOfWeekMonday(d: Date): Date {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // Montag = 0 … Sonntag = 6
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
}
function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// =====================================================================
// Einsatzplanung: Monats-Kalender (Mo–So, mit Kalenderwochen), Mitarbeiter-Filter mit
// Einsatz-Punkten je Tag, Tages-Detail beim Anklicken eines Tages, und darunter eine volle,
// filter-/sortierbare Liste aller Aufträge mit Mitarbeiter-Zuordnung.
// =====================================================================
function EinsatzplanungPanel({ customers, orders, employees, orderEmployees, onEditEmployees, employeeNamesFor, onEditArticles, orderArticlesLabel, onOpenCustomer, onUpdateStatus, onDelete }: {
  customers: Customer[]; orders: Order[]; employees: Employee[]; orderEmployees: Record<string, string[]>;
  onEditEmployees: (e: React.MouseEvent, orderId: string) => void;
  employeeNamesFor: (orderId: string) => string;
  onEditArticles: (e: React.MouseEvent, orderId: string) => void;
  orderArticlesLabel: (orderId: string) => string;
  onOpenCustomer: (customerId: string) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr());
  const [empFilter, setEmpFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [custFilter, setCustFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "kunde" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const statusLabel: Record<OrderStatus, string> = { offen: "Offen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };
  const monthLabel = monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

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

  const dayOrders = selectedDay ? ordersOn(selectedDay) : [];
  const dayGroups: { employee: Employee | null; orders: Order[] }[] = [
    ...employees.map((emp) => ({ employee: emp, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).includes(emp.id)) })),
    { employee: null, orders: dayOrders.filter((o) => (orderEmployees[o.id] || []).length === 0) },
  ].filter((g) => g.orders.length > 0);

  // Volle Liste unter dem Kalender – unabhängig vom ausgewählten Tag, mit eigenen Filtern/Sortierung.
  const listOrders = orders
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => empFilter === "all" || (orderEmployees[o.id] || []).includes(empFilter))
    .filter((o) => {
      if (!custFilter.trim()) return true;
      const cust = customers.find((c) => c.id === o.customer_id);
      return !!cust && cust.name.toLowerCase().includes(custFilter.toLowerCase());
    })
    .slice()
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = orderDateTime(a).getTime() - orderDateTime(b).getTime();
      else if (sortBy === "kunde") {
        const an = customers.find((c) => c.id === a.customer_id)?.name || "";
        const bn = customers.find((c) => c.id === b.customer_id)?.name || "";
        cmp = an.localeCompare(bn);
      } else cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });

  function toggleSort(field: "date" | "kunde" | "status") {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("asc"); }
  }
  function sortArrow(field: "date" | "kunde" | "status") {
    return sortBy === field ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  }

  return (
    <div className="tabpanel active">
      <div className="module-page" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        <div className="module-header">
          <div className="mh-icon"><IconEinsatzplanung /></div>
          <div className="mh-text">
            <h2>Einsatzplanung</h2>
            <p>{monthLabel}</p>
          </div>
        </div>

        <div className="row" style={{ maxWidth: 420, alignItems: "center" }}>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 700 }}>{monthLabel}</div>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
          <button className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => { const t = new Date(); setMonthCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDay(todayStr()); }}>Heute</button>
        </div>

        {employees.length > 0 && (
          <div className="filterbar">
            <button type="button" className={`chip ${empFilter === "all" ? "active" : ""}`} onClick={() => setEmpFilter("all")}>Alle Mitarbeiter</button>
            {employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                className={`chip emp-chip ${empFilter === emp.id ? "active" : ""}`}
                onClick={() => setEmpFilter(emp.id)}
              >
                <span className="emp-dot" style={{ background: employeeColorFor(employees, emp.id) }} />
                {emp.name}
              </button>
            ))}
          </div>
        )}

        <div className="calendar-grid">
          <div className="calendar-row calendar-head">
            <div className="calendar-kw"></div>
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="calendar-daylabel">{d}</div>)}
          </div>
          {weeks.map((w) => (
            <div className="calendar-row" key={toDateStr(w.days[0])}>
              <div className="calendar-kw">KW {w.kw}</div>
              {w.days.map((d) => {
                const ds = toDateStr(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const empsToday = employeesOnDay(ds).filter((e) => empFilter === "all" || e.id === empFilter);
                const ordersToday = orders.filter((o) => o.order_date === ds);
                const hasUnassigned = ordersToday.some((o) => (orderEmployees[o.id] || []).length === 0);
                return (
                  <button
                    type="button"
                    key={ds}
                    className={`calendar-day ${inMonth ? "" : "outside"} ${ds === todayStr() ? "today" : ""} ${ds === selectedDay ? "selected" : ""}`}
                    onClick={() => setSelectedDay(ds)}
                  >
                    <span className="calendar-daynum">{d.getDate()}</span>
                    {ordersToday.length > 0 && (
                      <span className="calendar-dots">
                        {empsToday.map((e) => <span key={e.id} className="calendar-dot" style={{ background: employeeColorFor(employees, e.id) }} title={e.name} />)}
                        {hasUnassigned && empFilter === "all" && <span className="calendar-dot calendar-dot-unassigned" title="Nicht zugeordnet" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {selectedDay && (
          <>
            <h4 style={{ margin: "6px 0 0" }}>Aufträge am {formatDate(selectedDay)} <span className="small">({dayOrders.length})</span></h4>
            {dayOrders.length === 0 ? (
              <div className="empty">Keine Aufträge für diesen Tag.</div>
            ) : (
              dayGroups.map((g) => (
                <div key={g.employee?.id || "unassigned"}>
                  <h4 style={{ margin: "6px 0 2px", fontSize: 13 }}>{g.employee ? g.employee.name : "Nicht zugeordnet"} <span className="small">({g.orders.length})</span></h4>
                  <table className="appt-table">
                    <thead><tr><th>Uhrzeit</th><th>Kunde</th><th>Titel</th><th>Status</th></tr></thead>
                    <tbody>
                      {g.orders.map((o) => {
                        const cust = customers.find((c) => c.id === o.customer_id);
                        return (
                          <tr key={o.id}>
                            <td className="date-cell">{o.time || "–"}</td>
                            <td>
                              {cust ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenCustomer(cust.id)}
                                  style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                                >
                                  {cust.name}
                                </button>
                              ) : "–"}
                            </td>
                            <td>{o.title}</td>
                            <td><span className={`badge ${o.status === "erledigt" ? "green" : o.status === "in_arbeit" ? "orange" : "red"}`}>{statusLabel[o.status]}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </>
        )}

        <hr />
        <h4 style={{ margin: "4px 0 0" }}>Alle Aufträge</h4>
        <div className="filterbar">
          <button type="button" className={`chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>Alle</button>
          <button type="button" className={`chip ${statusFilter === "offen" ? "active" : ""}`} onClick={() => setStatusFilter("offen")}>Offen</button>
          <button type="button" className={`chip ${statusFilter === "in_arbeit" ? "active" : ""}`} onClick={() => setStatusFilter("in_arbeit")}>In Arbeit</button>
          <button type="button" className={`chip ${statusFilter === "erledigt" ? "active" : ""}`} onClick={() => setStatusFilter("erledigt")}>Erledigt</button>
        </div>
        <input type="text" placeholder="Nach Kunde filtern…" value={custFilter} onChange={(e) => setCustFilter(e.target.value)} style={{ maxWidth: 320 }} />

        <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
          {listOrders.length === 0 ? (
            <div className="empty">{orders.length === 0 ? "Noch keine Aufträge angelegt." : "Keine Aufträge für diesen Filter."}</div>
          ) : (
            <table className="appt-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>Termin{sortArrow("date")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("kunde")}>Kunde{sortArrow("kunde")}</th>
                  <th>Titel</th>
                  <th>Mitarbeiter</th>
                  <th>Leistungen</th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listOrders.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id}>
                      <td className="date-cell">{formatOrderDateTime(o)}</td>
                      <td>
                        {cust ? (
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(cust.id)}
                            style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--accent)", cursor: "pointer", fontWeight: 700, textAlign: "left" }}
                          >
                            {cust.name}
                          </button>
                        ) : "–"}
                      </td>
                      <td>{o.title}</td>
                      <td>
                        <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditEmployees(e, o.id)}>
                          {employeeNamesFor(o.id)}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={(e) => onEditArticles(e, o.id)}>
                          {orderArticlesLabel(o.id)}
                        </button>
                      </td>
                      <td>
                        <select value={o.status} onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                          <option value="offen">{statusLabel.offen}</option>
                          <option value="in_arbeit">{statusLabel.in_arbeit}</option>
                          <option value="erledigt">{statusLabel.erledigt}</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" className="btn-secondary" style={{ padding: "4px 8px" }} onClick={() => { if (confirm(`Auftrag "${o.title}" wirklich löschen?`)) onDelete(o.id); }}>
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

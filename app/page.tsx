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
  effectiveColor, telHref, getPhoneNumbers, navigationUrls,
  formatEUR, orderArticleTotals,
} from "@/lib/helpers";
import { MAP_STYLES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, type MapStyleKey } from "@/lib/mapStyles";
import { ORDER_STATUS_LABEL, PERMISSION_DEFAULTS } from "@/lib/constants";
import {
  IconDashboard, IconKunden, IconTermine, IconModule, IconNeu, IconInaktiv, IconSettings, IconAdmin,
  IconMap, IconLager, IconAuftraege, IconBack, IconMore, IconEinsatzplanung, IconTrash, IconArtikel,
  IconNavPin,
} from "@/components/icons";
import { NavItem } from "@/components/NavItem";
import { EmployeeCheckboxList } from "@/components/EmployeeCheckboxList";
import { CustomerRowMeta } from "@/components/kunden/CustomerRowMeta";
import { AddCustomerForm } from "@/components/kunden/AddCustomerForm";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ArticleAdminPanel } from "@/components/admin/artikel/ArticleAdminPanel";
import { ArticleAssignPanel } from "@/components/auftraege/ArticleAssignPanel";
import { DetailModal } from "@/components/kunden/DetailModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LagerPanel } from "@/components/lager/LagerPanel";
import { AuftraegePanel } from "@/components/auftraege/AuftraegePanel";
import { EinsatzplanungPanel } from "@/components/einsatzplanung/EinsatzplanungPanel";
import { fetchEmployees, insertEmployee, deleteEmployeeById, updateEmployeeProfileId } from "@/lib/api/employees";
import { fetchVehicles, insertVehicle, updateVehicleById, deleteVehicleById } from "@/lib/api/vehicles";
import {
  fetchWarehouses, fetchStorageSlots, fetchTireStorages,
  insertWarehouse, updateWarehouseById, deleteWarehouseById,
  insertStorageSlot, insertStorageSlotsBulk, deleteStorageSlotById,
  upsertTireAssignment, removeTireAssignmentById,
} from "@/lib/api/lager";
import {
  fetchArticles, fetchArticlePrices, fetchOrderArticles,
  insertArticle, updateArticleById, updateArticleNumberById, insertArticlePrice,
  insertOrderArticle, updateOrderArticleQtyById, updateOrderArticleDiscountById, deleteOrderArticleById,
} from "@/lib/api/articles";
import {
  fetchOrders, fetchOrderEmployeesMap, replaceOrderEmployees,
  insertOrder, updateOrderById, updateOrderStatusById, updateOrderTechnikerNotiz, deleteOrderById,
} from "@/lib/api/orders";
import {
  fetchCustomers, fetchContactHistory, markCustomerContacted, markCustomerOpen,
  setCustomerActive, deleteCustomerRow, updateCustomerFieldsById, insertCustomer,
} from "@/lib/api/customers";
import { fetchModulePermissions, upsertModulePermissions } from "@/lib/api/permissions";
import { fetchOwnRole, fetchOrCreateUserSettings, updateUserSettings } from "@/lib/api/session";

type TabKey = "dashboard" | "list" | "termine" | "lager" | "einsatzplanung" | "auftraege" | "inactive" | "add" | "settings" | "admin" | "artikel" | "more";

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
  const fullPageTabs = tab === "lager" || tab === "einsatzplanung" || tab === "admin" || tab === "auftraege" || tab === "artikel";
  // Techniker-Rolle (Phase 4): sieht per RLS ohnehin nur eigene Aufträge (Migration 13), die
  // Oberfläche blendet zusätzlich Anlegen/Löschen/Mitarbeiter- und Leistungen-Zuordnung aus –
  // siehe AuftraegePanel/EinsatzplanungPanel.
  const isTechniker = myRole === "techniker";

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

      const role = await fetchOwnRole(supabase, user.id);
      setIsAdmin(role === "admin" || role === "superadmin");
      setIsSuperAdmin(role === "superadmin");
      if (role) setMyRole(role);

      const settingsRow = await fetchOrCreateUserSettings(supabase, user.id);
      if (settingsRow) setSettings(settingsRow);

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
    setCustomers(await fetchCustomers(supabase));
  }
  async function refreshEmployees() {
    setEmployees(await fetchEmployees(supabase));
  }
  async function refreshWarehouses() {
    setWarehouses(await fetchWarehouses(supabase));
  }
  async function refreshStorageSlots() {
    setStorageSlots(await fetchStorageSlots(supabase));
  }
  async function refreshTireStorages() {
    setTireStorages(await fetchTireStorages(supabase));
  }
  async function refreshOrders() {
    setOrders(await fetchOrders(supabase));
  }
  async function refreshOrderEmployees() {
    setOrderEmployeesMap(await fetchOrderEmployeesMap(supabase));
  }
  // Ersetzt die komplette Mitarbeiter-Zuordnung eines Auftrags.
  async function setOrderEmployees(orderId: string, employeeIds: string[]) {
    await replaceOrderEmployees(supabase, orderId, employeeIds);
    await refreshOrderEmployees();
  }
  // ---------------------------------------------------------------- Artikelstammdaten
  async function refreshArticles() {
    setArticles(await fetchArticles(supabase));
  }
  async function refreshArticlePrices() {
    setArticlePrices(await fetchArticlePrices(supabase));
  }
  async function refreshOrderArticles() {
    setOrderArticlesState(await fetchOrderArticles(supabase));
  }
  async function addArticle(shortName: string, longName: string) {
    await insertArticle(supabase, shortName, longName);
    await refreshArticles();
  }
  async function updateArticle(id: string, fields: { short_name: string; long_name: string; active: boolean }) {
    await updateArticleById(supabase, id, fields);
    await refreshArticles();
  }
  async function updateArticleNumber(id: string, articleNumber: number) {
    const { error } = await updateArticleNumberById(supabase, id, articleNumber);
    if (error) alert(error);
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
    setVehicles(await fetchVehicles(supabase));
  }
  async function refreshModulePermissions() {
    setModulePermissions(await fetchModulePermissions(supabase));
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
    setHistory(await fetchContactHistory(supabase, customerId));
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
      const map = L.map(mapDivRef.current, { zoomControl: true }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
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
    let note = "Telefonisch kontaktiert";
    if (apptDate) note += ` – Termin vereinbart am ${formatDate(apptDate)}${apptTime ? ", " + apptTime + " Uhr" : ""}`;
    await markCustomerContacted(supabase, id, contactDate, note);
    if (apptDate) {
      await insertOrder(supabase, { customerId: id, title: "Termin", description: apptDesc || "", orderDate: apptDate, time: apptTime, status: "offen" });
      await refreshOrders();
    }
    await refreshCustomers();
    if (selectedId === id) loadHistory(id);
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
    const id = await insertOrder(supabase, fields);
    if (id) await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  async function updateOrder(id: string, fields: { title: string; description: string; orderDate: string; time: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    await updateOrderById(supabase, id, fields);
    await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  async function updateOrderStatus(id: string, status: OrderStatus) {
    await updateOrderStatusById(supabase, id, status);
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
  const SECONDARY_TABS: TabKey[] = ["termine", "lager", "einsatzplanung", "add", "inactive", "artikel", "admin", "settings"];
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
        {/* Marke nur auf dem Handy hier zeigen (dort ist .nav-brand in #iconNav per CSS
            ausgeblendet, weil #iconNav zur schmalen Bottom-Bar wird) – auf Desktop/Tablet
            steht die Flagge bereits oben in #iconNav, eine zweite Flagge hier wäre
            Redundanz (siehe docs/design-system.md). Steuerung über .app-brand-header in
            globals.css, kein zusätzlicher State nötig. */}
        <header className="app-brand-header">
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
                                <IconNavPin />
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
            isTechniker={isTechniker}
            onUpdateTechnikerNotiz={updateTechnikerNotiz}
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
            isTechniker={isTechniker}
            onUpdateTechnikerNotiz={updateTechnikerNotiz}
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

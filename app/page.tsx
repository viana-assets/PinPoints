"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type {
  Appointment, Customer, ContactHistoryEntry, UserSettings,
  Warehouse, StorageSlot, TireStorage, Order, OrderStatus, Vehicle,
} from "@/lib/types";
import {
  todayStr, formatDate, formatApptDateTime, isApptPast, nextAppointment,
  effectiveColor, telHref, getPhoneNumbers, geocodeAddress,
} from "@/lib/helpers";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";

type TabKey = "dashboard" | "list" | "termine" | "module" | "inactive" | "add" | "settings";

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tab, setTab] = useState<TabKey>("dashboard");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [storageSlots, setStorageSlots] = useState<StorageSlot[]>([]);
  const [tireStorages, setTireStorages] = useState<TireStorage[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [moduleView, setModuleView] = useState<"overview" | "lager" | "auftraege">("overview");
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "", period_months: 3, map_style: "strasse", row_display: "datum",
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "offen" | "ok" | "nogeo">("all");
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactHistoryEntry[]>([]);

  const [mobileMapVisible, setMobileMapVisible] = useState(false);
  const [callMenuFor, setCallMenuFor] = useState<Customer | null>(null);
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const markerIndexRef = useRef<Record<string, any>>({});
  const baseLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);

  // Aktuelle Daten/Handler als Ref, damit Leaflet-Popup-Callbacks (die außerhalb
  // des React-Renderzyklus leben) nie mit veralteten Closures arbeiten.
  const liveRef = useRef({ customers, appointments, settings });
  liveRef.current = { customers, appointments, settings };
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
      await refreshAppointments();
      await refreshWarehouses();
      await refreshStorageSlots();
      await refreshTireStorages();
      await refreshOrders();
      await refreshVehicles();
      setLoading(false);
    })();
  }, []);

  async function refreshCustomers() {
    const { data } = await supabase.from("customers").select("*").order("name");
    if (data) setCustomers(data as Customer[]);
  }
  async function refreshAppointments() {
    const { data } = await supabase.from("appointments").select("*");
    if (data) setAppointments(data as Appointment[]);
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
  async function refreshVehicles() {
    const { data } = await supabase.from("vehicles").select("*").order("created_at");
    if (data) setVehicles(data as Vehicle[]);
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

  function apptsFor(customerId: string): Appointment[] {
    return appointments.filter((a) => a.customer_id === customerId);
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
      window.addEventListener("resize", () => map.invalidateSize());
      syncMarkers();
    }
    tryInit();
    return () => { cancelled = true; };
  }, [loading]);

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
    const { customers: custs, appointments: appts, settings: s } = liveRef.current;
    const seen = new Set<string>();
    custs.forEach((cust) => {
      if (cust.active === false || cust.lat == null || cust.lng == null) return;
      seen.add(cust.id);
      const color = effectiveColor(cust, s.period_months);
      const nextAppt = nextAppointment(apptsForLive(cust.id, appts));
      let tooltip = `<b>${escapeHtml(cust.name)}</b><br>${escapeHtml(cust.address)}<br>` +
        (cust.status === "kontaktiert" && cust.last_contact ? `Letzter Kontakt: ${formatDate(cust.last_contact)}` : "Noch nicht kontaktiert");
      if (nextAppt) tooltip += `<br>📅 Termin: ${formatApptDateTime(nextAppt)}${nextAppt.description ? " – " + escapeHtml(nextAppt.description) : ""}`;

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
  function apptsForLive(customerId: string, appts: Appointment[]) {
    return appts.filter((a) => a.customer_id === customerId);
  }
  useEffect(() => { syncMarkers(); }, [customers, appointments, settings.period_months]);

  // ---------------------------------------------------------------- Popup-Inhalt (imperativ, wie im Original)
  function buildPopupEl(customerId: string): HTMLElement {
    const { customers: custs, appointments: appts, settings: s } = liveRef.current;
    const cust = custs.find((c) => c.id === customerId);
    const div = document.createElement("div");
    if (!cust) { div.textContent = "Kunde nicht gefunden"; return div; }
    const color = effectiveColor(cust, s.period_months);
    const nextAppt = nextAppointment(apptsForLive(cust.id, appts));
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
      ${nextAppt ? `<div class="pline small">📅 Nächster Termin: ${formatApptDateTime(nextAppt)}${nextAppt.description ? " – " + escapeHtml(nextAppt.description) : ""}</div>` : ""}
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
      <button id="btnEditCust" class="btn-secondary btn-block">✏️ Kundendaten &amp; Termine bearbeiten</button>
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
        setCallMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 190) });
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
      await supabase.from("appointments").insert({ customer_id: id, date: apptDate, time: apptTime || null, description: apptDesc || null });
    }
    await refreshCustomers();
    await refreshAppointments();
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
    await refreshAppointments();
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
  async function addCustomer(fields: { name: string; address: string; phone_mobile: string; phone_landline: string; note: string }) {
    let lat: number | null = null, lng: number | null = null;
    try {
      const res = await geocodeAddress(fields.address);
      if (res) { lat = res.lat; lng = res.lng; }
    } catch {}
    await supabase.from("customers").insert({ ...fields, lat, lng, status: "offen", active: true });
    await refreshCustomers();
    return lat != null;
  }
  async function addAppointment(customerId: string, date: string, description: string, time: string) {
    await supabase.from("appointments").insert({ customer_id: customerId, date, description: description || null, time: time || null });
    await refreshAppointments();
  }
  async function updateAppointment(apptId: string, date: string, description: string, time: string) {
    await supabase.from("appointments").update({ date, description: description || null, time: time || null }).eq("id", apptId);
    await refreshAppointments();
  }
  async function deleteAppointment(apptId: string) {
    await supabase.from("appointments").delete().eq("id", apptId);
    await refreshAppointments();
  }
  // ---------------------------------------------------------------- Lager-Modul
  async function addWarehouse(name: string) {
    await supabase.from("warehouses").insert({ name });
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
    await supabase.from("tire_storage").delete().eq("id", id);
    await refreshTireStorages();
  }

  // ---------------------------------------------------------------- Aufträge-Modul
  async function addOrder(fields: { customerId: string; title: string; description: string; orderDate: string; status: OrderStatus }) {
    await supabase.from("orders").insert({
      customer_id: fields.customerId, title: fields.title, description: fields.description || null,
      order_date: fields.orderDate, status: fields.status,
    });
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
      if (filter === "offen") return effectiveColor(c, settings.period_months) === "red";
      if (filter === "ok") return effectiveColor(c, settings.period_months) === "green";
      if (filter === "nogeo") return c.lat == null;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const statTotal = activeCustomers.length;
  const statOk = activeCustomers.filter((c) => effectiveColor(c, settings.period_months) === "green").length;
  const inactiveCustomers = customers.filter((c) => c.active === false).sort((a, b) => a.name.localeCompare(b.name, "de"));

  const apptRows = customers
    .filter((c) => c.active !== false)
    .flatMap((c) => apptsFor(c.id).map((a) => ({ cust: c, appt: a, past: isApptPast(a) })))
    .filter((r) => !onlyUpcoming || !r.past)
    .sort((a, b) => new Date(a.appt.date + "T" + (a.appt.time || "23:59")).getTime() - new Date(b.appt.date + "T" + (b.appt.time || "23:59")).getTime());

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

  if (loading) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Lädt…</div>;
  }

  const upcomingApptCount = apptRows.filter((r) => !r.past).length;
  const occupiedSlots = storageSlots.filter((s) => tireStorages.some((t) => t.storage_slot_id === s.id)).length;
  const openOrders = orders.filter((o) => o.status !== "erledigt").length;

  return (
    <div id="app">
      <nav id="iconNav">
        <div className="nav-brand" title="Viana PinPoints">
          <svg viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="21" x2="6" y2="3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6 3 L19 7.5 L6 12 Z" fill="#5b8dff" />
            <circle cx="6" cy="21" r="1.6" fill="#ffffff" />
          </svg>
        </div>
        <NavItem active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<IconDashboard />} label="Dashboard" />
        <NavItem active={tab === "list"} onClick={() => setTab("list")} icon={<IconKunden />} label="Kunden" />
        <NavItem active={tab === "termine"} onClick={() => setTab("termine")} icon={<IconTermine />} label="Termine" />
        <NavItem active={tab === "module"} onClick={() => setTab("module")} icon={<IconModule />} label="Module" />
        <NavItem active={tab === "add"} onClick={() => setTab("add")} icon={<IconNeu />} label="Neu" />
        <NavItem active={tab === "inactive"} onClick={() => setTab("inactive")} icon={<IconInaktiv />} label="Inaktiv" />
        <NavItem active={tab === "settings"} onClick={() => setTab("settings")} icon={<IconSettings />} label="Settings" className="settings-item" />
      </nav>

      <div id="sidebar" className={mobileMapVisible ? "mobile-hidden" : ""}>
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
              <div className="module-card" style={{ cursor: "pointer" }} onClick={() => setTab("termine")}>
                <div className="mc-icon"><IconTermine /></div>
                <div className="mc-text">
                  <div className="mc-title">Anstehende Termine</div>
                  <div className="mc-sub">Nächste Reifenwechsel-Termine im Blick behalten</div>
                </div>
                <div className="mc-tag">{upcomingApptCount}</div>
              </div>
              <div className="module-card" style={{ cursor: "pointer" }} onClick={() => { setTab("module"); setModuleView("lager"); }}>
                <div className="mc-icon"><IconLager /></div>
                <div className="mc-text">
                  <div className="mc-title">Belegte Lagerplätze</div>
                  <div className="mc-sub">von {storageSlots.length} Lagerplätzen insgesamt</div>
                </div>
                <div className="mc-tag">{occupiedSlots}</div>
              </div>
              <div className="module-card" style={{ cursor: "pointer" }} onClick={() => { setTab("module"); setModuleView("auftraege"); }}>
                <div className="mc-icon"><IconAuftraege /></div>
                <div className="mc-text">
                  <div className="mc-title">Offene Aufträge</div>
                  <div className="mc-sub">von {orders.length} Aufträgen insgesamt</div>
                </div>
                <div className="mc-tag">{openOrders}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "list" && (
          <div className="tabpanel active">
            <input id="search" type="text" placeholder="Kunde oder Adresse suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="filterbar">
              {(["all", "offen", "ok", "nogeo"] as const).map((f) => (
                <div key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f === "all" ? "Alle" : f === "offen" ? "🔴 Offen" : f === "ok" ? "🟢 Kontaktiert" : "Ohne Karte"}
                </div>
              ))}
            </div>
            <div id="customerList">
              {listItems.length === 0 && <div className="empty">Keine Kunden gefunden.</div>}
              {listItems.map((c) => {
                const color = c.lat == null ? "gray" : effectiveColor(c, settings.period_months);
                const nextAppt = nextAppointment(apptsFor(c.id));
                return (
                  <div key={c.id} className="cust-item" onClick={() => openDetail(c.id)}>
                    <div className={`dot ${color}`}></div>
                    <div className="info">
                      <div className="name">{c.name}</div>
                      <div className="addr">{c.address}</div>
                      {nextAppt && (
                        <div className="meta">📅 Termin: {formatDate(nextAppt.date)}</div>
                      )}
                      {!nextAppt && <CustomerRowMeta customer={c} rowDisplay={settings.row_display} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "termine" && (
          <div className="tabpanel active">
            <div className="checkbox-row" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} />
              <label>Nur anstehende Termine zeigen</label>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {apptRows.length === 0 ? (
                <div className="empty">Keine Termine gefunden.</div>
              ) : (
                <table className="appt-table">
                  <thead><tr><th>Termin</th><th>Kunde</th><th>Was ist zu tun?</th><th></th></tr></thead>
                  <tbody>
                    {apptRows.map(({ cust, appt, past }) => (
                      <tr key={appt.id} className={past ? "past" : ""} onClick={() => openDetail(cust.id)}>
                        <td className="date-cell">{formatApptDateTime(appt)}{past ? " (vergangen)" : ""}</td>
                        <td>{cust.name}<br /><span className="small">{cust.address}</span></td>
                        <td>{appt.description || "–"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {getPhoneNumbers(cust).length > 0 && (
                            <button
                              className="call-icon-btn small"
                              onClick={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setCallMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 190) });
                                setCallMenuFor(cust);
                              }}
                            >📞</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "module" && moduleView === "overview" && (
          <div className="tabpanel active">
            <div className="module-cards">
              <div className="module-card" onClick={() => setModuleView("lager")} style={{ cursor: "pointer" }}>
                <div className="mc-icon"><IconLager /></div>
                <div className="mc-text">
                  <div className="mc-title">Lager</div>
                  <div className="mc-sub">Lager &amp; Lagerplätze verwalten, Reifen mit DOT-Datum und Profiltiefe zuordnen</div>
                </div>
                <div className="mc-tag">{storageSlots.length} Plätze</div>
              </div>
              <div className="module-card" onClick={() => setModuleView("auftraege")} style={{ cursor: "pointer" }}>
                <div className="mc-icon"><IconAuftraege /></div>
                <div className="mc-text">
                  <div className="mc-title">Aufträge</div>
                  <div className="mc-sub">Aufträge je Kunde anlegen und verwalten</div>
                </div>
                <div className="mc-tag">{orders.length} Aufträge</div>
              </div>
            </div>
          </div>
        )}

        {tab === "module" && moduleView === "lager" && (
          <LagerPanel
            customers={customers}
            warehouses={warehouses}
            storageSlots={storageSlots}
            tireStorages={tireStorages}
            onBack={() => setModuleView("overview")}
            onAddWarehouse={addWarehouse}
            onDeleteWarehouse={deleteWarehouse}
            onAddSlot={addStorageSlot}
            onDeleteSlot={deleteStorageSlot}
            onAssignTire={assignTire}
            onRemoveAssignment={removeTireAssignment}
          />
        )}

        {tab === "module" && moduleView === "auftraege" && (
          <AuftraegePanel
            customers={customers}
            orders={orders}
            onBack={() => setModuleView("overview")}
            onAdd={addOrder}
            onUpdateStatus={updateOrderStatus}
            onDelete={deleteOrder}
          />
        )}

        {tab === "inactive" && (
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

        {tab === "add" && <AddCustomerForm onAdd={addCustomer} />}

        {tab === "settings" && (
          <SettingsPanel
            settings={settings}
            onChange={saveSettingsPatch}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            userEmail={userEmail}
            onLogout={handleLogout}
          />
        )}
      </div>

      <div id="map" ref={mapDivRef} className={mobileMapVisible ? "mobile-visible" : ""}></div>

      <button id="mapToggleBtn" type="button" onClick={toggleMobileMap} title={mobileMapVisible ? "Liste anzeigen" : "Karte anzeigen"}>
        {mobileMapVisible ? <IconKunden /> : <IconMap />}
      </button>

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

      {selectedId && (
        <DetailModal
          customer={customers.find((c) => c.id === selectedId)!}
          appointments={apptsFor(selectedId)}
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
          onAddAppointment={(date, desc, time) => addAppointment(selectedId, date, desc, time)}
          onUpdateAppointment={updateAppointment}
          onDeleteAppointment={deleteAppointment}
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

function AddCustomerForm({ onAdd }: { onAdd: (f: { name: string; address: string; phone_mobile: string; phone_landline: string; note: string }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [landline, setLandline] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setStatus({ text: "Bitte Name und Adresse angeben.", ok: false });
      return;
    }
    setBusy(true);
    setStatus({ text: "Suche Adresse auf der Karte…", ok: true });
    const found = await onAdd({ name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(), phone_landline: landline.trim(), note: note.trim() });
    setBusy(false);
    setStatus(found
      ? { text: "✔ Kunde hinzugefügt und auf Karte platziert.", ok: true }
      : { text: "Adresse nicht gefunden – Kunde wurde ohne Kartenposition angelegt.", ok: false });
    setName(""); setAddress(""); setMobile(""); setLandline(""); setNote("");
  }

  return (
    <form className="tabpanel active" onSubmit={submit}>
      <div className="field"><label>Name des Kunden *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Müller GmbH" /></div>
      <div className="field"><label>Adresse * (Straße, PLZ Ort)</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="z. B. Fürther Str. 12, 90429 Nürnberg" /></div>
      <div className="field"><label>Mobil (optional)</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0151 …" /></div>
      <div className="field"><label>Festnetz (optional)</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="0911 …" /></div>
      <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Winterreifen 205/55 R16" /></div>
      <button className="btn-primary btn-block" type="submit" disabled={busy}>Kunde hinzufügen &amp; auf Karte platzieren</button>
      {status && <div className="small" style={{ color: status.ok ? "var(--green)" : "var(--red)" }}>{status.text}</div>}
    </form>
  );
}

function SettingsPanel({ settings, onChange, isAdmin, isSuperAdmin, userEmail, onLogout }: {
  settings: UserSettings; onChange: (p: Partial<UserSettings>) => void; isAdmin: boolean; isSuperAdmin: boolean; userEmail: string; onLogout: () => void;
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
      {isAdmin && <a className="btn-secondary btn-block" href="/admin/invite" style={{ marginTop: 8, display: "block", textAlign: "center", textDecoration: "none" }}>👤 Nutzer einladen</a>}
      {isSuperAdmin && <a className="btn-secondary btn-block" href="/admin/users" style={{ marginTop: 8, display: "block", textAlign: "center", textDecoration: "none" }}>🛡️ Nutzerverwaltung</a>}
      <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onLogout}>Abmelden</button>
    </div>
  );
}

function DetailModal(props: {
  customer: Customer; appointments: Appointment[]; history: ContactHistoryEntry[]; periodMonths: number;
  vehicles: Vehicle[]; tireStorages: TireStorage[]; storageSlots: StorageSlot[]; warehouses: Warehouse[];
  onClose: () => void;
  onSaveFields: (f: Partial<Customer>) => void;
  onMarkContacted: (contactDate: string, apptDate: string | null, apptTime: string, apptDesc: string) => void;
  onMarkOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onAddAppointment: (date: string, desc: string, time: string) => void;
  onUpdateAppointment: (apptId: string, date: string, desc: string, time: string) => void;
  onDeleteAppointment: (apptId: string) => void;
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
  const appts = props.appointments.slice().sort((a, b) => a.date.localeCompare(b.date));

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

        <h4>Termine</h4>
        <div>
          {appts.length === 0 && <div className="small">Keine Termine hinterlegt.</div>}
          {appts.map((a) => (
            <AppointmentRow key={a.id} appt={a} onUpdate={props.onUpdateAppointment} onDelete={props.onDeleteAppointment} />
          ))}
        </div>
        <AddAppointmentInline onAdd={props.onAddAppointment} />

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

function AppointmentRow({ appt, onUpdate, onDelete }: {
  appt: Appointment; onUpdate: (id: string, date: string, desc: string, time: string) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(appt.date);
  const [time, setTime] = useState(appt.time || "");
  const [desc, setDesc] = useState(appt.description || "");
  const past = isApptPast(appt);

  if (editing) {
    return (
      <div className="appt-item">
        <div className="row" style={{ marginBottom: 4 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="appt-actions">
          <button className="btn-primary" onClick={() => { onUpdate(appt.id, date, desc, time); setEditing(false); }}>Speichern</button>
          <button className="btn-secondary" onClick={() => setEditing(false)}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appt-item">
      <div><span className="appt-date">{formatApptDateTime(appt)}</span>{past ? " (vergangen)" : ""}</div>
      <div>{appt.description || "Kein Beschreibungstext"}</div>
      <div className="appt-actions">
        <button className="btn-secondary" onClick={() => setEditing(true)}>Bearbeiten</button>
        <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm("Diesen Termin wirklich löschen?")) onDelete(appt.id); }}>Löschen</button>
      </div>
    </div>
  );
}

function AddAppointmentInline({ onAdd }: { onAdd: (date: string, desc: string, time: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [desc, setDesc] = useState("");
  if (!open) {
    return <button className="btn-secondary btn-block" onClick={() => setOpen(true)}>+ Termin ohne Kontaktvermerk hinzufügen</button>;
  }
  return (
    <div className="appt-item">
      <div className="row" style={{ marginBottom: 4 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Was ist zu tun?" />
      <div className="appt-actions">
        <button className="btn-primary" onClick={() => { onAdd(date, desc, time); setOpen(false); setDate(todayStr()); setTime(""); setDesc(""); }}>Termin speichern</button>
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
function LagerPanel({ customers, warehouses, storageSlots, tireStorages, onBack, onAddWarehouse, onDeleteWarehouse, onAddSlot, onDeleteSlot, onAssignTire, onRemoveAssignment }: {
  customers: Customer[]; warehouses: Warehouse[]; storageSlots: StorageSlot[]; tireStorages: TireStorage[];
  onBack: () => void;
  onAddWarehouse: (name: string) => Promise<void>;
  onDeleteWarehouse: (id: string) => Promise<void>;
  onAddSlot: (warehouseId: string, code: string) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onAssignTire: (fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string }) => Promise<void>;
  onRemoveAssignment: (id: string) => Promise<void>;
}) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(warehouses[0]?.id || null);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newSlotCode, setNewSlotCode] = useState("");
  const [assignSlot, setAssignSlot] = useState<StorageSlot | null>(null);

  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) setSelectedWarehouseId(warehouses[0].id);
  }, [warehouses, selectedWarehouseId]);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || null;
  const slotsInWarehouse = storageSlots.filter((s) => s.warehouse_id === selectedWarehouseId);

  function currentAssignment(slotId: string): TireStorage | null {
    const matches = tireStorages.filter((t) => t.storage_slot_id === slotId);
    if (matches.length === 0) return null;
    return matches.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  }

  return (
    <div className="tabpanel active">
      <button className="btn-secondary" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }} onClick={onBack}>
        <IconBack /> Module
      </button>
      <h4 style={{ margin: "4px 0 0" }}>Lager</h4>

      <div className="filterbar">
        {warehouses.map((w) => (
          <div key={w.id} className={`chip ${selectedWarehouseId === w.id ? "active" : ""}`} onClick={() => setSelectedWarehouseId(w.id)}>
            {w.name}
          </div>
        ))}
      </div>
      <div className="row">
        <input type="text" placeholder="Neues Lager (z. B. Nürnberg Hauptlager)" value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} />
        <button
          className="btn-primary"
          style={{ flex: "0 0 auto" }}
          onClick={async () => { if (!newWarehouseName.trim()) return; await onAddWarehouse(newWarehouseName.trim()); setNewWarehouseName(""); }}
        >
          + Lager
        </button>
      </div>

      {!selectedWarehouse && <div className="empty">Noch kein Lager angelegt.</div>}

      {selectedWarehouse && (
        <>
          <hr />
          <div className="header-row">
            <h4 style={{ margin: 0, flex: 1 }}>Lagerplätze in „{selectedWarehouse.name}"</h4>
            <button className="btn-secondary" style={{ color: "#b33" }} onClick={() => { if (confirm(`Lager "${selectedWarehouse.name}" wirklich löschen? Alle Lagerplätze und Zuordnungen darin werden mitgelöscht.`)) onDeleteWarehouse(selectedWarehouse.id); }}>
              Lager löschen
            </button>
          </div>
          <div className="row">
            <input type="text" placeholder="Neuer Lagerplatz (z. B. A-01)" value={newSlotCode} onChange={(e) => setNewSlotCode(e.target.value)} />
            <button
              className="btn-primary"
              style={{ flex: "0 0 auto" }}
              onClick={async () => { if (!newSlotCode.trim()) return; await onAddSlot(selectedWarehouse.id, newSlotCode.trim()); setNewSlotCode(""); }}
            >
              + Platz
            </button>
          </div>

          <div id="customerList">
            {slotsInWarehouse.length === 0 && <div className="empty">Noch keine Lagerplätze in diesem Lager.</div>}
            {slotsInWarehouse.map((slot) => {
              const assignment = currentAssignment(slot.id);
              const cust = assignment ? customers.find((c) => c.id === assignment.customer_id) : null;
              return (
                <div key={slot.id} className="cust-item" onClick={() => setAssignSlot(slot)}>
                  <div className={`dot ${assignment ? "green" : "gray"}`}></div>
                  <div className="info">
                    <div className="name">{slot.code}</div>
                    {assignment && cust ? (
                      <>
                        <div className="addr">{cust.name}</div>
                        <div className="meta">
                          {assignment.dot_date ? `DOT ${assignment.dot_date}` : "DOT –"}
                          {assignment.profiltiefe_mm != null ? ` · Profil ${assignment.profiltiefe_mm} mm` : ""}
                        </div>
                      </>
                    ) : (
                      <div className="addr">Frei</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: "0 0 auto", padding: "4px 8px" }}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Lagerplatz "${slot.code}" wirklich löschen?`)) onDeleteSlot(slot.id); }}
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {assignSlot && (
        <TireAssignModal
          slot={assignSlot}
          customers={customers}
          assignment={currentAssignment(assignSlot.id)}
          onClose={() => setAssignSlot(null)}
          onAssign={onAssignTire}
          onRemove={onRemoveAssignment}
        />
      )}
    </div>
  );
}

function TireAssignModal({ slot, customers, assignment, onClose, onAssign, onRemove }: {
  slot: StorageSlot; customers: Customer[]; assignment: TireStorage | null;
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
      </div>
    </div>
  );
}

// =====================================================================
// Aufträge-Modul
// =====================================================================
function AuftraegePanel({ customers, orders, onBack, onAdd, onUpdateStatus, onDelete }: {
  customers: Customer[]; orders: Order[];
  onBack: () => void;
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; status: OrderStatus }) => Promise<void>;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const statusLabel: Record<OrderStatus, string> = { offen: "Offen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };

  return (
    <div className="tabpanel active">
      <button className="btn-secondary" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }} onClick={onBack}>
        <IconBack /> Module
      </button>
      <div className="header-row">
        <h4 style={{ margin: 0, flex: 1 }}>Aufträge</h4>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Auftrag</button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {orders.length === 0 ? (
          <div className="empty">Noch keine Aufträge angelegt.</div>
        ) : (
          <table className="appt-table">
            <thead><tr><th>Datum</th><th>Kunde</th><th>Titel</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const cust = customers.find((c) => c.id === o.customer_id);
                return (
                  <tr key={o.id}>
                    <td className="date-cell">{formatDate(o.order_date)}</td>
                    <td>{cust ? cust.name : "–"}</td>
                    <td>{o.title}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select value={o.status} onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                        <option value="offen">{statusLabel.offen}</option>
                        <option value="in_arbeit">{statusLabel.in_arbeit}</option>
                        <option value="erledigt">{statusLabel.erledigt}</option>
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
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

      {showAdd && <OrderModal customers={customers} onClose={() => setShowAdd(false)} onAdd={onAdd} />}
    </div>
  );
}

function OrderModal({ customers, onClose, onAdd }: {
  customers: Customer[]; onClose: () => void;
  onAdd: (fields: { customerId: string; title: string; description: string; orderDate: string; status: OrderStatus }) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [status, setStatus] = useState<OrderStatus>("offen");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId || !title.trim()) return;
    setSaving(true);
    await onAdd({ customerId, title: title.trim(), description, orderDate, status });
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
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
              <option value="offen">Offen</option>
              <option value="in_arbeit">In Arbeit</option>
              <option value="erledigt">Erledigt</option>
            </select>
          </div>
        </div>
        <button className="btn-primary btn-block" disabled={!customerId || !title.trim() || saving} onClick={save}>Auftrag anlegen</button>
      </div>
    </div>
  );
}

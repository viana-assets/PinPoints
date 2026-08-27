"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import type { Appointment, Customer, ContactHistoryEntry, UserSettings } from "@/lib/types";
import {
  todayStr, formatDate, formatApptDateTime, isApptPast, nextAppointment,
  effectiveColor, telHref, getPhoneNumbers, geocodeAddress,
} from "@/lib/helpers";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";

type TabKey = "list" | "termine" | "inactive" | "add" | "settings";

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tab, setTab] = useState<TabKey>("list");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "", period_months: 3, map_style: "strasse", theme: "light",
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

  // ---------------------------------------------------------------- Initial-Load
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin");

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
  async function saveSettingsPatch(patch: Partial<UserSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await supabase.from("user_settings").update(patch).eq("user_id", settings.user_id);
  }
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

  return (
    <div id="app" data-theme={settings.theme}>
      <nav id="iconNav">
        <div className="nav-brand" title="Viana PinPoints">
          <svg viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="21" x2="6" y2="3" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6 3 L19 7.5 L6 12 Z" fill="#5b8dff" />
            <circle cx="6" cy="21" r="1.6" fill="#ffffff" />
          </svg>
        </div>
        <NavItem active={tab === "list"} onClick={() => setTab("list")} icon="📋" label="Kunden" />
        <NavItem active={tab === "termine"} onClick={() => setTab("termine")} icon="📅" label="Termine" />
        <NavItem active={tab === "add"} onClick={() => setTab("add")} icon="➕" label="Neu" />
        <NavItem active={tab === "inactive"} onClick={() => setTab("inactive")} icon="🚫" label="Inaktiv" />
        <NavItem active={tab === "settings"} onClick={() => setTab("settings")} icon="⚙️" label="Settings" className="settings-item" />
      </nav>

      <div id="sidebar" className={mobileMapVisible ? "mobile-hidden" : ""}>
        <header>
          <h1>🚩 Viana PinPoints</h1>
          <p>Reifenwechsel-Anruflisten auf der Karte</p>
        </header>

        {tab === "list" && (
          <div className="tabpanel active">
            <div className="stats">
              <div className="stat"><div className="num">{statTotal}</div><div className="lbl">Gesamt</div></div>
              <div className="stat red"><div className="num">{statTotal - statOk}</div><div className="lbl">Offen</div></div>
              <div className="stat green"><div className="num">{statOk}</div><div className="lbl">Kontaktiert</div></div>
            </div>
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
                const meta = nextAppt
                  ? `📅 Termin: ${formatDate(nextAppt.date)}`
                  : c.lat == null ? "Keine Kartenposition"
                  : c.last_contact ? `Letzter Kontakt: ${formatDate(c.last_contact)}` : "Noch nicht kontaktiert";
                return (
                  <div key={c.id} className="cust-item" onClick={() => openDetail(c.id)}>
                    <div className={`dot ${color}`}></div>
                    <div className="info">
                      <div className="name">{c.name}</div>
                      <div className="addr">{c.address}</div>
                      <div className="meta">{meta}</div>
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
            userEmail={userEmail}
            onLogout={handleLogout}
          />
        )}
      </div>

      <div id="map" ref={mapDivRef} className={mobileMapVisible ? "mobile-visible" : ""}></div>

      <button id="mapToggleBtn" type="button" onClick={toggleMobileMap} title={mobileMapVisible ? "Liste anzeigen" : "Karte anzeigen"}>
        {mobileMapVisible ? "📋" : "🗺️"}
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
          onClose={() => setSelectedId(null)}
          onSaveFields={(fields) => updateCustomerFields(selectedId, fields)}
          onMarkContacted={(contactDate, apptDate, apptTime, apptDesc) => markContacted(selectedId, contactDate, apptDate, apptTime, apptDesc)}
          onMarkOpen={() => markOpen(selectedId)}
          onToggleActive={() => setActive(selectedId, customers.find((c) => c.id === selectedId)?.active === false)}
          onDelete={() => deleteCustomerById(selectedId)}
          onAddAppointment={(date, desc, time) => addAppointment(selectedId, date, desc, time)}
          onUpdateAppointment={updateAppointment}
          onDeleteAppointment={deleteAppointment}
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

function NavItem({ active, onClick, icon, label, className }: { active: boolean; onClick: () => void; icon: string; label: string; className?: string }) {
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

function SettingsPanel({ settings, onChange, isAdmin, userEmail, onLogout }: {
  settings: UserSettings; onChange: (p: Partial<UserSettings>) => void; isAdmin: boolean; userEmail: string; onLogout: () => void;
}) {
  const [period, setPeriod] = useState(settings.period_months);
  return (
    <div className="tabpanel active">
      <div className="field">
        <label>Design</label>
        <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as "light" | "dark" })}>
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
        </select>
      </div>
      <hr />
      <div className="field">
        <label>Kartenansicht</label>
        <select value={settings.map_style} onChange={(e) => onChange({ map_style: e.target.value })}>
          <option value="strasse">Straße (Standard)</option>
          <option value="hell">Straße (Hell/Minimal)</option>
          <option value="dunkel">Straße (Dunkel)</option>
          <option value="satellit">Satellit</option>
          <option value="satellit_labels">Satellit mit Beschriftung</option>
        </select>
      </div>
      <hr />
      <div className="field">
        <label>Wiedervorlage-Zeitraum (Monate) – danach wird eine kontaktierte Flagge wieder rot</label>
        <input type="number" min={1} max={24} value={period} onChange={(e) => setPeriod(parseInt(e.target.value, 10) || 3)} />
      </div>
      <button className="btn-primary btn-block" onClick={() => onChange({ period_months: period })}>Speichern</button>
      <hr />
      <div className="small">Angemeldet als {userEmail}{isAdmin ? " (Admin)" : ""}</div>
      {isAdmin && <a className="btn-secondary btn-block" href="/admin/invite" style={{ marginTop: 8, display: "block", textAlign: "center", textDecoration: "none" }}>👤 Nutzer einladen</a>}
      <button className="btn-secondary btn-block" style={{ marginTop: 8 }} onClick={onLogout}>Abmelden</button>
    </div>
  );
}

function DetailModal(props: {
  customer: Customer; appointments: Appointment[]; history: ContactHistoryEntry[]; periodMonths: number;
  onClose: () => void;
  onSaveFields: (f: Partial<Customer>) => void;
  onMarkContacted: (contactDate: string, apptDate: string | null, apptTime: string, apptDesc: string) => void;
  onMarkOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onAddAppointment: (date: string, desc: string, time: string) => void;
  onUpdateAppointment: (apptId: string, date: string, desc: string, time: string) => void;
  onDeleteAppointment: (apptId: string) => void;
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

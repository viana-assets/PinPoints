import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { AuftragFahrzeug, Customer, Employee, Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { ORDER_STATUS_FARBE, ORDER_STATUS_LABEL, SAISON_LABEL } from "@/lib/constants";
import { formatEUR, getPhoneNumbers, LANGLIEGER_MONATE, naechsteSaison, terminZeitraum } from "@/lib/helpers";
import { naechsterWann } from "@/lib/terminAnsicht";
import { addDays, employeeColorFor, toDateStr } from "@/lib/calendar";
import { kundeFuerAuftrag } from "@/lib/laufkunde";
import { mitnehmenListe } from "@/lib/mitnehmen";
import { langlieger } from "@/lib/langlieger";
import { alsNaechstes, datumKurz, saisonBarometer, wochenUmsatz, zuErledigen, type ErledigenPunkt } from "@/lib/dashboard";
import { fetchAuftragFahrzeuge } from "@/lib/api/auftragFahrzeuge";
import { setzeGepackt } from "@/lib/api/mitnehmen";
import { useGepackt } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { IconNavPin } from "@/components/icons";

// Das Dashboard (25.09.2026, Entwurf „G · Dashboard"). Die Frage, die es beantwortet:
// „Was steht heute und morgen an – und was muss ich noch tun?"
//
// Vorher standen hier drei Kundenzahlen und drei Kacheln, die nur auf andere Reiter zeigten.
// Jetzt: die Zahlen des Tages, der nächste Termin mit Navigation, die Reifen, die mit müssen
// (zum Abhaken, fürs ganze Team sichtbar – Migration 58), die offenen Punkte fürs Büro, der Tag
// im Überblick, und unten Woche, Lager, Saison und Kundenkontakt.
//
// Ein Techniker sieht dieselbe Seite ohne die Büro-Teile. Seine Aufträge sind ohnehin nur
// seine eigenen (RLS, Migration 13/15) – „Heute" ist bei ihm also sein Tag.
export function DashboardPanel(p: {
  supabase: SupabaseClient;
  orders: Order[];
  orderEmployees: Record<string, string[]>;
  customers: Customer[];
  employees: Employee[];
  tireStorages: TireStorage[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  lagerLaedt: boolean;
  isTechniker: boolean;
  standardDauerMin: number;
  belegtePlaetze: number;
  gesamtPlaetze: number;
  kundenGesamt: number;
  kundenKontaktiert: number;
  darfLager: boolean;
  darfSaison: boolean;
  darfKunden: boolean;
  darfPlanung: boolean;
  betragFuer: (o: Order) => number;
  istRueckruf: (c: Customer) => boolean;
  onOpenOrder: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  onNavigate: (e: React.MouseEvent, c: Customer) => void;
  onCall: (e: React.MouseEvent, c: Customer) => void;
  onZuPlanung: () => void;
  onZuLager: () => void;
  onZuSaison: (saison: "sommer" | "winter") => void;
  onZuAnrufliste: () => void;
  // Hinweis auf „Was gibt es Neues" (nur Admin/Superadmin, nur solange ungelesen).
  neuigkeit?: { version: string; titel: string } | null;
  onNeuigkeiten?: () => void;
  // Nur die fälligen Rückrufe in der Kundenliste (Filter „rueckruf", 26.09.2026).
  onZuRueckrufe?: () => void;
  onZuRechnungen?: () => void;
}) {
  const queryClient = useQueryClient();
  const jetzt = new Date();
  const heute = toDateStr(jetzt);
  const morgen = toDateStr(addDays(jetzt, 1));
  const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
  const WT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const gruss = jetzt.getHours() < 11 ? "Guten Morgen" : jetzt.getHours() < 18 ? "Guten Tag" : "Guten Abend";

  const kundeVon = (o: Order) => kundeFuerAuftrag(o, p.customers);
  const kundeName = (o: Order) => kundeVon(o)?.name || o.title;
  const nichtStorniert = (o: Order) => o.status !== "storniert" && !o.deleted_at;
  const nachZeit = (a: Order, b: Order) => (a.time ?? "99").localeCompare(b.time ?? "99");
  const heuteListe = p.orders.filter((o) => o.order_date === heute && nichtStorniert(o)).sort(nachZeit);
  const morgenListe = p.orders.filter((o) => o.order_date === morgen && nichtStorniert(o)).sort(nachZeit);
  const offenGesamt = p.orders.filter((o) => (o.status === "offen" || o.status === "in_arbeit") && !o.deleted_at).length;

  // ---------------------------------------------------------------- Reifen mitnehmen
  // Nachmittags ist „morgen" die Frage, vormittags „heute" – danach richtet sich, was zuerst
  // aufgeschlagen ist. Umschalten geht immer.
  const [mitTag, setMitTag] = useState<"heute" | "morgen">(jetzt.getHours() >= 14 ? "morgen" : "heute");
  const [fahrzeuge, setFahrzeuge] = useState<AuftragFahrzeug[] | null>(null);
  const idsBeiderTage = [...heuteListe, ...morgenListe].map((o) => o.id).join(",");
  useEffect(() => {
    let abgebrochen = false;
    fetchAuftragFahrzeuge(p.supabase, idsBeiderTage ? idsBeiderTage.split(",") : [])
      .then((z) => { if (!abgebrochen) setFahrzeuge(z); })
      .catch(() => { if (!abgebrochen) setFahrzeuge([]); });
    return () => { abgebrochen = true; };
  }, [p.supabase, idsBeiderTage]);
  const mitDatum = mitTag === "heute" ? heute : morgen;
  const mitEintraege = mitnehmenListe(mitDatum, mitTag === "heute" ? heuteListe : morgenListe, p.tireStorages, fahrzeuge ?? []);
  const mitZeilen = mitEintraege.flatMap((e) => e.saetze.map((s) => ({ auftrag: e.auftrag, satz: s })));
  const morgenSaetze = mitnehmenListe(morgen, morgenListe, p.tireStorages, fahrzeuge ?? []).reduce((n, e) => n + e.saetze.length, 0);
  const gepacktQuery = useGepackt(p.supabase, [heute, morgen], p.darfLager);
  const [schwebend, setSchwebend] = useState<Record<string, boolean>>({});
  const gepackt = (satzId: string): { an: boolean; wer: string | null } => {
    const k = satzId + "|" + mitDatum;
    if (k in schwebend) return { an: schwebend[k], wer: null };
    const z = (gepacktQuery.data ?? []).find((g) => g.tire_storage_id === satzId && g.fuer_datum === mitDatum);
    if (!z) return { an: false, wer: null };
    const wer = p.employees.find((e) => e.profile_id === z.gepackt_von)?.name ?? null;
    const um = new Date(z.gepackt_am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return { an: true, wer: wer ? `${wer} · ${um}` : um };
  };
  async function umschalten(satzId: string) {
    const k = satzId + "|" + mitDatum;
    const neu = !gepackt(satzId).an;
    setSchwebend((s) => ({ ...s, [k]: neu }));
    try {
      await setzeGepackt(p.supabase, satzId, mitDatum, neu);
      await queryClient.invalidateQueries({ queryKey: qk.gepacktAlle() });
    } finally {
      setSchwebend((s) => { const n = { ...s }; delete n[k]; return n; });
    }
  }
  const eingeladen = mitZeilen.filter((z) => gepackt(z.satz.id).an).length;
  const platzText = (slotId: string) => {
    const platz = p.storageSlots.find((s) => s.id === slotId);
    if (!platz) return "?";
    const lager = p.warehouses.find((w) => w.id === platz.warehouse_id);
    return lager && p.warehouses.length > 1 ? `${platz.code} · ${lager.name}` : platz.code;
  };
  const satzText = (s: TireStorage) => {
    const v = s.vehicle_id ? p.vehicles.find((x) => x.id === s.vehicle_id) : null;
    return [v?.license_plate, s.saison ? SAISON_LABEL[s.saison] : null, v?.tire_size].filter(Boolean).join(" · ") || "ohne Fahrzeug";
  };

  // ---------------------------------------------------------------- Zu erledigen (Büro)
  const [aufgeklappt, setAufgeklappt] = useState<ErledigenPunkt["id"] | null>(null);
  const punkte = p.isTechniker ? [] : zuErledigen({
    orders: p.orders, orderEmployees: p.orderEmployees, customers: p.customers, heute,
    standardMin: p.standardDauerMin, istRueckruf: p.istRueckruf, kundeName,
    mitarbeiterName: (id) => p.employees.find((e) => e.id === id)?.name || "Mitarbeiter",
    freiePlaetze: p.darfLager && p.gesamtPlaetze > 0 ? p.gesamtPlaetze - p.belegtePlaetze : null,
    gesamtPlaetze: p.darfLager ? p.gesamtPlaetze : null,
  });
  const PUNKT_FARBE: Record<ErledigenPunkt["id"], string> = {
    rechnungen: "rot", ohne_mitarbeiter: "orange", ueberschneidung: "orange", rueckrufe: "blau", laufkunde: "grau", lager: "rot",
  };

  // ---------------------------------------------------------------- Als Nächstes
  const naechster = alsNaechstes(p.orders, heute, jetztMin, p.standardDauerMin);
  const naechsterKunde = naechster ? kundeVon(naechster) : null;
  // Dieselbe Beschriftung wie in der Terminliste (lib/terminAnsicht.ts).
  const wann = naechster ? naechsterWann(naechster, heute, jetztMin) : "";
  const naechsterWer = naechster ? (p.orderEmployees[naechster.id] || []).map((id) => p.employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ") : "";

  // ---------------------------------------------------------------- Unten
  const woche = wochenUmsatz(p.orders, heute, p.betragFuer);
  const maxTag = Math.max(1, ...woche.jeTag.slice(0, 6));
  const saison = naechsteSaison(jetzt);
  const barometer = saisonBarometer(p.tireStorages, p.orders, saison, heute);
  const langliegerZahl = langlieger(p.tireStorages, heute, null, LANGLIEGER_MONATE, null).length;
  const frei = Math.max(0, p.gesamtPlaetze - p.belegtePlaetze);
  const heuteOffen = heuteListe.filter((o) => o.status === "offen" || o.status === "in_arbeit").length;

  return (
    <div className="tabpanel active">
      <div className="module-page db-seite">
        <div className="db-kopf">
          <span className="db-datum">{WT[jetzt.getDay()].toUpperCase()}, {jetzt.getDate()}. {MON[jetzt.getMonth()].toUpperCase()}</span>
          <h2 className="db-gruss">{gruss}</h2>
        </div>

        <div className="db-kacheln">
          <button type="button" className="db-kachel" onClick={p.darfPlanung ? p.onZuPlanung : undefined}>
            <span className="db-k-titel">{p.isTechniker ? "Mein Tag" : "Heute"}</span>
            <span className="db-k-wert">{heuteListe.length}</span>
            <span className="db-k-unter">{heuteOffen} noch offen</span>
          </button>
          <button type="button" className="db-kachel" onClick={() => setMitTag("morgen")}>
            <span className="db-k-titel">Morgen</span>
            <span className="db-k-wert">{morgenListe.length}</span>
            <span className="db-k-unter">{p.darfLager ? `${morgenSaetze} ${morgenSaetze === 1 ? "Satz" : "Sätze"} mit` : "Termine"}</span>
          </button>
          <button type="button" className="db-kachel" onClick={p.darfPlanung ? p.onZuPlanung : undefined}>
            <span className="db-k-titel">Offen</span>
            <span className="db-k-wert">{offenGesamt}</span>
            <span className="db-k-unter">Aufträge</span>
          </button>
        </div>

        {p.neuigkeit && p.onNeuigkeiten && (
          <button type="button" className="sl-chance nw-hinweis" onClick={p.onNeuigkeiten}>
            <span className="nw-version">{p.neuigkeit.version}</span>
            <span className="db-punkt-text">
              <span className="db-punkt-titel">Neu: {p.neuigkeit.titel}</span>
              <span className="small">Was sich in dieser Fassung geändert hat</span>
            </span>
            <span className="db-link">Ansehen ›</span>
          </button>
        )}

        {naechster && (
          <div className="db-naechster">
            <div className="db-n-kopf">
              <span className="db-n-wann">ALS NÄCHSTES · {wann}</span>
              {naechsterWer && <span className="db-n-wer">{naechsterWer}</span>}
            </div>
            <button type="button" className="db-n-titel" onClick={() => p.onOpenOrder(naechster.id)}>
              {naechster.time ? naechster.time.slice(0, 5) + " " : ""}{kundeName(naechster)}
            </button>
            <span className="db-n-unter">{[naechsterKunde?.address, naechster.title !== "Termin" ? naechster.title : null].filter(Boolean).join(" · ") || terminZeitraum(naechster) || ""}</span>
            <div className="db-n-knoepfe">
              {naechsterKunde?.address.trim() ? (
                <button type="button" className="primaer" onClick={(e) => p.onNavigate(e, naechsterKunde)}>Navigation</button>
              ) : <span />}
              {naechsterKunde && getPhoneNumbers(naechsterKunde).length > 0 ? (
                <button type="button" onClick={(e) => p.onCall(e, naechsterKunde)}>Anrufen</button>
              ) : <span />}
              <button type="button" onClick={() => p.onOpenOrder(naechster.id)}>Auftrag</button>
            </div>
          </div>
        )}

        {p.darfLager && (
          <div className="db-karte">
            <div className="db-mit-kopf">
              <span className="db-mit-symbol" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" /></svg>
              </span>
              <span className="db-mit-text">
                <span className="db-karte-titel">Reifen mitnehmen</span>
                <span className="small">
                  {p.lagerLaedt || fahrzeuge === null ? "lädt …"
                    : mitZeilen.length === 0 ? "nichts aus dem Lager"
                    : `${mitZeilen.length} ${mitZeilen.length === 1 ? "Satz" : "Sätze"} · ${datumKurz(mitDatum)}`}
                </span>
              </span>
              <span className="db-umschalter">
                {(["heute", "morgen"] as const).map((t) => (
                  <button key={t} type="button" className={mitTag === t ? "aktiv" : ""} onClick={() => setMitTag(t)}>{t === "heute" ? "Heute" : "Morgen"}</button>
                ))}
              </span>
            </div>
            {!(p.lagerLaedt || fahrzeuge === null) && mitZeilen.length === 0 && (
              <div className="db-leer">Für diesen Tag muss nichts aus dem Lager mit.</div>
            )}
            {mitZeilen.map(({ auftrag, satz }) => {
              const g = gepackt(satz.id);
              return (
                <button key={satz.id} type="button" className={"db-mit-zeile" + (g.an ? " an" : "")} onClick={() => { void umschalten(satz.id); }}
                  aria-pressed={g.an} title={g.an ? "Eingeladen – antippen, um den Haken zu entfernen" : "Antippen, wenn der Satz im Auto ist"}>
                  <span className="db-haken" aria-hidden="true">{g.an ? "✓" : ""}</span>
                  <span className="db-mit-info">
                    <span className="db-mit-kunde">{auftrag.time ? auftrag.time.slice(0, 5) + " · " : ""}{kundeName(auftrag)}</span>
                    <span className="small">{satzText(satz)}{g.an && g.wer ? ` · eingeladen ${g.wer}` : ""}</span>
                  </span>
                  <span className="db-platz">{platzText(satz.storage_slot_id)}</span>
                </button>
              );
            })}
            {mitZeilen.length > 0 && (
              <div className="db-mit-fuss">
                <span className={eingeladen === mitZeilen.length ? "fertig" : "offen"}>
                  {eingeladen === mitZeilen.length ? "Alles im Auto ✓" : `${eingeladen} von ${mitZeilen.length} eingeladen`}
                </span>
                <span className="small">Hinweis abends aufs Handy (Einstellungen)</span>
              </div>
            )}
          </div>
        )}

        {punkte.length > 0 && (
          <div className="db-karte">
            <div className="db-karte-kopf">
              <span className="db-karte-titel">Zu erledigen</span>
            </div>
            {punkte.map((pt) => (
              <div key={pt.id} className="db-punkt">
                <button type="button" className="db-punkt-zeile" onClick={() => {
                  if (pt.id === "lager") { p.onZuLager(); return; }
                  setAufgeklappt(aufgeklappt === pt.id ? null : pt.id);
                }} aria-expanded={pt.id === "lager" ? undefined : aufgeklappt === pt.id}>
                  <span className={"db-punkt-zahl " + PUNKT_FARBE[pt.id]}>{pt.zahl}</span>
                  <span className="db-punkt-text">
                    <span className="db-punkt-titel">{pt.titel}</span>
                    <span className="small">{pt.unter}</span>
                  </span>
                  <span className={"db-pfeil" + (aufgeklappt === pt.id ? " auf" : "")} aria-hidden="true">›</span>
                </button>
                {aufgeklappt === pt.id && (
                  <div className="db-punkt-liste">
                    {pt.zeilen.slice(0, 12).map((z, i) => (
                      <button key={i} type="button" onClick={() => { if (z.auftragId) p.onOpenOrder(z.auftragId); else if (z.kundeId) p.onOpenCustomer(z.kundeId); }}>
                        {z.text}
                      </button>
                    ))}
                    {pt.zeilen.length > 12 && <span className="small">… und {pt.zeilen.length - 12} weitere</span>}
                    {pt.id === "rueckrufe" && p.darfKunden && <button type="button" className="db-link" onClick={p.onZuRueckrufe ?? p.onZuAnrufliste}>Zur Kundenliste ›</button>}
                    {pt.id === "rechnungen" && p.onZuRechnungen && <button type="button" className="db-link" onClick={p.onZuRechnungen}>Zu den Rechnungen ›</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="db-karte">
          <div className="db-karte-kopf">
            <span className="db-karte-titel">{p.isTechniker ? "Mein Tag" : "Heute im Team"}</span>
            {p.darfPlanung && <button type="button" className="db-link" onClick={p.onZuPlanung}>Einsatzplanung ›</button>}
          </div>
          {heuteListe.length === 0 && <div className="db-leer">Heute stehen keine Termine an.</div>}
          {heuteListe.map((o) => {
            const wer = p.orderEmployees[o.id] || [];
            const farbe = wer.length ? employeeColorFor(p.employees, wer[0]) : "var(--frei-linie)";
            return (
              <div key={o.id} role="button" tabIndex={0} className={"db-heute" + (o.status === "erledigt" ? " fertig" : "")}
                onClick={() => p.onOpenOrder(o.id)} onKeyDown={(e) => { if (e.key === "Enter") p.onOpenOrder(o.id); }}>
                <span className="db-heute-zeit">{o.time ? o.time.slice(0, 5) : "–"}</span>
                <span className="db-heute-strich" style={{ background: farbe }} />
                <span className="db-heute-text">
                  <span className="db-heute-kunde">{kundeName(o)}</span>
                  <span className="small">{wer.map((id) => p.employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ") || "niemand eingeteilt"}</span>
                </span>
                <span className={`badge ${ORDER_STATUS_FARBE[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                {kundeVon(o)?.address.trim() && (
                  <button type="button" className="call-icon-btn small nav-icon-btn" title="Navigation starten (Google Maps / Apple Karten)"
                    onClick={(e) => { e.stopPropagation(); const c = kundeVon(o); if (c) p.onNavigate(e, c); }}>
                    <IconNavPin />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!p.isTechniker && (
          <div className="db-raster">
            <div className="db-kachel-gross">
              <span className="db-k-titel">Diese Woche</span>
              <span className="db-k-wert">{formatEUR(woche.summe)}</span>
              <span className="db-balken" aria-hidden="true">
                {woche.jeTag.slice(0, 6).map((b, i) => (
                  <span key={i} className={toDateStr(addDays(new Date(heute + "T12:00:00"), i - ((jetzt.getDay() + 6) % 7))) === heute ? "heute" : ""}
                    style={{ height: `${Math.max(6, Math.round((b / maxTag) * 100))}%` }} />
                ))}
              </span>
              <span className="db-k-unter">{woche.erledigt} von {woche.gesamt} Terminen erledigt</span>
            </div>
            {p.darfLager && (
              <button type="button" className="db-kachel-gross" onClick={p.onZuLager}>
                <span className="db-k-titel">Lager</span>
                <span className="db-k-wert">{p.belegtePlaetze} <span className="db-k-von">/ {p.gesamtPlaetze}</span></span>
                <span className="db-fortschritt"><span style={{ width: `${p.gesamtPlaetze ? Math.round((p.belegtePlaetze / p.gesamtPlaetze) * 100) : 0}%` }} /></span>
                <span className="db-k-unter">{frei} frei{langliegerZahl ? ` · ${langliegerZahl} Langlieger` : ""}</span>
              </button>
            )}
            {p.darfSaison && p.darfLager && (
              <button type="button" className="db-kachel-gross breit" onClick={() => p.onZuSaison(saison)}>
                <span className="db-k-kopf"><span className="db-k-titel">Saison · {SAISON_LABEL[saison]}</span><span className="db-link">Saisonliste ›</span></span>
                <span className="db-saison">
                  <b>{barometer.kunden}</b> {barometer.kunden === 1 ? "Kunde hat" : "Kunden haben"} {SAISON_LABEL[saison]}reifen im Lager und noch keinen Wechseltermin
                </span>
                <span className="db-k-unter">{barometer.mitTermin} haben schon einen Termin</span>
              </button>
            )}
            {p.darfKunden && (
              <button type="button" className="db-kachel-gross breit" onClick={p.onZuAnrufliste}>
                <span className="db-k-kopf"><span className="db-k-titel">Kunden · Kontakt</span><span className="db-link">Anrufliste ›</span></span>
                <span className="db-saison"><b>{p.kundenKontaktiert}</b> von {p.kundenGesamt} kontaktiert · <b>{Math.max(0, p.kundenGesamt - p.kundenKontaktiert)}</b> offen</span>
                <span className="db-fortschritt gruen"><span style={{ width: `${p.kundenGesamt ? Math.round((p.kundenKontaktiert / p.kundenGesamt) * 100) : 0}%` }} /></span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

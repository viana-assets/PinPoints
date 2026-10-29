import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { Article, AuftragFahrzeug, Customer, Employee, Order, OrderArticle, StorageSlot, TireStorage, Vehicle, Verkaufsreifen, Warehouse } from "@/lib/types";
import { RECHNUNG_SEITE_CSS, SAISON_LABEL } from "@/lib/constants";
import { toDateStr, employeeColorFor } from "@/lib/calendar";
import { kundeFuerAuftrag } from "@/lib/laufkunde";
import { datumKurz, WOCHENTAG_KURZ } from "@/lib/dashboard";
import { groesseText, reifenName } from "@/lib/reifenverkauf";
import {
  nachPlatz, packlisteGesamt, packlisteSpanne, packlisteTage, PACKLISTE_HORIZONT_TAGE, PACKLISTE_ZEITRAEUME,
  type PacklisteTag, type PacklisteZeitraum,
} from "@/lib/packlisteAnsicht";
import { csv } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { fetchAuftragFahrzeuge } from "@/lib/api/auftragFahrzeuge";
import { setzeGepackt } from "@/lib/api/mitnehmen";
import { useGepackt } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { PacklisteBlock } from "@/components/auftraege/PacklisteBlock";
import { Blatt } from "@/components/Blatt";
import { anzeigeName } from "@/lib/kundenAnsicht";

// Die Seite „Packliste“ (v171, Entwurf Mockup_Packliste_v1, abgenommen 26.10.2026): was wann mit muss,
// für einen wählbaren Zeitraum statt nur heute/morgen wie im Dashboard. Gerechnet wird in
// lib/packlisteAnsicht.ts mit denselben Regeln wie dort; der Haken „eingeladen“ ist derselbe
// (Tabelle `mitnehmen_gepackt`, Migration 58) – wer hier abhakt, sieht es im Dashboard und umgekehrt.
//
// Rechte: sichtbar mit „Aufträge lesen“ (lib/module.ts). Die Sätze aus dem Lager und die Lager-
// vorbereitung nur mit Lagerrecht (`darfLager`, dieselbe Bedingung wie im Dashboard). Ein Techniker
// sieht ohnehin nur seine Aufträge (RLS).
type Ansicht = "tag" | "gesamt";
type Person = "alle" | "ohne" | string;

export function PacklistePanel(p: {
  supabase: SupabaseClient;
  orders: Order[];
  orderEmployees: Record<string, string[]>;
  customers: Customer[];
  employees: Employee[];
  // Die Mitarbeiter, die in der Filterleiste stehen dürfen (Techniker: nur er selbst).
  filterMitarbeiter: Employee[];
  tireStorages: TireStorage[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  orderArticles: OrderArticle[];
  articles: Article[];
  verkaufsreifen: Verkaufsreifen[];
  darfLager: boolean;
  lagerLaedt: boolean;
  isTechniker: boolean;
  onOpenOrder: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const heute = toDateStr(new Date());
  const [zeitraum, setZeitraum] = useState<PacklisteZeitraum>("14");
  const [ansicht, setAnsicht] = useState<Ansicht>("tag");
  const [person, setPerson] = useState<Person>("alle");
  // Aufgeklappte Tage. Vorgabe: die ersten beiden Tage mit Aufträgen (meist heute und morgen).
  const [offen, setOffen] = useState<Set<string> | null>(null);
  const [druck, setDruck] = useState(false);

  // Die Fahrzeuge am Auftrag für ALLE offenen Aufträge bis zum Horizont – einmal geladen, damit das
  // Umschalten des Zeitraums nicht jedes Mal neu lädt.
  const horizont = packlisteSpanne("alle", heute);
  const idsHorizont = p.orders
    .filter((o) => !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit") && o.order_date >= horizont.von && o.order_date <= horizont.bis)
    .map((o) => o.id).sort().join(",");
  const [fahrzeuge, setFahrzeuge] = useState<AuftragFahrzeug[] | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    fetchAuftragFahrzeuge(p.supabase, idsHorizont ? idsHorizont.split(",") : [])
      .then((z) => { if (!abgebrochen) setFahrzeuge(z); })
      .catch(() => { if (!abgebrochen) setFahrzeuge([]); });
    return () => { abgebrochen = true; };
  }, [p.supabase, idsHorizont]);

  const spanne = packlisteSpanne(zeitraum, heute);
  // Ohne useMemo: Der React Compiler merkt sich das selbst (eine Hand-Memoisierung lehnt er hier ab).
  const { orders, orderEmployees, orderArticles, articles, vehicles, tireStorages, verkaufsreifen, darfLager } = p;
  const tage = packlisteTage({
    von: spanne.von, bis: spanne.bis,
    auftraege: orders.filter((o) => {
      const wer = orderEmployees[o.id] || [];
      return person === "alle" || (person === "ohne" ? wer.length === 0 : wer.includes(person));
    }),
    positionen: orderArticles, artikel: articles,
    auftragFahrzeuge: fahrzeuge ?? [], fahrzeuge: vehicles,
    einlagerungen: darfLager ? tireStorages : [],
    verkaufsreifen,
  });
  const gesamt = packlisteGesamt(tage);
  const aufgeklappt = offen ?? new Set(tage.slice(0, 2).map((t) => t.datum));

  // Wer überhaupt Aufträge im Horizont hat – nur die stehen in der Filterleiste.
  const horizontIds = new Set(idsHorizont.split(","));
  const imHorizont = p.orders.filter((o) => horizontIds.has(o.id));
  const mitAuftrag = new Set(imHorizont.flatMap((o) => p.orderEmployees[o.id] || []));
  const personen = p.filterMitarbeiter.filter((e) => mitAuftrag.has(e.id));
  const ohneDa = !p.isTechniker && imHorizont.some((o) => (p.orderEmployees[o.id] || []).length === 0);

  // ---------------------------------------------------------------- Haken „eingeladen“
  const datenMitSaetzen = tage.filter((t) => t.saetze.length > 0).map((t) => t.datum);
  const gepacktQuery = useGepackt(p.supabase, datenMitSaetzen, p.darfLager);
  const [schwebend, setSchwebend] = useState<Record<string, boolean>>({});
  const istGepackt = (satzId: string, datum: string): boolean => {
    const k = satzId + "|" + datum;
    if (k in schwebend) return schwebend[k];
    return (gepacktQuery.data ?? []).some((g) => g.tire_storage_id === satzId && g.fuer_datum === datum);
  };
  const werGepackt = (satzId: string, datum: string): string | null => {
    const z = (gepacktQuery.data ?? []).find((g) => g.tire_storage_id === satzId && g.fuer_datum === datum);
    if (!z) return null;
    const wer = p.employees.find((e) => e.profile_id === z.gepackt_von)?.name ?? null;
    const um = new Date(z.gepackt_am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return wer ? `${wer} · ${um}` : um;
  };
  async function umschalten(satzId: string, datum: string) {
    const k = satzId + "|" + datum;
    const neu = !istGepackt(satzId, datum);
    setSchwebend((s) => ({ ...s, [k]: neu }));
    try {
      await setzeGepackt(p.supabase, satzId, datum, neu);
      await queryClient.invalidateQueries({ queryKey: qk.gepacktAlle() });
    } finally {
      setSchwebend((s) => { const n = { ...s }; delete n[k]; return n; });
    }
  }

  // ---------------------------------------------------------------- Texte
  const kundeName = (o: Order) => { const k = kundeFuerAuftrag(o, p.customers); return (k && anzeigeName(k)) || o.title; };
  const platzVon = (slotId: string | null) => {
    const platz = slotId ? p.storageSlots.find((s) => s.id === slotId) : null;
    const lager = platz ? p.warehouses.find((w) => w.id === platz.warehouse_id) : null;
    return { code: platz?.code ?? "?", lager: lager?.name ?? "" };
  };
  const platzText = (slotId: string | null) => {
    const x = platzVon(slotId);
    return x.lager && p.warehouses.length > 1 ? `${x.code} · ${x.lager}` : x.code;
  };
  const satzText = (s: TireStorage) => {
    const v = s.vehicle_id ? p.vehicles.find((x) => x.id === s.vehicle_id) : null;
    return [v?.license_plate, s.saison ? SAISON_LABEL[s.saison] : null, v?.tire_size].filter(Boolean).join(" · ") || "ohne Fahrzeug";
  };
  const reifenText = (r: Verkaufsreifen | null) => (r ? `${groesseText(r)} ${reifenName(r)}`.trim() : "Verkaufsreifen");
  const zeit = (o: Order) => (o.time ? o.time.slice(0, 5) : "");
  const wtLang = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const tagTitel = (datum: string) => {
    const d = new Date(datum + "T12:00:00");
    return `${wtLang[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  };
  const morgen = packlisteSpanne("morgen", heute).von;
  const dieseWoche = packlisteSpanne("woche", heute);
  const naechsteWoche = packlisteSpanne("naechste", heute);
  const wochenText = (datum: string) =>
    datum >= dieseWoche.von && datum <= dieseWoche.bis ? "diese Woche"
      : datum >= naechsteWoche.von && datum <= naechsteWoche.bis ? "nächste Woche" : "";

  const saetzeGesamt = gesamt.saetze.length;
  const eingeladen = gesamt.saetze.filter((s) => istGepackt(s.satz.id, s.datum)).length;
  const verkaufStueck = gesamt.verkauf.reduce((n, v) => n + v.position.quantity, 0);
  const laedt = fahrzeuge === null || (p.darfLager && p.lagerLaedt);

  function csvSpeichern() {
    const zeilen: (string | number | null)[][] = [["Datum", "Uhrzeit", "Kunde", "Art", "Was", "Lagerplatz", "Eingeladen"]];
    for (const t of tage) {
      for (const s of t.saetze) zeilen.push([t.datum, zeit(s.auftrag), kundeName(s.auftrag), "Satz aus dem Lager", satzText(s.satz), platzText(s.satz.storage_slot_id), istGepackt(s.satz.id, t.datum) ? "ja" : ""]);
      for (const v of t.verkauf) zeilen.push([t.datum, zeit(v.auftrag), kundeName(v.auftrag), "Verkaufsreifen", `${v.position.quantity}× ${reifenText(v.reifen)}`, v.reifen ? platzText(v.reifen.storage_slot_id) : "", ""]);
      for (const l of t.liste.leistungen) zeilen.push([t.datum, "", "", "Leistung", `${l.menge}× ${l.name}`, "", ""]);
      for (const g of t.liste.groessen) zeilen.push([t.datum, "", "", "Reifengröße", `${g.autos}× ${g.groesse}`, "", ""]);
    }
    dateiHerunterladen(`packliste_${spanne.von}_${spanne.bis}.csv`, csv(zeilen), "text/csv;charset=utf-8");
  }

  // ---------------------------------------------------------------- Bausteine
  const satzZeilen = (t: PacklisteTag) => (
    <>
      {t.saetze.map(({ auftrag, satz }) => {
        const an = istGepackt(satz.id, t.datum);
        const wer = an ? werGepackt(satz.id, t.datum) : null;
        return (
          <button key={satz.id} type="button" className={"db-mit-zeile" + (an ? " an" : "")} onClick={() => { void umschalten(satz.id, t.datum); }}
            aria-pressed={an} title={an ? "Eingeladen – antippen, um den Haken zu entfernen" : "Antippen, wenn der Satz im Auto ist"}>
            <span className="db-haken" aria-hidden="true">{an ? "✓" : ""}</span>
            <span className="db-mit-info">
              <span className="db-mit-kunde">{zeit(auftrag) ? zeit(auftrag) + " · " : ""}{kundeName(auftrag)}</span>
              <span className="small">{satzText(satz)}{wer ? ` · eingeladen ${wer}` : ""}</span>
            </span>
            <span className="db-platz">{platzText(satz.storage_slot_id)}</span>
          </button>
        );
      })}
      {t.verkauf.map((v) => (
        <div key={v.position.id} className="db-mit-zeile pa-verkauf">
          <span className="db-haken pa-haken-leer" aria-hidden="true" />
          <span className="db-mit-info">
            <span className="db-mit-kunde">{zeit(v.auftrag) ? zeit(v.auftrag) + " · " : ""}{kundeName(v.auftrag)}</span>
            <span className="small">{v.position.quantity}× {reifenText(v.reifen)} · aus dem Verkauf</span>
          </span>
          {v.reifen?.storage_slot_id && <span className="db-platz pa-platz-vk">{platzText(v.reifen.storage_slot_id)}</span>}
        </div>
      ))}
    </>
  );

  const tagKarte = (t: PacklisteTag) => {
    const auf = aufgeklappt.has(t.datum);
    const wer = [...new Set(t.auftraege.flatMap((o) => (p.orderEmployees[o.id] || []).map((id) => p.employees.find((e) => e.id === id)?.name ?? "")))].filter(Boolean);
    const ohne = t.auftraege.some((o) => (p.orderEmployees[o.id] || []).length === 0);
    const gepackt = t.saetze.filter((s) => istGepackt(s.satz.id, t.datum)).length;
    const d = new Date(t.datum + "T12:00:00");
    return (
      <div key={t.datum} className={"db-karte pa-tag" + (t.datum === heute ? " heute" : "") + (auf ? " offen" : "")}>
        <button type="button" className="pa-tag-kopf" aria-expanded={auf}
          onClick={() => setOffen(() => { const n = new Set(aufgeklappt); if (n.has(t.datum)) n.delete(t.datum); else n.add(t.datum); return n; })}>
          <span className="pa-datum"><small>{WOCHENTAG_KURZ[d.getDay()]}</small><b>{d.getDate()}</b></span>
          <span className="pa-tag-titel">
            <span className="db-karte-titel">{tagTitel(t.datum)}
              {t.datum === heute && <span className="pa-marke heute">heute</span>}
              {t.datum === morgen && <span className="pa-marke morgen">morgen</span>}
            </span>
            <span className="small">{t.auftraege.length} {t.auftraege.length === 1 ? "Auftrag" : "Aufträge"}{wer.length || ohne ? " · " : ""}{[...wer, ...(ohne ? ["ohne Mitarbeiter"] : [])].join(", ")}</span>
          </span>
          <span className="pa-pfeil" aria-hidden="true">⌄</span>
        </button>
        {!auf && (
          <div className="pa-kurz">
            {t.saetze.length > 0 && <span className={gepackt === t.saetze.length ? "gruen" : ""}>{t.saetze.length} {t.saetze.length === 1 ? "Satz" : "Sätze"} · {gepackt} eingeladen</span>}
            {t.verkauf.length > 0 && <span>{t.verkauf.reduce((n, v) => n + v.position.quantity, 0)}× Verkaufsreifen</span>}
            {t.liste.leistungen.slice(0, 3).map((l) => <span key={l.name}>{l.menge}× {l.name}</span>)}
            {t.liste.groessen.length > 0 && <span>{t.liste.groessen.length} {t.liste.groessen.length === 1 ? "Größe" : "Größen"}</span>}
            {t.liste.ohneGroesse > 0 && <span className="rot">{t.liste.ohneGroesse} ohne Größe</span>}
          </div>
        )}
        {auf && (
          <>
            {p.darfLager && (
              <div className="pa-abschnitt">
                <div className="pa-abschnitt-kopf"><span className="pk-titel">Aus dem Lager mitnehmen</span>
                  {t.saetze.length > 0 && <span className={"pa-stand" + (gepackt === t.saetze.length ? " fertig" : "")}>{gepackt === t.saetze.length ? "Alles im Auto ✓" : `${gepackt} von ${t.saetze.length} eingeladen`}</span>}
                </div>
                {t.saetze.length === 0 && t.verkauf.length === 0
                  ? <div className="small pa-leer">Für diesen Tag muss nichts aus dem Lager mit.</div>
                  : satzZeilen(t)}
              </div>
            )}
            {!p.darfLager && t.verkauf.length > 0 && <div className="pa-abschnitt">{satzZeilen(t)}</div>}
            <div className="pa-abschnitt"><PacklisteBlock liste={t.liste} /></div>
            <div className="pa-auftraege">
              {t.auftraege.map((o) => (
                <button key={o.id} type="button" className="pa-auftrag" onClick={() => p.onOpenOrder(o.id)}>
                  {zeit(o) || "ohne Uhrzeit"} · {kundeName(o)} ›
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const tagListe = () => {
    const teile: React.ReactNode[] = [];
    let letzteKw: number | null = null;
    const mehrereWochen = new Set(tage.map((t) => t.kw)).size > 1;
    for (const t of tage) {
      if (mehrereWochen && t.kw !== letzteKw) {
        const n = tage.filter((x) => x.kw === t.kw).reduce((s, x) => s + x.auftraege.length, 0);
        const zusatz = wochenText(t.datum);
        teile.push(<div key={"kw" + t.kw} className="au-gruppe-kopf pa-woche"><span>KW {t.kw}</span><span className="small">{n} {n === 1 ? "Auftrag" : "Aufträge"}{zusatz ? " · " + zusatz : ""}</span></div>);
        letzteKw = t.kw;
      }
      teile.push(tagKarte(t));
    }
    return teile;
  };

  const lagerZeilen = nachPlatz(gesamt.saetze, (id) => platzVon(id));
  const maxLeistung = Math.max(1, ...gesamt.leistungen.map((l) => l.menge));

  return (
    <div className="tabpanel active">
      <div className="module-page pa-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Packliste</h2>
              <span className="lg-unter">Was muss wann mit – alle offenen Aufträge bis {Math.floor(PACKLISTE_HORIZONT_TAGE / 30)} Monate voraus</span>
            </div>
            <span className="pa-knoepfe">
              <button type="button" className="es-knopf" disabled={laedt || tage.length === 0} onClick={() => setDruck(true)}>Drucken</button>
              <button type="button" className="es-knopf" disabled={laedt || tage.length === 0} onClick={csvSpeichern}>CSV</button>
            </span>
          </div>
          <div className="pl-filter" role="group" aria-label="Zeitraum">
            {PACKLISTE_ZEITRAEUME.map((z) => (
              <button key={z.wert} type="button" className={"pl-pille" + (zeitraum === z.wert ? " aktiv" : "")} aria-pressed={zeitraum === z.wert}
                onClick={() => { setZeitraum(z.wert); setOffen(null); }}>{z.text}</button>
            ))}
          </div>
          <div className="pa-reihe">
            <div className="lg-lagerwahl ar-segment pa-segment" role="group" aria-label="Ansicht">
              <button type="button" className={ansicht === "tag" ? "aktiv" : ""} aria-pressed={ansicht === "tag"} onClick={() => setAnsicht("tag")}>Je Tag</button>
              <button type="button" className={ansicht === "gesamt" ? "aktiv" : ""} aria-pressed={ansicht === "gesamt"} onClick={() => setAnsicht("gesamt")}>Gesamt</button>
            </div>
            {(personen.length > 1 || ohneDa) && (
              <div className="pl-filter" role="group" aria-label="Mitarbeiter">
                <button type="button" className={"pl-pille" + (person === "alle" ? " aktiv" : "")} aria-pressed={person === "alle"} onClick={() => setPerson("alle")}>Alle</button>
                {personen.map((e) => (
                  <button key={e.id} type="button" className={"pl-pille" + (person === e.id ? " aktiv" : "")} aria-pressed={person === e.id} onClick={() => setPerson(e.id)}>
                    <span className="pl-punkt" style={{ background: employeeColorFor(p.employees, e.id) }} />{e.name}
                  </button>
                ))}
                {ohneDa && (
                  <button type="button" className={"pl-pille" + (person === "ohne" ? " aktiv" : "")} aria-pressed={person === "ohne"} onClick={() => setPerson("ohne")}>
                    <span className="pl-punkt" style={{ background: "var(--ohne-person-linie)" }} />Ohne Mitarbeiter
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pa-kacheln">
          <div className="pa-kachel"><b>{gesamt.auftraege}</b><span>{gesamt.auftraege === 1 ? "Auftrag" : "Aufträge"} an {tage.length} {tage.length === 1 ? "Tag" : "Tagen"}</span></div>
          {p.darfLager && (
            <div className="pa-kachel"><b>{saetzeGesamt}</b><span>{saetzeGesamt === 1 ? "Satz" : "Sätze"} aus dem Lager · {eingeladen} eingeladen</span>
              <span className="pa-balken"><i style={{ width: `${saetzeGesamt ? Math.round((eingeladen / saetzeGesamt) * 100) : 0}%` }} /></span></div>
          )}
          <div className="pa-kachel"><b>{verkaufStueck}</b><span>Verkaufsreifen reserviert</span></div>
          <div className="pa-kachel"><b>{gesamt.groessen.length}</b><span>{gesamt.groessen.length === 1 ? "Reifengröße" : "verschiedene Reifengrößen"}</span></div>
          <div className={"pa-kachel" + (gesamt.ohneGroesse > 0 ? " warn" : "")}><b>{gesamt.ohneGroesse}</b><span>{gesamt.ohneGroesse === 1 ? "Auftrag" : "Aufträge"} ohne Reifengröße</span></div>
        </div>

        {laedt && <div className="db-karte"><div className="db-leer">lädt …</div></div>}
        {!laedt && tage.length === 0 && (
          <div className="db-karte"><div className="db-leer">Im gewählten Zeitraum stehen keine offenen Aufträge.</div></div>
        )}

        {!laedt && tage.length > 0 && ansicht === "tag" && <div className="pa-tage">{tagListe()}</div>}

        {!laedt && tage.length > 0 && ansicht === "gesamt" && (
          <div className="pa-gesamt">
            {p.darfLager && (
              <div className="db-karte">
                <span className="db-karte-titel">Im Lager vorbereiten</span>
                <span className="small pa-unter">{lagerZeilen.length} {lagerZeilen.length === 1 ? "Satz" : "Sätze"}, nach Platz sortiert – einmal durchs Regal statt Tag für Tag suchen.</span>
                {lagerZeilen.length === 0 ? <div className="db-leer">Im Zeitraum muss nichts aus dem Lager mit.</div> : (
                  <div className="pa-tabelle-rolle">
                    <table className="pa-tabelle">
                      <thead><tr><th>Platz</th><th>Kunde</th><th>Termin</th><th className="pa-satz-spalte">Satz</th><th /></tr></thead>
                      <tbody>
                        {lagerZeilen.map((z, i) => {
                          const pl = platzVon(z.satz.storage_slot_id);
                          const neuesLager = p.warehouses.length > 1 && (i === 0 || platzVon(lagerZeilen[i - 1].satz.storage_slot_id).lager !== pl.lager);
                          return [
                            neuesLager ? <tr key={"l" + i} className="pa-lager"><td colSpan={5}>{pl.lager || "ohne Lager"}</td></tr> : null,
                            <tr key={z.satz.id + z.datum}>
                              <td><span className="db-platz">{pl.code}</span></td>
                              <td>{kundeName(z.auftrag)}</td>
                              <td>{datumKurz(z.datum)}{zeit(z.auftrag) ? " " + zeit(z.auftrag) : ""}</td>
                              <td className="small pa-satz-spalte">{satzText(z.satz)}</td>
                              <td>{istGepackt(z.satz.id, z.datum) ? <span className="pa-ok">eingeladen</span> : null}</td>
                            </tr>,
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <div className="pa-spalte">
              <div className="db-karte">
                <span className="db-karte-titel">Reifengrößen je Woche</span>
                <span className="small pa-unter">Autos je Größe – zum Vorbestellen.{gesamt.ohneGroesse > 0 ? ` Bei ${gesamt.ohneGroesse} ${gesamt.ohneGroesse === 1 ? "Auftrag" : "Aufträgen"} ist keine Größe bekannt.` : ""}</span>
                {gesamt.groessen.length === 0 ? <div className="db-leer">Keine Reifengröße bekannt.</div> : (
                  <div className="pa-tabelle-rolle">
                    <table className="pa-tabelle">
                      <thead><tr><th>Größe</th>{gesamt.wochen.map((w) => <th key={w} className="z">KW {w}</th>)}<th className="z">Summe</th></tr></thead>
                      <tbody>
                        {gesamt.groessen.map((g) => (
                          <tr key={g.groesse}>
                            <td><b>{g.groesse}</b></td>
                            {gesamt.wochen.map((w) => <td key={w} className="z">{g.jeWoche[w] ? <span className="pa-zelle">{g.jeWoche[w]}</span> : <span className="pa-null">–</span>}</td>)}
                            <td className="z"><b>{g.summe}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="db-karte">
                <span className="db-karte-titel">Leistungen im Zeitraum</span>
                {gesamt.leistungen.length === 0 ? <div className="db-leer">Noch keine Leistungen eingetragen.</div> : (
                  <div className="pa-leistungen">
                    {gesamt.leistungen.map((l) => (
                      <div key={l.name} className="pa-leistung">
                        <span>{l.name}</span>
                        <span className="pa-leistung-balken"><i style={{ width: `${(l.menge / maxLeistung) * 100}%` }} /><b>{l.menge.toLocaleString("de-DE")}</b></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {gesamt.verkauf.length > 0 && (
                <div className="db-karte">
                  <span className="db-karte-titel">Verkaufsreifen reserviert</span>
                  <span className="small pa-unter">Am Auftrag gebucht, liegen im Verkaufslager.</span>
                  <div className="pa-tabelle-rolle">
                    <table className="pa-tabelle">
                      <tbody>
                        {gesamt.verkauf.map((v) => (
                          <tr key={v.position.id}>
                            <td>{v.reifen?.storage_slot_id ? <span className="db-platz pa-platz-vk">{platzText(v.reifen.storage_slot_id)}</span> : "–"}</td>
                            <td>{v.position.quantity}× {reifenText(v.reifen)}</td>
                            <td>{kundeName(v.auftrag)}</td>
                            <td>{datumKurz(v.datum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {druck && (
        <Blatt titel="Packliste drucken" unter={`${datumKurz(spanne.von)}${spanne.bis !== spanne.von ? ` – ${datumKurz(spanne.bis)}` : ""}`} breite="dokument" ebene="druck-fenster modal-rechnung"
          onClose={() => setDruck(false)}
          fuss={<button type="button" className="btn-primary" onClick={() => window.print()}>Drucken / als PDF sichern</button>}>
          <style>{RECHNUNG_SEITE_CSS}</style>
          <div className="druckbogen pa-dokument">
            <h1>Packliste {datumKurz(spanne.von)}{spanne.bis !== spanne.von ? ` – ${datumKurz(spanne.bis)}` : ""}</h1>
            {tage.map((t) => (
              <section key={t.datum} className="pa-druck-tag">
                <h2>{tagTitel(t.datum)} · {t.auftraege.length} {t.auftraege.length === 1 ? "Auftrag" : "Aufträge"}</h2>
                {(p.darfLager && t.saetze.length > 0) || t.verkauf.length > 0 ? (
                  <table className="zn-tabelle">
                    <tbody>
                      {p.darfLager && t.saetze.map((s) => (
                        <tr key={s.satz.id}><td className="pa-kaestchen">{istGepackt(s.satz.id, t.datum) ? "☑" : "☐"}</td><td>{zeit(s.auftrag)}</td><td>{kundeName(s.auftrag)}</td><td>{satzText(s.satz)}</td><td><b>{platzText(s.satz.storage_slot_id)}</b></td></tr>
                      ))}
                      {t.verkauf.map((v) => (
                        <tr key={v.position.id}><td className="pa-kaestchen">☐</td><td>{zeit(v.auftrag)}</td><td>{kundeName(v.auftrag)}</td><td>{v.position.quantity}× {reifenText(v.reifen)}</td><td><b>{v.reifen ? platzText(v.reifen.storage_slot_id) : ""}</b></td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                <p><b>Leistungen:</b> {t.liste.leistungen.map((l) => `${l.menge}× ${l.name}`).join(" · ") || "keine eingetragen"}</p>
                <p><b>Reifengrößen:</b> {t.liste.groessen.map((g) => `${g.autos}× ${g.groesse}`).join(" · ") || "keine bekannt"}{t.liste.ohneGroesse > 0 ? ` · ${t.liste.ohneGroesse} ohne Größe` : ""}</p>
              </section>
            ))}
          </div>
        </Blatt>
      )}
    </div>
  );
}

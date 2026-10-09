import { useRef, useState } from "react";
import type { Customer, Employee, Order } from "@/lib/types";
import { addDays, employeeColorFor, isoWeekNumber, startOfWeekMonday, toDateStr } from "@/lib/calendar";
import { todayStr } from "@/lib/helpers";
import { wischRichtung } from "@/lib/wischen";
import { Blatt } from "@/components/Blatt";
import { Stundenraster } from "@/components/einsatzplanung/Stundenraster";

// Termin aus dem Kalender wählen (v138, Wunsch Vitali 09.10.2026): Ein Tipp auf den Termin oben im
// Auftragsfenster öffnet den Monat der Einsatzplanung – blättern mit ‹ › oder Wischen, Tag antippen,
// im Tagesplan in die Uhrzeit tippen (wie beim Anlegen aus dem Kalender), „Fertig“ übernimmt Tag und
// Uhrzeit in den Auftrag. Gespeichert wird wie jede andere Angabe erst mit „Auftrag anlegen“ bzw.
// „Speichern“ – das Blatt ändert nur den Entwurf (ein Fenster, ein Speicherpunkt).
//
// Die anderen Termine stehen als Punkte im Monat und als Blöcke im Tagesplan, damit man sieht, wo
// schon etwas liegt. Der eigene Termin erscheint im Tagesplan an der gewählten Stelle.
// Ebene 10002 (`modal-bestaetigung`): Es geht aus dem Auftragsfenster (10001) heraus auf.

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export type TerminWahl = { datum: string; von: string | null; bis: string | null };

function minuten(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function hhmm(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function terminWahlText(w: TerminWahl): string {
  const d = new Date(`${w.datum}T12:00:00`);
  const tag = `${WT_LANG[d.getDay()].slice(0, 2)} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  if (!w.von) return `${tag} · ohne Uhrzeit`;
  return `${tag} · ${w.von}${w.bis ? ` – ${w.bis}` : ""} Uhr`;
}

export function TerminWahlBlatt({ order, start, auftraege, zuordnungen, customers, employees, terminIntervallMin, onUebernehmen, onClose }: {
  // Der Auftrag, um den es geht (er steht im Tagesplan an der gewählten Stelle, nicht an der alten).
  order: Order;
  // Was gerade im Entwurf steht.
  start: TerminWahl;
  auftraege: Order[];
  zuordnungen: Record<string, string[]>;
  customers: Customer[];
  employees: Employee[];
  terminIntervallMin: number;
  onUebernehmen: (w: TerminWahl) => void;
  onClose: () => void;
}) {
  const startDatum = new Date(`${start.datum || todayStr()}T12:00:00`);
  const [monat, setMonat] = useState(() => new Date(startDatum.getFullYear(), startDatum.getMonth(), 1));
  // Erst der Monat, dann der Tag (Wunsch: „dann sehe ich gleich die Tage“).
  const [tag, setTag] = useState<string | null>(null);
  const [von, setVon] = useState<string>(start.von || "");
  const [bis, setBis] = useState<string>(start.bis || "");
  const heute = todayStr();
  const andere = auftraege.filter((o) => o.id !== order.id && !o.deleted_at && o.status !== "storniert");

  // Das Raster des Monats wie in der Einsatzplanung: Mo–So, mit Kalenderwoche.
  const monatsEnde = new Date(monat.getFullYear(), monat.getMonth() + 1, 0);
  const rasterStart = startOfWeekMonday(monat);
  const rasterEnde = addDays(monatsEnde, 6 - ((monatsEnde.getDay() + 6) % 7));
  const wochen: { kw: number; tage: Date[] }[] = [];
  for (let d = rasterStart; d <= rasterEnde; d = addDays(d, 7)) {
    const tage = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    wochen.push({ kw: isoWeekNumber(tage[0]), tage });
  }

  function monatBlaettern(schritt: number) {
    setMonat(new Date(monat.getFullYear(), monat.getMonth() + schritt, 1));
  }
  function tagBlaettern(schritt: number) {
    if (!tag) return;
    const neu = toDateStr(addDays(new Date(`${tag}T12:00:00`), schritt));
    setTag(neu);
    setMonat(new Date(Number(neu.slice(0, 4)), Number(neu.slice(5, 7)) - 1, 1));
  }
  function tagWaehlen(ds: string) {
    setTag(ds);
  }

  // Wischen im Monat: links = weiter, rechts = zurück (dieselbe Regel wie in der Einsatzplanung).
  const wisch = useRef<{ x: number; y: number; t: number; erste: number | null } | null>(null);
  function wischAuf(e: React.TouchEvent) {
    if (e.touches.length !== 1) { wisch.current = null; return; }
    wisch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, erste: null };
  }
  function wischZieht(e: React.TouchEvent) {
    const w = wisch.current;
    if (!w || e.touches.length !== 1) { wisch.current = null; return; }
    if (w.erste === null && Math.hypot(e.touches[0].clientX - w.x, e.touches[0].clientY - w.y) > 10) w.erste = e.timeStamp - w.t;
  }
  function wischAb(e: React.TouchEvent) {
    const w = wisch.current;
    wisch.current = null;
    if (!w || e.changedTouches.length !== 1) return;
    const f = e.changedTouches[0];
    const r = wischRichtung({ dx: f.clientX - w.x, dy: f.clientY - w.y, dauerMs: e.timeStamp - w.t, ersteBewegungMs: w.erste });
    if (r !== 0) monatBlaettern(r);
  }

  // In den Tagesplan getippt: Beginn dort, Ende aus dem Raster bzw. Beginn + Terminraster.
  function zeitGewaehlt(datum: string, a: string | null, b: string | null) {
    setTag(datum);
    if (!a) { setVon(""); setBis(""); return; }
    setVon(a);
    const s = minuten(a);
    setBis(b || (s !== null ? hhmm(s + terminIntervallMin) : ""));
  }
  function vonAendern(neu: string) {
    const altS = minuten(von), altE = minuten(bis), s = minuten(neu);
    setVon(neu);
    // Das Ende wandert mit, die Dauer bleibt.
    if (s !== null) setBis(hhmm(s + (altS !== null && altE !== null && altE > altS ? altE - altS : terminIntervallMin)));
  }

  const vonOk = !von || minuten(von) !== null;
  const bisOk = !bis || (minuten(bis) !== null && (minuten(bis) as number) > (minuten(von) ?? -1));
  const wahl: TerminWahl | null = tag && vonOk && bisOk ? { datum: tag, von: von || null, bis: von && bis ? bis : null } : null;

  // Der eigene Termin im Tagesplan an der gewählten Stelle.
  const eigener: Order[] = tag ? [{ ...order, order_date: tag, time: von || null, end_time: von && bis ? bis : null, status: "offen" }] : [];
  const tagDatum = tag ? new Date(`${tag}T12:00:00`) : null;

  return (
    <Blatt titel="Termin wählen" unter={tag ? undefined : "Tag antippen – danach die Uhrzeit"} breite="breit" ebene="modal-bestaetigung tw-ebene"
      className="tw-blatt" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={tag ? () => setTag(null) : onClose}>{tag ? "‹ Monat" : "Abbrechen"}</button>
        <button type="button" className="btn-primary" disabled={!wahl} onClick={() => { if (wahl) { onUebernehmen(wahl); onClose(); } }}>Fertig</button>
      </>}>
      {!tag ? (
        <>
          <div className="tw-nav">
            <button type="button" onClick={() => monatBlaettern(-1)} aria-label="Monat zurück">‹</button>
            <b>{MONATE[monat.getMonth()]} {monat.getFullYear()}</b>
            <button type="button" onClick={() => monatBlaettern(1)} aria-label="Monat vor">›</button>
          </div>
          <div className="monat-karte tw-monat" onTouchStart={wischAuf} onTouchMove={wischZieht} onTouchEnd={wischAb}
            onTouchCancel={() => { wisch.current = null; }}>
            <div className="monat-reihe monat-kopf">
              <span className="monat-kw-kopf">KW</span>
              {["MO", "DI", "MI", "DO", "FR", "SA", "SO"].map((d, i) => <span key={d} className={"monat-wt" + (i > 4 ? " wochenende" : "")}>{d}</span>)}
            </div>
            {wochen.map((w) => (
              <div className="monat-reihe" key={toDateStr(w.tage[0])}>
                <span className="monat-kw tw-kw">{w.kw}</span>
                {w.tage.map((d, i) => {
                  const ds = toDateStr(d);
                  const imMonat = d.getMonth() === monat.getMonth();
                  const amTag = andere.filter((o) => o.order_date === ds);
                  const leute = Array.from(new Set(amTag.flatMap((o) => zuordnungen[o.id] || [])));
                  const ohne = amTag.some((o) => (zuordnungen[o.id] || []).length === 0);
                  return (
                    <button type="button" key={ds}
                      className={"monat-tag" + (imMonat ? "" : " aussen") + (ds === heute ? " heute" : "") + (ds === start.datum ? " gewaehlt" : "") + (i > 4 ? " wochenende" : "")}
                      onClick={() => tagWaehlen(ds)}
                      aria-label={`${d.getDate()}. ${MONATE[d.getMonth()]}, ${amTag.length} Termine – Tag wählen`}>
                      <span className="monat-zahl">{d.getDate()}</span>
                      <span className="monat-punkte">
                        {leute.slice(0, 4).map((id) => <span key={id} style={{ background: employeeColorFor(employees, id) }} />)}
                        {ohne && <span className="ohne" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="bl-hilfe">Die Punkte sind schon geplante Termine (Farbe = Mitarbeiter, grau = noch niemand eingeteilt).</p>
        </>
      ) : (
        <>
          <div className="tw-nav">
            <button type="button" onClick={() => tagBlaettern(-1)} aria-label="Tag zurück">‹</button>
            <b>{tagDatum ? `${WT_LANG[tagDatum.getDay()]}, ${tagDatum.getDate()}. ${MONATE[tagDatum.getMonth()]} ${tagDatum.getFullYear()}` : ""}</b>
            <button type="button" onClick={() => tagBlaettern(1)} aria-label="Tag vor">›</button>
          </div>
          <div className="tw-wahl">
            <label className="nk-feld"><span>Von</span><input type="time" value={von} onChange={(e) => vonAendern(e.target.value)} aria-label="Von" /></label>
            <label className="nk-feld"><span>Bis</span><input type="time" value={bis} disabled={!von} onChange={(e) => setBis(e.target.value)} aria-label="Bis" /></label>
          </div>
          <p className="bl-hilfe">
            {von ? (bisOk ? terminWahlText({ datum: tag, von, bis: bis || null }) : "„Bis“ muss nach „Von“ liegen.") : "In den Tagesplan tippen – dort, wo der Termin beginnen soll."}
          </p>
          <div className="tw-raster">
            <Stundenraster
              tage={[new Date(`${tag}T12:00:00`)]}
              auftraege={[...andere.filter((o) => o.order_date === tag), ...eigener]}
              customers={customers}
              employees={employees}
              orderEmployees={zuordnungen}
              standardDauerMin={terminIntervallMin}
              onOeffnen={() => {}}
              onSlot={zeitGewaehlt}
            />
          </div>
        </>
      )}
    </Blatt>
  );
}

"use client";

import { useState } from "react";
import type { Employee, Verfuegbarkeit } from "@/lib/types";
import { addDays, employeeColorFor, startOfWeekMonday, toDateStr } from "@/lib/calendar";
import {
  VERFUEGBARKEIT_FENSTER_VORGABE, VERFUEGBARKEIT_ZEITEN, eintragAm, fensterText, fensterVon, vorlageTage, type Fenster,
} from "@/lib/verfuegbarkeit";

// Der Reiter „Verfügbarkeit" in der Einsatzplanung (Migration 68, v112).
//
// Zwei Gesichter:
//   - „Meine Verfügbarkeit" (wer nur sich selbst sieht, meist ein Techniker): ein Monat. Ein Tipp
//     auf einen leeren Tag heißt „ganzer Tag", ein zweiter öffnet das Blatt mit Zeitfenster und
//     Austragen. „Vorlage …" trägt dieselben Wochentage für einen Zeitraum ein.
//   - „Wer hat wann Zeit?" (mit `einsatzplanung.verfuegbarkeit · lesen`, Vorgabe Admin): eine
//     Woche, eine Zeile je Mitarbeiter. Mit „· schreiben" trägt man per Tipp für andere ein – auch
//     für Mitarbeiter ohne eigenen Zugang.
// Geblättert wird oben in der Bedienleiste der Einsatzplanung, wie in Monat und Woche.
//
// Ob jemand etwas darf, entscheidet die Datenbank (`verfuegbarkeit_pruefen()`); hier werden nur
// Knöpfe weggelassen, die ohnehin abgelehnt würden.

type TagBlatt = { art: "tag"; employeeId: string; datum: string; wahl: "ganz" | "fenster" | "aus"; von: string; bis: string; hatte: boolean };
type VorlageBlatt = { art: "vorlage"; employeeId: string; wt: boolean[]; ab: string; bis: string; wahl: "ganz" | "fenster"; von: string; bisZeit: string };

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function kurz(ds: string): string {
  const d = new Date(ds + "T12:00:00");
  return `${WT[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
function zelleText(v: Verfuegbarkeit | null): string {
  if (!v) return "";
  return fensterVon(v) ? fensterText(v) : "✓";
}

export function VerfuegbarkeitAnsicht({
  modus, monat, wochenStart, heute, employees, ich, eintraege, eingeplant, darfFuerAndere, meineTermine, luecken,
  onSetzen, onAustragen, onVorlage,
}: {
  modus: "eigen" | "alle";
  monat: Date;
  wochenStart: Date;
  heute: string;
  // Bei „alle" alle Mitarbeiter, bei „eigen" egal – dort zählt nur `ich`.
  employees: Employee[];
  ich: Employee | null;
  eintraege: Verfuegbarkeit[];
  // Wie viele Termine hat dieser Mitarbeiter an diesem Tag schon?
  eingeplant: (employeeId: string, datum: string) => number;
  // Darf für andere und für vergangene Tage eintragen (`einsatzplanung.verfuegbarkeit · schreiben`).
  darfFuerAndere: boolean;
  // „Schon eingeplant" unter dem eigenen Monat: kommende Termine als fertige Zeile.
  meineTermine: { datum: string; text: string }[];
  // Termine dieser Woche, bei denen jemand eingeplant ist, der sich nicht eingetragen hat.
  luecken: string[];
  onSetzen: (employeeId: string, datum: string, fenster: Fenster) => Promise<void>;
  onAustragen: (employeeId: string, datum: string) => Promise<void>;
  onVorlage: (employeeId: string, tage: string[], fenster: Fenster) => Promise<void>;
}) {
  const [blatt, setBlatt] = useState<TagBlatt | VorlageBlatt | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const darfAendern = (employeeId: string, datum: string) =>
    darfFuerAndere || (!!ich && ich.id === employeeId && datum >= heute);

  function tagOeffnen(employeeId: string, datum: string) {
    const v = eintragAm(eintraege, employeeId, datum);
    const f = v ? fensterVon(v) : null;
    setBlatt({
      art: "tag", employeeId, datum, wahl: v ? (f ? "fenster" : "ganz") : "ganz",
      von: f?.von ?? VERFUEGBARKEIT_FENSTER_VORGABE.von, bis: f?.bis ?? VERFUEGBARKEIT_FENSTER_VORGABE.bis, hatte: !!v,
    });
  }
  async function eigenenTagAntippen(datum: string) {
    if (!ich) return;
    if (!darfAendern(ich.id, datum)) { setMeldung("Vergangene Tage lassen sich nicht mehr ändern."); return; }
    if (eintragAm(eintraege, ich.id, datum)) { tagOeffnen(ich.id, datum); return; }
    setLaeuft(true);
    try {
      await onSetzen(ich.id, datum, null);
      setMeldung(`${kurz(datum)} eingetragen: ganzer Tag – nochmal tippen für ein Zeitfenster.`);
    } finally { setLaeuft(false); }
  }
  async function blattSpeichern() {
    if (!blatt) return;
    setLaeuft(true);
    try {
      if (blatt.art === "tag") {
        if (blatt.wahl === "aus") { if (blatt.hatte) await onAustragen(blatt.employeeId, blatt.datum); }
        else await onSetzen(blatt.employeeId, blatt.datum, blatt.wahl === "ganz" ? null : { von: blatt.von, bis: blatt.bis });
        setMeldung(`${kurz(blatt.datum)} ${blatt.wahl === "aus" ? "ausgetragen" : "gespeichert"}.`);
      } else {
        const tage = vorlageTageFuer(blatt);
        await onVorlage(blatt.employeeId, tage, blatt.wahl === "ganz" ? null : { von: blatt.von, bis: blatt.bisZeit });
        setMeldung(`${tage.length} ${tage.length === 1 ? "Tag" : "Tage"} eingetragen.`);
      }
      setBlatt(null);
    } finally { setLaeuft(false); }
  }
  function vorlageTageFuer(b: VorlageBlatt): string[] {
    const vorhanden = new Set(eintraege.filter((v) => v.employee_id === b.employeeId).map((v) => v.datum));
    return vorlageTage(b.ab, b.bis, b.wt, darfFuerAndere ? b.ab : heute, vorhanden);
  }
  function vorlageOeffnen(employeeId: string) {
    const ende = new Date(monat.getFullYear(), monat.getMonth() + 1, 0);
    setBlatt({ art: "vorlage", employeeId, wt: [true, true, true, true, true, false, false],
      ab: heute > toDateStr(monat) ? heute : toDateStr(monat), bis: toDateStr(ende), wahl: "ganz",
      von: VERFUEGBARKEIT_FENSTER_VORGABE.von, bisZeit: VERFUEGBARKEIT_FENSTER_VORGABE.bis });
  }

  // ------------------------------------------------------------------ Meine Verfügbarkeit (Monat)
  function eigenerMonat() {
    if (!ich) {
      return (
        <div className="db-karte vf-karte">
          <span className="small">Dein Zugang ist mit keinem Mitarbeiter verknüpft. Das richtet der Admin unter Admin › Mitarbeiter ein – danach kannst du hier deine Tage eintragen.</span>
        </div>
      );
    }
    const start = startOfWeekMonday(monat);
    const ende = new Date(monat.getFullYear(), monat.getMonth() + 1, 0);
    const tage: Date[] = [];
    for (let d = start; d <= ende || (d.getDay() + 6) % 7 !== 0; d = addDays(d, 1)) tage.push(d);
    return (
      <>
        <div className="db-karte vf-karte">
          <div className="vf-kopf">
            <span className="vf-titel">
              <b>Meine Verfügbarkeit</b>
              <span className="small">{ich.name} · Tage antippen, an denen du Zeit hast</span>
            </span>
            <button type="button" className="es-knopf" onClick={() => vorlageOeffnen(ich.id)}>Vorlage …</button>
          </div>
          <div className="vf-wt">{WT.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="vf-gitter">
            {tage.map((d) => {
              const ds = toDateStr(d);
              if (d.getMonth() !== monat.getMonth()) return <span key={ds} className="vf-tag leer" />;
              const v = eintragAm(eintraege, ich.id, ds);
              const n = eingeplant(ich.id, ds);
              const kl = ["vf-tag", v ? (fensterVon(v) ? "fenster" : "ganz") : "", ds < heute ? "vorbei" : "", ds === heute ? "heute" : "", (d.getDay() + 6) % 7 > 4 ? "we" : ""].filter(Boolean).join(" ");
              return (
                <button key={ds} type="button" className={kl} disabled={laeuft}
                  aria-label={`${d.getDate()}., ${v ? fensterText(v) : "nichts eingetragen"}${n ? `, ${n} Termine` : ""}`}
                  onClick={() => void eigenenTagAntippen(ds)}>
                  <span className="vf-nr">{d.getDate()}</span>
                  {v && <span className="vf-was">{zelleText(v)}</span>}
                  {n > 0 && !v && <span className="vf-warn" title="eingeplant, aber nicht eingetragen">!</span>}
                  {n > 0 && <span className="vf-eingeplant">{Array.from({ length: Math.min(n, 3) }, (_, i) => <i key={i} />)}</span>}
                </button>
              );
            })}
          </div>
          <Legende eigen />
          {meldung && <span className="small vf-meldung" role="status">{meldung}</span>}
        </div>
        <div className="db-karte vf-karte">
          <div className="vf-kopf"><b>Schon eingeplant</b><span className="small">{meineTermine.length} {meineTermine.length === 1 ? "Termin" : "Termine"}</span></div>
          {meineTermine.length === 0
            ? <span className="small">Noch keine kommenden Termine.</span>
            : meineTermine.map((t, i) => <span key={i} className="vf-termin"><b>{kurz(t.datum)}</b> · {t.text}</span>)}
          <span className="small vf-hinweis">Was du hier einträgst, sieht nur das Büro. Andere Techniker sehen deine Tage nicht.</span>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------ Wer hat wann Zeit? (Woche)
  function alleWoche() {
    const tage = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(wochenStart, i)));
    return (
      <>
        <div className="db-karte vf-karte">
          <div className="vf-kopf">
            <span className="vf-titel">
              <b>Wer hat wann Zeit?</b>
              <span className="small">{darfFuerAndere ? "Zelle antippen zum Eintragen oder Ändern" : "Nur ansehen – eintragen kann jeder für sich"}</span>
            </span>
            {darfFuerAndere && employees.length > 0 && (
              <button type="button" className="es-knopf" onClick={() => vorlageOeffnen(employees[0].id)}>Vorlage …</button>
            )}
          </div>
          {employees.length === 0 ? (
            <span className="small">Noch keine Mitarbeiter angelegt (Admin → Mitarbeiter).</span>
          ) : (
            <div className="vf-matrix">
              <span />
              {tage.map((ds) => {
                const d = new Date(ds + "T12:00:00");
                return <span key={ds} className={"vf-mk" + (ds === heute ? " heute" : "")}>{WT[(d.getDay() + 6) % 7]}<br />{d.getDate()}.</span>;
              })}
              {employees.map((e) => (
                <Zeile key={e.id} e={e} employees={employees} tage={tage} eintraege={eintraege} heute={heute}
                  eingeplant={eingeplant} darf={darfAendern} onTippen={tagOeffnen} />
              ))}
              <span className="vf-name small">frei</span>
              {tage.map((ds) => {
                const n = employees.filter((e) => eintragAm(eintraege, e.id, ds)).length;
                return <span key={ds} className={"vf-summe" + (n ? "" : " null")}>{n}</span>;
              })}
            </div>
          )}
          <Legende />
          {meldung && <span className="small vf-meldung" role="status">{meldung}</span>}
        </div>
        {luecken.length > 0 && (
          <div className="doppelbuchung" role="status">
            <b>Eingeplant, aber nicht eingetragen:</b>
            <ul>{luecken.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}
        {employees.some((e) => !e.profile_id) && darfFuerAndere && (
          <span className="small vf-hinweis">„ohne Zugang“: Dieser Mitarbeiter kann sich nicht selbst eintragen – seine Tage trägst du für ihn ein.</span>
        )}
      </>
    );
  }

  // ------------------------------------------------------------------ Blätter
  function tagBlatt(b: TagBlatt) {
    const wer = employees.find((e) => e.id === b.employeeId) ?? ich;
    const fremd = !ich || ich.id !== b.employeeId;
    const n = eingeplant(b.employeeId, b.datum);
    const d = new Date(b.datum + "T12:00:00");
    const vorname = (wer?.name ?? "").split(" ")[0];
    return (
      <>
        <div className="ab-titel">{WT_LANG[d.getDay()]}, {d.getDate()}.{d.getMonth() + 1}.</div>
        <span className="small vf-unter">{fremd ? <>Du trägst für <b>{wer?.name}</b> ein.</> : "Wann hast du an diesem Tag Zeit?"}</span>
        <div className="vf-wahl">
          {([["ganz", "Ganzer Tag", "Kann jederzeit eingeplant werden."], ["fenster", "Nur ein Zeitfenster", "Zum Beispiel nur vormittags."],
            ["aus", b.hatte ? "Austragen" : "Keine Zeit", "Der Tag steht dann wieder auf „nichts eingetragen“."]] as const).map(([w, t, u]) => (
            <label key={w} className={b.wahl === w ? "an" : ""}>
              <input type="radio" name="vf-wahl" checked={b.wahl === w} onChange={() => setBlatt({ ...b, wahl: w })} />
              <span><b>{t}</b><span className="small">{u}</span></span>
            </label>
          ))}
        </div>
        {b.wahl === "fenster" && (
          <div className="vf-zeiten">
            <select aria-label="von" value={b.von} onChange={(e) => setBlatt({ ...b, von: e.target.value })}>
              {VERFUEGBARKEIT_ZEITEN.slice(0, -1).map((z) => <option key={z}>{z}</option>)}
            </select>
            <span>bis</span>
            <select aria-label="bis" value={b.bis} onChange={(e) => setBlatt({ ...b, bis: e.target.value })}>
              {VERFUEGBARKEIT_ZEITEN.slice(1).map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
        )}
        {b.wahl === "fenster" && b.bis <= b.von && <div className="hinweis-pflicht">Das Ende muss nach dem Anfang liegen.</div>}
        {b.wahl === "aus" && n > 0 && (
          <div className="hinweis-pflicht">
            {fremd ? `${vorname} ist` : "Du bist"} an diesem Tag schon für {n} {n === 1 ? "Termin" : "Termine"} eingeplant.
            Austragen geht trotzdem – {fremd ? "der Termin bekommt im Kalender eine Warnmarke." : "das Büro sieht dann eine Warnmarke. Ruf am besten kurz an."}
          </div>
        )}
        {b.wahl === "fenster" && n > 0 && (
          <span className="small vf-achtung">An diesem Tag {fremd ? `ist ${vorname}` : "bist du"} schon eingeplant – liegt der Termin im Zeitfenster?</span>
        )}
        <div className="vf-fuss">
          <button type="button" className="btn-secondary btn-rand" onClick={() => setBlatt(null)} disabled={laeuft}>Abbrechen</button>
          <button type="button" className="btn-primary" onClick={() => void blattSpeichern()}
            disabled={laeuft || (b.wahl === "fenster" && b.bis <= b.von) || (b.wahl === "aus" && !b.hatte)}>
            {laeuft ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </>
    );
  }
  function vorlageBlatt(b: VorlageBlatt) {
    const tage = vorlageTageFuer(b);
    return (
      <>
        <div className="ab-titel">Vorlage: jede Woche</div>
        <span className="small vf-unter">Trägt dieselben Wochentage für einen ganzen Zeitraum ein. Was schon eingetragen ist, bleibt.</span>
        {modus === "alle" && (
          <label className="nk-feld"><span>Für</span>
            <select value={b.employeeId} onChange={(e) => setBlatt({ ...b, employeeId: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        <div className="vf-wtage" role="group" aria-label="Wochentage">
          {WT.map((w, i) => (
            <button key={w} type="button" className={b.wt[i] ? "an" : ""} aria-pressed={b.wt[i]}
              onClick={() => setBlatt({ ...b, wt: b.wt.map((x, j) => (j === i ? !x : x)) })}>{w}</button>
          ))}
        </div>
        <div className="vf-reihe">
          <label className="nk-feld"><span>ab</span><input type="date" value={b.ab} onChange={(e) => setBlatt({ ...b, ab: e.target.value })} /></label>
          <label className="nk-feld"><span>bis</span><input type="date" value={b.bis} onChange={(e) => setBlatt({ ...b, bis: e.target.value })} /></label>
        </div>
        <div className="vf-wahl">
          {([["ganz", "Ganzer Tag"], ["fenster", "Nur ein Zeitfenster"]] as const).map(([w, t]) => (
            <label key={w} className={b.wahl === w ? "an" : ""}>
              <input type="radio" name="vf-vwahl" checked={b.wahl === w} onChange={() => setBlatt({ ...b, wahl: w })} />
              <span><b>{t}</b></span>
            </label>
          ))}
        </div>
        {b.wahl === "fenster" && (
          <div className="vf-zeiten">
            <select aria-label="von" value={b.von} onChange={(e) => setBlatt({ ...b, von: e.target.value })}>
              {VERFUEGBARKEIT_ZEITEN.slice(0, -1).map((z) => <option key={z}>{z}</option>)}
            </select>
            <span>bis</span>
            <select aria-label="bis" value={b.bisZeit} onChange={(e) => setBlatt({ ...b, bisZeit: e.target.value })}>
              {VERFUEGBARKEIT_ZEITEN.slice(1).map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
        )}
        <div className="vf-fuss">
          <button type="button" className="btn-secondary btn-rand" onClick={() => setBlatt(null)} disabled={laeuft}>Abbrechen</button>
          <button type="button" className="btn-primary" onClick={() => void blattSpeichern()}
            disabled={laeuft || tage.length === 0 || (b.wahl === "fenster" && b.bisZeit <= b.von)}>
            {laeuft ? "Trägt ein …" : `${tage.length} ${tage.length === 1 ? "Tag" : "Tage"} eintragen`}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="vf-flaeche">
      {modus === "eigen" ? eigenerMonat() : alleWoche()}
      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => { if (!laeuft) setBlatt(null); }}>
          <div className="auswahl-blatt vf-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={blatt.art === "tag" ? "Verfügbarkeit an diesem Tag" : "Vorlage"}>
            <div className="ab-griff" />
            {blatt.art === "tag" ? tagBlatt(blatt) : vorlageBlatt(blatt)}
          </div>
        </div>
      )}
    </div>
  );
}

function Zeile({ e, employees, tage, eintraege, heute, eingeplant, darf, onTippen }: {
  e: Employee; employees: Employee[]; tage: string[]; eintraege: Verfuegbarkeit[]; heute: string;
  eingeplant: (employeeId: string, datum: string) => number;
  darf: (employeeId: string, datum: string) => boolean;
  onTippen: (employeeId: string, datum: string) => void;
}) {
  return (
    <>
      <span className="vf-name">
        <i style={{ background: employeeColorFor(employees, e.id) }} />
        <span>{e.name.split(" ")[0]}{!e.profile_id && <small>ohne Zugang</small>}</span>
      </span>
      {tage.map((ds) => {
        const v = eintragAm(eintraege, e.id, ds);
        const n = eingeplant(e.id, ds);
        const kl = ["vf-zelle", v ? (fensterVon(v) ? "fenster" : "ganz") : "", ds < heute ? "vorbei" : "", n > 0 && !v ? "konflikt" : ""].filter(Boolean).join(" ");
        return (
          <button key={ds} type="button" className={kl} disabled={!darf(e.id, ds)}
            title={`${e.name}: ${v ? fensterText(v) : "nichts eingetragen"}${n ? ` · ${n} ${n === 1 ? "Termin" : "Termine"}` : ""}`}
            onClick={() => onTippen(e.id, ds)}>
            {v ? zelleText(v) : n > 0 ? "!" : ""}
            {n > 0 && <span className="vf-dot" />}
          </button>
        );
      })}
    </>
  );
}

function Legende({ eigen = false }: { eigen?: boolean }) {
  return (
    <div className="vf-legende">
      <span><i className="ganz" />ganzer Tag</span>
      <span><i className="fenster" />Zeitfenster</span>
      <span><i className="leer" />nichts eingetragen</span>
      {eigen ? <span><i className="punkt" />eingeplant</span> : <span><i className="konflikt" />eingeplant, aber nicht eingetragen</span>}
    </div>
  );
}

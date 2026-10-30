"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useBetrieb, useFinBelege, useFinLieferanten, useFinPlan, useFinRechnungen, useFinUst } from "@/lib/queries/hooks";
import { finPlanAusVorjahr, finPlanSetzen } from "@/lib/api/finance";
import { FIN_BWA_KOSTEN, MONATSNAMEN, abweichung, bwa, type BwaWerte, type FinSaldo } from "@/lib/finance/auswertungen";
import { kontoNr, type FinKonto } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { cockpit, naechsteUst } from "@/lib/finance/cockpit";
import { planAlsSalden, planEingabe, planIst, planMonate, planVerteilen, type FinPlanWert } from "@/lib/finance/plan";
import { FIN_OP_STUFEN, opAnalyse, opPosten } from "@/lib/finance/opanalyse";
import { csv } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { formatEUR } from "@/lib/format";
import { KontoWahl } from "./FinanceBuchungen";
import { BerichtDruck, type BerichtZeile } from "./BerichtDruck";

// Finance › Auswertungen, Stufe G (v186): Cockpit, Plan und Ist (Migration 115), offene Posten nach Fälligkeit – und jede
// Auswertung als PDF (BerichtDruck). Alles lesend außer der Planpflege (Recht „Auswertungen und Abschluss“ schreiben).

export type AuswertungZiel = "salden" | "bwa" | "plan" | "op" | "liq";

// Die BWA-Zeilen in der Reihenfolge der Auswertung – für Plan/Ist und den Druck der BWA.
export const BWA_ZEILEN: [string, (w: BwaWerte) => number, "fett" | "" | "leise"][] = [
  ["Umsatzerlöse", (w) => w.umsatz, ""],
  [FIN_BWA_KOSTEN[0].text, (w) => w.material, ""],
  ["Rohertrag", (w) => w.rohertrag, "fett"],
  ...FIN_BWA_KOSTEN.slice(1).map((k) => [k.text, (w: BwaWerte) => w.kosten[k.key], "leise"] as [string, (w: BwaWerte) => number, "leise"]),
  ["Gesamtkosten", (w) => w.gesamtkosten, ""],
  ["Betriebsergebnis", (w) => w.betriebsergebnis, "fett"],
  ["Sonstige Erträge", (w) => w.sonstigeErtraege, ""],
  ["Vorläufiges Ergebnis", (w) => w.ergebnis, "fett"],
];

// ---------------------------------------------------------------- Cockpit
export function Cockpit({ supabase, jahr, heute, e, salden, konten, monat, steuernSehen, onZiel }: {
  supabase: SupabaseClient; jahr: number; heute: string; e: FinEinstellungen; salden: FinSaldo[]; konten: FinKonto[]; monat: number;
  steuernSehen: boolean; onZiel: (z: AuswertungZiel) => void;
}) {
  const planQ = useFinPlan(supabase, jahr, true);
  const ustQ = useFinUst(supabase, jahr, steuernSehen);
  const c = cockpit(salden, konten, e.kontenrahmen, monat, planQ.data ?? []);
  const ust = steuernSehen ? naechsteUst(ustQ.data, e, heute, jahr) : null;
  const kachel = (titel: string, wert: number, ziel: AuswertungZiel | null, zusatz?: React.ReactNode, warn?: boolean) => {
    const inhalt = <><span className="small">{titel}</span><b>{formatEUR(wert)}</b>{zusatz ? <span className="small">{zusatz}</span> : null}</>;
    return ziel
      ? <button type="button" className={"db-karte fi-kachel fi-kachel-knopf" + (warn ? " fi-kachel-warn" : "")} onClick={() => onZiel(ziel)}>{inhalt}</button>
      : <div className={"db-karte fi-kachel" + (warn ? " fi-kachel-warn" : "")}>{inhalt}</div>;
  };
  const planText = (ist: number, plan: number | null) => {
    if (plan == null) return null;
    const a = abweichung(ist, plan);
    return <>Plan {formatEUR(plan)} · <span className={a.betrag >= 0 ? "fi-gruen-text" : "fi-rot-text"}>{a.betrag >= 0 ? "+" : ""}{formatEUR(a.betrag)}</span></>;
  };
  return (
    <>
      <span className="op-gruppe-titel">JANUAR BIS {MONATSNAMEN[monat - 1].toUpperCase()} {jahr}</span>
      <div className="fi-kacheln fi-cockpit">
        {kachel(`Umsatz ${MONATSNAMEN[monat - 1]}`, c.umsatzMonat, "bwa")}
        {kachel("Umsatz im Jahr", c.umsatzJahr, c.planUmsatz != null ? "plan" : "bwa", planText(c.umsatzJahr, c.planUmsatz))}
        {kachel("Rohertrag", c.rohertrag, "bwa")}
        {kachel("Vorläufiges Ergebnis", c.ergebnis, c.planErgebnis != null ? "plan" : "bwa", planText(c.ergebnis, c.planErgebnis), c.ergebnis < 0)}
        {kachel("Kasse und Bank", c.geld, "liq", null, c.geld < 0)}
        {kachel("Forderungen", c.forderungen, "op")}
        {kachel("Verbindlichkeiten", c.verbindlichkeiten, "op")}
        {steuernSehen && (ust
          ? kachel(`Umsatzsteuer ${ust.text}`, ust.betrag, null, <>fällig {datumKurz(ust.frist)}{ust.ueberfaellig ? " – überfällig" : ""}</>, ust.ueberfaellig)
          : <div className="db-karte fi-kachel"><span className="small">Umsatzsteuer</span><b>–</b><span className="small">keine Voranmeldung offen</span></div>)}
      </div>
      <span className="small es-fuss fi-fuss">Aus dem, was in Finance gebucht ist (ohne Umsatzsteuer, Bestände ohne Anfangsbestand, solange keiner gebucht ist). Eine Kachel antippen führt zur Auswertung dahinter.</span>
    </>
  );
}

// ---------------------------------------------------------------- Plan und Ist
export function PlanIstAnsicht({ supabase, jahr, heute, e, salden, konten, monat, setMonat, darfPlanen, firma }: {
  supabase: SupabaseClient; jahr: number; heute: string; e: FinEinstellungen; salden: FinSaldo[]; konten: FinKonto[];
  monat: number; setMonat: (m: number) => void; darfPlanen: boolean; firma: string;
}) {
  const planQ = useFinPlan(supabase, jahr, true);
  const [nurMonat, setNurMonat] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<number | "neu" | null>(null);
  const [vorjahr, setVorjahr] = useState(false);
  const [druck, setDruck] = useState(false);
  if (planQ.isError) return <div className="fi-hinweis fi-info">Plan und Ist gibt es ab Migration 115 – im Supabase-SQL-Editor ausführen.</div>;
  const plan = planQ.data ?? [];
  const von = nurMonat ? monat : 1;
  const ist = bwa(salden, konten, e.kontenrahmen, monat);
  const soll = bwa(planAlsSalden(plan, konten), konten, e.kontenrahmen, monat);
  const teil = (b: typeof ist) => (nurMonat ? b.monat : b.kumuliert);
  const zeilen = planIst(salden, plan, konten, von, monat);
  const zeitraum = nurMonat ? `${MONATSNAMEN[monat - 1]} ${jahr}` : `Januar bis ${MONATSNAMEN[monat - 1]} ${jahr}`;
  const bwaZeilen = BWA_ZEILEN.map(([t, f, art]) => {
    const i = f(teil(ist)), p = f(teil(soll)), a = abweichung(i, p);
    return { t, art, ist: i, plan: p, abw: a.betrag, prozent: a.prozent };
  }).filter((z) => !(z.art === "leise" && z.ist === 0 && z.plan === 0));
  const prozent = (p: number | null) => (p == null ? "–" : `${p > 0 ? "+" : ""}${p.toLocaleString("de-DE")} %`);
  const bericht: BerichtZeile[] = [
    ...bwaZeilen.map((z) => ({ zellen: [z.t, z.plan, z.ist, z.abw, prozent(z.prozent)], art: z.art === "fett" ? "summe" as const : z.art === "leise" ? "leise" as const : undefined })),
    { zellen: ["", "", "", "", ""] },
    ...zeilen.map((z) => ({ zellen: [`${kontoNr(z.konto)} ${z.bezeichnung}`, z.plan, z.ist, z.abweichung, prozent(z.prozent)] })),
  ];

  return (
    <>
      <div className="fi-werkzeug">
        <select className="fi-monat" value={monat} onChange={(ev) => setMonat(Number(ev.target.value))} aria-label="Bis Monat">
          {MONATSNAMEN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <div className="lg-lagerwahl es-segment fi-liq-art" role="group" aria-label="Zeitraum Plan und Ist">
          <button type="button" className={!nurMonat ? "aktiv" : ""} aria-pressed={!nurMonat} onClick={() => setNurMonat(false)}>bis Monat</button>
          <button type="button" className={nurMonat ? "aktiv" : ""} aria-pressed={nurMonat} onClick={() => setNurMonat(true)}>nur Monat</button>
        </div>
        {darfPlanen && <button type="button" className="btn-primary fi-knopf" onClick={() => setBearbeiten("neu")}>Konto planen</button>}
        {darfPlanen && <button type="button" className="btn-secondary fi-knopf" onClick={() => setVorjahr(true)}>Aus Vorjahr …</button>}
        <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`Plan_Ist_${jahr}_${String(monat).padStart(2, "0")}.csv`,
          csv([["Zeile", "Plan", "Ist", "Abweichung", "Abweichung %"], ...bericht.map((z) => z.zellen.map((c) => (c == null ? "" : c)))]), "text/csv;charset=utf-8")}>Als CSV</button>
        <button type="button" className="btn-secondary fi-knopf" onClick={() => setDruck(true)}>Drucken</button>
      </div>
      {plan.length === 0 && !planQ.isPending && (
        <div className="fi-hinweis fi-info">Für {jahr} ist noch nichts geplant. {darfPlanen ? "„Aus Vorjahr …“ übernimmt das Ist des Vorjahres (mit Auf- oder Abschlag), „Konto planen“ trägt einzelne Konten ein." : ""}</div>
      )}
      <div className="db-karte es-karte">
        <table className="fi-tabelle fi-bwa fi-bwa-vj fi-planist-bwa">
          <thead><tr><th>{zeitraum}</th><th className="zahl">Plan</th><th className="zahl">Ist</th><th className="zahl">Abw.</th><th className="zahl">%</th></tr></thead>
          <tbody>
            {bwaZeilen.map((z) => (
              <tr key={z.t} className={z.art === "fett" ? "summe" : z.art === "leise" ? "steuer" : undefined}>
                <td>{z.t}</td><td className="zahl">{formatEUR(z.plan)}</td><td className="zahl">{formatEUR(z.ist)}</td>
                <td className="zahl">{formatEUR(z.abw)}</td><td className="zahl">{prozent(z.prozent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="op-gruppe-titel">JE KONTO</span>
      <div className="db-karte es-karte">
        {zeilen.length === 0 ? <span className="small">Weder Plan noch Ist im Zeitraum.</span> : (
          <table className="fi-tabelle fi-planist">
            <thead><tr><th>Konto</th><th className="zahl">Plan</th><th className="zahl">Ist</th><th className="zahl">Abw.</th></tr></thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.konto} className={darfPlanen ? "fi-klickbar" : undefined} onClick={darfPlanen ? () => setBearbeiten(z.konto) : undefined}>
                  <td><b>{kontoNr(z.konto)}</b> {z.bezeichnung}</td><td className="zahl">{formatEUR(z.plan)}</td><td className="zahl">{formatEUR(z.ist)}</td>
                  <td className={"zahl " + (z.abweichung === 0 ? "" : z.gut ? "fi-gruen-text" : "fi-rot-text")}>{formatEUR(z.abweichung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <span className="small es-fuss fi-fuss">Plan in Euro je Konto und Monat, ohne Umsatzsteuer. Grün: mehr Erlös bzw. weniger Aufwand als geplant.{darfPlanen ? " Eine Kontozeile antippen ändert ihren Plan." : ""}</span>
      {bearbeiten != null && (
        <PlanBlatt supabase={supabase} jahr={jahr} konto={bearbeiten === "neu" ? null : bearbeiten} plan={plan} konten={konten} onClose={() => setBearbeiten(null)} />
      )}
      {vorjahr && <VorjahrBlatt supabase={supabase} jahr={jahr} hatPlan={plan.length > 0} onClose={() => setVorjahr(false)} />}
      {druck && (
        <BerichtDruck titel="Plan und Ist" unter={zeitraum} kopf={["Zeile", "Plan", "Ist", "Abweichung", "%"]} zeilen={bericht} firma={firma} stand={datumKurz(heute)}
          fuss="Ohne Umsatzsteuer. Ist nach Buchungsdatum aus Finance." onClose={() => setDruck(false)} />
      )}
    </>
  );
}

function PlanBlatt({ supabase, jahr, konto, plan, konten, onClose }: {
  supabase: SupabaseClient; jahr: number; konto: number | null; plan: FinPlanWert[]; konten: FinKonto[]; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [k, setK] = useState(konto ? String(konto) : "");
  const [werte, setWerte] = useState<string[]>(() => (konto ? planMonate(plan, konto) : Array<number>(12).fill(0)).map((w) => (w ? String(w).replace(".", ",") : "")));
  const [jahrBetrag, setJahrBetrag] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zahlen = planEingabe(werte);
  const summe = Array.isArray(zahlen) ? Math.round(zahlen.reduce((s, x) => s + x, 0) * 100) / 100 : null;
  const pruefung = !k ? "Das Konto wählen." : typeof zahlen === "string" ? zahlen : null;
  function kontoWaehlen(w: string) {
    setK(w);
    if (w) setWerte(planMonate(plan, Number(w)).map((x) => (x ? String(x).replace(".", ",") : "")));
  }
  async function speichern() {
    if (pruefung || !Array.isArray(zahlen)) return;
    setLaeuft(true); setFehler(null);
    try { await finPlanSetzen(supabase, jahr, Number(k), zahlen); await queryClient.invalidateQueries({ queryKey: qk.finPlan(jahr) }); onClose(); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  return (
    <Blatt titel={konto ? `Plan ${kontoNr(konto)}` : "Konto planen"} unter={`Wirtschaftsjahr ${jahr}`} breite="breit" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void speichern()} disabled={laeuft || !!pruefung}>Speichern</button>
      </>}>
      <div className="fi-formular">
        <label className="nk-feld"><span>Konto</span>
          <KontoWahl wert={k} konten={konten} nur={["erloes", "aufwand"]} onWert={kontoWaehlen} label="Konto für den Plan" disabled={!!konto} /></label>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Jahresbetrag gleich verteilen</span>
            <input inputMode="decimal" value={jahrBetrag} onChange={(ev) => setJahrBetrag(ev.target.value)} placeholder="z. B. 12.000" aria-label="Jahresbetrag" /></label>
          <button type="button" className="btn-secondary fi-knopf fi-unten" disabled={!jahrBetrag.trim()} onClick={() => {
            const z = planEingabe([jahrBetrag, ...Array<string>(11).fill("")]);
            if (Array.isArray(z)) setWerte(planVerteilen(z[0]).map((x) => String(x).replace(".", ",")));
          }}>Verteilen</button>
        </div>
        <div className="fi-plan-monate">
          {MONATSNAMEN.map((m, i) => (
            <label key={m} className="nk-feld"><span>{m}</span>
              <input inputMode="decimal" value={werte[i]} aria-label={`Plan ${m}`} onChange={(ev) => setWerte(werte.map((w, j) => (j === i ? ev.target.value : w)))} /></label>
          ))}
        </div>
        {summe != null && <span className="small">Summe im Jahr: {formatEUR(summe)}. Leere Monate sind 0.</span>}
        {pruefung && k && <div className="fi-hinweis fi-rot" role="alert">{pruefung}</div>}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function VorjahrBlatt({ supabase, jahr, hatPlan, onClose }: { supabase: SupabaseClient; jahr: number; hatPlan: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [prozent, setProzent] = useState("0");
  const [ersetzen, setErsetzen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const p = Number(prozent.replace(",", "."));
  async function los() {
    setLaeuft(true); setFehler(null);
    try { await finPlanAusVorjahr(supabase, jahr, p, ersetzen); await queryClient.invalidateQueries({ queryKey: qk.finPlan(jahr) }); onClose(); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  return (
    <Blatt titel="Plan aus dem Vorjahr" unter={`Ist ${jahr - 1} → Plan ${jahr}`} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void los()} disabled={laeuft || !Number.isFinite(p) || p < -100 || p > 1000}>Übernehmen</button>
      </>}>
      <div className="fi-formular">
        <label className="nk-feld"><span>Auf- oder Abschlag in %</span><input inputMode="decimal" value={prozent} onChange={(ev) => setProzent(ev.target.value)} aria-label="Auf- oder Abschlag" /></label>
        {hatPlan && (
          <label className="nk-feld fi-haken"><input type="checkbox" checked={ersetzen} onChange={(ev) => setErsetzen(ev.target.checked)} />
            <span>Schon geplante Konten überschreiben</span></label>
        )}
        <span className="small">Je Erlös- und Aufwandskonto und Monat das Ist des Vorjahres, mal (1 + Aufschlag). {hatPlan && !ersetzen ? "Konten mit Plan bleiben, wie sie sind." : ""}</span>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Offene Posten nach Fälligkeit
export function OpAnsicht({ supabase, jahr, heute, rechnungenSehen, belegeSehen, firma }: {
  supabase: SupabaseClient; jahr: number; heute: string; rechnungenSehen: boolean; belegeSehen: boolean; firma: string;
}) {
  const rechnungenQ = useFinRechnungen(supabase, jahr, rechnungenSehen);
  const belegeQ = useFinBelege(supabase, jahr, belegeSehen);
  const lieferantenQ = useFinLieferanten(supabase, belegeSehen);
  const [druck, setDruck] = useState(false);
  if (!rechnungenSehen && !belegeSehen) return <div className="fi-hinweis fi-info">Dafür braucht es das Recht „Finance › Rechnungen“ oder „Finance › Belege“ lesen.</div>;
  const posten = opPosten(rechnungenQ.data?.rechnungen ?? [], belegeQ.data ?? [], lieferantenQ.data ?? [], heute);
  const a = opAnalyse(posten);
  const laedt = (rechnungenSehen && rechnungenQ.isPending) || (belegeSehen && belegeQ.isPending);
  const ueber = (art: "forderung" | "verbindlichkeit") => Math.round(posten.filter((p) => p.art === art && p.tage > 0).reduce((s, p) => s + p.rest, 0) * 100) / 100;
  const bericht: BerichtZeile[] = [
    ...a.stufen.map((s) => ({ zellen: [s.text, s.forderung, s.verbindlichkeit] as (string | number)[] })),
    { zellen: ["Summe", a.summe.forderung, a.summe.verbindlichkeit], art: "summe" },
    { zellen: ["", "", ""] },
    ...a.personen.map((p) => ({ zellen: [`${p.art === "forderung" ? "Kunde" : "Lieferant"}: ${p.name} (${p.anzahl}, bis ${Math.max(0, p.tage)} Tage)`,
      p.art === "forderung" ? p.rest : "", p.art === "verbindlichkeit" ? p.rest : ""] })),
  ];
  return (
    <>
      <div className="fi-werkzeug">
        <button type="button" className="btn-secondary fi-knopf" disabled={!posten.length} onClick={() => dateiHerunterladen(`OP_Faelligkeit_${heute}.csv`,
          csv([["Art", "Nummer", "Name", "Datum", "Fällig", "Tage überfällig", "Offen"],
            ...posten.map((p) => [p.art === "forderung" ? "Forderung" : "Verbindlichkeit", p.nummer, p.name, p.datum, p.faellig, Math.max(0, p.tage), p.rest])]),
          "text/csv;charset=utf-8")}>Als CSV</button>
        <button type="button" className="btn-secondary fi-knopf" disabled={!posten.length} onClick={() => setDruck(true)}>Drucken</button>
      </div>
      <div className="fi-kacheln">
        {rechnungenSehen && <div className={"db-karte fi-kachel" + (ueber("forderung") > 0 ? " fi-kachel-warn" : "")}><span className="small">Forderungen offen</span><b>{formatEUR(a.summe.forderung)}</b>
          <span className="small">überfällig {formatEUR(ueber("forderung"))}</span></div>}
        {belegeSehen && <div className="db-karte fi-kachel"><span className="small">Verbindlichkeiten offen</span><b>{formatEUR(a.summe.verbindlichkeit)}</b>
          <span className="small">überfällig {formatEUR(ueber("verbindlichkeit"))}</span></div>}
      </div>
      <div className="db-karte es-karte">
        {laedt ? <span className="small">Lädt …</span> : (
          <table className="fi-tabelle fi-op-stufen">
            <thead><tr><th>Überfällig</th>{rechnungenSehen && <th className="zahl">Forderungen</th>}{belegeSehen && <th className="zahl">Verbindlichkeiten</th>}</tr></thead>
            <tbody>
              {a.stufen.map((s, i) => (
                <tr key={s.text} className={i >= 3 && (s.forderung || s.verbindlichkeit) ? "fi-warn-zeile" : undefined}>
                  <td>{s.text}</td>
                  {rechnungenSehen && <td className="zahl">{formatEUR(s.forderung)}{s.anzahlF ? <span className="small"> ({s.anzahlF})</span> : null}</td>}
                  {belegeSehen && <td className="zahl">{formatEUR(s.verbindlichkeit)}{s.anzahlV ? <span className="small"> ({s.anzahlV})</span> : null}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {a.personen.length > 0 && (
        <>
          <span className="op-gruppe-titel">JE KUNDE UND LIEFERANT</span>
          <div className="db-karte es-karte">
            {a.personen.slice(0, 30).map((p) => (
              <div key={`${p.art}-${p.name}`} className="es-zeile statisch fi-buchung">
                <span className="db-punkt-text"><b>{p.name}</b>
                  <span className="small">{p.art === "forderung" ? "Kunde" : "Lieferant"} · {p.anzahl === 1 ? "1 Posten" : `${p.anzahl} Posten`}
                    {p.ueberfaellig > 0 ? <> · <span className="fi-rot-text">überfällig {formatEUR(p.ueberfaellig)}, bis {p.tage} Tage</span></> : " · nicht fällig"}</span></span>
                <span className="fi-betrag">{formatEUR(p.rest)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <span className="small es-fuss fi-fuss">Stufen nach Tagen über der Fälligkeit ({FIN_OP_STUFEN.map((s) => s.text).join(", ")}). Rechnungen und Belege von {jahr}; Offenes aus Vorjahren steht im Personenkonto.</span>
      {druck && (
        <BerichtDruck titel="Offene Posten nach Fälligkeit" unter={`Stichtag ${datumKurz(heute)}`} kopf={["Stufe / Person", "Forderungen", "Verbindlichkeiten"]} zeilen={bericht}
          firma={firma} stand={datumKurz(heute)} onClose={() => setDruck(false)} />
      )}
    </>
  );
}

// Firmenname für den Kopf gedruckter Berichte.
export function useFirma(supabase: SupabaseClient): string {
  const b = useBetrieb(supabase, true).data;
  return b?.firma?.trim() || b?.inhaber?.trim() || "";
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

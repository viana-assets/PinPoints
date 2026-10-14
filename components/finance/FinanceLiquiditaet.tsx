"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import {
  useFinBankimporte, useFinBankkonten, useFinBankumsaetze, useFinBelege, useFinKonten, useFinPlanposten, useFinRechnungen, useFinSalden, useFinUst,
} from "@/lib/queries/hooks";
import { finPlanpostenLoeschen, finPlanpostenSpeichern } from "@/lib/api/finance";
import { betragLesen } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { FIN_ZAHLUNGSZIEL_TAGE } from "@/lib/finance/rechnungen";
import {
  FIN_LIQ_QUELLEN, FIN_RHYTHMEN, geldBestand, liqPerioden, liqPosten, liqTiefpunkt, liqZeitraeume, startLautAuszug,
  type FinPlanposten, type FinRhythmus, type LiqArt, type LiqPeriode,
} from "@/lib/finance/liquiditaet";
import { csv } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { formatEUR } from "@/lib/format";

// Finance › Auswertungen › Liquidität (v158, Migration 100). Vorschau ab heute je Woche (13) oder Monat (6): Bestand der
// Geldkonten, offene Rechnungen und Belege nach Fälligkeit, Aufträge ohne Rechnung (Zahlungsziel), Umsatzsteuer zur
// Frist und die Planposten. Gerechnet in lib/finance/liquiditaet.ts; nichts davon wird gebucht.

const ANZAHL: Record<LiqArt, number> = { woche: 13, monat: 6 };
const datumDe = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const vorzeichen = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + formatEUR(Math.abs(n));

export function FinanceLiquiditaet({ supabase, jahr, heute, einstellungen: e, rechnungenSehen, belegeSehen, bankSehen, steuernSehen, darfPlanen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen;
  rechnungenSehen: boolean; belegeSehen: boolean; bankSehen: boolean; steuernSehen: boolean; darfPlanen: boolean;
}) {
  const [art, setArt] = useState<LiqArt>("woche");
  const [ueberfaellige, setUeberfaellige] = useState(true);
  const [vorgaenge, setVorgaenge] = useState(true);
  const [start, setStart] = useState<"buch" | "auszug">("buch");
  const [offen, setOffen] = useState<string | null>(null);
  const [zeige, setZeige] = useState<number | null>(null);

  const saldenQ = useFinSalden(supabase, jahr, true);
  const kontenQ = useFinKonten(supabase, e.kontenrahmen, true);
  const reQ = useFinRechnungen(supabase, jahr, rechnungenSehen);
  const reVjQ = useFinRechnungen(supabase, jahr - 1, rechnungenSehen);
  const beQ = useFinBelege(supabase, jahr, belegeSehen);
  const beVjQ = useFinBelege(supabase, jahr - 1, belegeSehen);
  const kontenBankQ = useFinBankkonten(supabase, bankSehen);
  const importeQ = useFinBankimporte(supabase, bankSehen);
  const umsQ = useFinBankumsaetze(supabase, jahr, bankSehen);
  const ustQ = useFinUst(supabase, jahr, steuernSehen);
  const planQ = useFinPlanposten(supabase, true);

  const monat = heute.slice(0, 4) === String(jahr) ? Number(heute.slice(5, 7)) : 12;
  const gebucht = geldBestand(saldenQ.data ?? [], kontenQ.data ?? [], monat);
  const auszug = startLautAuszug(gebucht, kontenBankQ.data ?? [], importeQ.data ?? []);
  const startBetrag = start === "auszug" && auszug.auszuege ? auszug.summe : gebucht.summe;
  const zeitraeume = liqZeitraeume(heute, art, ANZAHL[art]);
  const bis = zeitraeume[zeitraeume.length - 1].bis;
  const { posten, ohne } = liqPosten({
    rechnungen: rechnungenSehen ? [...(reQ.data?.rechnungen ?? []), ...(reVjQ.data?.rechnungen ?? [])] : null,
    vorgaenge: rechnungenSehen ? reQ.data?.vorgaenge ?? [] : null,
    belege: belegeSehen ? [...(beQ.data ?? []), ...(beVjQ.data ?? [])] : null,
    ust: steuernSehen && ustQ.data ? { stand: ustQ.data, jahr, einstellungen: e } : null,
    plan: planQ.data ?? [],
  }, heute, bis, { ueberfaellige, vorgaenge });
  const perioden = liqPerioden(startBetrag, posten, zeitraeume);
  const tief = liqTiefpunkt(perioden);
  const ein = perioden.reduce((s, p) => s + p.ein, 0);
  const aus = perioden.reduce((s, p) => s + p.aus, 0);
  const laedt = saldenQ.isPending || kontenQ.isPending || (rechnungenSehen && reQ.isPending) || (belegeSehen && beQ.isPending) || planQ.isPending;
  const unzugeordnet = (umsQ.data ?? []).filter((u) => u.status === "offen").length;
  const ohneRecht = [!rechnungenSehen && "Rechnungen", !belegeSehen && "Belege", !steuernSehen && "Umsatzsteuer", !bankSehen && "Kontoauszüge"].filter(Boolean) as string[];

  function alsCsv() {
    dateiHerunterladen(`Liquiditaet_${heute}_${art === "woche" ? "Wochen" : "Monate"}.csv`, csv([
      ["Zeitraum", "Von", "Bis", "Bestand Anfang", "Einzahlungen", "Auszahlungen", "Bestand Ende"],
      ...perioden.map((p) => [p.titel, p.von, p.bis, p.anfang, p.ein, p.aus, p.ende]),
      [],
      ["Datum", "Art", "Text", "Betrag", "Überfällig"],
      ...posten.map((x) => [x.datum, FIN_LIQ_QUELLEN[x.quelle], x.text, x.betrag, x.ueberfaellig ? "ja" : ""]),
    ]), "text/csv;charset=utf-8");
  }

  return (
    <>
      {(saldenQ.isError || planQ.isError) && <div className="fi-hinweis fi-rot" role="alert">
        {planQ.isError ? "Die Planposten konnten nicht geladen werden. Ist Migration 100 ausgeführt?" : "Die Salden konnten nicht geladen werden."}</div>}
      <div className="fi-werkzeug">
        <div className="lg-lagerwahl es-segment fi-liq-art" role="group" aria-label="Zeiträume">
          <button type="button" className={art === "woche" ? "aktiv" : ""} aria-pressed={art === "woche"} onClick={() => { setArt("woche"); setOffen(null); setZeige(null); }}>13 Wochen</button>
          <button type="button" className={art === "monat" ? "aktiv" : ""} aria-pressed={art === "monat"} onClick={() => { setArt("monat"); setOffen(null); setZeige(null); }}>6 Monate</button>
        </div>
        {auszug.auszuege > 0 && (
          <select className="fi-monat" value={start} onChange={(ev) => setStart(ev.target.value as "buch" | "auszug")} aria-label="Startbestand">
            <option value="buch">Start laut Buchhaltung</option>
            <option value="auszug">Start laut Kontoauszug</option>
          </select>
        )}
        <button type="button" className="btn-secondary fi-knopf" disabled={laedt} onClick={alsCsv}>Als CSV</button>
      </div>

      <div className="fi-kacheln">
        <div className={"db-karte fi-kachel" + (startBetrag < 0 ? " fi-kachel-warn" : "")}><span className="small">Bestand heute</span><b>{formatEUR(startBetrag)}</b>
          <span className="small">{start === "auszug" && auszug.auszuege ? "Kontoauszug, sonst gebucht" : "Kasse und Bank laut Buchhaltung"}</span></div>
        <div className={"db-karte fi-kachel" + (tief.betrag < 0 ? " fi-kachel-warn" : "")}><span className="small">Tiefster Stand</span><b>{formatEUR(tief.betrag)}</b>
          <span className="small">{tief.periode ? `Ende ${tief.periode.titel}` : "heute"}</span></div>
        <div className="db-karte fi-kachel"><span className="small">Einzahlungen</span><b>{formatEUR(ein)}</b><span className="small">bis {datumDe(bis)}</span></div>
        <div className="db-karte fi-kachel"><span className="small">Auszahlungen</span><b>{formatEUR(aus)}</b><span className="small">bis {datumDe(bis)}</span></div>
      </div>

      {!laedt && <LiqBild perioden={perioden} anfang={startBetrag} zeige={zeige} setZeige={setZeige} />}

      <div className="db-karte es-karte">
        <button type="button" className="es-zeile" aria-pressed={ueberfaellige} onClick={() => setUeberfaellige(!ueberfaellige)}>
          <span className="db-punkt-text"><b>Überfälliges einrechnen</b>
            <span className="small">{ueberfaellige ? "Was schon fällig war, steht auf heute." : `Nicht eingerechnet: ${formatEUR(ohne.ein)} Eingänge, ${formatEUR(ohne.aus)} Ausgänge.`}</span></span>
          <span className={"nk-spur" + (ueberfaellige ? " an" : "")} aria-hidden="true"><span /></span>
        </button>
        {rechnungenSehen && (
          <button type="button" className="es-zeile" aria-pressed={vorgaenge} onClick={() => setVorgaenge(!vorgaenge)}>
            <span className="db-punkt-text"><b>Aufträge ohne Rechnung einrechnen</b>
              <span className="small">Mit dem geschätzten Betrag, fällig {FIN_ZAHLUNGSZIEL_TAGE} Tage nach dem Auftrag (frühestens ab heute).</span></span>
            <span className={"nk-spur" + (vorgaenge ? " an" : "")} aria-hidden="true"><span /></span>
          </button>
        )}
      </div>

      {unzugeordnet > 0 && <div className="fi-hinweis fi-warn">{unzugeordnet === 1 ? "Ein Bankumsatz ist" : `${unzugeordnet} Bankumsätze sind`} noch nicht zugeordnet – der gebuchte Bestand
        und die offenen Posten sind dann nicht ganz aktuell (Bank & Kasse).</div>}
      {ohneRecht.length > 0 && <div className="fi-hinweis fi-liq-info">Ohne Leserecht nicht enthalten: {ohneRecht.join(", ")}.</div>}

      <div className="fi-gruppe">
        <span className="op-gruppe-titel">{art === "woche" ? "WOCHEN" : "MONATE"}</span>
        <div className="db-karte es-karte">
          {laedt ? <span className="small">Lädt …</span> : perioden.map((p) => (
            <PeriodeZeile key={p.von} p={p} offen={offen === p.von} onUmschalten={() => setOffen(offen === p.von ? null : p.von)} />
          ))}
        </div>
      </div>

      <PlanAbschnitt supabase={supabase} heute={heute} plan={planQ.data ?? []} darfPlanen={darfPlanen} />

      <span className="small es-fuss fi-fuss">Vorschau, keine Buchung: Rechnungen und Belege zum Fälligkeitstag mit dem offenen Rest, Aufträge ohne Rechnung
        mit dem geschätzten Betrag nach dem Zahlungsziel, Umsatzsteuer zur Frist der Voranmeldung (abgegebene Zeiträume mit vergangener Frist gelten als bezahlt,
        Sondervorauszahlung und das neue Jahr fehlen), dazu die Planposten. Löhne, Miete, Leasing und Ähnliches nur, soweit als Planposten eingetragen.</span>
    </>
  );
}

function PeriodeZeile({ p, offen, onUmschalten }: { p: LiqPeriode; offen: boolean; onUmschalten: () => void }) {
  return (
    <>
      <button type="button" className={"es-zeile fi-buchung" + (p.ende < 0 ? " fi-liq-minus" : "")} aria-expanded={offen} onClick={onUmschalten}>
        <span className="db-punkt-text"><b>{p.titel}</b>
          <span className="small">{p.posten.length ? `Ein ${formatEUR(p.ein)} · Aus ${formatEUR(p.aus)}` : "keine Zahlungen"}</span></span>
        <span className="fi-betrag">{formatEUR(p.ende)}</span>
      </button>
      {offen && (
        <div className="fi-liq-posten">
          {p.posten.length === 0 && <span className="small">In diesem Zeitraum ist nichts fällig.</span>}
          {p.posten.map((x, i) => (
            <div key={i} className="fi-liq-posten-zeile">
              <span className="small">{datumDe(x.datum).slice(0, 6)}</span>
              <span className="db-punkt-text"><span>{x.text}</span><span className="small">{FIN_LIQ_QUELLEN[x.quelle]}{x.ueberfaellig ? " · war schon fällig" : ""}</span></span>
              <span className={"fi-betrag" + (x.betrag < 0 ? " fi-rot-text" : "")}>{vorzeichen(x.betrag)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Säulen: Bestand am Ende jedes Zeitraums. Eine Reihe, daher ohne Legende; die Werte stehen in der Liste darunter und
// beim Antippen über dem Bild. HTML statt SVG, damit die Rundung am Datenende bei jeder Breite rund bleibt.
function LiqBild({ perioden, anfang, zeige, setZeige }: { perioden: LiqPeriode[]; anfang: number; zeige: number | null; setZeige: (i: number | null) => void }) {
  const werte = perioden.map((p) => p.ende);
  const hoch = Math.max(0, anfang, ...werte), tief = Math.min(0, anfang, ...werte);
  const spanne = hoch - tief || 1;
  const null_ = (hoch / spanne) * 100; // Lage der Nulllinie von oben, in Prozent
  const p = zeige == null ? null : perioden[zeige];
  return (
    <div className="db-karte es-karte fi-liq-bild">
      <span className="small" aria-live="polite">{p ? `${p.titel}: Bestand ${formatEUR(p.ende)} (ein ${formatEUR(p.ein)}, aus ${formatEUR(p.aus)})` : "Bestand am Ende jedes Zeitraums – antippen für Werte"}</span>
      <div className="fi-liq-flaeche" role="img" aria-label="Bestand am Ende jedes Zeitraums">
        <span className="fi-liq-null" style={{ top: `${null_}%` }} />
        <span className="fi-liq-skala small" style={{ top: 0 }}>{formatEUR(hoch)}</span>
        {tief < 0 && <span className="fi-liq-skala small" style={{ bottom: 0 }}>{formatEUR(tief)}</span>}
        {perioden.map((x, i) => {
          const h = (Math.abs(x.ende) / spanne) * 100;
          return (
            <button key={x.von} type="button" className={"fi-liq-spalte" + (zeige === i ? " aktiv" : "")} aria-label={`${x.titel}: ${formatEUR(x.ende)}`}
              onMouseEnter={() => setZeige(i)} onMouseLeave={() => setZeige(null)} onFocus={() => setZeige(i)} onBlur={() => setZeige(null)} onClick={() => setZeige(i)}>
              <span className={x.ende < 0 ? "fi-liq-saeule-minus" : "fi-liq-saeule"}
                style={x.ende < 0 ? { top: `${null_}%`, height: `${h}%` } : { bottom: `${100 - null_}%`, height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="fi-liq-achse small"><span>{perioden[0]?.titel.split(" · ")[0]}</span><span>{perioden[perioden.length - 1]?.titel.split(" · ")[0]}</span></div>
    </div>
  );
}

function PlanAbschnitt({ supabase, heute, plan, darfPlanen }: { supabase: SupabaseClient; heute: string; plan: FinPlanposten[]; darfPlanen: boolean }) {
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState<FinPlanposten | "neu" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const rhythmusText = (r: FinRhythmus) => FIN_RHYTHMEN.find((x) => x.wert === r)?.text ?? r;
  const fertig = async (t: string) => {
    await queryClient.invalidateQueries({ queryKey: qk.finPlanposten() });
    setBearbeiten(null);
    setMeldung(t);
  };
  return (
    <div className="fi-gruppe">
      <span className="op-gruppe-titel">PLANPOSTEN</span>
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      <div className="db-karte es-karte">
        {plan.length === 0 && bearbeiten == null && <span className="small">Noch keine Planposten – Miete, Löhne, Leasing, Versicherungen oder eine geplante Anschaffung hier eintragen.</span>}
        {plan.map((p) => bearbeiten !== "neu" && bearbeiten?.id === p.id ? (
          <PlanFormular key={p.id} supabase={supabase} heute={heute} p={p} onAbbrechen={() => setBearbeiten(null)} onFertig={fertig} />
        ) : (
          <button key={p.id} type="button" className={"es-zeile fi-buchung" + (p.bis && p.bis < heute ? " fi-leise" : "")} disabled={!darfPlanen}
            onClick={() => { setBearbeiten(p); setMeldung(null); }}>
            <span className="db-punkt-text"><b>{p.text}</b>
              <span className="small">{rhythmusText(p.rhythmus)} ab {datumDe(p.ab)}{p.bis ? ` bis ${datumDe(p.bis)}` : ""}{p.notiz ? ` · ${p.notiz}` : ""}</span></span>
            <span className={"fi-betrag" + (p.art === "aus" ? " fi-rot-text" : "")}>{p.art === "aus" ? "−" : "+"}{formatEUR(p.betrag)}</span>
          </button>
        ))}
        {bearbeiten === "neu" && <PlanFormular supabase={supabase} heute={heute} p={null} onAbbrechen={() => setBearbeiten(null)} onFertig={fertig} />}
      </div>
      {darfPlanen && bearbeiten == null && (
        <button type="button" className="es-knopf fi-links" onClick={() => { setBearbeiten("neu"); setMeldung(null); }}>Planposten hinzufügen …</button>
      )}
    </div>
  );
}

function PlanFormular({ supabase, heute, p, onAbbrechen, onFertig }: {
  supabase: SupabaseClient; heute: string; p: FinPlanposten | null; onAbbrechen: () => void; onFertig: (meldung: string) => Promise<void>;
}) {
  const [text, setText] = useState(p?.text ?? "");
  const [art, setArt] = useState<"ein" | "aus">(p?.art ?? "aus");
  const [betragText, setBetragText] = useState(p ? p.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "");
  const [ab, setAb] = useState(p?.ab ?? heute);
  const [rhythmus, setRhythmus] = useState<FinRhythmus>(p?.rhythmus ?? "monat");
  const [bis, setBis] = useState(p?.bis ?? "");
  const [notiz, setNotiz] = useState(p?.notiz ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const betrag = betragLesen(betragText);
  const mangel = !text.trim() ? "Den Text eintragen."
    : betrag == null || !(betrag > 0) ? "Den Betrag eintragen."
    : !ab ? "Das Datum eintragen."
    : rhythmus !== "einmal" && bis && bis < ab ? "„Bis“ liegt vor dem ersten Termin."
    : null;

  async function los(f: () => Promise<void>, ok: string) {
    setLaeuft(true); setFehler(null);
    try { await f(); await onFertig(ok); } catch (e) { setFehler(fehlerText(e)); } finally { setLaeuft(false); }
  }

  return (
    <div className="fi-formular fi-liq-formular">
      <label className="nk-feld"><span>Text</span><input value={text} maxLength={120} onChange={(ev) => setText(ev.target.value)} placeholder="z. B. Miete Halle" aria-label="Text" /></label>
      <div className="lg-lagerwahl es-segment fi-reiter-breit" role="group" aria-label="Richtung">
        <button type="button" className={art === "aus" ? "aktiv" : ""} aria-pressed={art === "aus"} onClick={() => setArt("aus")}>Auszahlung</button>
        <button type="button" className={art === "ein" ? "aktiv" : ""} aria-pressed={art === "ein"} onClick={() => setArt("ein")}>Einzahlung</button>
      </div>
      <div className="fi-zwei">
        <label className="nk-feld"><span>Betrag</span><input inputMode="decimal" value={betragText} onChange={(ev) => setBetragText(ev.target.value)} aria-label="Betrag" /></label>
        <label className="nk-feld"><span>Rhythmus</span>
          <select value={rhythmus} onChange={(ev) => { const r = ev.target.value as FinRhythmus; setRhythmus(r); if (r === "einmal") setBis(""); }} aria-label="Rhythmus">
            {FIN_RHYTHMEN.map((r) => <option key={r.wert} value={r.wert}>{r.text}</option>)}
          </select></label>
      </div>
      <div className="fi-zwei">
        <label className="nk-feld"><span>{rhythmus === "einmal" ? "Am" : "Erster Termin"}</span><input type="date" value={ab} onChange={(ev) => setAb(ev.target.value)} aria-label="Erster Termin" /></label>
        {rhythmus !== "einmal" && <label className="nk-feld"><span>Bis (leer = ohne Ende)</span><input type="date" value={bis} min={ab} onChange={(ev) => setBis(ev.target.value)} aria-label="Bis" /></label>}
      </div>
      <label className="nk-feld"><span>Notiz</span><input value={notiz} maxLength={500} onChange={(ev) => setNotiz(ev.target.value)} aria-label="Notiz" /></label>
      {mangel && <span className="small">{mangel}</span>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="fi-aktion">
        {p && !loeschen && <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setLoeschen(true)}>Löschen …</button>}
        {p && loeschen && <button type="button" className="btn-danger" disabled={laeuft}
          onClick={() => void los(() => finPlanpostenLoeschen(supabase, p.id), `„${p.text}“ gelöscht.`)}>Wirklich löschen</button>}
        <button type="button" className="btn-secondary" disabled={laeuft} onClick={onAbbrechen}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={laeuft || !!mangel} onClick={() => void los(async () => {
          await finPlanpostenSpeichern(supabase, p?.id ?? null, {
            text: text.trim(), art, betrag: betrag as number, ab, rhythmus, bis: rhythmus === "einmal" || !bis ? null : bis, notiz: notiz.trim() || null,
          });
        }, p ? "Planposten geändert." : "Planposten gespeichert.")}>{laeuft ? "speichert …" : "Speichern"}</button>
      </div>
    </div>
  );
}

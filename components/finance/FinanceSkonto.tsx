"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinSkonti } from "@/lib/queries/hooks";
import { finSkontoBuchen, finSkontoZuruecknehmen } from "@/lib/api/finance";
import { betragLesen } from "@/lib/finance/buchung";
import { FIN_SKONTO_HOECHST, skontoMangel } from "@/lib/finance/rechnungen";
import { formatEUR } from "@/lib/format";

// Skonto an einer Rechnung (gewährt) oder einem Beleg (erhalten) – Migration 98, v156. Steht im Fenster der Rechnung
// bzw. des Belegs: bisherige Abzüge mit „zurücknehmen“, darunter „Skonto abziehen“. Gebucht und aufgeteilt wird in der
// Datenbank (`fin_skonto_buchen()`), die Steuer sinkt anteilig.
export function SkontoAbschnitt({ supabase, art, ziel, brutto, rest, datumAb, heute, offen, darfSchreiben, onFertig }: {
  supabase: SupabaseClient; art: "rechnung" | "beleg"; ziel: string; brutto: number; rest: number; datumAb: string; heute: string;
  offen: boolean; darfSchreiben: boolean; onFertig: (meldung: string) => void;
}) {
  const queryClient = useQueryClient();
  const skontiQ = useFinSkonti(supabase, art, true);
  const meine = (skontiQ.data ?? []).filter((s) => s.ziel_id === ziel);
  const bisher = meine.reduce((t, s) => t + s.betrag, 0);
  const [form, setForm] = useState(false);
  const [datum, setDatum] = useState(heute);
  const [betragText, setBetragText] = useState(() => rest.toLocaleString("de-DE", { minimumFractionDigits: 2 }));
  const [zurueck, setZurueck] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const betrag = betragLesen(betragText);
  const mangel = skontoMangel(betrag, rest, brutto, bisher);

  async function tun(f: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const t = await f();
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onFertig(t);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  if (!meine.length && !(offen && darfSchreiben)) return null;
  return (
    <div className="fi-skonto">
      {meine.map((s) => (
        <div key={s.buchung_id} className="fi-skonto-zeile">
          <span className="small">Skonto {formatEUR(s.betrag)} am {s.datum.slice(8, 10)}.{s.datum.slice(5, 7)}. (Buchung Nr. {s.nr})</span>
          {darfSchreiben && zurueck !== s.buchung_id && <button type="button" className="es-knopf" onClick={() => { setZurueck(s.buchung_id); setGrund(""); setForm(false); }}>Zurücknehmen …</button>}
          {zurueck === s.buchung_id && (
            <span className="fi-skonto-form">
              <input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} placeholder="Grund" aria-label="Grund" autoFocus />
              <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setZurueck(null)}>Abbrechen</button>
              <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
                onClick={() => void tun(async () => { await finSkontoZuruecknehmen(supabase, s.buchung_id, grund.trim()); return "Skonto zurückgenommen – der Posten ist wieder offen."; })}>Zurücknehmen</button>
            </span>
          )}
        </div>
      ))}
      {offen && darfSchreiben && !form && !zurueck && (
        <button type="button" className="es-knopf fi-links" onClick={() => { setForm(true); setFehler(null); }}>Skonto abziehen …</button>
      )}
      {form && (
        <>
          <div className="fi-zwei">
            <label className="nk-feld"><span>Abgezogen am</span><input type="date" value={datum} min={datumAb} max={heute} onChange={(e) => setDatum(e.target.value)} /></label>
            <label className="nk-feld"><span>Skonto (brutto)</span><input inputMode="decimal" value={betragText} onChange={(e) => setBetragText(e.target.value)} aria-label="Skontobetrag" /></label>
          </div>
          <span className="small">{art === "rechnung"
            ? "Gebucht wird Gewährte Skonti an Forderung; die Umsatzsteuer sinkt anteilig wie in der Rechnung."
            : "Gebucht wird Verbindlichkeit an Erhaltene Skonti (bei einer Anlage an das Anlagekonto); die Vorsteuer sinkt anteilig."}
            {" "}Höchstens {FIN_SKONTO_HOECHST * 100} % des Bruttobetrags ({formatEUR(Math.round(brutto * FIN_SKONTO_HOECHST * 100) / 100)}).</span>
          {mangel && betragText.trim() !== "" && <span className="small fi-rot-text">{mangel}</span>}
          <div className="fi-aktion">
            <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setForm(false)}>Abbrechen</button>
            <button type="button" className="btn-primary" disabled={laeuft || !!mangel || !datum || datum > heute}
              onClick={() => void tun(async () => {
                const r = await finSkontoBuchen(supabase, art, ziel, datum, betrag!);
                return r.rest === 0 ? `Skonto gebucht (Nr. ${r.nr}) – der Posten ist ausgeglichen.` : `Skonto gebucht (Nr. ${r.nr}) – offen bleiben ${formatEUR(r.rest)}.`;
              })}>{laeuft ? "bucht …" : "Skonto buchen"}</button>
          </div>
        </>
      )}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
    </div>
  );
}

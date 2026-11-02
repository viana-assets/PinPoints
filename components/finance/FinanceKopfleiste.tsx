"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verb } from "@/lib/constants";
import {
  useFinBankumsaetze, useFinBelege, useFinEinstellungen, useFinFestschreibungen, useFinKonten, useFinPersonenkonten, useFinRechnungen, useFinUst,
} from "@/lib/queries/hooks";
import { rechnungenZuErledigen } from "@/lib/finance/rechnungen";
import { naechsteUst } from "@/lib/finance/cockpit";
import { zeitraumVorgaben } from "@/lib/finance/kontoblatt";
import { FIN_VERSTEUERUNG, type FinEinstellungen } from "@/lib/finance/einstellungen";
import { festText, financeStand, globaleSuche, wjAuswahl, type FinanceStand, type Periode, type SuchZiel } from "@/lib/finance/kopfleiste";
import type { FinanceSeite } from "@/lib/finance/seiten";

// Kopfleiste und Statuszeile von Finance am Rechner (v187, Entwurf: Claude outputs/Mockup_Finance_StufeA_v1.html):
// oben Wirtschaftsjahr, Periode, Suche (F2), Kontenrahmen und Versteuerung, „+ Schnellbuchung (N)“; unten, was offen
// ist – Belegeingang, Bank, nächste Frist, festgeschrieben bis. Die Regeln stehen in lib/finance/kopfleiste.ts.

export type FinanceRechte = (bereich: string, verb?: Verb) => boolean;

// Was offen ist – für die Statuszeile und die Zahlen in der Seitenleiste. Dieselben Abfragen wie Übersicht und Seiten,
// also nichts doppelt geladen.
export function useFinanceStand(supabase: SupabaseClient, jahr: number, heute: string, darf: FinanceRechte): FinanceStand & { e: FinEinstellungen | null } {
  const stand = useFinEinstellungen(supabase, jahr, true).data;
  const e = stand?.status === "da" ? stand.einstellungen : null;
  const belegeQ = useFinBelege(supabase, jahr, darf("finance.belege", "lesen") && !!e);
  const bankQ = useFinBankumsaetze(supabase, jahr, darf("finance.bank", "lesen") && !!e);
  const rechnungenQ = useFinRechnungen(supabase, jahr, darf("finance.rechnungen", "lesen"));
  const festQ = useFinFestschreibungen(supabase, jahr, darf("finance.buchen", "lesen") && !!e);
  return {
    e,
    ...financeStand({
      belege: belegeQ.data, bankStatus: bankQ.data, fest: festQ.data, jahr, heute,
      rechnungenUeberfaellig: rechnungenQ.data ? rechnungenZuErledigen(rechnungenQ.data, heute).ueberfaellig : null,
    }),
  };
}

export function FinanceKopfleiste({ supabase, jahr, laufend, onJahr, periode, onPeriode, e, seiten, darf, aktivSeite, onSuchziel, onNeu }: {
  supabase: SupabaseClient;
  jahr: number;
  laufend: number;
  onJahr: (j: number) => void;
  periode: Periode;
  onPeriode: (p: Periode) => void;
  e: FinEinstellungen | null;
  seiten: FinanceSeite[];
  darf: FinanceRechte;
  // Auf „Buchungen“ nehmen Journal und Kontoblatt F2 und N selbst.
  aktivSeite: string;
  onSuchziel: (z: SuchZiel) => void;
  onNeu: () => void;
}) {
  const buchungenSehen = darf("finance.buchen", "lesen") && !!e;
  const darfBuchen = darf("finance.buchen", "schreiben") && !!e;
  const [text, setText] = useState("");
  const [offen, setOffen] = useState(false);
  const [hell, setHell] = useState(0);
  const sucheRef = useRef<HTMLInputElement>(null);
  const listeId = useId();
  // Konten und Personen erst laden, wenn jemand sucht.
  const sucht = offen && text.trim() !== "";
  const kontenQ = useFinKonten(supabase, e?.kontenrahmen ?? "skr03", buchungenSehen && sucht);
  const personenQ = useFinPersonenkonten(supabase, jahr, buchungenSehen && sucht);
  const treffer = globaleSuche(text, { seiten, konten: kontenQ.data ?? [], personen: personenQ.isError ? [] : personenQ.data ?? [], buchungen: buchungenSehen });
  const versteuerung = e && e.besteuerung !== "klein" ? FIN_VERSTEUERUNG.find((v) => v.wert === e.versteuerung)?.text : null;

  function waehlen(z: SuchZiel) {
    setText(""); setOffen(false); setHell(0);
    sucheRef.current?.blur();
    onSuchziel(z);
  }

  // F2 (Suche) und N (Schnellbuchung) auf jeder Finance-Seite – außer wo die Seite eine eigene Suche hat
  // (`data-eigene-suche`) bzw. auf „Buchungen“, wo Journal und Kontoblatt N selbst nehmen. Über einem Fenster nichts.
  useEffect(() => {
    const hoeren = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.altKey || ev.metaKey || document.querySelector("[role='dialog']")) return;
      if (ev.key === "F2") {
        if (document.querySelector("[data-eigene-suche]")) return;
        ev.preventDefault();
        sucheRef.current?.focus();
        return;
      }
      const ziel = ev.target as HTMLElement | null;
      if ((ev.key === "n" || ev.key === "N") && darfBuchen && aktivSeite !== "buchungen" && !ziel?.closest?.("input, textarea, select, [contenteditable='true']")) {
        ev.preventDefault();
        onNeu();
      }
    };
    window.addEventListener("keydown", hoeren);
    return () => window.removeEventListener("keydown", hoeren);
  }, [darfBuchen, aktivSeite, onNeu]);

  return (
    <div className="fi-kopfleiste" role="group" aria-label="Wirtschaftsjahr, Periode und Suche">
      <label className="ap-chip"><span>WJ</span>
        <select value={jahr} aria-label="Wirtschaftsjahr" onChange={(ev) => onJahr(Number(ev.target.value))}>
          {wjAuswahl(laufend).map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </label>
      <label className="ap-chip" title="Gilt für Journal, Kontoblatt, Konten und Auswertungen"><span>Periode</span>
        <select value={periode} aria-label="Periode" onChange={(ev) => onPeriode(ev.target.value)}>
          {zeitraumVorgaben(jahr).map((v) => <option key={v.key} value={v.key}>{v.text}</option>)}
        </select>
      </label>
      <div className="fi-suche-global">
        <label className="ap-chip ap-chip-suche">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={sucheRef} value={text} placeholder={buchungenSehen ? "Konto, Person, Buchung, Seite (F2)" : "Seite suchen (F2)"} aria-label="Finance durchsuchen"
            role="combobox" aria-expanded={sucht && treffer.length > 0} aria-controls={listeId} aria-autocomplete="list"
            aria-activedescendant={sucht && treffer[hell] ? `${listeId}-${hell}` : undefined}
            onChange={(ev) => { setText(ev.target.value); setOffen(true); setHell(0); }}
            onFocus={() => setOffen(true)}
            onBlur={() => setOffen(false)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") { ev.preventDefault(); if (text) setText(""); else sucheRef.current?.blur(); return; }
              if (!sucht || !treffer.length) return;
              if (ev.key === "ArrowDown") { ev.preventDefault(); setHell((hell + 1) % treffer.length); }
              else if (ev.key === "ArrowUp") { ev.preventDefault(); setHell((hell - 1 + treffer.length) % treffer.length); }
              else if (ev.key === "Enter") { ev.preventDefault(); waehlen(treffer[Math.min(hell, treffer.length - 1)].ziel); }
            }} />
        </label>
        {sucht && treffer.length > 0 && (
          <ul className="ap-vorschlaege fi-suche-treffer" id={listeId} role="listbox" aria-label="Treffer">
            {treffer.map((t, i) => (
              <li key={t.key} id={`${listeId}-${i}`} role="option" aria-selected={i === hell} className={i === hell ? "hell" : undefined}
                // mousedown statt click: sonst schließt das Verlassen des Feldes die Liste vorher.
                onMouseDown={(ev) => { ev.preventDefault(); waehlen(t.ziel); }}>
                <b>{t.titel}</b><span className="small">{t.unter}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {e && <span className="fi-kopf-rahmen">{e.kontenrahmen.toUpperCase()}{versteuerung ? ` · ${versteuerung}-Versteuerung` : e.besteuerung === "klein" ? " · Kleinunternehmer" : ""}</span>}
      {/* Auf „Buchungen“ hat die Werkzeugleiste von Journal und Kontoblatt denselben Knopf. */}
      {darfBuchen && aktivSeite !== "buchungen" && <button type="button" className="btn-primary ap-neu" onClick={onNeu}>+ Schnellbuchung (N)</button>}
    </div>
  );
}

// Unten auf jeder Finance-Seite am Rechner: was offen ist, jeweils ein Sprung dorthin.
export function FinanceStatuszeile({ supabase, jahr, heute, stand, darf, onSeite, onMonate }: {
  supabase: SupabaseClient; jahr: number; heute: string; stand: FinanceStand & { e: FinEinstellungen | null }; darf: FinanceRechte;
  onSeite: (s: "belege" | "bank" | "steuern") => void; onMonate: () => void;
}) {
  const e = stand.e;
  const ustQ = useFinUst(supabase, jahr, darf("finance.steuer", "lesen") && !!e);
  const ust = e && ustQ.data ? naechsteUst(ustQ.data, e, heute, jahr) : null;
  const tag = (iso: string) => iso.split("-").reverse().join(".");
  return (
    <div className="fi-statuszeile" role="status" aria-label="Was offen ist">
      {stand.belegeOffen != null && (
        <button type="button" onClick={() => onSeite("belege")}>Belegeingang: <b className={stand.belegeOffen ? "fi-st-offen" : undefined}>{stand.belegeOffen ? `${stand.belegeOffen} offen` : "nichts offen"}</b></button>
      )}
      {stand.bankOffen != null && (
        <button type="button" onClick={() => onSeite("bank")}>Bank: <b className={stand.bankOffen ? "fi-st-offen" : undefined}>{stand.bankOffen ? `${stand.bankOffen === 1 ? "1 Umsatz" : `${stand.bankOffen} Umsätze`} nicht zugeordnet` : "alles zugeordnet"}</b></button>
      )}
      {ust && (
        <button type="button" onClick={() => onSeite("steuern")}>Nächste Frist: <b className={ust.ueberfaellig ? "fi-st-rot" : undefined}>UStVA {ust.text} – {tag(ust.frist)}{ust.ueberfaellig ? " (überfällig)" : ""}</b>
          {e?.dauerfrist ? <span className="small"> (Dauerfrist)</span> : null}</button>
      )}
      {stand.festBis != null && (
        <button type="button" onClick={onMonate}>Festgeschrieben bis: <b>{festText(stand.festBis, jahr)}</b></button>
      )}
      <span className="fi-st-tasten">F2 Suche{darf("finance.buchen", "schreiben") && e ? " · N Schnellbuchung" : ""}</span>
    </div>
  );
}

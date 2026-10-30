"use client";
import { useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { DatenTabelle, SpaltenWahl, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { useKurzbefehle, ZeitraumWahl } from "./arbeitsplatz/Werkzeuge";
import { KontoNeu } from "./FinanceBuchungen";
import { fehlerText } from "@/components/FehlerHinweis";
import { finKontoAktiv } from "@/lib/api/finance";
import { qk } from "@/lib/queries/keys";
import { dateiHerunterladen } from "@/lib/download";
import { FIN_KONTO_KATEGORIEN, kontoNr, type FinBuchung, type FinKonto, type KontoKategorie } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragText, saldoText, sortiere, tabellenCsv, type Sortierung } from "@/lib/finance/arbeitsplatz";
import { KONTEN_FILTER_LEER, kontenFiltern, kontenUebersicht, zeitraumVorgaben, type KontenFilter, type KontoUebersicht, type Zeitraum } from "@/lib/finance/kontoblatt";

// Finance › Buchungen › Konten am Rechner (v179, Stufe B, docs/finance.md Abschnitt 11): der Kontenplan als Tabelle mit
// Eröffnung, Soll, Haben und Saldo im gewählten Zeitraum (Summen und Salden), Filter nach Art, Suche, „nur bebuchte“.
// Enter oder Doppelklick öffnet das Kontoblatt. Rechts das gewählte Konto mit Ein-/Ausblenden; „Eigenes Konto“ wie
// bisher. Am Handy bleibt die Liste in FinanceBuchungen.tsx (`Konten`).

const ART_TEXT = Object.fromEntries(FIN_KONTO_KATEGORIEN.map((k) => [k.wert, k.text])) as Record<KontoKategorie, string>;
const ART_REIHE = Object.fromEntries(FIN_KONTO_KATEGORIEN.map((k, i) => [k.wert, i])) as Record<KontoKategorie, number>;

export function FinanceKontenArbeitsplatz({ supabase, rahmen, buchungen, konten, jahr, laedt, darfKonten, onKontoblatt }: {
  supabase: SupabaseClient;
  rahmen: FinEinstellungen["kontenrahmen"];
  buchungen: FinBuchung[];
  konten: FinKonto[];
  jahr: number;
  laedt: boolean;
  darfKonten: boolean;
  onKontoblatt: (n: number) => void;
}) {
  const queryClient = useQueryClient();
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => zeitraumVorgaben(jahr)[0]);
  const [filter, setFilter] = useState<KontenFilter>(KONTEN_FILTER_LEER);
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const [aus, setAus] = useState<Set<string>>(() => new Set());
  const [neu, setNeu] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const sucheRef = useRef<HTMLInputElement>(null);

  const alle = useMemo(() => kontenUebersicht(konten, buchungen, zeitraum), [konten, buchungen, zeitraum]);
  const gefiltert = kontenFiltern(alle, filter);
  const alleSpalten: Spalte<KontoUebersicht>[] = [
    { key: "nummer", titel: "Konto", zahl: true, wert: (z) => z.konto.nummer, zeige: (z) => kontoNr(z.konto.nummer), fest: true },
    { key: "bezeichnung", titel: "Bezeichnung", wert: (z) => z.konto.bezeichnung, fest: true, max: 230,
      zeige: (z) => <>{z.konto.bezeichnung}{z.konto.eigen && <span className="ap-marke">eigen</span>}{!z.konto.aktiv && <span className="ap-marke">ausgeblendet</span>}</> },
    { key: "art", titel: "Art", wert: (z) => ART_REIHE[z.konto.kategorie], zeige: (z) => <span title={ART_TEXT[z.konto.kategorie]}>{ART_TEXT[z.konto.kategorie]}</span>, max: 140 },
    { key: "eroeffnung", titel: "Eröffnung", zahl: true, wert: (z) => z.eroeffnung, zeige: (z) => (z.eroeffnung ? saldoText(z.eroeffnung) : "") },
    { key: "soll", titel: "Soll", zahl: true, wert: (z) => z.soll, zeige: (z) => (z.soll ? betragText(z.soll) : "") },
    { key: "haben", titel: "Haben", zahl: true, wert: (z) => z.haben, zeige: (z) => (z.haben ? betragText(z.haben) : "") },
    { key: "ende", titel: "Saldo", zahl: true, wert: (z) => z.ende, zeige: (z) => saldoText(z.ende), fest: true },
    { key: "anzahl", titel: "Bewegungen", zahl: true, wert: (z) => z.anzahl, zeige: (z) => z.anzahl || "" },
  ];
  const spalten = alleSpalten.filter((s) => !aus.has(s.key));
  const sortSpalte = alleSpalten.find((s) => s.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte ? sortiere(gefiltert, sortSpalte.wert, sortierung.richtung) : gefiltert;
  const key = (z: KontoUebersicht) => String(z.konto.nummer);
  const gewaehlt = zeilen.find((z) => key(z) === auswahl) ?? zeilen[0] ?? null;
  const soll = alle.reduce((s, z) => s + z.soll, 0), haben = alle.reduce((s, z) => s + z.haben, 0);
  const stimmt = Math.round(soll * 100) === Math.round(haben * 100);
  const setze = (p: Partial<KontenFilter>) => setFilter({ ...filter, ...p });

  useKurzbefehle((b) => {
    if (b === "suche") { sucheRef.current?.focus(); return true; }
    if (b === "konto" && gewaehlt) { onKontoblatt(gewaehlt.konto.nummer); return true; }
    return false;
  });

  async function umschalten(k: FinKonto) {
    setFehler(null);
    try {
      await finKontoAktiv(supabase, rahmen, k.nummer, !k.aktiv);
      await queryClient.invalidateQueries({ queryKey: qk.finKonten(rahmen) });
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  function csv(nurMarkiert: boolean) {
    const liste = nurMarkiert ? zeilen.filter((z) => markiert.has(key(z))) : zeilen;
    const kopf = ["Konto", "Bezeichnung", "Art", "Eröffnung", "S/H", "Soll", "Haben", "Saldo", "S/H", "Bewegungen"];
    const daten = liste.map((z) => [kontoNr(z.konto.nummer), z.konto.bezeichnung, ART_TEXT[z.konto.kategorie], Math.abs(z.eroeffnung), z.eroeffnung < 0 ? "H" : "S",
      z.soll, z.haben, Math.abs(z.ende), z.ende < 0 ? "H" : "S", z.anzahl]);
    dateiHerunterladen(`konten_${zeitraum.von}_${zeitraum.bis}.csv`, tabellenCsv(kopf, daten), "text/csv;charset=utf-8");
  }

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Filter">
          <ZeitraumWahl jahr={jahr} wert={zeitraum} onWert={setZeitraum} />
          <label className="ap-chip"><span>Art</span>
            <select value={filter.kategorie ?? ""} aria-label="Art" onChange={(e) => setze({ kategorie: (e.target.value || null) as KontoKategorie | null })}>
              <option value="">alle</option>
              {FIN_KONTO_KATEGORIEN.map((k) => <option key={k.wert} value={k.wert}>{k.text}</option>)}
            </select>
          </label>
          <label className="ap-chip ap-chip-haken">
            <input type="checkbox" checked={filter.nurBebucht} onChange={(e) => setze({ nurBebucht: e.target.checked })} />
            <span>nur bebuchte</span>
          </label>
          <label className="ap-chip ap-chip-haken">
            <input type="checkbox" checked={filter.ausgeblendete} onChange={(e) => setze({ ausgeblendete: e.target.checked })} />
            <span>ausgeblendete zeigen</span>
          </label>
          <label className="ap-chip ap-chip-suche">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={sucheRef} value={filter.text} placeholder="Nummer oder Bezeichnung (F2)" aria-label="Konten durchsuchen"
              onChange={(e) => setze({ text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape" && filter.text) { e.preventDefault(); setze({ text: "" }); } }} />
          </label>
          <SpaltenWahl spalten={alleSpalten} aus={aus} onAus={setAus} />
          <button type="button" className="es-knopf" onClick={() => csv(false)} disabled={!zeilen.length}>CSV</button>
          {darfKonten && <button type="button" className="es-knopf" onClick={() => setNeu(true)}>Eigenes Konto</button>}
        </div>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
        {markiert.size > 0 && (
          <div className="ap-sammel" role="status">
            <b>{markiert.size} markiert</b>
            <button type="button" className="es-knopf" onClick={() => csv(true)}>Markierte als CSV</button>
            <button type="button" className="es-knopf" onClick={() => setMarkiert(new Set())}>Auswahl aufheben</button>
          </div>
        )}

        <DatenTabelle label={`Konten ${jahr}`} spalten={spalten} zeilen={zeilen} schluessel={key}
          auswahl={gewaehlt ? key(gewaehlt) : null} onAuswahl={setAuswahl} onOeffnen={(z) => onKontoblatt(z.konto.nummer)}
          markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung}
          zeilenKlasse={(z) => (z.konto.aktiv ? undefined : "ap-leise")}
          summe={<>Summe aller Konten im Zeitraum: Soll <b>{betragText(soll)}</b> · Haben <b>{betragText(haben)}</b>
            {stimmt ? " – stimmt überein" : <b className="ap-rot"> – weicht ab</b>}</>}
          leer={laedt ? "Lädt …" : "Kein Konto passt zum Filter."} />

        <div className="ap-status">
          <span><b>{zeilen.length}</b> von {konten.length} Konten</span>
          <span className="ap-tasten">↑ ↓ wählen · Enter oder F3 öffnet das Kontoblatt · F2 Suche</span>
        </div>
      </div>

      <aside className="ap-detail" aria-label="Gewähltes Konto">
        {gewaehlt ? (
          <>
            <h3>{kontoNr(gewaehlt.konto.nummer)} {gewaehlt.konto.bezeichnung}</h3>
            <div className="small">{ART_TEXT[gewaehlt.konto.kategorie]}{gewaehlt.konto.eigen ? " · eigenes Konto" : ""}{gewaehlt.konto.aktiv ? "" : " · ausgeblendet"}</div>
            <div className="ap-saldo">
              <span>Eröffnung</span><b>{saldoText(gewaehlt.eroeffnung)}</b>
              <span>Soll</span><b>{betragText(gewaehlt.soll)}</b>
              <span>Haben</span><b>{betragText(gewaehlt.haben)}</b>
              <span>Saldo</span><b>{saldoText(gewaehlt.ende)}</b>
            </div>
            <div className="ap-links">
              <button type="button" className="es-knopf" onClick={() => onKontoblatt(gewaehlt.konto.nummer)}>Kontoblatt (Enter)</button>
              {darfKonten && (
                <button type="button" className="es-knopf" onClick={() => void umschalten(gewaehlt.konto)}>
                  {gewaehlt.konto.aktiv ? "Ausblenden" : "Einblenden"}
                </button>
              )}
            </div>
            <span className="small">Ausgeblendete Konten lassen sich nicht mehr bebuchen; gelöscht wird kein Konto.</span>
          </>
        ) : <span className="small">Kein Konto gewählt.</span>}
      </aside>
      {neu && <KontoNeu supabase={supabase} rahmen={rahmen} konten={konten} onClose={() => setNeu(false)} />}
    </div>
  );
}

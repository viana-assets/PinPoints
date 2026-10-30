"use client";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { fehlerText } from "@/components/FehlerHinweis";
import { DatenTabelle, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { ZeitraumWahl } from "./arbeitsplatz/Werkzeuge";
import { qk } from "@/lib/queries/keys";
import { finKostenstelleSpeichern, finKostenstellenUebernehmen } from "@/lib/api/finance";
import type { FinBuchung, FinKonto } from "@/lib/finance/buchung";
import { betragText, type Sortierung } from "@/lib/finance/arbeitsplatz";
import { zeitraumVorgaben, type Zeitraum } from "@/lib/finance/kontoblatt";
import { FIN_KOST_ARTEN, kostNummerFehler, kostenAuswertung, type FinKostenstelle, type KostArt } from "@/lib/finance/kostenstellen";

// Finance › Buchungen › Kostenstellen am Rechner (Migration 108, v182, docs/finance.md Abschnitt 14): die Transporter
// (KOST1) und Leistungsarten (KOST2) mit Erlösen, Aufwand und Ergebnis im Zeitraum – dazu je Art, was ohne Kostenstelle
// gebucht ist. Rechts ändern oder neu anlegen; „Transporter übernehmen“ holt neue Firmenfahrzeuge als KOST1.

type Zeile = { key: string; art: KostArt; k: FinKostenstelle | null; erloese: number; aufwand: number; ergebnis: number; anzahl: number };
const ART_TEXT = Object.fromEntries(FIN_KOST_ARTEN.map((a) => [a.wert, a.text])) as Record<KostArt, string>;

export function FinanceKostenstellen({ supabase, jahr, buchungen, konten, kostenstellen, laedt, fehlt, darfPflegen }: {
  supabase: SupabaseClient; jahr: number; buchungen: FinBuchung[]; konten: FinKonto[]; kostenstellen: FinKostenstelle[];
  laedt: boolean; fehlt: boolean; darfPflegen: boolean;
}) {
  const queryClient = useQueryClient();
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => zeitraumVorgaben(jahr)[0]);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const [neu, setNeu] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const werte = useMemo(() => kostenAuswertung(buchungen, konten, zeitraum.von, zeitraum.bis), [buchungen, konten, zeitraum]);
  const zeilenRoh: Zeile[] = [
    ...FIN_KOST_ARTEN.flatMap((a) => [
      ...kostenstellen.filter((k) => k.art === a.wert).sort((x, y) => x.nummer.localeCompare(y.nummer, "de", { numeric: true })).map((k) => {
        const w = werte.find((x) => x.art === a.wert && x.nummer === k.nummer);
        return { key: k.id, art: a.wert, k, erloese: w?.erloese ?? 0, aufwand: w?.aufwand ?? 0, ergebnis: w?.ergebnis ?? 0, anzahl: w?.anzahl ?? 0 };
      }),
      ...(() => {
        const w = werte.find((x) => x.art === a.wert && x.nummer == null);
        return w ? [{ key: `ohne-${a.wert}`, art: a.wert, k: null, erloese: w.erloese, aufwand: w.aufwand, ergebnis: w.ergebnis, anzahl: w.anzahl }] : [];
      })(),
    ]),
  ];
  const spalten: Spalte<Zeile>[] = [
    { key: "art", titel: "Art", wert: (z) => ART_TEXT[z.art], fest: true },
    { key: "nummer", titel: "Nummer", wert: (z) => z.k?.nummer ?? null, fest: true },
    { key: "bezeichnung", titel: "Bezeichnung", wert: (z) => z.k?.bezeichnung ?? FIN_KOST_ARTEN.find((a) => a.wert === z.art)!.leer, max: 240,
      zeige: (z) => (z.k ? <>{z.k.bezeichnung}{!z.k.aktiv && <span className="ap-marke">ausgeblendet</span>}</> : <span className="ap-leise-text">{FIN_KOST_ARTEN.find((a) => a.wert === z.art)!.leer}</span>) },
    { key: "erloese", titel: "Erlöse", zahl: true, wert: (z) => z.erloese, zeige: (z) => (z.erloese ? betragText(z.erloese) : "") },
    { key: "aufwand", titel: "Aufwand", zahl: true, wert: (z) => z.aufwand, zeige: (z) => (z.aufwand ? betragText(z.aufwand) : "") },
    { key: "ergebnis", titel: "Ergebnis", zahl: true, wert: (z) => z.ergebnis,
      zeige: (z) => (z.erloese || z.aufwand ? <span className={z.ergebnis < 0 ? "ap-rot" : undefined}>{betragText(z.ergebnis)}</span> : "") },
    { key: "anzahl", titel: "Zeilen", zahl: true, wert: (z) => z.anzahl, zeige: (z) => z.anzahl || "" },
  ];
  const sortSpalte = spalten.find((s) => s.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte
    ? [...zeilenRoh].sort((a, b) => {
      const x = sortSpalte.wert(a), y = sortSpalte.wert(b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "de", { numeric: true });
      return sortierung.richtung === "auf" ? d : -d;
    })
    : zeilenRoh;
  const gewaehlt = zeilen.find((z) => z.key === auswahl) ?? null;
  // Gesamtergebnis einmal (über KOST2 – jede Erlös-/Aufwandszeile steht genau einmal bei einer Art, mit oder ohne).
  const gesamt = werte.filter((w) => w.art === "kost2").reduce((s, w) => ({ e: s.e + w.erloese, a: s.a + w.aufwand }), { e: 0, a: 0 });

  async function uebernehmen() {
    setFehler(null);
    setMeldung(null);
    try {
      const n = await finKostenstellenUebernehmen(supabase);
      await queryClient.invalidateQueries({ queryKey: qk.finKostenstellen() });
      setMeldung(n ? (n === 1 ? "1 Kostenstelle dazugekommen." : `${n} Kostenstellen dazugekommen.`) : "Alle aktiven Transporter und die Leistungsarten sind schon da.");
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  if (fehlt) return <div className="fi-hinweis fi-rot" role="alert">Die Kostenstellen konnten nicht geladen werden. Ist Migration 108 ausgeführt?</div>;

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Kostenstellen">
          <ZeitraumWahl jahr={jahr} wert={zeitraum} onWert={setZeitraum} />
          <span className="ap-luft ap-luft-voll" />
          {darfPflegen && <button type="button" className="es-knopf" onClick={() => void uebernehmen()}>Transporter übernehmen</button>}
          {darfPflegen && <button type="button" className="btn-primary ap-neu" onClick={() => { setNeu(true); setAuswahl(null); setFehler(null); }}>+ Kostenstelle</button>}
        </div>
        {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
        <DatenTabelle label={`Kostenstellen ${jahr}`} spalten={spalten} zeilen={zeilen} schluessel={(z) => z.key}
          auswahl={gewaehlt?.key ?? null} onAuswahl={(k) => { setAuswahl(k); setNeu(false); }} markiert={markiert} onMarkiert={setMarkiert}
          sortierung={sortierung} onSortierung={setSortierung} zeilenKlasse={(z) => (z.k && !z.k.aktiv ? "ap-leise" : !z.k ? "ap-leise" : undefined)}
          summe={<>Gesamt im Zeitraum: Erlöse <b>{betragText(gesamt.e)}</b> · Aufwand <b>{betragText(gesamt.a)}</b> · Ergebnis <b>{betragText(gesamt.e - gesamt.a)}</b></>}
          leer={laedt ? "Lädt …" : "Noch keine Kostenstelle – „Transporter übernehmen“ legt die Fahrzeuge und Leistungsarten an."} />
        <div className="ap-status">
          <span>Erlöse und Aufwand ohne Steuer; Anlagekonten zählen nicht (die Abschreibung schon).</span>
        </div>
      </div>
      <aside className="ap-detail" aria-label="Gewählte Kostenstelle">
        {neu ? <KostFormular key="neu" supabase={supabase} k={null} darf={darfPflegen} onFertig={(t) => { setNeu(false); setMeldung(t); }} />
          : gewaehlt?.k ? <KostFormular key={gewaehlt.k.id} supabase={supabase} k={gewaehlt.k} darf={darfPflegen} onFertig={setMeldung} />
          : <span className="small">Eine Kostenstelle wählen, um sie zu ändern. Gebucht wird sie im Stapel, im Buchungsfenster und an Vorlagen.</span>}
      </aside>
    </div>
  );
}

function KostFormular({ supabase, k, darf, onFertig }: { supabase: SupabaseClient; k: FinKostenstelle | null; darf: boolean; onFertig: (t: string) => void }) {
  const queryClient = useQueryClient();
  const [art, setArt] = useState<KostArt>(k?.art ?? "kost1");
  const [nummer, setNummer] = useState(k?.nummer ?? "");
  const [bezeichnung, setBezeichnung] = useState(k?.bezeichnung ?? "");
  const [aktiv, setAktiv] = useState(k?.aktiv ?? true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const pruefung = kostNummerFehler(nummer) ?? (!bezeichnung.trim() ? "Die Bezeichnung fehlt." : null);
  async function speichern() {
    if (pruefung) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await finKostenstelleSpeichern(supabase, k?.id ?? null, { art, nummer: nummer.trim(), bezeichnung: bezeichnung.trim(), aktiv });
      await queryClient.invalidateQueries({ queryKey: qk.finKostenstellen() });
      onFertig(k ? `${nummer.trim()} gespeichert.` : `${nummer.trim()} angelegt.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <div className="fi-formular" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void speichern(); } }}>
      <h3>{k ? `${k.nummer} · ${k.bezeichnung}` : "Neue Kostenstelle"}</h3>
      <label className="nk-feld"><span>Art</span>
        <select value={art} onChange={(e) => setArt(e.target.value as KostArt)} disabled={!darf} aria-label="Art">
          {FIN_KOST_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.text} ({a.datev})</option>)}
        </select>
      </label>
      <label className="nk-feld"><span>Nummer (für DATEV, bis 8 Zeichen)</span>
        <input value={nummer} maxLength={8} onChange={(e) => setNummer(e.target.value)} disabled={!darf} aria-label="Nummer" />
      </label>
      <label className="nk-feld"><span>Bezeichnung</span>
        <input value={bezeichnung} maxLength={60} onChange={(e) => setBezeichnung(e.target.value)} disabled={!darf} aria-label="Bezeichnung" />
      </label>
      <label className="nk-feld fi-haken"><input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} disabled={!darf} /> <span>aktiv (wählbar)</span></label>
      {k?.firmenfahrzeug_id && <span className="small">Gehört zu einem Firmenfahrzeug.</span>}
      {(fehler || (pruefung && (nummer || bezeichnung))) && <div className="fi-hinweis fi-rot" role="alert">{fehler ?? pruefung}</div>}
      {darf && <button type="button" className="btn-primary" onClick={() => void speichern()} disabled={laeuft || !!pruefung}>{laeuft ? "speichert …" : "Speichern"}</button>}
      <span className="small">Art und Nummer stehen fest, sobald auf die Kostenstelle gebucht ist – die Bezeichnung bleibt änderbar.</span>
    </div>
  );
}

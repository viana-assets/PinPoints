"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { DatenTabelle, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { BetragFeld, KontoFeld } from "./arbeitsplatz/KontoFeld";
import { qk } from "@/lib/queries/keys";
import { useFinStapel, useFinVorlagen, useFinWiederkehrend } from "@/lib/queries/hooks";
import { finVorlageLoeschen, finVorlageSpeichern, finWiederkehrendLoeschen, finWiederkehrendSpeichern } from "@/lib/api/finance";
import { betragLesen, kontoNr, passendeSchluessel, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragText, datumDe, type Sortierung } from "@/lib/finance/arbeitsplatz";
import { FIN_WK_RHYTHMEN, naechsterOffenerTermin, vorlagenSortiert, type FinVorlage, type FinWiederkehrend, type FinWkRhythmus } from "@/lib/finance/vorlagen";

// Finance › Buchungen › Vorlagen am Rechner (Migration 107, v181, docs/finance.md Abschnitt 13): oben die
// Buchungsvorlagen (im Stapel wählbar), darunter die wiederkehrenden Buchungen (im Stapel mit „Wiederkehrende holen“
// als Zeilen übernommen – gebucht wird nichts von selbst). Enter oder Doppelklick öffnet zum Ändern.

const RHYTHMUS_TEXT = Object.fromEntries(FIN_WK_RHYTHMEN.map((r) => [r.wert, r.text])) as Record<FinWkRhythmus, string>;

export function FinanceVorlagen({ supabase, jahr, heute, einstellungen, konten, schluessel, darfBuchen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen; konten: FinKonto[];
  schluessel: FinSteuerschluessel[]; darfBuchen: boolean;
}) {
  const vorlagenQ = useFinVorlagen(supabase, true);
  const wkQ = useFinWiederkehrend(supabase, true);
  const stapelQ = useFinStapel(supabase, jahr, true);
  const vergeben = (stapelQ.data ?? []).flatMap((s) => s.fin_stapel_zeilen);
  const [offen, setOffen] = useState<{ art: "vorlage"; v: FinVorlage | null } | { art: "wk"; w: FinWiederkehrend | null } | null>(null);
  const [auswahlV, setAuswahlV] = useState<string | null>(null);
  const [auswahlW, setAuswahlW] = useState<string | null>(null);
  const [markiertV, setMarkiertV] = useState<Set<string>>(() => new Set());
  const [markiertW, setMarkiertW] = useState<Set<string>>(() => new Set());
  const [sortV, setSortV] = useState<Sortierung>(null);
  const [sortW, setSortW] = useState<Sortierung>(null);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const konto = (n: number) => <span title={name(n)}>{kontoNr(n)}</span>;

  if (vorlagenQ.isError || wkQ.isError) {
    return <div className="fi-hinweis fi-rot" role="alert">Vorlagen konnten nicht geladen werden. Ist Migration 107 ausgeführt?</div>;
  }
  const vorlagen = vorlagenSortiert(vorlagenQ.data ?? []);
  const wks = wkQ.data ?? [];

  const spaltenV: Spalte<FinVorlage>[] = [
    { key: "kurz", titel: "Kurzname", wert: (v) => v.kurz, fest: true },
    { key: "text", titel: "Buchungstext", wert: (v) => v.text, max: 260 },
    { key: "soll", titel: "Soll", wert: (v) => v.soll, zeige: (v) => konto(v.soll) },
    { key: "haben", titel: "Haben", wert: (v) => v.haben, zeige: (v) => konto(v.haben) },
    { key: "steuer", titel: "Steuer", wert: (v) => v.steuer },
    { key: "betrag", titel: "Betrag", zahl: true, wert: (v) => v.betrag, zeige: (v) => (v.betrag != null ? betragText(v.betrag) : <span className="ap-leise-text">jedes Mal</span>) },
  ];
  const spaltenW: Spalte<FinWiederkehrend>[] = [
    { key: "text", titel: "Buchungstext", wert: (w) => w.text, fest: true, max: 240 },
    { key: "soll", titel: "Soll", wert: (w) => w.soll, zeige: (w) => konto(w.soll) },
    { key: "haben", titel: "Haben", wert: (w) => w.haben, zeige: (w) => konto(w.haben) },
    { key: "steuer", titel: "Steuer", wert: (w) => w.steuer },
    { key: "betrag", titel: "Betrag", zahl: true, wert: (w) => w.betrag, zeige: (w) => betragText(w.betrag) },
    { key: "rhythmus", titel: "Rhythmus", wert: (w) => RHYTHMUS_TEXT[w.rhythmus] },
    { key: "ab", titel: "ab", wert: (w) => w.ab, zeige: (w) => datumDe(w.ab) },
    { key: "bis", titel: "bis", wert: (w) => w.bis, zeige: (w) => (w.bis ? datumDe(w.bis) : "") },
    { key: "naechst", titel: "Nächster offen", wert: (w) => naechsterOffenerTermin(w, vergeben),
      zeige: (w) => { const t = naechsterOffenerTermin(w, vergeben); return w.aktiv ? (t ? datumDe(t) : "keiner mehr") : <span className="ap-zustand ap-z-festgeschrieben">pausiert</span>; } },
  ];
  const sortiert = <T,>(l: T[], s: Sortierung, sp: Spalte<T>[]) => {
    const x = sp.find((c) => c.key === s?.spalte);
    if (!s || !x) return l;
    return [...l].sort((a, b) => {
      const p = x.wert(a), q = x.wert(b);
      const d = typeof p === "number" && typeof q === "number" ? p - q : String(p ?? "").localeCompare(String(q ?? ""), "de", { numeric: true });
      return s.richtung === "auf" ? d : -d;
    });
  };

  return (
    <div className="ap-mitte">
      <div className="ap-abschnitt">
        <h3>Buchungsvorlagen</h3>
        <span className="small">Im Stapel über „Vorlage“ wählbar – füllt Konten, Steuer, Text und, wenn hinterlegt, den Betrag.</span>
        <span className="ap-luft ap-luft-voll" />
        {darfBuchen && <button type="button" className="btn-primary ap-neu" onClick={() => setOffen({ art: "vorlage", v: null })}>+ Vorlage</button>}
      </div>
      <DatenTabelle label="Buchungsvorlagen" spalten={spaltenV} zeilen={sortiert(vorlagen, sortV, spaltenV)} schluessel={(v) => v.id}
        auswahl={auswahlV} onAuswahl={setAuswahlV} onOeffnen={(v) => { if (darfBuchen) setOffen({ art: "vorlage", v }); }}
        markiert={markiertV} onMarkiert={setMarkiertV} sortierung={sortV} onSortierung={setSortV} klasse="ap-tabelle-kurz"
        leer={vorlagenQ.isPending ? "Lädt …" : "Noch keine Vorlage – im Stapel geht es auch mit „Als Vorlage“."} />

      <div className="ap-abschnitt">
        <h3>Wiederkehrende Buchungen</h3>
        <span className="small">Im Stapel holt „Wiederkehrende holen“ die fälligen Termine als Zeilen – gebucht wird erst mit dem Stapel.</span>
        <span className="ap-luft ap-luft-voll" />
        {darfBuchen && <button type="button" className="btn-primary ap-neu" onClick={() => setOffen({ art: "wk", w: null })}>+ Wiederkehrende</button>}
      </div>
      <DatenTabelle label="Wiederkehrende Buchungen" spalten={spaltenW} zeilen={sortiert(wks, sortW, spaltenW)} schluessel={(w) => w.id}
        auswahl={auswahlW} onAuswahl={setAuswahlW} onOeffnen={(w) => { if (darfBuchen) setOffen({ art: "wk", w }); }}
        markiert={markiertW} onMarkiert={setMarkiertW} sortierung={sortW} onSortierung={setSortW} klasse="ap-tabelle-kurz"
        zeilenKlasse={(w) => (w.aktiv ? undefined : "ap-leise")}
        leer={wkQ.isPending ? "Lädt …" : "Noch keine – etwa Miete, Leasing, Versicherung, Kontoführung."} />
      <div className="ap-status"><span className="ap-tasten">↑ ↓ wählen · Enter oder Doppelklick ändert</span></div>

      {offen && (
        <VorlageFormular supabase={supabase} art={offen.art} vorlage={offen.art === "vorlage" ? offen.v : null}
          wk={offen.art === "wk" ? offen.w : null} heute={heute} einstellungen={einstellungen} konten={konten} schluessel={schluessel}
          onClose={() => setOffen(null)} />
      )}
    </div>
  );
}

// Anlegen und ändern – für Vorlage und wiederkehrende Buchung dasselbe Fenster; `vorbelegt` füllt eine neue Vorlage
// aus der Erfassungszeile des Stapels („Als Vorlage“).
export function VorlageFormular({ supabase, art, vorlage, wk, vorbelegt, heute, einstellungen, konten, schluessel, onGespeichert, onClose }: {
  supabase: SupabaseClient; art: "vorlage" | "wk"; vorlage?: FinVorlage | null; wk?: FinWiederkehrend | null;
  vorbelegt?: Partial<Omit<FinVorlage, "id">>;
  heute: string; einstellungen: FinEinstellungen; konten: FinKonto[]; schluessel: FinSteuerschluessel[];
  onGespeichert?: () => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const alt = art === "vorlage" ? vorlage ?? null : wk ?? null;
  const start = alt ?? vorbelegt ?? {};
  const [kurz, setKurz] = useState(vorlage?.kurz ?? "");
  const [text, setText] = useState(start.text ?? "");
  const [soll, setSoll] = useState<number | null>(start.soll ?? null);
  const [haben, setHaben] = useState<number | null>(start.haben ?? null);
  const [betrag, setBetrag] = useState(start.betrag != null ? betragText(start.betrag) : "");
  const [steuer, setSteuer] = useState(start.steuer ?? "");
  const [rhythmus, setRhythmus] = useState<FinWkRhythmus>(wk?.rhythmus ?? "monat");
  const [ab, setAb] = useState(wk?.ab ?? heute);
  const [bis, setBis] = useState(wk?.bis ?? "");
  const [aktiv, setAktiv] = useState(wk?.aktiv ?? true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const passend = passendeSchluessel(schluessel, einstellungen);
  const b = betrag.trim() ? betragLesen(betrag) : null;
  const pruefung = art === "vorlage" && !kurz.trim() ? "Der Kurzname fehlt."
    : !text.trim() ? "Der Buchungstext fehlt."
    : soll == null || haben == null ? "Soll- und Haben-Konto angeben."
    : soll === haben ? "Soll und Haben sind dasselbe Konto."
    : betrag.trim() && (b == null || !(b > 0)) ? "Der Betrag ist keine Zahl größer 0."
    : art === "wk" && b == null ? "Eine wiederkehrende Buchung braucht einen festen Betrag."
    : art === "wk" && !ab ? "Der erste Termin fehlt."
    : art === "wk" && bis && bis < ab ? "„Bis“ liegt vor dem ersten Termin."
    : null;

  async function speichern() {
    if (pruefung || soll == null || haben == null) return;
    setLaeuft(true);
    setFehler(null);
    try {
      if (art === "vorlage") {
        await finVorlageSpeichern(supabase, vorlage?.id ?? null, { kurz: kurz.trim(), text: text.trim(), soll, haben, betrag: b, steuer: steuer || null });
        await queryClient.invalidateQueries({ queryKey: qk.finVorlagen() });
      } else {
        await finWiederkehrendSpeichern(supabase, wk?.id ?? null, { text: text.trim(), soll, haben, betrag: b as number, steuer: steuer || null, rhythmus, ab, bis: bis || null, aktiv });
        await queryClient.invalidateQueries({ queryKey: qk.finWiederkehrend() });
      }
      onGespeichert?.();
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }
  async function loeschen() {
    if (!alt) return;
    setLaeuft(true);
    setFehler(null);
    try {
      if (art === "vorlage") { await finVorlageLoeschen(supabase, alt.id); await queryClient.invalidateQueries({ queryKey: qk.finVorlagen() }); }
      else { await finWiederkehrendLoeschen(supabase, alt.id); await queryClient.invalidateQueries({ queryKey: qk.finWiederkehrend() }); }
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  const titel = art === "vorlage" ? (alt ? "Vorlage ändern" : "Neue Buchungsvorlage") : (alt ? "Wiederkehrende Buchung ändern" : "Neue wiederkehrende Buchung");
  return (
    <Blatt titel={titel} unter="Strg+Enter speichert" breite="breit" onClose={onClose}
      fuss={<>
        {alt && (loeschFrage
          ? <button type="button" className="btn-danger" onClick={() => void loeschen()} disabled={laeuft}>Wirklich löschen</button>
          : <button type="button" className="btn-secondary" onClick={() => setLoeschFrage(true)} disabled={laeuft}>Löschen …</button>)}
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void speichern()} disabled={laeuft || !!pruefung}>{laeuft ? "speichert …" : "Speichern"}</button>
      </>}>
      <div className="fi-formular" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void speichern(); } }}>
        {art === "vorlage" && (
          <label className="nk-feld"><span>Kurzname (zum Wählen im Stapel)</span>
            <input value={kurz} maxLength={40} autoFocus onChange={(e) => setKurz(e.target.value)} placeholder="z. B. Tanken" />
          </label>
        )}
        <label className="nk-feld"><span>Buchungstext{art === "wk" ? " (der Monat kommt dazu, z. B. „… 02/2027“)" : ""}</span>
          <input value={text} maxLength={art === "wk" ? 180 : 200} autoFocus={art === "wk"} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Soll</span><KontoFeld konten={konten} wert={soll} onWert={setSoll} label="Soll-Konto" /></label>
          <label className="nk-feld"><span>Haben</span><KontoFeld konten={konten} wert={haben} onWert={setHaben} label="Haben-Konto" /></label>
        </div>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Betrag in € {art === "vorlage" ? "(leer = jedes Mal neu)" : ""}</span>
            <BetragFeld text={betrag} onText={setBetrag} label="Betrag" />
          </label>
          <label className="nk-feld"><span>Steuer</span>
            <select value={steuer} onChange={(e) => setSteuer(e.target.value)} aria-label="Steuer">
              <option value="">ohne Steuerschlüssel</option>
              {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
            </select>
          </label>
        </div>
        {art === "wk" && (
          <>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Rhythmus</span>
                <select value={rhythmus} onChange={(e) => setRhythmus(e.target.value as FinWkRhythmus)} aria-label="Rhythmus">
                  {FIN_WK_RHYTHMEN.map((r) => <option key={r.wert} value={r.wert}>{r.text}</option>)}
                </select>
              </label>
              <label className="nk-feld"><span>Erster Termin</span><input type="date" value={ab} onChange={(e) => setAb(e.target.value)} aria-label="Erster Termin" /></label>
            </div>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Bis (leer = ohne Ende)</span><input type="date" value={bis} onChange={(e) => setBis(e.target.value)} aria-label="Bis" /></label>
              <label className="nk-feld fi-haken"><input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} /> <span>aktiv (pausiert wird nichts geholt)</span></label>
            </div>
            <span className="small">Termine: gleicher Tag im Monat, am Monatsende abgeschnitten (31.01. → 28.02. → 31.03.). Erster Termin und Rhythmus
              stehen fest, sobald ein Termin geholt ist.</span>
          </>
        )}
        {/* Ein leeres neues Fenster schimpft noch nicht – erst, wenn etwas eingetragen ist. */}
        {(fehler || (pruefung && (alt || text || kurz || soll != null || haben != null || betrag))) && <div className="fi-hinweis fi-rot" role="alert">{fehler ?? pruefung}</div>}
      </div>
    </Blatt>
  );
}

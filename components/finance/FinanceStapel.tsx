"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { DatenTabelle, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { BetragFeld, KontoFeld } from "./arbeitsplatz/KontoFeld";
import { useKurzbefehle } from "./arbeitsplatz/Werkzeuge";
import { ZeilenTabelle } from "./FinanceBuchungen";
import { qk } from "@/lib/queries/keys";
import { useFinStapel } from "@/lib/queries/hooks";
import { finStapelAnlegen, finStapelBuchen, finStapelLoeschen, finStapelZeileLoeschen, finStapelZeileSpeichern } from "@/lib/api/finance";
import { betragLesen, kontoNr, passendeSchluessel, type FinBuchung, type FinFestschreibung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragText, datumDe, type Sortierung } from "@/lib/finance/arbeitsplatz";
import {
  belegWeiter, datumAusEingabe, datumKurz, eingabeAlsZeile, stapelReihenfolge, stapelSumme, stapelZeilePruefen,
  type FinStapelZeile, type StapelEingabe,
} from "@/lib/finance/stapel";

// Finance › Buchungen › Stapel am Rechner (Migration 106, v180, Stufe C Teil 1, docs/finance.md Abschnitt 12):
// Buchungen erst erfassen – vorläufig, änderbar –, dann mit „Stapel buchen“ (Strg+S) auf einmal ins Journal. Oben die
// Erfassungszeile wie bei DATEV: Datum (TTMM), Beleg, Soll, Haben, Betrag, Steuer, Text; Enter springt ins nächste Feld,
// im letzten übernimmt es die Zeile. Jede Zeile wird gleich so geprüft, wie `fin_buchen()` sie beim Buchen prüfen
// wird (`stapelZeilePruefen`, lib/finance/stapel.ts); gebucht wird nur, wenn alle stimmen – alle oder keine.

const LEER: StapelEingabe = { datum: "", beleg: "", soll: null, haben: null, betrag: "", steuer: "", text: "" };
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function FinanceStapel({ supabase, jahr, heute, einstellungen, konten, schluessel, fest, buchungen, darfBuchen, onMeldung, onOeffnen, onKontoblatt }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  einstellungen: FinEinstellungen;
  konten: FinKonto[];
  schluessel: FinSteuerschluessel[];
  fest: FinFestschreibung[];
  // Das Journal – für die Nummern der gebuchten Zeilen.
  buchungen: FinBuchung[];
  darfBuchen: boolean;
  onMeldung: (t: string) => void;
  onOeffnen: (b: FinBuchung) => void;
  onKontoblatt: (n: number) => void;
}) {
  const queryClient = useQueryClient();
  const stapelQ = useFinStapel(supabase, jahr, true);
  const alle = useMemo(() => stapelQ.data ?? [], [stapelQ.data]);
  // Offene zuerst (neueste oben), dann die gebuchten.
  const liste = [...alle].sort((a, b) => (a.zustand === b.zustand ? b.erstellt_am.localeCompare(a.erstellt_am) : a.zustand === "offen" ? -1 : 1));
  const [wahl, setWahl] = useState<string | null>(null);
  const stapel = liste.find((s) => s.id === wahl) ?? liste[0] ?? null;
  const offen = stapel?.zustand === "offen" && darfBuchen;

  const [eingabe, setEingabe] = useState<StapelEingabe>(() => ({ ...LEER, datum: heute.slice(0, 4) === String(jahr) ? datumKurz(heute) : "" }));
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [formNr, setFormNr] = useState(0);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [frage, setFrage] = useState<"buchen" | "loeschen" | null>(null);
  const [neuName, setNeuName] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const erfassungRef = useRef<HTMLDivElement>(null);

  const passend = passendeSchluessel(schluessel, einstellungen);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const pruefe = (z: Pick<FinStapelZeile, "datum" | "soll" | "haben" | "betrag" | "steuer" | "text">) =>
    stapelZeilePruefen(z, jahr, konten, schluessel, einstellungen, fest);

  const zeilenRoh = stapel ? stapelReihenfolge(stapel.fin_stapel_zeilen) : [];
  const pruefungen = new Map(zeilenRoh.map((z) => [z.id, pruefe(z)]));
  const mitFehler = stapel?.zustand === "offen" ? zeilenRoh.filter((z) => pruefungen.get(z.id)?.fehler).length : 0;
  const nrVon = (id: string | null) => (id ? buchungen.find((b) => b.id === id) ?? null : null);
  const gewaehlt = zeilenRoh.find((z) => z.id === auswahl) ?? null;
  const gewPruefung = gewaehlt ? pruefungen.get(gewaehlt.id) : undefined;
  const gewBuchung = gewaehlt ? nrVon(gewaehlt.buchung_id) : null;

  const spalten: Spalte<FinStapelZeile>[] = [
    { key: "pos", titel: "Pos.", zahl: true, wert: (z) => zeilenRoh.indexOf(z) + 1, fest: true },
    { key: "datum", titel: "Datum", wert: (z) => z.datum, zeige: (z) => datumKurz(z.datum) },
    { key: "beleg", titel: "Beleg", wert: (z) => z.beleg },
    { key: "soll", titel: "Soll", wert: (z) => z.soll, zeige: (z) => <span title={name(z.soll)}>{kontoNr(z.soll)}</span> },
    { key: "haben", titel: "Haben", wert: (z) => z.haben, zeige: (z) => <span title={name(z.haben)}>{kontoNr(z.haben)}</span> },
    { key: "steuer", titel: "Steuer", wert: (z) => z.steuer },
    { key: "betrag", titel: "Betrag", zahl: true, wert: (z) => z.betrag, zeige: (z) => betragText(z.betrag), fest: true },
    { key: "text", titel: "Buchungstext", wert: (z) => z.text, fest: true, max: 260 },
    stapel?.zustand === "gebucht"
      ? { key: "buchung", titel: "Buchung", wert: (z) => nrVon(z.buchung_id)?.nr ?? null,
          zeige: (z) => { const b = nrVon(z.buchung_id); return b ? `${b.jahr}-${b.nr}` : ""; } }
      : { key: "pruefung", titel: "Prüfung", wert: (z) => pruefungen.get(z.id)?.fehler ?? "", max: 220,
          zeige: (z) => { const f = pruefungen.get(z.id)?.fehler; return f ? <span className="ap-zustand ap-z-storniert" title={f}>{f}</span> : <span className="ap-zustand">bereit</span>; } },
  ];
  const sortSpalte = spalten.find((s) => s.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte
    ? [...zeilenRoh].sort((a, b) => {
      const x = sortSpalte.wert(a), y = sortSpalte.wert(b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "de", { numeric: true });
      return sortierung.richtung === "auf" ? d : -d;
    })
    : zeilenRoh;

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: qk.finStapel(jahr) });
  }
  const fokusFeld = (feld: keyof StapelEingabe) => {
    requestAnimationFrame(() => {
      const el = erfassungRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-feld="${feld}"] input, [data-feld="${feld}"] select, input[data-feld="${feld}"], select[data-feld="${feld}"]`);
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    });
  };
  const leeren = (naechsterBeleg: string) => {
    setEingabe({ ...LEER, datum: eingabe.datum, beleg: naechsterBeleg, steuer: eingabe.steuer });
    setBearbeite(null);
    setFormNr(formNr + 1);
    fokusFeld("datum");
  };

  async function uebernehmen() {
    if (!stapel || !offen) return;
    const r = eingabeAlsZeile(eingabe, jahr, betragLesen);
    if (!r.ok) { setHinweis(r.fehler); fokusFeld(r.feld); return; }
    setLaeuft(true);
    setHinweis(null);
    try {
      await finStapelZeileSpeichern(supabase, stapel.id, bearbeite, r.zeile);
      await neuLaden();
      leeren(bearbeite ? "" : r.zeile.beleg ? belegWeiter(r.zeile.beleg) : "");
    } catch (e) {
      setHinweis(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  function bearbeiten(z: FinStapelZeile) {
    if (!offen) return;
    setEingabe({ datum: datumKurz(z.datum), beleg: z.beleg ?? "", soll: z.soll, haben: z.haben, betrag: betragText(z.betrag), steuer: z.steuer ?? "", text: z.text });
    setBearbeite(z.id);
    setFormNr(formNr + 1);
    setHinweis(null);
    fokusFeld("datum");
  }

  async function zeileLoeschen(z: FinStapelZeile) {
    if (!offen) return;
    setFehler(null);
    try {
      await finStapelZeileLoeschen(supabase, z.id);
      if (bearbeite === z.id) leeren("");
      await neuLaden();
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  async function anlegen() {
    if (!neuName?.trim()) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const id = await finStapelAnlegen(supabase, jahr, neuName.trim());
      await neuLaden();
      setWahl(id);
      setNeuName(null);
      fokusFeld("datum");
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function buchen() {
    if (!stapel) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finStapelBuchen(supabase, stapel.id);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setFrage(null);
      onMeldung(`Stapel „${stapel.bezeichnung}“ gebucht: ${r.anzahl === 1 ? `Nr. ${r.jahr}-${r.von}` : `${r.anzahl} Buchungen, Nr. ${r.jahr}-${r.von} bis ${r.jahr}-${r.bis}`}.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function stapelLoeschen() {
    if (!stapel) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await finStapelLoeschen(supabase, stapel.id);
      setWahl(null);
      setFrage(null);
      await neuLaden();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  const kannBuchen = offen && zeilenRoh.length > 0 && mitFehler === 0;
  // Strg+S: Stapel buchen (fragt vorher) – wie das Speichern in jedem Programm, der Browser speichert nichts.
  useEffect(() => {
    const hoeren = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s" || document.querySelector("[role='dialog']")) return;
      e.preventDefault();
      if (kannBuchen) setFrage("buchen");
    };
    window.addEventListener("keydown", hoeren);
    return () => window.removeEventListener("keydown", hoeren);
  }, [kannBuchen]);
  useKurzbefehle((b) => {
    if (b === "neu" && offen) { fokusFeld("datum"); return true; }
    if (b === "konto" && gewaehlt) { onKontoblatt(gewaehlt.soll); return true; }
    return false;
  });

  // Enter springt ins nächste Feld; im letzten übernimmt es. Ein offenes Vorschlagsfeld (Konto) nimmt Enter selbst.
  function erfassungTaste(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && bearbeite) { e.preventDefault(); leeren(""); return; }
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.isDefaultPrevented()) return;
    const felder = [...(erfassungRef.current?.querySelectorAll<HTMLElement>("input, select") ?? [])];
    const i = felder.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    if (i === felder.length - 1) void uebernehmen();
    else felder[i + 1].focus();
  }
  const setze = (p: Partial<StapelEingabe>) => { setHinweis(null); setEingabe({ ...eingabe, ...p }); };

  // Vorschau der Erfassungszeile, sobald sie vollständig ist.
  const vorschau = (() => {
    const r = eingabeAlsZeile(eingabe, jahr, betragLesen);
    return r.ok ? pruefe(r.zeile) : null;
  })();
  const summe = stapelSumme(zeilenRoh);

  if (stapelQ.isError) {
    return <div className="fi-hinweis fi-rot" role="alert">Die Stapel konnten nicht geladen werden. Ist Migration 106 ausgeführt?</div>;
  }

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Stapel">
          <label className="ap-chip"><span>Stapel</span>
            <select aria-label="Stapel" value={stapel?.id ?? ""} onChange={(e) => { setWahl(e.target.value); setAuswahl(null); leeren(""); }} disabled={!liste.length}>
              {!liste.length && <option value="">noch keiner</option>}
              {liste.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung}{s.zustand === "gebucht" ? " (gebucht)" : ` (${s.fin_stapel_zeilen.length})`}</option>)}
            </select>
          </label>
          {darfBuchen && (
            <button type="button" className="es-knopf" onClick={() => { setFehler(null); setNeuName(`${MONATE[Number(heute.slice(5, 7)) - 1]} ${jahr}`); }}>+ Neuer Stapel</button>
          )}
          <span className="ap-luft ap-luft-voll" />
          {offen && <button type="button" className="es-knopf" onClick={() => { setFehler(null); setFrage("loeschen"); }}>Stapel löschen</button>}
          {offen && (
            <button type="button" className="btn-primary ap-neu" onClick={() => { setFehler(null); setFrage("buchen"); }} disabled={!kannBuchen}
              title={mitFehler ? `${mitFehler} Zeile(n) mit Fehler` : zeilenRoh.length ? undefined : "Der Stapel ist leer"}>
              Stapel buchen (Strg+S)
            </button>
          )}
        </div>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}

        {!stapel ? (
          <div className="db-karte es-karte ap-leerkarte">
            <b>Noch kein Buchungsstapel in {jahr}.</b>
            <span className="small">Im Stapel erfasst du Buchungen zuerst vorläufig – ändern und löschen geht, bis du den Stapel buchst. Dann
              stehen alle Zeilen auf einmal im Journal.</span>
          </div>
        ) : (
          <>
            {offen && (
              <div className={"ap-erfassung" + (bearbeite ? " ap-bearbeite" : "")} ref={erfassungRef} onKeyDown={erfassungTaste} role="group"
                aria-label={bearbeite ? "Zeile ändern" : "Neue Zeile erfassen"}>
                <label><span>Datum</span>
                  <input data-feld="datum" value={eingabe.datum} placeholder="TTMM" aria-label="Datum" inputMode="numeric" autoComplete="off"
                    onChange={(e) => setze({ datum: e.target.value })}
                    onBlur={() => { const d = datumAusEingabe(eingabe.datum, jahr); if (d) setze({ datum: datumKurz(d) }); }} />
                </label>
                <label><span>Beleg</span>
                  <input data-feld="beleg" value={eingabe.beleg} maxLength={60} aria-label="Beleg" autoComplete="off" onChange={(e) => setze({ beleg: e.target.value })} />
                </label>
                <label data-feld="soll"><span>Soll</span>
                  <KontoFeld key={`s${formNr}`} konten={konten} wert={eingabe.soll} onWert={(n) => setze({ soll: n })} label="Soll-Konto" />
                </label>
                <label data-feld="haben"><span>Haben</span>
                  <KontoFeld key={`h${formNr}`} konten={konten} wert={eingabe.haben} onWert={(n) => setze({ haben: n })} label="Haben-Konto" />
                </label>
                <label data-feld="betrag"><span>Betrag</span>
                  <BetragFeld text={eingabe.betrag} onText={(t) => setze({ betrag: t })} label="Betrag" />
                </label>
                <label><span>Steuer</span>
                  <select data-feld="steuer" value={eingabe.steuer} aria-label="Steuer" onChange={(e) => setze({ steuer: e.target.value })}>
                    <option value="">–</option>
                    {passend.map((s) => <option key={s.schluessel} value={s.schluessel} title={s.bezeichnung}>{s.schluessel}</option>)}
                  </select>
                </label>
                <label className="ap-erf-text"><span>Buchungstext</span>
                  <input data-feld="text" value={eingabe.text} maxLength={200} aria-label="Buchungstext" autoComplete="off" onChange={(e) => setze({ text: e.target.value })} />
                </label>
                <button type="button" className="btn-primary ap-erf-knopf" onClick={() => void uebernehmen()} disabled={laeuft}>
                  {bearbeite ? "Ändern ⏎" : "Übernehmen ⏎"}
                </button>
                <div className="ap-erf-fuss">
                  {hinweis ? <span className="ap-rot" role="alert">{hinweis}</span>
                    : vorschau?.fehler ? <span className="ap-rot">Beim Buchen: {vorschau.fehler}</span>
                    : vorschau ? <span>So wird gebucht: {vorschau.zeilen.map((x) => `${x.seite} ${kontoNr(x.konto)} ${betragText(x.betrag)}`).join(" · ")}</span>
                    : <span className="small">Enter springt weiter, im Text übernimmt es die Zeile{bearbeite ? " · Esc bricht das Ändern ab" : ""} · Datum als TTMM</span>}
                </div>
              </div>
            )}

            <div onKeyDown={(e) => {
              if ((e.key === "Delete" || e.key === "Backspace") && gewaehlt && offen && !(e.target as HTMLElement).closest("input")) {
                e.preventDefault();
                void zeileLoeschen(gewaehlt);
              }
            }}>
              <DatenTabelle label={`Stapel ${stapel.bezeichnung}`} spalten={spalten} zeilen={zeilen} schluessel={(z) => z.id}
                auswahl={gewaehlt?.id ?? null} onAuswahl={setAuswahl}
                onOeffnen={(z) => { if (offen) bearbeiten(z); else { const b = nrVon(z.buchung_id); if (b) onOeffnen(b); } }}
                markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung}
                zeilenKlasse={(z) => (z.id === bearbeite ? "ap-markiert" : undefined)}
                summe={<><b>{zeilenRoh.length === 1 ? "1 Zeile" : `${zeilenRoh.length} Zeilen`}</b> · Summe <b>{betragText(summe)}</b>
                  {mitFehler > 0 && <b className="ap-rot"> · {mitFehler} mit Fehler</b>}</>}
                leer={stapelQ.isPending ? "Lädt …" : offen ? "Noch keine Zeile – oben erfassen." : "Keine Zeile."} />
            </div>

            <div className="ap-status">
              <span>{stapel.zustand === "gebucht" ? `gebucht am ${datumDe((stapel.gebucht_am ?? "").slice(0, 10))}` : "offen – vorläufig, noch nicht im Journal"}</span>
              <span className="ap-tasten">Enter im Feld: weiter · Enter in der Liste: ändern · Entf löscht die Zeile · Strg+S bucht den Stapel · N neue Zeile</span>
            </div>
          </>
        )}
      </div>

      <aside className="ap-detail" aria-label="Gewählte Zeile">
        {gewaehlt && stapel ? (
            <>
              <h3>Zeile {zeilenRoh.indexOf(gewaehlt) + 1}</h3>
              <div className="small">{datumDe(gewaehlt.datum)}{gewaehlt.beleg ? ` · Beleg ${gewaehlt.beleg}` : ""}</div>
              <p className="ap-text"><b>{gewaehlt.text}</b></p>
              {gewBuchung ? <div className="fi-hinweis fi-info">Gebucht als Nr. {gewBuchung.jahr}-{gewBuchung.nr}.</div>
                : gewPruefung?.fehler ? <div className="fi-hinweis fi-rot">{gewPruefung.fehler}</div> : null}
              <ZeilenTabelle zeilen={gewBuchung ? gewBuchung.fin_buchungszeilen : gewPruefung?.zeilen ?? []} name={name} />
              <div className="ap-links">
                {offen && <button type="button" className="es-knopf" onClick={() => bearbeiten(gewaehlt)}>Ändern (Enter)</button>}
                {offen && <button type="button" className="es-knopf" onClick={() => void zeileLoeschen(gewaehlt)}>Löschen (Entf)</button>}
                {gewBuchung && <button type="button" className="es-knopf" onClick={() => onOeffnen(gewBuchung)}>Buchung öffnen</button>}
                <button type="button" className="es-knopf" onClick={() => onKontoblatt(gewaehlt.soll)}>Kontoblatt {kontoNr(gewaehlt.soll)} (F3)</button>
              </div>
            </>
        ) : stapel ? (
          <>
            <h3>{stapel.bezeichnung}</h3>
            <div className="ap-saldo">
              <span>Zeilen</span><b>{zeilenRoh.length}</b>
              <span>Summe</span><b>{betragText(summe)}</b>
              {stapel.zustand === "offen" && <><span>mit Fehler</span><b>{mitFehler}</b></>}
            </div>
            <span className="small">Gebucht wird in der Reihenfolge Datum, dann Erfassung – alle Zeilen oder keine. Danach ändert sich der Stapel nicht mehr; Korrekturen gehen per Storno.</span>
          </>
        ) : <span className="small">Lege einen Stapel an, um zu erfassen.</span>}
      </aside>

      {neuName !== null && (
        <Blatt titel="Neuer Buchungsstapel" unter={`Wirtschaftsjahr ${jahr}`} onClose={() => setNeuName(null)}
          fuss={<>
            <button type="button" className="btn-secondary" onClick={() => setNeuName(null)} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={() => void anlegen()} disabled={laeuft || !neuName.trim()}>Anlegen</button>
          </>}>
          <div className="fi-formular">
            <label className="nk-feld"><span>Bezeichnung</span>
              <input value={neuName} maxLength={80} autoFocus onChange={(e) => setNeuName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void anlegen(); } }} />
            </label>
            {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
          </div>
        </Blatt>
      )}
      {frage && stapel && (
        <Blatt titel={frage === "buchen" ? `Stapel „${stapel.bezeichnung}“ buchen?` : `Stapel „${stapel.bezeichnung}“ löschen?`} onClose={() => setFrage(null)}
          fuss={<>
            <button type="button" className="btn-secondary" onClick={() => setFrage(null)} disabled={laeuft}>Abbrechen</button>
            {frage === "buchen"
              ? <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={laeuft}>{laeuft ? "bucht …" : `${zeilenRoh.length} Buchungen buchen`}</button>
              : <button type="button" className="btn-danger" onClick={() => void stapelLoeschen()} disabled={laeuft}>{laeuft ? "löscht …" : "Stapel löschen"}</button>}
          </>}>
          <div className="fi-formular">
            {frage === "buchen" ? (
              <span>{zeilenRoh.length === 1 ? "1 Zeile" : `${zeilenRoh.length} Zeilen`}, Summe {betragText(summe)}. Sie bekommen fortlaufende Nummern im Journal
                (Reihenfolge Datum, dann Erfassung) und sind danach nicht mehr änderbar – Korrekturen nur per Storno.</span>
            ) : (
              <span>Der Stapel und seine {zeilenRoh.length === 1 ? "1 Zeile" : `${zeilenRoh.length} Zeilen`} werden gelöscht. Gebucht ist davon nichts.</span>
            )}
            {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
          </div>
        </Blatt>
      )}
    </div>
  );
}


"use client";
import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { KontoWahl, ZeilenTabelle } from "./FinanceBuchungen";
import { KostWahl } from "./arbeitsplatz/KostWahl";
import { qk } from "@/lib/queries/keys";
import { useFinStapel, useFinVorlagen } from "@/lib/queries/hooks";
import { finStapelAnlegen, finStapelBuchen, finStapelTeilSpeichern, finStapelZeileLoeschen, finStapelZeileSpeichern } from "@/lib/api/finance";
import { vorlageInEingabe, vorlagenSortiert } from "@/lib/finance/vorlagen";
import { FIN_KOST_ARTEN, type FinKostenstelle } from "@/lib/finance/kostenstellen";
import { betragLesen, kontoNr, passendeSchluessel, type FinFestschreibung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragText } from "@/lib/finance/arbeitsplatz";
import { formatEUR } from "@/lib/format";
import {
  belegWeiter, datumAusEingabe, datumKurz, eingabeAlsZeile, stapelBuchungen, stapelPositionen, stapelReihenfolge, stapelSumme, stapelTeile, stapelZeilePruefen,
  type FinStapelZeile, type StapelEingabe,
} from "@/lib/finance/stapel";

// Finance › Buchungen › Stapel am Handy (v183, Stufe C, Entscheidung 5 vom 30.10.2026, docs/finance.md Abschnitt 15):
// die schlanke Buchungsmaske. Unterwegs eine Zeile in den offenen Stapel legen – Vorlage, Datum, Betrag, Konten,
// Steuer, Text –, die Liste ansehen und, wenn alles stimmt, den Stapel buchen. Dieselben Zeilen wie am Rechner
// (FinanceStapel.tsx), dieselbe Prüfung (`stapelZeilePruefen`), dieselbe Datenbank (Migration 106–108).
// Ändern, löschen und buchen nur im offenen Stapel und mit „Finance › Buchungen“ schreiben.
// Splitt (Migration 109, v183): „+ Teil“ im Fenster einer Zeile hängt einen weiteren Posten an – Datum, Beleg und Text wie
// die Zeile, eigene Konten, Betrag, Steuer.

const LEER: StapelEingabe = { datum: "", beleg: "", soll: null, haben: null, betrag: "", steuer: "", text: "" };
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function FinanceStapelHandy({ supabase, jahr, heute, einstellungen, konten, schluessel, fest, darfBuchen, onMeldung, kostenstellen = [] }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  einstellungen: FinEinstellungen;
  konten: FinKonto[];
  schluessel: FinSteuerschluessel[];
  fest: FinFestschreibung[];
  darfBuchen: boolean;
  onMeldung: (t: string) => void;
  kostenstellen?: FinKostenstelle[];
}) {
  const queryClient = useQueryClient();
  const stapelQ = useFinStapel(supabase, jahr, true);
  const vorlagen = vorlagenSortiert(useFinVorlagen(supabase, true).data ?? []);
  const alle = useMemo(() => stapelQ.data ?? [], [stapelQ.data]);
  const liste = [...alle].sort((a, b) => (a.zustand === b.zustand ? b.erstellt_am.localeCompare(a.erstellt_am) : a.zustand === "offen" ? -1 : 1));
  const [wahl, setWahl] = useState<string | null>(null);
  const stapel = liste.find((s) => s.id === wahl) ?? liste[0] ?? null;
  const offen = stapel?.zustand === "offen" && darfBuchen;
  // Das Fenster „Zeile“: null = zu, "neu" = neue Zeile, sonst die ID der Zeile, die geändert wird.
  const [zeileOffen, setZeileOffen] = useState<string | null>(null);
  // Splitt: die Kopfzeile, wenn das Fenster einen Teil zeigt.
  const [teilKopf, setTeilKopf] = useState<FinStapelZeile | null>(null);
  const [eingabe, setEingabe] = useState<StapelEingabe>(LEER);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [frage, setFrage] = useState(false);
  const [neuName, setNeuName] = useState<string | null>(null);

  const passend = passendeSchluessel(schluessel, einstellungen);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const pruefe = (z: Pick<FinStapelZeile, "datum" | "soll" | "haben" | "betrag" | "steuer" | "text" | "kost1" | "kost2">) =>
    stapelZeilePruefen(z, jahr, konten, schluessel, einstellungen, fest);
  const zeilen = stapel ? stapelReihenfolge(stapel.fin_stapel_zeilen) : [];
  const pos = stapelPositionen(zeilen);
  const anzahlBuchungen = stapelBuchungen(zeilen);
  const pruefungen = new Map(zeilen.map((z) => [z.id, pruefe(z)]));
  const mitFehler = stapel?.zustand === "offen" ? zeilen.filter((z) => pruefungen.get(z.id)?.fehler).length : 0;
  const summe = stapelSumme(zeilen);
  const kannBuchen = offen && zeilen.length > 0 && mitFehler === 0;
  const heuteImJahr = heute.slice(0, 4) === String(jahr) ? heute : `${jahr}-01-01`;

  // Für die Datumsauswahl des Handys: das Feld hält ISO, die Eingabe den Kurztext wie am Rechner.
  const datumIso = datumAusEingabe(eingabe.datum, jahr) ?? "";
  const ergebnis = eingabeAlsZeile(eingabe, jahr, betragLesen);
  const vorschau = ergebnis.ok ? pruefe(ergebnis.zeile) : null;
  const setze = (p: Partial<StapelEingabe>) => { setHinweis(null); setEingabe({ ...eingabe, ...p }); };

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: qk.finStapel(jahr) });
  }

  function neueZeile(vorher?: StapelEingabe) {
    setHinweis(null);
    // Nach „+ Nächste“ bleiben Datum und Steuer stehen, der Beleg zählt weiter – wie am Rechner.
    setEingabe(vorher
      ? { ...LEER, datum: vorher.datum, steuer: vorher.steuer, beleg: vorher.beleg ? belegWeiter(vorher.beleg) : "" }
      : { ...LEER, datum: datumKurz(heuteImJahr) });
    setTeilKopf(null);
    setZeileOffen("neu");
  }

  function teilNeu(k: FinStapelZeile, steuer = k.steuer ?? "") {
    setHinweis(null);
    setEingabe({ ...LEER, datum: datumKurz(k.datum), beleg: k.beleg ?? "", text: k.text, steuer });
    setTeilKopf(k);
    setZeileOffen("neu");
  }

  function aendern(z: FinStapelZeile) {
    setHinweis(null);
    setEingabe({ datum: datumKurz(z.datum), beleg: z.beleg ?? "", soll: z.soll, haben: z.haben, betrag: betragText(z.betrag), steuer: z.steuer ?? "",
      text: z.text, kost1: z.kost1 ?? "", kost2: z.kost2 ?? "" });
    setTeilKopf(z.teil_von ? zeilen.find((x) => x.id === z.teil_von) ?? null : null);
    setZeileOffen(z.id);
  }

  async function speichern(weiter: boolean) {
    if (!stapel || !offen || !zeileOffen) return;
    const r = eingabeAlsZeile(eingabe, jahr, betragLesen);
    if (!r.ok) { setHinweis(r.fehler); return; }
    setLaeuft(true);
    setHinweis(null);
    try {
      const id = zeileOffen === "neu" ? null : zeileOffen;
      if (teilKopf) await finStapelTeilSpeichern(supabase, teilKopf.id, id, { soll: r.zeile.soll, haben: r.zeile.haben, betrag: r.zeile.betrag,
        steuer: r.zeile.steuer, kost1: r.zeile.kost1 ?? null, kost2: r.zeile.kost2 ?? null });
      else await finStapelZeileSpeichern(supabase, stapel.id, id, r.zeile);
      await neuLaden();
      if (weiter && teilKopf) teilNeu(teilKopf, eingabe.steuer);
      else if (weiter) neueZeile(eingabe);
      else setZeileOffen(null);
    } catch (e) {
      setHinweis(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!offen || !zeileOffen || zeileOffen === "neu") return;
    setLaeuft(true);
    try {
      await finStapelZeileLoeschen(supabase, zeileOffen);
      await neuLaden();
      setZeileOffen(null);
    } catch (e) {
      setHinweis(fehlerText(e));
    } finally {
      setLaeuft(false);
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
      setFrage(false);
      onMeldung(`Stapel „${stapel.bezeichnung}“ gebucht: ${r.anzahl === 1 ? `Nr. ${r.jahr}-${r.von}` : `${r.anzahl} Buchungen, Nr. ${r.jahr}-${r.von} bis ${r.jahr}-${r.bis}`}.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  if (stapelQ.isError) {
    return <div className="fi-hinweis fi-rot" role="alert">Die Stapel konnten nicht geladen werden. Ist Migration 106 ausgeführt?</div>;
  }

  return (
    <>
      <div className="fi-werkzeug">
        <select className="fi-monat" aria-label="Stapel" value={stapel?.id ?? ""} onChange={(e) => setWahl(e.target.value)} disabled={!liste.length}>
          {!liste.length && <option value="">noch kein Stapel</option>}
          {liste.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung}{s.zustand === "gebucht" ? " (gebucht)" : ` (${s.fin_stapel_zeilen.length})`}</option>)}
        </select>
        {darfBuchen && (
          <button type="button" className="es-knopf" onClick={() => { setFehler(null); setNeuName(`${MONATE[Number(heute.slice(5, 7)) - 1]} ${jahr}`); }}>+ Stapel</button>
        )}
        {offen && <button type="button" className="btn-primary fi-knopf" onClick={() => neueZeile()}>+ Zeile</button>}
      </div>
      {fehler && !frage && neuName === null && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}

      {!stapel ? (
        <div className="db-karte es-karte">
          <span className="small">Noch kein Buchungsstapel in {jahr}. Im Stapel liegen Buchungen erst vorläufig – ändern und löschen geht, bis der
            Stapel gebucht ist.</span>
        </div>
      ) : (
        <>
          <div className="db-karte es-karte">
            {stapelQ.isPending ? <span className="small">Lädt …</span> : zeilen.length === 0 ? (
              <span className="small">{offen ? "Noch keine Zeile – mit „+ Zeile“ erfassen." : "Keine Zeile."}</span>
            ) : zeilen.map((z, i) => {
              const f = stapel.zustand === "offen" ? pruefungen.get(z.id)?.fehler : null;
              const kost = [z.kost1, z.kost2].filter(Boolean).join(" · ");
              const p = pos.get(z.id) ?? String(i + 1);
              return (
                <button key={z.id} type="button" className={"es-zeile fi-buchung" + (z.teil_von ? " fi-teil" : "")} onClick={() => (offen ? aendern(z) : undefined)} disabled={!offen}
                  aria-label={z.teil_von ? `Teil ${p}` : `Zeile ${p}: ${z.text}`}>
                  <span className="fi-nr">{p}</span>
                  <span className="db-punkt-text">
                    <b>{z.teil_von ? "↳ Teil" : z.text}</b>
                    <span className="small">
                      {datumKurz(z.datum)}{z.beleg ? ` · ${z.beleg}` : ""} · {kontoNr(z.soll)} an {kontoNr(z.haben)}{z.steuer ? ` · ${z.steuer}` : ""}{kost ? ` · ${kost}` : ""}
                    </span>
                    {f && <span className="small fi-rot-text">{f}</span>}
                  </span>
                  <span className="fi-betrag">{formatEUR(Number(z.betrag))}</span>
                </button>
              );
            })}
          </div>
          <span className="small es-fuss fi-fuss">
            {zeilen.length === 1 ? "1 Zeile" : `${zeilen.length} Zeilen`}{anzahlBuchungen !== zeilen.length ? ` (${anzahlBuchungen === 1 ? "1 Buchung" : `${anzahlBuchungen} Buchungen`})` : ""} · Summe {formatEUR(summe)}
            {mitFehler > 0 && ` · ${mitFehler} mit Fehler`}
            {stapel.zustand === "gebucht" ? " · gebucht" : offen ? " · Antippen ändert" : ""}
          </span>
          {offen && (
            <button type="button" className="btn-primary fi-knopf fi-stapel-buchen" onClick={() => { setFehler(null); setFrage(true); }} disabled={!kannBuchen}>
              Stapel buchen
            </button>
          )}
        </>
      )}

      {zeileOffen !== null && stapel && (
        <Blatt titel={teilKopf ? (zeileOffen === "neu" ? "Teil erfassen" : "Teil ändern") : zeileOffen === "neu" ? "Zeile erfassen" : "Zeile ändern"}
          unter={teilKopf ? `Splitt zu Zeile ${pos.get(teilKopf.id)} „${teilKopf.text}“ · ${datumKurz(teilKopf.datum)}` : `Stapel „${stapel.bezeichnung}“ · vorläufig`}
          onClose={() => setZeileOffen(null)}
          fuss={<>
            {zeileOffen === "neu"
              ? <button type="button" className="btn-secondary" onClick={() => void speichern(true)} disabled={laeuft}>+ Nächste</button>
              : <button type="button" className="btn-danger" onClick={() => void loeschen()} disabled={laeuft}>Löschen</button>}
            <button type="button" className="btn-primary" onClick={() => void speichern(false)} disabled={laeuft}>{laeuft ? "speichert …" : "Übernehmen"}</button>
          </>}>
          <div className="fi-formular">
            {!teilKopf && vorlagen.length > 0 && (
              <label className="nk-feld"><span>Vorlage</span>
                <select value="" aria-label="Vorlage" onChange={(e) => {
                  const v = vorlagen.find((x) => x.id === e.target.value);
                  if (v) { setHinweis(null); setEingabe(vorlageInEingabe(v, eingabe)); }
                }}>
                  <option value="">wählen …</option>
                  {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.kurz} – {v.text}</option>)}
                </select>
              </label>
            )}
            <div className="nk-zeile">
              {!teilKopf && (
                <label className="nk-feld"><span>Datum</span>
                  <input type="date" value={datumIso} min={`${jahr}-01-01`} max={`${jahr}-12-31`} aria-label="Datum"
                    onChange={(e) => setze({ datum: e.target.value ? datumKurz(e.target.value) : "" })} />
                </label>
              )}
              <label className="nk-feld"><span>Betrag in €</span>
                <input inputMode="decimal" value={eingabe.betrag} placeholder="0,00" aria-label="Betrag" onChange={(e) => setze({ betrag: e.target.value })} />
              </label>
            </div>
            {!teilKopf && (
              <label className="nk-feld"><span>Buchungstext</span>
                <input value={eingabe.text} maxLength={200} aria-label="Buchungstext" placeholder="Was ist passiert?" onChange={(e) => setze({ text: e.target.value })} />
              </label>
            )}
            <div className="fi-zwei">
              <label className="nk-feld"><span>Soll</span>
                <KontoWahl wert={eingabe.soll == null ? "" : String(eingabe.soll)} konten={konten} label="Soll-Konto"
                  onWert={(w) => setze({ soll: w ? Number(w) : null })} />
              </label>
              <label className="nk-feld"><span>Haben</span>
                <KontoWahl wert={eingabe.haben == null ? "" : String(eingabe.haben)} konten={konten} label="Haben-Konto"
                  onWert={(w) => setze({ haben: w ? Number(w) : null })} />
              </label>
            </div>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Steuer</span>
                <select value={eingabe.steuer} aria-label="Steuer" onChange={(e) => setze({ steuer: e.target.value })}>
                  <option value="">ohne Steuerschlüssel</option>
                  {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
                </select>
              </label>
              {!teilKopf && (
                <label className="nk-feld"><span>Beleg-Nr.</span>
                  <input value={eingabe.beleg} maxLength={60} aria-label="Beleg" placeholder="z. B. ER-41" onChange={(e) => setze({ beleg: e.target.value })} />
                </label>
              )}
            </div>
            {kostenstellen.length > 0 && (
              <div className="fi-zwei">
                {FIN_KOST_ARTEN.map((a) => (
                  <label key={a.wert} className="nk-feld"><span>{a.text} ({a.datev})</span>
                    <KostWahl art={a.wert} liste={kostenstellen} wert={eingabe[a.wert] ?? ""} onWert={(w) => setze({ [a.wert]: w })} />
                  </label>
                ))}
              </div>
            )}
            {vorschau && !vorschau.fehler && (<>
              <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
              <ZeilenTabelle zeilen={vorschau.zeilen} name={name} />
            </>)}
            {(hinweis || vorschau?.fehler) && <div className="fi-hinweis fi-rot" role="alert">{hinweis ?? `Beim Buchen: ${vorschau?.fehler}`}</div>}
            {!teilKopf && zeileOffen !== "neu" && offen && (() => {
              const k = zeilen.find((x) => x.id === zeileOffen);
              const n = k ? stapelTeile(zeilen, k.id).length : 0;
              return k ? (
                <div className="fi-teile">
                  <span className="small">{n ? `${n === 1 ? "1 Teil" : `${n} Teile`} – zusammen eine Buchung.` : "Splitt: weitere Posten derselben Buchung."}{n ? " Löschen nimmt sie mit." : ""}</span>
                  <button type="button" className="btn-secondary" onClick={() => teilNeu(k)} disabled={laeuft}>+ Teil</button>
                </div>
              ) : null;
            })()}
            <span className="small">{teilKopf ? "Der Teil wird mit seiner Zeile zu einer Buchung." : "Die Zeile liegt vorläufig im Stapel."} Gebucht wird erst mit „Stapel buchen“ – alle Zeilen oder keine.</span>
          </div>
        </Blatt>
      )}

      {neuName !== null && (
        <Blatt titel="Neuer Buchungsstapel" unter={`Wirtschaftsjahr ${jahr}`} onClose={() => setNeuName(null)}
          fuss={<>
            <button type="button" className="btn-secondary" onClick={() => setNeuName(null)} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={() => void anlegen()} disabled={laeuft || !neuName.trim()}>Anlegen</button>
          </>}>
          <div className="fi-formular">
            <label className="nk-feld"><span>Bezeichnung</span>
              <input value={neuName} maxLength={80} onChange={(e) => setNeuName(e.target.value)} />
            </label>
            {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
          </div>
        </Blatt>
      )}

      {frage && stapel && (
        <Blatt titel={`Stapel „${stapel.bezeichnung}“ buchen?`} onClose={() => setFrage(false)}
          fuss={<>
            <button type="button" className="btn-secondary" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={laeuft}>
              {laeuft ? "bucht …" : anzahlBuchungen === 1 ? "1 Buchung buchen" : `${anzahlBuchungen} Buchungen buchen`}
            </button>
          </>}>
          <div className="fi-formular">
            <span>{zeilen.length === 1 ? "1 Zeile" : `${zeilen.length} Zeilen`}, Summe {formatEUR(summe)}. Sie bekommen fortlaufende Nummern im Journal und sind danach
              nicht mehr änderbar – Korrekturen nur per Storno.</span>
            {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
          </div>
        </Blatt>
      )}
    </>
  );
}

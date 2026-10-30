"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { SuchFeld } from "@/components/SuchFeld";
import { qk } from "@/lib/queries/keys";
import { useFinBuchungen, useFinFestschreibungen, useFinKonten, useFinSteuerschluessel } from "@/lib/queries/hooks";
import { finBuchen, finKontoAktiv, finKontoAnlegen, finMonatFestschreiben, finStornieren } from "@/lib/api/finance";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import {
  FIN_KONTO_KATEGORIEN, betragLesen, buchungBetrag, buchungVorschau, buchungZustand, kontenSalden, kontoNr, passendeSchluessel,
  type FinBuchung, type FinFestschreibung, type FinKonto, type FinPosten, type FinSteuerschluessel, type KontoKategorie,
} from "@/lib/finance/buchung";
import { formatEUR } from "@/lib/format";
import { useAmRechner } from "@/lib/amRechner";
import { BUCHUNG_QUELLE_TEXT } from "@/lib/finance/arbeitsplatz";
import { FinanceJournalArbeitsplatz } from "./FinanceJournalArbeitsplatz";
import { FinanceKontoblatt } from "./FinanceKontoblatt";
import { FinanceKontenArbeitsplatz } from "./FinanceKontenArbeitsplatz";
import { BetragFeld, KontoFeld } from "./arbeitsplatz/KontoFeld";

// Finance › Buchungen (Phase F1, Migration 88, v146): Journal, Konten mit Saldo, Monate festschreiben. Am Rechner seit
// v178/v179 als Arbeitsplatz: Journal, Kontoblatt und Konten als Tabellen (FinanceJournalArbeitsplatz, FinanceKontoblatt,
// FinanceKontenArbeitsplatz).
// Gebucht wird über `fin_buchen()` – die Datenbank rechnet die Steuer und vergibt die Nummer; das
// Fenster zeigt vorher dieselbe Rechnung (`buchungVorschau`, lib/finance/buchung.ts). Ändern und
// Löschen gibt es nicht: korrigiert wird mit Storno.

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
// „kontoblatt“ gibt es nur am Rechner (v179, Stufe B).
type Reiter = "journal" | "kontoblatt" | "konten" | "monate";

export function FinanceBuchungen({ supabase, jahr, heute, einstellungen, darfBuchen, darfFestschreiben, darfKonten, onEinstellungen }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  einstellungen: FinEinstellungen | null;
  darfBuchen: boolean;
  darfFestschreiben: boolean;
  darfKonten: boolean;
  onEinstellungen: () => void;
}) {
  const rahmen = einstellungen?.kontenrahmen ?? "skr03";
  const bereit = !!einstellungen;
  const kontenQ = useFinKonten(supabase, rahmen, bereit);
  const schluesselQ = useFinSteuerschluessel(supabase, rahmen, bereit);
  const buchungenQ = useFinBuchungen(supabase, jahr, bereit);
  const festQ = useFinFestschreibungen(supabase, jahr, bereit);
  const [reiter, setReiter] = useState<Reiter>("journal");
  const [neuOffen, setNeuOffen] = useState(false);
  const [detail, setDetail] = useState<FinBuchung | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  // Am Rechner das Journal als Arbeitsplatz (v178, Stufe A), am Handy die Kartenliste.
  const amRechner = useAmRechner();
  // Kontoblatt (v179, Stufe B): welches Konto, und der Weg dorthin für „Zurück“ (Sprünge über Gegenkonten).
  const [blattKonto, setBlattKonto] = useState<number | null>(null);
  const [blattWeg, setBlattWeg] = useState<number[]>([]);
  const kontoblattOeffnen = (n: number) => {
    if (reiter === "kontoblatt" && blattKonto != null && n !== blattKonto) setBlattWeg([...blattWeg, blattKonto]);
    else if (reiter !== "kontoblatt") setBlattWeg([]);
    setBlattKonto(n);
    setReiter("kontoblatt");
  };

  if (!einstellungen) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch">
          <span className="db-punkt-text">
            <b>Erst die Einstellungen für {jahr} speichern</b>
            <span className="small">Kontenrahmen und Umsatzsteuer bestimmen, welche Konten und Steuerschlüssel es gibt.</span>
          </span>
        </div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const konten = kontenQ.data ?? [];
  const schluessel = schluesselQ.data ?? [];
  const buchungen = buchungenQ.data ?? [];
  const fest = festQ.data ?? [];
  const fehlt = [kontenQ, schluesselQ, buchungenQ, festQ].some((x) => x.isError);

  return (
    <>
      <div className="lg-lagerwahl es-segment fi-reiter" role="tablist" aria-label="Buchungen">
        {(amRechner ? [["journal", "Journal"], ["kontoblatt", "Kontoblatt"], ["konten", "Konten"], ["monate", "Monate"]] as const
          : [["journal", "Journal"], ["konten", "Konten"], ["monate", "Monate"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>{t}</button>
        ))}
      </div>
      {fehlt && <div className="fi-hinweis fi-rot" role="alert">Das Journal konnte nicht geladen werden. Ist Migration 88 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}

      {reiter === "journal" && amRechner && (
        <FinanceJournalArbeitsplatz buchungen={buchungen} konten={konten} schluessel={schluessel} fest={fest} jahr={jahr}
          laedt={buchungenQ.isPending} darfBuchen={darfBuchen} onNeu={() => { setMeldung(null); setNeuOffen(true); }} onOeffnen={setDetail}
          onKontoblatt={kontoblattOeffnen} />
      )}
      {reiter === "kontoblatt" && amRechner && (
        <FinanceKontoblatt buchungen={buchungen} konten={konten} fest={fest} jahr={jahr} laedt={buchungenQ.isPending}
          konto={blattKonto} onKonto={kontoblattOeffnen} zurueck={blattWeg[blattWeg.length - 1] ?? null}
          onZurueck={() => { setBlattKonto(blattWeg[blattWeg.length - 1] ?? null); setBlattWeg(blattWeg.slice(0, -1)); }}
          darfBuchen={darfBuchen} onNeu={() => { setMeldung(null); setNeuOffen(true); }} onOeffnen={setDetail} />
      )}
      {reiter === "journal" && !amRechner && (
        <Journal buchungen={buchungen} konten={konten} fest={fest} laedt={buchungenQ.isPending}
          darfBuchen={darfBuchen} onNeu={() => { setMeldung(null); setNeuOffen(true); }} onOeffnen={setDetail} />
      )}
      {reiter === "konten" && amRechner && (
        <FinanceKontenArbeitsplatz supabase={supabase} rahmen={rahmen} buchungen={buchungen} konten={konten} jahr={jahr}
          laedt={kontenQ.isPending || buchungenQ.isPending} darfKonten={darfKonten} onKontoblatt={kontoblattOeffnen} />
      )}
      {reiter === "konten" && !amRechner && (
        <Konten supabase={supabase} rahmen={rahmen} konten={konten} buchungen={buchungen} darfKonten={darfKonten} />
      )}
      {reiter === "monate" && (
        <Monate supabase={supabase} jahr={jahr} heute={heute} buchungen={buchungen} fest={fest} darf={darfFestschreiben} onMeldung={setMeldung} />
      )}

      {neuOffen && (
        <BuchungNeu supabase={supabase} heute={heute} jahr={jahr} einstellungen={einstellungen} konten={konten} schluessel={schluessel}
          tastatur={amRechner} onGebucht={(nr) => { setNeuOffen(false); setMeldung(`Gebucht als Nr. ${jahr}-${nr}.`); }}
          onClose={() => setNeuOffen(false)} />
      )}
      {detail && (
        <BuchungDetail supabase={supabase} buchung={buchungen.find((b) => b.id === detail.id) ?? detail} alle={buchungen}
          konten={konten} schluessel={schluessel} fest={fest} darfBuchen={darfBuchen}
          onStorniert={(nr) => { setDetail(null); setMeldung(`Storniert – Gegenbuchung Nr. ${nr}.`); }}
          onClose={() => setDetail(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Journal
function Journal({ buchungen, konten, fest, laedt, darfBuchen, onNeu, onOeffnen }: {
  buchungen: FinBuchung[]; konten: FinKonto[]; fest: FinFestschreibung[]; laedt: boolean; darfBuchen: boolean;
  onNeu: () => void; onOeffnen: (b: FinBuchung) => void;
}) {
  const [monat, setMonat] = useState(0);
  const [suche, setSuche] = useState("");
  const liste = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return buchungen
      .filter((b) => !monat || Number(b.datum.slice(5, 7)) === monat)
      .filter((b) => !s || `${b.nr} ${b.text} ${b.beleg ?? ""} ${b.fin_buchungszeilen.map((z) => kontoNr(z.konto)).join(" ")}`.toLowerCase().includes(s))
      .slice().reverse();
  }, [buchungen, monat, suche]);
  return (
    <>
      <div className="fi-werkzeug">
        <select className="fi-monat" value={monat} onChange={(e) => setMonat(Number(e.target.value))} aria-label="Monat">
          <option value={0}>Alle Monate</option>
          {MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <SuchFeld value={suche} onWert={setSuche} placeholder="Text, Beleg, Nr. oder Konto" ariaLabel="Buchungen durchsuchen" className="fi-suche" />
        {darfBuchen && <button type="button" className="btn-primary fi-knopf" onClick={onNeu}>Neue Buchung</button>}
      </div>
      <div className="db-karte es-karte">
        {laedt ? <span className="small">Lädt …</span> : liste.length === 0 ? (
          <span className="small">{buchungen.length ? "Keine Buchung passt zur Auswahl." : "Noch keine Buchung in diesem Jahr."}</span>
        ) : liste.map((b) => {
          const z = buchungZustand(b, fest);
          const kontenText = [...new Set(b.fin_buchungszeilen.filter((x) => !x.ist_steuer).map((x) => kontoNr(x.konto)))].join(" / ");
          return (
            <button key={b.id} type="button" className={"es-zeile fi-buchung" + (z.storniert ? " fi-gestrichen" : z.storno ? " fi-leise" : "")} onClick={() => onOeffnen(b)}>
              <span className="fi-nr">{b.nr}</span>
              <span className="db-punkt-text">
                <b>{b.text}</b>
                <span className="small">
                  {datumKurz(b.datum)}{b.beleg ? ` · ${b.beleg}` : ""} · {kontenText}
                  {z.storno && " · Storno"}{z.storniert && " · storniert"}{z.festgeschrieben && " · festgeschrieben"}
                </span>
              </span>
              <span className="fi-betrag">{formatEUR(buchungBetrag(b))}</span>
            </button>
          );
        })}
      </div>
      {konten.length > 0 && liste.length > 0 && (
        <span className="small es-fuss fi-fuss">{anzahlText(liste.length)} · Antippen zeigt Soll und Haben.</span>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Neue Buchung
type PostenEingabe = { soll: string; haben: string; betrag: string; steuer: string };
const LEER: PostenEingabe = { soll: "", haben: "", betrag: "", steuer: "" };

// Auch im Belegfenster (FinanceBelege.tsx), dort nur mit Aufwand und Anlagen (`nur`).
export function KontoWahl({ wert, konten, onWert, label, nur, disabled }: {
  wert: string; konten: FinKonto[]; onWert: (w: string) => void; label: string; nur?: readonly KontoKategorie[]; disabled?: boolean;
}) {
  return (
    <select value={wert} onChange={(e) => onWert(e.target.value)} aria-label={label} disabled={disabled}>
      <option value="">Konto wählen</option>
      {FIN_KONTO_KATEGORIEN.filter((k) => !nur || nur.includes(k.wert)).map((k) => {
        const liste = konten.filter((x) => x.kategorie === k.wert && x.aktiv);
        if (!liste.length) return null;
        return (
          <optgroup key={k.wert} label={k.text}>
            {liste.map((x) => <option key={x.nummer} value={x.nummer}>{kontoNr(x.nummer)} {x.bezeichnung}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

// Vorbelegung, z. B. aus dem Kassenbuch (FinanceBank.tsx): Einnahme = Kasse im Soll, Ausgabe = Kasse im Haben.
export type BuchungVorlage = { titel?: string; text?: string; soll?: number; haben?: number };

export function BuchungNeu({ supabase, heute, jahr, einstellungen, konten, schluessel, vorlage, tastatur, onGebucht, onClose }: {
  supabase: SupabaseClient; heute: string; jahr: number; einstellungen: FinEinstellungen;
  konten: FinKonto[]; schluessel: FinSteuerschluessel[]; vorlage?: BuchungVorlage;
  // Am Rechner (v178, Stufe A): Konten per Nummer oder Name statt Auswahlliste, Betrag mit Komma, Strg+Enter bucht.
  tastatur?: boolean;
  onGebucht: (nr: number) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [datum, setDatum] = useState(heute.slice(0, 4) === String(jahr) ? heute : `${jahr}-01-01`);
  const [text, setText] = useState(vorlage?.text ?? "");
  const [beleg, setBeleg] = useState("");
  const [posten, setPosten] = useState<PostenEingabe[]>([{ ...LEER, soll: vorlage?.soll ? String(vorlage.soll) : "", haben: vorlage?.haben ? String(vorlage.haben) : "" }]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const passend = passendeSchluessel(schluessel, einstellungen);
  const werte: FinPosten[] = posten.map((p) => ({
    soll: p.soll ? Number(p.soll) : null, haben: p.haben ? Number(p.haben) : null,
    betrag: betragLesen(p.betrag), steuer: p.steuer || null,
  }));
  const v = buchungVorschau(werte, konten, schluessel, einstellungen);
  const pruefung = !text.trim() ? "Der Buchungstext fehlt." : datum.slice(0, 4) !== String(jahr) ? `Das Datum liegt nicht in ${jahr}.` : v.fehler;
  const setze = (i: number, p: Partial<PostenEingabe>) => { setFehler(null); setPosten(posten.map((x, j) => (j === i ? { ...x, ...p } : x))); };
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";

  async function buchen() {
    if (pruefung) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finBuchen(supabase, { datum, text: text.trim(), beleg: beleg.trim(), posten: werte });
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onGebucht(r.nr);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel={vorlage?.titel ?? (tastatur ? "Schnellbuchung" : "Neue Buchung")}
      unter={`${einstellungen.kontenrahmen.toUpperCase()} · Wirtschaftsjahr ${jahr}${tastatur ? " · Tab weiter · Strg+Enter bucht · Esc schließt" : ""}`}
      breite="breit" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={laeuft || !!pruefung}>{laeuft ? "bucht …" : "Buchen"}</button>
      </>}>
      <div className="fi-formular" onKeyDown={(e) => {
        if (tastatur && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void buchen(); }
      }}>
        <div className="nk-zeile">
          <label className="nk-feld"><span>Datum</span><input type="date" value={datum} onChange={(e) => { setFehler(null); setDatum(e.target.value); }} /></label>
          <label className="nk-feld"><span>Beleg-Nr.</span><input value={beleg} maxLength={60} onChange={(e) => setBeleg(e.target.value)} placeholder="z. B. RE-1782" /></label>
        </div>
        <label className="nk-feld"><span>Buchungstext</span><input value={text} maxLength={200} onChange={(e) => { setFehler(null); setText(e.target.value); }} placeholder="Was ist passiert?"
          // Am Rechner beginnt die Schnellbuchung beim Text; Tab führt weiter zu Soll, Haben, Betrag, Steuer.
          autoFocus={tastatur && !vorlage} /></label>

        {posten.map((p, i) => {
          const st = passend.find((s) => s.schluessel === p.steuer);
          return (
            <div key={i} className="fi-posten">
              <div className="fi-posten-kopf">
                <b>Posten {i + 1}</b>
                {posten.length > 1 && <button type="button" className="es-knopf" onClick={() => setPosten(posten.filter((_, j) => j !== i))}>Entfernen</button>}
              </div>
              <div className="fi-zwei">
                {tastatur ? (<>
                  <label className="nk-feld"><span>Soll</span>
                    <KontoFeld konten={konten} wert={p.soll ? Number(p.soll) : null} onWert={(n) => setze(i, { soll: n == null ? "" : String(n) })}
                      label={`Soll-Konto Posten ${i + 1}`} />
                  </label>
                  <label className="nk-feld"><span>Haben</span>
                    <KontoFeld konten={konten} wert={p.haben ? Number(p.haben) : null} onWert={(n) => setze(i, { haben: n == null ? "" : String(n) })}
                      label={`Haben-Konto Posten ${i + 1}`} />
                  </label>
                </>) : (<>
                  <label className="nk-feld"><span>Soll</span><KontoWahl wert={p.soll} konten={konten} onWert={(w) => setze(i, { soll: w })} label={`Soll-Konto Posten ${i + 1}`} /></label>
                  <label className="nk-feld"><span>Haben</span><KontoWahl wert={p.haben} konten={konten} onWert={(w) => setze(i, { haben: w })} label={`Haben-Konto Posten ${i + 1}`} /></label>
                </>)}
              </div>
              <div className="fi-zwei">
                <label className="nk-feld"><span>Betrag in €</span>
                  {tastatur ? <BetragFeld text={p.betrag} onText={(t) => setze(i, { betrag: t })} label={`Betrag Posten ${i + 1}`} /> : (
                    <input inputMode="decimal" value={p.betrag} onChange={(e) => setze(i, { betrag: e.target.value })} placeholder="0,00" aria-label={`Betrag Posten ${i + 1}`} />
                  )}
                </label>
                <label className="nk-feld"><span>Steuer</span>
                  <select value={p.steuer} onChange={(e) => setze(i, { steuer: e.target.value })} aria-label={`Steuer Posten ${i + 1}`}>
                    <option value="">ohne Steuerschlüssel</option>
                    {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
                  </select>
                </label>
              </div>
              {st && (
                <span className="small">
                  {st.art === "ust" || st.art === "vst" ? "Betrag brutto – die Steuer wird herausgerechnet."
                    : st.art === "ohne" ? "Ohne Steuer, mit Kennzeichen für die Voranmeldung."
                    : einstellungen.besteuerung === "klein" ? "Betrag netto – die Steuer kommt dazu und wird geschuldet, ohne Vorsteuer."
                    : "Betrag netto – die Steuer kommt dazu, als Umsatzsteuer und Vorsteuer (unterm Strich null)."}
                </span>
              )}
            </div>
          );
        })}
        {posten.length < 50 && (
          <button type="button" className="btn-secondary fi-mehr" onClick={() => setPosten([...posten, {
            ...LEER, soll: vorlage?.soll ? String(vorlage.soll) : "", haben: vorlage?.haben ? String(vorlage.haben) : "", steuer: posten[posten.length - 1]?.steuer ?? "",
          }])}>+ Weiterer Posten</button>
        )}

        <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
        <ZeilenTabelle zeilen={v.zeilen} name={name} />
        {(pruefung || fehler) && <div className="fi-hinweis fi-rot" role="alert">{fehler ?? pruefung}</div>}
      </div>
    </Blatt>
  );
}

export function ZeilenTabelle({ zeilen, name }: { zeilen: { seite: "S" | "H"; konto: number; betrag: number; ist_steuer: boolean }[]; name: (n: number) => string }) {
  if (!zeilen.length) return <span className="small">Noch nichts – Konten und Betrag eintragen.</span>;
  const soll = zeilen.filter((z) => z.seite === "S").reduce((s, z) => s + z.betrag, 0);
  const haben = zeilen.filter((z) => z.seite === "H").reduce((s, z) => s + z.betrag, 0);
  return (
    <table className="fi-tabelle">
      <thead><tr><th>Konto</th><th className="zahl">Soll</th><th className="zahl">Haben</th></tr></thead>
      <tbody>
        {zeilen.map((z, i) => (
          <tr key={i} className={z.ist_steuer ? "steuer" : undefined}>
            <td><b>{kontoNr(z.konto)}</b> {name(z.konto)}</td>
            <td className="zahl">{z.seite === "S" ? formatEUR(z.betrag) : ""}</td>
            <td className="zahl">{z.seite === "H" ? formatEUR(z.betrag) : ""}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td>Summe</td><td className="zahl">{formatEUR(soll)}</td><td className="zahl">{formatEUR(haben)}</td></tr></tfoot>
    </table>
  );
}

// ---------------------------------------------------------------- Eine Buchung, Storno
function BuchungDetail({ supabase, buchung, alle, konten, schluessel, fest, darfBuchen, onStorniert, onClose }: {
  supabase: SupabaseClient; buchung: FinBuchung; alle: FinBuchung[]; konten: FinKonto[]; schluessel: FinSteuerschluessel[];
  fest: FinFestschreibung[]; darfBuchen: boolean; onStorniert: (nr: number) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState("");
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const z = buchungZustand(buchung, fest);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const nrVon = (id: string | null) => alle.find((b) => b.id === id)?.nr;
  const steuern = [...new Set(buchung.fin_buchungszeilen.map((x) => x.steuerschluessel).filter(Boolean))]
    .map((s) => schluessel.find((x) => x.schluessel === s)?.bezeichnung ?? s).join(", ");
  const kannStorno = darfBuchen && !z.storno && !z.storniert;

  async function stornieren() {
    if (!grund.trim()) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finStornieren(supabase, buchung.id, grund.trim());
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onStorniert(r.nr);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel={`Buchung ${buchung.jahr}-${buchung.nr}`} unter={datumKurz(buchung.datum)} breite="mittel" onClose={onClose}
      fuss={kannStorno ? (frage ? <>
        <button type="button" className="btn-secondary" onClick={() => setFrage(false)} disabled={laeuft}>Zurück</button>
        <button type="button" className="btn-danger" onClick={() => void stornieren()} disabled={laeuft || !grund.trim()}>{laeuft ? "storniert …" : "Storno buchen"}</button>
      </> : <button type="button" className="btn-secondary" onClick={() => setFrage(true)}>Stornieren …</button>) : undefined}>
      <div className="fi-formular">
        <div className="db-punkt-text">
          <b>{buchung.text}</b>
          <span className="small">
            {buchung.beleg ? `Beleg ${buchung.beleg} · ` : ""}{BUCHUNG_QUELLE_TEXT[buchung.quelle] ?? "von Hand"}
            {steuern ? ` · ${steuern}` : ""}
          </span>
        </div>
        {z.storno && <div className="fi-hinweis fi-info">Storno zu Nr. {nrVon(buchung.storno_von) ?? "?"}{buchung.grund ? ` – ${buchung.grund}` : ""}</div>}
        {z.storniert && <div className="fi-hinweis fi-warn">Storniert durch Nr. {nrVon(buchung.storniert_durch) ?? "?"}</div>}
        {z.festgeschrieben && <div className="fi-hinweis fi-info">Der Monat ist festgeschrieben. Ein Storno wird heute gebucht.</div>}
        <ZeilenTabelle zeilen={buchung.fin_buchungszeilen} name={name} />
        {frage && (
          <>
            <label className="nk-feld"><span>Grund für das Storno</span>
              <input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. falscher Betrag" autoFocus />
            </label>
            <span className="small">Gebucht wird eine Gegenbuchung mit vertauschtem Soll und Haben. Die Buchung selbst bleibt sichtbar.</span>
          </>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Konten mit Saldo
function Konten({ supabase, rahmen, konten, buchungen, darfKonten }: {
  supabase: SupabaseClient; rahmen: FinEinstellungen["kontenrahmen"]; konten: FinKonto[]; buchungen: FinBuchung[]; darfKonten: boolean;
}) {
  const queryClient = useQueryClient();
  const salden = useMemo(() => kontenSalden(buchungen), [buchungen]);
  const [suche, setSuche] = useState("");
  const [nurBebucht, setNurBebucht] = useState(false);
  const [neu, setNeu] = useState(false);
  const s = suche.trim().toLowerCase();
  const sichtbar = konten.filter((k) => (!nurBebucht || salden.has(k.nummer)) && (!s || `${kontoNr(k.nummer)} ${k.bezeichnung}`.toLowerCase().includes(s)));
  const umschalten = async (k: FinKonto) => {
    await finKontoAktiv(supabase, rahmen, k.nummer, !k.aktiv);
    await queryClient.invalidateQueries({ queryKey: qk.finKonten(rahmen) });
  };
  return (
    <>
      <div className="fi-werkzeug">
        <SuchFeld value={suche} onWert={setSuche} placeholder="Nummer oder Bezeichnung" ariaLabel="Konten durchsuchen" className="fi-suche" />
        <button type="button" className={"es-knopf" + (nurBebucht ? " fi-an" : "")} aria-pressed={nurBebucht} onClick={() => setNurBebucht(!nurBebucht)}>Nur bebuchte</button>
        {darfKonten && <button type="button" className="es-knopf" onClick={() => setNeu(true)}>Eigenes Konto</button>}
      </div>
      {FIN_KONTO_KATEGORIEN.map((kat) => {
        const liste = sichtbar.filter((k) => k.kategorie === kat.wert);
        if (!liste.length) return null;
        return (
          <div key={kat.wert} className="fi-gruppe">
            <span className="op-gruppe-titel">{kat.text.toUpperCase()}</span>
            <div className="db-karte es-karte">
              {liste.map((k) => {
                const sd = salden.get(k.nummer);
                return (
                  <div key={k.nummer} className={"es-zeile statisch fi-konto" + (k.aktiv ? "" : " fi-aus")}>
                    <span className="fi-nr">{kontoNr(k.nummer)}</span>
                    <span className="db-punkt-text">
                      <b>{k.bezeichnung}</b>
                      <span className="small">{sd ? `Soll ${formatEUR(sd.soll)} · Haben ${formatEUR(sd.haben)}` : "keine Buchung"}{k.eigen ? " · eigenes Konto" : ""}{k.aktiv ? "" : " · ausgeblendet"}</span>
                    </span>
                    <span className="fi-betrag">{sd ? saldoText(sd.saldo) : ""}</span>
                    {darfKonten && (
                      <button type="button" className="es-knopf" onClick={() => void umschalten(k)} aria-label={`${kontoNr(k.nummer)} ${k.aktiv ? "ausblenden" : "einblenden"}`}>
                        {k.aktiv ? "Ausblenden" : "Einblenden"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <span className="small es-fuss fi-fuss">Nummern nach dem DATEV-Standard {rahmen.toUpperCase()}, Bezeichnungen eigene Formulierung – vor dem Echtbetrieb mit dem Steuerberater abgleichen. Ausgeblendete Konten lassen sich nicht mehr bebuchen; gelöscht wird kein Konto.</span>
      {neu && <KontoNeu supabase={supabase} rahmen={rahmen} konten={konten} onClose={() => setNeu(false)} />}
    </>
  );
}

export function KontoNeu({ supabase, rahmen, konten, onClose }: { supabase: SupabaseClient; rahmen: FinEinstellungen["kontenrahmen"]; konten: FinKonto[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nummer, setNummer] = useState("");
  const [bezeichnung, setBezeichnung] = useState("");
  const [kategorie, setKategorie] = useState<KontoKategorie>("aufwand");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const n = /^\d{1,4}$/.test(nummer) ? Number(nummer) : null;
  const pruefung = n === null || n < 1 ? "Nummer von 1 bis 9999." : konten.some((k) => k.nummer === n) ? `Konto ${kontoNr(n)} gibt es schon.` : !bezeichnung.trim() ? "Die Bezeichnung fehlt." : null;
  async function anlegen() {
    if (pruefung || n === null) return;
    setLaeuft(true);
    try {
      await finKontoAnlegen(supabase, { kontenrahmen: rahmen, nummer: n, bezeichnung: bezeichnung.trim(), kategorie });
      await queryClient.invalidateQueries({ queryKey: qk.finKonten(rahmen) });
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <Blatt titel="Eigenes Konto" unter={rahmen.toUpperCase()} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void anlegen()} disabled={laeuft || !!pruefung}>Anlegen</button>
      </>}>
      <div className="fi-formular">
        <div className="nk-zeile">
          <label className="nk-feld"><span>Nummer</span><input inputMode="numeric" value={nummer} maxLength={4} onChange={(e) => { setFehler(null); setNummer(e.target.value.replace(/\D/g, "")); }} /></label>
          <label className="nk-feld"><span>Art</span>
            <select value={kategorie} onChange={(e) => setKategorie(e.target.value as KontoKategorie)}>
              {FIN_KONTO_KATEGORIEN.map((k) => <option key={k.wert} value={k.wert}>{k.text}</option>)}
            </select>
          </label>
        </div>
        <label className="nk-feld"><span>Bezeichnung</span><input value={bezeichnung} maxLength={120} onChange={(e) => { setFehler(null); setBezeichnung(e.target.value); }} /></label>
        <span className="small">Nummer und Art stehen danach fest. Die Nummer am besten aus dem Bereich wählen, in dem ähnliche Konten im {rahmen.toUpperCase()} liegen.</span>
        {(fehler || (nummer && pruefung)) && <div className="fi-hinweis fi-rot" role="alert">{fehler ?? pruefung}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Monate festschreiben
function Monate({ supabase, jahr, heute, buchungen, fest, darf, onMeldung }: {
  supabase: SupabaseClient; jahr: number; heute: string; buchungen: FinBuchung[]; fest: FinFestschreibung[]; darf: boolean;
  onMeldung: (t: string) => void;
}) {
  const queryClient = useQueryClient();
  const [frage, setFrage] = useState<number | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const bisMonat = Number(heute.slice(0, 4)) > jahr ? 12 : Number(heute.slice(0, 4)) < jahr ? 0 : Number(heute.slice(5, 7));
  const anzahl = (m: number) => buchungen.filter((b) => Number(b.datum.slice(5, 7)) === m).length;

  async function festschreiben(m: number) {
    setLaeuft(true);
    setFehler(null);
    try {
      const n = await finMonatFestschreiben(supabase, jahr, m);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setFrage(null);
      onMeldung(`${MONATE[m - 1]} ${jahr} ist festgeschrieben (${anzahlText(n)}).`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <div className="db-karte es-karte">
        {MONATE.map((name, i) => {
          const m = i + 1;
          const f = fest.find((x) => x.monat === m);
          return (
            <div key={m} className="es-zeile statisch">
              <span className="db-punkt-text">
                <b>{name} {jahr}</b>
                <span className="small">{anzahlText(anzahl(m))}{f ? ` · festgeschrieben am ${new Date(f.am).toLocaleDateString("de-DE")}` : ""}</span>
              </span>
              {f ? <span className="fi-phase">fest</span>
                : darf && m <= bisMonat ? <button type="button" className="es-knopf" onClick={() => { setFehler(null); setFrage(m); }}>Festschreiben</button>
                : null}
            </div>
          );
        })}
      </div>
      <span className="small es-fuss fi-fuss">Festschreiben heißt: In diesem Monat wird nichts mehr gebucht; Korrekturen gehen nur noch als Storno in einem offenen Monat. Das lässt sich nicht zurücknehmen.</span>
      {frage !== null && (
        <Blatt titel={`${MONATE[frage - 1]} ${jahr} festschreiben?`} onClose={() => setFrage(null)}
          fuss={<>
            <button type="button" className="btn-secondary" onClick={() => setFrage(null)} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="btn-danger" onClick={() => void festschreiben(frage)} disabled={laeuft}>{laeuft ? "schreibt fest …" : "Endgültig festschreiben"}</button>
          </>}>
          <div className="fi-formular">
            <span>{anzahlText(anzahl(frage))}. Danach kann in diesem Monat nichts mehr gebucht werden, und das lässt sich nicht rückgängig machen.</span>
            {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
          </div>
        </Blatt>
      )}
    </>
  );
}

function anzahlText(n: number): string {
  return n === 1 ? "1 Buchung" : `${n} Buchungen`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

// Saldo mit Seite: „1.234,00 € S“ (Soll) bzw. „… H“ (Haben).
function saldoText(saldo: number): string {
  if (saldo === 0) return formatEUR(0);
  return `${formatEUR(Math.abs(saldo))} ${saldo > 0 ? "S" : "H"}`;
}

"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import {
  useFinAbschlussposten, useFinAfaGebucht, useFinAnlagen, useFinEinstellungen, useFinFestschreibungen, useFinKonten, useFinSalden, useFinVortrag,
} from "@/lib/queries/hooks";
import { finAbschlusspostenAufloesen, finAbschlusspostenBuchen, finAbschlusspostenZuruecknehmen, finVortragBuchen, finVortragZuruecknehmen } from "@/lib/api/finance";
import { betragLesen, kontoNr, type FinKonto } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { MONATSNAMEN } from "@/lib/finance/auswertungen";
import { afaLaufVorschau } from "@/lib/finance/anlagen";
import {
  FIN_ABSCHLUSS_ARTEN, FIN_ABSCHLUSS_KONTEN, abschlussSchritte, anlagenspiegel, bilanz, guv, vortragAktuell,
  type AbschlussArt, type Bilanz, type FinAbschlussposten,
} from "@/lib/finance/abschluss";
import { csv } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { formatEUR } from "@/lib/format";
import type { FinanceAnsicht } from "./FinanceBereich";
import { KontoWahl } from "./FinanceBuchungen";

// Finance › Jahresabschluss (Phase F8, Migration 96, v154): Schritte zum Abschluss, Rückstellungen und Abgrenzungen
// (nur Bilanzierung), Saldenvortrag ins Folgejahr, GuV, Bilanz und Anlagenspiegel – für das laufende Jahr oder das
// Vorjahr. Gerechnet wird in lib/finance/abschluss.ts, gebucht nur von der Datenbank. Den Abschluss stellt der
// Steuerberater auf; das hier ist der vorbereitete Stand.

type Reiter = "schritte" | "guv" | "bilanz" | "spiegel";

export function FinanceAbschluss({ supabase, jahr, heute, darfSchreiben, onSeite }: {
  supabase: SupabaseClient; jahr: number; heute: string; darfSchreiben: boolean; onSeite: (s: FinanceAnsicht) => void;
}) {
  const vorQ = useFinEinstellungen(supabase, jahr - 1, true);
  const jetztQ = useFinEinstellungen(supabase, jahr, true);
  const vor = vorQ.data?.status === "da" ? vorQ.data.einstellungen : null;
  const jetzt = jetztQ.data?.status === "da" ? jetztQ.data.einstellungen : null;
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  // Bis Ende Juni steht meist noch der Abschluss des Vorjahres an.
  const j = gewaehlt ?? (vor && Number(heute.slice(5, 7)) <= 6 ? jahr - 1 : jahr);
  const e = j === jahr ? jetzt : vor;

  if (vorQ.isPending || jetztQ.isPending) return <div className="db-karte es-karte"><span className="small">Lädt …</span></div>;
  return (
    <>
      {vor && (
        <div className="lg-lagerwahl es-segment fi-reiter" role="group" aria-label="Jahr">
          {[jahr - 1, jahr].map((x) => (
            <button key={x} type="button" className={j === x ? "aktiv" : ""} aria-pressed={j === x} onClick={() => setGewaehlt(x)}>{x}</button>
          ))}
        </div>
      )}
      {!e ? (
        <div className="db-karte es-karte">
          <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {j} speichern</b>
            <span className="small">Kontenrahmen, Rechtsform und Gewinnermittlung bestimmen den Abschluss.</span></span></div>
          <button type="button" className="btn-primary fi-knopf" onClick={() => onSeite("einstellungen")}>Zu den Einstellungen</button>
        </div>
      ) : (
        <AbschlussJahr key={j} supabase={supabase} jahr={j} laufend={jahr} heute={heute} e={e} darfSchreiben={darfSchreiben} onSeite={onSeite} />
      )}
    </>
  );
}

function AbschlussJahr({ supabase, jahr, laufend, heute, e, darfSchreiben, onSeite }: {
  supabase: SupabaseClient; jahr: number; laufend: number; heute: string; e: FinEinstellungen; darfSchreiben: boolean; onSeite: (s: FinanceAnsicht) => void;
}) {
  const queryClient = useQueryClient();
  const rahmen = e.kontenrahmen;
  const istBilanz = e.gewinnermittlung === "bilanz";
  const [reiter, setReiter] = useState<Reiter>("schritte");
  const [bis, setBis] = useState(jahr < laufend ? 12 : Number(heute.slice(5, 7)));
  const [neu, setNeu] = useState(false);
  const [zurueck, setZurueck] = useState<FinAbschlussposten | "vortrag" | "erneuern" | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const saldenQ = useFinSalden(supabase, jahr, true);
  const kontenQ = useFinKonten(supabase, rahmen, true);
  const festQ = useFinFestschreibungen(supabase, jahr, true);
  const anlagenQ = useFinAnlagen(supabase, true);
  const afaQ = useFinAfaGebucht(supabase, jahr, true);
  const postenQ = useFinAbschlussposten(supabase, jahr, istBilanz);
  const vortragQ = useFinVortrag(supabase, jahr, true);

  const konten = kontenQ.data ?? [];
  const salden = saldenQ.data ?? [];
  const posten = postenQ.data ?? [];
  const vortrag = vortragQ.data ?? null;
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const vorbei = jahr < laufend;
  const afaOffen = Math.round(afaLaufVorschau(anlagenQ.data ?? [], afaQ.data ?? {}, jahr, 12).reduce((s, x) => s + x.betrag, 0) * 100) / 100;
  const ebOffen = Math.round(salden.filter((s) => s.konto === 9000).reduce((t, s) => t + s.soll - s.haben, 0) * 100) / 100;
  const schritte = abschlussSchritte({
    jahr, festgeschrieben: (festQ.data ?? []).length, afaOffen, vortragOffen: ebOffen, bilanz: istBilanz, abschlussposten: posten.length,
    vortrag,
  });

  async function tun(f: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const t = await f();
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setMeldung(t);
      return true;
    } catch (err) {
      setFehler(fehlerText(err));
      return false;
    } finally {
      setLaeuft(false);
    }
  }

  const monatWahl = (label: string) => (
    <select className="fi-monat" value={bis} onChange={(ev) => setBis(Number(ev.target.value))} aria-label={label}>
      {MONATSNAMEN.map((m, i) => (vorbei || i + 1 <= Number(heute.slice(5, 7))) && <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );

  return (
    <>
      {saldenQ.isError && <div className="fi-hinweis fi-rot" role="alert">Die Zahlen konnten nicht geladen werden.</div>}
      {vortragQ.isError && <div className="fi-hinweis fi-rot" role="alert">Der Jahresabschluss konnte nicht geladen werden. Ist Migration 96 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      {fehler && !zurueck && !neu && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="lg-lagerwahl es-segment fi-reiter fi-reiter-breit" role="tablist" aria-label="Jahresabschluss">
        {([["schritte", "Schritte"], ["guv", "GuV"], ["bilanz", "Bilanz"], ["spiegel", "Anlagenspiegel"]] as [Reiter, string][]).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>{t}</button>
        ))}
      </div>

      {reiter === "schritte" && (
        <>
          <div className="db-karte es-karte">
            {schritte.map((s, i) => (
              <div key={s.key} className="es-zeile statisch fi-buchung">
                <span className={"fi-schritt" + (s.erledigt ? " fertig" : "")} aria-label={s.erledigt ? "erledigt" : "offen"}>{s.erledigt ? "✓" : i + 1}</span>
                <span className="db-punkt-text"><b>{s.text}</b><span className="small">{s.hinweis}</span></span>
              </div>
            ))}
          </div>

          {istBilanz && (
            <>
              <span className="op-gruppe-titel">RÜCKSTELLUNGEN UND ABGRENZUNGEN ZUM 31.12.{jahr}</span>
              <div className="db-karte es-karte">
                {postenQ.isPending ? <span className="small">Lädt …</span>
                  : posten.length === 0 ? <span className="small">Noch keine. Was gehört hierher? Kosten dieses Jahres, die erst später bezahlt werden (Rückstellung), und Zahlungen, die ins nächste Jahr gehören (Abgrenzung).</span>
                  : posten.map((p) => (
                    <div key={p.id}>
                    <div className="es-zeile statisch fi-buchung">
                      <span className="fi-nr">{kontoNr(p.konto)}</span>
                      <span className="db-punkt-text"><b>{p.text}</b>
                        <span className="small">{FIN_ABSCHLUSS_ARTEN.find((a) => a.wert === p.art)?.text} · {name(p.konto)}
                          {p.art !== "rueckstellung" ? (p.aufloesung_buchung_id ? ` · aufgelöst am 01.01.${jahr + 1}` : " · noch nicht aufgelöst") : ""}</span></span>
                      <span className="fi-betrag">{formatEUR(p.betrag)}</span>
                    </div>
                      {darfSchreiben && (
                        <div className="fi-aktion">
                          {p.art !== "rueckstellung" && !p.aufloesung_buchung_id && vorbei && (
                            <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => void tun(async () => { await finAbschlusspostenAufloesen(supabase, p.id); return `„${p.text}“ am 01.01.${jahr + 1} aufgelöst.`; })}>Auflösen</button>
                          )}
                          <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => { setFehler(null); setZurueck(p); }}>Zurücknehmen …</button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {darfSchreiben && (
                <div className="fi-werkzeug">
                  <button type="button" className="btn-secondary fi-knopf" disabled={heute < `${jahr}-12-01`} onClick={() => { setFehler(null); setMeldung(null); setNeu(true); }}>Abschlussbuchung …</button>
                  {heute < `${jahr}-12-01` && <span className="small">Ab dem 01.12.{jahr}.</span>}
                </div>
              )}
            </>
          )}

          <span className="op-gruppe-titel">SALDENVORTRAG NACH {jahr + 1}</span>
          <Vortrag jahr={jahr} vorbei={vorbei} vortrag={vortrag} laedt={vortragQ.isPending} name={name} rahmen={rahmen}
            kapitalgesellschaft={e.rechtsform === "ug" || e.rechtsform === "gmbh"} darfSchreiben={darfSchreiben} laeuft={laeuft}
            onBuchen={() => void tun(async () => { const r = await finVortragBuchen(supabase, jahr, null); return r.nr ? `Saldenvortrag gebucht (Nr. ${r.nr} in ${jahr + 1}, ${r.konten} Konten).` : "Es gab nichts vorzutragen."; })}
            onErneuern={() => { setFehler(null); setZurueck("erneuern"); }} onZuruecknehmen={() => { setFehler(null); setZurueck("vortrag"); }}
            onEinstellungen={() => onSeite("einstellungen")} />
          <span className="small es-fuss fi-fuss">Vorgetragen werden die Bestandskonten am 01.01.{jahr + 1} gegen 9000. Umsatz- und Vorsteuer stehen danach zusammen auf
            {" "}{kontoNr(FIN_ABSCHLUSS_KONTEN[rahmen].ust_vorjahr)} Umsatzsteuer Vorjahr; Gewinn{e.rechtsform === "ug" || e.rechtsform === "gmbh" ? " geht in den Gewinnvortrag" : " und Privatkonten gehen ins Kapital"}.
            Wird im alten Jahr danach noch gebucht, einfach neu vortragen.</span>
        </>
      )}

      {reiter === "guv" && (() => {
        const g = guv(salden, konten, rahmen, bis);
        return (
          <>
            <div className="fi-werkzeug">
              {monatWahl("Bis Monat")}
              <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`GuV_${jahr}_${String(bis).padStart(2, "0")}.csv`,
                csv([["Nr.", "Posten", "Betrag"], ...g.zeilen.map((z) => [z.nr, z.text, z.betrag])]), "text/csv;charset=utf-8")}>Als CSV</button>
            </div>
            <div className="db-karte es-karte">
              <table className="fi-tabelle fi-ust">
                <thead><tr><th>Nr.</th><th>Gewinn- und Verlustrechnung {bis < 12 ? `Januar bis ${MONATSNAMEN[bis - 1]}` : ""} {jahr}</th><th className="zahl">Betrag</th></tr></thead>
                <tbody>{g.zeilen.map((z) => <tr key={z.text} className={z.summe ? "summe" : undefined}><td>{z.nr}</td><td>{z.text}</td><td className="zahl">{formatEUR(z.betrag)}</td></tr>)}</tbody>
              </table>
            </div>
            <span className="small es-fuss fi-fuss">Gesamtkostenverfahren nach § 275 Abs. 2 HGB, nur die Posten, die Finance bebucht (Nummern wie im Gesetz). Nach Buchungsdatum, ohne Umsatzsteuer.
              {!istBilanz ? " Bei EÜR nicht verlangt – steuerlich zählt die EÜR unter Auswertungen." : ""}</span>
          </>
        );
      })()}

      {reiter === "bilanz" && (() => {
        const b = bilanz(salden, konten, rahmen, e.rechtsform, bis);
        return (
          <>
            <div className="fi-werkzeug">
              {monatWahl("Stand Ende Monat")}
              <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`Bilanz_${jahr}_${String(bis).padStart(2, "0")}.csv`, csv(bilanzCsv(b)), "text/csv;charset=utf-8")}>Als CSV</button>
            </div>
            <BilanzSeite titel="Aktiva" gruppen={b.aktiva} summe={b.summeAktiva} />
            <BilanzSeite titel="Passiva" gruppen={b.passiva} summe={b.summePassiva} />
            {b.summeAktiva !== b.summePassiva && <div className="fi-hinweis fi-rot" role="alert">Aktiva und Passiva weichen ab – bitte melden.</div>}
            {b.vortragOffen !== 0 && <div className="fi-hinweis fi-warn">Konto 9000 steht nicht auf 0 ({formatEUR(b.vortragOffen)}) – ein Anfangsbestand fehlt oder ist doppelt. Er steht bis dahin im Eigenkapital.</div>}
            <span className="small es-fuss fi-fuss">Stand Ende {MONATSNAMEN[bis - 1]} {jahr}, gegliedert nach § 266 HGB in der verkürzten Form. Konten nach Saldo (ein Bankkonto im Minus steht bei
              den Verbindlichkeiten, Vorsteuer bei den sonstigen Vermögensgegenständen).{!istBilanz ? " Bei EÜR nicht verlangt – zeigt den Stand der Konten." : ""}</span>
          </>
        );
      })()}

      {reiter === "spiegel" && (() => {
        const s = anlagenspiegel(anlagenQ.data ?? [], jahr);
        const spalten: [string, (z: (typeof s.zeilen)[number]) => number][] = [
          ["AK 01.01.", (z) => z.akBeginn], ["Zugang", (z) => z.zugang], ["Abgang", (z) => z.abgang], ["AfA " + jahr, (z) => z.afaJahr], ["Buchwert 31.12.", (z) => z.buchwertEnde],
        ];
        return (
          <>
            <div className="fi-werkzeug">
              <button type="button" className="btn-secondary fi-knopf" disabled={!s.zeilen.length} onClick={() => dateiHerunterladen(`Anlagenspiegel_${jahr}.csv`, csv([
                ["Konto", "Bezeichnung", "AK 01.01.", "Zugänge", "Abgänge", "AK 31.12.", "AfA kumuliert 01.01.", `AfA ${jahr}`, "AfA auf Abgänge", "AfA kumuliert 31.12.", "Buchwert 31.12.", "Buchwert Vorjahr"],
                ...[...s.zeilen, s.summe].map((z) => [z.konto ? kontoNr(z.konto) : "", z.konto ? name(z.konto) : "Summe", z.akBeginn, z.zugang, z.abgang, z.akEnde, z.afaBeginn, z.afaJahr, z.afaAbgang, z.afaEnde, z.buchwertEnde, z.buchwertVorjahr]),
              ]), "text/csv;charset=utf-8")}>Als CSV</button>
            </div>
            <div className="db-karte es-karte">
              {s.zeilen.length === 0 ? <span className="small">Im Anlagenverzeichnis steht für {jahr} nichts.</span> : (
                <div className="fi-quer">
                  <table className="fi-tabelle fi-spiegel">
                    <thead><tr><th>Konto</th>{spalten.map(([t]) => <th key={t} className="zahl">{t}</th>)}</tr></thead>
                    <tbody>{s.zeilen.map((z) => <tr key={z.konto}><td title={name(z.konto)}>{kontoNr(z.konto)} {name(z.konto)}</td>{spalten.map(([t, f]) => <td key={t} className="zahl">{formatEUR(f(z))}</td>)}</tr>)}</tbody>
                    <tfoot><tr><td>Summe</td>{spalten.map(([t, f]) => <td key={t} className="zahl">{formatEUR(f(s.summe))}</td>)}</tr></tfoot>
                  </table>
                </div>
              )}
            </div>
            <span className="small es-fuss fi-fuss">Aus dem Anlagenverzeichnis, je Anlagekonto. Die CSV enthält dazu die kumulierten Abschreibungen und den Buchwert des Vorjahres.
              Sammelposten scheiden nach fünf Jahren aus; GWG stehen mit Zugang und voller Abschreibung darin.</span>
          </>
        );
      })()}

      {neu && (
        <PostenBlatt jahr={jahr} konten={konten} laeuft={laeuft} fehler={fehler} onClose={() => { setNeu(false); setFehler(null); }}
          onBuchen={async (art, konto, betrag, text) => {
            const ok = await tun(async () => { const r = await finAbschlusspostenBuchen(supabase, jahr, art, konto, betrag, text); return `${FIN_ABSCHLUSS_ARTEN.find((a) => a.wert === art)?.text} gebucht (Nr. ${r.nr}).`; });
            if (ok) setNeu(false);
          }} />
      )}
      {zurueck && (
        <GrundBlatt
          titel={zurueck === "vortrag" ? "Saldenvortrag zurücknehmen" : zurueck === "erneuern" ? "Neu vortragen" : "Abschlussbuchung zurücknehmen"}
          text={zurueck === "vortrag" ? `Der Vortrag in ${jahr + 1} wird storniert.` : zurueck === "erneuern" ? `Der bisherige Vortrag wird storniert und mit dem jetzigen Stand von ${jahr} neu gebucht.`
            : `„${zurueck.text}“ wird storniert${zurueck.aufloesung_buchung_id ? ", die Auflösung im Folgejahr mit" : ""}.`}
          knopf={zurueck === "erneuern" ? "Neu vortragen" : "Zurücknehmen"} laeuft={laeuft} fehler={fehler}
          onClose={() => { setZurueck(null); setFehler(null); }}
          onOk={async (grund) => {
            const z = zurueck;
            const ok = await tun(async () => {
              if (z === "vortrag") { await finVortragZuruecknehmen(supabase, jahr, grund); return "Saldenvortrag zurückgenommen."; }
              if (z === "erneuern") { const r = await finVortragBuchen(supabase, jahr, grund); return `Neu vorgetragen (Nr. ${r.nr} in ${jahr + 1}).`; }
              await finAbschlusspostenZuruecknehmen(supabase, z.id, grund); return `„${z.text}“ zurückgenommen.`;
            });
            if (ok) setZurueck(null);
          }} />
      )}
    </>
  );
}

function Vortrag({ jahr, vorbei, vortrag, laedt, name, rahmen, kapitalgesellschaft, darfSchreiben, laeuft, onBuchen, onErneuern, onZuruecknehmen, onEinstellungen }: {
  jahr: number; vorbei: boolean; vortrag: ReturnType<typeof useFinVortrag>["data"] | null; laedt: boolean; name: (n: number) => string;
  rahmen: FinEinstellungen["kontenrahmen"]; kapitalgesellschaft: boolean; darfSchreiben: boolean; laeuft: boolean;
  onBuchen: () => void; onErneuern: () => void; onZuruecknehmen: () => void; onEinstellungen: () => void;
}) {
  if (laedt) return <div className="db-karte es-karte"><span className="small">Lädt …</span></div>;
  if (!vortrag || !vortrag.eingerichtet) return <div className="db-karte es-karte"><span className="small">Für {jahr} gibt es keinen Stand.</span></div>;
  const ziel = FIN_ABSCHLUSS_KONTEN[rahmen][kapitalgesellschaft ? "gewinnvortrag" : "kapital"];
  const aktuell = vortrag.gebucht ? vortragAktuell(vortrag.zeilen, vortrag.gebucht.zeilen) : false;
  return (
    <>
      <div className="db-karte es-karte">
        {vortrag.zeilen.length === 0 ? <span className="small">In {jahr} ist nichts gebucht, das vorzutragen wäre.</span> : vortrag.zeilen.map((z) => (
          <div key={z.konto} className="es-zeile statisch fi-buchung">
            <span className="fi-nr">{kontoNr(z.konto)}</span>
            <span className="db-punkt-text"><b>{name(z.konto) || "Konto " + z.konto}</b>
              {z.konto === ziel && <span className="small">{kapitalgesellschaft ? "mit dem Jahresergebnis" : "mit Gewinn und Privatkonten"}</span>}</span>
            <span className="fi-betrag">{formatEUR(Math.abs(z.betrag))} {z.betrag > 0 ? "S" : "H"}</span>
          </div>
        ))}
      </div>
      {!vorbei ? <span className="small es-fuss">Vorgetragen wird, wenn das Jahr vorbei ist – ab dem 01.01.{jahr + 1}.</span>
        : !vortrag.folgejahr ? (
          <div className="fi-hinweis fi-warn">Für {jahr + 1} sind die Finance-Einstellungen noch nicht gespeichert.
            {" "}<button type="button" className="btn-secondary" onClick={onEinstellungen}>Zu den Einstellungen</button></div>
        ) : vortrag.vonHand > 0 ? (
          <div className="fi-hinweis fi-warn">In {jahr + 1} sind schon Anfangsbestände von Hand auf 9000 gebucht ({vortrag.vonHand === 1 ? "1 Buchung" : `${vortrag.vonHand} Buchungen`}).
            Erst stornieren (Buchungen), sonst stünde alles doppelt da.</div>
        ) : darfSchreiben && (
          <div className="fi-werkzeug">
            {!vortrag.gebucht && <button type="button" className="btn-primary fi-knopf" disabled={laeuft || !vortrag.zeilen.length} onClick={onBuchen}>Saldenvortrag buchen</button>}
            {vortrag.gebucht && <span className="small">{aktuell ? `Gebucht am ${datumKurz(vortrag.gebucht.datum)} (Nr. ${vortrag.gebucht.nr}) – stimmt mit ${jahr} überein.`
              : `Gebucht (Nr. ${vortrag.gebucht.nr}), aber ${jahr} hat sich seitdem geändert.`}</span>}
            {vortrag.gebucht && !aktuell && <button type="button" className="btn-primary fi-knopf" disabled={laeuft} onClick={onErneuern}>Neu vortragen …</button>}
            {vortrag.gebucht && <button type="button" className="btn-secondary fi-knopf" disabled={laeuft} onClick={onZuruecknehmen}>Zurücknehmen …</button>}
          </div>
        )}
    </>
  );
}

function BilanzSeite({ titel, gruppen, summe }: { titel: string; gruppen: Bilanz["aktiva"]; summe: number }) {
  return (
    <div className="db-karte es-karte">
      <table className="fi-tabelle fi-bilanz">
        <thead><tr><th>{titel}</th><th className="zahl">Betrag</th></tr></thead>
        <tbody>
          {gruppen.length === 0 && <tr><td>–</td><td className="zahl">{formatEUR(0)}</td></tr>}
          {gruppen.map((g) => [
            <tr key={g.titel} className="gruppe"><td>{g.titel}</td><td className="zahl">{formatEUR(g.summe)}</td></tr>,
            ...g.zeilen.map((z) => <tr key={g.titel + z.text} className="steuer"><td>{z.text}</td><td className="zahl">{formatEUR(z.betrag)}</td></tr>),
          ])}
        </tbody>
        <tfoot><tr><td>Summe {titel}</td><td className="zahl">{formatEUR(summe)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function bilanzCsv(b: Bilanz): (string | number)[][] {
  const zeilen: (string | number)[][] = [["Seite", "Posten", "Betrag"]];
  for (const [seite, gruppen, summe] of [["Aktiva", b.aktiva, b.summeAktiva], ["Passiva", b.passiva, b.summePassiva]] as const) {
    for (const g of gruppen) {
      zeilen.push([seite, g.titel, g.summe]);
      for (const z of g.zeilen) zeilen.push([seite, "  " + z.text, z.betrag]);
    }
    zeilen.push([seite, "Summe " + seite, summe]);
  }
  return zeilen;
}

function PostenBlatt({ jahr, konten, laeuft, fehler, onClose, onBuchen }: {
  jahr: number; konten: FinKonto[]; laeuft: boolean; fehler: string | null; onClose: () => void;
  onBuchen: (art: AbschlussArt, konto: number, betrag: number, text: string) => void;
}) {
  const [art, setArt] = useState<AbschlussArt>("rueckstellung");
  const [konto, setKonto] = useState("");
  const [betragText, setBetragText] = useState("");
  const [text, setText] = useState("");
  const def = FIN_ABSCHLUSS_ARTEN.find((a) => a.wert === art)!;
  const betrag = betragLesen(betragText);
  const bereit = !!konto && !!betrag && betrag > 0 && text.trim().length > 0;
  return (
    <Blatt titel="Abschlussbuchung" unter={`zum 31.12.${jahr}`} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={!bereit || laeuft} onClick={() => onBuchen(art, Number(konto), betrag!, text.trim())}>{laeuft ? "bucht …" : "Buchen"}</button>
      </>}>
      <div className="fi-formular">
        <div className="lg-lagerwahl es-segment fi-reiter-breit" role="group" aria-label="Art">
          {FIN_ABSCHLUSS_ARTEN.map((a) => (
            <button key={a.wert} type="button" className={art === a.wert ? "aktiv" : ""} aria-pressed={art === a.wert} onClick={() => { setArt(a.wert); setKonto(""); }}>{a.text}</button>
          ))}
        </div>
        <span className="small">{def.hinweis}</span>
        <label className="nk-feld"><span>{def.kontoArt === "erloes" ? "Erlöskonto" : "Aufwandskonto"}</span>
          <KontoWahl wert={konto} konten={konten} nur={[def.kontoArt]} onWert={setKonto} label={def.kontoArt === "erloes" ? "Erlöskonto" : "Aufwandskonto"} /></label>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Betrag (netto)</span><input inputMode="decimal" value={betragText} onChange={(ev) => setBetragText(ev.target.value)} placeholder="0,00" aria-label="Betrag" /></label>
          <label className="nk-feld"><span>Wofür</span><input value={text} maxLength={120} onChange={(ev) => setText(ev.target.value)} placeholder="z. B. Abschlusskosten" aria-label="Text" /></label>
        </div>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function GrundBlatt({ titel, text, knopf, laeuft, fehler, onClose, onOk }: {
  titel: string; text: string; knopf: string; laeuft: boolean; fehler: string | null; onClose: () => void; onOk: (grund: string) => void;
}) {
  const [grund, setGrund] = useState("");
  return (
    <Blatt titel={titel} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={!grund.trim() || laeuft} onClick={() => onOk(grund.trim())}>{laeuft ? "…" : knopf}</button>
      </>}>
      <div className="fi-formular">
        <span className="small">{text} Die Buchungen bleiben im Journal (Storno).</span>
        <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={120} onChange={(ev) => setGrund(ev.target.value)} autoFocus aria-label="Grund" /></label>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

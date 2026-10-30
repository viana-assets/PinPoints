"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useBetrieb, useFinZahlauftraege } from "@/lib/queries/hooks";
import { finZahlauftragAnlegen, finZahlauftragVerwerfen } from "@/lib/api/finance";
import type { FinBankkonto } from "@/lib/finance/bank";
import { ibanSauber } from "@/lib/finance/bank";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";
import {
  FIN_ZAHLUNG_VORLAUF_TAGE, auftragZustand, plusTage, sepaDateiname, sepaXml, zahlungsvorschlag, type AuftragZustand, type FinZahlauftrag,
} from "@/lib/finance/zahlungen";
import { formatEUR } from "@/lib/format";

// Finance › Bank & Kasse › Zahlungen (Stufe E Teil 2, Migration 113, v186): Zahlungsvorschlag für fällige Belege und
// die SEPA-Überweisungsdatei. Die App überweist nichts und bucht nichts: Die Datei wird im Online-Banking hochgeladen
// und dort freigegeben; gebucht wird, wenn die Abbuchung auf dem Kontoauszug steht (Reiter „Offen“).
//
// Datenschutz: IBANs der Lieferanten stehen nur hier und in der Datei – sie gehen an niemanden außer der eigenen Bank.

const ZUSTAND_TEXT: Record<AuftragZustand, string> = { offen: "Abbuchung offen", teilweise: "teilweise abgeglichen", erledigt: "abgeglichen", verworfen: "verworfen" };

export function FinanceZahlungen({ supabase, heute, belege, lieferanten, bankkonten, darfSchreiben, onMeldung }: {
  supabase: SupabaseClient; heute: string; belege: FinBeleg[]; lieferanten: FinLieferant[]; bankkonten: FinBankkonto[];
  darfSchreiben: boolean; onMeldung: (t: string) => void;
}) {
  const queryClient = useQueryClient();
  const auftraegeQ = useFinZahlauftraege(supabase, true);
  const betriebQ = useBetrieb(supabase, true);
  const mitIban = bankkonten.filter((k) => k.aktiv && k.iban);
  const [stichtag, setStichtag] = useState(plusTage(heute, FIN_ZAHLUNG_VORLAUF_TAGE));
  const [ausfuehrung, setAusfuehrung] = useState(heute);
  const [kontoId, setKontoId] = useState(mitIban.length === 1 ? mitIban[0].id : "");
  const [ab, setAb] = useState<Set<string>>(new Set());
  const [offen, setOffen] = useState<string | null>(null);
  const [verwerfen, setVerwerfen] = useState<FinZahlauftrag | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (auftraegeQ.isError) return <div className="fi-hinweis fi-info">Zahlungen gibt es ab Migration 113 – im Supabase-SQL-Editor ausführen.</div>;
  const auftraege = auftraegeQ.data ?? [];
  const vorschlag = zahlungsvorschlag(belege, lieferanten, auftraege, stichtag, ausfuehrung);
  const gewaehlt = vorschlag.filter((v) => !v.grund && !ab.has(v.beleg.id));
  const summe = Math.round(gewaehlt.reduce((s, v) => s + v.betrag, 0) * 100) / 100;
  const betrieb = betriebQ.data;
  const auftraggeber = betrieb?.firma?.trim() || betrieb?.inhaber?.trim() || "";
  const pruefung = !auftraggeber ? "Der Firmenname fehlt – in FSM unter Admin › Betrieb eintragen (er steht als Auftraggeber in der Datei)."
    : !kontoId ? "Das Bankkonto wählen, von dem überwiesen wird." : ausfuehrung < heute ? "Die Ausführung kann nicht in der Vergangenheit liegen." : null;

  function datei(a: FinZahlauftrag) {
    const bk = bankkonten.find((k) => k.id === a.bankkonto_id);
    if (!bk?.iban) { setFehler("Das Bankkonto des Zahlauftrags hat keine IBAN mehr."); return; }
    const eigeneBic = betrieb && ibanSauber(betrieb.iban) === bk.iban && betrieb.bic.trim() ? betrieb.bic.replace(/\s/g, "").toUpperCase() : null;
    const text = sepaXml(a, a.fin_zahlauftrag_posten, { name: auftraggeber || bk.name, iban: bk.iban, bic: eigeneBic });
    herunterladen(text, sepaDateiname(a));
  }

  async function erstellen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finZahlauftragAnlegen(supabase, kontoId, ausfuehrung, gewaehlt.map((v) => ({ beleg: v.beleg.id, betrag: v.betrag, skonto: v.skonto })));
      await queryClient.invalidateQueries({ queryKey: qk.finZahlauftraege() });
      const neu = queryClient.getQueryData<FinZahlauftrag[]>(qk.finZahlauftraege())?.find((a) => a.id === r.id);
      if (neu) datei(neu);
      setAb(new Set());
      onMeldung(`SEPA-Datei mit ${r.anzahl === 1 ? "1 Überweisung" : `${r.anzahl} Überweisungen`} über ${formatEUR(r.summe)} erstellt – jetzt im Online-Banking hochladen und freigeben.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <span className="op-gruppe-titel">ZAHLUNGSVORSCHLAG</span>
      <div className="fi-werkzeug fi-zahl-werkzeug">
        <label className="nk-feld"><span>Fällig bis</span><input type="date" value={stichtag} onChange={(e) => setStichtag(e.target.value)} aria-label="Fällig bis" /></label>
        <label className="nk-feld"><span>Ausführen am</span><input type="date" value={ausfuehrung} min={heute} onChange={(e) => setAusfuehrung(e.target.value)} aria-label="Ausführen am" /></label>
        <label className="nk-feld"><span>Von Konto</span>
          <select value={kontoId} onChange={(e) => setKontoId(e.target.value)} aria-label="Von Konto">
            <option value="">Bankkonto wählen</option>
            {mitIban.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select></label>
      </div>
      <div className="db-karte es-karte fi-sammel">
        {auftraegeQ.isPending ? <span className="small">Lädt …</span>
          : vorschlag.length === 0 ? <span className="small">Nichts fällig bis {datumKurz(stichtag)} und kein Skonto zu ziehen.</span>
          : vorschlag.map((v) => {
            const an = !v.grund && !ab.has(v.beleg.id);
            const ueber = v.faellig < heute;
            return (
              <label key={v.beleg.id} className={"es-zeile statisch fi-sammel-zeile" + (an ? " gewaehlt" : "") + (v.grund ? " fi-leise" : "")}>
                <span className="fi-sammel-kopf">
                  <input type="checkbox" checked={an} disabled={!!v.grund || !darfSchreiben} aria-label={`${v.lieferant?.name ?? "Beleg"} ${v.beleg.belegnummer ?? ""} zahlen`}
                    onChange={() => { const n = new Set(ab); if (n.has(v.beleg.id)) n.delete(v.beleg.id); else n.add(v.beleg.id); setAb(n); }} />
                  <span className="db-punkt-text"><b>{v.lieferant?.name ?? "ohne Lieferant"}{v.beleg.belegnummer ? ` · ${v.beleg.belegnummer}` : ""}</b>
                    <span className="small"><span className={ueber ? "fi-rot-text" : ""}>fällig {datumKurz(v.faellig)}</span>
                      {v.skonto > 0 && v.skontoBis ? <> · <span className="fi-gruen-text">Skonto {formatEUR(v.skonto)} bis {datumKurz(v.skontoBis)}</span></> : ""}
                      {v.rest !== Number(v.beleg.brutto) ? ` · offen ${formatEUR(v.rest)}` : ""}
                      {v.grund ? <> · <span className="fi-rot-text">{v.grund}</span></> : ""}</span></span>
                </span>
                <span className="fi-betrag">{formatEUR(v.betrag)}</span>
              </label>
            );
          })}
      </div>
      {darfSchreiben && vorschlag.length > 0 && (
        <div className="fi-werkzeug">
          <button type="button" className="btn-primary fi-knopf" disabled={laeuft || gewaehlt.length === 0 || !!pruefung} onClick={() => void erstellen()}>
            {laeuft ? "erstellt …" : `SEPA-Datei erstellen (${gewaehlt.length} · ${formatEUR(summe)})`}</button>
        </div>
      )}
      {darfSchreiben && pruefung && gewaehlt.length > 0 && <div className="fi-hinweis fi-info">{pruefung}</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <span className="small es-fuss fi-fuss">Die Datei (SEPA pain.001) im Online-Banking hochladen und dort freigeben – überwiesen wird erst dann. Gebucht wird,
        wenn die Abbuchungen auf dem Kontoauszug stehen: im Reiter „Offen“ passt jede zu ihrem Beleg, Skonto inklusive. IBAN und Zahlungsziel stehen beim Lieferanten (Belege › Lieferanten).</span>

      <span className="op-gruppe-titel">ZAHLAUFTRÄGE</span>
      <div className="db-karte es-karte">
        {auftraege.length === 0 ? <span className="small">Noch keine SEPA-Datei erstellt.</span> : auftraege.slice(0, 30).map((a) => {
          const z = auftragZustand(a, belege);
          const bk = bankkonten.find((k) => k.id === a.bankkonto_id);
          return (
            <div key={a.id} className={"fi-zahlauftrag" + (z === "verworfen" ? " fi-leise" : "")}>
              <div className="es-zeile statisch fi-vorgang">
                <button type="button" className="fi-zahlauftrag-kopf" aria-expanded={offen === a.id} onClick={() => setOffen(offen === a.id ? null : a.id)}>
                  <span className="db-punkt-text"><b>{datumKurz(a.ausfuehrung)} · {a.anzahl === 1 ? "1 Überweisung" : `${a.anzahl} Überweisungen`}</b>
                    <span className="small">{bk?.name ?? "Bankkonto"} · erstellt {datumKurz(a.erstellt_am)} · <span className={z === "erledigt" ? "fi-gruen-text" : z === "verworfen" ? "" : "fi-rot-text"}>{ZUSTAND_TEXT[z]}</span>
                      {a.verworfen_grund ? ` (${a.verworfen_grund})` : ""}</span></span>
                  <span className="fi-betrag">{formatEUR(a.summe)}</span>
                </button>
                {z !== "verworfen" && <button type="button" className="es-knopf" onClick={() => datei(a)}>Datei</button>}
                {darfSchreiben && (z === "offen" || z === "teilweise") && <button type="button" className="es-knopf" onClick={() => setVerwerfen(a)}>Verwerfen …</button>}
              </div>
              {offen === a.id && (
                <div className="fi-gruppe">
                  {a.fin_zahlauftrag_posten.map((p) => {
                    const bezahlt = belege.find((b) => b.id === p.beleg_id)?.bezahlt_am;
                    return (
                      <div key={p.id} className="es-zeile statisch fi-buchung">
                        <span className="db-punkt-text"><b>{p.name}</b><span className="small">{p.zweck} · {ibanKurz(p.iban)}{bezahlt ? <> · <span className="fi-gruen-text">bezahlt {datumKurz(bezahlt)}</span></> : ""}</span></span>
                        <span className="fi-betrag">{formatEUR(p.betrag)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="small es-fuss fi-fuss">Verwerfen, wenn eine Datei nicht hochgeladen oder bei der Bank abgelehnt wurde – die Belege stehen dann wieder im Vorschlag.</span>
      {verwerfen && (
        <VerwerfenBlatt supabase={supabase} auftrag={verwerfen} onClose={() => setVerwerfen(null)}
          onFertig={() => { setVerwerfen(null); onMeldung("Zahlauftrag verworfen – die Belege stehen wieder im Vorschlag."); }} />
      )}
    </>
  );
}

function VerwerfenBlatt({ supabase, auftrag, onFertig, onClose }: { supabase: SupabaseClient; auftrag: FinZahlauftrag; onFertig: () => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function los() {
    setLaeuft(true); setFehler(null);
    try { await finZahlauftragVerwerfen(supabase, auftrag.id, grund.trim()); await queryClient.invalidateQueries({ queryKey: qk.finZahlauftraege() }); onFertig(); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  return (
    <Blatt titel="Zahlauftrag verwerfen" unter={`${datumKurz(auftrag.ausfuehrung)} · ${formatEUR(auftrag.summe)}`} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()} onClick={() => void los()}>Verwerfen</button>
      </>}>
      <div className="fi-formular">
        <span className="small">Nur verwerfen, wenn die Datei bei der Bank NICHT ausgeführt wird – sonst würde doppelt gezahlt.</span>
        <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={200} autoFocus onChange={(e) => setGrund(e.target.value)} placeholder="z. B. nicht hochgeladen" /></label>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function herunterladen(text: string, name: string) {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ibanKurz(iban: string): string {
  return `${iban.slice(0, 4)} … ${iban.slice(-4)}`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinMahnungen } from "@/lib/queries/hooks";
import { fetchFinMahnungen, finMahnungErstellen, finMahnungZurueckziehen } from "@/lib/api/finance";
import { betragLesen } from "@/lib/finance/buchung";
import { rechnungRest, type FinRechnungZeile } from "@/lib/finance/rechnungen";
import {
  FIN_MAHNPAUSCHALE_UNTERNEHMER, FIN_MAHNSTUFEN, aktiveMahnungen, mahnGesamt, mahnText, mahnVorschlag, mailtoMahnung, verzugszinsen, type FinMahnung,
} from "@/lib/finance/mahnung";
import { anschriftZeilen, firmaOhneInhaber, girocodeText } from "@/lib/rechnung";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";
import type { RechnungAbsender, RechnungEmpfaenger } from "@/lib/types";
import { formatEUR } from "@/lib/format";
import { GiroBild } from "@/components/rechnungen/RechnungDokument";

// Finance: Mahnwesen (Migration 99, v157). Steht im Fenster einer Rechnung: bisherige Erinnerungen und Mahnungen,
// darunter die nächste Stufe zum Erstellen. Das Schreiben ist ein Snapshot (Absender, Empfänger, Beträge, Text) und
// wird gedruckt bzw. als PDF gespeichert – verschickt wird nichts automatisch, die E-Mail bereitet die App nur vor.

const datumDe = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export function MahnAbschnitt({ supabase, r, heute, darfSchreiben, onFertig }: {
  supabase: SupabaseClient; r: FinRechnungZeile; heute: string; darfSchreiben: boolean; onFertig: (meldung: string) => void;
}) {
  const queryClient = useQueryClient();
  const mahnQ = useFinMahnungen(supabase, true);
  const alle = mahnQ.data ?? [];
  const eigene = alle.filter((m) => m.rechnung_id === r.rechnung_id).sort((a, b) => a.stufe - b.stufe || a.erstellt_am.localeCompare(b.erstellt_am));
  const aktiv = aktiveMahnungen(alle, r.rechnung_id);
  const v = mahnVorschlag(r, alle, heute);
  const [neu, setNeu] = useState(false);
  const [zeigen, setZeigen] = useState<FinMahnung | null>(null);
  const [zurueck, setZurueck] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Nach dem Erstellen bleibt das Rechnungsfenster offen (das Schreiben liegt darüber), die Meldung steht hier.
  const [ok, setOk] = useState<string | null>(null);

  if (mahnQ.isError) return <span className="small fi-rot-text">Die Mahnungen konnten nicht geladen werden. Ist Migration 99 ausgeführt?</span>;
  if (!eigene.length && v.art === "keine") return null;
  const stufe = v.art === "keine" ? null : v.stufe;
  const erstellbar = darfSchreiben && (v.art === "jetzt" || (v.art === "noch_nicht" && v.moeglich));

  return (
    <div className="fi-skonto">
      <span className="op-gruppe-titel">MAHNUNGEN</span>
      {eigene.map((m) => (
        <div key={m.id} className={"fi-skonto-zeile" + (m.zurueckgezogen_am ? " fi-leise" : "")}>
          <span className="small"><b>{FIN_MAHNSTUFEN[m.stufe - 1].titel}</b> vom {datumDe(m.datum)} · Frist {datumDe(m.frist)} · {formatEUR(mahnGesamt(m))}
            {m.zurueckgezogen_am ? ` · zurückgezogen (${m.zurueck_grund ?? ""})` : ""}</span>
          <span className="fi-skonto-form fi-rechts">
            <button type="button" className="es-knopf" onClick={() => setZeigen(m)}>Ansehen / drucken</button>
            {darfSchreiben && !m.zurueckgezogen_am && aktiv[aktiv.length - 1]?.id === m.id && zurueck !== m.id && (
              <button type="button" className="es-knopf" onClick={() => { setZurueck(m.id); setGrund(""); }}>Zurückziehen …</button>
            )}
          </span>
          {zurueck === m.id && (
            <span className="fi-skonto-form">
              <input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} placeholder="Grund" aria-label="Grund" autoFocus />
              <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setZurueck(null)}>Abbrechen</button>
              <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()} onClick={() => void (async () => {
                setLaeuft(true); setFehler(null);
                try {
                  await finMahnungZurueckziehen(supabase, m.id, grund.trim());
                  await queryClient.invalidateQueries({ queryKey: qk.finMahnungen() });
                  setZurueck(null);
                  onFertig(`${FIN_MAHNSTUFEN[m.stufe - 1].titel} zurückgezogen.`);
                } catch (e) { setFehler(fehlerText(e)); } finally { setLaeuft(false); }
              })()}>Zurückziehen</button>
            </span>
          )}
        </div>
      ))}
      {v.art !== "keine" && <span className="small">{v.art === "jetzt" ? `Fällig: ${FIN_MAHNSTUFEN[v.stufe - 1].titel}.` : v.grund + "."}</span>}
      {v.art === "keine" && eigene.length > 0 && <span className="small">{v.grund === "bezahlt" ? "Die Rechnung ist bezahlt." : `Keine weitere Stufe – ${v.grund}.`}</span>}
      {erstellbar && stufe && !neu && (
        <button type="button" className={(v.art === "jetzt" ? "btn-primary" : "es-knopf") + " fi-links"} onClick={() => { setNeu(true); setFehler(null); setOk(null); }}>
          {FIN_MAHNSTUFEN[stufe - 1].titel} erstellen …</button>
      )}
      {neu && stufe && (
        <MahnFormular supabase={supabase} r={r} stufe={stufe} heute={heute}
          ersteFrist={aktiv.find((m) => m.stufe === 1)?.frist ?? null}
          onAbbrechen={() => setNeu(false)}
          onErstellt={async (id) => {
            setNeu(false);
            const liste = await queryClient.fetchQuery({ queryKey: qk.finMahnungen(), queryFn: () => fetchFinMahnungen(supabase), staleTime: 0 });
            setZeigen(liste.find((m) => m.id === id) ?? null);
            setOk(`${FIN_MAHNSTUFEN[stufe - 1].titel} erstellt – jetzt drucken oder als PDF speichern.`);
          }} />
      )}
      {ok && <div className="fi-hinweis fi-ok" role="status">{ok}</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      {zeigen && <MahnungBlatt m={zeigen} onClose={() => setZeigen(null)} />}
    </div>
  );
}

function MahnFormular({ supabase, r, stufe, heute, ersteFrist, onAbbrechen, onErstellt }: {
  supabase: SupabaseClient; r: FinRechnungZeile; stufe: number; heute: string; ersteFrist: string | null;
  onAbbrechen: () => void; onErstellt: (id: string) => void | Promise<void>;
}) {
  const def = FIN_MAHNSTUFEN[stufe - 1];
  const offen = rechnungRest(r);
  const [datum, setDatum] = useState(heute);
  const [frist, setFrist] = useState(() => {
    const d = new Date(Date.parse(heute + "T00:00:00Z") + def.fristTage * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [gebuehrText, setGebuehrText] = useState("0,00");
  const [mitZinsen, setMitZinsen] = useState(false);
  const [unternehmer, setUnternehmer] = useState(false);
  const [eigenerText, setEigenerText] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const gebuehr = betragLesen(gebuehrText) ?? 0;
  // Wie `fin_mahnung_erstellen()`: 0 bis 100 €, auf den Cent.
  const gebuehrFalsch = betragLesen(gebuehrText) == null || gebuehr < 0 || gebuehr > 100;
  // Zinsen erst ab dem Tag nach der Frist der Zahlungserinnerung (Verzug durch Mahnung, § 286 BGB).
  const zinsAb = ersteFrist ? new Date(Date.parse(ersteFrist + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10) : null;
  const zins = mitZinsen && zinsAb ? verzugszinsen(offen, zinsAb, datum, unternehmer ? "unternehmer" : "verbraucher") : { zinsen: 0, satz: null, tage: 0 };
  const gesamt = Math.round((offen + gebuehr + zins.zinsen) * 100) / 100;
  const vorschlag = mahnText({ stufe, nummer: r.nummer_text, rechnungDatum: r.datum, offen, gesamt, frist });
  const text = eigenerText ?? vorschlag;

  async function erstellen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const x = await finMahnungErstellen(supabase, r.rechnung_id, { stufe, datum, frist, gebuehr, zinsen: zins.zinsen, zinssatz: mitZinsen ? zins.satz : null, text });
      await onErstellt(x.id);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="fi-formular">
      <div className="fi-zwei">
        <label className="nk-feld"><span>Datum</span><input type="date" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} /></label>
        <label className="nk-feld"><span>Neue Zahlungsfrist</span><input type="date" value={frist} min={datum} onChange={(e) => setFrist(e.target.value)} aria-label="Frist" /></label>
      </div>
      <div className="fi-zwei">
        <label className="nk-feld"><span>Mahngebühr</span><input inputMode="decimal" value={gebuehrText} onChange={(e) => setGebuehrText(e.target.value)} aria-label="Mahngebühr" /></label>
        <span className="small">Offen {formatEUR(offen)}. Bei Privatkunden nur die tatsächlichen Kosten (Porto); bei Unternehmen ist zusätzlich eine Pauschale von {formatEUR(FIN_MAHNPAUSCHALE_UNTERNEHMER)} möglich.</span>
      </div>
      {stufe > 1 && zinsAb && (
        <>
          <button type="button" className="es-zeile" aria-pressed={mitZinsen} onClick={() => setMitZinsen(!mitZinsen)}>
            <span className="db-punkt-text"><b>Verzugszinsen ausweisen</b>
              <span className="small">ab {datumDe(zinsAb)} (nach der Frist der Zahlungserinnerung){mitZinsen ? ` · ${zins.satz?.toLocaleString("de-DE")} % · ${zins.tage} Tage · ${formatEUR(zins.zinsen)}` : ""}</span></span>
            <span className={"nk-spur" + (mitZinsen ? " an" : "")} aria-hidden="true"><span /></span>
          </button>
          {mitZinsen && (
            <div className="lg-lagerwahl es-segment fi-reiter-breit" role="group" aria-label="Kunde">
              <button type="button" className={!unternehmer ? "aktiv" : ""} aria-pressed={!unternehmer} onClick={() => setUnternehmer(false)}>Privatkunde (+5 Punkte)</button>
              <button type="button" className={unternehmer ? "aktiv" : ""} aria-pressed={unternehmer} onClick={() => setUnternehmer(true)}>Unternehmen (+9 Punkte)</button>
            </div>
          )}
        </>
      )}
      <label className="nk-feld"><span>Text</span>
        <textarea rows={8} value={text} maxLength={2000} onChange={(e) => setEigenerText(e.target.value)} aria-label="Text der Mahnung" /></label>
      {eigenerText != null && <button type="button" className="es-knopf fi-links" onClick={() => setEigenerText(null)}>Vorschlag wieder einsetzen</button>}
      <span className="small">Gesamt {formatEUR(gesamt)}. Gebühr und Zinsen stehen nur auf dem Schreiben – gebucht wird, was der Kunde zahlt (ein Mehrbetrag auf Sonstige Erträge).</span>
      {gebuehrFalsch && <span className="small fi-rot-text">Die Mahngebühr liegt zwischen 0 und 100 €.</span>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="fi-aktion">
        <button type="button" className="btn-secondary" disabled={laeuft} onClick={onAbbrechen}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={laeuft || gebuehrFalsch || !frist || frist <= datum || datum > heute || !text.trim()} onClick={() => void erstellen()}>
          {laeuft ? "erstellt …" : `${def.titel} erstellen`}</button>
      </div>
    </div>
  );
}

// Das Schreiben – A4 wie die Rechnung (dieselben Druckregeln, `druck-fenster`), über dem Rechnungsfenster.
export function MahnungBlatt({ m, onClose }: { m: FinMahnung; onClose: () => void }) {
  const mail = mailtoMahnung(m);
  return (
    <Blatt breite="dokument" ebene="druck-fenster modal-storno" className="rechnung-modal" onClose={onClose}
      label={`${FIN_MAHNSTUFEN[m.stufe - 1].titel} ${m.nummer_text}`} titel={`${FIN_MAHNSTUFEN[m.stufe - 1].titel} zu ${m.nummer_text}`}
      fuss={<>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Drucken / als PDF speichern</button>
        {mail && <a className="btn-secondary" href={mail}>E-Mail vorbereiten</a>}
      </>}>
      <style>{RECHNUNG_SEITE_CSS}</style>
      {m.zurueckgezogen_am && <div className="hinweis-pflicht druck-weg">Zurückgezogen – nicht mehr verschicken ({m.zurueck_grund}).</div>}
      {!mail && <div className="re-notizen druck-weg"><span>Für eine E-Mail fehlt die Adresse des Kunden – drucken geht.</span></div>}
      <div className="rechnung-vorschau">
        <div className="rechnung-vorschau-rahmen"><MahnungDokument m={m} /></div>
      </div>
    </Blatt>
  );
}

export function MahnungDokument({ m }: { m: FinMahnung }) {
  const a = m.absender as unknown as RechnungAbsender;
  const e = m.empfaenger as unknown as RechnungEmpfaenger;
  const gesamt = mahnGesamt(m);
  const giro = girocodeText({ absender: a, brutto: gesamt, nummer_text: m.nummer_text });
  const absenderZeile = [a.firma, a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <div className="rechnungsseite">
      <div className="rechnung-koerper">
        <div className="re-kopf">
          <div className="re-kopf-text">
            <div className="re-firma">{firmaOhneInhaber(a.firma ?? "", a.inhaber ?? "")}</div>
            {a.inhaber && <div className="re-inhaber">{a.inhaber}</div>}
          </div>
          {a.logo && <img className="re-logo" src={a.logo} alt="" />}
        </div>
        <div className="re-adressteil">
          <div className="re-anschrift">
            {absenderZeile && <div className="re-absenderzeile">{absenderZeile}</div>}
            {anschriftZeilen(e).map((z, i) => <div key={i}>{z}</div>)}
          </div>
          <div className="re-daten">
            <div><span>Datum</span><b>{datumDe(m.datum)}</b></div>
            <div><span>Rechnungsnr.</span><b>{m.nummer_text}</b></div>
            {e.kundennummer != null && <div><span>Kundennr.</span><b>{e.kundennummer}</b></div>}
          </div>
        </div>
        <h1 className="re-titel">{FIN_MAHNSTUFEN[m.stufe - 1].titel}</h1>
        <div className="re-anschreiben">{m.text}</div>
        <table className="re-tabelle">
          <thead><tr><th>Rechnung</th><th>vom</th><th>fällig am</th><th className="re-sp-summe">Betrag</th><th className="re-sp-summe">bezahlt</th><th className="re-sp-summe">offen</th></tr></thead>
          <tbody><tr><td>{m.nummer_text}</td><td>{datumDe(m.rechnung_datum)}</td><td>{datumDe(m.faellig_am)}</td>
            <td className="re-sp-summe">{formatEUR(m.brutto)}</td><td className="re-sp-summe">{formatEUR(m.bezahlt)}</td><td className="re-sp-summe">{formatEUR(m.offen)}</td></tr></tbody>
        </table>
        <div className="re-summen">
          <div className="re-summenblock">
            <div><span>Offener Betrag</span><b>{formatEUR(m.offen)}</b></div>
            {m.gebuehr > 0 && <div><span>Mahngebühr</span><b>{formatEUR(m.gebuehr)}</b></div>}
            {m.zinsen > 0 && <div><span>Verzugszinsen{m.zinssatz != null ? ` (${m.zinssatz.toLocaleString("de-DE")} % p. a.)` : ""}</span><b>{formatEUR(m.zinsen)}</b></div>}
            <div className="re-gesamt"><span>Zu zahlen bis {datumDe(m.frist)}</span><b>{formatEUR(gesamt)}</b></div>
          </div>
        </div>
        {giro && (
          <div className="re-giro">
            <GiroBild text={giro} />
            <div><b>Bequem überweisen</b><div className="small">Den Code in der Banking-App einlesen – Empfänger, IBAN, Betrag und Verwendungszweck stehen dann schon drin.</div></div>
          </div>
        )}
      </div>
      <div className="re-fuss">
        <div>
          <b>{firmaOhneInhaber(a.firma ?? "", a.inhaber ?? "")}</b>
          {a.inhaber && <div>Inhaber: {a.inhaber}</div>}
          {a.strasse && <div>{a.strasse}</div>}
          {(a.plz || a.ort) && <div>{[a.plz, a.ort].filter(Boolean).join(" ")}</div>}
        </div>
        <div>
          {a.telefon && <div>{a.telefon}</div>}
          {a.email && <div>{a.email}</div>}
          {a.steuernummer && <div>Steuernr.: {a.steuernummer}</div>}
          {a.ust_id && <div>USt-IdNr.: {a.ust_id}</div>}
        </div>
        <div>
          {a.bank && <div>{a.bank}</div>}
          {a.iban && <div>IBAN: {a.iban}</div>}
          {a.bic && <div>BIC: {a.bic}</div>}
        </div>
      </div>
    </div>
  );
}


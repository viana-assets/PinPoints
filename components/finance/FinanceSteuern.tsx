"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinUst } from "@/lib/queries/hooks";
import { finSteuerJahrSpeichern, finUstAbgegeben } from "@/lib/api/finance";
import { betragLesen, kontoNr } from "@/lib/finance/buchung";
import {
  KLEINUNTERNEHMER_GRENZE_LAUFEND, KLEINUNTERNEHMER_GRENZE_VORJAHR, finKurztext, type FinEinstellungen,
} from "@/lib/finance/einstellungen";
import {
  FIN_UST_ZAHLUNG_KONTEN, kuPruefung, sondervorauszahlungVorschlag, ustFormular, ustFrist, ustJahreswerte, ustZustand, ustZustandText, zeitraumText,
  type FinKennzahlen, type FinUstZeitraum, type UstZustand,
} from "@/lib/finance/steuern";
import { formatEUR } from "@/lib/format";

// Finance › Steuern (Phase F5, Migration 92, v150): Umsatzsteuer-Voranmeldung als PROBELAUF. Kennzahlen je
// Zeitraum aus dem Journal, Frist, Zustand; „als abgegeben festhalten“ legt eine Fassung ab, eine spätere
// Änderung im Zeitraum fällt auf (Berichtigung). Übermittelt wird über ELSTER oder den Steuerberater.

export function FinanceSteuern({ supabase, jahr, heute, einstellungen, darfSchreiben, onEinstellungen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null; darfSchreiben: boolean; onEinstellungen: () => void;
}) {
  const e = einstellungen;
  const svzGilt = !!e && e.voranmeldung === "monat" && e.dauerfrist && e.besteuerung !== "klein";
  const standQ = useFinUst(supabase, jahr, !!e);
  const vorjahrQ = useFinUst(supabase, jahr - 1, svzGilt);
  const [offen, setOffen] = useState<FinUstZeitraum | null>(null);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  if (!e) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {jahr} speichern</b>
          <span className="small">Besteuerung, Soll/Ist und Voranmeldungszeitraum bestimmen, was hier steht.</span></span></div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const stand = standQ.data;
  const zeitraeume = stand?.eingerichtet ? stand.zeitraeume : [];
  const mitZustand = zeitraeume.map((z) => ({ z, s: ustZustand(z, e, heute) }));
  const sichtbar = alleZeigen ? mitZustand : mitZustand.filter((x) => x.s.art !== "kommt" && x.s.art !== "vorher");
  const konten = FIN_UST_ZAHLUNG_KONTEN[e.kontenrahmen];
  const svz = stand?.eingerichtet ? stand.sondervorauszahlung : null;
  // Kz 39 steht erst in der Abgabe (Datenbank) – für die Ansicht des Dezembers hier schon dazu.
  const mitSvz = (z: FinUstZeitraum): FinKennzahlen => (svzGilt && z.zeitraum === "M12" && svz ? { ...z.kennzahlen, "39": { s: svz } } : z.kennzahlen);

  return (
    <>
      {standQ.isError && <div className="fi-hinweis fi-rot" role="alert">Finance › Steuern konnte nicht geladen werden. Ist Migration 92 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      <div className="fi-hinweis fi-warn" role="note">
        <b>Probelauf</b> · Die Zahlen kommen aus den Buchungen in Finance – im Pilot nur ein Teil des Geschäfts. Nicht ungeprüft in ELSTER
        übernehmen; abgegeben wird wie bisher über den Steuerberater oder das ELSTER-Portal.
      </div>

      <span className="op-gruppe-titel">SO WIRD ANGEMELDET</span>
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>{finKurztext(e)}</b>
          <span className="small">{e.besteuerung === "klein"
            ? "Kleinunternehmer geben keine Voranmeldung ab – außer in Zeiträumen mit § 13b oder innergemeinschaftlichem Erwerb."
            : e.voranmeldung === "keine" ? "Befreit von der Voranmeldung: nur die Jahreserklärung."
            : `Abgabe und Zahlung bis zum 10. ${e.dauerfrist ? "des übernächsten Monats (Dauerfristverlängerung)" : "des Folgemonats"}; fällt der Tag auf ein Wochenende oder einen Feiertag, am nächsten Werktag.`}
            {e.versteuerung === "ist" && e.besteuerung !== "klein" ? " Ist-Versteuerung: Rechnungen aus FSM zählen im Monat der Zahlung." : ""}</span></span></div>
      </div>

      <span className="op-gruppe-titel">{e.voranmeldung === "keine" ? "JAHR" : "VORANMELDUNGEN"}</span>
      <div className="db-karte es-karte">
        {standQ.isPending ? <span className="small">Lädt …</span> : sichtbar.length === 0 ? <span className="small">Noch kein Zeitraum.</span>
          : sichtbar.map(({ z, s }) => {
            const f = ustFormular(mitSvz(z));
            const frist = ustFrist(z.bis, z.zeitraum, e.dauerfrist);
            return (
              <button key={z.zeitraum} type="button" className={"es-zeile fi-buchung" + (s.art === "kommt" || s.art === "keine" || s.art === "vorher" ? " fi-leise" : "")} onClick={() => setOffen(z)}>
                <span className="db-punkt-text"><b>{zeitraumText(z.zeitraum, jahr)}</b>
                  <span className="small">{frist && s.art !== "keine" && s.art !== "vorher" ? `Frist ${datumKurz(frist)} · ` : ""}<span className={zustandKlasse(s)}>{ustZustandText(s)}</span></span></span>
                <span className="fi-betrag">{f.leer ? "–" : formatEUR(f.zahllast)}</span>
              </button>
            );
          })}
        {!alleZeigen && mitZustand.some((x) => x.s.art === "kommt" || x.s.art === "vorher") && (
          <button type="button" className="btn-secondary fi-mehr" onClick={() => setAlleZeigen(true)}>Alle Zeiträume des Jahres zeigen</button>
        )}
      </div>
      <span className="small es-fuss fi-fuss">Rechts die Zahllast laut Formular (positiv = zahlen, negativ = Erstattung). Bezahlt wird per Überweisung –
        unter Bank & Kasse den Umsatz ans Finanzamt auf {kontoNr(konten.vorauszahlung)} Umsatzsteuer-Vorauszahlungen buchen
        {svzGilt ? `, die Sondervorauszahlung auf ${kontoNr(konten.sonder)}` : ""}.</span>

      {e.besteuerung !== "klein" && e.voranmeldung !== "keine" && stand?.eingerichtet && <Jahreswerte jahr={jahr} w={ustJahreswerte(stand, svzGilt)} />}

      {e.besteuerung === "klein" && stand?.eingerichtet && (
        <Kleinunternehmer supabase={supabase} jahr={jahr} umsatzJahr={stand.umsatz_jahr} umsatzVorjahr={stand.umsatz_vorjahr} svz={stand.sondervorauszahlung}
          darfSchreiben={darfSchreiben} onGespeichert={setMeldung} />
      )}
      {svzGilt && stand?.eingerichtet && (
        <Sondervorauszahlung supabase={supabase} jahr={jahr} wert={stand.sondervorauszahlung} umsatzVorjahr={stand.umsatz_vorjahr}
          vorschlag={vorjahrQ.data ? sondervorauszahlungVorschlag(vorjahrQ.data) : null} konto={konten.sonder}
          darfSchreiben={darfSchreiben} onGespeichert={setMeldung} />
      )}

      {offen && (
        <UstBlatt supabase={supabase} jahr={jahr} heute={heute} einstellungen={e}
          z={zeitraeume.find((x) => x.zeitraum === offen.zeitraum) ?? offen} kennzahlen={mitSvz(zeitraeume.find((x) => x.zeitraum === offen.zeitraum) ?? offen)}
          darfSchreiben={darfSchreiben} onFertig={(t) => { setOffen(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
    </>
  );
}

function Jahreswerte({ jahr, w }: { jahr: number; w: ReturnType<typeof ustJahreswerte> }) {
  const [auf, setAuf] = useState(false);
  return (
    <>
      <span className="op-gruppe-titel">JAHRESWERTE {jahr}</span>
      <div className="db-karte es-karte">
        <button type="button" className="es-zeile" aria-expanded={auf} onClick={() => setAuf(!auf)}>
          <span className="db-punkt-text"><b>Umsatzsteuer für das Jahr {formatEUR(w.formular.zahllast)}</b>
            <span className="small">angemeldet {formatEUR(w.angemeldet)} ({w.abgegeben} von {w.zeitraeume} Zeiträumen){w.sondervorauszahlung ? ` · Sondervorauszahlung ${formatEUR(w.sondervorauszahlung)}` : ""}</span></span>
          <span className={"fi-betrag" + (w.unterschied > 0 ? " fi-rot-text" : "")}>{w.unterschied === 0 ? "±0" : formatEUR(w.unterschied)}</span>
        </button>
        {auf && (
          <table className="fi-tabelle fi-ust">
            <thead><tr><th>Kz</th><th>Jahr {jahr}</th><th className="zahl">Bemessung</th><th className="zahl">Steuer</th></tr></thead>
            <tbody>{w.formular.zeilen.map((z) => <tr key={z.kz}><td>{z.kz}</td><td>{z.text}</td><td className="zahl">{z.bemessung == null ? "" : formatEUR(z.bemessung)}</td><td className="zahl">{z.steuer == null ? "" : formatEUR(z.steuer * z.seite)}</td></tr>)}</tbody>
            <tfoot>
              <tr><td /><td>Umsatzsteuer für das Jahr</td><td /><td className="zahl">{formatEUR(w.formular.zahllast)}</td></tr>
              <tr><td /><td>abzüglich angemeldet{w.sondervorauszahlung ? " und Sondervorauszahlung" : ""}</td><td /><td className="zahl">{formatEUR(-(w.angemeldet + w.sondervorauszahlung))}</td></tr>
              <tr><td /><td>{w.unterschied >= 0 ? "Voraussichtliche Abschlusszahlung" : "Voraussichtliche Erstattung"}</td><td /><td className="zahl">{formatEUR(w.unterschied)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>
      <span className="small es-fuss fi-fuss">Zur Vorbereitung der Umsatzsteuererklärung: alle Zeiträume zusammen, gerechnet wie das Formular, gegen die letzte
        abgegebene Fassung jedes Zeitraums. Die Jahreserklärung hat eigene Zeilen – die Kennzahlen hier sind die der Voranmeldung; abgegeben wird über die Kanzlei.</span>
    </>
  );
}

function zustandKlasse(s: UstZustand): string {
  return s.art === "ueberfaellig" || s.art === "geaendert" ? "fi-rot-text" : s.art === "abgegeben" ? "fi-gruen-text" : "";
}

// ---------------------------------------------------------------- Ein Zeitraum
function UstBlatt({ supabase, jahr, heute, einstellungen: e, z, kennzahlen, darfSchreiben, onFertig, onClose }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen; z: FinUstZeitraum; kennzahlen: FinKennzahlen;
  darfSchreiben: boolean; onFertig: (t: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const s = ustZustand(z, e, heute);
  const f = ustFormular(kennzahlen);
  const [festhalten, setFesthalten] = useState(false);
  const [am, setAm] = useState(heute);
  const [notiz, setNotiz] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const vorbei = heute > z.bis;
  const berichtigung = z.abgaben.length > 0;
  const amOk = am > z.bis && am <= heute;

  async function los() {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finUstAbgegeben(supabase, jahr, z.zeitraum, am, notiz.trim());
      await queryClient.invalidateQueries({ queryKey: qk.finUst(jahr) });
      onFertig(r.fassung > 1 ? `Berichtigung festgehalten (Fassung ${r.fassung}).` : "Abgabe festgehalten.");
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  const fuss = darfSchreiben && vorbei && s.art !== "keine" && s.art !== "vorher" ? (festhalten ? <>
    <button type="button" className="btn-secondary" onClick={() => setFesthalten(false)} disabled={laeuft}>Zurück</button>
    <button type="button" className="btn-primary" onClick={() => void los()} disabled={laeuft || !amOk}>{laeuft ? "…" : berichtigung ? "Berichtigung festhalten" : "Abgabe festhalten"}</button>
  </> : (
    <button type="button" className="btn-primary" onClick={() => setFesthalten(true)}>{berichtigung ? "Berichtigung festhalten …" : "Als abgegeben festhalten …"}</button>
  )) : undefined;

  return (
    <Blatt titel={`Voranmeldung ${zeitraumText(z.zeitraum, jahr)}`} unter={`${datumKurz(z.von)}–${datumKurz(z.bis)} · ${ustZustandText(s)}`}
      breite="breit" onClose={onClose} fuss={fuss}>
      <div className="fi-formular">
        {s.art === "geaendert" && (
          <div className="fi-hinweis fi-rot" role="alert">Seit der Abgabe am {datumKurz(s.am)} wurde in diesem Zeitraum gebucht oder storniert.
            Eine berichtigte Voranmeldung ist nötig (in ELSTER „Berichtigte Anmeldung“, Kz 10 = 1).</div>
        )}
        {s.art === "vorher" && <div className="fi-hinweis fi-info">Dieser Zeitraum liegt vor dem Starttag von Finance ({datumKurz(e.start_datum)}) – er gehört nicht zum Probelauf.</div>}
        {s.art === "keine" && <div className="fi-hinweis fi-info">Kleinunternehmer: In diesem Zeitraum gibt es weder § 13b noch innergemeinschaftlichen Erwerb – keine Voranmeldung.</div>}
        {f.leer ? (
          <span className="small">In diesem Zeitraum ist nichts mit Steuerschlüssel gebucht.{s.art !== "keine" && e.besteuerung !== "klein" && e.voranmeldung !== "keine" ? " Abzugeben ist trotzdem – als Nullmeldung." : ""}</span>
        ) : (
          <table className="fi-tabelle fi-ust">
            <thead><tr><th>Kz</th><th>Zeile</th><th className="zahl">Bemessung</th><th className="zahl">Steuer</th></tr></thead>
            <tbody>
              {f.zeilen.map((x) => (
                <tr key={x.kz}>
                  <td><b>{x.steuerKz ? `${x.kz}/${x.steuerKz}` : x.kz}</b></td>
                  <td>{x.text}</td>
                  <td className="zahl">{x.bemessung == null ? "" : `${x.bemessung.toLocaleString("de-DE")} €`}</td>
                  <td className="zahl">{x.steuer == null ? "" : formatEUR(x.seite * x.steuer)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>83</td><td>{f.zahllast >= 0 ? "Verbleibende Vorauszahlung" : "Verbleibender Überschuss (Erstattung)"}</td><td /><td className="zahl">{formatEUR(f.zahllast)}</td></tr></tfoot>
          </table>
        )}
        {!f.leer && f.zahllast !== f.zahllastBuch && (
          <span className="small">Laut Buchhaltung {formatEUR(f.zahllastBuch)} – der Unterschied kommt aus den vollen Euro im Formular, das die Steuer zu 81, 86 und 89 selbst rechnet.</span>
        )}
        {z.abgaben.length > 0 && (
          <>
            <span className="op-gruppe-titel">FESTGEHALTEN</span>
            <div className="fi-gruppe">
              {z.abgaben.map((a) => (
                <div key={a.fassung} className="es-zeile statisch fi-buchung">
                  <span className="db-punkt-text"><b>{a.fassung > 1 ? `Fassung ${a.fassung} (Berichtigung)` : "Abgabe"}</b>
                    <span className="small">abgegeben am {datumKurz(a.abgegeben_am)}{a.notiz ? ` · ${a.notiz}` : ""}</span></span>
                  <span className="fi-betrag">{formatEUR(ustFormular(a.kennzahlen).zahllast)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {festhalten && (
          <>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Abgegeben am</span><input type="date" value={am} min={plusTag(z.bis)} max={heute} onChange={(ev) => setAm(ev.target.value)} /></label>
              <label className="nk-feld"><span>Notiz</span><input value={notiz} maxLength={200} onChange={(ev) => setNotiz(ev.target.value)} placeholder="z. B. über Steuerberater" /></label>
            </div>
            <span className="small">Festgehalten werden die Kennzahlen, wie sie jetzt sind. {berichtigung ? "Die frühere Fassung bleibt stehen." : "Ändert sich danach etwas im Zeitraum, zeigt Finance das an."}</span>
          </>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Kleinunternehmer und Sondervorauszahlung
function Kleinunternehmer({ supabase, jahr, umsatzJahr, umsatzVorjahr, svz, darfSchreiben, onGespeichert }: {
  supabase: SupabaseClient; jahr: number; umsatzJahr: number; umsatzVorjahr: number | null; svz: number | null;
  darfSchreiben: boolean; onGespeichert: (t: string) => void;
}) {
  const k = kuPruefung(umsatzJahr, umsatzVorjahr);
  const klasse = (st: "ok" | "nahe" | "ueber") => "db-karte fi-kachel" + (st === "ueber" ? " fi-kachel-warn" : st === "nahe" ? " fi-kachel-nahe" : "");
  return (
    <>
      <span className="op-gruppe-titel">KLEINUNTERNEHMER-GRENZEN (§ 19)</span>
      <div className="fi-kacheln">
        <div className={klasse(k.laufend.stufe)}><span className="small">Umsatz {jahr} (Finance)</span><b>{formatEUR(umsatzJahr)}</b>
          <span className="small">{prozent(k.laufend.anteil)} von {formatEUR(KLEINUNTERNEHMER_GRENZE_LAUFEND)}</span></div>
        <div className={klasse(k.vorjahr?.stufe ?? "ok")}><span className="small">Umsatz {jahr - 1}</span><b>{umsatzVorjahr == null ? "–" : formatEUR(umsatzVorjahr)}</b>
          <span className="small">{k.vorjahr ? `${prozent(k.vorjahr.anteil)} von ${formatEUR(KLEINUNTERNEHMER_GRENZE_VORJAHR)}` : "unten eintragen"}</span></div>
      </div>
      {k.laufend.stufe === "ueber" && <div className="fi-hinweis fi-rot" role="alert">Die Grenze von {formatEUR(KLEINUNTERNEHMER_GRENZE_LAUFEND)} ist überschritten: Ab dem Umsatz, mit dem sie überschritten wurde, gilt die Regelbesteuerung – sofort mit dem Steuerberater klären.</div>}
      {k.laufend.stufe === "nahe" && <div className="fi-hinweis fi-warn">Der Umsatz {jahr} nähert sich der Grenze von {formatEUR(KLEINUNTERNEHMER_GRENZE_LAUFEND)}.</div>}
      {k.vorjahr?.stufe === "ueber" && <div className="fi-hinweis fi-rot" role="alert">Der Umsatz {jahr - 1} lag über {formatEUR(KLEINUNTERNEHMER_GRENZE_VORJAHR)} – für {jahr} gilt die Kleinunternehmerregelung nicht.</div>}
      <span className="small es-fuss fi-fuss">Der Umsatz {jahr} zählt nur, was in Finance gebucht ist – im Pilot nicht alles.</span>
      <BetragFeld jahr={jahr} titel={`Umsatz ${jahr - 1}`} hinweis="Gesamtumsatz des Vorjahres laut Steuerberater oder Jahreserklärung."
        wert={umsatzVorjahr} darfSchreiben={darfSchreiben} speichern={(w) => finSteuerJahrSpeichern(supabase, jahr, { umsatz_vorjahr: w, sondervorauszahlung: svz })}
        onGespeichert={onGespeichert} />
    </>
  );
}

function Sondervorauszahlung({ supabase, jahr, wert, umsatzVorjahr, vorschlag, konto, darfSchreiben, onGespeichert }: {
  supabase: SupabaseClient; jahr: number; wert: number | null; umsatzVorjahr: number | null; vorschlag: number | null; konto: number;
  darfSchreiben: boolean; onGespeichert: (t: string) => void;
}) {
  return (
    <>
      <span className="op-gruppe-titel">SONDERVORAUSZAHLUNG {jahr}</span>
      <BetragFeld jahr={jahr} titel="Festgesetzte Sondervorauszahlung"
        hinweis={`Ein Elftel der Vorauszahlungen ${jahr - 1}, bis 10. Februar zu zahlen (auf ${kontoNr(konto)} buchen) und in der Voranmeldung Dezember als Kz 39 angerechnet.${vorschlag ? ` Laut den festgehaltenen Voranmeldungen ${jahr - 1}: ${formatEUR(vorschlag)}.` : ""}`}
        wert={wert} darfSchreiben={darfSchreiben} speichern={(w) => finSteuerJahrSpeichern(supabase, jahr, { umsatz_vorjahr: umsatzVorjahr, sondervorauszahlung: w })}
        onGespeichert={onGespeichert} />
    </>
  );
}

function BetragFeld({ jahr, titel, hinweis, wert, darfSchreiben, speichern, onGespeichert }: {
  jahr: number; titel: string; hinweis: string; wert: number | null; darfSchreiben: boolean;
  speichern: (w: number | null) => Promise<void>; onGespeichert: (t: string) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(wert == null ? "" : wert.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zahl = text.trim() ? betragLesen(text) : null;
  const ungueltig = !!text.trim() && (zahl == null || zahl < 0);
  const geaendert = (zahl ?? null) !== (wert ?? null);
  async function los() {
    setLaeuft(true);
    setFehler(null);
    try {
      await speichern(zahl);
      await queryClient.invalidateQueries({ queryKey: qk.finUst(jahr) });
      onGespeichert(`${titel} gespeichert.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <div className="db-karte es-karte fi-karte">
      <div className="fi-werkzeug">
        <label className="nk-feld fi-suche"><span>{titel} in €</span>
          <input inputMode="decimal" value={text} disabled={!darfSchreiben} onChange={(e) => setText(e.target.value)} placeholder="0,00" aria-label={titel} /></label>
        {darfSchreiben && <button type="button" className="btn-primary fi-knopf" disabled={laeuft || ungueltig || !geaendert} onClick={() => void los()}>Speichern</button>}
      </div>
      <span className="small">{hinweis}</span>
      {ungueltig && <div className="fi-hinweis fi-rot" role="alert">Bitte einen Betrag eintragen, z. B. 1.250,00.</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Hilfen
function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

function plusTag(iso: string): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
}

function prozent(a: number): string {
  return `${Math.round(a * 100)} %`;
}

"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinAfaGebucht, useFinAnlagen, useFinBelege, useFinEinstellungen, useFinFahrzeuge, useFinKonten, useFinLieferanten } from "@/lib/queries/hooks";
import { finAfaBuchen, finAnlageAbgang, finAnlageAbgangZuruecknehmen, finAnlageLoeschen, finAnlageSpeichern } from "@/lib/api/finance";
import { betragLesen, kontoNr, type FinKonto } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import {
  FIN_AFA_ARTEN, FIN_ND_VORSCHLAG, afaBis, afaLaufVorschau, afaPlan, anlageMaengel, artText, artVorschlag, buchwertEnde, degressivSatz,
  type AfaArt, type FinAnlage,
} from "@/lib/finance/anlagen";
import { MONATSNAMEN } from "@/lib/finance/auswertungen";
import { formatEUR } from "@/lib/format";
import { KontoWahl } from "./FinanceBuchungen";

// Finance › Anlagen (Phase F7, Migration 95, v153): Anlagenverzeichnis mit Abschreibungsplan, Abschreibungen
// monatsweise buchen, Abgang. Gerechnet wird wie `fin_afa_bis()` (lib/finance/anlagen.ts), gebucht nur von der
// Datenbank. Der Kauf selbst ist ein Beleg oder eine Bankbuchung auf das Anlagekonto – hier entsteht nur der Plan.

export function FinanceAnlagen({ supabase, jahr, heute, einstellungen, darfSchreiben, belegeSehen, onEinstellungen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null; darfSchreiben: boolean; belegeSehen: boolean;
  onEinstellungen: () => void;
}) {
  const queryClient = useQueryClient();
  const e = einstellungen;
  const rahmen = e?.kontenrahmen ?? "skr03";
  const anlagenQ = useFinAnlagen(supabase, !!e);
  const gebuchtQ = useFinAfaGebucht(supabase, jahr, !!e);
  const kontenQ = useFinKonten(supabase, rahmen, !!e);
  const laufend = heute.slice(0, 4) === String(jahr) ? Number(heute.slice(5, 7)) : 12;
  const [bisMonat, setBisMonat] = useState(laufend);
  const [offen, setOffen] = useState<FinAnlage | "neu" | null>(null);
  const [lauf, setLauf] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!e) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {jahr} speichern</b>
          <span className="small">Der Kontenrahmen bestimmt Anlage- und Abschreibungskonten.</span></span></div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const anlagen = anlagenQ.data ?? [];
  const gebucht = gebuchtQ.data ?? {};
  const konten = kontenQ.data ?? [];
  const tEnde = jahr * 12 + 11;
  const tJetzt = jahr * 12 + bisMonat - 1;
  const aktive = anlagen.filter((a) => !a.abgang || a.art === "sammelposten");
  const vorschau = afaLaufVorschau(anlagen, gebucht, jahr, bisMonat);
  const summeVorschau = Math.round(vorschau.reduce((s, x) => s + x.betrag, 0) * 100) / 100;
  const afaJahr = anlagen.reduce((s, a) => s + afaBis(a, tEnde) - afaBis(a, jahr * 12 - 1), 0);
  const gebuchtJahr = Object.values(gebucht).reduce((s, b) => s + b, 0);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const gruppe = (f: (a: FinAnlage) => boolean) => anlagen.filter(f).sort((a, b) => a.anschaffung.localeCompare(b.anschaffung));

  async function buchen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finAfaBuchen(supabase, jahr, bisMonat);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setLauf(false);
      setMeldung(r.nr ? `Abschreibungen bis ${MONATSNAMEN[bisMonat - 1]} gebucht (Nr. ${r.nr}, ${formatEUR(r.summe)} für ${r.anlagen === 1 ? "1 Anlage" : `${r.anlagen} Anlagen`}).` : "Es war nichts zu buchen.");
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  const zeile = (a: FinAnlage) => {
    const afa = afaBis(a, tEnde) - afaBis(a, jahr * 12 - 1);
    return (
      <button key={a.id} type="button" className={"es-zeile fi-buchung" + (a.abgang && a.art !== "sammelposten" ? " fi-leise" : "")} onClick={() => { setMeldung(null); setOffen(a); }}>
        <span className="fi-nr">{kontoNr(a.konto)}</span>
        <span className="db-punkt-text"><b>{a.bezeichnung}</b>
          <span className="small">{artText(a.art)} · ab {datumKurz(a.anschaffung)} · {formatEUR(a.ak)}{a.monate ? ` · ${jahreText(a.monate)}` : ""}
            {a.abgang ? ` · Abgang ${datumKurz(a.abgang)}` : ` · AfA ${jahr} ${formatEUR(afa)}`}</span></span>
        <span className="fi-betrag">{formatEUR(buchwertEnde(a, Math.min(tJetzt, tEnde)))}</span>
      </button>
    );
  };
  const liste = (titel: string, l: FinAnlage[]) => l.length > 0 && (
    <>
      <span className="op-gruppe-titel">{titel}</span>
      <div className="db-karte es-karte">{l.map(zeile)}</div>
    </>
  );

  return (
    <>
      {anlagenQ.isError && <div className="fi-hinweis fi-rot" role="alert">Die Anlagen konnten nicht geladen werden. Ist Migration 95 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="fi-kacheln">
        <div className="db-karte fi-kachel"><span className="small">Buchwert Ende {MONATSNAMEN[bisMonat - 1]}</span><b>{formatEUR(aktive.reduce((s, a) => s + buchwertEnde(a, tJetzt), 0))}</b>
          <span className="small">{aktive.length === 1 ? "1 Anlage" : `${aktive.length} Anlagen`}</span></div>
        <div className={"db-karte fi-kachel" + (summeVorschau !== 0 ? " fi-kachel-nahe" : "")}><span className="small">Abschreibung {jahr}</span><b>{formatEUR(afaJahr)}</b>
          <span className="small">gebucht {formatEUR(gebuchtJahr)}</span></div>
      </div>
      {darfSchreiben && (
        <div className="fi-werkzeug">
          <button type="button" className="btn-primary fi-knopf" onClick={() => { setMeldung(null); setOffen("neu"); }}>Anlage erfassen</button>
          <select className="fi-monat" value={bisMonat} onChange={(ev) => setBisMonat(Number(ev.target.value))} aria-label="Abschreiben bis Monat">
            {MONATSNAMEN.map((m, i) => i + 1 <= laufend && <option key={m} value={i + 1}>bis {m}</option>)}
          </select>
          <button type="button" className="btn-secondary fi-knopf" disabled={vorschau.length === 0} onClick={() => { setFehler(null); setLauf(!lauf); }}>
            {vorschau.length === 0 ? "Abschreibungen gebucht" : `Abschreibungen buchen (${formatEUR(summeVorschau)})`}</button>
        </div>
      )}
      {lauf && vorschau.length > 0 && (
        <div className="db-karte es-karte">
          <span className="small">Gebucht wird je Anlage, was bis Ende {MONATSNAMEN[bisMonat - 1]} {jahr} fällig und noch nicht gebucht ist – Abschreibungskonto an Anlagekonto, Datum Monatsende.</span>
          {vorschau.map((v) => (
            <div key={v.anlage.id} className="es-zeile statisch fi-buchung">
              <span className="db-punkt-text"><b>{v.anlage.bezeichnung}</b><span className="small">{kontoNr(v.anlage.afa_konto)} an {kontoNr(v.anlage.konto)}</span></span>
              <span className="fi-betrag">{formatEUR(v.betrag)}</span>
            </div>
          ))}
          <div className="fi-aktion">
            <button type="button" className="btn-secondary" onClick={() => setLauf(false)} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={laeuft}>{laeuft ? "bucht …" : "Buchen"}</button>
          </div>
        </div>
      )}
      {anlagenQ.isPending ? <div className="db-karte es-karte"><span className="small">Lädt …</span></div>
        : anlagen.length === 0 ? (
          <div className="db-karte es-karte"><span className="small">Noch keine Anlage. Gekauft und gebucht wird wie immer (Beleg oder Bank auf ein Anlagekonto, z. B. {kontoNr(rahmen === "skr03" ? 210 : 440)} {name(rahmen === "skr03" ? 210 : 440)}); hier entsteht der Abschreibungsplan.</span></div>
        ) : (
          <>
            {liste("ANLAGEN", gruppe((a) => !a.abgang && (a.art === "linear" || a.art === "degressiv" || a.art === "e_fahrzeug")))}
            {liste("GERINGWERTIGE GÜTER (SOFORT ABGESCHRIEBEN)", gruppe((a) => !a.abgang && a.art === "gwg"))}
            {liste("SAMMELPOSTEN", gruppe((a) => a.art === "sammelposten"))}
            {liste("ABGÄNGE", gruppe((a) => !!a.abgang && a.art !== "sammelposten"))}
          </>
        )}
      <span className="small es-fuss fi-fuss">Rechts der Buchwert Ende {MONATSNAMEN[bisMonat - 1]}. Anlagen aus der Zeit vor Finance gehören mit ihrem Buchwert in den Anfangsbestand des Anlagekontos; abgeschrieben wird hier ab {jahr}.</span>

      {offen && (
        <AnlageBlatt supabase={supabase} anlage={offen === "neu" ? null : anlagen.find((a) => a.id === offen.id) ?? offen} heute={heute} jahr={jahr}
          konten={konten} rahmen={rahmen} gesperrt={offen !== "neu" && (gebucht[offen.id] ?? 0) !== 0} darfSchreiben={darfSchreiben} belegeSehen={belegeSehen}
          onFertig={(t) => { setOffen(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Eine Anlage
function AnlageBlatt({ supabase, anlage, heute, jahr, konten, rahmen, gesperrt, darfSchreiben, belegeSehen, onFertig, onClose }: {
  supabase: SupabaseClient; anlage: FinAnlage | null; heute: string; jahr: number; konten: FinKonto[]; rahmen: FinEinstellungen["kontenrahmen"];
  gesperrt: boolean; darfSchreiben: boolean; belegeSehen: boolean; onFertig: (t: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [bezeichnung, setBezeichnung] = useState(anlage?.bezeichnung ?? "");
  const [konto, setKonto] = useState(anlage ? String(anlage.konto) : "");
  const [anschaffung, setAnschaffung] = useState(anlage?.anschaffung ?? heute);
  const [akText, setAkText] = useState(anlage ? anlage.ak.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "");
  const [art, setArt] = useState<AfaArt>(anlage?.art ?? "linear");
  const [artGewaehlt, setArtGewaehlt] = useState(!!anlage);
  const [jahre, setJahre] = useState(anlage?.monate ? String(anlage.monate / 12) : "");
  const [belegId, setBelegId] = useState(anlage?.beleg_id ?? "");
  const [fahrzeugId, setFahrzeugId] = useState(anlage?.fahrzeug_id ?? "");
  const [notiz, setNotiz] = useState(anlage?.notiz ?? "");
  const [modus, setModus] = useState<"form" | "abgang" | "zurueck" | "loeschen">("form");
  const [abgangDatum, setAbgangDatum] = useState(heute);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const anschJahr = Number(anschaffung.slice(0, 4)) || jahr;
  const einstQ = useFinEinstellungen(supabase, anschJahr, true);
  const e = einstQ.data?.status === "da" ? einstQ.data.einstellungen : null;
  const belegeQ = useFinBelege(supabase, anschJahr, belegeSehen);
  const lieferantenQ = useFinLieferanten(supabase, belegeSehen);
  const fahrzeugeQ = useFinFahrzeuge(supabase, true);
  const anlageKonten = new Set(konten.filter((k) => k.kategorie === "anlage").map((k) => k.nummer));
  const belege = (belegeQ.data ?? []).filter((b) => b.status === "gebucht" && b.posten.some((p) => p.konto != null && anlageKonten.has(p.konto)));
  const ak = betragLesen(akText);
  const effektivArt: AfaArt = artGewaehlt ? art : artVorschlag(ak ?? 0, e);
  const monate = jahre ? Math.round(Number(jahre.replace(",", ".")) * 12) : null;
  const zeigeJahre = effektivArt === "linear" || effektivArt === "degressiv";
  const maengel = [
    ...(konto ? [] : ["Das Anlagekonto fehlt."]),
    ...anlageMaengel({ bezeichnung, art: effektivArt, anschaffung, ak, monate: zeigeJahre ? monate : null }, einstQ.isPending ? { sammelposten: false } : e, heute),
  ];
  const vorlage = { art: effektivArt, ak: ak ?? 0, monate: zeigeJahre ? monate : null, satz: effektivArt === "degressiv" && monate ? degressivSatz(monate) : null, anschaffung, abgang: anlage?.abgang ?? null };
  const plan = maengel.length === 0 ? afaPlan(vorlage) : [];
  const nurText = gesperrt;
  const fahrzeugKonto = [320, 350, 520, 540].includes(Number(konto));

  function kontoWaehlen(w: string) {
    setKonto(w);
    const v = FIN_ND_VORSCHLAG[rahmen][Number(w)];
    if (v && !jahre) setJahre(String(v));
    const k = konten.find((x) => x.nummer === Number(w));
    if (k && !bezeichnung) setBezeichnung(k.bezeichnung.replace(/\s*\(.*\)$/, ""));
  }
  function belegWaehlen(id: string) {
    setBelegId(id);
    const b = belege.find((x) => x.id === id);
    if (!b) return;
    const p = b.posten.find((x) => x.konto != null && anlageKonten.has(x.konto));
    if (p?.konto && !konto) kontoWaehlen(String(p.konto));
    setAnschaffung(b.belegdatum);
    if (p?.betrag != null && !akText) {
      // Der Betrag im Beleg ist brutto (Vorsteuer wird herausgerechnet) – netto, wenn ein Vorsteuerschlüssel daran hängt.
      const netto = p.steuer === "vst19" ? p.betrag / 1.19 : p.steuer === "vst7" ? p.betrag / 1.07 : p.betrag;
      setAkText((Math.round(netto * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }));
    }
    if (!bezeichnung) setBezeichnung([b.text, b.belegnummer].filter(Boolean).join(" · "));
  }

  async function ausfuehren(f: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const t = await f();
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onFertig(t);
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }
  const speichern = () => ausfuehren(async () => {
    await finAnlageSpeichern(supabase, anlage?.id ?? null, {
      bezeichnung: bezeichnung.trim(), konto: Number(konto), art: effektivArt, anschaffung, ak: ak ?? 0, monate: zeigeJahre ? monate : null,
      beleg_id: belegId || null, fahrzeug_id: fahrzeugId || null, notiz: notiz.trim(),
    });
    return anlage ? "Anlage gespeichert." : `Anlage erfasst – ${effektivArt === "gwg" ? "sie wird im Anschaffungsmonat ganz abgeschrieben" : "der Abschreibungsplan steht"}. Gebucht wird mit „Abschreibungen buchen“.`;
  });

  let fuss: React.ReactNode;
  if (darfSchreiben && modus === "abgang" && anlage) {
    fuss = <>
      <button type="button" className="btn-secondary" onClick={() => setModus("form")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim() || abgangDatum > heute || abgangDatum < anlage.anschaffung}
        onClick={() => void ausfuehren(async () => { const r = await finAnlageAbgang(supabase, anlage.id, abgangDatum, grund.trim()); return `Abgang gebucht – Restbuchwert ${formatEUR(r.restwert)}${r.nr ? ` (Nr. ${r.nr})` : ""}.`; })}>Abgang buchen</button>
    </>;
  } else if (darfSchreiben && modus === "zurueck" && anlage) {
    fuss = <>
      <button type="button" className="btn-secondary" onClick={() => setModus("form")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finAnlageAbgangZuruecknehmen(supabase, anlage.id, grund.trim()); return "Abgang zurückgenommen – die Abschreibung läuft weiter."; })}>Abgang zurücknehmen</button>
    </>;
  } else if (darfSchreiben && modus === "loeschen" && anlage) {
    fuss = <>
      <button type="button" className="btn-secondary" onClick={() => setModus("form")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft} onClick={() => void ausfuehren(async () => { await finAnlageLoeschen(supabase, anlage.id); return "Anlage gelöscht."; })}>Endgültig löschen</button>
    </>;
  } else if (darfSchreiben) {
    fuss = <>
      {anlage && !anlage.abgang && !gesperrt && <button type="button" className="btn-secondary" onClick={() => setModus("loeschen")}>Löschen</button>}
      {anlage && !anlage.abgang && anlage.art !== "sammelposten" && <button type="button" className="btn-secondary" onClick={() => { setGrund(""); setModus("abgang"); }}>Abgang …</button>}
      {anlage?.abgang && anlage.art !== "sammelposten" && <button type="button" className="btn-secondary" onClick={() => { setGrund(""); setModus("zurueck"); }}>Abgang zurücknehmen …</button>}
      {!anlage?.abgang && <button type="button" className="btn-primary" disabled={laeuft || maengel.length > 0} onClick={() => void speichern()}>{laeuft ? "…" : "Speichern"}</button>}
    </>;
  }

  return (
    <Blatt titel={anlage ? anlage.bezeichnung : "Anlage erfassen"} unter={anlage ? `${kontoNr(anlage.konto)} · ${artText(anlage.art)}${anlage.abgang ? ` · Abgang ${datumKurz(anlage.abgang)}` : ""}` : "Abschreibungsplan anlegen"}
      breite="breit" onClose={onClose} fuss={fuss}>
      <div className="fi-formular">
        {gesperrt && <div className="fi-hinweis fi-info">Für {jahr} ist schon abgeschrieben – Konto, Art, Datum, Betrag und Nutzungsdauer bleiben. Bezeichnung, Notiz, Beleg und Fahrzeug lassen sich ändern.</div>}
        {modus === "abgang" && anlage ? (
          <>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Abgang am</span><input type="date" value={abgangDatum} min={anlage.anschaffung} max={heute} onChange={(ev) => setAbgangDatum(ev.target.value)} /></label>
              <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={120} onChange={(ev) => setGrund(ev.target.value)} placeholder="verkauft, verschrottet …" autoFocus /></label>
            </div>
            <span className="small">Abgeschrieben wird bis zum Abgangsmonat; der Restbuchwert ({formatEUR(buchwertEnde({ ...anlage, abgang: abgangDatum }, Number(abgangDatum.slice(0, 4)) * 12 + Number(abgangDatum.slice(5, 7)) - 1))})
              geht auf {kontoNr(rahmen === "skr03" ? 2310 : 6895)} Anlagenabgänge. Einen Verkaufserlös bitte wie jede Einnahme buchen.</span>
          </>
        ) : (modus === "zurueck" || modus === "loeschen") ? (
          modus === "zurueck"
            ? <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={120} onChange={(ev) => setGrund(ev.target.value)} autoFocus /></label>
            : <span className="small">Die Anlage wird aus dem Verzeichnis gelöscht. Das geht nur, solange für sie nichts gebucht ist.</span>
        ) : (
          <>
            {belegeSehen && belege.length > 0 && !nurText && (
              <label className="nk-feld"><span>Aus Beleg übernehmen</span>
                <select value={belegId} onChange={(ev) => belegWaehlen(ev.target.value)} aria-label="Beleg">
                  <option value="">– ohne Beleg –</option>
                  {belege.map((b) => <option key={b.id} value={b.id}>{datumKurz(b.belegdatum)} · {(lieferantenQ.data ?? []).find((l) => l.id === b.lieferant_id)?.name ?? "Beleg"}{b.belegnummer ? ` · ${b.belegnummer}` : ""}</option>)}
                </select></label>
            )}
            <label className="nk-feld"><span>Bezeichnung</span><input value={bezeichnung} maxLength={120} disabled={!darfSchreiben} onChange={(ev) => setBezeichnung(ev.target.value)} placeholder="z. B. Reifenmontiermaschine" /></label>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Anlagekonto</span>
                <KontoWahl wert={konto} konten={konten} nur={["anlage"]} onWert={kontoWaehlen} label="Anlagekonto" disabled={!darfSchreiben || nurText} /></label>
              <label className="nk-feld"><span>Angeschafft am</span><input type="date" value={anschaffung} max={heute} disabled={!darfSchreiben || nurText} onChange={(ev) => setAnschaffung(ev.target.value)} /></label>
            </div>
            <div className="fi-zwei">
              <label className="nk-feld"><span>{e?.besteuerung === "klein" ? "Anschaffungskosten (brutto)" : "Anschaffungskosten (netto)"}</span>
                <input inputMode="decimal" value={akText} disabled={!darfSchreiben || nurText} onChange={(ev) => setAkText(ev.target.value)} placeholder="0,00" aria-label="Anschaffungskosten" /></label>
              {zeigeJahre && (
                <label className="nk-feld"><span>Nutzungsdauer in Jahren</span>
                  <input inputMode="decimal" value={jahre} disabled={!darfSchreiben || nurText} onChange={(ev) => setJahre(ev.target.value)} placeholder="z. B. 10" aria-label="Nutzungsdauer" /></label>
              )}
            </div>
            <div className="nk-feld">
              <span>Abschreibung</span>
              <div className="lg-lagerwahl es-segment fi-reiter-breit" role="group" aria-label="Art der Abschreibung">
                {FIN_AFA_ARTEN.map((a) => (
                  <button key={a.wert} type="button" className={effektivArt === a.wert ? "aktiv" : ""} aria-pressed={effektivArt === a.wert}
                    disabled={!darfSchreiben || nurText} onClick={() => { setArt(a.wert); setArtGewaehlt(true); }}>{a.text}</button>
                ))}
              </div>
              <span className="small">{FIN_AFA_ARTEN.find((a) => a.wert === effektivArt)?.hinweis}{effektivArt === "degressiv" && monate ? ` Satz hier: ${degressivSatz(monate).toLocaleString("de-DE")} %.` : ""}
                {zeigeJahre && konto && FIN_ND_VORSCHLAG[rahmen][Number(konto)] ? ` Vorschlag nach AfA-Tabelle: ${FIN_ND_VORSCHLAG[rahmen][Number(konto)]} Jahre – für das einzelne Gut prüfen.` : ""}</span>
            </div>
            {fahrzeugKonto && (fahrzeugeQ.data ?? []).length > 0 && (
              <label className="nk-feld"><span>Firmenfahrzeug aus FSM</span>
                <select value={fahrzeugId} disabled={!darfSchreiben} onChange={(ev) => setFahrzeugId(ev.target.value)} aria-label="Firmenfahrzeug">
                  <option value="">– keins –</option>
                  {(fahrzeugeQ.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.kennzeichen}{f.bezeichnung ? ` · ${f.bezeichnung}` : ""}</option>)}
                </select></label>
            )}
            <label className="nk-feld"><span>Notiz</span><input value={notiz} maxLength={300} disabled={!darfSchreiben} onChange={(ev) => setNotiz(ev.target.value)} placeholder="Seriennummer, Standort …" /></label>
            {maengel.length > 0 && (akText || konto || bezeichnung) && <div className="fi-hinweis fi-rot" role="alert">{maengel.map((m) => <div key={m}>{m}</div>)}</div>}
            {plan.length > 0 && (
              <>
                <span className="op-gruppe-titel">ABSCHREIBUNGSPLAN</span>
                <table className="fi-tabelle">
                  <thead><tr><th>Jahr</th><th className="zahl">Abschreibung</th><th className="zahl">Buchwert Ende</th></tr></thead>
                  <tbody>{plan.slice(0, 15).map((z) => <tr key={z.jahr} className={z.jahr === jahr ? "summe" : undefined}><td>{z.jahr}</td><td className="zahl">{formatEUR(z.afa)}</td><td className="zahl">{formatEUR(z.buchwert)}</td></tr>)}</tbody>
                </table>
                {plan.length > 15 && <span className="small">… und {plan.length - 15} weitere Jahre.</span>}
              </>
            )}
          </>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function jahreText(monate: number): string {
  const j = monate / 12;
  return `${Number.isInteger(j) ? j : j.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${j === 1 ? "Jahr" : "Jahre"}`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

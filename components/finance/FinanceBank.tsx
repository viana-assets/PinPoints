"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import {
  useFinBankimporte, useFinBankkonten, useFinBankumsaetze, useFinBelege, useFinBuchungen, useFinKonten, useFinLieferanten,
  useFinKassenstuerze, useFinRechnungen, useFinSteuerschluessel,
} from "@/lib/queries/hooks";
import {
  finBankAufheben, finBankEinlesen, finBankIgnorieren, finBankImportZuruecknehmen, finBankkontoAendern, finBankkontoAnlegen,
  finBankZuBeleg, finBankZuKonto, finBankZuRechnung, finKassensturz,
} from "@/lib/api/finance";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragLesen, buchungVorschau, kontoNr, passendeSchluessel, type FinBuchung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import { FIN_RECHNUNG_KONTEN, type FinRechnungZeile } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";
import {
  FIN_BANK_MAX_BYTES, FIN_BANK_MAX_UMSAETZE, dateiText, ibanSauber, kassenbuch, kontoAusFrueheren, kontoSaldoBis, kontoauszugLesen,
  vorschlaege, type FinBankimport, type FinBankkonto, type FinBankumsatz, type Kontoauszug,
} from "@/lib/finance/bank";
import { formatEUR } from "@/lib/format";
import { BuchungNeu, KontoWahl, ZeilenTabelle, type BuchungVorlage } from "./FinanceBuchungen";

// Finance › Bank & Kasse (Phase F4, Migration 91, v149). Kontoauszug (CAMT.053 oder CSV) im Browser lesen,
// einlesen (doppelte Umsätze erkennt die Datenbank), jeden Umsatz zuordnen: Rechnung, Beleg, Konto – oder
// ignorieren. Dazu das Kassenbuch: alle Bewegungen auf dem Kassenkonto mit laufendem Bestand.
//
// Datenschutz: Kontoauszüge enthalten Namen und IBANs der Zahlenden. Sie bleiben in Finance (Recht
// „Finance › Bank“), gehen an keinen Dritten und stehen in keiner Fehlermeldung.

type Reiter = "offen" | "erledigt" | "kasse" | "konten";
const SEITE = 100;

export function FinanceBank({ supabase, jahr, heute, einstellungen, darfSchreiben, darfLoeschen, rechnungenSehen, belegeSehen, buchungenSehen, darfBuchen, onEinstellungen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null;
  darfSchreiben: boolean; darfLoeschen: boolean;
  // Für Vorschläge (Rechnungen, Belege) und Kassenbuch/Saldo (Journal) – jeweils das eigene Lese-Recht.
  rechnungenSehen: boolean; belegeSehen: boolean; buchungenSehen: boolean; darfBuchen: boolean;
  onEinstellungen: () => void;
}) {
  const rahmen = einstellungen?.kontenrahmen ?? "skr03";
  const bereit = !!einstellungen;
  const bankkontenQ = useFinBankkonten(supabase, bereit);
  const umsaetzeQ = useFinBankumsaetze(supabase, jahr, bereit);
  const importeQ = useFinBankimporte(supabase, bereit);
  const kontenQ = useFinKonten(supabase, rahmen, bereit);
  const schluesselQ = useFinSteuerschluessel(supabase, rahmen, bereit);
  const buchungenQ = useFinBuchungen(supabase, jahr, bereit && buchungenSehen);
  const rechnungenQ = useFinRechnungen(supabase, jahr, bereit && rechnungenSehen);
  const belegeQ = useFinBelege(supabase, jahr, bereit && belegeSehen);
  const lieferantenQ = useFinLieferanten(supabase, bereit && belegeSehen);
  const [reiter, setReiter] = useState<Reiter>("offen");
  const [filter, setFilter] = useState("");
  const [zeigen, setZeigen] = useState(SEITE);
  const [offen, setOffen] = useState<FinBankumsatz | null>(null);
  const [auszug, setAuszug] = useState<{ a: Kontoauszug; name: string } | null>(null);
  const [kontoOffen, setKontoOffen] = useState<FinBankkonto | { iban: string | null } | null>(null);
  const [vorlage, setVorlage] = useState<BuchungVorlage | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!einstellungen) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {jahr} speichern</b>
          <span className="small">Der Kontenrahmen bestimmt Bank- und Kassenkonto.</span></span></div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const bankkonten = bankkontenQ.data ?? [];
  const umsaetze = umsaetzeQ.data ?? [];
  const konten = kontenQ.data ?? [];
  const schluessel = schluesselQ.data ?? [];
  const buchungen = buchungenQ.data ?? [];
  const rechnungen = rechnungenQ.data?.rechnungen ?? [];
  const belege = belegeQ.data ?? [];
  const lieferanten = lieferantenQ.data ?? [];
  const aktiveKonten = bankkonten.filter((k) => k.aktiv);
  const kasse = FIN_RECHNUNG_KONTEN[rahmen].kasse;
  const gefiltert = umsaetze.filter((u) => !filter || u.bankkonto_id === filter);
  const offene = gefiltert.filter((u) => u.status === "offen");
  const erledigt = gefiltert.filter((u) => u.status !== "offen" && u.datum.slice(0, 4) === String(jahr));
  const fehlt = [bankkontenQ, umsaetzeQ, importeQ].some((x) => x.isError);
  const kontoName = (id: string) => bankkonten.find((k) => k.id === id)?.name ?? "Bankkonto";

  async function dateiGewaehlt(f: File) {
    setFehler(null);
    setMeldung(null);
    if (f.size > FIN_BANK_MAX_BYTES) { setFehler("Die Datei ist zu groß (höchstens 5 MB)."); return; }
    const a = kontoauszugLesen(dateiText(await f.arrayBuffer()));
    if (!a) { setFehler("Die Datei ist kein lesbarer Kontoauszug. Erwartet wird CAMT.053 (XML) oder CSV mit Kopfzeile – beides gibt es im Online-Banking unter „Export“."); return; }
    if (!a.umsaetze.length) { setFehler("In der Datei steht kein gebuchter Umsatz."); return; }
    if (a.umsaetze.length > FIN_BANK_MAX_UMSAETZE) { setFehler("Höchstens 5.000 Umsätze je Datei – bitte den Zeitraum kürzer wählen."); return; }
    setAuszug({ a, name: f.name });
  }

  const liste = reiter === "offen" ? offene : erledigt;
  return (
    <>
      {fehlt && <div className="fi-hinweis fi-rot" role="alert">Bank & Kasse konnte nicht geladen werden. Ist Migration 91 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="lg-lagerwahl es-segment fi-reiter fi-reiter-breit" role="tablist" aria-label="Bank und Kasse">
        {([["offen", "Offen"], ["erledigt", "Zugeordnet"], ["kasse", "Kasse"], ["konten", "Konten & Importe"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => { setReiter(k); setZeigen(SEITE); }}>
            {t}{k === "offen" && <span className="lg-lagerwahl-zahl">{offene.length}</span>}
          </button>
        ))}
      </div>

      {(reiter === "offen" || reiter === "erledigt") && (
        <>
          {bankkontenQ.isSuccess && aktiveKonten.length === 0 ? (
            <div className="db-karte es-karte">
              <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst ein Bankkonto anlegen</b>
                <span className="small">Name, IBAN und das Sachkonto, auf dem es gebucht wird (z. B. {kontoNr(FIN_RECHNUNG_KONTEN[rahmen].bank)} Bank).</span></span></div>
              {darfSchreiben && <button type="button" className="btn-primary fi-knopf" onClick={() => setKontoOffen({ iban: null })}>Bankkonto anlegen</button>}
            </div>
          ) : (
            <div className="fi-werkzeug">
              {bankkonten.length > 1 && (
                <select className="fi-monat" value={filter} onChange={(e) => { setFilter(e.target.value); setZeigen(SEITE); }} aria-label="Bankkonto">
                  <option value="">Alle Konten</option>
                  {bankkonten.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              )}
              {darfSchreiben && aktiveKonten.length > 0 && (
                <label className="btn-primary fi-knopf fi-dateiwahl">
                  Kontoauszug einlesen
                  <input type="file" accept=".xml,.csv,.txt,application/xml,text/xml,text/csv,text/plain" aria-label="Kontoauszug-Datei"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void dateiGewaehlt(f); }} />
                </label>
              )}
            </div>
          )}
          <div className="db-karte es-karte">
            {umsaetzeQ.isPending ? <span className="small">Lädt …</span>
              : liste.length === 0 ? <span className="small">{reiter === "offen" ? "Kein offener Umsatz. Kontoauszug als CAMT.053 oder CSV aus dem Online-Banking laden und hier einlesen." : "Noch nichts zugeordnet."}</span>
              : liste.slice(0, zeigen).map((u) => {
                const v = reiter === "offen" ? vorschlaege(u, rechnungen, belege, lieferanten)[0] : undefined;
                return (
                  <button key={u.id} type="button" className={"es-zeile fi-buchung" + (u.status === "ignoriert" ? " fi-leise" : "")} onClick={() => setOffen(u)}>
                    <span className="db-punkt-text">
                      <b>{u.name ?? (u.betrag > 0 ? "Eingang" : "Abbuchung")}</b>
                      <span className="small">{datumKurz(u.datum)}{bankkonten.length > 1 ? ` · ${kontoName(u.bankkonto_id)}` : ""}{u.zweck ? ` · ${kurz(u.zweck, 70)}` : ""}
                        {u.status !== "offen" && <> · <span className={u.status === "zugeordnet" ? "fi-gruen-text" : ""}>{erledigtText(u, rechnungen, belege, buchungen)}</span></>}
                        {v?.passt && <> · <span className="fi-gruen-text">passt zu {v.titel.split(" · ")[0]}</span></>}</span>
                    </span>
                    <span className={"fi-betrag" + (u.betrag > 0 ? " fi-gruen-text" : "")}>{formatEUR(u.betrag)}</span>
                  </button>
                );
              })}
            {liste.length > zeigen && <button type="button" className="btn-secondary fi-mehr" onClick={() => setZeigen(zeigen + SEITE)}>{liste.length - zeigen} weitere zeigen</button>}
          </div>
          <span className="small es-fuss fi-fuss">Zuordnen bucht sofort: Zahlungseingang an Forderung, Verbindlichkeit an Bank oder auf das gewählte Konto. Aufheben bucht gegen.</span>
        </>
      )}

      {reiter === "kasse" && (
        buchungenSehen
          ? <Kassenbuch supabase={supabase} heute={heute} buchungen={buchungen} laedt={buchungenQ.isPending} kasse={kasse} name={konten.find((k) => k.nummer === kasse)?.bezeichnung ?? "Kasse"}
              darfKassensturz={darfSchreiben} onMeldung={(t) => { setFehler(null); setMeldung(t); }}
              darfBuchen={darfBuchen} onNeu={(art) => setVorlage(art === "ein"
                ? { titel: "Kasse: Einnahme", soll: kasse }
                : { titel: "Kasse: Ausgabe", haben: kasse })} />
          : <div className="fi-hinweis fi-info">Das Kassenbuch zeigt Buchungen – dafür braucht es das Recht „Finance › Buchungen“ lesen.</div>
      )}

      {reiter === "konten" && (
        <KontenUndImporte supabase={supabase} jahr={jahr} bankkonten={bankkonten} importe={importeQ.data ?? []} umsaetze={umsaetze}
          konten={konten} buchungen={buchungenSehen ? buchungen : null} darfSchreiben={darfSchreiben} darfLoeschen={darfLoeschen}
          onKonto={setKontoOffen} onMeldung={(t) => { setFehler(null); setMeldung(t); }} />
      )}

      {offen && (
        <UmsatzBlatt supabase={supabase} umsatz={umsaetze.find((u) => u.id === offen.id) ?? offen} alle={umsaetze} einstellungen={einstellungen}
          bankkonten={bankkonten} konten={konten} schluessel={schluessel} buchungen={buchungen} rechnungen={rechnungen} belege={belege}
          lieferanten={lieferanten} darfSchreiben={darfSchreiben}
          onFertig={(t) => { setOffen(null); setFehler(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
      {auszug && (
        <ImportBlatt supabase={supabase} auszug={auszug.a} dateiname={auszug.name} bankkonten={aktiveKonten}
          onNeuesKonto={(iban) => { setAuszug(null); setKontoOffen({ iban }); }}
          onFertig={(t) => { setAuszug(null); setFehler(null); setMeldung(t); setReiter("offen"); }} onClose={() => setAuszug(null)} />
      )}
      {kontoOffen && (
        <BankkontoBlatt supabase={supabase} konto={"id" in kontoOffen ? kontoOffen : null} vorIban={"id" in kontoOffen ? null : kontoOffen.iban}
          konten={konten} kasse={kasse} vorgabe={FIN_RECHNUNG_KONTEN[rahmen].bank} bankkonten={bankkonten} darfSchreiben={darfSchreiben}
          onClose={() => setKontoOffen(null)} />
      )}
      {vorlage && (
        <BuchungNeu supabase={supabase} heute={heute} jahr={jahr} einstellungen={einstellungen} konten={konten} schluessel={schluessel} vorlage={vorlage}
          onGebucht={(nr) => { setVorlage(null); setFehler(null); setMeldung(`Gebucht (Nr. ${nr}).`); }} onClose={() => setVorlage(null)} />
      )}
    </>
  );
}

function erledigtText(u: FinBankumsatz, rechnungen: FinRechnungZeile[], belege: FinBeleg[], buchungen: FinBuchung[]): string {
  if (u.status === "ignoriert") return `ignoriert${u.notiz ? `: ${kurz(u.notiz, 40)}` : ""}`;
  const nr = buchungen.find((b) => b.id === u.buchung_id)?.nr;
  const mitNr = (t: string) => (nr ? `${t} · Nr. ${nr}` : t);
  if (u.zuordnung === "rechnung") return mitNr(`Rechnung ${rechnungen.find((r) => r.rechnung_id === u.zuordnung_id)?.nummer_text ?? ""}`.trim());
  if (u.zuordnung === "beleg") return mitNr(`Beleg ${belege.find((b) => b.id === u.zuordnung_id)?.belegnummer ?? ""}`.trim());
  const zeile = buchungen.find((b) => b.id === u.buchung_id)?.fin_buchungszeilen.find((z) => !z.ist_steuer && (u.betrag > 0 ? z.seite === "H" : z.seite === "S"));
  return mitNr(zeile ? `Konto ${kontoNr(zeile.konto)}` : "auf Konto gebucht");
}

// ---------------------------------------------------------------- Ein Umsatz
function UmsatzBlatt({ supabase, umsatz: u, alle, einstellungen, bankkonten, konten, schluessel, buchungen, rechnungen, belege, lieferanten, darfSchreiben, onFertig, onClose }: {
  supabase: SupabaseClient; umsatz: FinBankumsatz; alle: FinBankumsatz[]; einstellungen: FinEinstellungen;
  bankkonten: FinBankkonto[]; konten: FinKonto[]; schluessel: FinSteuerschluessel[]; buchungen: FinBuchung[];
  rechnungen: FinRechnungZeile[]; belege: FinBeleg[]; lieferanten: FinLieferant[]; darfSchreiben: boolean;
  onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sachkonten = bankkonten.map((k) => k.konto);
  const bankkonto = bankkonten.find((k) => k.id === u.bankkonto_id);
  const frueher = kontoAusFrueheren(u, alle, buchungen, sachkonten);
  const [modus, setModus] = useState<"wahl" | "konto" | "ignorieren" | "aufheben">(u.status === "offen" && frueher ? "konto" : "wahl");
  const [konto, setKonto] = useState(frueher ? String(frueher.konto) : "");
  const [steuer, setSteuer] = useState(frueher?.steuer ?? "");
  const [text, setText] = useState(kurz([u.name, u.zweck].filter(Boolean).join(": "), 200));
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const eingang = u.betrag > 0;
  const liste = u.status === "offen" ? vorschlaege(u, rechnungen, belege, lieferanten) : [];
  const passend = passendeSchluessel(schluessel, einstellungen).filter((s) => (eingang ? s.art === "ust" || s.art === "ohne" : s.art !== "ust"));
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const gegen = konto ? Number(konto) : null;
  const vorschau = bankkonto ? buchungVorschau([{
    soll: eingang ? bankkonto.konto : gegen, haben: eingang ? gegen : bankkonto.konto, betrag: Math.abs(u.betrag), steuer: steuer || null,
  }], konten, schluessel, einstellungen) : null;
  const kontoPruefung = !gegen ? "Das Gegenkonto wählen." : gegen === bankkonto?.konto ? "Gegenkonto und Bankkonto sind dasselbe." : vorschau?.fehler ?? null;

  async function ausfuehren(f: () => Promise<string>) {
    setLaeuft(true);
    setFehler(null);
    try {
      const t = await f();
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onFertig(t);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  let fuss: React.ReactNode;
  if (darfSchreiben && u.status === "offen") {
    fuss = modus === "konto" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-primary" disabled={laeuft || !!kontoPruefung}
        onClick={() => void ausfuehren(async () => { const r = await finBankZuKonto(supabase, u.id, gegen as number, steuer || null, text.trim()); return `Gebucht (Nr. ${r.nr}).`; })}>{laeuft ? "…" : "Buchen"}</button>
    </> : modus === "ignorieren" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finBankIgnorieren(supabase, u.id, grund.trim()); return "Umsatz ignoriert."; })}>Ignorieren</button>
    </> : <>
      <button type="button" className="btn-secondary" onClick={() => setModus("ignorieren")}>Ignorieren …</button>
      <button type="button" className="btn-primary" onClick={() => setModus("konto")}>Auf Konto buchen</button>
    </>;
  } else if (darfSchreiben && u.status === "zugeordnet") {
    fuss = modus === "aufheben" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finBankAufheben(supabase, u.id, grund.trim()); return "Zuordnung aufgehoben – gegengebucht, der Umsatz ist wieder offen."; })}>Zuordnung aufheben</button>
    </> : <button type="button" className="btn-secondary" onClick={() => setModus("aufheben")}>Zuordnung aufheben …</button>;
  } else if (darfSchreiben && u.status === "ignoriert") {
    fuss = <button type="button" className="btn-secondary" disabled={laeuft}
      onClick={() => void ausfuehren(async () => { await finBankAufheben(supabase, u.id, ""); return "Der Umsatz ist wieder offen."; })}>Wieder öffnen</button>;
  }

  return (
    <Blatt titel={formatEUR(u.betrag)} unter={`${datumKurz(u.datum)} · ${bankkonto?.name ?? "Bankkonto"} · ${u.status === "offen" ? "offen" : u.status === "ignoriert" ? "ignoriert" : "zugeordnet"}`}
      breite="breit" onClose={onClose} fuss={fuss}>
      <div className="fi-formular">
        <div className="db-punkt-text">
          <b>{u.name ?? (eingang ? "Eingang ohne Namen" : "Abbuchung ohne Namen")}</b>
          {u.iban && <span className="small">{ibanText(u.iban)}</span>}
          {u.zweck && <span className="small">{u.zweck}</span>}
          {(u.valuta && u.valuta !== u.datum) || u.referenz ? (
            <span className="small">{u.valuta && u.valuta !== u.datum ? `Wertstellung ${datumKurz(u.valuta)}` : ""}{u.valuta && u.valuta !== u.datum && u.referenz ? " · " : ""}{u.referenz ? `Referenz ${u.referenz}` : ""}</span>
          ) : null}
        </div>
        {u.status !== "offen" && (
          <div className={"fi-hinweis " + (u.status === "zugeordnet" ? "fi-ok" : "fi-info")}>{erledigtText(u, rechnungen, belege, buchungen)}</div>
        )}

        {u.status === "offen" && modus === "wahl" && (
          <>
            <span className="op-gruppe-titel">{eingang ? "PASSENDE RECHNUNGEN" : "PASSENDE BELEGE"}</span>
            {liste.length === 0 ? (
              <span className="small">{eingang ? "Keine offene Rechnung mit diesem Betrag, dieser Nummer im Zweck oder diesem Namen." : "Kein offener Beleg mit diesem Betrag, dieser Nummer im Zweck oder diesem Namen."}</span>
            ) : (
              <div className="fi-gruppe">
                {liste.map((v) => (
                  <div key={v.id} className="es-zeile statisch fi-vorgang">
                    <span className="db-punkt-text"><b>{v.titel}</b>
                      <span className="small">{formatEUR(v.betrag)}{v.rest !== v.betrag ? ` · offen ${formatEUR(v.rest)}` : ""}
                        {v.passt ? " · Betrag passt" : v.teil ? " · als Teilzahlung" : <> · <span className="fi-rot-text">Umsatz größer als der offene Rest</span></>}</span></span>
                    {darfSchreiben && (v.passt || v.teil) && (
                      <button type="button" className="es-knopf fi-primaer" disabled={laeuft}
                        onClick={() => void ausfuehren(async () => {
                          const r = v.art === "rechnung" ? await finBankZuRechnung(supabase, u.id, v.id) : await finBankZuBeleg(supabase, u.id, v.id);
                          const was = v.art === "rechnung" ? "die Rechnung" : "der Beleg";
                          return r.rest > 0 ? `Teilzahlung gebucht (Nr. ${r.nr}) – offen bleiben ${formatEUR(r.rest)}.` : `Zugeordnet und gebucht (Nr. ${r.nr}) – ${was} ist bezahlt.`;
                        })}>{v.passt ? "Zuordnen" : "Teilzahlung"}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <span className="small">Sonst: auf ein Konto buchen (Gebühren, Miete, Privat, Umbuchung) oder ignorieren, wenn schon von Hand gebucht.</span>
          </>
        )}

        {u.status === "offen" && modus === "konto" && (
          <>
            {frueher && <div className="fi-hinweis fi-info">Wie beim letzten Umsatz von {u.name}: Konto {kontoNr(frueher.konto)} {name(frueher.konto)}.</div>}
            <label className="nk-feld"><span>Gegenkonto</span>
              <KontoWahl wert={konto} konten={konten.filter((k) => !sachkonten.includes(k.nummer))} onWert={(w) => { setFehler(null); setKonto(w); }} label="Gegenkonto" /></label>
            <div className="fi-zwei">
              <label className="nk-feld"><span>Steuer</span>
                <select value={steuer} onChange={(e) => setSteuer(e.target.value)} aria-label="Steuer">
                  <option value="">ohne Steuerschlüssel</option>
                  {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
                </select></label>
              <label className="nk-feld"><span>Buchungstext</span><input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
            </div>
            <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
            {vorschau && <ZeilenTabelle zeilen={vorschau.zeilen} name={name} />}
            {kontoPruefung && gegen && <div className="fi-hinweis fi-rot" role="alert">{kontoPruefung}</div>}
          </>
        )}

        {(modus === "ignorieren" || modus === "aufheben") && (
          <label className="nk-feld"><span>Grund</span>
            <input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} autoFocus
              placeholder={modus === "ignorieren" ? "z. B. schon von Hand gebucht" : "z. B. falsch zugeordnet"} /></label>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Import
function ImportBlatt({ supabase, auszug: a, dateiname, bankkonten, onNeuesKonto, onFertig, onClose }: {
  supabase: SupabaseClient; auszug: Kontoauszug; dateiname: string; bankkonten: FinBankkonto[];
  onNeuesKonto: (iban: string | null) => void; onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const treffer = a.iban ? bankkonten.find((k) => k.iban === a.iban) : undefined;
  const [kontoId, setKontoId] = useState(treffer?.id ?? (bankkonten.length === 1 ? bankkonten[0].id : ""));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const gewaehlt = bankkonten.find((k) => k.id === kontoId);
  const anderes = !!a.iban && !!gewaehlt?.iban && gewaehlt.iban !== a.iban;
  const ein = a.umsaetze.filter((u) => u.betrag > 0).reduce((s, u) => s + u.betrag, 0);
  const aus = a.umsaetze.filter((u) => u.betrag < 0).reduce((s, u) => s + u.betrag, 0);
  const daten = a.umsaetze.map((u) => u.datum).sort();

  async function einlesen() {
    if (!kontoId) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finBankEinlesen(supabase, kontoId, dateiname, a);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onFertig(r.neu === 0 ? `Nichts Neues – alle ${r.anzahl} Umsätze waren schon da.`
        : `${umsatzText(r.neu)} eingelesen${r.doppelt ? `, ${r.doppelt} waren schon da` : ""}.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel="Kontoauszug einlesen" unter={`${a.format === "camt" ? "CAMT.053" : "CSV"} · ${kurz(dateiname, 40)}`} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void einlesen()} disabled={laeuft || !kontoId || anderes}>{laeuft ? "liest ein …" : "Einlesen"}</button>
      </>}>
      <div className="fi-formular">
        <div className="fi-kacheln">
          <div className="db-karte fi-kachel"><span className="small">Eingänge</span><b>{formatEUR(ein)}</b></div>
          <div className="db-karte fi-kachel"><span className="small">Ausgänge</span><b>{formatEUR(aus)}</b></div>
        </div>
        <span className="small">{umsatzText(a.umsaetze.length)} vom {datumKurz(daten[0])} bis {datumKurz(daten[daten.length - 1])}
          {a.uebersprungen ? ` · ${a.uebersprungen} übersprungen (vorgemerkt oder unlesbar)` : ""}
          {a.endsaldo != null && a.endsaldoAm ? ` · Kontostand laut Bank am ${datumKurz(a.endsaldoAm)}: ${formatEUR(a.endsaldo)}` : ""}</span>
        <label className="nk-feld"><span>Bankkonto</span>
          <select value={kontoId} onChange={(e) => setKontoId(e.target.value)} aria-label="Bankkonto für den Import">
            <option value="">Bankkonto wählen</option>
            {bankkonten.map((k) => <option key={k.id} value={k.id}>{k.name}{k.iban ? ` · ${ibanText(k.iban)}` : ""}</option>)}
          </select></label>
        {a.iban && !treffer && (
          <div className="fi-hinweis fi-info">Die Datei gehört zu {ibanText(a.iban)} – dafür gibt es noch kein Bankkonto.{" "}
            <button type="button" className="es-knopf" onClick={() => onNeuesKonto(a.iban)}>Bankkonto anlegen</button></div>
        )}
        {anderes && <div className="fi-hinweis fi-rot" role="alert">Das gewählte Konto hat eine andere IBAN als die Datei.</div>}
        <span className="op-gruppe-titel">ERSTE UMSÄTZE</span>
        <div className="fi-gruppe">
          {a.umsaetze.slice(0, 5).map((u, i) => (
            <div key={i} className="es-zeile statisch fi-buchung">
              <span className="db-punkt-text"><b>{u.name ?? "–"}</b><span className="small">{datumKurz(u.datum)}{u.zweck ? ` · ${kurz(u.zweck, 60)}` : ""}</span></span>
              <span className={"fi-betrag" + (u.betrag > 0 ? " fi-gruen-text" : "")}>{formatEUR(u.betrag)}</span>
            </div>
          ))}
        </div>
        <span className="small">Gelesen wird hier im Browser. Gespeichert werden Datum, Betrag, Zweck, Name, IBAN und Referenz – nur für den Abgleich, sichtbar mit „Finance › Bank“. Umsätze, die schon da sind, werden übersprungen.</span>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Konten und Importe
function KontenUndImporte({ supabase, jahr, bankkonten, importe, umsaetze, konten, buchungen, darfSchreiben, darfLoeschen, onKonto, onMeldung }: {
  supabase: SupabaseClient; jahr: number; bankkonten: FinBankkonto[]; importe: FinBankimport[]; umsaetze: FinBankumsatz[]; konten: FinKonto[];
  buchungen: FinBuchung[] | null; darfSchreiben: boolean; darfLoeschen: boolean;
  onKonto: (k: FinBankkonto | { iban: null }) => void; onMeldung: (t: string) => void;
}) {
  const queryClient = useQueryClient();
  const [frage, setFrage] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";

  async function zuruecknehmen(id: string) {
    setLaeuft(true);
    setFehler(null);
    try {
      const n = await finBankImportZuruecknehmen(supabase, id);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setFrage(null);
      onMeldung(`Import zurückgenommen – ${umsatzText(n)} entfernt.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <span className="op-gruppe-titel">BANKKONTEN</span>
      {darfSchreiben && <div className="fi-werkzeug"><button type="button" className="btn-primary fi-knopf" onClick={() => onKonto({ iban: null })}>Bankkonto anlegen</button></div>}
      <div className="db-karte es-karte">
        {bankkonten.length === 0 ? <span className="small">Noch kein Bankkonto.</span> : bankkonten.map((k) => {
          const saldo = buchungen ? kontoSaldoBis(buchungen, k.konto, null) : null;
          return (
            <button key={k.id} type="button" className={"es-zeile fi-buchung" + (k.aktiv ? "" : " fi-aus")} onClick={() => onKonto(k)}>
              <span className="db-punkt-text"><b>{k.name}</b>
                <span className="small">{k.iban ? ibanText(k.iban) : "ohne IBAN"} · Konto {kontoNr(k.konto)} {name(k.konto)}{k.aktiv ? "" : " · ausgeblendet"}</span></span>
              {saldo != null && <span className="fi-betrag">{formatEUR(saldo)}</span>}
            </button>
          );
        })}
      </div>
      {buchungen && bankkonten.length > 0 && <span className="small es-fuss fi-fuss">Rechts der Saldo in Finance {jahr} – ohne Anfangsbestand, solange keiner gebucht ist.</span>}

      <span className="op-gruppe-titel">IMPORTE</span>
      <div className="db-karte es-karte">
        {importe.length === 0 ? <span className="small">Noch kein Kontoauszug eingelesen.</span> : importe.map((i) => {
          const bk = bankkonten.find((k) => k.id === i.bankkonto_id);
          const vergleich = buchungen && bk && i.endsaldo != null && i.endsaldo_am?.slice(0, 4) === String(jahr)
            ? Math.round((i.endsaldo - kontoSaldoBis(buchungen, bk.konto, i.endsaldo_am)) * 100) / 100 : null;
          const zugeordnet = umsaetze.some((u) => u.import_id === i.id && u.status === "zugeordnet");
          return (
            <div key={i.id} className="es-zeile statisch fi-vorgang">
              <span className="db-punkt-text">
                <b>{i.dateiname ?? (i.format === "camt" ? "CAMT.053" : "CSV")}</b>
                <span className="small">{bk?.name ?? "Bankkonto"} · {i.von ? `${datumKurz(i.von)}–${datumKurz(i.bis ?? i.von)}` : ""} · {i.neu} neu von {i.anzahl}
                  {i.endsaldo != null && i.endsaldo_am ? ` · Bank am ${datumKurz(i.endsaldo_am)}: ${formatEUR(i.endsaldo)}` : ""}
                  {vergleich != null && <> · {vergleich === 0 ? <span className="fi-gruen-text">stimmt mit Finance überein</span> : <span className="fi-rot-text">Differenz zu Finance {formatEUR(vergleich)}</span>}</>}</span>
              </span>
              {darfLoeschen && !zugeordnet && (frage === i.id ? <>
                <button type="button" className="es-knopf" disabled={laeuft} onClick={() => setFrage(null)}>Nein</button>
                <button type="button" className="es-knopf fi-primaer" disabled={laeuft} onClick={() => void zuruecknehmen(i.id)}>Ja, zurücknehmen</button>
              </> : <button type="button" className="es-knopf" onClick={() => setFrage(i.id)}>Zurücknehmen</button>)}
            </div>
          );
        })}
      </div>
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <span className="small es-fuss fi-fuss">Eine Differenz entsteht durch offene oder ignorierte Umsätze, fehlenden Anfangsbestand oder Buchungen von Hand. Zurücknehmen geht nur, solange aus dem Import nichts zugeordnet ist.</span>
    </>
  );
}

function BankkontoBlatt({ supabase, konto, vorIban, konten, kasse, vorgabe, bankkonten, darfSchreiben, onClose }: {
  supabase: SupabaseClient; konto: FinBankkonto | null; vorIban: string | null; konten: FinKonto[]; kasse: number; vorgabe: number;
  bankkonten: FinBankkonto[]; darfSchreiben: boolean; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const geld = konten.filter((k) => k.kategorie === "geld" && k.nummer !== kasse && (k.aktiv || k.nummer === konto?.konto));
  const frei = geld.find((k) => k.nummer === vorgabe && !bankkonten.some((b) => b.konto === vorgabe)) ?? geld.find((k) => !bankkonten.some((b) => b.konto === k.nummer));
  const [name, setName] = useState(konto?.name ?? "");
  const [iban, setIban] = useState(konto?.iban ? ibanText(konto.iban) : vorIban ? ibanText(vorIban) : "");
  const [sachkonto, setSachkonto] = useState(String(konto?.konto ?? frei?.nummer ?? vorgabe));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const ibanWert = iban.trim() ? ibanSauber(iban) : null;
  const pruefung = !name.trim() ? "Den Namen eintragen." : iban.trim() && !ibanWert ? "Die IBAN ist nicht gültig." : !sachkonto ? "Das Sachkonto wählen." : null;

  async function los(f: () => Promise<unknown>) {
    setLaeuft(true); setFehler(null);
    try { await f(); await queryClient.invalidateQueries({ queryKey: qk.finBankkonten() }); onClose(); }
    catch (e) { setFehler(/duplicate|unique|23505/i.test(String((e as Error).message)) ? "Ein Bankkonto mit dieser IBAN gibt es schon." : fehlerText(e)); }
    finally { setLaeuft(false); }
  }
  const felder = { name: name.trim(), iban: ibanWert, konto: Number(sachkonto) };
  return (
    <Blatt titel={konto ? konto.name : "Bankkonto anlegen"} onClose={onClose}
      fuss={darfSchreiben ? <>
        {konto && <button type="button" className="btn-secondary" disabled={laeuft}
          onClick={() => void los(() => finBankkontoAendern(supabase, konto.id, { aktiv: !konto.aktiv }))}>{konto.aktiv ? "Ausblenden" : "Einblenden"}</button>}
        <button type="button" className="btn-primary" disabled={laeuft || !!pruefung}
          onClick={() => void los(() => konto ? finBankkontoAendern(supabase, konto.id, felder) : finBankkontoAnlegen(supabase, felder))}>Speichern</button>
      </> : undefined}>
      <div className="fi-formular">
        <label className="nk-feld"><span>Name</span><input value={name} maxLength={80} disabled={!darfSchreiben} onChange={(e) => setName(e.target.value)} placeholder="z. B. Sparkasse Geschäftskonto" /></label>
        <label className="nk-feld"><span>IBAN</span><input value={iban} maxLength={42} disabled={!darfSchreiben} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="DE.." autoComplete="off" /></label>
        <label className="nk-feld"><span>Sachkonto</span>
          <select value={sachkonto} disabled={!darfSchreiben} onChange={(e) => setSachkonto(e.target.value)} aria-label="Sachkonto">
            {geld.map((k) => <option key={k.nummer} value={k.nummer}>{kontoNr(k.nummer)} {k.bezeichnung}</option>)}
          </select></label>
        <span className="small">Jedes Bankkonto bucht auf ein eigenes Sachkonto (unter Buchungen › Konten lässt sich eins anlegen, z. B. ein zweites Bankkonto).</span>
        {pruefung && (name || iban) && <div className="fi-hinweis fi-rot" role="alert">{pruefung}</div>}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Kassenbuch und Kassensturz
function Kassenbuch({ supabase, heute, buchungen, laedt, kasse, name, darfBuchen, darfKassensturz, onNeu, onMeldung }: {
  supabase: SupabaseClient; heute: string; buchungen: FinBuchung[]; laedt: boolean; kasse: number; name: string;
  darfBuchen: boolean; darfKassensturz: boolean; onNeu: (art: "ein" | "aus") => void; onMeldung: (t: string) => void;
}) {
  const k = kassenbuch(buchungen, kasse);
  const stuerzeQ = useFinKassenstuerze(supabase, true);
  const [sturz, setSturz] = useState(false);
  const letzter = stuerzeQ.data?.[0];
  return (
    <>
      <div className="fi-kacheln">
        <div className={"db-karte fi-kachel" + (k.bestand < 0 ? " fi-kachel-warn" : "")}><span className="small">Bestand {kontoNr(kasse)} {name}</span><b>{formatEUR(k.bestand)}</b></div>
        <div className="db-karte fi-kachel"><span className="small">Letzter Kassensturz</span><b>{letzter ? datumKurz(letzter.datum) : "–"}</b>
          {letzter && <span className={"small" + (letzter.differenz !== 0 && !letzter.buchung_id ? " fi-rot-text" : "")}>
            {letzter.differenz === 0 ? "stimmte" : `Differenz ${formatEUR(letzter.differenz)}${letzter.buchung_id ? " (ausgebucht)" : ""}`}</span>}</div>
      </div>
      {k.negativAm && (
        <div className="fi-hinweis fi-rot" role="alert">Am {datumKurz(k.negativAm)} läge die Kasse unter null – das kann nicht sein. Fehlt eine Einnahme, der Anfangsbestand oder eine Einlage?</div>
      )}
      {(darfBuchen || darfKassensturz) && (
        <div className="fi-werkzeug">
          {darfBuchen && <button type="button" className="btn-primary fi-knopf" onClick={() => onNeu("ein")}>Einnahme</button>}
          {darfBuchen && <button type="button" className="btn-secondary fi-knopf" onClick={() => onNeu("aus")}>Ausgabe</button>}
          {darfKassensturz && <button type="button" className="btn-secondary fi-knopf" onClick={() => setSturz(true)}>Kassensturz</button>}
        </div>
      )}
      <div className="db-karte es-karte">
        {laedt ? <span className="small">Lädt …</span> : k.zeilen.length === 0 ? <span className="small">Noch keine Bewegung auf der Kasse. Bar bezahlte Rechnungen und Belege stehen hier von selbst.</span>
          : [...k.zeilen].reverse().map((z) => (
            <div key={`${z.nr}-${z.datum}`} className={"es-zeile statisch fi-buchung" + (z.storno ? " fi-leise" : "")}>
              <span className="fi-nr">{z.nr}</span>
              <span className="db-punkt-text"><b>{z.text}</b><span className="small">{datumKurz(z.datum)}{z.beleg ? ` · ${z.beleg}` : ""} · Bestand {formatEUR(z.bestand)}</span></span>
              <span className={"fi-betrag" + (z.einnahme ? " fi-gruen-text" : "")}>{formatEUR(z.einnahme - z.ausgabe)}</span>
            </div>
          ))}
      </div>
      {(stuerzeQ.data ?? []).length > 0 && (
        <>
          <span className="op-gruppe-titel">KASSENSTÜRZE</span>
          <div className="db-karte es-karte">
            {(stuerzeQ.data ?? []).slice(0, 10).map((s) => (
              <div key={s.id} className="es-zeile statisch fi-buchung">
                <span className="db-punkt-text"><b>{datumKurz(s.datum)} · gezählt {formatEUR(s.gezaehlt)}</b>
                  <span className="small">laut Buchungen {formatEUR(s.buchbestand)}{s.notiz ? ` · ${s.notiz}` : ""}{s.buchung_id ? " · Differenz ausgebucht" : ""}</span></span>
                <span className={"fi-betrag" + (s.differenz !== 0 ? " fi-rot-text" : " fi-gruen-text")}>{s.differenz === 0 ? "stimmt" : formatEUR(s.differenz)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <span className="small es-fuss fi-fuss">Das Kassenbuch ist das Konto {kontoNr(kasse)} im Journal: jede Bareinnahme und -ausgabe am selben Tag buchen. Ohne gebuchten Anfangsbestand beginnt es bei null.
        Beim Kassensturz wird das Bargeld gezählt und mit dem Bestand laut Buchungen verglichen.</span>
      {sturz && (
        <KassensturzBlatt supabase={supabase} heute={heute} buchungen={buchungen} kasse={kasse}
          onFertig={(t) => { setSturz(false); onMeldung(t); }} onClose={() => setSturz(false)} />
      )}
    </>
  );
}

function KassensturzBlatt({ supabase, heute, buchungen, kasse, onFertig, onClose }: {
  supabase: SupabaseClient; heute: string; buchungen: FinBuchung[]; kasse: number; onFertig: (t: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [datum, setDatum] = useState(heute);
  const [gezaehlt, setGezaehlt] = useState("");
  const [notiz, setNotiz] = useState("");
  const [ausgleichen, setAusgleichen] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zahl = betragLesen(gezaehlt);
  // Vorschau aus dem Journal dieses Jahres; den maßgeblichen Bestand (alle Jahre) rechnet die Datenbank.
  const bestand = kontoSaldoBis(buchungen, kasse, datum);
  const diff = zahl == null ? null : Math.round((zahl - bestand) * 100) / 100;
  async function los() {
    if (zahl == null) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await finKassensturz(supabase, datum, zahl, notiz.trim(), ausgleichen);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      onFertig(r.differenz === 0 ? "Kassensturz festgehalten – die Kasse stimmt."
        : `Kassensturz festgehalten – Differenz ${formatEUR(r.differenz)}${r.nr ? ` ausgebucht (Nr. ${r.nr})` : ""}.`);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <Blatt titel="Kassensturz" unter={`Konto ${kontoNr(kasse)}`} onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void los()} disabled={laeuft || zahl == null || zahl < 0 || datum > heute}>{laeuft ? "…" : "Festhalten"}</button>
      </>}>
      <div className="fi-formular">
        <div className="fi-zwei">
          <label className="nk-feld"><span>Gezählt am</span><input type="date" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} /></label>
          <label className="nk-feld"><span>Gezählter Bestand in €</span><input inputMode="decimal" value={gezaehlt} onChange={(e) => setGezaehlt(e.target.value)} placeholder="0,00" aria-label="Gezählter Bestand" /></label>
        </div>
        <div className="fi-kacheln">
          <div className="db-karte fi-kachel"><span className="small">Laut Buchungen</span><b>{formatEUR(bestand)}</b></div>
          <div className={"db-karte fi-kachel" + (diff ? " fi-kachel-warn" : "")}><span className="small">Differenz</span><b>{diff == null ? "–" : formatEUR(diff)}</b></div>
        </div>
        <label className="nk-feld"><span>Notiz</span><input value={notiz} maxLength={200} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Abrechnung Freitag" /></label>
        {diff != null && diff !== 0 && (
          <button type="button" className="es-zeile" aria-pressed={ausgleichen} onClick={() => setAusgleichen(!ausgleichen)}>
            <span className="db-punkt-text"><b>Differenz ausbuchen</b>
              <span className="small">{diff < 0 ? "Fehlbetrag als sonstiger Aufwand" : "Überschuss als sonstiger Ertrag"} – danach stimmt der Bestand. Erst nach der Suche nach einer vergessenen Buchung.</span></span>
            <span className={"nk-spur" + (ausgleichen ? " an" : "")} aria-hidden="true"><span /></span>
          </button>
        )}
        <span className="small">Der Bestand „laut Buchungen“ ist hier aus dem Journal dieses Jahres; festgehalten wird der Bestand über alle Jahre.</span>
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Hilfen
function datumKurz(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

function kurz(t: string, n: number): string {
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

function ibanText(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function umsatzText(n: number): string {
  return n === 1 ? "1 Umsatz" : `${n} Umsätze`;
}

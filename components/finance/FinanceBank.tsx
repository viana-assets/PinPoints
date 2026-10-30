"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import {
  useFinBankimporte, useFinBankkonten, useFinBankregeln, useFinBankumsaetze, useFinBelege, useFinBuchungen, useFinKonten, useFinKostenstellen,
  useFinLieferanten, useFinKassenstuerze, useFinRechnungen, useFinSteuerschluessel,
} from "@/lib/queries/hooks";
import {
  finBankAufheben, finBankEinlesen, finBankIgnorieren, finBankImportZuruecknehmen, finBankkontoAendern, finBankkontoAnlegen,
  finBankregelLoeschen, finBankregelSpeichern, finBankSammeln, finBankZuBeleg, finBankZuKonto, finBankZuRechnung, finKassensturz,
  type FinBankregelFelder,
} from "@/lib/api/finance";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { betragLesen, buchungVorschau, kontoNr, passendeSchluessel, type FinBuchung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import { FIN_RECHNUNG_KONTEN, type FinRechnungZeile } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";
import {
  FIN_BANK_MAX_BYTES, FIN_BANK_MAX_UMSAETZE, FIN_BANKREGEL_RICHTUNGEN, FIN_GELDTRANSIT, dateiText, ibanSauber, kassenbuch, kontoAusFrueheren,
  kontoSaldoBis, kontoauszugLesen, regelFuer, regelPasst, sammelKandidaten, sammelRest, vorschlaege,
  type BankRichtung, type FinBankimport, type FinBankkonto, type FinBankregel, type FinBankumsatz, type Kontoauszug,
} from "@/lib/finance/bank";
import type { FinKostenstelle } from "@/lib/finance/kostenstellen";
import { formatEUR } from "@/lib/format";
import { BuchungNeu, KontoWahl, ZeilenTabelle, type BuchungVorlage } from "./FinanceBuchungen";
import { KostWahl } from "./arbeitsplatz/KostWahl";

// Finance › Bank & Kasse (Phase F4, Migration 91, v149). Kontoauszug (CAMT.053 oder CSV) im Browser lesen,
// einlesen (doppelte Umsätze erkennt die Datenbank), jeden Umsatz zuordnen: Rechnung, Beleg, Konto – oder
// ignorieren. Dazu das Kassenbuch: alle Bewegungen auf dem Kassenkonto mit laufendem Bestand.
//
// Stufe E Teil 1 (Migration 112, v185): Bankregeln schlagen das Konto vor (gebucht wird erst nach Bestätigung,
// „Nach Regeln buchen“ zeigt vorher die Liste), ein Umsatz lässt sich auf mehrere Rechnungen bzw. Belege verteilen –
// mit Skonto je Posten und einem Rest auf ein Konto. Dazu Kostenstellen bei der Kontobuchung und der Geldtransit.
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
  // Migration 112 bzw. 108: fehlen sie, bleiben die Listen leer und alles läuft wie vorher.
  const regelnQ = useFinBankregeln(supabase, bereit);
  const kostQ = useFinKostenstellen(supabase, bereit);
  const [reiter, setReiter] = useState<Reiter>("offen");
  const [filter, setFilter] = useState("");
  const [zeigen, setZeigen] = useState(SEITE);
  const [offen, setOffen] = useState<FinBankumsatz | null>(null);
  const [auszug, setAuszug] = useState<{ a: Kontoauszug; name: string } | null>(null);
  const [kontoOffen, setKontoOffen] = useState<FinBankkonto | { iban: string | null } | null>(null);
  const [vorlage, setVorlage] = useState<BuchungVorlage | null>(null);
  const [regelOffen, setRegelOffen] = useState<FinBankregel | Partial<FinBankregelFelder> | null>(null);
  const [regelnBuchen, setRegelnBuchen] = useState(false);
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
  const regeln = regelnQ.data ?? [];
  const kostenstellen = kostQ.data ?? [];
  const transit = FIN_GELDTRANSIT[rahmen];
  const aktiveKonten = bankkonten.filter((k) => k.aktiv);
  const kasse = FIN_RECHNUNG_KONTEN[rahmen].kasse;
  const gefiltert = umsaetze.filter((u) => !filter || u.bankkonto_id === filter);
  const offene = gefiltert.filter((u) => u.status === "offen");
  const erledigt = gefiltert.filter((u) => u.status !== "offen" && u.datum.slice(0, 4) === String(jahr));
  const fehlt = [bankkontenQ, umsaetzeQ, importeQ].some((x) => x.isError);
  const kontoName = (id: string) => bankkonten.find((k) => k.id === id)?.name ?? "Bankkonto";
  // Offene Umsätze, zu denen eine Regel passt – gebucht wird erst nach der Bestätigungsliste.
  const regelTreffer = darfSchreiben ? offene.flatMap((u) => { const r = regelFuer(u, regeln); return r ? [{ u, r }] : []; }) : [];

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
              {reiter === "offen" && regelTreffer.length > 0 && (
                <button type="button" className="btn-secondary fi-knopf" onClick={() => setRegelnBuchen(true)}>Nach Regeln buchen ({regelTreffer.length})</button>
              )}
            </div>
          )}
          <div className="db-karte es-karte">
            {umsaetzeQ.isPending ? <span className="small">Lädt …</span>
              : liste.length === 0 ? <span className="small">{reiter === "offen" ? "Kein offener Umsatz. Kontoauszug als CAMT.053 oder CSV aus dem Online-Banking laden und hier einlesen." : "Noch nichts zugeordnet."}</span>
              : liste.slice(0, zeigen).map((u) => {
                const v = reiter === "offen" ? vorschlaege(u, rechnungen, belege, lieferanten)[0] : undefined;
                const regel = reiter === "offen" && !v?.passt ? regelFuer(u, regeln) : null;
                return (
                  <button key={u.id} type="button" className={"es-zeile fi-buchung" + (u.status === "ignoriert" ? " fi-leise" : "")} onClick={() => setOffen(u)}>
                    <span className="db-punkt-text">
                      <b>{u.name ?? (u.betrag > 0 ? "Eingang" : "Abbuchung")}</b>
                      <span className="small">{datumKurz(u.datum)}{bankkonten.length > 1 ? ` · ${kontoName(u.bankkonto_id)}` : ""}{u.zweck ? ` · ${kurz(u.zweck, 70)}` : ""}
                        {u.status !== "offen" && <> · <span className={u.status === "zugeordnet" ? "fi-gruen-text" : ""}>{erledigtText(u, rechnungen, belege, buchungen)}</span></>}
                        {v?.passt && <> · <span className="fi-gruen-text">passt zu {v.titel.split(" · ")[0]}</span></>}
                        {regel && <> · <span className="fi-regel">Regel: {regel.bezeichnung} → {kontoNr(regel.konto)}</span></>}</span>
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
              transit={transit} darfKassensturz={darfSchreiben} onMeldung={(t) => { setFehler(null); setMeldung(t); }}
              darfBuchen={darfBuchen} onNeu={(art) => setVorlage(art === "ein"
                ? { titel: "Kasse: Einnahme", soll: kasse }
                : art === "transit"
                  // Bareinzahlung: Kasse an Geldtransit; der Eingang auf dem Kontoauszug bucht dann Bank an Geldtransit.
                  ? { titel: "Kasse: zur Bank gebracht", text: "Bareinzahlung auf das Bankkonto", soll: transit, haben: kasse }
                  : { titel: "Kasse: Ausgabe", haben: kasse })} />
          : <div className="fi-hinweis fi-info">Das Kassenbuch zeigt Buchungen – dafür braucht es das Recht „Finance › Buchungen“ lesen.</div>
      )}

      {reiter === "konten" && (
        <KontenUndImporte supabase={supabase} jahr={jahr} bankkonten={bankkonten} importe={importeQ.data ?? []} umsaetze={umsaetze}
          konten={konten} buchungen={buchungenSehen ? buchungen : null} darfSchreiben={darfSchreiben} darfLoeschen={darfLoeschen}
          regeln={regeln} regelnFehlen={regelnQ.isError} transit={transit} onRegel={setRegelOffen}
          onKonto={setKontoOffen} onMeldung={(t) => { setFehler(null); setMeldung(t); }} />
      )}

      {offen && (
        <UmsatzBlatt supabase={supabase} umsatz={umsaetze.find((u) => u.id === offen.id) ?? offen} alle={umsaetze} einstellungen={einstellungen}
          bankkonten={bankkonten} konten={konten} schluessel={schluessel} buchungen={buchungen} rechnungen={rechnungen} belege={belege}
          lieferanten={lieferanten} regeln={regeln} kostenstellen={kostenstellen} darfSchreiben={darfSchreiben}
          onFertig={(t) => { setOffen(null); setFehler(null); setMeldung(t); }} onClose={() => setOffen(null)} />
      )}
      {regelnBuchen && (
        <RegelnBuchenBlatt supabase={supabase} treffer={regelTreffer} konten={konten} rechnungen={rechnungen} belege={belege} lieferanten={lieferanten}
          onFertig={(t) => { setRegelnBuchen(false); setFehler(null); setMeldung(t); }} onClose={() => setRegelnBuchen(false)} />
      )}
      {regelOffen && (
        <RegelBlatt supabase={supabase} regel={"id" in regelOffen ? regelOffen as FinBankregel : null} vorgabe={"id" in regelOffen ? {} : regelOffen}
          einstellungen={einstellungen} konten={konten} schluessel={schluessel} kostenstellen={kostenstellen} sachkonten={bankkonten.map((k) => k.konto)}
          offene={umsaetze.filter((u) => u.status === "offen")} darfSchreiben={darfSchreiben}
          onFertig={(t) => { setRegelOffen(null); setFehler(null); setMeldung(t); }} onClose={() => setRegelOffen(null)} />
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
  if (u.zuordnung === "mehrere") {
    const teile = u.fin_bank_teile ?? [];
    const n = teile.filter((t) => t.art === "rechnung" || t.art === "beleg").length;
    const skonto = cent(teile.filter((t) => t.art === "skonto").reduce((s, t) => s + t.betrag, 0));
    const rest = teile.find((t) => t.art === "konto");
    return [u.betrag > 0 ? (n === 1 ? "1 Rechnung" : `${n} Rechnungen`) : (n === 1 ? "1 Beleg" : `${n} Belege`),
      skonto ? `Skonto ${formatEUR(skonto)}` : "", rest ? `Rest ${formatEUR(rest.betrag)}` : ""].filter(Boolean).join(" · ");
  }
  const zeile = buchungen.find((b) => b.id === u.buchung_id)?.fin_buchungszeilen.find((z) => !z.ist_steuer && (u.betrag > 0 ? z.seite === "H" : z.seite === "S"));
  return mitNr(zeile ? `Konto ${kontoNr(zeile.konto)}` : "auf Konto gebucht");
}

// ---------------------------------------------------------------- Ein Umsatz
type Modus = "wahl" | "konto" | "mehrere" | "ignorieren" | "aufheben";
type SammelWahl = { id: string; betrag: string; skonto: string };

function UmsatzBlatt({ supabase, umsatz: u, alle, einstellungen, bankkonten, konten, schluessel, buchungen, rechnungen, belege, lieferanten, regeln, kostenstellen, darfSchreiben, onFertig, onClose }: {
  supabase: SupabaseClient; umsatz: FinBankumsatz; alle: FinBankumsatz[]; einstellungen: FinEinstellungen;
  bankkonten: FinBankkonto[]; konten: FinKonto[]; schluessel: FinSteuerschluessel[]; buchungen: FinBuchung[];
  rechnungen: FinRechnungZeile[]; belege: FinBeleg[]; lieferanten: FinLieferant[]; regeln: FinBankregel[]; kostenstellen: FinKostenstelle[];
  darfSchreiben: boolean; onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sachkonten = bankkonten.map((k) => k.konto);
  const bankkonto = bankkonten.find((k) => k.id === u.bankkonto_id);
  const offenerUmsatz = u.status === "offen";
  const liste = offenerUmsatz ? vorschlaege(u, rechnungen, belege, lieferanten) : [];
  const kandidaten = offenerUmsatz ? sammelKandidaten(u, rechnungen, belege, lieferanten) : [];
  // Vorrang: eine Regel, sonst das Konto vom letzten Umsatz desselben Namens. Passt eine Rechnung bzw. ein Beleg
  // auf den Cent, bleibt die Auswahl vorn – die Regel ist dann nur ein Vorschlag.
  const regel = offenerUmsatz ? regelFuer(u, regeln) : null;
  const frueher = regel ? null : kontoAusFrueheren(u, alle, buchungen, sachkonten);
  const vorgabe = regel ? { konto: regel.konto, steuer: regel.steuer ?? "" } : frueher;
  const [modus, setModus] = useState<Modus>(offenerUmsatz && vorgabe && !liste.some((v) => v.passt) ? "konto" : "wahl");
  const [konto, setKonto] = useState(vorgabe ? String(vorgabe.konto) : "");
  const [steuer, setSteuer] = useState(vorgabe?.steuer ?? "");
  const [text, setText] = useState(regel?.text?.trim() || kurz([u.name, u.zweck].filter(Boolean).join(": "), 200));
  const [kost1, setKost1] = useState(regel?.kost1 ?? "");
  const [kost2, setKost2] = useState(regel?.kost2 ?? "");
  const [alsRegel, setAlsRegel] = useState(false);
  const [regelName, setRegelName] = useState(kurz(u.name ?? "", 80));
  const [regelZweck, setRegelZweck] = useState("");
  const [wahl, setWahl] = useState<SammelWahl[]>([]);
  const [restKonto, setRestKonto] = useState("");
  const [restSteuer, setRestSteuer] = useState("");
  const [restText, setRestText] = useState(kurz(`Differenz: ${u.name ?? (u.betrag > 0 ? "Eingang" : "Abbuchung")}`, 200));
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const eingang = u.betrag > 0;
  const passend = passendeSchluessel(schluessel, einstellungen).filter((s) => (eingang ? s.art === "ust" || s.art === "ohne" : s.art !== "ust"));
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const gegen = konto ? Number(konto) : null;
  const mitKost = kostenstellen.length > 0 && kostErlaubt(konten, gegen);
  const vorschau = bankkonto ? buchungVorschau([{
    soll: eingang ? bankkonto.konto : gegen, haben: eingang ? gegen : bankkonto.konto, betrag: Math.abs(u.betrag), steuer: steuer || null,
    ...(mitKost ? { kost1: kost1 || null, kost2: kost2 || null } : {}),
  }], konten, schluessel, einstellungen) : null;
  const kontoPruefung = !gegen ? "Das Gegenkonto wählen." : gegen === bankkonto?.konto ? "Gegenkonto und Bankkonto sind dasselbe." : vorschau?.fehler
    ?? (alsRegel && !regelName.trim() && !regelZweck.trim() ? "Für die Regel einen Namen oder einen Text aus dem Verwendungszweck angeben." : null);

  // Sammelzuordnung: gewählte Posten mit Betrag und Skonto, der Rest auf ein Konto.
  const posten = wahl.flatMap((w) => {
    const k = kandidaten.find((x) => x.id === w.id);
    return k ? [{ k, betrag: betragLesen(w.betrag) ?? 0, skonto: w.skonto.trim() ? betragLesen(w.skonto) ?? -1 : 0 }] : [];
  });
  const rest = sammelRest(u.betrag, posten);
  const zuViel = posten.find((p) => cent(p.betrag + p.skonto) > p.k.rest);
  const sammelPruefung = !posten.length ? "Mindestens einen Posten wählen."
    : posten.some((p) => p.betrag <= 0) ? "Jeder Posten braucht einen Betrag größer 0."
    : posten.some((p) => p.skonto < 0) ? "Das Skonto ist keine gültige Zahl."
    : zuViel ? `${zuViel.k.titel.split(" · ")[0]}: offen sind nur ${formatEUR(zuViel.k.rest)}.`
    : rest < 0 ? `Die Posten sind ${formatEUR(-rest)} mehr als der Umsatz.`
    : rest > 0 && !restKonto ? `Es bleiben ${formatEUR(rest)} – ein Konto für den Rest wählen (Gebühr, Überzahlung, Differenz).`
    : rest > 0 && Number(restKonto) === bankkonto?.konto ? "Der Rest gehört auf ein anderes Konto als das Bankkonto." : null;

  function waehlen(id: string, betrag?: number) {
    if (wahl.some((w) => w.id === id)) { setWahl(wahl.filter((w) => w.id !== id)); return; }
    const k = kandidaten.find((x) => x.id === id);
    if (!k) return;
    const frei = sammelRest(u.betrag, posten);
    setWahl([...wahl, { id, betrag: zahlText(betrag ?? (frei > 0 ? Math.min(k.rest, frei) : k.rest)), skonto: "" }]);
  }
  function setzeWahl(id: string, teil: Partial<SammelWahl>) {
    setWahl(wahl.map((w) => (w.id === id ? { ...w, ...teil } : w)));
  }

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

  async function aufKontoBuchen(): Promise<string> {
    const r = await finBankZuKonto(supabase, u.id, gegen as number, steuer || null, text.trim(), mitKost && (kost1 || kost2) ? { kost1, kost2 } : undefined);
    let t = `Gebucht (Nr. ${r.nr}).`;
    if (alsRegel) {
      const bezeichnung = kurz(regelName.trim() || regelZweck.trim(), 80);
      try {
        await finBankregelSpeichern(supabase, null, {
          bezeichnung, richtung: eingang ? "ein" : "aus", name_enthaelt: regelName.trim() || null, zweck_enthaelt: regelZweck.trim() || null, iban: null,
          konto: gegen as number, steuer: steuer || null, text: null, kost1: mitKost ? kost1 || null : null, kost2: mitKost ? kost2 || null : null, aktiv: true,
        });
        t += ` Regel „${bezeichnung}“ gespeichert.`;
      } catch (e) {
        t += ` Die Regel wurde nicht gespeichert: ${fehlerText(e)}`;
      }
    }
    return t;
  }

  async function sammeln(): Promise<string> {
    const r = await finBankSammeln(supabase, u.id,
      posten.map((p) => ({ art: p.k.art, id: p.k.id, betrag: p.betrag, ...(p.skonto > 0 ? { skonto: p.skonto } : {}) })),
      rest > 0 ? { konto: Number(restKonto), steuer: restSteuer || null, text: restText.trim() } : null);
    return `Zugeordnet: ${r.posten === 1 ? "1 Posten" : `${r.posten} Posten`}${r.rest ? `, Rest ${formatEUR(r.rest)} auf Konto ${kontoNr(Number(restKonto))}` : ""} (ab Nr. ${r.von}).`;
  }

  let fuss: React.ReactNode;
  if (darfSchreiben && offenerUmsatz) {
    fuss = modus === "konto" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-primary" disabled={laeuft || !!kontoPruefung} onClick={() => void ausfuehren(aufKontoBuchen)}>{laeuft ? "…" : "Buchen"}</button>
    </> : modus === "mehrere" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-primary" disabled={laeuft || !!sammelPruefung} onClick={() => void ausfuehren(sammeln)}>
        {laeuft ? "…" : posten.length > 1 ? `${posten.length} Posten zuordnen` : "Zuordnen"}</button>
    </> : modus === "ignorieren" ? <>
      <button type="button" className="btn-secondary" onClick={() => setModus("wahl")} disabled={laeuft}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()}
        onClick={() => void ausfuehren(async () => { await finBankIgnorieren(supabase, u.id, grund.trim()); return "Umsatz ignoriert."; })}>Ignorieren</button>
    </> : <>
      <button type="button" className="btn-secondary" onClick={() => setModus("ignorieren")}>Ignorieren …</button>
      {kandidaten.length > 0 && <button type="button" className="btn-secondary" onClick={() => setModus("mehrere")}>Mehrere / Differenz …</button>}
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

  const nrVon = (id: string) => buchungen.find((b) => b.id === id)?.nr;
  const teilTitel = (art: string, id: string | null) => art === "rechnung" ? `Rechnung ${rechnungen.find((r) => r.rechnung_id === id)?.nummer_text ?? ""}`.trim()
    : art === "beleg" ? `Beleg ${belege.find((b) => b.id === id)?.belegnummer ?? ""}`.trim() : art === "skonto" ? "Skonto" : "Rest auf Konto";

  return (
    <Blatt titel={formatEUR(u.betrag)} unter={`${datumKurz(u.datum)} · ${bankkonto?.name ?? "Bankkonto"} · ${offenerUmsatz ? "offen" : u.status === "ignoriert" ? "ignoriert" : "zugeordnet"}`}
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
        {!offenerUmsatz && (
          <div className={"fi-hinweis " + (u.status === "zugeordnet" ? "fi-ok" : "fi-info")}>{erledigtText(u, rechnungen, belege, buchungen)}</div>
        )}
        {u.zuordnung === "mehrere" && (u.fin_bank_teile ?? []).length > 0 && (
          <div className="fi-gruppe">
            {(u.fin_bank_teile ?? []).map((t, i) => (
              <div key={i} className="es-zeile statisch fi-buchung">
                <span className="db-punkt-text"><b>{teilTitel(t.art, t.ziel_id)}</b>{nrVon(t.buchung_id) && <span className="small">Nr. {nrVon(t.buchung_id)}</span>}</span>
                <span className="fi-betrag">{formatEUR(t.betrag)}</span>
              </div>
            ))}
          </div>
        )}

        {offenerUmsatz && modus === "wahl" && (
          <>
            {regel && <div className="fi-hinweis fi-info">Regel „{regel.bezeichnung}“ schlägt Konto {kontoNr(regel.konto)} {name(regel.konto)} vor – unter „Auf Konto buchen“.</div>}
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
                    {darfSchreiben && !v.passt && kandidaten.some((k) => k.id === v.id) && (
                      <button type="button" className="es-knopf" disabled={laeuft}
                        onClick={() => { setWahl([{ id: v.id, betrag: zahlText(Math.min(v.rest, Math.abs(u.betrag))), skonto: "" }]); setModus("mehrere"); }}>Mit Differenz …</button>
                    )}
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
            <span className="small">Sonst: auf ein Konto buchen (Gebühren, Miete, Privat, Umbuchung), auf mehrere {eingang ? "Rechnungen" : "Belege"} verteilen – auch mit Skonto oder Differenz – oder ignorieren, wenn schon von Hand gebucht.</span>
          </>
        )}

        {offenerUmsatz && modus === "konto" && (
          <>
            {regel && <div className="fi-hinweis fi-info">Nach der Regel „{regel.bezeichnung}“: Konto {kontoNr(regel.konto)} {name(regel.konto)}.</div>}
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
            {mitKost && (
              <div className="fi-zwei">
                <label className="nk-feld"><span>KOST1 Transporter</span><KostWahl art="kost1" liste={kostenstellen} wert={kost1} onWert={setKost1} /></label>
                <label className="nk-feld"><span>KOST2 Leistung</span><KostWahl art="kost2" liste={kostenstellen} wert={kost2} onWert={setKost2} /></label>
              </div>
            )}
            {!regel && (
              <label className="nk-feld fi-haken"><input type="checkbox" checked={alsRegel} onChange={(e) => setAlsRegel(e.target.checked)} />
                <span>Als Regel merken – der nächste passende Umsatz bekommt dieses Konto vorgeschlagen</span></label>
            )}
            {alsRegel && !regel && (
              <div className="fi-zwei">
                <label className="nk-feld"><span>Name enthält</span><input value={regelName} maxLength={80} onChange={(e) => setRegelName(e.target.value)} placeholder="z. B. Telekom" /></label>
                <label className="nk-feld"><span>Verwendungszweck enthält</span><input value={regelZweck} maxLength={80} onChange={(e) => setRegelZweck(e.target.value)} placeholder="z. B. Kundennummer" /></label>
              </div>
            )}
            <span className="op-gruppe-titel">SO WIRD GEBUCHT</span>
            {vorschau && <ZeilenTabelle zeilen={vorschau.zeilen} name={name} />}
            {kontoPruefung && gegen && <div className="fi-hinweis fi-rot" role="alert">{kontoPruefung}</div>}
          </>
        )}

        {offenerUmsatz && modus === "mehrere" && (
          <>
            <span className="op-gruppe-titel">{eingang ? "OFFENE RECHNUNGEN" : "OFFENE BELEGE"}</span>
            <div className="fi-gruppe fi-sammel">
              {kandidaten.slice(0, 60).map((k) => {
                const w = wahl.find((x) => x.id === k.id);
                const b = w ? betragLesen(w.betrag) ?? 0 : 0;
                return (
                  <div key={k.id} className={"es-zeile statisch fi-sammel-zeile" + (w ? " gewaehlt" : "")}>
                    <label className="fi-sammel-kopf">
                      <input type="checkbox" checked={!!w} onChange={() => waehlen(k.id)} aria-label={`${k.titel} wählen`} />
                      <span className="db-punkt-text"><b>{k.titel}</b>
                        <span className="small">{datumKurz(k.datum)} · offen {formatEUR(k.rest)}{k.nummerImZweck ? " · Nummer im Zweck" : k.namePasst ? " · Name passt" : ""}</span></span>
                    </label>
                    {w && (
                      <span className="fi-sammel-felder">
                        <label className="nk-feld"><span>Betrag</span><input inputMode="decimal" value={w.betrag} aria-label={`Betrag ${k.titel}`} onChange={(e) => setzeWahl(k.id, { betrag: e.target.value })} /></label>
                        <label className="nk-feld"><span>Skonto</span><input inputMode="decimal" value={w.skonto} placeholder="0,00" aria-label={`Skonto ${k.titel}`} onChange={(e) => setzeWahl(k.id, { skonto: e.target.value })} /></label>
                        {b > 0 && b < k.rest && !w.skonto.trim() && (
                          <button type="button" className="es-knopf" onClick={() => setzeWahl(k.id, { skonto: zahlText(cent(k.rest - b)) })}>{formatEUR(cent(k.rest - b))} als Skonto</button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {kandidaten.length > 60 && <span className="small">Die ersten 60 von {kandidaten.length} – mit passender Nummer oder passendem Namen zuerst.</span>}
            <div className="fi-kacheln fi-drei">
              <div className="db-karte fi-kachel"><span className="small">Umsatz</span><b>{formatEUR(Math.abs(u.betrag))}</b></div>
              <div className="db-karte fi-kachel"><span className="small">Auf Posten</span><b>{formatEUR(cent(posten.reduce((s, p) => s + p.betrag, 0)))}</b>
                {posten.some((p) => p.skonto > 0) && <span className="small">dazu Skonto {formatEUR(cent(posten.reduce((s, p) => s + Math.max(0, p.skonto), 0)))}</span>}</div>
              <div className={"db-karte fi-kachel" + (rest < 0 ? " fi-kachel-warn" : "")}><span className="small">Rest</span><b>{formatEUR(rest)}</b></div>
            </div>
            {rest > 0 && (
              <>
                <span className="op-gruppe-titel">REST {formatEUR(rest)}</span>
                <label className="nk-feld"><span>Konto für den Rest</span>
                  <KontoWahl wert={restKonto} konten={konten.filter((k) => !sachkonten.includes(k.nummer))} onWert={setRestKonto} label="Konto für den Rest" /></label>
                <div className="fi-zwei">
                  <label className="nk-feld"><span>Steuer</span>
                    <select value={restSteuer} onChange={(e) => setRestSteuer(e.target.value)} aria-label="Steuer für den Rest">
                      <option value="">ohne Steuerschlüssel</option>
                      {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
                    </select></label>
                  <label className="nk-feld"><span>Buchungstext</span><input value={restText} maxLength={200} onChange={(e) => setRestText(e.target.value)} aria-label="Buchungstext für den Rest" /></label>
                </div>
              </>
            )}
            <span className="small">Je Posten wird eine Zahlung gebucht, Skonto über das Skontokonto, der Rest auf das gewählte Konto. Aufheben bucht alles gegen.</span>
            {sammelPruefung && wahl.length > 0 && <div className="fi-hinweis fi-rot" role="alert">{sammelPruefung}</div>}
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

// ---------------------------------------------------------------- Nach Regeln buchen (Bestätigungsliste)
function RegelnBuchenBlatt({ supabase, treffer, konten, rechnungen, belege, lieferanten, onFertig, onClose }: {
  supabase: SupabaseClient; treffer: { u: FinBankumsatz; r: FinBankregel }[]; konten: FinKonto[];
  rechnungen: FinRechnungZeile[]; belege: FinBeleg[]; lieferanten: FinLieferant[];
  onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Passt zugleich eine Rechnung bzw. ein Beleg auf den Cent, ist der Umsatz vorab abgewählt.
  const [aus, setAus] = useState<Set<string>>(() => new Set(treffer.filter((t) => vorschlaege(t.u, rechnungen, belege, lieferanten).some((v) => v.passt)).map((t) => t.u.id)));
  const [stand, setStand] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const gewaehlt = treffer.filter((t) => !aus.has(t.u.id));
  const summe = cent(gewaehlt.reduce((s, t) => s + t.u.betrag, 0));

  function umschalten(id: string) {
    const n = new Set(aus);
    if (n.has(id)) n.delete(id); else n.add(id);
    setAus(n);
  }

  async function buchen() {
    let ok = 0;
    const fehlgeschlagen: string[] = [];
    setFehler([]);
    for (const [i, t] of gewaehlt.entries()) {
      setStand(i + 1);
      try {
        const kost = (t.r.kost1 || t.r.kost2) && kostErlaubt(konten, t.r.konto) ? { kost1: t.r.kost1, kost2: t.r.kost2 } : undefined;
        await finBankZuKonto(supabase, t.u.id, t.r.konto, t.r.steuer, t.r.text?.trim() || kurz([t.u.name, t.u.zweck].filter(Boolean).join(": "), 200), kost);
        ok++;
      } catch (e) {
        fehlgeschlagen.push(`${datumKurz(t.u.datum)} · ${formatEUR(t.u.betrag)}: ${fehlerText(e)}`);
      }
    }
    setStand(null);
    await queryClient.invalidateQueries({ queryKey: qk.finance() });
    if (fehlgeschlagen.length) { setFehler(fehlgeschlagen); return; }
    onFertig(ok === 1 ? "1 Umsatz nach Regel gebucht." : `${ok} Umsätze nach Regeln gebucht.`);
  }

  return (
    <Blatt titel="Nach Regeln buchen" unter={`${gewaehlt.length} von ${treffer.length} gewählt · ${formatEUR(summe)}`} breite="breit" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={stand != null}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={() => void buchen()} disabled={stand != null || gewaehlt.length === 0}>
          {stand != null ? `bucht ${stand} von ${gewaehlt.length} …` : gewaehlt.length === 1 ? "1 Umsatz buchen" : `${gewaehlt.length} Umsätze buchen`}</button>
      </>}>
      <div className="fi-formular">
        <span className="small">Jeder gewählte Umsatz wird auf das Konto seiner Regel gebucht – erst nach „Buchen“. Abwählen, was anders gehört.</span>
        <div className="fi-gruppe fi-sammel">
          {treffer.map((t) => {
            const passt = vorschlaege(t.u, rechnungen, belege, lieferanten).find((v) => v.passt);
            return (
              <label key={t.u.id} className={"es-zeile statisch fi-sammel-zeile" + (aus.has(t.u.id) ? "" : " gewaehlt")}>
                <span className="fi-sammel-kopf">
                  <input type="checkbox" checked={!aus.has(t.u.id)} onChange={() => umschalten(t.u.id)} aria-label={`${datumKurz(t.u.datum)} ${formatEUR(t.u.betrag)} buchen`} />
                  <span className="db-punkt-text"><b>{t.u.name ?? (t.u.betrag > 0 ? "Eingang" : "Abbuchung")}</b>
                    <span className="small">{datumKurz(t.u.datum)}{t.u.zweck ? ` · ${kurz(t.u.zweck, 50)}` : ""}</span>
                    <span className="small"><span className="fi-regel">{t.r.bezeichnung}</span> → {kontoNr(t.r.konto)} {name(t.r.konto)}{t.r.steuer ? ` · ${t.r.steuer}` : ""}
                      {passt && <> · <span className="fi-rot-text">passt auch zu {passt.titel.split(" · ")[0]}</span></>}</span></span>
                </span>
                <span className={"fi-betrag" + (t.u.betrag > 0 ? " fi-gruen-text" : "")}>{formatEUR(t.u.betrag)}</span>
              </label>
            );
          })}
        </div>
        {fehler.length > 0 && (
          <div className="fi-hinweis fi-rot" role="alert">Nicht gebucht – bitte einzeln öffnen:{fehler.map((f, i) => <span key={i} className="small fi-block">{f}</span>)}</div>
        )}
      </div>
    </Blatt>
  );
}

// ---------------------------------------------------------------- Eine Bankregel
function RegelBlatt({ supabase, regel, vorgabe, einstellungen, konten, schluessel, kostenstellen, sachkonten, offene, darfSchreiben, onFertig, onClose }: {
  supabase: SupabaseClient; regel: FinBankregel | null; vorgabe: Partial<FinBankregelFelder>; einstellungen: FinEinstellungen;
  konten: FinKonto[]; schluessel: FinSteuerschluessel[]; kostenstellen: FinKostenstelle[]; sachkonten: number[]; offene: FinBankumsatz[];
  darfSchreiben: boolean; onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const v = regel ?? vorgabe;
  const [bezeichnung, setBezeichnung] = useState(v.bezeichnung ?? "");
  const [richtung, setRichtung] = useState<BankRichtung>(v.richtung ?? "beide");
  const [nameText, setNameText] = useState(v.name_enthaelt ?? "");
  const [zweck, setZweck] = useState(v.zweck_enthaelt ?? "");
  const [iban, setIban] = useState(v.iban ? ibanText(v.iban) : "");
  const [konto, setKonto] = useState(v.konto ? String(v.konto) : "");
  const [steuer, setSteuer] = useState(v.steuer ?? "");
  const [text, setText] = useState(v.text ?? "");
  const [kost1, setKost1] = useState(v.kost1 ?? "");
  const [kost2, setKost2] = useState(v.kost2 ?? "");
  const [aktiv, setAktiv] = useState(v.aktiv ?? true);
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const ibanWert = iban.trim() ? ibanSauber(iban) : null;
  const mitKost = kostenstellen.length > 0 && kostErlaubt(konten, konto ? Number(konto) : null);
  const felder: FinBankregelFelder = {
    bezeichnung: bezeichnung.trim(), richtung, name_enthaelt: nameText.trim() || null, zweck_enthaelt: zweck.trim() || null, iban: ibanWert,
    konto: Number(konto), steuer: steuer || null, text: text.trim() || null, kost1: mitKost ? kost1 || null : null, kost2: mitKost ? kost2 || null : null, aktiv,
  };
  const passend = passendeSchluessel(schluessel, einstellungen).filter((s) => (richtung === "ein" ? s.art === "ust" || s.art === "ohne" : richtung === "aus" ? s.art !== "ust" : true));
  const pruefung = !felder.bezeichnung ? "Die Bezeichnung eintragen."
    : !felder.name_enthaelt && !felder.zweck_enthaelt && !iban.trim() ? "Mindestens eine Bedingung: Name, Verwendungszweck oder IBAN."
    : iban.trim() && !ibanWert ? "Die IBAN ist nicht gültig."
    : !konto ? "Das Konto wählen." : sachkonten.includes(Number(konto)) ? "Das Konto ist ein Bankkonto." : null;
  const treffer = pruefung ? 0 : offene.filter((u) => regelPasst({ ...felder, id: regel?.id ?? "", aktiv: true }, u)).length;

  async function los(f: () => Promise<string>) {
    setLaeuft(true); setFehler(null);
    try { const t = await f(); await queryClient.invalidateQueries({ queryKey: qk.finBankregeln() }); onFertig(t); }
    catch (e) { setFehler(fehlerText(e)); }
    finally { setLaeuft(false); }
  }

  return (
    <Blatt titel={regel ? regel.bezeichnung : "Bankregel anlegen"} unter="Bank & Kasse › Bankregeln" breite="breit" onClose={onClose}
      fuss={darfSchreiben ? (frage && regel ? <>
        <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setFrage(false)}>Nein</button>
        <button type="button" className="btn-danger" disabled={laeuft}
          onClick={() => void los(async () => { await finBankregelLoeschen(supabase, regel.id); return `Regel „${regel.bezeichnung}“ gelöscht.`; })}>Ja, löschen</button>
      </> : <>
        {regel && <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setFrage(true)}>Löschen …</button>}
        <button type="button" className="btn-primary" disabled={laeuft || !!pruefung}
          onClick={() => void los(async () => { await finBankregelSpeichern(supabase, regel?.id ?? null, felder); return `Regel „${felder.bezeichnung}“ gespeichert.`; })}>Speichern</button>
      </>) : undefined}>
      <div className="fi-formular">
        <div className="fi-zwei">
          <label className="nk-feld"><span>Bezeichnung</span><input value={bezeichnung} maxLength={80} disabled={!darfSchreiben} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Telefon Telekom" /></label>
          <label className="nk-feld"><span>Gilt für</span>
            <select value={richtung} disabled={!darfSchreiben} onChange={(e) => setRichtung(e.target.value as BankRichtung)} aria-label="Gilt für">
              {FIN_BANKREGEL_RICHTUNGEN.map((r) => <option key={r.wert} value={r.wert}>{r.text}</option>)}
            </select></label>
        </div>
        <span className="op-gruppe-titel">WENN (ALLE ANGEGEBENEN STIMMEN)</span>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Name enthält</span><input value={nameText} maxLength={80} disabled={!darfSchreiben} onChange={(e) => setNameText(e.target.value)} /></label>
          <label className="nk-feld"><span>Verwendungszweck enthält</span><input value={zweck} maxLength={80} disabled={!darfSchreiben} onChange={(e) => setZweck(e.target.value)} /></label>
        </div>
        <label className="nk-feld"><span>IBAN (genau)</span><input value={iban} maxLength={42} disabled={!darfSchreiben} autoComplete="off" onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="optional" /></label>
        <span className="op-gruppe-titel">DANN BUCHEN AUF</span>
        <label className="nk-feld"><span>Konto</span>
          <KontoWahl wert={konto} konten={konten.filter((k) => !sachkonten.includes(k.nummer))} onWert={setKonto} label="Konto der Regel" /></label>
        <div className="fi-zwei">
          <label className="nk-feld"><span>Steuer</span>
            <select value={steuer} disabled={!darfSchreiben} onChange={(e) => setSteuer(e.target.value)} aria-label="Steuer der Regel">
              <option value="">ohne Steuerschlüssel</option>
              {passend.map((s) => <option key={s.schluessel} value={s.schluessel}>{s.bezeichnung}</option>)}
            </select></label>
          <label className="nk-feld"><span>Buchungstext</span><input value={text} maxLength={200} disabled={!darfSchreiben} onChange={(e) => setText(e.target.value)} placeholder="leer: Name und Zweck des Umsatzes" /></label>
        </div>
        {mitKost && (
          <div className="fi-zwei">
            <label className="nk-feld"><span>KOST1 Transporter</span><KostWahl art="kost1" liste={kostenstellen} wert={kost1} onWert={setKost1} /></label>
            <label className="nk-feld"><span>KOST2 Leistung</span><KostWahl art="kost2" liste={kostenstellen} wert={kost2} onWert={setKost2} /></label>
          </div>
        )}
        <label className="nk-feld fi-haken"><input type="checkbox" checked={aktiv} disabled={!darfSchreiben} onChange={(e) => setAktiv(e.target.checked)} /> <span>aktiv (ausgeschaltet schlägt sie nichts vor)</span></label>
        {!pruefung && <span className="small">Trifft {treffer === 1 ? "1 offenen Umsatz" : `${treffer} offene Umsätze`}. Groß- und Kleinschreibung, Leer- und Satzzeichen zählen nicht.</span>}
        {pruefung && (bezeichnung || nameText || zweck || konto) && <div className="fi-hinweis fi-rot" role="alert">{pruefung}</div>}
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
function KontenUndImporte({ supabase, jahr, bankkonten, importe, umsaetze, konten, buchungen, darfSchreiben, darfLoeschen, regeln, regelnFehlen, transit, onRegel, onKonto, onMeldung }: {
  supabase: SupabaseClient; jahr: number; bankkonten: FinBankkonto[]; importe: FinBankimport[]; umsaetze: FinBankumsatz[]; konten: FinKonto[];
  buchungen: FinBuchung[] | null; darfSchreiben: boolean; darfLoeschen: boolean;
  regeln: FinBankregel[]; regelnFehlen: boolean; transit: number; onRegel: (r: FinBankregel | Partial<FinBankregelFelder>) => void;
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

      <span className="op-gruppe-titel">BANKREGELN</span>
      {regelnFehlen ? <div className="fi-hinweis fi-info">Bankregeln gibt es ab Migration 112.</div> : <>
        {darfSchreiben && (
          <div className="fi-werkzeug">
            <button type="button" className="btn-primary fi-knopf" onClick={() => onRegel({})}>Regel anlegen</button>
            {!regeln.some((r) => r.konto === transit) && (
              <button type="button" className="btn-secondary fi-knopf"
                onClick={() => onRegel({ bezeichnung: "Bareinzahlung", richtung: "ein", zweck_enthaelt: "Einzahlung", konto: transit, text: "Bareinzahlung aus der Kasse" })}>
                Regel für Bareinzahlungen</button>
            )}
          </div>
        )}
        <div className="db-karte es-karte">
          {regeln.length === 0 ? <span className="small">Noch keine Regel. Eine Regel schlägt für wiederkehrende Umsätze (Miete, Telefon, Tanken, Bankgebühren) das Konto vor – beim Zuordnen auch über „Als Regel merken“.</span>
            : regeln.map((r) => {
              const n = umsaetze.filter((u) => u.status === "offen" && regelPasst(r, u)).length;
              return (
                <button key={r.id} type="button" className={"es-zeile fi-buchung" + (r.aktiv ? "" : " fi-aus")} onClick={() => onRegel(r)}>
                  <span className="db-punkt-text"><b>{r.bezeichnung}</b>
                    <span className="small">{[r.name_enthaelt && `Name „${r.name_enthaelt}“`, r.zweck_enthaelt && `Zweck „${r.zweck_enthaelt}“`, r.iban && ibanText(r.iban)].filter(Boolean).join(" · ")}
                      {" → "}{kontoNr(r.konto)} {name(r.konto)}{r.steuer ? ` · ${r.steuer}` : ""}{r.kost1 || r.kost2 ? ` · ${[r.kost1, r.kost2].filter(Boolean).join(" · ")}` : ""}{r.aktiv ? "" : " · aus"}</span></span>
                  {n > 0 && <span className="lg-lagerwahl-zahl">{n}</span>}
                </button>
              );
            })}
        </div>
        <span className="small es-fuss fi-fuss">Regeln buchen nichts von selbst: sie füllen das Konto vor, „Nach Regeln buchen“ zeigt vorher die Liste zum Bestätigen. Passen mehrere, gilt die mit den meisten Bedingungen.</span>
      </>}

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
function Kassenbuch({ supabase, heute, buchungen, laedt, kasse, name, transit, darfBuchen, darfKassensturz, onNeu, onMeldung }: {
  supabase: SupabaseClient; heute: string; buchungen: FinBuchung[]; laedt: boolean; kasse: number; name: string; transit: number;
  darfBuchen: boolean; darfKassensturz: boolean; onNeu: (art: "ein" | "aus" | "transit") => void; onMeldung: (t: string) => void;
}) {
  const k = kassenbuch(buchungen, kasse);
  // Geldtransit: zur Bank gebracht, aber noch nicht auf dem Kontoauszug zugeordnet.
  const unterwegs = cent(kontoSaldoBis(buchungen, transit, null));
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
        {unterwegs !== 0 && (
          <div className={"db-karte fi-kachel" + (unterwegs < 0 ? " fi-kachel-warn" : "")}><span className="small">Unterwegs zur Bank ({kontoNr(transit)})</span><b>{formatEUR(unterwegs)}</b>
            <span className="small">{unterwegs > 0 ? "noch nicht auf dem Kontoauszug zugeordnet" : "auf der Bank, aber nicht aus der Kasse gebucht"}</span></div>
        )}
      </div>
      {k.negativAm && (
        <div className="fi-hinweis fi-rot" role="alert">Am {datumKurz(k.negativAm)} läge die Kasse unter null – das kann nicht sein. Fehlt eine Einnahme, der Anfangsbestand oder eine Einlage?</div>
      )}
      {(darfBuchen || darfKassensturz) && (
        <div className="fi-werkzeug">
          {darfBuchen && <button type="button" className="btn-primary fi-knopf" onClick={() => onNeu("ein")}>Einnahme</button>}
          {darfBuchen && <button type="button" className="btn-secondary fi-knopf" onClick={() => onNeu("aus")}>Ausgabe</button>}
          {darfBuchen && <button type="button" className="btn-secondary fi-knopf" onClick={() => onNeu("transit")}>Zur Bank gebracht</button>}
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
        Beim Kassensturz wird das Bargeld gezählt und mit dem Bestand laut Buchungen verglichen. „Zur Bank gebracht“ bucht Geldtransit an Kasse;
        den Eingang auf dem Kontoauszug dann auf {kontoNr(transit)} Geldtransit zuordnen.</span>
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

function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

// „119,00“ für ein Eingabefeld.
function zahlText(n: number): string {
  return cent(n).toFixed(2).replace(".", ",");
}

// Kostenstellen gehören an Erlös-, Aufwands- und Anlagekonten (wie `fin_kost_an_buchung`, Migration 112).
function kostErlaubt(konten: FinKonto[], nr: number | null): boolean {
  const k = nr ? konten.find((x) => x.nummer === nr)?.kategorie : undefined;
  return k === "erloes" || k === "aufwand" || k === "anlage";
}

function umsatzText(n: number): string {
  return n === 1 ? "1 Umsatz" : `${n} Umsätze`;
}

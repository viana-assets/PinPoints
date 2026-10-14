"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { Verb } from "@/lib/constants";
import { qk } from "@/lib/queries/keys";
import { useFinBankumsaetze, useFinBelege, useFinEinstellungen, useFinRechnungen } from "@/lib/queries/hooks";
import { belegZustand } from "@/lib/finance/belege";
import { saveFinEinstellungen } from "@/lib/api/finance";
import { FinanceBuchungen } from "./FinanceBuchungen";
import { FinanceRechnungen } from "./FinanceRechnungen";
import { BelegeOffenePosten, FinanceBelege } from "./FinanceBelege";
import { FinanceBank } from "./FinanceBank";
import { rechnungenZuErledigen } from "@/lib/finance/rechnungen";
import { FINANCE_SEITEN, sichtbareFinanceSeiten, type FinanceSeite, type FinanceSeiteKey } from "@/lib/finance/seiten";
import {
  FIN_BESTEUERUNG, FIN_GEWINNERMITTLUNG, FIN_KONTENRAHMEN, FIN_RECHTSFORMEN, FIN_VERSTEUERUNG, FIN_VORANMELDUNG,
  KLEINUNTERNEHMER_GRENZE_LAUFEND, KLEINUNTERNEHMER_GRENZE_VORJAHR,
  finFeldAktiv, finKurztext, finMaengel, finVorgabe, type FinEinstellungen,
} from "@/lib/finance/einstellungen";
import {
  IconAnlage, IconAuswertung, IconBank, IconBeleg, IconBuchen, IconDashboard, IconExport, IconOffen, IconRechnung,
  IconSettings, IconSteuer,
} from "@/components/icons";

// Finance (v145, Phase F0, docs/finance.md). Alles, was im System „Finance“ im Inhaltsbereich steht:
// Übersicht mit Pilot-Hinweis, die Einstellungen je Wirtschaftsjahr und für jede noch nicht gebaute
// Seite ein Platzhalter, der sagt, was in welcher Phase kommt. Die Navigation dazu baut app/page.tsx
// aus derselben Liste (`FINANCE_SEITEN`).
//
// PILOT, additiv: In FSM ändert sich durch Finance nichts. Die Zahlen hier sind ein Probelauf und
// nicht zur Abgabe gedacht (docs/finance.md, Einleitung und Abschnitt 8).

export const FINANCE_ICONS: Record<FinanceSeiteKey, () => React.JSX.Element> = {
  uebersicht: IconDashboard, rechnungen: IconRechnung, belege: IconBeleg, bank: IconBank, op: IconOffen,
  buchungen: IconBuchen, steuern: IconSteuer, anlagen: IconAnlage, auswertungen: IconAuswertung,
  export: IconExport, einstellungen: IconSettings,
};

export type FinanceAnsicht = FinanceSeiteKey | "mehr";

export function FinanceBereich({ supabase, seite, onSeite, darf, wechselbar, onSystemWahl, onRechnungOeffnen }: {
  supabase: SupabaseClient;
  seite: FinanceAnsicht;
  onSeite: (s: FinanceAnsicht) => void;
  darf: (bereich: string, verb?: Verb) => boolean;
  wechselbar: boolean;
  onSystemWahl: () => void;
  // Öffnet das Rechnungsfenster von FSM für diesen Auftrag (F3) – dieselbe Rechnung, derselbe Nummernkreis.
  onRechnungOeffnen?: (orderId: string) => void;
}) {
  // Einmal beim Öffnen festgehalten (nicht im Rendern gerechnet: react-hooks/purity).
  const [heute] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const jahr = Number(heute.slice(0, 4));
  const einstellungenQuery = useFinEinstellungen(supabase, jahr, true);
  const stand = einstellungenQuery.data;

  const sichtbar = sichtbareFinanceSeiten((r) => darf(r));
  // Eine Seite, die diese Person nicht sehen darf (Link, alter Merker), wird zur Übersicht.
  const aktiv: FinanceAnsicht = seite === "mehr" || sichtbar.some((s) => s.key === seite) ? seite : "uebersicht";
  const eintrag = FINANCE_SEITEN.find((s) => s.key === aktiv);
  // Neue Seite = oben anfangen (sonst bliebe die Lage der vorigen, langen Einstellungsseite stehen).
  const obenRef = useRef<HTMLDivElement>(null);
  useEffect(() => { obenRef.current?.scrollIntoView?.({ block: "start" }); }, [aktiv]);

  return (
    <div className="tabpanel active">
      <div className="es-seite fi-seite" ref={obenRef}>
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>{aktiv === "mehr" ? "Weitere" : eintrag?.label}</h2>
              <span className="small">{aktiv === "mehr" ? "Finance" : `Finance · Wirtschaftsjahr ${jahr}`}</span>
            </div>
          </div>
        </div>

        <div className="fi-hinweis fi-pilot" role="note">
          <b>Pilot</b> · Finance enthält nur Vorgänge mit „Rechnung nötig“. Die Zahlen sind ein Probelauf und nicht zur
          Abgabe gedacht – FSM und die bisherige Buchhaltung laufen unverändert weiter.
        </div>

        {stand?.status === "fehlt" && (
          <div className="fi-hinweis fi-rot" role="alert">
            <b>Migration 87 fehlt.</b> Im Supabase-SQL-Editor <code>87_finance_grundlagen.sql</code> ausführen – bis dahin
            lässt sich nichts speichern.
          </div>
        )}
        {einstellungenQuery.isError && (
          <div className="fi-hinweis fi-rot" role="alert">Die Finance-Einstellungen konnten nicht geladen werden.</div>
        )}

        {aktiv === "uebersicht" && (
          <FinanceUebersicht
            supabase={supabase} jahr={jahr} heute={heute}
            einstellungen={stand?.status === "da" ? stand.einstellungen : null}
            laedt={einstellungenQuery.isPending}
            seiten={sichtbar}
            onSeite={onSeite}
            rechnungenSehen={darf("finance.rechnungen", "lesen")}
            belegeSehen={darf("finance.belege", "lesen")}
            bankSehen={darf("finance.bank", "lesen")}
          />
        )}
        {aktiv === "einstellungen" && (
          <FinanceEinstellungen
            key={jahr}
            supabase={supabase}
            gespeichert={stand?.status === "da" ? stand.einstellungen : null}
            bereit={stand?.status === "da"}
            vorgabe={finVorgabe(jahr, heute)}
            darfAendern={darf("finance.einstellungen", "schreiben")}
          />
        )}
        {aktiv === "mehr" && (
          <FinanceMehr seiten={sichtbar.filter((s) => !s.primaer)} onSeite={onSeite} wechselbar={wechselbar} onSystemWahl={onSystemWahl} />
        )}
        {(aktiv === "rechnungen" || (aktiv === "op" && darf("finance.rechnungen", "lesen"))) && (
          <>
            {aktiv === "op" && <span className="op-gruppe-titel">KUNDEN · WER UNS NOCH ZAHLEN MUSS</span>}
            <FinanceRechnungen supabase={supabase} jahr={jahr} heute={heute} modus={aktiv === "op" ? "op" : "rechnungen"}
              darfSchreiben={darf("finance.rechnungen", "schreiben")}
              onRechnungOeffnen={darf("rechnungen", "lesen") ? onRechnungOeffnen : undefined}
              onEinstellungen={() => onSeite("einstellungen")} />
          </>
        )}
        {aktiv === "op" && darf("finance.belege", "lesen") && (
          <BelegeOffenePosten supabase={supabase} jahr={jahr} heute={heute}
            einstellungen={stand?.status === "da" ? stand.einstellungen : null} darfSchreiben={darf("finance.belege", "schreiben")} />
        )}
        {aktiv === "belege" && (
          <FinanceBelege supabase={supabase} jahr={jahr} heute={heute}
            einstellungen={stand?.status === "da" ? stand.einstellungen : null}
            darfSchreiben={darf("finance.belege", "schreiben")} darfLoeschen={darf("finance.belege", "loeschen")}
            onEinstellungen={() => onSeite("einstellungen")} />
        )}
        {aktiv === "bank" && (
          <FinanceBank supabase={supabase} jahr={jahr} heute={heute}
            einstellungen={stand?.status === "da" ? stand.einstellungen : null}
            darfSchreiben={darf("finance.bank", "schreiben")} darfLoeschen={darf("finance.bank", "loeschen")}
            rechnungenSehen={darf("finance.rechnungen", "lesen")} belegeSehen={darf("finance.belege", "lesen")}
            buchungenSehen={darf("finance.buchen", "lesen")} darfBuchen={darf("finance.buchen", "schreiben")}
            onEinstellungen={() => onSeite("einstellungen")} />
        )}
        {aktiv === "buchungen" && (
          <FinanceBuchungen supabase={supabase} jahr={jahr} heute={heute}
            einstellungen={stand?.status === "da" ? stand.einstellungen : null}
            darfBuchen={darf("finance.buchen", "schreiben")} darfFestschreiben={darf("finance.abschluss", "schreiben")}
            darfKonten={darf("finance.einstellungen", "schreiben")} onEinstellungen={() => onSeite("einstellungen")} />
        )}
        {eintrag && eintrag.phase && <FinancePlatzhalter seite={eintrag} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Übersicht
function FinanceUebersicht({ supabase, jahr, heute, einstellungen, laedt, seiten, onSeite, rechnungenSehen, belegeSehen, bankSehen }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  einstellungen: FinEinstellungen | null;
  laedt: boolean;
  seiten: FinanceSeite[];
  onSeite: (s: FinanceAnsicht) => void;
  rechnungenSehen: boolean;
  belegeSehen: boolean;
  bankSehen: boolean;
}) {
  const kommend = seiten.filter((s) => s.phase);
  const rechnungenQ = useFinRechnungen(supabase, jahr, rechnungenSehen);
  const belegeQ = useFinBelege(supabase, jahr, belegeSehen && !!einstellungen);
  const bankQ = useFinBankumsaetze(supabase, jahr, bankSehen && !!einstellungen);
  const bankOffen = (bankQ.data ?? []).filter((u) => u.status === "offen").length;
  const zu = rechnungenQ.data ? rechnungenZuErledigen(rechnungenQ.data, heute) : null;
  const belege = (belegeQ.data ?? []).map((b) => belegZustand(b, heute));
  const entwuerfe = belege.filter((b) => b.art === "entwurf").length;
  const belegeUeber = belege.filter((b) => b.art === "ueberfaellig").length;
  const punkte = [
    ...(zu ? [
      { n: zu.zuErstellen, text: zu.zuErstellen === 1 ? "Rechnung zu erstellen" : "Rechnungen zu erstellen", seite: "rechnungen" as const },
      { n: zu.nichtGebucht, text: zu.nichtGebucht === 1 ? "Rechnung nicht gebucht" : "Rechnungen nicht gebucht", seite: "rechnungen" as const },
      { n: zu.ueberfaellig, text: zu.ueberfaellig === 1 ? "Rechnung überfällig" : "Rechnungen überfällig", seite: "op" as const },
    ] : []),
    { n: entwuerfe, text: entwuerfe === 1 ? "Beleg im Entwurf" : "Belege im Entwurf", seite: "belege" as const },
    { n: belegeUeber, text: belegeUeber === 1 ? "Lieferantenbeleg überfällig" : "Lieferantenbelege überfällig", seite: "op" as const },
    { n: bankOffen, text: bankOffen === 1 ? "Bankumsatz zuzuordnen" : "Bankumsätze zuzuordnen", seite: "bank" as const },
  ].filter((p) => p.n > 0);
  const laedtZu = (rechnungenSehen && !zu && !rechnungenQ.isError) || (belegeSehen && !!einstellungen && belegeQ.isPending)
    || (bankSehen && !!einstellungen && bankQ.isPending);
  return (
    <>
      {(rechnungenSehen || belegeSehen || bankSehen) && (
        <>
          <span className="op-gruppe-titel">ZU ERLEDIGEN</span>
          <div className="db-karte es-karte">
            {laedtZu ? <span className="small">Lädt …</span>
              : punkte.length === 0 ? <span className="small">Nichts offen.</span>
              : punkte.map((p) => (
                <button key={p.text} type="button" className="es-zeile" onClick={() => onSeite(p.seite)}>
                  <span className="fi-zahl">{p.n}</span>
                  <span className="db-punkt-text"><b>{p.text}</b></span>
                  <span className="fi-pfeil" aria-hidden="true">›</span>
                </button>
              ))}
          </div>
        </>
      )}
      <span className="op-gruppe-titel">EINRICHTUNG</span>
      <div className="db-karte es-karte">
        {laedt ? (
          <span className="small">Lädt …</span>
        ) : einstellungen ? (
          <button type="button" className="es-zeile" onClick={() => onSeite("einstellungen")}>
            <span className="db-punkt-text">
              <b>{finKurztext(einstellungen)}</b>
              <span className="small">Eingerichtet für {einstellungen.wirtschaftsjahr} · gebucht wird ab {datumText(einstellungen.start_datum)}</span>
            </span>
            <span className="fi-pfeil" aria-hidden="true">›</span>
          </button>
        ) : (
          <>
            <div className="es-zeile statisch">
              <span className="db-punkt-text">
                <b>Erst einrichten</b>
                <span className="small">Rechtsform, EÜR oder Bilanz, Kontenrahmen und Umsatzsteuer festlegen, bevor gebucht wird.</span>
              </span>
            </div>
            <button type="button" className="btn-primary fi-knopf" onClick={() => onSeite("einstellungen")}>Einstellungen festlegen</button>
          </>
        )}
      </div>

      {kommend.length > 0 && (
        <>
          <span className="op-gruppe-titel">WAS KOMMT</span>
          <div className="db-karte es-karte">
            {kommend.map((s) => {
              const Icon = FINANCE_ICONS[s.key];
              return (
                <button key={s.key} type="button" className="es-zeile" onClick={() => onSeite(s.key)}>
                  <span className="fi-symbol" aria-hidden="true"><Icon /></span>
                  <span className="db-punkt-text">
                    <b>{s.label}</b>
                    <span className="small">{s.beschreibung}</span>
                  </span>
                  <span className="fi-phase">{s.phase}</span>
                </button>
              );
            })}
          </div>
          <span className="small es-fuss fi-fuss">Fertig: F1 Buchungen, F3 Rechnungen, F2 Belege, offene Posten, F4 Bank & Kasse. Als Nächstes laut Plan: F5 Steuern.</span>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Einstellungen
type Wahl<T extends string> = { wert: T; text: string; hinweis: string };

function WahlGruppe<T extends string>({ titel, liste, wert, aus, gesperrt, onWahl }: {
  titel: string; liste: Wahl<T>[]; wert: T; aus?: boolean; gesperrt: boolean; onWahl: (w: T) => void;
}) {
  return (
    <div className={"fi-feld" + (aus ? " aus" : "")}>
      <span className="fi-label">{titel}</span>
      <div className="fi-wahl" role="radiogroup" aria-label={titel}>
        {liste.map((w) => (
          <button key={w.wert} type="button" role="radio" aria-checked={wert === w.wert}
            className={wert === w.wert ? "aktiv" : ""} disabled={gesperrt || aus} onClick={() => onWahl(w.wert)}>
            {w.text}<small>{w.hinweis}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Schalter({ titel, text, an, aus, gesperrt, onWechsel }: {
  titel: string; text: string; an: boolean; aus?: boolean; gesperrt: boolean; onWechsel: () => void;
}) {
  return (
    <button type="button" className={"es-zeile" + (aus ? " fi-aus" : "")} aria-pressed={an} disabled={gesperrt || aus} onClick={onWechsel}>
      <span className="db-punkt-text"><b>{titel}</b><span className="small">{text}</span></span>
      <span className={"nk-spur" + (an && !aus ? " an" : "")} aria-hidden="true"><span /></span>
    </button>
  );
}

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function FinanceEinstellungen({ supabase, gespeichert, bereit, vorgabe, darfAendern }: {
  supabase: SupabaseClient;
  gespeichert: FinEinstellungen | null;
  // Tabelle da (Migration 87 gelaufen) und geladen.
  bereit: boolean;
  vorgabe: FinEinstellungen;
  darfAendern: boolean;
}) {
  const queryClient = useQueryClient();
  // Entwurf erst ab der ersten Änderung; bis dahin gilt, was gespeichert ist (oder die Vorgabe).
  const [entwurf, setEntwurf] = useState<FinEinstellungen | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; ok: boolean } | null>(null);
  const e = entwurf ?? gespeichert ?? vorgabe;
  const gesperrt = !darfAendern || !bereit || speichert;
  const maengel = finMaengel(e);
  const setze = (p: Partial<FinEinstellungen>) => { setMeldung(null); setEntwurf({ ...e, ...p }); };
  const ku = e.besteuerung === "klein";

  async function speichern() {
    if (maengel.length) return;
    setSpeichert(true);
    setMeldung(null);
    try {
      await saveFinEinstellungen(supabase, e);
      await queryClient.invalidateQueries({ queryKey: qk.finance() });
      setEntwurf(null);
      setMeldung({ text: "Gespeichert.", ok: true });
    } catch {
      // Die Ursache steht in der zentralen Meldung nicht – hier genügt, dass es nicht ging.
      setMeldung({ text: "Speichern hat nicht geklappt. Bitte erneut versuchen.", ok: false });
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <>
      {!darfAendern && (
        <div className="fi-hinweis fi-info">Nur ansehen: Ändern braucht das Recht „Finance › Einstellungen“.</div>
      )}
      {!gespeichert && bereit && (
        <div className="fi-hinweis fi-akzent">Für {e.wirtschaftsjahr} ist noch nichts gespeichert – unten steht die Vorgabe. Mit „Speichern“ festlegen.</div>
      )}

      <span className="op-gruppe-titel">UNTERNEHMEN</span>
      <div className="db-karte es-karte fi-karte">
        <WahlGruppe titel="Rechtsform" liste={FIN_RECHTSFORMEN} wert={e.rechtsform} gesperrt={gesperrt}
          onWahl={(w) => setze(w === "ug" || w === "gmbh" ? { rechtsform: w, gewinnermittlung: "bilanz" } : { rechtsform: w })} />
        <div className="fi-zwei">
          <label className="fi-feld">
            <span className="fi-label">Wirtschaftsjahr beginnt</span>
            <select value={e.wj_beginn_monat} disabled={gesperrt} onChange={(ev) => setze({ wj_beginn_monat: Number(ev.target.value) })}>
              {MONATE.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="fi-feld">
            <span className="fi-label">Gebucht wird ab</span>
            <input type="date" value={e.start_datum} disabled={gesperrt} onChange={(ev) => setze({ start_datum: ev.target.value })} />
          </label>
        </div>
        <span className="small es-fuss">Steuernummer, USt-IdNr. und Anschrift kommen aus Admin › Betrieb (Briefkopf) – nicht doppelt gepflegt. Anfangsbestände werden nachgetragen, sobald sie vorliegen.</span>
      </div>

      <span className="op-gruppe-titel">GEWINNERMITTLUNG</span>
      <div className="db-karte es-karte fi-karte">
        <WahlGruppe titel="Art" liste={FIN_GEWINNERMITTLUNG} wert={e.gewinnermittlung} gesperrt={gesperrt}
          onWahl={(w) => setze({ gewinnermittlung: w })} />
        <span className="small es-fuss">Gebucht wird in beiden Fällen doppelt (Soll an Haben) – ein späterer Wechsel braucht keine Neuerfassung.</span>
      </div>

      <span className="op-gruppe-titel">KONTENRAHMEN</span>
      <div className="db-karte es-karte fi-karte">
        <WahlGruppe titel="Kontenrahmen" liste={FIN_KONTENRAHMEN} wert={e.kontenrahmen} gesperrt={gesperrt}
          onWahl={(w) => setze({ kontenrahmen: w })} />
      </div>

      <span className="op-gruppe-titel">UMSATZSTEUER</span>
      <div className="db-karte es-karte fi-karte">
        <WahlGruppe titel="Besteuerungsform – muss das Unternehmen Umsatzsteuer berechnen?" liste={FIN_BESTEUERUNG} wert={e.besteuerung}
          gesperrt={gesperrt} onWahl={(w) => setze({ besteuerung: w })} />
        {ku && (
          <div className="fi-hinweis fi-warn">
            Kleinunternehmer: Vorjahr höchstens {euro(KLEINUNTERNEHMER_GRENZE_VORJAHR)}, laufendes Jahr höchstens {euro(KLEINUNTERNEHMER_GRENZE_LAUFEND)}.
            Die Felder darunter gelten erst, wenn die Grenze überschritten wird – sie behalten ihren Wert. Rechnungen in FSM
            bleiben im Pilot unverändert.
          </div>
        )}
        <WahlGruppe titel="Versteuerung" liste={FIN_VERSTEUERUNG} wert={e.versteuerung} gesperrt={gesperrt}
          aus={!finFeldAktiv(e, "versteuerung")} onWahl={(w) => setze({ versteuerung: w })} />
        <WahlGruppe titel="Voranmeldungszeitraum" liste={FIN_VORANMELDUNG} wert={e.voranmeldung} gesperrt={gesperrt}
          aus={!finFeldAktiv(e, "voranmeldung")}
          onWahl={(w) => setze(w === "keine" ? { voranmeldung: w, dauerfrist: false } : { voranmeldung: w })} />
        <div className="fi-schalter">
          <Schalter titel="Dauerfristverlängerung" text="Abgabe einen Monat später; bei monatlicher Abgabe mit Sondervorauszahlung (1/11)"
            an={e.dauerfrist} aus={!finFeldAktiv(e, "dauerfrist")} gesperrt={gesperrt} onWechsel={() => setze({ dauerfrist: !e.dauerfrist })} />
          <Schalter titel="§ 13b – Steuerschuldnerschaft des Leistungsempfängers"
            text="Eingangsrechnungen ohne Steuer, z. B. Dienstleistung aus dem EU-Ausland: Steuer selbst schulden, zugleich Vorsteuer (Kleinunternehmer: ohne Vorsteuer)"
            an={e.r13b_empfaenger} gesperrt={gesperrt} onWechsel={() => setze({ r13b_empfaenger: !e.r13b_empfaenger })} />
          <Schalter titel="Innergemeinschaftliche Geschäfte" text="Erwerb und Lieferung mit USt-IdNr., Zusammenfassende Meldung"
            an={e.innergemeinschaftlich} gesperrt={gesperrt} onWechsel={() => setze({ innergemeinschaftlich: !e.innergemeinschaftlich })} />
        </div>
      </div>

      {maengel.length > 0 && (
        <div className="fi-hinweis fi-rot" role="alert">
          {maengel.map((m) => <div key={m}>{m}</div>)}
        </div>
      )}
      <div className="fi-hinweis fi-info">
        Kein Ersatz für den Steuerberater: Die App rechnet und bereitet vor, übermittelt wird über den Steuerberater oder das ELSTER-Portal.
        Die Angaben sind der Stand Oktober 2026 und vor jeder Phase mit dem Steuerberater abzugleichen.
      </div>

      {darfAendern && (
        <div className="fi-aktion">
          {meldung && <span className={"small fi-meldung" + (meldung.ok ? " ok" : " fehler")} role="status">{meldung.text}</span>}
          {entwurf && !speichert && (
            <button type="button" className="btn-secondary" onClick={() => { setEntwurf(null); setMeldung(null); }}>Verwerfen</button>
          )}
          <button type="button" className="btn-primary fi-knopf" disabled={gesperrt || maengel.length > 0 || (!entwurf && !!gespeichert)}
            onClick={() => void speichern()}>
            {speichert ? "Speichert …" : "Speichern"}
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Platzhalter und „Weitere“
function FinancePlatzhalter({ seite }: { seite: FinanceSeite }) {
  const Icon = FINANCE_ICONS[seite.key];
  return (
    <div className="db-karte es-karte fi-platzhalter">
      <span className="fi-symbol gross" aria-hidden="true"><Icon /></span>
      <b>Kommt mit Phase {seite.phase}</b>
      <span className="small">{seite.beschreibung}.</span>
      <span className="small">Bis dahin ist hier nichts zu tun. Der Plan steht in docs/finance.md, Abschnitt 7.</span>
    </div>
  );
}

function FinanceMehr({ seiten, onSeite, wechselbar, onSystemWahl }: {
  seiten: FinanceSeite[];
  onSeite: (s: FinanceAnsicht) => void;
  wechselbar: boolean;
  onSystemWahl: () => void;
}) {
  return (
    <div className="db-karte es-karte">
      {seiten.map((s) => {
        const Icon = FINANCE_ICONS[s.key];
        return (
          <button key={s.key} type="button" className="es-zeile" onClick={() => onSeite(s.key)}>
            <span className="fi-symbol" aria-hidden="true"><Icon /></span>
            <span className="db-punkt-text"><b>{s.label}</b><span className="small">{s.beschreibung}</span></span>
            {s.phase && <span className="fi-phase">{s.phase}</span>}
          </button>
        );
      })}
      {wechselbar && (
        <button type="button" className="es-zeile" onClick={onSystemWahl}>
          <span className="fi-symbol" aria-hidden="true">⇆</span>
          <span className="db-punkt-text"><b>System wechseln</b><span className="small">zurück zu FSM</span></span>
        </button>
      )}
    </div>
  );
}

function datumText(iso: string): string {
  const [j, m, t] = iso.split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

function euro(n: number): string {
  return n.toLocaleString("de-DE") + " €";
}

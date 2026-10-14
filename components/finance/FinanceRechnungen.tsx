"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinMahnungen, useFinRechnungen } from "@/lib/queries/hooks";
import { finRechnungBezahlt, finRechnungNachbuchen, finZahlungZuruecknehmen } from "@/lib/api/finance";
import {
  rechnungRest,  offenePosten, rechnungZustand, vorgaengeTeilen, zustandText,
  type FinRechnungZeile, type FinVorgang, type RechnungZustand,
} from "@/lib/finance/rechnungen";
import { formatEUR } from "@/lib/format";
import { SkontoAbschnitt } from "./FinanceSkonto";
import { MahnAbschnitt } from "./FinanceMahnung";
import { FIN_MAHNSTUFEN, aktiveMahnungen, type FinMahnung } from "@/lib/finance/mahnung";

// Finance › Rechnungen und › Offene Posten (Phase F3, Migration 89, v147).
//
// Die Rechnung selbst entsteht wie immer in FSM (RechnungModal, ein Nummernkreis). „Rechnung erstellen“
// öffnet genau dieses Fenster (`onRechnungOeffnen`, app/page.tsx); beim Ausstellen bucht die Datenbank
// sie, wenn der Auftrag „Rechnung nötig“ trägt. Scheitert die Buchung, ist die Rechnung trotzdem da –
// hier steht dann „nicht gebucht“ mit dem Grund und „Jetzt buchen“.

type Reiter = "erstellen" | "vorgemerkt" | "ausgestellt";

export function FinanceRechnungen({ supabase, jahr, heute, modus, darfSchreiben, onRechnungOeffnen, onEinstellungen }: {
  supabase: SupabaseClient;
  jahr: number;
  heute: string;
  modus: "rechnungen" | "op";
  darfSchreiben: boolean;
  onRechnungOeffnen?: (orderId: string) => void;
  onEinstellungen: () => void;
}) {
  const q = useFinRechnungen(supabase, jahr, true);
  const mahnQ = useFinMahnungen(supabase, true);
  const [reiter, setReiter] = useState<Reiter>("erstellen");
  const [detail, setDetail] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const stand = q.data ?? { vorgaenge: [], rechnungen: [], anderswo: [] };
  const { zuErstellen, vorgemerkt } = vorgaengeTeilen(stand.vorgaenge);
  const offen = offenePosten(stand.rechnungen, heute);
  const gewaehlt = stand.rechnungen.find((r) => r.rechnung_id === detail) ?? null;

  if (q.isError) {
    return <div className="fi-hinweis fi-rot" role="alert">Die Rechnungen konnten nicht geladen werden. Ist Migration 89 ausgeführt?</div>;
  }

  return (
    <>
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      {modus === "rechnungen" ? (
        <>
          <div className="lg-lagerwahl es-segment fi-reiter fi-reiter-breit" role="tablist" aria-label="Rechnungen">
            {([["erstellen", "Zu erstellen", zuErstellen.length], ["vorgemerkt", "Vorgemerkt", vorgemerkt.length], ["ausgestellt", "Ausgestellt", stand.rechnungen.length]] as const).map(([k, t, n]) => (
              <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>
                {t}<span className="lg-lagerwahl-zahl">{n}</span>
              </button>
            ))}
          </div>
          {reiter === "erstellen" && (
            <VorgangListe liste={zuErstellen} laedt={q.isPending} leer="Nichts zu tun – zu jedem erledigten Auftrag mit „Rechnung nötig“ gibt es eine Rechnung."
              knopf={onRechnungOeffnen ? (v) => (
                <button type="button" className="es-knopf fi-primaer" onClick={() => onRechnungOeffnen(v.order_id)}>Rechnung erstellen</button>
              ) : undefined} />
          )}
          {reiter === "vorgemerkt" && (
            <VorgangListe liste={vorgemerkt} laedt={q.isPending} leer="Kein laufender Auftrag mit „Rechnung nötig“." />
          )}
          {reiter === "ausgestellt" && (
            <>
              <RechnungListe liste={stand.rechnungen} heute={heute} laedt={q.isPending} mahnungen={mahnQ.data} onOeffnen={setDetail}
                leer={`Noch keine Rechnung ${jahr} zu einem Auftrag mit „Rechnung nötig“.`} />
              {stand.anderswo.length > 0 && (
                <div className="fi-hinweis fi-info">
                  {stand.anderswo.length === 1 ? "1 Auftrag" : `${stand.anderswo.length} Aufträge`} mit „Rechnung nötig“ wurden anderswo abgerechnet
                  ({stand.anderswo.map((a) => a.order_number).join(", ")}) – die stehen nicht in Finance.
                </div>
              )}
            </>
          )}
          <span className="small es-fuss fi-fuss">Nur Aufträge mit „Rechnung nötig“. Die Rechnung entsteht wie immer in FSM; beim Ausstellen bucht Finance Forderung an Erlöse und Umsatzsteuer, fällig nach 14 Tagen.</span>
        </>
      ) : (
        <>
          <div className="fi-kacheln">
            <div className="db-karte fi-kachel"><span className="small">Offen</span><b>{formatEUR(offen.summe)}</b><span className="small">{anzahl(offen.posten.length)}</span></div>
            <div className={"db-karte fi-kachel" + (offen.ueberfaellig > 0 ? " fi-kachel-warn" : "")}><span className="small">Davon überfällig</span><b>{formatEUR(offen.ueberfaellig)}</b>
              <span className="small">{anzahl(offen.posten.filter((p) => p.zustand.art === "ueberfaellig").length)}</span></div>
          </div>
          <RechnungListe liste={offen.posten} heute={heute} laedt={q.isPending} mahnungen={mahnQ.data} onOeffnen={setDetail} leer="Keine offenen Posten – alles bezahlt." />
          <span className="small es-fuss fi-fuss">Aus den Rechnungen mit „Rechnung nötig“, fällig nach 14 Tagen.</span>
        </>
      )}

      {gewaehlt && (
        <RechnungDetail supabase={supabase} r={gewaehlt} heute={heute} darfSchreiben={darfSchreiben}
          onRechnungOeffnen={onRechnungOeffnen} onEinstellungen={onEinstellungen}
          onFertig={(t) => { setDetail(null); setMeldung(t); }} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

function VorgangListe({ liste, laedt, leer, knopf }: { liste: FinVorgang[]; laedt: boolean; leer: string; knopf?: (v: FinVorgang) => React.ReactNode }) {
  return (
    <div className="db-karte es-karte">
      {laedt ? <span className="small">Lädt …</span> : liste.length === 0 ? <span className="small">{leer}</span> : liste.map((v) => (
        <div key={v.order_id} className="es-zeile statisch fi-buchung fi-vorgang">
          <span className="fi-nr">{v.order_number}</span>
          <span className="db-punkt-text">
            <b>{v.kunde}</b>
            <span className="small">{datumKurz(v.datum)}{v.zeit ? ` · ${v.zeit.slice(0, 5)} Uhr` : ""} · {v.status === "erledigt" ? "erledigt" : v.status === "in_arbeit" ? "in Arbeit" : "offen"}{v.kundennummer ? ` · Kd. ${v.kundennummer}` : ""}</span>
          </span>
          <span className="fi-betrag fi-schaetzung" title="Schätzung aus den Leistungen">{v.betrag > 0 ? `ca. ${formatEUR(v.betrag)}` : "–"}</span>
          {knopf?.(v)}
        </div>
      ))}
    </div>
  );
}

function zustandKlasse(z: RechnungZustand): string {
  return z.art === "ueberfaellig" || z.art === "nicht_gebucht" ? " fi-rot-text" : z.art === "bezahlt" ? " fi-gruen-text" : "";
}

function RechnungListe({ liste, heute, laedt, leer, mahnungen = [], onOeffnen }: { liste: FinRechnungZeile[]; heute: string; laedt: boolean; leer: string; mahnungen?: FinMahnung[]; onOeffnen: (id: string) => void }) {
  return (
    <div className="db-karte es-karte">
      {laedt ? <span className="small">Lädt …</span> : liste.length === 0 ? <span className="small">{leer}</span> : liste.map((r) => {
        const z = rechnungZustand(r, heute);
        return (
          <button key={r.rechnung_id} type="button" className={"es-zeile fi-buchung" + (z.art === "storniert" ? " fi-gestrichen" : "")} onClick={() => onOeffnen(r.rechnung_id)}>
            <span className="fi-nr fi-nr-breit">{r.nummer_text}</span>
            <span className="db-punkt-text">
              <b>{r.kunde}</b>
              <span className="small">{datumKurz(r.datum)}{r.order_number ? ` · Auftrag ${r.order_number}` : ""} · <span className={zustandKlasse(z)}>{zustandText(z)}</span>
                {(() => { const m = aktiveMahnungen(mahnungen, r.rechnung_id); const l = m[m.length - 1]; return l && z.art !== "bezahlt" ? ` · ${FIN_MAHNSTUFEN[l.stufe - 1].titel} ${datumKurz(l.datum)}` : ""; })()}</span>
            </span>
            <span className="fi-betrag">{formatEUR((z.art === "offen" || z.art === "ueberfaellig") && z.teil > 0 ? rechnungRest(r) : r.brutto)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RechnungDetail({ supabase, r, heute, darfSchreiben, onRechnungOeffnen, onEinstellungen, onFertig, onClose }: {
  supabase: SupabaseClient; r: FinRechnungZeile; heute: string; darfSchreiben: boolean;
  onRechnungOeffnen?: (orderId: string) => void; onEinstellungen: () => void;
  onFertig: (meldung: string) => void; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const z = rechnungZustand(r, heute);
  const [zahlung, setZahlung] = useState<"bar" | "bank" | null>(null);
  const [datum, setDatum] = useState(heute);
  const [zurueck, setZurueck] = useState(false);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

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
  const buchen = () => ausfuehren(async () => { await finRechnungNachbuchen(supabase, r.rechnung_id); return `${r.nummer_text} ist gebucht.`; });
  const bezahlt = () => zahlung && ausfuehren(async () => {
    const x = await finRechnungBezahlt(supabase, r.rechnung_id, zahlung, datum);
    return `${r.nummer_text}: Zahlung erfasst (Buchung Nr. ${x.nr}).`;
  });
  const zuruecknehmen = () => ausfuehren(async () => { await finZahlungZuruecknehmen(supabase, r.rechnung_id, grund.trim()); return `${r.nummer_text}: Zahlung zurückgenommen.`; });
  const einstellungenFehlen = z.art === "nicht_gebucht" && /Einstellungen/.test(z.grund ?? "");

  let fuss: React.ReactNode = undefined;
  if (darfSchreiben && z.art === "nicht_gebucht") {
    fuss = <button type="button" className="btn-primary" disabled={laeuft} onClick={() => void buchen()}>{laeuft ? "bucht …" : "Jetzt buchen"}</button>;
  } else if (darfSchreiben && (z.art === "offen" || z.art === "ueberfaellig")) {
    fuss = zahlung ? <>
      <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setZahlung(null)}>Zurück</button>
      <button type="button" className="btn-primary" disabled={laeuft || !datum || datum > heute} onClick={() => void bezahlt()}>{laeuft ? "erfasst …" : "Zahlung buchen"}</button>
    </> : <>
      <button type="button" className="btn-secondary" onClick={() => setZahlung("bar")}>{z.teil > 0 ? "Rest bar bezahlt" : "Bar bezahlt"}</button>
      <button type="button" className="btn-primary" onClick={() => setZahlung("bank")}>{z.teil > 0 ? "Rest überwiesen" : "Überweisung eingegangen"}</button>
    </>;
  } else if (darfSchreiben && (z.art === "bezahlt" || (z.art === "storniert" && z.bezahlt))) {
    fuss = zurueck ? <>
      <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setZurueck(false)}>Zurück</button>
      <button type="button" className="btn-danger" disabled={laeuft || !grund.trim()} onClick={() => void zuruecknehmen()}>{laeuft ? "nimmt zurück …" : "Zahlung zurücknehmen"}</button>
    </> : <button type="button" className="btn-secondary" onClick={() => setZurueck(true)}>Zahlung zurücknehmen …</button>;
  }

  return (
    <Blatt titel={r.nummer_text} unter={`${datumKurz(r.datum)} · ${formatEUR(r.brutto)}`} breite="mittel" onClose={onClose} fuss={fuss}>
      <div className="fi-formular">
        <div className="db-punkt-text">
          <b>{r.kunde}</b>
          <span className="small">{r.order_number ? `Auftrag ${r.order_number} · ` : ""}<span className={zustandKlasse(z)}>{zustandText(z)}</span>
            {r.buchung_nr ? ` · Buchung Nr. ${r.buchung_nr}` : ""}{r.storno_nummer ? ` · Storno ${r.storno_nummer}` : ""}</span>
        </div>
        {z.art === "nicht_gebucht" && (
          <div className="fi-hinweis fi-warn">
            {z.grund ?? "Finance hat diese Rechnung noch nicht gebucht – ihr Auftrag bekam „Rechnung nötig“ wohl erst danach."}
            {einstellungenFehlen && <> <button type="button" className="es-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button></>}
          </div>
        )}
        {(z.art === "offen" || z.art === "ueberfaellig") && <span className="small">Fällig am {datumKurz(z.faellig)}.</span>}
        {z.art === "bezahlt" && <span className="small">{z.wie === "bar" ? "Bar bezahlt" : z.wie === "skonto" ? "Mit Skonto ausgeglichen" : "Überwiesen"} am {datumKurz(z.am)}.</span>}
        {zahlung && (
          <label className="nk-feld"><span>{zahlung === "bar" ? "Bar bezahlt am" : "Eingegangen am"}</span>
            <input type="date" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} />
          </label>
        )}
        {zahlung && <span className="small">Gebucht wird {zahlung === "bar" ? "Kasse" : "Bank"} an Forderung über den offenen Rest ({formatEUR(rechnungRest(r))}).</span>}
        {(z.art === "offen" || z.art === "ueberfaellig") && z.teil > 0 && !zahlung && (
          <span className="small">Teilzahlungen aus dem Bankabgleich: {formatEUR(z.teil)} – offen {formatEUR(rechnungRest(r))}. Zurückgenommen wird eine Teilzahlung unter Bank & Kasse (Aufheben).</span>
        )}
        {zurueck && (
          <label className="nk-feld"><span>Grund</span><input value={grund} maxLength={200} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. doch nicht bezahlt" autoFocus /></label>
        )}
        {!zahlung && !zurueck && (z.art === "offen" || z.art === "ueberfaellig" || z.art === "bezahlt") && (
          <MahnAbschnitt supabase={supabase} r={r} heute={heute} darfSchreiben={darfSchreiben} onFertig={onFertig} />
        )}
        {!zahlung && !zurueck && (z.art === "offen" || z.art === "ueberfaellig" || z.art === "bezahlt") && (
          <SkontoAbschnitt supabase={supabase} art="rechnung" ziel={r.rechnung_id} brutto={Number(r.brutto)} rest={rechnungRest(r)} datumAb={r.datum} heute={heute}
            offen={z.art !== "bezahlt"} darfSchreiben={darfSchreiben} onFertig={onFertig} />
        )}
        {r.order_id && onRechnungOeffnen && (
          <button type="button" className="es-knopf fi-links" onClick={() => onRechnungOeffnen(r.order_id as string)}>Rechnung ansehen</button>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

function anzahl(n: number): string {
  return n === 1 ? "1 Rechnung" : `${n} Rechnungen`;
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

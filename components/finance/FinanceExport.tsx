"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useBetrieb, useFinEinstellungen, useFinExportProtokolle, useFinFestschreibungen, useFinKonten, useFinPersonenkonten, useFinSteuerschluessel } from "@/lib/queries/hooks";
import { fetchFinExportBelege, fetchFinExportJournal, finExportProtokollieren } from "@/lib/api/finance";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { exportGeaendert, exportZeitraeume, finDatevStapel, gobdDateien, verfahrensdokumentation, zipDateien } from "@/lib/finance/export";
import { windows1252 } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { personenCsv } from "@/lib/finance/personen";
import type { FinanceAnsicht } from "./FinanceBereich";

// Finance › Export (Phase F9, Migration 97, v155): DATEV-Buchungsstapel des Journals, GoBD-Datenexport für die
// Betriebsprüfung, Vorlage der Verfahrensdokumentation – für einen Zeitraum des laufenden Jahres oder des Vorjahres.
// Jeder Export wird protokolliert; die Liste darunter meldet, wenn sich der Zeitraum seitdem geändert hat.

export function FinanceExport({ supabase, jahr, heute, onSeite }: {
  supabase: SupabaseClient; jahr: number; heute: string; onSeite: (s: FinanceAnsicht) => void;
}) {
  const vorQ = useFinEinstellungen(supabase, jahr - 1, true);
  const jetztQ = useFinEinstellungen(supabase, jahr, true);
  const vor = vorQ.data?.status === "da" ? vorQ.data.einstellungen : null;
  const jetzt = jetztQ.data?.status === "da" ? jetztQ.data.einstellungen : null;
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const j = gewaehlt ?? (vor && Number(heute.slice(5, 7)) <= 3 ? jahr - 1 : jahr);
  const e = j === jahr ? jetzt : vor;
  if (vorQ.isPending || jetztQ.isPending) return <div className="db-karte es-karte"><span className="small">Lädt …</span></div>;
  return (
    <>
      {vor && (
        <div className="lg-lagerwahl es-segment fi-reiter" role="group" aria-label="Jahr">
          {[jahr - 1, jahr].map((x) => <button key={x} type="button" className={j === x ? "aktiv" : ""} aria-pressed={j === x} onClick={() => setGewaehlt(x)}>{x}</button>)}
        </div>
      )}
      {!e ? (
        <div className="db-karte es-karte">
          <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {j} speichern</b>
            <span className="small">Der Kontenrahmen bestimmt den Export.</span></span></div>
          <button type="button" className="btn-primary fi-knopf" onClick={() => onSeite("einstellungen")}>Zu den Einstellungen</button>
        </div>
      ) : <ExportJahr key={j} supabase={supabase} jahr={j} heute={heute} e={e} />}
    </>
  );
}

function ExportJahr({ supabase, jahr, heute, e }: { supabase: SupabaseClient; jahr: number; heute: string; e: FinEinstellungen }) {
  const queryClient = useQueryClient();
  const zeitraeume = exportZeitraeume(jahr);
  // Vorschlag: der letzte abgeschlossene Monat, im Vorjahr das ganze Jahr.
  const vormonat = heute.slice(0, 4) === String(jahr) ? Math.max(1, Number(heute.slice(5, 7)) - 1) : null;
  const [key, setKey] = useState(vormonat ? `m${vormonat}` : "jahr");
  const z = zeitraeume.find((x) => x.key === key) ?? zeitraeume[0];
  const [ohneVortrag, setOhneVortrag] = useState(true);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const betriebQ = useBetrieb(supabase, true);
  const kontenQ = useFinKonten(supabase, e.kontenrahmen, true);
  const schlQ = useFinSteuerschluessel(supabase, e.kontenrahmen, true);
  const festQ = useFinFestschreibungen(supabase, jahr, true);
  const protQ = useFinExportProtokolle(supabase, jahr, true);
  // Personenkonten (Migration 110, v184) für die Liste an die Kanzlei.
  const personenQ = useFinPersonenkonten(supabase, jahr, true);
  const personen = personenQ.data ?? [];
  const journalQ = useQuery({ queryKey: qk.finExportJournal(z.von, z.bis), queryFn: () => fetchFinExportJournal(supabase, z.von, z.bis), staleTime: 30_000 });
  const betrieb = betriebQ.data ?? null;
  const journal = journalQ.data ?? [];
  const konten = kontenQ.data ?? [];
  const schluessel = schlQ.data ?? [];
  const bereit = journalQ.isSuccess && kontenQ.isSuccess && schlQ.isSuccess && betriebQ.isSuccess;
  const stapel = bereit ? finDatevStapel(journal, konten, schluessel, { rahmen: e.kontenrahmen, betrieb, von: z.von, bis: z.bis, ohneVortrag, erzeugtAm: new Date(0) }) : null;
  const monate = Array.from({ length: Number(z.bis.slice(5, 7)) - Number(z.von.slice(5, 7)) + 1 }, (_, i) => Number(z.von.slice(5, 7)) + i);
  const offen = monate.filter((m) => !(festQ.data ?? []).some((f) => f.monat === m));

  async function tun(was: string, f: () => Promise<string>) {
    setLaeuft(was);
    setFehler(null);
    try {
      setMeldung(await f());
      await queryClient.invalidateQueries({ queryKey: qk.finExporte(jahr) });
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(null);
    }
  }

  const datev = () => tun("datev", async () => {
    const d = finDatevStapel(journal, konten, schluessel, { rahmen: e.kontenrahmen, betrieb, von: z.von, bis: z.bis, ohneVortrag, erzeugtAm: new Date() });
    dateiHerunterladen(d.dateiname, windows1252(d.inhalt) as BlobPart, "text/csv;charset=windows-1252");
    await finExportProtokollieren(supabase, "datev", z.von, z.bis);
    return `${d.dateiname} gespeichert – ${d.saetze === 1 ? "1 Satz" : `${d.saetze} Sätze`} aus ${d.buchungen === 1 ? "1 Buchung" : `${d.buchungen} Buchungen`}.`;
  });
  const gobd = () => tun("gobd", async () => {
    const belege = await fetchFinExportBelege(supabase, z.von, z.bis);
    const jetzt = new Date();
    const dateien = gobdDateien(journal, konten, schluessel, belege, { firma: betrieb?.firma || "Unternehmen", ort: betrieb?.ort || "", von: z.von, bis: z.bis, erzeugtAm: jetzt });
    const name = `GoBD_Finance_${z.von}_${z.bis}.zip`;
    dateiHerunterladen(name, zipDateien(dateien, jetzt) as BlobPart, "application/zip");
    await finExportProtokollieren(supabase, "gobd", z.von, z.bis);
    return `${name} gespeichert – ${journal.length} Buchungen, ${belege.length} Belege.`;
  });
  const doku = () => {
    dateiHerunterladen(`Verfahrensdokumentation_Vorlage_${jahr}.html`, verfahrensdokumentation(betrieb, e, `${heute.slice(8, 10)}.${heute.slice(5, 7)}.${heute.slice(0, 4)}`), "text/html;charset=utf-8");
    setMeldung("Vorlage gespeichert – im Browser öffnen, ergänzen und als PDF drucken.");
  };

  return (
    <>
      {journalQ.isError && <div className="fi-hinweis fi-rot" role="alert">Das Journal konnte nicht geladen werden. Ist Migration 97 ausgeführt?</div>}
      {meldung && <div className="fi-hinweis fi-ok" role="status">{meldung}</div>}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      <div className="fi-werkzeug">
        <select className="fi-monat" value={key} onChange={(ev) => { setKey(ev.target.value); setMeldung(null); }} aria-label="Zeitraum">
          {zeitraeume.filter((x) => x.von <= heute).map((x) => <option key={x.key} value={x.key}>{x.text}</option>)}
        </select>
        <span className="small">{journalQ.isPending ? "lädt …" : `${journal.length === 1 ? "1 Buchung" : `${journal.length} Buchungen`} im Zeitraum`}
          {offen.length > 0 && journal.length > 0 ? ` · ${offen.length === monate.length ? "nicht" : `${monate.length - offen.length} von ${monate.length} Monaten`} festgeschrieben` : ""}</span>
      </div>

      <span className="op-gruppe-titel">DATEV-BUCHUNGSSTAPEL</span>
      <div className="db-karte es-karte">
        <span className="small">Das ganze Journal des Zeitraums für die Kanzlei: Bruttobeträge, die Steuer über Automatikkonten oder BU-Schlüssel, Rechnungen,
          Zahlungen und Belege auf den Personenkonten (Debitor bzw. Kreditor, seit Migration 110), Belegnummer und Finance-Nummer je Satz. Nicht festgeschrieben –
          die Kanzlei prüft vor dem Festschreiben.</span>
        {stapel && stapel.fehler.length > 0 && <div className="fi-hinweis fi-rot" role="alert">{stapel.fehler.map((f) => <div key={f}>{f}</div>)}</div>}
        <button type="button" className="es-zeile" aria-pressed={ohneVortrag} onClick={() => setOhneVortrag(!ohneVortrag)}>
          <span className="db-punkt-text"><b>Saldenvorträge weglassen</b><span className="small">Buchungen mit Konto 9000 – den Vortrag macht die Kanzlei meist selbst</span></span>
          <span className={"nk-spur" + (ohneVortrag ? " an" : "")} aria-hidden="true"><span /></span>
        </button>
        {stapel && stapel.hinweise.length > 0 && (
          <div className="fi-hinweis fi-warn">{stapel.hinweise.slice(0, 5).map((h) => <div key={h}>{h}</div>)}
            {stapel.hinweise.length > 5 && <div>… und {stapel.hinweise.length - 5} weitere.</div>}</div>
        )}
        <div className="fi-hinweis fi-info">{e.rechnungen_umfang === "alle"
          ? <>Rechnungen nicht zusätzlich aus FSM › Auswertungen als DATEV-Datei einlesen – alle Rechnungen aus FSM sind hier schon enthalten.</>
          : <>Rechnungen nicht zusätzlich aus FSM › Auswertungen als DATEV-Datei einlesen – die mit „Rechnung nötig“ sind hier schon enthalten.
            Im Pilot enthält Finance nur diese; alles andere bucht die Kanzlei wie bisher.</>}</div>
        <div className="fi-aktion">
          <button type="button" className="btn-primary" disabled={!stapel || stapel.fehler.length > 0 || stapel.saetze === 0 || !!laeuft} onClick={() => void datev()}>
            {laeuft === "datev" ? "…" : stapel ? `DATEV-Datei (${stapel.saetze === 1 ? "1 Satz" : `${stapel.saetze} Sätze`})` : "DATEV-Datei"}</button>
        </div>
      </div>

      <span className="op-gruppe-titel">PERSONENKONTEN</span>
      <div className="db-karte es-karte">
        <span className="small">Debitoren und Kreditoren mit Name, Kundennummer und Anschrift als CSV – damit legt die Kanzlei die Personenkonten an, bevor sie den
          Buchungsstapel einliest. {personenQ.isError ? "Fehlt noch: Migration 110." : personen.length === 1 ? "1 Konto." : `${personen.length} Konten.`}</span>
        <div className="fi-aktion">
          <button type="button" className="btn-secondary" disabled={!personen.length}
            onClick={() => dateiHerunterladen(`personenkonten_${jahr}.csv`, personenCsv(personen), "text/csv;charset=utf-8")}>Liste herunterladen</button>
        </div>
      </div>

      <span className="op-gruppe-titel">GOBD-DATENEXPORT</span>
      <div className="db-karte es-karte">
        <span className="small">Für die Betriebsprüfung (Datenträgerüberlassung): Buchungen, Buchungszeilen, Konten, Steuerschlüssel und Belegliste als CSV mit
          Beschreibung (index.xml nach dem Beschreibungsstandard), als ZIP. Die Belegdateien selbst bleiben in Finance › Belege.</span>
        <div className="fi-aktion">
          <button type="button" className="btn-secondary" disabled={!bereit || !!laeuft} onClick={() => void gobd()}>{laeuft === "gobd" ? "…" : "ZIP herunterladen"}</button>
        </div>
      </div>

      <span className="op-gruppe-titel">VERFAHRENSDOKUMENTATION</span>
      <div className="db-karte es-karte">
        <span className="small">Vorlage mit den Einstellungen von {jahr}: wie Rechnungen, Belege, Bank, Kasse, Festschreibung, Sicherung und Rechte geregelt sind.
          Was nur der Betrieb wissen kann, steht in eckigen Klammern – ergänzen und mit der Kanzlei abstimmen.</span>
        <div className="fi-aktion">
          <button type="button" className="btn-secondary" disabled={!betriebQ.isSuccess} onClick={doku}>Vorlage herunterladen</button>
        </div>
      </div>

      <span className="op-gruppe-titel">BISHERIGE EXPORTE {jahr}</span>
      <div className="db-karte es-karte">
        {(protQ.data ?? []).length === 0 ? <span className="small">Noch keiner.</span> : (protQ.data ?? []).map((p) => {
          const geaendert = exportGeaendert(p);
          return (
            <div key={p.id} className="es-zeile statisch fi-buchung">
              <span className="db-punkt-text"><b>{p.art === "datev" ? "DATEV" : "GoBD"} · {zeitText(p.von, p.bis)}</b>
                <span className="small">{new Date(p.erstellt_am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · {p.buchungen} Buchungen
                  {geaendert ? ` · seitdem geändert (jetzt ${p.jetzt.buchungen})` : " · unverändert"}</span></span>
              {geaendert && <span className="fi-rot-text">neu exportieren</span>}
            </div>
          );
        })}
      </div>
      <span className="small es-fuss fi-fuss">Die erste DATEV-Datei vor dem regelmäßigen Einsatz probeweise in der Kanzlei einlesen lassen. Sachkontenlänge, Berater-
        und Mandantennummer stehen unter Admin › Betrieb › DATEV.</span>
    </>
  );
}

function zeitText(von: string, bis: string): string {
  const d = (x: string) => `${x.slice(8, 10)}.${x.slice(5, 7)}.`;
  return `${d(von)}–${d(bis)}${bis.slice(0, 4)}`;
}

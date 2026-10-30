"use client";
import { useMemo, useRef, useState } from "react";
import { DatenTabelle, SpaltenWahl, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { KontoFeld } from "./arbeitsplatz/KontoFeld";
import { useKurzbefehle } from "./arbeitsplatz/Werkzeuge";
import { FIN_KOST_ARTEN, buchungKost, kostAuswahl, kostText, type FinKostenstelle } from "@/lib/finance/kostenstellen";
import { ZeilenTabelle } from "./FinanceBuchungen";
import { dateiHerunterladen } from "@/lib/download";
import { betragLesen, kontoNr, type FinBuchung, type FinFestschreibung, type FinKonto, type FinSteuerschluessel } from "@/lib/finance/buchung";
import {
  BUCHUNG_QUELLE_TEXT, FIN_KURZBEFEHLE, JOURNAL_FILTER_LEER, JOURNAL_ZUSTAENDE, betragText, datumDe, filterAnzahl, journalFiltern,
  journalZeilen, saldoText, saldoVorNach, sortiere, tabellenCsv,
  type JournalFilter, type JournalZeile, type JournalZustand, type Sortierung,
} from "@/lib/finance/arbeitsplatz";

// Finance › Buchungen › Journal am Rechner (v178, Stufe A des Ausbaus, docs/finance.md Abschnitt 10): Filterleiste
// oben, die Buchungen als dichte Tabelle in der Mitte, rechts immer die gewählte Buchung mit Soll und Haben und dem
// Saldo des Kontos vor und nach ihr, unten die Statuszeile. Tastatur: ↑ ↓ wählen, Leertaste markiert, Enter öffnet
// (Storno), F2 Suche, F3 Kontoblatt zum Konto der Zeile (seit v179; vorher: nur dieses Konto), N Schnellbuchung. Am Handy bleibt die Kartenliste
// (FinanceBuchungen.tsx, `Journal`).
//
// Entwurf: Claude outputs/Mockup_Finance_StufeA_v1.html. Kostenstellen (Transporter, Leistung) kommen als Spalten
// dazu, sobald es sie gibt (Stufe C/D, eigene Migration).

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ZUSTAND_TEXT = Object.fromEntries(JOURNAL_ZUSTAENDE.map((z) => [z.wert, z.text])) as Record<JournalZustand, string>;

export function FinanceJournalArbeitsplatz({ buchungen, konten, schluessel, fest, jahr, laedt, darfBuchen, onNeu, onOeffnen, onKontoblatt, kostenstellen = [] }: {
  buchungen: FinBuchung[];
  konten: FinKonto[];
  schluessel: FinSteuerschluessel[];
  fest: FinFestschreibung[];
  jahr: number;
  laedt: boolean;
  darfBuchen: boolean;
  onNeu: () => void;
  // Öffnet die Buchung im Fenster (dort: Storno).
  onOeffnen: (b: FinBuchung) => void;
  // Öffnet das Kontoblatt (v179, Stufe B); ohne diesen Weg filtert F3 das Journal auf das Konto.
  onKontoblatt?: (konto: number) => void;
  // Kostenstellen (Migration 108, v182): Spalten Transporter und Leistung, Filter.
  kostenstellen?: FinKostenstelle[];
}) {
  const [filter, setFilter] = useState<JournalFilter>(JOURNAL_FILTER_LEER);
  // Neu gezählt bei „Filter zurücksetzen“ und „nur dieses Konto“: Das Kontofeld hält seinen Text selbst und fängt dann neu an.
  const [filterNr, setFilterNr] = useState(0);
  const [betragVon, setBetragVon] = useState("");
  const [betragBis, setBetragBis] = useState("");
  const [sortierung, setSortierung] = useState<Sortierung>({ spalte: "datum", richtung: "auf" });
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const [aus, setAus] = useState<Set<string>>(() => new Set());
  const sucheRef = useRef<HTMLInputElement>(null);

  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const kontoZelle = (n: number | null) => n == null ? "" : <span title={name(n)}>{kontoNr(n)}</span>;
  const alleSpalten: Spalte<JournalZeile>[] = [
    { key: "nr", titel: "Nr.", zahl: true, wert: (z) => z.nr, fest: true },
    // Das Jahr steht schon im Zeitraum – in der Zeile reicht Tag und Monat (wie bei DATEV), voll im Hinweis.
    { key: "datum", titel: "Datum", wert: (z) => z.datum, zeige: (z) => <span title={datumDe(z.datum)}>{datumDe(z.datum).slice(0, 6)}</span> },
    { key: "beleg", titel: "Beleg", wert: (z) => z.beleg },
    { key: "text", titel: "Buchungstext", wert: (z) => z.text, fest: true },
    { key: "konto", titel: "Konto", wert: (z) => z.konto, zeige: (z) => kontoZelle(z.konto) },
    { key: "gegenkonto", titel: "Gegenkonto", wert: (z) => z.gegenkonto,
      zeige: (z) => <>{kontoZelle(z.gegenkonto)}{z.splitt && <span className="ap-marke">Splitt</span>}</> },
    { key: "steuer", titel: "Steuer", wert: (z) => z.steuer,
      zeige: (z) => z.steuer ? <span title={schluessel.find((s) => s.schluessel === z.steuer)?.bezeichnung}>{z.steuer}</span> : "" },
    { key: "betrag", titel: "Umsatz", zahl: true, wert: (z) => z.betrag, zeige: (z) => betragText(z.betrag), fest: true },
    ...FIN_KOST_ARTEN.map((a): Spalte<JournalZeile> => ({ key: a.wert, titel: a.text, wert: (z) => buchungKost(z.buchung, a.wert),
      zeige: (z) => { const n = buchungKost(z.buchung, a.wert); return n ? <span title={kostText(kostenstellen, a.wert, n)}>{n}</span> : ""; } })),
    { key: "zustand", titel: "Zustand", wert: (z) => ZUSTAND_TEXT[z.zustand],
      zeige: (z) => <span className={`ap-zustand ap-z-${z.zustand}`}>{ZUSTAND_TEXT[z.zustand]}</span> },
  ];
  const spalten = alleSpalten.filter((s) => !aus.has(s.key));

  const alle = useMemo(() => journalZeilen(buchungen, fest), [buchungen, fest]);
  const gefiltert = useMemo(() => journalFiltern(alle, filter), [alle, filter]);
  const sortSpalte = alleSpalten.find((s) => s.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte ? sortiere(gefiltert, sortSpalte.wert, sortierung.richtung) : gefiltert;
  // Ohne Wahl (oder wenn die Wahl herausgefiltert ist) steht die letzte Zeile rechts – meist die neueste Buchung.
  const gewaehlt = zeilen.find((z) => z.id === auswahl) ?? zeilen[zeilen.length - 1] ?? null;
  const summe = zeilen.reduce((s, z) => s + z.betrag, 0);
  const markiertListe = zeilen.filter((z) => markiert.has(z.id));
  const markiertSumme = markiertListe.reduce((s, z) => s + z.betrag, 0);

  const setze = (p: Partial<JournalFilter>) => setFilter({ ...filter, ...p });
  const nurKonto = (n: number) => { setFilter({ ...filter, konto: n }); setFilterNr(filterNr + 1); };
  const zuruecksetzen = () => { setFilter(JOURNAL_FILTER_LEER); setBetragVon(""); setBetragBis(""); setFilterNr(filterNr + 1); };

  // Kurzbefehle gelten auf der ganzen Seite, solange kein Fenster darüber liegt (das Buchungsfenster hat eigene).
  useKurzbefehle((b) => {
    if (b === "suche") { sucheRef.current?.focus(); return true; }
    if (b === "neu") { if (darfBuchen) onNeu(); return darfBuchen; }
    const k = gewaehlt?.konto;
    if (k == null) return false;
    if (onKontoblatt) onKontoblatt(k); else nurKonto(k);
    return true;
  });

  function csv(nurMarkiert: boolean) {
    const liste = nurMarkiert ? markiertListe : zeilen;
    const kopf = ["Nr.", "Datum", "Beleg", "Buchungstext", "Konto", "Kontobezeichnung", "Gegenkonto", "Gegenkontobezeichnung", "Steuer", "Umsatz", "Zustand"];
    const daten = liste.map((z) => [z.nr, datumDe(z.datum), z.beleg, z.text, z.konto == null ? "" : kontoNr(z.konto), z.konto == null ? "" : name(z.konto),
      z.gegenkonto == null ? "" : kontoNr(z.gegenkonto), z.gegenkonto == null ? "" : name(z.gegenkonto), z.steuer, z.betrag, ZUSTAND_TEXT[z.zustand]]);
    dateiHerunterladen(`journal_${jahr}${filter.monat ? `_${String(filter.monat).padStart(2, "0")}` : ""}.csv`, tabellenCsv(kopf, daten), "text/csv;charset=utf-8");
  }

  const festBis = fest.filter((f) => f.jahr === jahr).map((f) => f.monat).sort((a, b) => a - b);
  let lueckenlos = 0;
  for (const m of festBis) if (m === lueckenlos + 1) lueckenlos = m;

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Filter">
          <label className="ap-chip"><span>Zeitraum</span>
            <select value={filter.monat} onChange={(e) => setze({ monat: Number(e.target.value) })} aria-label="Zeitraum">
              <option value={0}>ganzes Jahr {jahr}</option>
              {MONATE.map((m, i) => <option key={m} value={i + 1}>{m} {jahr}</option>)}
            </select>
          </label>
          <label className="ap-chip ap-chip-konto"><span>Konto</span>
            <KontoFeld key={filterNr} konten={konten} wert={filter.konto} onWert={(n) => setze({ konto: n })} label="Nur Buchungen mit Konto" platzhalter="alle" />
          </label>
          {kostenstellen.length > 0 && (
            <label className="ap-chip"><span>Kostenstelle</span>
              <select value={filter.kost ?? ""} onChange={(e) => setze({ kost: e.target.value || null })} aria-label="Kostenstelle">
                <option value="">alle</option>
                {FIN_KOST_ARTEN.map((a) => (
                  <optgroup key={a.wert} label={a.text}>
                    {kostAuswahl(kostenstellen, a.wert).map((k) => <option key={k.id} value={`${a.wert}|${k.nummer}`}>{k.nummer} · {k.bezeichnung}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <label className="ap-chip"><span>Zustand</span>
            <select value={filter.zustand ?? ""} onChange={(e) => setze({ zustand: (e.target.value || null) as JournalZustand | null })} aria-label="Zustand">
              <option value="">alle</option>
              {JOURNAL_ZUSTAENDE.map((z) => <option key={z.wert} value={z.wert}>{z.text}</option>)}
            </select>
          </label>
          <label className="ap-chip ap-chip-betrag"><span>Betrag</span>
            <input inputMode="decimal" value={betragVon} placeholder="von" aria-label="Betrag von"
              onChange={(e) => { setBetragVon(e.target.value); setze({ betragVon: betragLesen(e.target.value) }); }} />
            <span aria-hidden="true">–</span>
            <input inputMode="decimal" value={betragBis} placeholder="bis" aria-label="Betrag bis"
              onChange={(e) => { setBetragBis(e.target.value); setze({ betragBis: betragLesen(e.target.value) }); }} />
          </label>
          <label className="ap-chip ap-chip-suche">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={sucheRef} value={filter.text} placeholder="Text, Beleg, Konto, Betrag (F2)" aria-label="Journal durchsuchen"
              onChange={(e) => setze({ text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape" && filter.text) { e.preventDefault(); setze({ text: "" }); } }} />
          </label>
          {filterAnzahl(filter) > 0 && <button type="button" className="es-knopf" onClick={zuruecksetzen}>Filter zurücksetzen</button>}
          <span className="ap-luft" />
          <SpaltenWahl spalten={alleSpalten} aus={aus} onAus={setAus} />
          <button type="button" className="es-knopf" onClick={() => csv(false)} disabled={!zeilen.length} title="Für Excel: Semikolon, Komma als Dezimalzeichen">CSV</button>
          {darfBuchen && <button type="button" className="btn-primary ap-neu" onClick={onNeu}>+ Schnellbuchung (N)</button>}
        </div>

        {markiert.size > 0 && (
          <div className="ap-sammel" role="status">
            <b>{markiertListe.length} markiert</b> · Summe {betragText(markiertSumme)}
            <button type="button" className="es-knopf" onClick={() => csv(true)} disabled={!markiertListe.length}>Markierte als CSV</button>
            <button type="button" className="es-knopf" onClick={() => setMarkiert(new Set())}>Auswahl aufheben</button>
          </div>
        )}

        <DatenTabelle label={`Journal ${jahr}`} spalten={spalten} zeilen={zeilen} schluessel={(z) => z.id}
          auswahl={gewaehlt?.id ?? null} onAuswahl={setAuswahl} onOeffnen={(z) => onOeffnen(z.buchung)}
          markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung}
          zeilenKlasse={(z) => (z.zustand === "storniert" ? "ap-gestrichen" : z.zustand === "storno" ? "ap-leise" : undefined)}
          summe={<><b>{zeilen.length === 1 ? "1 Buchung" : `${zeilen.length} Buchungen`}</b> · Summe Umsatz <b>{betragText(summe)}</b></>}
          leer={laedt ? "Lädt …" : buchungen.length ? "Keine Buchung passt zum Filter." : `Noch keine Buchung in ${jahr}.`} />

        <div className="ap-status">
          <span><b>{zeilen.length}</b> von {alle.length} Buchungen</span>
          <span>Festgeschrieben: <b>{lueckenlos ? `bis ${MONATE[lueckenlos - 1]}` : "noch nichts"}</b></span>
          <span className="ap-tasten">
            ↑ ↓ wählen · Leertaste markiert · Enter öffnet · {FIN_KURZBEFEHLE.filter((k) => k.befehl !== "neu" || darfBuchen).map((k) => `${k.taste} ${k.text}`).join(" · ")}
          </span>
        </div>
      </div>

      <aside className="ap-detail" aria-label="Gewählte Buchung">
        {gewaehlt ? (
          <BuchungSpalte buchung={gewaehlt.buchung} zustand={gewaehlt.zustand} saldoKonto={gewaehlt.konto} alle={buchungen} name={name}
            onOeffnen={() => onOeffnen(gewaehlt.buchung)} onKontoblatt={onKontoblatt ?? nurKonto}
            sprungKonten={[gewaehlt.konto, gewaehlt.gegenkonto].filter((n): n is number => n != null)} />
        ) : (
          <span className="small">Keine Buchung gewählt.</span>
        )}
      </aside>
    </div>
  );
}

// Die rechte Spalte zu einer Buchung – im Journal und im Kontoblatt (v179) dieselbe: Soll und Haben, Saldo eines
// Kontos vor und nach ihr, Öffnen (Storno), Sprung ins Kontoblatt der beteiligten Konten.
export function BuchungSpalte({ buchung, zustand, saldoKonto, alle, name, onOeffnen, sprungKonten, onKontoblatt }: {
  buchung: FinBuchung; zustand: JournalZustand; saldoKonto: number | null; alle: FinBuchung[]; name: (n: number) => string;
  onOeffnen: () => void;
  // Konten, deren Kontoblatt sich von hier öffnen lässt; das erste trägt „F3“.
  sprungKonten: number[];
  onKontoblatt?: (n: number) => void;
}) {
  const b = buchung;
  const s = saldoKonto != null ? saldoVorNach(alle, saldoKonto, b) : null;
  return (
    <>
      <h3>Buchung {b.jahr}-{b.nr}</h3>
      <div className="small">{datumDe(b.datum)} · {ZUSTAND_TEXT[zustand]} · {BUCHUNG_QUELLE_TEXT[b.quelle] ?? b.quelle}</div>
      <p className="ap-text"><b>{b.text}</b>{b.beleg ? <span className="small"> · Beleg {b.beleg}</span> : null}</p>
      {b.grund && <div className="fi-hinweis fi-info">Grund: {b.grund}</div>}
      <ZeilenTabelle zeilen={b.fin_buchungszeilen} name={name} />
      {s && saldoKonto != null && (
        <div className="ap-saldo">
          <span>Saldo {kontoNr(saldoKonto)} vor der Buchung</span><b>{saldoText(s.vor)}</b>
          <span>danach</span><b>{saldoText(s.nach)}</b>
        </div>
      )}
      <div className="ap-links">
        <button type="button" className="es-knopf" onClick={onOeffnen}>Öffnen (Enter)</button>
        {onKontoblatt && sprungKonten.map((n, i) => (
          <button key={n} type="button" className="es-knopf" onClick={() => onKontoblatt(n)}>Kontoblatt {kontoNr(n)}{i === 0 ? " (F3)" : ""}</button>
        ))}
      </div>
    </>
  );
}

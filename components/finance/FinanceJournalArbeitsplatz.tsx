"use client";
import { useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DatenTabelle, SpaltenWahl, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { KontoFeld } from "./arbeitsplatz/KontoFeld";
import { useKurzbefehle, ZeitraumWahl } from "./arbeitsplatz/Werkzeuge";
import { FIN_KOST_ARTEN, buchungKost, kostAuswahl, kostText, type FinKostenstelle } from "@/lib/finance/kostenstellen";
import { ZeilenTabelle } from "./FinanceBuchungen";
import { BelegVorschau } from "./BelegVorschau";
import { BerichtDruck } from "./BerichtDruck";
import { dateiHerunterladen } from "@/lib/download";
import { XLSX_TYP, tabelleXlsx } from "@/lib/finance/xlsx";
import { festgeschriebenBis } from "@/lib/finance/kopfleiste";
import { FIN_PERSONEN_ARTEN, type FinPersonenkonto } from "@/lib/finance/personen";
import type { Zeitraum } from "@/lib/finance/kontoblatt";
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

export function FinanceJournalArbeitsplatz({ buchungen, konten, schluessel, fest, jahr, laedt, darfBuchen, onNeu, onOeffnen, onKontoblatt, kostenstellen = [],
  personen = [], start, supabase, firma = "", stand = "", onBelegZuordnen }: {
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
  // v187: Personenkonten für den Filter „Partner“; der Anfangsfilter (Periode aus der Kopfleiste, Suche, Partner);
  // Belegbild rechts (mit `supabase`); Firma und Stand für das PDF; „Beleg zuordnen“ für markierte Buchungen.
  personen?: FinPersonenkonto[];
  start?: Partial<JournalFilter>;
  supabase?: SupabaseClient;
  firma?: string;
  stand?: string;
  onBelegZuordnen?: (ids: string[], datei: File) => Promise<string>;
}) {
  const [filter, setFilter] = useState<JournalFilter>(() => ({ ...JOURNAL_FILTER_LEER, ...start }));
  const [druck, setDruck] = useState(false);
  const [zuordnen, setZuordnen] = useState<{ laeuft: boolean; text: string | null; ok: boolean }>({ laeuft: false, text: null, ok: true });
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
  const ganzesJahr: Zeitraum = { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  const zeitraum: Zeitraum = { von: filter.von ?? ganzesJahr.von, bis: filter.bis ?? ganzesJahr.bis };
  const zeitraumSetzen = (z: Zeitraum) => setze(z.von === ganzesJahr.von && z.bis === ganzesJahr.bis ? { monat: 0, von: null, bis: null } : { monat: 0, von: z.von, bis: z.bis });
  const zuruecksetzen = () => { setFilter(JOURNAL_FILTER_LEER); setBetragVon(""); setBetragBis(""); setFilterNr(filterNr + 1); };

  // Kurzbefehle gelten auf der ganzen Seite, solange kein Fenster darüber liegt (das Buchungsfenster hat eigene).
  useKurzbefehle((b) => {
    if (b === "suche") { sucheRef.current?.focus(); return true; }
    if (b === "neu") { if (darfBuchen) onNeu(); return darfBuchen; }
    // F4 nimmt die Belegvorschau rechts (BelegVorschau).
    if (b === "beleg") return false;
    const k = gewaehlt?.konto;
    if (k == null) return false;
    if (onKontoblatt) onKontoblatt(k); else nurKonto(k);
    return true;
  });

  const exportKopf = ["Nr.", "Datum", "Beleg", "Buchungstext", "Konto", "Kontobezeichnung", "Gegenkonto", "Gegenkontobezeichnung", "Steuer", "Umsatz", "Zustand"];
  const exportZeilen = (liste: JournalZeile[]) => liste.map((z) => [z.nr, datumDe(z.datum), z.beleg, z.text, z.konto == null ? "" : kontoNr(z.konto), z.konto == null ? "" : name(z.konto),
    z.gegenkonto == null ? "" : kontoNr(z.gegenkonto), z.gegenkonto == null ? "" : name(z.gegenkonto), z.steuer, z.betrag, ZUSTAND_TEXT[z.zustand]]);
  // Dateiname mit dem Zeitraum, wenn einer gesetzt ist: journal_2026_2026-01-01_2026-03-31.
  const dateiname = `journal_${jahr}${filter.von || filter.bis ? `_${zeitraum.von}_${zeitraum.bis}` : filter.monat ? `_${String(filter.monat).padStart(2, "0")}` : ""}`;
  function csv(nurMarkiert: boolean) {
    dateiHerunterladen(`${dateiname}.csv`, tabellenCsv(exportKopf, exportZeilen(nurMarkiert ? markiertListe : zeilen)), "text/csv;charset=utf-8");
  }
  function excel(nurMarkiert: boolean) {
    dateiHerunterladen(`${dateiname}.xlsx`, tabelleXlsx(`Journal ${jahr}`, exportKopf, exportZeilen(nurMarkiert ? markiertListe : zeilen), new Date()) as BlobPart, XLSX_TYP);
  }
  async function belegZuordnen(datei: File) {
    if (!onBelegZuordnen) return;
    setZuordnen({ laeuft: true, text: null, ok: true });
    try {
      const text = await onBelegZuordnen(markiertListe.map((z) => z.id), datei);
      setZuordnen({ laeuft: false, text, ok: true });
    } catch (e) {
      setZuordnen({ laeuft: false, text: e instanceof Error ? e.message : "Der Beleg wurde nicht zugeordnet.", ok: false });
    }
  }

  const lueckenlos = festgeschriebenBis(fest, jahr);
  const zeitraumText = filter.von || filter.bis ? `${datumDe(zeitraum.von)} – ${datumDe(zeitraum.bis)}` : filter.monat ? `${MONATE[filter.monat - 1]} ${jahr}` : `ganzes Jahr ${jahr}`;

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Filter">
          <ZeitraumWahl key={`z${filterNr}`} jahr={jahr} wert={zeitraum} onWert={zeitraumSetzen} />
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
          {personen.length > 0 && (
            <label className="ap-chip ap-chip-partner"><span>Partner</span>
              <select value={filter.partner ?? ""} onChange={(e) => setze({ partner: e.target.value ? Number(e.target.value) : null })} aria-label="Partner">
                <option value="">alle</option>
                {FIN_PERSONEN_ARTEN.map((a) => (
                  <optgroup key={a.wert} label={a.text}>
                    {personen.filter((p) => p.art === a.wert).sort((x, y) => x.name.localeCompare(y.name, "de"))
                      .map((p) => <option key={p.nummer} value={p.nummer}>{p.name} · {p.nummer}</option>)}
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
            <input ref={sucheRef} value={filter.text} placeholder="Text, Beleg, Konto, Betrag (F2)" aria-label="Journal durchsuchen" data-eigene-suche=""
              onChange={(e) => setze({ text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape" && filter.text) { e.preventDefault(); setze({ text: "" }); } }} />
          </label>
          {filterAnzahl(filter) > 0 && <button type="button" className="es-knopf" onClick={zuruecksetzen}>Filter zurücksetzen</button>}
          <span className="ap-luft" />
          <SpaltenWahl spalten={alleSpalten} aus={aus} onAus={setAus} />
          <button type="button" className="es-knopf" onClick={() => csv(false)} disabled={!zeilen.length} title="Semikolon, Komma als Dezimalzeichen">CSV</button>
          <button type="button" className="es-knopf" onClick={() => excel(false)} disabled={!zeilen.length} title="Excel-Datei (.xlsx) mit den Zeilen der Ansicht">Excel</button>
          <button type="button" className="es-knopf" onClick={() => setDruck(true)} disabled={!zeilen.length} title="Drucken oder als PDF speichern">PDF</button>
          {darfBuchen && <button type="button" className="btn-primary ap-neu" onClick={onNeu}>+ Schnellbuchung (N)</button>}
        </div>

        {markiert.size > 0 && (
          <div className="ap-sammel" role="status">
            <b>{markiertListe.length} markiert</b> · Summe {betragText(markiertSumme)}
            {onBelegZuordnen && darfBuchen && (
              <label className={"es-knopf fi-dateiwahl" + (zuordnen.laeuft || !markiertListe.length ? " deaktiviert" : "")}
                title="Eine Datei (Foto, PDF, E-Rechnung) an jede markierte Buchung hängen">
                {zuordnen.laeuft ? "hängt an …" : "Beleg zuordnen"}
                <input type="file" disabled={zuordnen.laeuft || !markiertListe.length} accept="image/*,application/pdf,.xml,application/xml,text/xml" aria-label="Beleg den markierten Buchungen zuordnen"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void belegZuordnen(f); }} />
              </label>
            )}
            <button type="button" className="es-knopf" onClick={() => csv(true)} disabled={!markiertListe.length}>Markierte als CSV</button>
            <button type="button" className="es-knopf" onClick={() => excel(true)} disabled={!markiertListe.length}>Markierte als Excel</button>
            <button type="button" className="es-knopf" onClick={() => setMarkiert(new Set())}>Auswahl aufheben</button>
          </div>
        )}
        {zuordnen.text && <div className={"fi-hinweis " + (zuordnen.ok ? "fi-ok" : "fi-rot")} role={zuordnen.ok ? "status" : "alert"}>{zuordnen.text}</div>}

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
            ↑ ↓ wählen · Leertaste markiert · Enter öffnet · {FIN_KURZBEFEHLE.filter((k) => (k.befehl !== "neu" || darfBuchen) && (k.befehl !== "beleg" || !!supabase)).map((k) => `${k.taste} ${k.text}`).join(" · ")}
          </span>
        </div>
      </div>

      <aside className="ap-detail" aria-label="Gewählte Buchung">
        {gewaehlt ? (
          <BuchungSpalte buchung={gewaehlt.buchung} zustand={gewaehlt.zustand} saldoKonto={gewaehlt.konto} alle={buchungen} name={name}
            onOeffnen={() => onOeffnen(gewaehlt.buchung)} onKontoblatt={onKontoblatt ?? nurKonto} supabase={supabase}
            sprungKonten={[gewaehlt.konto, gewaehlt.gegenkonto].filter((n): n is number => n != null)} />
        ) : (
          <span className="small">Keine Buchung gewählt.</span>
        )}
      </aside>
      {druck && (
        <BerichtDruck titel={`Buchungsjournal ${jahr}`} unter={`${zeitraumText}${filterAnzahl(filter) > (filter.von || filter.bis || filter.monat ? 1 : 0) ? " · gefiltert" : ""} · ${zeilen.length === 1 ? "1 Buchung" : `${zeilen.length} Buchungen`}`}
          kopf={["Nr.", "Datum", "Beleg", "Buchungstext", "Konto", "Gegenkonto", "Steuer", "Umsatz", "Zustand"]}
          zeilen={[...zeilen.map((z) => ({ zellen: [String(z.nr), datumDe(z.datum), z.beleg, z.text, z.konto == null ? "" : kontoNr(z.konto),
            z.gegenkonto == null ? "" : kontoNr(z.gegenkonto) + (z.splitt ? " (Splitt)" : ""), z.steuer ?? "", z.betrag, ZUSTAND_TEXT[z.zustand]],
            art: z.zustand === "storniert" || z.zustand === "storno" ? "leise" as const : undefined })),
            { zellen: ["", "", "", "Summe Umsatz", "", "", "", summe, ""], art: "summe" as const }]}
          firma={firma} stand={stand} onClose={() => setDruck(false)} />
      )}
    </div>
  );
}

// Die rechte Spalte zu einer Buchung – im Journal und im Kontoblatt (v179) dieselbe: Soll und Haben, Saldo eines
// Kontos vor und nach ihr, Öffnen (Storno), Sprung ins Kontoblatt der beteiligten Konten.
export function BuchungSpalte({ buchung, zustand, saldoKonto, alle, name, onOeffnen, sprungKonten, onKontoblatt, supabase }: {
  buchung: FinBuchung; zustand: JournalZustand; saldoKonto: number | null; alle: FinBuchung[]; name: (n: number) => string;
  onOeffnen: () => void;
  // v187: mit Zugang das Belegbild der Buchung oben (F4 öffnet es groß).
  supabase?: SupabaseClient;
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
      {supabase && <BelegVorschau key={b.id} supabase={supabase} buchungId={b.id} />}
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

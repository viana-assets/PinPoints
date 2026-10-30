"use client";
import { useMemo, useRef, useState } from "react";
import { DatenTabelle, SpaltenWahl, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { KontoFeld } from "./arbeitsplatz/KontoFeld";
import { useKurzbefehle, ZeitraumWahl } from "./arbeitsplatz/Werkzeuge";
import { BuchungSpalte } from "./FinanceJournalArbeitsplatz";
import { dateiHerunterladen } from "@/lib/download";
import { FIN_KONTO_KATEGORIEN, kontoNr, type FinBuchung, type FinFestschreibung, type FinKonto } from "@/lib/finance/buchung";
import { JOURNAL_ZUSTAENDE, betragText, datumDe, saldoText, sortiere, tabellenCsv, type JournalZustand, type Sortierung } from "@/lib/finance/arbeitsplatz";
import { kontoblatt, zeitraumVorgaben, type KontoblattZeile, type Zeitraum } from "@/lib/finance/kontoblatt";
import { FIN_KOST_ARTEN, kostText, type FinKostenstelle } from "@/lib/finance/kostenstellen";

// Finance › Buchungen › Kontoblatt am Rechner (v179, Stufe B, docs/finance.md Abschnitt 11): ein Konto mit freiem
// Zeitraum, Eröffnungssaldo, jede Bewegung mit Gegenkonto, Soll, Haben und laufendem Saldo, unten Verkehrszahlen und
// Endsaldo. Klick auf das Gegenkonto (oder F3 auf der Zeile) öffnet dessen Kontoblatt, „Zurück“ führt den Weg
// zurück; Enter öffnet die Buchung (Storno). Rechnet aus dem Journal des Jahres (`kontoblatt` in
// lib/finance/kontoblatt.ts).
// Abhaken (Migration 109, v183, docs/finance.md Abschnitt 15): Zeilen beim Abstimmen als erledigt markieren (Haken-Spalte,
// H für die gewählte oder die markierten Zeilen), Filter „offen“, Saldo der offenen Zeilen. Der Haken ändert keine Buchung.

const ZUSTAND_TEXT = Object.fromEntries(JOURNAL_ZUSTAENDE.map((z) => [z.wert, z.text])) as Record<JournalZustand, string>;
type HakenFilter = "alle" | "offen" | "abgehakt";
const KEINE_HAKEN: ReadonlySet<number> = new Set();

export function FinanceKontoblatt({ buchungen, konten, fest, jahr, laedt, konto, onKonto, zurueck, onZurueck, darfBuchen, onNeu, onOeffnen, kostenstellen = [],
  abgehakt = KEINE_HAKEN, onAbhaken }: {
  buchungen: FinBuchung[];
  konten: FinKonto[];
  fest: FinFestschreibung[];
  jahr: number;
  laedt: boolean;
  konto: number | null;
  // Ein anderes Konto zeigen (Kontofeld, Klick auf ein Gegenkonto).
  onKonto: (n: number) => void;
  // Das Konto, zu dem „Zurück“ führt (null: kein Weg zurück).
  zurueck: number | null;
  onZurueck: () => void;
  darfBuchen: boolean;
  onNeu: () => void;
  onOeffnen: (b: FinBuchung) => void;
  // Kostenstellen (Migration 108, v182) für die Spalten Transporter und Leistung.
  kostenstellen?: FinKostenstelle[];
  // Abhaken (Migration 109): die abgehakten Buchungszeilen; ohne `onAbhaken` (kein Recht, Migration fehlt) nur ansehen.
  abgehakt?: ReadonlySet<number>;
  onAbhaken?: (zeilen: number[], an: boolean) => Promise<void>;
}) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => zeitraumVorgaben(jahr)[0]);
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const [aus, setAus] = useState<Set<string>>(() => new Set());
  const [haken, setHaken] = useState<HakenFilter>("alle");
  const [hakenFehler, setHakenFehler] = useState<string | null>(null);
  const sucheRef = useRef<HTMLInputElement>(null);

  const kontoDaten = konto != null ? konten.find((k) => k.nummer === konto) ?? null : null;
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const blatt = useMemo(() => (konto != null ? kontoblatt(buchungen, konto, zeitraum, fest) : null), [buchungen, konto, zeitraum, fest]);

  const istAb = (z: KontoblattZeile) => z.zeileId != null && abgehakt.has(z.zeileId);
  async function abhaken(liste: KontoblattZeile[], an: boolean) {
    const ids = liste.map((z) => z.zeileId).filter((x): x is number => x != null);
    if (!onAbhaken || !ids.length) return;
    setHakenFehler(null);
    try { await onAbhaken(ids, an); } catch (e) { setHakenFehler(e instanceof Error ? e.message : String(e)); }
  }
  const alleSpalten: Spalte<KontoblattZeile>[] = [
    { key: "haken", titel: "✓", wert: (z) => (istAb(z) ? 1 : 0), fest: true,
      zeige: (z) => (onAbhaken ? (
        <button type="button" className={"ap-haken" + (istAb(z) ? " an" : "")} aria-pressed={istAb(z)} aria-label={istAb(z) ? "Haken entfernen" : "Abhaken"}
          onClick={(e) => { e.stopPropagation(); void abhaken([z], !istAb(z)); }}>{istAb(z) ? "✓" : ""}</button>
      ) : istAb(z) ? <span className="ap-haken an" aria-label="abgehakt">✓</span> : "") },
    { key: "datum", titel: "Datum", wert: (z) => z.datum, zeige: (z) => <span title={datumDe(z.datum)}>{datumDe(z.datum).slice(0, 6)}</span> },
    { key: "nr", titel: "Nr.", zahl: true, wert: (z) => z.nr },
    { key: "beleg", titel: "Beleg", wert: (z) => z.beleg },
    { key: "text", titel: "Buchungstext", wert: (z) => z.text, fest: true },
    { key: "gegen", titel: "Gegenkonto", wert: (z) => z.gegen,
      zeige: (z) => z.gegen == null ? <span className="ap-leise-text">div.</span> : (
        <button type="button" className="ap-link" title={`Kontoblatt ${kontoNr(z.gegen)} ${name(z.gegen)}`}
          onClick={(e) => { e.stopPropagation(); onKonto(z.gegen as number); }}>{kontoNr(z.gegen)}</button>
      ) },
    { key: "soll", titel: "Soll", zahl: true, wert: (z) => z.soll || null, zeige: (z) => (z.soll ? betragText(z.soll) : ""), fest: true },
    { key: "haben", titel: "Haben", zahl: true, wert: (z) => z.haben || null, zeige: (z) => (z.haben ? betragText(z.haben) : ""), fest: true },
    { key: "saldo", titel: "Saldo", zahl: true, wert: (z) => z.saldo, zeige: (z) => saldoText(z.saldo), fest: true },
    { key: "steuer", titel: "Steuer", wert: (z) => z.steuer, zeige: (z) => (z.steuer ? `${z.steuer}${z.istSteuer ? " (Steuer)" : ""}` : "") },
    ...FIN_KOST_ARTEN.map((a): Spalte<KontoblattZeile> => ({ key: a.wert, titel: a.text, wert: (z) => z[a.wert],
      zeige: (z) => (z[a.wert] ? <span title={kostText(kostenstellen, a.wert, z[a.wert])}>{z[a.wert]}</span> : "") })),
    { key: "person", titel: "Person", zahl: true, wert: (z) => z.personenkonto },
    { key: "zustand", titel: "Zustand", wert: (z) => ZUSTAND_TEXT[z.zustand],
      zeige: (z) => <span className={`ap-zustand ap-z-${z.zustand}`}>{ZUSTAND_TEXT[z.zustand]}</span> },
  ];
  // Ohne Abhaken (kein Recht und nichts abgehakt, oder Migration 109 fehlt) keine Haken-Spalte.
  const mitHaken = !!onAbhaken || abgehakt.size > 0;
  // Die Spalte Person (Migration 110) nur, wenn eine Zeile einen Debitor/Kreditor trägt.
  const mitPerson = (blatt?.zeilen ?? []).some((z) => z.personenkonto != null);
  const spalten = alleSpalten.filter((s) => !aus.has(s.key) && (mitHaken || s.key !== "haken") && (mitPerson || s.key !== "person"));

  // Die Suche blendet Zeilen aus, der laufende Saldo bleibt der des ganzen Kontos.
  const s = suche.trim().toLowerCase();
  const gefiltert = (blatt?.zeilen ?? []).filter((z) => !s || [z.nr, z.text, z.beleg, betragText(z.soll || z.haben), z.gegen == null ? "" : kontoNr(z.gegen)]
    .join(" ").toLowerCase().includes(s))
    .filter((z) => haken === "alle" || (haken === "abgehakt") === istAb(z));
  // Was noch nicht abgehakt ist – Anzahl und Saldo (ohne Eröffnung), die Zahl zum Abstimmen.
  const offene = (blatt?.zeilen ?? []).filter((z) => !istAb(z));
  const offenSaldo = Math.round(offene.reduce((x, z) => x + z.soll - z.haben, 0) * 100) / 100;
  const sortSpalte = alleSpalten.find((x) => x.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte ? sortiere(gefiltert, sortSpalte.wert, sortierung.richtung) : gefiltert;
  const gewaehlt = zeilen.find((z) => z.key === auswahl) ?? zeilen[zeilen.length - 1] ?? null;
  const markiertListe = zeilen.filter((z) => markiert.has(z.key));

  useKurzbefehle((b) => {
    if (b === "suche") { sucheRef.current?.focus(); return true; }
    if (b === "neu") { if (darfBuchen) onNeu(); return darfBuchen; }
    if (gewaehlt?.gegen == null) return false;
    onKonto(gewaehlt.gegen);
    return true;
  });

  function csv(nurMarkiert: boolean) {
    if (!blatt || konto == null) return;
    const liste = nurMarkiert ? markiertListe : zeilen;
    const kopf = ["Datum", "Nr.", "Beleg", "Buchungstext", "Gegenkonto", "Gegenkontobezeichnung", "Soll", "Haben", "Saldo", "S/H", "Steuer", "Zustand", "Abgehakt"];
    const daten = [
      ["", "", "", "Eröffnungssaldo", "", "", null, null, Math.abs(blatt.eroeffnung), blatt.eroeffnung < 0 ? "H" : "S", "", "", ""],
      ...liste.map((z) => [datumDe(z.datum), z.nr, z.beleg, z.text, z.gegen == null ? "div." : kontoNr(z.gegen), z.gegen == null ? "" : name(z.gegen),
        z.soll || null, z.haben || null, Math.abs(z.saldo), z.saldo < 0 ? "H" : "S", z.steuer, ZUSTAND_TEXT[z.zustand], istAb(z) ? "ja" : ""]),
    ];
    dateiHerunterladen(`kontoblatt_${kontoNr(konto)}_${zeitraum.von}_${zeitraum.bis}.csv`, tabellenCsv(kopf, daten), "text/csv;charset=utf-8");
  }

  const art = kontoDaten ? FIN_KONTO_KATEGORIEN.find((k) => k.wert === kontoDaten.kategorie)?.text : null;

  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Kontoblatt">
          {zurueck != null && <button type="button" className="es-knopf" onClick={onZurueck}>← {kontoNr(zurueck)}</button>}
          <label className="ap-chip ap-chip-konto ap-chip-gross"><span>Konto</span>
            <KontoFeld key={konto ?? "leer"} konten={konten} wert={konto} onWert={(n) => { if (n != null && n !== konto) onKonto(n); }} label="Konto für das Kontoblatt"
              autoFocus={konto == null} />
          </label>
          <ZeitraumWahl jahr={jahr} wert={zeitraum} onWert={setZeitraum} />
          <label className="ap-chip ap-chip-suche">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={sucheRef} value={suche} placeholder="Text, Beleg, Gegenkonto, Betrag (F2)" aria-label="Kontoblatt durchsuchen"
              onChange={(e) => setSuche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape" && suche) { e.preventDefault(); setSuche(""); } }} />
          </label>
          {mitHaken && <label className="ap-chip"><span>Haken</span>
            <select value={haken} aria-label="Haken" onChange={(e) => setHaken(e.target.value as HakenFilter)}>
              <option value="alle">alle</option>
              <option value="offen">nur offene</option>
              <option value="abgehakt">nur abgehakte</option>
            </select>
          </label>}
          <SpaltenWahl spalten={mitHaken ? alleSpalten : alleSpalten.filter((x) => x.key !== "haken")} aus={aus} onAus={setAus} />
          <button type="button" className="es-knopf" onClick={() => csv(false)} disabled={!blatt} title="Für Excel: Semikolon, Komma als Dezimalzeichen">CSV</button>
          {darfBuchen && <button type="button" className="btn-primary ap-neu" onClick={onNeu}>+ Schnellbuchung (N)</button>}
        </div>

        {blatt && konto != null && (
          <div className="ap-kontokopf">
            <b>{kontoNr(konto)} {kontoDaten?.bezeichnung ?? "unbekanntes Konto"}</b>
            {art && <span className="small">{art}{kontoDaten && !kontoDaten.aktiv ? " · ausgeblendet" : ""}</span>}
            <span className="ap-luft" />
            {mitHaken && <span>Nicht abgehakt <b>{offene.length}</b> · <b>{saldoText(offenSaldo)}</b></span>}
            <span>Eröffnung <b>{saldoText(blatt.eroeffnung)}</b></span>
            <span>Endsaldo <b>{saldoText(blatt.ende)}</b></span>
          </div>
        )}

        {markiert.size > 0 && (
          <div className="ap-sammel" role="status">
            <b>{markiertListe.length} markiert</b> · Soll {betragText(markiertListe.reduce((x, z) => x + z.soll, 0))} · Haben {betragText(markiertListe.reduce((x, z) => x + z.haben, 0))}
            {onAbhaken && <button type="button" className="es-knopf" onClick={() => void abhaken(markiertListe, true)}>Abhaken (H)</button>}
            {onAbhaken && <button type="button" className="es-knopf" onClick={() => void abhaken(markiertListe, false)}>Haken entfernen</button>}
            <button type="button" className="es-knopf" onClick={() => csv(true)} disabled={!markiertListe.length}>Markierte als CSV</button>
            <button type="button" className="es-knopf" onClick={() => setMarkiert(new Set())}>Auswahl aufheben</button>
          </div>
        )}

        {hakenFehler && <div className="fi-hinweis fi-rot" role="alert">{hakenFehler}</div>}
        <div onKeyDown={(e) => {
          // H: die markierten (sonst die gewählte) Zeile abhaken – sind schon alle abgehakt, Haken entfernen.
          if (e.key.toLowerCase() !== "h" || e.ctrlKey || e.metaKey || e.altKey || !onAbhaken || (e.target as HTMLElement).closest("input, select, textarea")) return;
          const liste = markiertListe.length ? markiertListe : gewaehlt ? [gewaehlt] : [];
          if (!liste.length) return;
          e.preventDefault();
          void abhaken(liste, !liste.every(istAb));
        }}>
        <DatenTabelle label={konto != null ? `Kontoblatt ${kontoNr(konto)}` : "Kontoblatt"} spalten={spalten} zeilen={zeilen} schluessel={(z) => z.key}
          auswahl={gewaehlt?.key ?? null} onAuswahl={setAuswahl} onOeffnen={(z) => onOeffnen(z.buchung)}
          markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung}
          zeilenKlasse={(z) => (z.zustand === "storniert" ? "ap-gestrichen" : z.zustand === "storno" || z.istSteuer ? "ap-leise" : undefined)}
          summe={blatt && <>Verkehrszahlen Soll <b>{betragText(blatt.soll)}</b> · Haben <b>{betragText(blatt.haben)}</b> · Endsaldo <b>{saldoText(blatt.ende)}</b>
            {s ? <span className="small"> (alle Zeilen des Zeitraums, auch die ausgeblendeten)</span> : null}</>}
          leer={konto == null ? "Konto oben eintippen – Nummer oder Name." : laedt ? "Lädt …" : "Keine Bewegung in diesem Zeitraum."} />
        </div>

        <div className="ap-status">
          {blatt && <span><b>{blatt.zeilen.length}</b> Bewegungen im Zeitraum</span>}
          <span className="ap-tasten">↑ ↓ wählen · Enter öffnet die Buchung · Klick auf das Gegenkonto oder F3 öffnet dessen Kontoblatt · F2 Suche{onAbhaken ? " · H hakt ab" : ""}</span>
        </div>
      </div>

      <aside className="ap-detail" aria-label="Gewählte Buchung">
        {gewaehlt && konto != null ? (
          <BuchungSpalte buchung={gewaehlt.buchung} zustand={gewaehlt.zustand} saldoKonto={konto} alle={buchungen} name={name}
            onOeffnen={() => onOeffnen(gewaehlt.buchung)} onKontoblatt={onKonto}
            sprungKonten={[...new Set(gewaehlt.buchung.fin_buchungszeilen.map((x) => x.konto))].filter((n) => n !== konto)
              .sort((a, b) => (a === gewaehlt.gegen ? -1 : b === gewaehlt.gegen ? 1 : a - b))} />
        ) : <span className="small">Keine Buchung gewählt.</span>}
      </aside>
    </div>
  );
}

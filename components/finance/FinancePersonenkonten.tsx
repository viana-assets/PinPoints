"use client";
import { useMemo, useState } from "react";
import { Blatt } from "@/components/Blatt";
import { DatenTabelle, type Spalte } from "./arbeitsplatz/DatenTabelle";
import { useKurzbefehle, ZeitraumWahl } from "./arbeitsplatz/Werkzeuge";
import { dateiHerunterladen } from "@/lib/download";
import { formatEUR } from "@/lib/format";
import { kontoNr, type FinBuchung, type FinFestschreibung } from "@/lib/finance/buchung";
import { JOURNAL_ZUSTAENDE, betragText, datumDe, saldoText, sortiere, type JournalZustand, type Sortierung } from "@/lib/finance/arbeitsplatz";
import { kontoblatt, zeitraumVorgaben, type KontoblattZeile, type Zeitraum } from "@/lib/finance/kontoblatt";
import {
  FIN_PERSONEN_ARTEN, offenePosten, personenCsv, personenFiltern, personenSalden, tageSeit,
  type FinPersonenkonto, type OffenerPosten, type PersonArt,
} from "@/lib/finance/personen";

// Finance › Buchungen › Personen (Migration 110, v184, Stufe D Teil 1, docs/finance.md Abschnitt 16): Debitoren und
// Kreditoren. Am Rechner die Liste mit Saldo je Person, Enter öffnet das Personenkontoblatt (Zeitraum, laufender Saldo
// ab dem Vortrag) mit den offenen Posten darunter; am Handy Karten, Antippen zeigt Saldo und offene Posten.
// Angelegt werden die Konten von selbst beim Buchen einer Rechnung oder eines Belegs – zu pflegen gibt es nichts.

const ZUSTAND_TEXT = Object.fromEntries(JOURNAL_ZUSTAENDE.map((z) => [z.wert, z.text])) as Record<JournalZustand, string>;
const ART_TEXT = Object.fromEntries(FIN_PERSONEN_ARTEN.map((a) => [a.wert, a.einzeln])) as Record<PersonArt, string>;

export function FinancePersonenkonten({ personen, buchungen, fest, jahr, heute, laedt, fehlt, amRechner, onOeffnen }: {
  personen: FinPersonenkonto[];
  buchungen: FinBuchung[];
  fest: FinFestschreibung[];
  jahr: number;
  heute: string;
  laedt: boolean;
  // Migration 110 fehlt (der Abruf scheitert).
  fehlt: boolean;
  amRechner: boolean;
  onOeffnen: (b: FinBuchung) => void;
}) {
  const [art, setArt] = useState<PersonArt | null>(null);
  const [suche, setSuche] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [blattNr, setBlattNr] = useState<number | null>(null);
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());

  const salden = useMemo(() => personenSalden(personen, buchungen), [personen, buchungen]);
  const gefiltert = personenFiltern(personen, salden, { art, suche, nurOffen });
  const s = (p: FinPersonenkonto) => salden.get(p.nummer) ?? { soll: 0, haben: 0, saldo: p.vortrag, zeilen: 0 };
  const spalten: Spalte<FinPersonenkonto>[] = [
    { key: "nummer", titel: "Konto", zahl: true, wert: (p) => p.nummer, fest: true },
    { key: "name", titel: "Name", wert: (p) => p.name, fest: true, max: 280 },
    { key: "art", titel: "Art", wert: (p) => (p.sammel ? "Sammeldebitor" : ART_TEXT[p.art]) },
    { key: "kdnr", titel: "Kd.-Nr.", zahl: true, wert: (p) => p.kundennummer },
    { key: "vortrag", titel: "Vortrag", zahl: true, wert: (p) => p.vortrag || null, zeige: (p) => (p.vortrag ? saldoText(p.vortrag) : "") },
    { key: "soll", titel: "Soll", zahl: true, wert: (p) => s(p).soll || null, zeige: (p) => (s(p).soll ? betragText(s(p).soll) : "") },
    { key: "haben", titel: "Haben", zahl: true, wert: (p) => s(p).haben || null, zeige: (p) => (s(p).haben ? betragText(s(p).haben) : "") },
    { key: "saldo", titel: "Saldo", zahl: true, wert: (p) => s(p).saldo, zeige: (p) => saldoText(s(p).saldo), fest: true },
  ];
  const sortSpalte = spalten.find((x) => x.key === sortierung?.spalte);
  const liste = sortierung && sortSpalte ? sortiere(gefiltert, sortSpalte.wert, sortierung.richtung) : gefiltert;
  const gewaehlt = liste.find((p) => String(p.nummer) === auswahl) ?? liste[0] ?? null;
  const offen = blattNr != null ? personen.find((p) => p.nummer === blattNr) ?? null : null;
  const summe = Math.round(gefiltert.reduce((x, p) => x + s(p).saldo, 0) * 100) / 100;

  useKurzbefehle((b) => {
    if (b === "konto" && gewaehlt && !offen) { setBlattNr(gewaehlt.nummer); return true; }
    return false;
  });

  if (fehlt) return <div className="fi-hinweis fi-rot" role="alert">Die Personenkonten konnten nicht geladen werden. Ist Migration 110 ausgeführt?</div>;

  const csv = () => dateiHerunterladen(`personenkonten_${jahr}.csv`, personenCsv(liste), "text/csv;charset=utf-8");

  if (!amRechner) {
    return (
      <>
        <div className="fi-werkzeug">
          <select className="fi-monat" aria-label="Art" value={art ?? ""} onChange={(e) => setArt((e.target.value || null) as PersonArt | null)}>
            <option value="">Alle Personen</option>
            {FIN_PERSONEN_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}
          </select>
          <label className="fi-haken-zeile"><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> nur mit Saldo</label>
        </div>
        <div className="db-karte es-karte">
          {laedt ? <span className="small">Lädt …</span> : liste.length === 0 ? (
            <span className="small">{personen.length ? "Keine Person passt zur Auswahl." : "Noch kein Personenkonto – sie entstehen beim Buchen von Rechnungen und Belegen."}</span>
          ) : liste.map((p) => (
            <button key={p.nummer} type="button" className="es-zeile fi-buchung" onClick={() => setBlattNr(p.nummer)} aria-label={`${p.nummer} ${p.name}`}>
              <span className="fi-nr">{p.nummer}</span>
              <span className="db-punkt-text"><b>{p.name}</b><span className="small">{p.sammel ? "Sammeldebitor" : ART_TEXT[p.art]}{p.kundennummer ? ` · Kd. ${p.kundennummer}` : ""}</span></span>
              <span className="fi-betrag">{saldoText(s(p).saldo)}</span>
            </button>
          ))}
        </div>
        {offen && (
          <Blatt titel={offen.name} unter={`${offen.sammel ? "Sammeldebitor" : ART_TEXT[offen.art]} ${offen.nummer}`} onClose={() => setBlattNr(null)}>
            <PersonKurz p={offen} saldo={s(offen).saldo} posten={offenePosten(buchungen, offen.nummer)} heute={heute} />
          </Blatt>
        )}
      </>
    );
  }

  if (offen) {
    return <PersonBlatt p={offen} buchungen={buchungen} fest={fest} jahr={jahr} heute={heute} onZurueck={() => setBlattNr(null)} onOeffnen={onOeffnen} />;
  }

  const op = gewaehlt ? offenePosten(buchungen, gewaehlt.nummer) : [];
  return (
    <div className="ap-rahmen">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Personenkonten">
          <label className="ap-chip"><span>Art</span>
            <select aria-label="Art" value={art ?? ""} onChange={(e) => setArt((e.target.value || null) as PersonArt | null)}>
              <option value="">alle</option>
              {FIN_PERSONEN_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.text}</option>)}
            </select>
          </label>
          <label className="ap-chip ap-chip-suche">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={suche} placeholder="Konto, Name, Kundennummer" aria-label="Personenkonten durchsuchen" onChange={(e) => setSuche(e.target.value)} />
          </label>
          <button type="button" className={"es-knopf" + (nurOffen ? " aktiv" : "")} aria-pressed={nurOffen} onClick={() => setNurOffen(!nurOffen)}>nur mit Saldo</button>
          <span className="ap-luft ap-luft-voll" />
          <button type="button" className="es-knopf" onClick={csv} disabled={!liste.length} title="Konto, Name, Kundennummer, Anschrift – für die Kanzlei">Liste als CSV</button>
        </div>
        <DatenTabelle label="Personenkonten" spalten={spalten} zeilen={liste} schluessel={(p) => String(p.nummer)}
          auswahl={gewaehlt ? String(gewaehlt.nummer) : null} onAuswahl={setAuswahl} onOeffnen={(p) => setBlattNr(p.nummer)}
          markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung}
          summe={<><b>{liste.length === 1 ? "1 Konto" : `${liste.length} Konten`}</b> · Saldo <b>{saldoText(summe)}</b></>}
          leer={laedt ? "Lädt …" : personen.length ? "Keine Person passt zur Auswahl." : "Noch kein Personenkonto – sie entstehen beim Buchen von Rechnungen und Belegen."} />
        <div className="ap-status">
          <span>Debitoren = Kundennummer (Admin › Betrieb › DATEV), Laufkundschaft auf dem Sammeldebitor; Kreditoren je Lieferant ab 70000</span>
          <span className="ap-tasten">↑ ↓ wählen · Enter oder F3 öffnet das Kontoblatt</span>
        </div>
      </div>
      <aside className="ap-detail" aria-label="Gewähltes Personenkonto">
        {gewaehlt ? (
          <>
            <h3>{gewaehlt.name}</h3>
            <div className="small">{gewaehlt.sammel ? "Sammeldebitor" : ART_TEXT[gewaehlt.art]} {gewaehlt.nummer}{gewaehlt.kundennummer ? ` · Kd. ${gewaehlt.kundennummer}` : ""}</div>
            <PersonKurz p={gewaehlt} saldo={s(gewaehlt).saldo} posten={op} heute={heute} />
            <div className="ap-links">
              <button type="button" className="es-knopf" onClick={() => setBlattNr(gewaehlt.nummer)}>Kontoblatt (Enter)</button>
            </div>
          </>
        ) : <span className="small">Kein Personenkonto gewählt.</span>}
      </aside>
    </div>
  );
}

// Saldo und offene Posten in Kurzform – Detailspalte am Rechner, Fenster am Handy.
function PersonKurz({ p, saldo, posten, heute }: { p: FinPersonenkonto; saldo: number; posten: OffenerPosten[]; heute: string }) {
  return (
    <>
      {p.anschrift && <p className="small fi-anschrift">{p.anschrift}</p>}
      <div className="ap-saldo">
        {p.vortrag !== 0 && <><span>Vortrag</span><b>{saldoText(p.vortrag)}</b></>}
        <span>Saldo</span><b>{saldoText(saldo)}</b>
        <span>offene Posten</span><b>{posten.length}</b>
      </div>
      {posten.length > 0 && (
        <table className="fi-tabelle">
          <thead><tr><th>Beleg</th><th>Datum</th><th className="zahl">offen</th><th className="zahl">Tage</th></tr></thead>
          <tbody>
            {posten.map((o) => (
              <tr key={o.beleg}><td>{o.beleg}</td><td>{datumDe(o.datum).slice(0, 6)}</td><td className="zahl">{formatEUR(Math.abs(o.offen))}</td>
                <td className="zahl">{tageSeit(o.datum, heute)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// Das Personenkontoblatt am Rechner: Zeitraum, Eröffnung ab Vortrag, laufender Saldo; darunter die offenen Posten.
function PersonBlatt({ p, buchungen, fest, jahr, heute, onZurueck, onOeffnen }: {
  p: FinPersonenkonto; buchungen: FinBuchung[]; fest: FinFestschreibung[]; jahr: number; heute: string;
  onZurueck: () => void; onOeffnen: (b: FinBuchung) => void;
}) {
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => zeitraumVorgaben(jahr)[0]);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [sortierung, setSortierung] = useState<Sortierung>(null);
  const [markiert, setMarkiert] = useState<Set<string>>(() => new Set());
  const blatt = useMemo(() => kontoblatt(buchungen, p.nummer, zeitraum, fest, { vortrag: p.vortrag }), [buchungen, p, zeitraum, fest]);
  const op = offenePosten(buchungen, p.nummer);
  const spalten: Spalte<KontoblattZeile>[] = [
    { key: "datum", titel: "Datum", wert: (z) => z.datum, zeige: (z) => datumDe(z.datum).slice(0, 6) },
    { key: "nr", titel: "Nr.", zahl: true, wert: (z) => z.nr },
    { key: "beleg", titel: "Beleg", wert: (z) => z.beleg },
    { key: "text", titel: "Buchungstext", wert: (z) => z.text, fest: true },
    { key: "gegen", titel: "Gegenkonto", wert: (z) => z.gegen, zeige: (z) => (z.gegen == null ? <span className="ap-leise-text">div.</span> : kontoNr(z.gegen)) },
    { key: "soll", titel: "Soll", zahl: true, wert: (z) => z.soll || null, zeige: (z) => (z.soll ? betragText(z.soll) : ""), fest: true },
    { key: "haben", titel: "Haben", zahl: true, wert: (z) => z.haben || null, zeige: (z) => (z.haben ? betragText(z.haben) : ""), fest: true },
    { key: "saldo", titel: "Saldo", zahl: true, wert: (z) => z.saldo, zeige: (z) => saldoText(z.saldo), fest: true },
    { key: "zustand", titel: "Zustand", wert: (z) => ZUSTAND_TEXT[z.zustand], zeige: (z) => <span className={`ap-zustand ap-z-${z.zustand}`}>{ZUSTAND_TEXT[z.zustand]}</span> },
  ];
  const sortSpalte = spalten.find((x) => x.key === sortierung?.spalte);
  const zeilen = sortierung && sortSpalte ? sortiere(blatt.zeilen, sortSpalte.wert, sortierung.richtung) : blatt.zeilen;
  const gewaehlt = zeilen.find((z) => z.key === auswahl) ?? null;
  const opSpalten: Spalte<OffenerPosten>[] = [
    { key: "beleg", titel: "Beleg", wert: (o) => o.beleg, fest: true },
    { key: "datum", titel: "Datum", wert: (o) => o.datum, zeige: (o) => datumDe(o.datum).slice(0, 6) },
    { key: "text", titel: "Text", wert: (o) => o.text, max: 320 },
    { key: "soll", titel: "Soll", zahl: true, wert: (o) => o.soll || null, zeige: (o) => (o.soll ? betragText(o.soll) : "") },
    { key: "haben", titel: "Haben", zahl: true, wert: (o) => o.haben || null, zeige: (o) => (o.haben ? betragText(o.haben) : "") },
    { key: "offen", titel: "Offen", zahl: true, wert: (o) => o.offen, zeige: (o) => saldoText(o.offen), fest: true },
    { key: "tage", titel: "Tage", zahl: true, wert: (o) => tageSeit(o.datum, heute) },
  ];
  const [opAuswahl, setOpAuswahl] = useState<string | null>(null);
  return (
    <div className="ap-rahmen ap-rahmen-voll">
      <div className="ap-mitte">
        <div className="ap-filter" role="group" aria-label="Personenkontoblatt">
          <button type="button" className="es-knopf" onClick={onZurueck}>← Personenkonten</button>
          <span className="ap-chip ap-chip-gross"><span>{p.sammel ? "Sammeldebitor" : ART_TEXT[p.art]}</span><b>{p.nummer} {p.name}</b></span>
          <ZeitraumWahl jahr={jahr} wert={zeitraum} onWert={setZeitraum} />
        </div>
        <div className="ap-kontokopf">
          <b>{p.nummer} {p.name}</b>
          {p.kundennummer && <span className="small">Kd. {p.kundennummer}</span>}
          <span className="ap-luft" />
          <span>Eröffnung <b>{saldoText(blatt.eroeffnung)}</b></span>
          <span>Endsaldo <b>{saldoText(blatt.ende)}</b></span>
        </div>
        <DatenTabelle label={`Personenkonto ${p.nummer}`} spalten={spalten} zeilen={zeilen} schluessel={(z) => z.key}
          auswahl={gewaehlt?.key ?? null} onAuswahl={setAuswahl} onOeffnen={(z) => onOeffnen(z.buchung)}
          markiert={markiert} onMarkiert={setMarkiert} sortierung={sortierung} onSortierung={setSortierung} klasse="ap-tabelle-kurz"
          zeilenKlasse={(z) => (z.zustand === "storniert" ? "ap-gestrichen" : z.zustand === "storno" ? "ap-leise" : undefined)}
          summe={<>Verkehrszahlen Soll <b>{betragText(blatt.soll)}</b> · Haben <b>{betragText(blatt.haben)}</b> · Endsaldo <b>{saldoText(blatt.ende)}</b></>}
          leer="Keine Bewegung in diesem Zeitraum." />
        <h3 className="ap-unterkopf">Offene Posten {jahr}</h3>
        <DatenTabelle label={`Offene Posten ${p.nummer}`} spalten={opSpalten} zeilen={op} schluessel={(o) => o.beleg}
          auswahl={opAuswahl} onAuswahl={setOpAuswahl} onOeffnen={(o) => onOeffnen(o.buchungen[0])}
          markiert={new Set()} onMarkiert={() => {}} sortierung={null} onSortierung={() => {}} klasse="ap-tabelle-kurz"
          summe={<><b>{op.length === 1 ? "1 offener Posten" : `${op.length} offene Posten`}</b> · zusammen <b>{saldoText(Math.round(op.reduce((x, o) => x + o.offen, 0) * 100) / 100)}</b></>}
          leer="Nichts offen – alles ausgeglichen." />
        <div className="ap-status">
          <span>Offen ist, was je Belegnummer nicht auf null aufgeht (Rechnung gegen Zahlung, Skonto, Storno). Aus Vorjahren steht es im Vortrag.</span>
          <span className="ap-tasten">Enter öffnet die Buchung</span>
        </div>
      </div>
    </div>
  );
}

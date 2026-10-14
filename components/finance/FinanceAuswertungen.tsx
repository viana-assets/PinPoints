"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useFinEuer, useFinKontenblatt, useFinKonten, useFinSalden, useFinSteuerschluessel } from "@/lib/queries/hooks";
import { FIN_KONTO_KATEGORIEN, kontoNr, type FinKonto } from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";
import { FIN_BWA_KOSTEN, MONATSNAMEN, bwa, euer, kontenblattMitSaldo, summenSalden, type BwaWerte } from "@/lib/finance/auswertungen";
import { csv } from "@/lib/datev";
import { dateiHerunterladen } from "@/lib/download";
import { formatEUR } from "@/lib/format";
import { KontoWahl } from "./FinanceBuchungen";

// Finance › Auswertungen (Phase F6, Migration 94, v152): Summen- und Saldenliste, Kontenblatt, BWA und – bei
// EÜR – die Einnahmen-Überschuss-Rechnung. Alles lesend, als CSV für den Steuerberater. Probelauf aus dem, was in
// Finance gebucht ist.

type Reiter = "salden" | "konto" | "bwa" | "euer";

export function FinanceAuswertungen({ supabase, jahr, heute, einstellungen, onEinstellungen }: {
  supabase: SupabaseClient; jahr: number; heute: string; einstellungen: FinEinstellungen | null; onEinstellungen: () => void;
}) {
  const e = einstellungen;
  const rahmen = e?.kontenrahmen ?? "skr03";
  const istEuer = e?.gewinnermittlung === "euer";
  const [reiter, setReiter] = useState<Reiter>("salden");
  const laufend = heute.slice(0, 4) === String(jahr) ? Number(heute.slice(5, 7)) : 12;
  const [von, setVon] = useState(1);
  const [bis, setBis] = useState(laufend);
  const [konto, setKonto] = useState("");
  const saldenQ = useFinSalden(supabase, jahr, !!e);
  const kontenQ = useFinKonten(supabase, rahmen, !!e);
  const schluesselQ = useFinSteuerschluessel(supabase, rahmen, !!e && istEuer);
  const euerQ = useFinEuer(supabase, jahr, !!e && istEuer && reiter === "euer");
  const blattQ = useFinKontenblatt(supabase, jahr, konto ? Number(konto) : null, !!e && reiter === "konto");

  if (!e) {
    return (
      <div className="db-karte es-karte">
        <div className="es-zeile statisch"><span className="db-punkt-text"><b>Erst die Einstellungen für {jahr} speichern</b>
          <span className="small">Kontenrahmen und Gewinnermittlung bestimmen die Auswertungen.</span></span></div>
        <button type="button" className="btn-primary fi-knopf" onClick={onEinstellungen}>Zu den Einstellungen</button>
      </div>
    );
  }
  const konten = kontenQ.data ?? [];
  const salden = saldenQ.data ?? [];
  const name = (n: number) => konten.find((k) => k.nummer === n)?.bezeichnung ?? "";
  const reiterListe: [Reiter, string][] = [["salden", "Summen & Salden"], ["konto", "Kontenblatt"], ["bwa", "BWA"], ...(istEuer ? [["euer", "EÜR"] as [Reiter, string]] : [])];
  const monatWahl = (wert: number, setze: (n: number) => void, label: string, min = 1) => (
    <select className="fi-monat" value={wert} onChange={(ev) => setze(Number(ev.target.value))} aria-label={label}>
      {MONATSNAMEN.map((m, i) => i + 1 >= min && <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );

  return (
    <>
      {saldenQ.isError && <div className="fi-hinweis fi-rot" role="alert">Die Auswertungen konnten nicht geladen werden. Ist Migration 94 ausgeführt?</div>}
      <div className="lg-lagerwahl es-segment fi-reiter fi-reiter-breit" role="tablist" aria-label="Auswertungen">
        {reiterListe.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={reiter === k} className={reiter === k ? "aktiv" : ""} onClick={() => setReiter(k)}>{t}</button>
        ))}
      </div>

      {reiter === "salden" && (() => {
        const s = summenSalden(salden, konten, von, bis);
        return (
          <>
            <div className="fi-werkzeug">
              {monatWahl(von, (n) => { setVon(n); if (n > bis) setBis(n); }, "Von Monat")}
              <span className="small">bis</span>
              {monatWahl(bis, setBis, "Bis Monat", von)}
              <button type="button" className="btn-secondary fi-knopf" disabled={!s.zeilen.length} onClick={() => dateiHerunterladen(`Summen_Salden_${jahr}_${von}-${bis}.csv`,
                csv([["Konto", "Bezeichnung", "Soll", "Haben", "Saldo"], ...s.zeilen.map((z) => [kontoNr(z.konto), z.bezeichnung, z.soll, z.haben, z.saldo]), ["", "Summe", s.soll, s.haben, ""]]),
                "text/csv;charset=utf-8")}>Als CSV</button>
            </div>
            {saldenQ.isPending ? <div className="db-karte es-karte"><span className="small">Lädt …</span></div>
              : s.zeilen.length === 0 ? <div className="db-karte es-karte"><span className="small">In diesem Zeitraum ist nichts gebucht.</span></div>
              : FIN_KONTO_KATEGORIEN.map((kat) => {
                const liste = s.zeilen.filter((z) => z.kategorie === kat.wert);
                if (!liste.length) return null;
                return (
                  <div key={kat.wert} className="fi-gruppe">
                    <span className="op-gruppe-titel">{kat.text.toUpperCase()}</span>
                    <div className="db-karte es-karte">
                      {liste.map((z) => (
                        <button key={z.konto} type="button" className="es-zeile fi-buchung" onClick={() => { setKonto(String(z.konto)); setReiter("konto"); }}>
                          <span className="fi-nr">{kontoNr(z.konto)}</span>
                          <span className="db-punkt-text"><b>{z.bezeichnung}</b><span className="small">Soll {formatEUR(z.soll)} · Haben {formatEUR(z.haben)}</span></span>
                          <span className="fi-betrag">{saldoText(z.saldo)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            {s.zeilen.length > 0 && <span className="small es-fuss fi-fuss">Summe Soll {formatEUR(s.soll)} · Summe Haben {formatEUR(s.haben)}{s.soll === s.haben ? " – stimmt überein." : " – weicht ab!"} Ein Tipp auf ein Konto öffnet sein Kontenblatt.</span>}
          </>
        );
      })()}

      {reiter === "konto" && (
        <Kontenblatt konten={konten} konto={konto} setKonto={setKonto} laedt={blattQ.isFetching} zeilen={blattQ.data ?? []} jahr={jahr} name={name} />
      )}

      {reiter === "bwa" && (() => {
        const b = bwa(salden, konten, rahmen, bis);
        const zeilen: [string, (w: BwaWerte) => number, "fett" | "" | "leise"][] = [
          ["Umsatzerlöse", (w) => w.umsatz, ""],
          [FIN_BWA_KOSTEN[0].text, (w) => w.material, ""],
          ["Rohertrag", (w) => w.rohertrag, "fett"],
          ...FIN_BWA_KOSTEN.slice(1).map((k) => [k.text, (w: BwaWerte) => w.kosten[k.key], "leise"] as [string, (w: BwaWerte) => number, "leise"]),
          ["Gesamtkosten", (w) => w.gesamtkosten, ""],
          ["Betriebsergebnis", (w) => w.betriebsergebnis, "fett"],
          ["Sonstige Erträge", (w) => w.sonstigeErtraege, ""],
          ["Vorläufiges Ergebnis", (w) => w.ergebnis, "fett"],
        ];
        return (
          <>
            <div className="fi-werkzeug">
              {monatWahl(bis, setBis, "Monat")}
              <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`BWA_${jahr}_${String(bis).padStart(2, "0")}.csv`,
                csv([["Zeile", MONATSNAMEN[bis - 1], `Januar bis ${MONATSNAMEN[bis - 1]}`], ...zeilen.map(([t, f]) => [t, f(b.monat), f(b.kumuliert)])]), "text/csv;charset=utf-8")}>Als CSV</button>
            </div>
            <div className="db-karte es-karte">
              <table className="fi-tabelle fi-bwa">
                <thead><tr><th>Kurzfristige Erfolgsrechnung</th><th className="zahl">{MONATSNAMEN[bis - 1]}</th><th className="zahl">bis {MONATSNAMEN[bis - 1]}</th></tr></thead>
                <tbody>
                  {zeilen.map(([t, f, art]) => (art === "leise" && f(b.kumuliert) === 0 ? null : (
                    <tr key={t} className={art === "fett" ? "summe" : art === "leise" ? "steuer" : undefined}>
                      <td>{t}</td><td className="zahl">{formatEUR(f(b.monat))}</td><td className="zahl">{formatEUR(f(b.kumuliert))}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
            <span className="small es-fuss fi-fuss">Nach Buchungsdatum (Rechnungen, wenn sie ausgestellt sind), ohne Umsatzsteuer. {istEuer
              ? "Das steuerliche Ergebnis nach Zahlung steht unter EÜR."
              : "GuV und Bilanz nach HGB stehen unter Jahresabschluss."}</span>
          </>
        );
      })()}

      {reiter === "euer" && istEuer && (
        <EuerAnsicht stand={euerQ.data} laedt={euerQ.isPending} fehler={euerQ.isError} konten={konten} schluessel={schluesselQ.data ?? []}
          rahmen={rahmen} klein={e.besteuerung === "klein"} jahr={jahr} />
      )}
    </>
  );
}

function saldoText(saldo: number): string {
  return saldo === 0 ? formatEUR(0) : `${formatEUR(Math.abs(saldo))} ${saldo > 0 ? "S" : "H"}`;
}

function Kontenblatt({ konten, konto, setKonto, laedt, zeilen, jahr, name }: {
  konten: FinKonto[]; konto: string; setKonto: (k: string) => void; laedt: boolean;
  zeilen: Parameters<typeof kontenblattMitSaldo>[0]; jahr: number; name: (n: number) => string;
}) {
  const mit = kontenblattMitSaldo(zeilen);
  return (
    <>
      <div className="fi-werkzeug">
        <label className="nk-feld fi-suche"><span>Konto</span><KontoWahl wert={konto} konten={konten} onWert={setKonto} label="Konto für das Kontenblatt" /></label>
        {mit.length > 0 && <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`Kontenblatt_${konto}_${jahr}.csv`,
          csv([["Datum", "Nr.", "Text", "Beleg", "Gegenkonto", "Soll", "Haben", "Saldo"],
            ...mit.map((z) => [z.datum, z.nr, z.text, z.beleg ?? "", z.gegen ?? "", z.seite === "S" ? z.betrag : "", z.seite === "H" ? z.betrag : "", z.saldo])]),
          "text/csv;charset=utf-8")}>Als CSV</button>}
      </div>
      <div className="db-karte es-karte">
        {!konto ? <span className="small">Ein Konto wählen – oder unter Summen & Salden antippen.</span>
          : laedt && !mit.length ? <span className="small">Lädt …</span>
          : mit.length === 0 ? <span className="small">Auf {kontoNr(Number(konto))} {name(Number(konto))} ist {jahr} nichts gebucht.</span>
          : mit.map((z, i) => (
            <div key={`${z.nr}-${i}`} className={"es-zeile statisch fi-buchung" + (z.storno ? " fi-leise" : "")}>
              <span className="fi-nr">{z.nr}</span>
              <span className="db-punkt-text"><b>{z.text}</b>
                <span className="small">{datumKurz(z.datum)}{z.gegen ? ` · gegen ${z.gegen}` : ""}{z.beleg ? ` · ${z.beleg}` : ""} · Saldo {saldoText(z.saldo)}</span></span>
              <span className="fi-betrag">{z.seite === "S" ? formatEUR(z.betrag) : formatEUR(-z.betrag)}</span>
            </div>
          ))}
      </div>
      {mit.length > 0 && <span className="small es-fuss fi-fuss">Rechts: Soll positiv, Haben negativ. Saldo am Ende {saldoText(mit[mit.length - 1].saldo)}.</span>}
    </>
  );
}

function EuerAnsicht({ stand, laedt, fehler, konten, schluessel, rahmen, klein, jahr }: {
  stand: ReturnType<typeof useFinEuer>["data"]; laedt: boolean; fehler: boolean; konten: FinKonto[];
  schluessel: Parameters<typeof euer>[2]; rahmen: Parameters<typeof euer>[3]; klein: boolean; jahr: number;
}) {
  if (fehler) return <div className="fi-hinweis fi-rot" role="alert">Die EÜR konnte nicht geladen werden.</div>;
  if (laedt || !stand) return <div className="db-karte es-karte"><span className="small">Lädt …</span></div>;
  if (!stand.eingerichtet) return <div className="db-karte es-karte"><span className="small">Für {jahr} sind die Einstellungen nicht gespeichert.</span></div>;
  const x = euer(stand, konten, schluessel, rahmen, klein);
  const zeile = (kz: string | null, text: string, betrag: number, klasse?: string) => (
    <tr key={`${kz}-${text}`} className={klasse}><td>{kz ?? ""}</td><td>{text}</td><td className="zahl">{formatEUR(betrag)}</td></tr>
  );
  return (
    <>
      <div className="fi-werkzeug">
        <button type="button" className="btn-secondary fi-knopf" onClick={() => dateiHerunterladen(`EUER_${jahr}.csv`, csv([
          ["Kz", "Zeile", "Betrag"],
          ...x.einnahmen.map((z) => [z.kz, z.text, z.betrag]), ["159", "Summe Betriebseinnahmen", x.summeEinnahmen],
          ...x.ausgaben.map((z) => [z.kz, z.text, z.betrag]), ["199", "Summe Betriebsausgaben", x.summeAusgaben],
          ["", "Gewinn / Verlust", x.gewinn],
        ]), "text/csv;charset=utf-8")}>Als CSV</button>
      </div>
      <div className="db-karte es-karte">
        <table className="fi-tabelle fi-ust">
          <thead><tr><th>Kz</th><th>Einnahmen-Überschuss-Rechnung {jahr}</th><th className="zahl">Betrag</th></tr></thead>
          <tbody>
            {x.einnahmen.length === 0 && zeile(null, "Noch keine Betriebseinnahmen", 0)}
            {x.einnahmen.map((z) => zeile(z.kz, z.text, z.betrag))}
            {zeile("159", "Summe Betriebseinnahmen", x.summeEinnahmen, "summe")}
            {x.ausgaben.map((z) => zeile(z.kz, z.text, z.betrag))}
            {zeile("199", "Summe Betriebsausgaben", x.summeAusgaben, "summe")}
          </tbody>
          <tfoot><tr><td /><td>{x.gewinn >= 0 ? "Gewinn" : "Verlust"}</td><td className="zahl">{formatEUR(x.gewinn)}</td></tr></tfoot>
        </table>
      </div>
      {x.unklar !== 0 && <div className="fi-hinweis fi-warn">{formatEUR(x.unklar)} kamen auf Forderungen oder Verbindlichkeiten an, zu denen es in Finance keine Rechnung bzw. keinen Beleg gibt – sie stehen oben nicht drin. Mit dem Steuerberater klären.</div>}
      <span className="small es-fuss fi-fuss">Nach Zahlung: Einnahmen, wenn das Geld da ist, Ausgaben, wenn es weg ist (Teilzahlungen anteilig), dazu Abschreibungen.
        {x.anlagen !== 0 ? ` Anschaffungen von Anlagen (${formatEUR(x.anlagen)}) sind keine Ausgabe – sie wirken über die Abschreibung.` : ""}
        {x.privat !== 0 ? ` Privatentnahmen und -einlagen (${formatEUR(x.privat)}) zählen nicht.` : ""}
        {x.nichtAbziehbar !== 0 ? ` Nicht abziehbare Bewirtung: ${formatEUR(x.nichtAbziehbar)}.` : ""}
        {" "}Kennzahlen nach dem Vordruck 2025 – vor der Abgabe mit dem Steuerberater abgleichen.</span>
    </>
  );
}

function datumKurz(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

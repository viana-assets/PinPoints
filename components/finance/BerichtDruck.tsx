"use client";

import { Blatt } from "@/components/Blatt";
import { formatEUR } from "@/lib/format";

// Ein Bericht als PDF (Stufe G, v186): Tabelle im A4-Querformat mit Kopf (Bericht, Zeitraum, Stand) – gedruckt bzw.
// als PDF gespeichert über den Druckdialog des Browsers, mit denselben Druckregeln wie Rechnung und Mahnung
// (`druck-fenster`, globals.css). Zahlen erscheinen als Euro, Text bleibt Text.
export type BerichtZelle = string | number | null;
export type BerichtZeile = { zellen: BerichtZelle[]; art?: "summe" | "leise" };

// Querformat nur, solange dieses Fenster offen ist (wie RECHNUNG_SEITE_CSS beim Rechnungsfenster).
const BERICHT_SEITE_CSS = "@page { size: A4 landscape; margin: 12mm 14mm; }";

// Eine Spalte ist eine Zahlenspalte (rechtsbündig), wenn jede gefüllte Zelle eine Zahl, Prozentangabe oder „–“ ist.
function zahlenspalte(zeilen: BerichtZeile[], i: number): boolean {
  const zellen = zeilen.map((z) => z.zellen[i]).filter((c) => c != null && c !== "");
  return i > 0 && zellen.length > 0 && zellen.every((c) => typeof c === "number" || /^[+−-]?[\d.,]+\s?%$|^–$/.test(String(c)));
}

export function BerichtDruck({ titel, unter, kopf, zeilen, fuss, firma, stand, onClose }: {
  titel: string; unter: string; kopf: string[]; zeilen: BerichtZeile[]; fuss?: string; firma?: string; stand: string; onClose: () => void;
}) {
  return (
    <Blatt breite="dokument" ebene="druck-fenster modal-storno" className="fi-bericht-blatt" titel={titel} unter={unter} onClose={onClose}
      fuss={<button type="button" className="btn-primary" onClick={() => window.print()}>Drucken / als PDF speichern</button>}>
      <style>{BERICHT_SEITE_CSS}</style>
      <div className="fi-bericht">
        <div className="fi-bericht-kopf">
          <div><b>{titel}</b><span>{unter}</span></div>
          <div className="fi-bericht-stand">{firma ? <span>{firma}</span> : null}<span>Stand {stand} · Finance (Probelauf, ohne Gewähr)</span></div>
        </div>
        <table className="fi-bericht-tabelle">
          <thead><tr>{kopf.map((k, i) => <th key={i} className={zahlenspalte(zeilen, i) ? "zahl" : undefined}>{k}</th>)}</tr></thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr key={i} className={z.art}>
                {z.zellen.map((c, j) => <td key={j} className={typeof c === "number" || zahlenspalte(zeilen, j) ? "zahl" : undefined}>{typeof c === "number" ? formatEUR(c) : c ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {fuss && <p className="fi-bericht-fuss">{fuss}</p>}
      </div>
    </Blatt>
  );
}

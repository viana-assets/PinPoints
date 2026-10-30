"use client";
import { FIN_KOST_ARTEN, kostAuswahl, type FinKostenstelle, type KostArt } from "@/lib/finance/kostenstellen";

// Auswahl einer Kostenstelle (Transporter = KOST1) oder eines Kostenträgers (Leistung = KOST2), Migration 108, v182.
// `kurz`: nur die Nummer in der Liste (Erfassungszeile des Stapels), die Bezeichnung steht im Hinweis.
export function KostWahl({ art, liste, wert, onWert, kurz, feld }: {
  art: KostArt; liste: FinKostenstelle[]; wert: string; onWert: (n: string) => void; kurz?: boolean; feld?: string;
}) {
  const a = FIN_KOST_ARTEN.find((x) => x.wert === art)!;
  const optionen = kostAuswahl(liste, art, wert);
  return (
    <select value={wert} aria-label={a.text} data-feld={feld} onChange={(e) => onWert(e.target.value)}
      title={optionen.find((k) => k.nummer === wert)?.bezeichnung ?? a.leer}>
      <option value="">{kurz ? "–" : a.leer}</option>
      {optionen.map((k) => <option key={k.id} value={k.nummer} title={k.bezeichnung}>{kurz ? k.nummer : `${k.nummer} · ${k.bezeichnung}`}</option>)}
    </select>
  );
}

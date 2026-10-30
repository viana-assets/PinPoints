"use client";
import { useEffect, useState } from "react";
import { kurzbefehl, type Kurzbefehl } from "@/lib/finance/arbeitsplatz";
import { zeitraumFehler, zeitraumKey, zeitraumVorgaben, type Zeitraum } from "@/lib/finance/kontoblatt";

// Kleine Bausteine des Finance-Arbeitsplatzes, die Journal, Kontoblatt und Konten teilen (v179, Stufe B).

// Kurzbefehle F2/F3/N für die ganze Seite (`kurzbefehl` in lib/finance/arbeitsplatz.ts). Über einem offenen Fenster
// gelten sie nicht – das Buchungsfenster hat eigene. `ausfuehren` gibt zurück, ob es den Befehl genommen hat; nur
// dann wird die Taste dem Browser weggenommen (F3 wäre sonst „Weitersuchen“).
export function useKurzbefehle(ausfuehren: (b: Kurzbefehl) => boolean) {
  useEffect(() => {
    const hoeren = (e: KeyboardEvent) => {
      if (document.querySelector("[role='dialog']")) return;
      const ziel = e.target as HTMLElement | null;
      const b = kurzbefehl(e, !!ziel?.closest?.("input, textarea, select, [contenteditable='true']"));
      if (b && ausfuehren(b)) e.preventDefault();
    };
    window.addEventListener("keydown", hoeren);
    return () => window.removeEventListener("keydown", hoeren);
  }, [ausfuehren]);
}

// Zeitraum als Chip: ganzes Jahr, Quartal, Monat – oder frei von–bis (beide Tage im Wirtschaftsjahr).
export function ZeitraumWahl({ jahr, wert, onWert }: { jahr: number; wert: Zeitraum; onWert: (z: Zeitraum) => void }) {
  const vorgaben = zeitraumVorgaben(jahr);
  const [frei, setFrei] = useState(() => zeitraumKey(jahr, wert) === "frei");
  const [von, setVon] = useState(wert.von);
  const [bis, setBis] = useState(wert.bis);
  const fehler = frei ? zeitraumFehler(jahr, { von, bis }) : null;
  const neu = (v: string, b: string) => { setVon(v); setBis(b); if (!zeitraumFehler(jahr, { von: v, bis: b })) onWert({ von: v, bis: b }); };
  return (
    <span className={"ap-chip" + (fehler ? " ap-falsch" : "")} title={fehler ?? undefined}>
      <span>Zeitraum</span>
      <select aria-label="Zeitraum" value={frei ? "frei" : zeitraumKey(jahr, wert)} onChange={(e) => {
        if (e.target.value === "frei") { setFrei(true); setVon(wert.von); setBis(wert.bis); return; }
        const v = vorgaben.find((x) => x.key === e.target.value);
        if (v) { setFrei(false); setVon(v.von); setBis(v.bis); onWert({ von: v.von, bis: v.bis }); }
      }}>
        {vorgaben.map((v) => <option key={v.key} value={v.key}>{v.text}</option>)}
        <option value="frei">von – bis …</option>
      </select>
      {frei && (
        <>
          <input type="date" className="ap-tag" aria-label="Zeitraum von" value={von} min={`${jahr}-01-01`} max={`${jahr}-12-31`} onChange={(e) => neu(e.target.value, bis)} />
          <span aria-hidden="true">–</span>
          <input type="date" className="ap-tag" aria-label="Zeitraum bis" value={bis} min={`${jahr}-01-01`} max={`${jahr}-12-31`} onChange={(e) => neu(von, e.target.value)} />
        </>
      )}
    </span>
  );
}

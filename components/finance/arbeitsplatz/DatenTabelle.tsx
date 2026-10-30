"use client";
import { useRef, type ReactNode } from "react";
import { naechsteSortierung, tastenZiel, type Sortierung, type SpaltenWert } from "@/lib/finance/arbeitsplatz";

// Die Datentabelle des Finance-Arbeitsplatzes (v178, Stufe A): dichte Zeilen (32 px), fester Kopf, Sortieren per
// Klick auf den Spaltenkopf, Tastatur (↑ ↓ Bild auf/ab Pos1 Ende wählen, Leertaste markiert, Enter öffnet),
// Häkchen für die Mehrfachauswahl, Summenzeile. Sortiert, gefiltert und exportiert wird beim Aufrufer – die Tabelle
// zeigt, was sie bekommt, und meldet Klicks (Regeln in lib/finance/arbeitsplatz.ts).
//
// Für alle Listen von Stufe B an (Kontoblatt, Personenkonten, Bank) gedacht; zuerst im Journal.

export type Spalte<T> = {
  key: string;
  titel: string;
  // Rechtsbündig mit Ziffern gleicher Breite.
  zahl?: boolean;
  // Was sortiert und exportiert wird.
  wert: (z: T) => SpaltenWert;
  // Was in der Zelle steht, wenn es mehr als der Wert sein soll (Link, Abzeichen).
  zeige?: (z: T) => ReactNode;
  // Darf nicht ausgeblendet werden.
  fest?: boolean;
  // Höchstbreite der Zelle in px (lange Bezeichnungen enden mit „…“); sonst 300 px aus app/globals.css.
  max?: number;
};

export function DatenTabelle<T>({ spalten, zeilen, schluessel, auswahl, onAuswahl, onOeffnen, markiert, onMarkiert, sortierung,
  onSortierung, summe, leer, zeilenKlasse, label }: {
  spalten: Spalte<T>[];
  zeilen: T[];
  schluessel: (z: T) => string;
  auswahl: string | null;
  onAuswahl: (key: string) => void;
  onOeffnen?: (z: T) => void;
  markiert: ReadonlySet<string>;
  onMarkiert: (neu: Set<string>) => void;
  sortierung: Sortierung;
  onSortierung: (s: Sortierung) => void;
  // Inhalt der Summenzeile (eine Zelle über die ganze Breite nach der ersten Spalte).
  summe?: ReactNode;
  leer: ReactNode;
  zeilenKlasse?: (z: T) => string | undefined;
  label: string;
}) {
  const kastenRef = useRef<HTMLDivElement>(null);
  const index = auswahl == null ? -1 : zeilen.findIndex((z) => schluessel(z) === auswahl);
  const alleMarkiert = zeilen.length > 0 && zeilen.every((z) => markiert.has(schluessel(z)));

  const zeigeZeile = (key: string) => {
    // Erst nach dem Zeichnen steht die neue Zeile im Baum.
    requestAnimationFrame(() => {
      const el = [...(kastenRef.current?.querySelectorAll<HTMLElement>("tr[data-key]") ?? [])].find((x) => x.dataset.key === key);
      el?.scrollIntoView?.({ block: "nearest" });
    });
  };
  const umschalten = (key: string) => {
    const neu = new Set(markiert);
    if (neu.has(key)) neu.delete(key); else neu.add(key);
    onMarkiert(neu);
  };

  function taste(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, button, select, textarea, a")) return;
    const ziel = tastenZiel(e.key, index, zeilen.length);
    if (ziel != null) {
      e.preventDefault();
      const key = schluessel(zeilen[ziel]);
      onAuswahl(key);
      zeigeZeile(key);
      return;
    }
    if (index < 0) return;
    if (e.key === " ") { e.preventDefault(); umschalten(schluessel(zeilen[index])); }
    else if (e.key === "Enter" && onOeffnen) { e.preventDefault(); onOeffnen(zeilen[index]); }
  }

  return (
    <div className="ap-tabelle" ref={kastenRef} tabIndex={0} role="region" aria-label={label}
      onKeyDown={taste}>
      <table>
        <thead>
          <tr>
            <th className="ap-cb">
              <input type="checkbox" aria-label="Alle markieren" checked={alleMarkiert} disabled={!zeilen.length}
                onChange={() => onMarkiert(alleMarkiert ? new Set() : new Set(zeilen.map(schluessel)))} />
            </th>
            {spalten.map((s) => {
              const an = sortierung?.spalte === s.key ? sortierung.richtung : null;
              return (
                <th key={s.key} className={s.zahl ? "ap-zahl" : undefined}
                  aria-sort={an === "auf" ? "ascending" : an === "ab" ? "descending" : "none"}>
                  <button type="button" className="ap-kopf" onClick={() => onSortierung(naechsteSortierung(sortierung, s.key))}>
                    {s.titel}
                    {an && <span className="ap-pfeil" aria-hidden="true">{an === "auf" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {zeilen.length === 0 ? (
            <tr><td colSpan={spalten.length + 1} className="ap-leer">{leer}</td></tr>
          ) : zeilen.map((z) => {
            const key = schluessel(z);
            const gewaehlt = key === auswahl;
            return (
              <tr key={key} data-key={key} aria-selected={gewaehlt}
                className={[gewaehlt ? "ap-gewaehlt" : "", markiert.has(key) ? "ap-markiert" : "", zeilenKlasse?.(z) ?? ""].filter(Boolean).join(" ") || undefined}
                onClick={() => { onAuswahl(key); kastenRef.current?.focus({ preventScroll: true }); }}
                onDoubleClick={() => onOeffnen?.(z)}>
                <td className="ap-cb" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label="Markieren" checked={markiert.has(key)} onChange={() => umschalten(key)} />
                </td>
                {spalten.map((s) => (
                  <td key={s.key} className={s.zahl ? "ap-zahl" : undefined} style={s.max ? { maxWidth: s.max } : undefined}>{s.zeige ? s.zeige(z) : s.wert(z)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {summe != null && zeilen.length > 0 && (
          <tfoot><tr><td className="ap-cb" /><td colSpan={spalten.length}>{summe}</td></tr></tfoot>
        )}
      </table>
    </div>
  );
}

// Spalten ein- und ausblenden: eine kleine Liste mit Häkchen unter einem Knopf.
export function SpaltenWahl<T>({ spalten, aus, onAus }: { spalten: Spalte<T>[]; aus: ReadonlySet<string>; onAus: (neu: Set<string>) => void }) {
  return (
    <details className="ap-spaltenwahl">
      <summary className="es-knopf">Spalten</summary>
      <div className="ap-spaltenliste" role="group" aria-label="Sichtbare Spalten">
        {spalten.filter((s) => !s.fest).map((s) => (
          <label key={s.key}>
            <input type="checkbox" checked={!aus.has(s.key)} onChange={() => {
              const neu = new Set(aus);
              if (neu.has(s.key)) neu.delete(s.key); else neu.add(s.key);
              onAus(neu);
            }} />
            {s.titel}
          </label>
        ))}
      </div>
    </details>
  );
}

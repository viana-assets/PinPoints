"use client";

import { useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { dauerText, naechsterVorschlag, zeitAusEingabe, zeitVorschlaege } from "@/lib/zeitEingabe";

// Uhrzeit tippen ODER wählen (v168) – statt `<input type="time">`, dessen Minutenrolle am Rechner 60 Einträge hatte
// und das sich nur Stelle für Stelle tippen ließ (Bildschirmfoto Vitali, 19.10.2026).
//
// Tippen: „9“, „930“, „9:30“, „9.30“ … – übernommen beim Verlassen des Felds oder mit Enter (`zeitAusEingabe`).
// Nicht Lesbares wird verworfen, das Feld zeigt dann wieder den alten Wert. Wählen: Beim Antippen klappt eine Liste im
// Viertelstundentakt auf (Pfeiltasten, Enter, Klick), beim „bis“-Feld nur Zeiten nach dem Beginn, mit Dauer daneben.
// Am Handy dieselbe Liste und die Zifferntastatur (`inputMode="numeric"`, ein Doppelpunkt ist nicht nötig).
// Wie MengeFeld/PreisFeld (v163): Solange das Feld den Fokus hat, gehört der Text ihm – gespeichert wird beim Verlassen.
export function ZeitFeld({ wert, onWert, ab, ariaLabel, inputRef, ungueltig, disabled, scrollZiel = "08:00" }: {
  wert: string;
  onWert: (hhmm: string) => void;
  // Beginn, wenn dies das „bis“-Feld ist: Liste erst danach, mit Dauer.
  ab?: string | null;
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  ungueltig?: boolean;
  disabled?: boolean;
  // Wohin die Liste beim Öffnen rollt, solange noch nichts eingetragen ist.
  scrollZiel?: string;
}) {
  const [fokus, setFokus] = useState(false);
  const [text, setTextZustand] = useState(wert);
  // Der Text auch im Ref: `onBlur` läuft direkt nach einem Klick in die Liste, noch bevor React den neuen Zustand
  // gerendert hat – mit dem Zustand allein überschriebe er die gewählte Zeit mit der alten.
  const textRef = useRef(wert);
  const setText = (t: string) => { textRef.current = t; setTextZustand(t); };
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(-1);
  const listeRef = useRef<HTMLDivElement | null>(null);
  // Das Feld über die Hülle finden: `inputRef` gehört dem Aufrufer (Fokus beim Öffnen des Auftrags).
  const huelleRef = useRef<HTMLSpanElement | null>(null);
  const feld = () => huelleRef.current?.querySelector("input") ?? null;
  const listenId = useId();
  const liste = useMemo(() => zeitVorschlaege(ab), [ab]);

  // Die markierte Zeile (oder beim leeren Feld die Zielzeit) in die Mitte der Liste rollen – nur die Liste, nicht das
  // Fenster dahinter (deshalb kein scrollIntoView).
  useEffect(() => {
    if (!offen || !listeRef.current) return;
    const i = markiert >= 0 ? markiert : Math.max(0, naechsterVorschlag(liste, ab ? null : scrollZiel));
    const el = listeRef.current.children[i] as HTMLElement | undefined;
    if (el) listeRef.current.scrollTop = el.offsetTop - listeRef.current.clientHeight / 2 + el.offsetHeight / 2;
  }, [offen, markiert, liste, ab, scrollZiel]);

  // Gemerkt, was zuletzt gemeldet wurde: Nach Enter folgt noch ein blur – derselbe Wert soll nicht zweimal gehen.
  const gemeldetRef = useRef<string | null>(null);
  function uebernehmen(t: string) {
    const z = zeitAusEingabe(t);
    if (z !== null && z !== wert && z !== gemeldetRef.current) { gemeldetRef.current = z; onWert(z); }
    setText(z ?? wert);
  }
  function waehlen(z: string) {
    setText(z);
    if (z !== wert) { gemeldetRef.current = z; onWert(z); }
    setOffen(false);
    feld()?.blur();
  }

  return (
    <span className={"zf" + (offen ? " offen" : "")} ref={huelleRef}>
      <input
        ref={inputRef}
        type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={8}
        role="combobox" aria-expanded={offen} aria-controls={listenId} aria-label={ariaLabel} aria-invalid={ungueltig || undefined}
        className={ungueltig ? "feld-fehlt" : undefined}
        placeholder="hh:mm" disabled={disabled}
        value={fokus ? text : wert}
        onFocus={(e) => {
          setFokus(true); setText(wert); setOffen(true); gemeldetRef.current = null;
          setMarkiert(naechsterVorschlag(liste, wert));
          const el = e.currentTarget; setTimeout(() => el.select(), 0);
        }}
        onChange={(e) => {
          setText(e.target.value); setOffen(true);
          const z = zeitAusEingabe(e.target.value);
          setMarkiert(z ? naechsterVorschlag(liste, z) : -1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOffen(true);
            const i = Math.max(0, Math.min(liste.length - 1, markiert + (e.key === "ArrowDown" ? 1 : -1)));
            setMarkiert(i);
            if (liste[i]) setText(liste[i]);
          } else if (e.key === "Enter") {
            e.preventDefault();
            uebernehmen(textRef.current); setOffen(false); e.currentTarget.blur();
          } else if (e.key === "Escape" && offen) {
            e.stopPropagation();
            setText(wert); setOffen(false);
          }
        }}
        onBlur={() => { uebernehmen(textRef.current); setFokus(false); setOffen(false); }}
      />
      <button type="button" className="zf-uhr" tabIndex={-1} aria-label={`${ariaLabel}: Liste öffnen`} disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.preventDefault(); if (offen) setOffen(false); else feld()?.focus(); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      </button>
      {offen && !disabled && (
        <div className="zf-liste" id={listenId} role="listbox" aria-label={`${ariaLabel} wählen`} ref={listeRef}>
          {liste.map((z, i) => {
            const dauer = ab ? dauerText(ab, z) : null;
            return (
              <button key={z} type="button" role="option" aria-selected={i === markiert} className={"zf-zeile" + (i === markiert ? " an" : "")}
                onMouseDown={(e) => e.preventDefault()}
                // preventDefault: Das Feld steht meist in einem <label>; dessen Klick holte sonst den Fokus zurück, und die
                // Liste ginge gleich wieder auf.
                onClick={(e) => { e.preventDefault(); waehlen(z); }}>
                {z}{dauer && <span className="zf-dauer">{dauer}</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

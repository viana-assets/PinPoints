"use client";
import { useId, useRef, useState } from "react";
import { betragLesen, kontoNr, type FinKonto } from "@/lib/finance/buchung";
import { betragText, kontoAusEingabe, kontoVorschlaege } from "@/lib/finance/arbeitsplatz";

// Konto per Nummer oder Name (v178, Stufe A): „4530“ oder „tank“ tippen, Vorschläge mit ↑ ↓, Enter oder Tab nimmt
// den hellen Vorschlag. Daneben steht die Bezeichnung des gewählten Kontos; eine Eingabe, die kein Konto eindeutig
// meint, wird rot. Regeln: `kontoVorschlaege`/`kontoAusEingabe` in lib/finance/arbeitsplatz.ts.
//
// Das Feld hält seinen Text selbst, solange es den Fokus hat (CLAUDE.md, Fallstrick „Eingabefeld verliert Ziffern“).
export function KontoFeld({ konten, wert, onWert, label, autoFocus, platzhalter = "Nummer oder Name" }: {
  konten: FinKonto[];
  wert: number | null;
  onWert: (n: number | null) => void;
  label: string;
  autoFocus?: boolean;
  platzhalter?: string;
}) {
  const listeId = useId();
  const [text, setText] = useState(wert != null ? kontoNr(wert) : "");
  const [fokus, setFokus] = useState(false);
  const [hell, setHell] = useState(0);
  const [zu, setZu] = useState(false);
  // Tab nimmt einen Vorschlag UND verlässt das Feld: Das Verlassen sähe noch den alten Text und dürfte die Wahl
  // nicht wieder überschreiben.
  const genommen = useRef(false);
  const anzeige = fokus ? text : wert != null ? kontoNr(wert) : text;
  const genau = wert != null && text.trim() === kontoNr(wert);
  const vorschlaege = fokus && !zu && !genau ? kontoVorschlaege(konten, text) : [];
  const offen = vorschlaege.length > 0;
  const name = wert != null ? konten.find((k) => k.nummer === wert)?.bezeichnung ?? null : null;
  const falsch = !fokus && wert == null && text.trim() !== "";

  const nehmen = (k: FinKonto) => {
    genommen.current = true;
    setText(kontoNr(k.nummer));
    setZu(true);
    onWert(k.nummer);
  };

  function taste(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && offen) { e.preventDefault(); setHell((hell + 1) % vorschlaege.length); }
    else if (e.key === "ArrowUp" && offen) { e.preventDefault(); setHell((hell - 1 + vorschlaege.length) % vorschlaege.length); }
    else if (e.key === "Enter" && offen) { e.preventDefault(); nehmen(vorschlaege[Math.min(hell, vorschlaege.length - 1)]); }
    // Tab nimmt den Vorschlag und geht weiter (kein preventDefault).
    else if (e.key === "Tab" && offen) nehmen(vorschlaege[Math.min(hell, vorschlaege.length - 1)]);
    else if (e.key === "Escape" && offen) { e.preventDefault(); e.stopPropagation(); setZu(true); }
  }

  return (
    <span className={"ap-konto" + (falsch ? " ap-falsch" : "")}>
      <input value={anzeige} placeholder={platzhalter} aria-label={label} autoFocus={autoFocus} autoComplete="off"
        role="combobox" aria-expanded={offen} aria-controls={listeId} aria-invalid={falsch || undefined}
        aria-activedescendant={offen ? `${listeId}-${Math.min(hell, vorschlaege.length - 1)}` : undefined}
        onFocus={() => { setText(anzeige); setFokus(true); setZu(false); }}
        onBlur={() => { setFokus(false); if (!genau && !genommen.current) onWert(kontoAusEingabe(konten, text)); }}
        onChange={(e) => {
          const v = e.target.value;
          genommen.current = false;
          setText(v);
          setHell(0);
          setZu(false);
          // Eine vollständige Nummer gilt sofort (die Vorschau rechnet dann schon mit).
          onWert(/^\d+$/.test(v.trim()) ? kontoAusEingabe(konten, v) : null);
        }}
        onKeyDown={taste} />
      {offen && (
        <ul className="ap-vorschlaege" id={listeId} role="listbox" aria-label={`Konten zu „${text.trim()}“`}>
          {vorschlaege.map((k, i) => (
            <li key={k.nummer} id={`${listeId}-${i}`} role="option" aria-selected={i === hell} className={i === hell ? "hell" : undefined}
              onMouseDown={(e) => { e.preventDefault(); nehmen(k); }}>
              <b>{kontoNr(k.nummer)}</b> {k.bezeichnung}
            </li>
          ))}
        </ul>
      )}
      <span className="ap-kontoname" aria-live="polite">{falsch ? "kein eindeutiges Konto" : name ?? ""}</span>
    </span>
  );
}

// Betrag als Text mit Komma, rechtsbündig; beim Verlassen schön gesetzt („1234,5“ → „1.234,50“). Ein Text, der
// kein Betrag ist, bleibt stehen, damit man ihn korrigieren kann (`betragLesen` in lib/finance/buchung.ts).
export function BetragFeld({ text, onText, label, autoFocus }: {
  text: string; onText: (t: string) => void; label: string; autoFocus?: boolean;
}) {
  const falsch = text.trim() !== "" && betragLesen(text) == null;
  return (
    <input className={"ap-betrag" + (falsch ? " ap-falsch" : "")} inputMode="decimal" value={text} placeholder="0,00" aria-label={label}
      aria-invalid={falsch || undefined} autoFocus={autoFocus} autoComplete="off"
      onChange={(e) => onText(e.target.value)}
      onBlur={() => { const n = betragLesen(text); if (n != null) onText(betragText(n)); }} />
  );
}

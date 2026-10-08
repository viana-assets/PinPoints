import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  bezugAus, bezugGeloescht, CHAT_BEZUG_ANSICHT, CHAT_TEXT_MAX, erwaehnteIds, erwaehnungEinsetzen,
  erwaehnungsAnfrage, erwaehnungsVorschlaege, initialen, nachTagen, personenFarbe, textTeile, uhrzeit,
  type ChatBezug, type ChatNachricht, type ChatPerson,
} from "@/lib/chat";
import { ROLE_LABEL } from "@/lib/constants";

// Der Team-Chat (Migration 80, v129, Entwurf „Team-Chat“ vom 08.10.2026). Am Handy über den
// ganzen Bildschirm, am Rechner als Fenster rechts. Ebene 10003 (`.ch-overlay`): Er geht auch
// aus dem Auftrags- oder Kundenfenster heraus auf („In den Chat“) und liegt dann darüber.
//
// Nur mit Netz: Ohne Verbindung steht ein Hinweis da, und Senden ist gesperrt. Eine Nachricht,
// die erst Stunden später ankommt, wäre im Chat irreführender als eine, die gar nicht abgeht.

type Props = {
  nachrichten: ChatNachricht[];
  laedt: boolean;
  fehler: string | null;
  personen: ChatPerson[];
  ichId: string | null;
  darfSchreiben: boolean;
  online: boolean;
  // Die Karte, die an der Eingabe hängt (aus „In den Chat“ oder über „+“).
  bezug: ChatBezug | null;
  onBezug: (b: ChatBezug | null) => void;
  vorschlaege: (suche: string) => ChatBezug[];
  onSenden: (n: { text: string; bezug: ChatBezug | null; erwaehnt: string[] }) => Promise<void>;
  // Kann diese Rolle die Karte öffnen? Sonst ist sie nur zu lesen.
  kannOeffnen: (b: ChatBezug) => boolean;
  onBezugOeffnen: (b: ChatBezug) => void;
  onClose: () => void;
};

function BezugKarte({ b, klein, onOeffnen, onWeg }: { b: ChatBezug; klein?: boolean; onOeffnen?: () => void; onWeg?: () => void }) {
  const ansicht = CHAT_BEZUG_ANSICHT[b.art];
  const weg = bezugGeloescht(b);
  const inhalt = (
    <>
      <span className="ch-sym" aria-hidden="true">{ansicht.zeichen}</span>
      <span className="ch-bezug-text">
        <b>{b.titel}</b>
        {b.unter && <span>{b.unter}</span>}
        {onOeffnen && !weg && !klein && <span className="ch-oeffnen">{ansicht.oeffnen}</span>}
      </span>
    </>
  );
  const klasse = `ch-bezug ${ansicht.klasse}${klein ? " klein" : ""}${weg ? " weg" : ""}`;
  if (onWeg) {
    return (
      <div className={klasse}>
        {inhalt}
        <button type="button" className="ch-weg" onClick={onWeg} aria-label="Karte entfernen">✕</button>
      </div>
    );
  }
  return onOeffnen && !weg
    ? <button type="button" className={klasse} onClick={onOeffnen}>{inhalt}</button>
    : <div className={klasse}>{inhalt}</div>;
}

export function ChatFenster(p: Props) {
  const [text, setText] = useState("");
  const [ausgewaehlt, setAusgewaehlt] = useState<ChatPerson[]>([]);
  const [anfrage, setAnfrage] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState<string | null>(null);
  const [plusOffen, setPlusOffen] = useState(false);
  const [plusSuche, setPlusSuche] = useState("");
  const verlaufRef = useRef<HTMLDivElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);

  const nameNach = useMemo(() => new Map(p.personen.map((x) => [x.id, x.name])), [p.personen]);
  const gruppen = useMemo(() => nachTagen(p.nachrichten), [p.nachrichten]);
  const vorschlaege = anfrage === null ? [] : erwaehnungsVorschlaege(p.personen, anfrage, p.ichId).slice(0, 6);
  const andere = p.personen.filter((x) => x.id !== p.ichId).map((x) => x.name);

  // Neue Nachricht → nach unten. Beim ersten Öffnen ebenso.
  const anzahl = p.nachrichten.length;
  useLayoutEffect(() => {
    const v = verlaufRef.current;
    if (v) v.scrollTop = v.scrollHeight;
  }, [anzahl]);

  // Escape schließt – erst die offene Auswahl, dann das Fenster.
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (plusOffen) setPlusOffen(false);
      else if (anfrage !== null) setAnfrage(null);
      else p.onClose();
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  function textAendern(neu: string, cursor: number) {
    setText(neu.slice(0, CHAT_TEXT_MAX));
    setAnfrage(erwaehnungsAnfrage(neu.slice(0, cursor)));
    setSendeFehler(null);
  }

  function erwaehnen(person: ChatPerson) {
    const feld = feldRef.current;
    const cursor = feld?.selectionStart ?? text.length;
    const neu = erwaehnungEinsetzen(text, cursor, person.name);
    setText(neu.text);
    setAnfrage(null);
    setAusgewaehlt((alt) => (alt.some((x) => x.id === person.id) ? alt : [...alt, person]));
    requestAnimationFrame(() => {
      feld?.focus();
      feld?.setSelectionRange(neu.cursor, neu.cursor);
    });
  }

  const kannSenden = p.darfSchreiben && p.online && !sendet && text.trim().length > 0;

  async function senden() {
    if (!kannSenden) return;
    setSendet(true);
    setSendeFehler(null);
    try {
      const t = text.trim();
      await p.onSenden({ text: t, bezug: p.bezug, erwaehnt: erwaehnteIds(t, ausgewaehlt) });
      setText("");
      setAusgewaehlt([]);
      setAnfrage(null);
    } catch (e) {
      setSendeFehler(e instanceof Error ? e.message : "Die Nachricht konnte nicht gesendet werden.");
    } finally {
      setSendet(false);
    }
  }

  function taste(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Am Rechner schickt Enter ab, Umschalt+Enter macht eine neue Zeile. Am Handy macht Enter
    // immer eine neue Zeile – dort gibt es den Senden-Knopf, und ein versehentliches Absenden
    // mitten im Satz wäre ärgerlicher als ein Knopfdruck mehr.
    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
      if (vorschlaege.length > 0) { e.preventDefault(); erwaehnen(vorschlaege[0]); return; }
      e.preventDefault();
      void senden();
    }
  }

  const plusTreffer = plusOffen ? p.vorschlaege(plusSuche) : [];

  return (
    <div className="modal-overlay ch-overlay" onClick={p.onClose}>
      <div className="ch-fenster" role="dialog" aria-label="Team-Chat" onClick={(e) => e.stopPropagation()}>
        <div className="ch-kopf">
          <button type="button" className="dm-zu" onClick={p.onClose} aria-label="Schließen">×</button>
          <span className="ch-gruppe" aria-hidden="true">MR</span>
          <span className="ch-kopf-text">
            <b>Team-Chat</b>
            <span>{andere.length > 0 ? `${andere.join(", ")} · alle sehen alles` : "alle mit Zugang sehen alles"}</span>
          </span>
        </div>

        <div className="ch-verlauf" ref={verlaufRef}>
          {p.fehler && <div className="ch-hinweis fehler" role="alert">{p.fehler}</div>}
          {p.laedt && p.nachrichten.length === 0 && <div className="ch-hinweis">Lädt …</div>}
          {!p.laedt && !p.fehler && p.nachrichten.length === 0 && (
            <div className="ch-hinweis">Noch keine Nachrichten. Schreib die erste – oder hol über „In den Chat“ einen Auftrag hierher.</div>
          )}
          {gruppen.map((g) => (
            <div key={g.tag + g.nachrichten[0].id} className="ch-tag-gruppe">
              <span className="ch-tag">{g.tag}</span>
              {g.nachrichten.map((n) => {
                const eigen = n.autor === p.ichId;
                const b = bezugAus(n);
                const namen = n.erwaehnt.map((id) => nameNach.get(id)).filter((x): x is string => !!x);
                const michGemeint = !!p.ichId && n.erwaehnt.includes(p.ichId);
                return (
                  <div key={n.id} className={"ch-nachricht " + (eigen ? "eigen" : "fremd") + (michGemeint ? " mich" : "")}>
                    {!eigen && <div className="ch-wer" style={{ color: personenFarbe(n.autor) }}>{nameNach.get(n.autor) ?? "Ehemaliger Zugang"}</div>}
                    {b && <BezugKarte b={b} onOeffnen={p.kannOeffnen(b) ? () => p.onBezugOeffnen(b) : undefined} />}
                    <div className="ch-text">
                      {textTeile(n.text, namen).map((t, i) => t.erwaehnung ? <span key={i} className="ch-at">{t.text}</span> : <span key={i}>{t.text}</span>)}
                    </div>
                    <div className="ch-zeit">{uhrzeit(n.created_at)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {vorschlaege.length > 0 && (
          <div className="ch-liste" role="listbox" aria-label="Erwähnen">
            <div className="ch-liste-titel">ERWÄHNEN</div>
            {vorschlaege.map((x, i) => (
              <button key={x.id} type="button" role="option" aria-selected={i === 0} className={"ch-person" + (i === 0 ? " an" : "")}
                onMouseDown={(e) => e.preventDefault()} onClick={() => erwaehnen(x)}>
                <span className="ch-av" style={{ background: personenFarbe(x.id) }}>{initialen(x.name)}</span>
                <b>{x.name}<span>{ROLE_LABEL[x.rolle as keyof typeof ROLE_LABEL] ?? x.rolle}</span></b>
              </button>
            ))}
          </div>
        )}

        {plusOffen && (
          <div className="ch-liste ch-plus" role="dialog" aria-label="Karte anhängen">
            <div className="ch-liste-titel">KARTE ANHÄNGEN</div>
            <input
              className="ch-plus-suche" autoFocus value={plusSuche} onChange={(e) => setPlusSuche(e.target.value)}
              placeholder="Auftragsnummer, Titel oder Kunde" aria-label="Auftrag oder Kunde suchen"
            />
            {plusTreffer.length === 0
              ? <div className="ch-hinweis klein">{plusSuche.trim() ? "Nichts gefunden." : "Keine Termine ab heute – tipp eine Nummer oder einen Namen."}</div>
              : plusTreffer.map((b) => (
                <button key={b.art + b.id} type="button" className="ch-plus-treffer" onClick={() => { p.onBezug(b); setPlusOffen(false); setPlusSuche(""); feldRef.current?.focus(); }}>
                  <BezugKarte b={b} klein />
                </button>
              ))}
            <span className="small">Lagerplätze und Verkaufsreifen über „In den Chat“ im Lager.</span>
          </div>
        )}

        {p.darfSchreiben ? (
          <div className="ch-eingabe">
            {!p.online && <div className="ch-hinweis warn">Ohne Netz – Senden geht erst wieder mit Verbindung.</div>}
            {sendeFehler && <div className="ch-hinweis fehler" role="alert">{sendeFehler}</div>}
            {p.bezug && <BezugKarte b={p.bezug} klein onWeg={() => p.onBezug(null)} />}
            <div className="ch-feld">
              <button type="button" className={"ch-plus-knopf" + (plusOffen ? " an" : "")} onClick={() => setPlusOffen(!plusOffen)}
                aria-label="Auftrag oder Kunde anhängen" aria-expanded={plusOffen}>+</button>
              <textarea
                ref={feldRef}
                className="ch-textfeld"
                rows={1}
                value={text}
                maxLength={CHAT_TEXT_MAX}
                placeholder="Nachricht · @ für eine Person"
                aria-label="Nachricht"
                onChange={(e) => textAendern(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onKeyDown={taste}
                onBlur={() => setTimeout(() => setAnfrage(null), 150)}
              />
              <button type="button" className="ch-senden" onClick={() => void senden()} disabled={!kannSenden} aria-label="Senden">➤</button>
            </div>
          </div>
        ) : (
          <div className="ch-eingabe"><div className="ch-hinweis">Du kannst hier mitlesen, aber nicht schreiben.</div></div>
        )}
      </div>
    </div>
  );
}

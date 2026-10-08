import { initialen, listenZeit, personenFarbe, zahlText, type ChatListenEintrag } from "@/lib/chat";

// Die Unterhaltungen (Migration 84, v137): oben der Team-Chat, darunter die Einzelchats mit der
// letzten Nachricht, darunter alle anderen mit Zugang – für eine neue Unterhaltung. Die Reihenfolge
// und die Texte kommen aus `chatListe()` (lib/chat.ts).
export function ChatListe({ eintraege, aktuell, onWahl }: {
  eintraege: ChatListenEintrag[];
  aktuell: string | null;
  onWahl: (partner: string | null) => void;
}) {
  const ersteNeue = eintraege.findIndex((e) => e.neu);
  return (
    <div className="ch-verlauf ch-unterhaltungen" role="list" aria-label="Unterhaltungen">
      {eintraege.map((e, i) => (
        <div key={e.partner ?? "team"} role="listitem" className="ch-unterhaltung-zeile">
          {i === ersteNeue && <div className="ch-liste-titel">NEUE UNTERHALTUNG</div>}
          <button type="button" className={"ch-unterhaltung" + (e.partner === aktuell ? " aktiv" : "") + (e.ungelesen ? " ungelesen" : "")}
            onClick={() => onWahl(e.partner)} aria-label={e.ungelesen ? `${e.name}, ${e.ungelesen} ungelesen` : e.name}>
            {e.partner === null
              ? <span className="ch-gruppe" aria-hidden="true">MR</span>
              : <span className="ch-av gross" style={{ background: personenFarbe(e.partner) }} aria-hidden="true">{initialen(e.name)}</span>}
            <span className="ch-unterhaltung-text">
              <b>{e.name}</b>
              <span>{e.vorschau}</span>
            </span>
            <span className="ch-unterhaltung-rand">
              {e.am && <span className="ch-unterhaltung-zeit">{listenZeit(e.am)}</span>}
              {e.ungelesen > 0 && <span className="ch-zahl innen">{zahlText(e.ungelesen)}</span>}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

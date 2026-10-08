import { zahlText } from "@/lib/chat";

// Die schwebende Chat-Blase (Team-Chat, Migration 80, v129). Am Handy über der unteren Leiste,
// am Rechner unten rechts. Die rote Zahl zählt, was man noch nicht gesehen hat.
//
// Wo sie steht, regelt das Stilblatt (`.ch-blase`, app/globals.css). `bei-karte`: Die Seite hat
// eine Karte (Kunden, Termine, Dashboard) – am Handy sitzt dann schon der runde Kartenknopf unten
// rechts, die Blase rückt darüber; am Rechner rückt sie links neben die Bedienknöpfe der Karte.
// `karte-offen`: Am Handy ist die Karte offen – dort liegen Bedienknöpfe und Kundenblatt genau an
// dieser Stelle, die Blase verschwindet, bis man zur Liste zurückgeht.
export function ChatBlase({ zahl, lage, onClick }: {
  zahl: number;
  lage?: "bei-karte" | "karte-offen" | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={"ch-blase" + (lage ? ` ${lage}` : "")}
      onClick={onClick}
      aria-label={zahl > 0 ? `Team-Chat, ${zahl} ungelesen` : "Team-Chat"}
      title="Team-Chat"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg>
      {zahl > 0 && <span className="ch-zahl">{zahlText(zahl)}</span>}
    </button>
  );
}

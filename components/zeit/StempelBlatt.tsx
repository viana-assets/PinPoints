import { arbeitMs, pauseMs, pauseZuKurz, type StempelArt, type ZeitSchicht } from "@/lib/zeiterfassung";
import { StempelKarte } from "./StempelKarte";
import { useJetzt } from "./useJetzt";

// Das Blatt hinter der grünen Anzeige (Migration 82, v131, Entwurf Bild 3): die Stempeluhr von
// jeder Seite aus, dazu der Hinweis zur Mindestpause. Ebene 10003 wie die anderen Blätter.
export function StempelBlatt(p: {
  schicht: ZeitSchicht | null;
  versatzMs: number;
  wocheAbgeschlossenMs: number;
  darfStempeln: boolean;
  online: boolean;
  laeuft: boolean;
  fehler: string | null;
  onStempeln: (art: StempelArt) => void;
  onZurUebersicht?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay auswahl-overlay zt-overlay" onClick={p.onClose}>
      <div className="auswahl-blatt zt-blatt" role="dialog" aria-label="Stempeluhr" onClick={(e) => e.stopPropagation()}>
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Stempeluhr</div>
          <button type="button" className="modal-close" onClick={p.onClose} aria-label="Schließen">×</button>
        </div>
        <StempelKarte {...p} />
        <PausenHinweis schicht={p.schicht} versatzMs={p.versatzMs} />
        {p.onZurUebersicht && <button type="button" className="ab-option" onClick={p.onZurUebersicht}><span className="ab-text">Meine Zeiten ansehen ›</span></button>}
      </div>
    </div>
  );
}

function PausenHinweis({ schicht, versatzMs }: { schicht: ZeitSchicht | null; versatzMs: number }) {
  const jetzt = useJetzt(60_000, versatzMs, !!schicht && !schicht.ende);
  if (!schicht) return null;
  const arbeit = arbeitMs(schicht, jetzt) / 60_000;
  const pause = pauseMs(schicht, jetzt) / 60_000;
  const kurz = pauseZuKurz(arbeit, pause);
  return (
    <div className={"zt-hinweis" + (kurz ? " warn" : " info")}>
      Nach 6 Stunden sind 30 Minuten Pause vorgeschrieben, nach 9 Stunden 45 (§ 4 ArbZG).
      {kurz ? " Heute ist es noch zu wenig." : " Heute passt es."}
    </div>
  );
}

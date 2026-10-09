import { useState } from "react";
import { Blatt } from "@/components/Blatt";
import { dauerText, ZEIT_HEIMFAHRT_MINUTEN } from "@/lib/zeiterfassung";

// „Für heute fertig?“ (Migration 85, v138, Wunsch Vitali 09.10.2026). Erscheint, wenn jemand seinen
// letzten Auftrag des Tages erledigt und noch eingestempelt ist (`letzterAuftragHeute()`).
//
//   Ja, Feierabend – ausstempeln und ZEIT_HEIMFAHRT_MINUTEN Heimfahrt gutschreiben
//                    (`zeit_feierabend()`; die Datenbank prüft noch einmal, dass es der letzte war).
//   Noch nicht     – nichts passiert, die Stempelung läuft weiter; ausstempeln dann selbst
//                    (dann ohne Heimfahrt – die Zeit bis dahin ist ja gestempelt).
//
// Ebene 10002 (`modal-bestaetigung`): Sie geht aus dem Auftragsfenster (10001) heraus auf.
export function FeierabendFrage({ onJa, onClose }: { onJa: () => Promise<void>; onClose: () => void }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function ja() {
    setLaeuft(true);
    setFehler(null);
    try {
      await onJa();
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <Blatt titel="Für heute fertig?" breite="schmal" ebene="modal-bestaetigung" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Noch nicht</button>
        <button type="button" className="btn-primary" onClick={() => void ja()} disabled={laeuft}>{laeuft ? "stempelt aus …" : "Ja, Feierabend"}</button>
      </>}>
      <p className="zt-feierabend-text">
        Das war dein letzter Auftrag für heute. Mit <b>„Ja, Feierabend“</b> wirst du jetzt ausgestempelt, und dir
        werden <b>{dauerText(ZEIT_HEIMFAHRT_MINUTEN * 60_000)} h für die Heimfahrt</b> gutgeschrieben.
      </p>
      <p className="bl-hilfe">„Noch nicht“: Die Stempeluhr läuft weiter – dann stempelst du später selbst aus.</p>
      {fehler && <div className="zt-hinweis fehler" role="alert">{fehler}</div>}
    </Blatt>
  );
}

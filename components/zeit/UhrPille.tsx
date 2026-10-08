import { arbeitMs, dauerText, laufendePause, zustand, type ZeitSchicht } from "@/lib/zeiterfassung";
import { useJetzt } from "./useJetzt";

// Die laufende Uhr oben rechts (Migration 82, v131): grün mit der Arbeitszeit, gelb während der
// Pause. Steht nur da, solange man eingestempelt ist. Antippen öffnet die Stempeluhr – egal, auf
// welcher Seite man gerade ist. `eingebettet`: im Kopf der Zeiterfassung statt schwebend.
export function UhrPille({ schicht, versatzMs, onClick, eingebettet }: {
  schicht: ZeitSchicht | null;
  versatzMs: number;
  onClick?: () => void;
  eingebettet?: boolean;
}) {
  const z = zustand(schicht);
  const jetzt = useJetzt(15_000, versatzMs, z !== "aus");
  if (!schicht || z === "aus") return null;
  const pause = laufendePause(schicht);
  const text = z === "pause" && pause ? `Pause ${dauerText(jetzt - new Date(pause.beginn).getTime())}` : dauerText(arbeitMs(schicht, jetzt));
  return (
    <button type="button" className={"zt-pille" + (z === "pause" ? " pause" : "") + (eingebettet ? " eingebettet" : "")}
      onClick={onClick} aria-label={`Stempeluhr: ${z === "pause" ? "Pause" : "läuft"}, ${text}`} title="Stempeluhr">
      <i aria-hidden="true" />{text}
    </button>
  );
}

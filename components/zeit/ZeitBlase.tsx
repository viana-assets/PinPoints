import { arbeitMs, dauerText, zustand, type ZeitSchicht } from "@/lib/zeiterfassung";
import { useJetzt } from "./useJetzt";

// Die schwebende Stoppuhr über der Chat-Blase (v132, Wunsch Vitali 08.10.2026): ein Tipp führt in
// die Zeiterfassung – dort steht die Stempeluhr. Weiß, solange niemand eingestempelt ist; grün mit
// der Arbeitszeit, solange die Uhr läuft; gelb in der Pause. Nur mit „Zeiterfassung · lesen“.
//
// Lage wie die Chat-Blase (`.zt-blase`, app/globals.css), eine Stufe darüber. `allein`: Es gibt
// keine Chat-Blase (Recht fehlt) – dann sitzt sie an deren Stelle.
export function ZeitBlase({ schicht, versatzMs, lage, allein, onClick }: {
  schicht: ZeitSchicht | null;
  versatzMs: number;
  lage?: "bei-karte" | "karte-offen" | null;
  allein?: boolean;
  onClick: () => void;
}) {
  const z = zustand(schicht);
  const jetzt = useJetzt(30_000, versatzMs, z !== "aus");
  const text = schicht && z !== "aus" ? dauerText(arbeitMs(schicht, jetzt)) : null;
  return (
    <button
      type="button"
      className={["zt-blase", z, lage, allein ? "allein" : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      aria-label={text ? `Zeiterfassung, ${z === "pause" ? "Pause" : "läuft"}: ${text} h` : "Zeiterfassung – einstempeln"}
      title="Zeiterfassung"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l3 2M9 3h6" />
      </svg>
      {text && <span className="zt-blase-zeit">{text}</span>}
    </button>
  );
}

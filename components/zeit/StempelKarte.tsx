import { arbeitMs, dauerText, laufendePause, pauseMs, tagSchluessel, tagTitel, tagVon, uhrText, uhrzeitVon, zustand, type StempelArt, type ZeitSchicht } from "@/lib/zeiterfassung";
import { useJetzt } from "./useJetzt";

// Die Stempeluhr (Migration 82, v131, Entwurf „Stempeluhr“ Bild 1–3): oben im Dashboard und im
// Blatt hinter der grünen Anzeige. Dunkel, solange sie läuft; gestrichelt, solange niemand
// eingestempelt ist.
export function StempelKarte(p: {
  schicht: ZeitSchicht | null;
  versatzMs: number;
  // Arbeitszeit der laufenden Woche OHNE die offene Schicht (die zählt die Karte selbst dazu).
  wocheAbgeschlossenMs: number;
  darfStempeln: boolean;
  online: boolean;
  laeuft: boolean;
  fehler: string | null;
  onStempeln: (art: StempelArt) => void;
}) {
  const z = zustand(p.schicht);
  const jetzt = useJetzt(1000, p.versatzMs, z !== "aus");
  const arbeit = p.schicht ? arbeitMs(p.schicht, jetzt) : 0;
  const pause = p.schicht ? pauseMs(p.schicht, jetzt) : 0;
  const offenePause = laufendePause(p.schicht);
  const woche = p.wocheAbgeschlossenMs + arbeit;
  const gesperrt = p.laeuft || !p.online || !p.darfStempeln;
  // Seit einem früheren Tag eingestempelt: wohl das Ausstempeln vergessen.
  const vonFrueher = p.schicht && z !== "aus" && tagSchluessel(p.schicht.beginn) < tagVon(new Date(jetzt)) ? tagSchluessel(p.schicht.beginn) : null;

  function aus() {
    if (window.confirm("Jetzt ausstempeln? Ändern kann es danach nur noch, wer Zeiten korrigieren darf.")) p.onStempeln("aus");
  }

  return (
    <div className={"zt-karte" + (z === "aus" ? " aus" : z === "pause" ? " pause" : "")} role="region" aria-label="Stempeluhr">
      <div className="zt-kopf">
        <span>{z === "aus" ? "STEMPELUHR" : z === "pause" ? "STEMPELUHR · PAUSE" : "STEMPELUHR · LÄUFT"}</span>
        <span>Woche: {dauerText(woche)} h</span>
      </div>
      {z === "aus" ? (
        <>
          <div className="zt-zeit leer">0:00 <small>h heute</small></div>
          <div className="zt-info">Noch nicht eingestempelt</div>
        </>
      ) : (
        <>
          <div className="zt-zeit" aria-live="off">{uhrText(arbeit).replace(/:(\d\d)$/, "")}<small>:{uhrText(arbeit).slice(-2)} h</small></div>
          <div className="zt-info">
            seit {uhrzeitVon((p.schicht as ZeitSchicht).beginn)}
            {pause > 0 && ` · Pause ${dauerText(pause)}`}
            {offenePause && ` (läuft seit ${uhrzeitVon(offenePause.beginn)})`}
          </div>
        </>
      )}
      {p.darfStempeln && (
        <div className="zt-knoepfe">
          {z === "aus" && <button type="button" className="zt-k gruen" disabled={gesperrt} onClick={() => p.onStempeln("ein")}>▶ Einstempeln</button>}
          {z === "laeuft" && <button type="button" className="zt-k gelb" disabled={gesperrt} onClick={() => p.onStempeln("pause")}>❚❚ Pause</button>}
          {z === "pause" && <button type="button" className="zt-k gruen" disabled={gesperrt} onClick={() => p.onStempeln("weiter")}>▶ Weiter</button>}
          {z !== "aus" && <button type="button" className="zt-k rot" disabled={gesperrt} onClick={aus}>■ Ausstempeln</button>}
        </div>
      )}
      {vonFrueher && <div className="zt-hinweis">Eingestempelt seit {tagTitel(vonFrueher)} – Ausstempeln vergessen? Jetzt ausstempeln und im Büro Bescheid geben; die Zeit wird dort korrigiert.</div>}
      {!p.online && <div className="zt-hinweis">Stempeln geht nur mit Netz.</div>}
      {p.fehler && <div className="zt-hinweis fehler" role="alert">{p.fehler}</div>}
    </div>
  );
}

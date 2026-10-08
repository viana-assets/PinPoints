import { RECHNUNG_SEITE_CSS } from "@/lib/constants";
import {
  dauerText, monatTitel, schichtSpanne, stundenDezimal, wochentagKurz, ZEIT_HINWEIS_TEXT,
  type MonatsAuswertung, type ZeitPerson,
} from "@/lib/zeiterfassung";
import { Blatt } from "@/components/Blatt";

// Der Arbeitszeitnachweis eines Monats zum Drucken oder als PDF (Migration 83, v136, Fahrplan E20).
// Eine A4-Seite je Person: jeder Tag des Monats, Summen, zwei Unterschriftszeilen. Gedruckt wird
// wie bei Rechnung und Auskunft aus dem Fenster heraus (`druck-fenster`); Kopf und Knöpfe fallen
// beim Drucken weg. Am iPhone über „Drucken“ → Teilen-Symbol → als PDF sichern.
//
// Die Hinweise (Pause zu kurz, über 10 h) stehen als Hinweise mit drauf – entschieden wird darüber
// von Menschen, nicht von der App.
export function ZeitNachweis({ zeilen, monat, onClose }: {
  zeilen: { person: ZeitPerson; monat: MonatsAuswertung }[];
  monat: string;
  onClose: () => void;
}) {
  const titel = zeilen.length === 1 ? `Arbeitszeitnachweis · ${zeilen[0].person.name}` : `Arbeitszeitnachweis · ${zeilen.length} Personen`;
  return (
    <Blatt titel={titel} unter={monatTitel(monat)} breite="dokument" ebene="druck-fenster modal-rechnung" className="zn-fenster" onClose={onClose}
      fuss={<button type="button" className="btn-primary" onClick={() => window.print()}>Drucken / als PDF sichern</button>}>
      <style>{RECHNUNG_SEITE_CSS}</style>
      <div className="druckbogen zn-dokument">
        {zeilen.map(({ person, monat: m }, i) => (
          <section key={person.id} className={"zn-seite" + (i > 0 ? " zn-umbruch" : "")}>
            <h1>Arbeitszeitnachweis {monatTitel(monat)}</h1>
            <p><b>{person.name}</b></p>
            <table className="zn-tabelle">
              <thead>
                <tr><th>Tag</th><th>Zeiten</th><th>Pause</th><th>Arbeit</th><th>Urlaub</th><th>Hinweis</th></tr>
              </thead>
              <tbody>
                {m.tage.map((x) => {
                  const wt = wochentagKurz(x.tag);
                  return (
                    <tr key={x.tag} className={wt === "Sa" || wt === "So" ? "zn-we" : ""}>
                      <td>{wt} {x.tag.slice(8, 10)}.{x.tag.slice(5, 7)}.</td>
                      <td>{x.schichten.map((s) => schichtSpanne(s).replace("jetzt", "offen")).join(", ") || "–"}</td>
                      <td>{x.schichten.length ? dauerText(x.pauseMs) : ""}</td>
                      <td>{x.schichten.length ? dauerText(x.arbeitMs) : ""}</td>
                      <td>{x.urlaubMs ? dauerText(x.urlaubMs) : ""}</td>
                      <td>{x.hinweise.map((h) => ZEIT_HINWEIS_TEXT[h]).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Summe · {m.arbeitstage} Arbeitstage{m.urlaubstage ? `, ${m.urlaubstage} Urlaubstage` : ""}</td>
                  <td>{dauerText(m.pauseMs)}</td>
                  <td>{dauerText(m.arbeitMs)}</td>
                  <td>{dauerText(m.urlaubMs)}</td>
                  <td>{stundenDezimal(m.arbeitMs + m.urlaubMs)} Std.</td>
                </tr>
              </tfoot>
            </table>
            <p className="zn-klein">
              Arbeitszeit ohne Pausen, in Stunden:Minuten. Erfasst mit der Stempeluhr; nachträgliche Änderungen sind
              mit Grund festgehalten („korrigiert“). Eine Schicht, die an einem früheren Tag nicht beendet wurde,
              zählt erst nach ihrer Korrektur.
            </p>
            <div className="zn-unterschriften">
              <div><span />Datum, Unterschrift Mitarbeiter/in</div>
              <div><span />Datum, Unterschrift Arbeitgeber</div>
            </div>
          </section>
        ))}
      </div>
    </Blatt>
  );
}

import type { Packliste } from "@/lib/packliste";

// Die Packliste eines Tages (E2) – was außer den eingelagerten Sätzen ins Auto muss: die
// Leistungen in Summe und die Reifengrößen der Autos. Gerechnet in lib/packliste.ts; dieselbe
// Anzeige im Dashboard und im Fenster hinter dem Abendhinweis.
export function PacklisteBlock({ liste }: { liste: Packliste }) {
  if (liste.auftraege === 0) return <div className="db-leer">An diesem Tag stehen keine offenen Aufträge an.</div>;
  return (
    <div className="pk-block">
      <div className="pk-zeile">
        <span className="pk-titel">Leistungen</span>
        {liste.leistungen.length === 0
          ? <span className="small">noch keine eingetragen</span>
          : (
            <span className="pk-chips">
              {liste.leistungen.map((l) => (
                <span key={l.name} className="pk-chip"><b>{l.menge.toLocaleString("de-DE")}×</b> {l.name}</span>
              ))}
            </span>
          )}
      </div>
      <div className="pk-zeile">
        <span className="pk-titel">Reifengrößen</span>
        {liste.groessen.length === 0
          ? <span className="small">keine bekannt</span>
          : (
            <span className="pk-chips">
              {liste.groessen.map((g) => (
                <span key={g.groesse} className="pk-chip"><b>{g.autos}×</b> {g.groesse}</span>
              ))}
            </span>
          )}
      </div>
      {liste.ohneGroesse > 0 && (
        <span className="small pk-hinweis">
          Bei {liste.ohneGroesse} {liste.ohneGroesse === 1 ? "Auftrag" : "Aufträgen"} ist keine Reifengröße bekannt – Fahrzeug am Auftrag eintragen oder beim Fahrzeug die Größe ergänzen.
        </span>
      )}
    </div>
  );
}

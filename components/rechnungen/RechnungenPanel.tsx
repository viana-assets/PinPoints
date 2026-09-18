import { useMemo, useState } from "react";
import type { Rechnung } from "@/lib/types";
import { formatDate, formatEUR, suchtreffer } from "@/lib/helpers";
import { istGueltig } from "@/lib/rechnung";
import { RechnungDokument } from "./RechnungDokument";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";

// Das Rechnungsbuch. Es zeigt, was das Haus ausgestellt hat – in der Reihenfolge der Nummern,
// absteigend, weil die letzte Rechnung die ist, nach der gefragt wird.
//
// Storniertes bleibt stehen und wird durchgestrichen. Eine Liste, die Stornos wegblendet,
// hat Lücken im Nummernkreis, und genau die sind bei einer Prüfung die Frage.

type Sicht = "alle" | "gueltig" | "storniert";

export function RechnungenPanel({ rechnungen, laedt, onAuftragOeffnen }: {
  rechnungen: Rechnung[];
  laedt?: boolean;
  // Der Weg zurück zum Auftrag. Null, wenn der Auftrag gelöscht wurde – die Rechnung bleibt
  // trotzdem: Sie ist ein Beleg, kein Anhang.
  onAuftragOeffnen?: (orderId: string) => void;
}) {
  const [suche, setSuche] = useState("");
  const [sicht, setSicht] = useState<Sicht>("alle");
  const [offen, setOffen] = useState<string | null>(null);

  const gezeigt = useMemo(() => {
    return rechnungen.filter((r) => {
      if (sicht === "gueltig" && !istGueltig(r)) return false;
      if (sicht === "storniert" && !(r.art === "storno" || r.storniert_durch)) return false;
      if (!suche.trim()) return true;
      return suchtreffer(
        [r.nummer_text, r.empfaenger?.name, r.empfaenger?.company, String(r.kundennummer ?? ""), String(r.texte?.auftragsnummer ?? "")],
        suche
      );
    });
  }, [rechnungen, sicht, suche]);

  // Die Summen beziehen sich auf das, was in der Liste steht – nicht auf den Gesamtbestand.
  // Eine Kennzahl, die etwas anderes zählt als das Sichtbare, ist eine Falle.
  const summe = gezeigt.reduce((s, r) => s + r.brutto, 0);
  const beleg = offen ? rechnungen.find((r) => r.id === offen) ?? null : null;

  return (
    <div className="tabpanel active">
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          type="search" placeholder="Nummer, Kunde, Kundennummer oder Auftrag …"
          value={suche} onChange={(e) => setSuche(e.target.value)}
        />
      </div>
      <div className="filterbar" style={{ marginBottom: 8 }}>
        <button type="button" className={`chip ${sicht === "alle" ? "active" : ""}`} onClick={() => setSicht("alle")}>Alle</button>
        <button type="button" className={`chip ${sicht === "gueltig" ? "active" : ""}`} onClick={() => setSicht("gueltig")}>Gültig</button>
        <button type="button" className={`chip ${sicht === "storniert" ? "active" : ""}`} onClick={() => setSicht("storniert")}>Storniert</button>
      </div>

      {laedt && rechnungen.length === 0 ? (
        <div className="empty">Lädt …</div>
      ) : gezeigt.length === 0 ? (
        <div className="empty">
          {rechnungen.length === 0
            ? "Es ist noch keine Rechnung ausgestellt. Sie entstehen am Auftrag."
            : "Kein Treffer."}
        </div>
      ) : (
        <>
          <table className="appt-table rechnungsbuch">
            <thead>
              <tr>
                <th>Nummer</th><th>Datum</th><th>Kunde</th>
                <th className="rb-zahl">Kundennr.</th><th className="rb-zahl">Auftrag</th>
                <th className="rb-zahl">Netto</th><th className="rb-zahl">Brutto</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gezeigt.map((r) => {
                const aufgehoben = !!r.storniert_durch;
                return (
                  <tr key={r.id} className={(aufgehoben ? "aufgehoben " : "") + (r.art === "storno" ? "storno" : "")}>
                    <td>
                      <b>{r.nummer_text}</b>
                      {r.art === "storno" && <span className="re-pille storno">Storno</span>}
                      {aufgehoben && <span className="re-pille aufgehoben">storniert</span>}
                    </td>
                    <td>{formatDate(r.datum)}</td>
                    <td>{r.empfaenger?.company?.trim() || r.empfaenger?.name || <i>ohne Namen</i>}</td>
                    <td className="rb-zahl">{r.kundennummer ?? ""}</td>
                    <td className="rb-zahl">
                      {r.texte?.auftragsnummer != null && r.order_id && onAuftragOeffnen ? (
                        <button type="button" className="link-knopf" onClick={() => onAuftragOeffnen(r.order_id!)}>
                          {r.texte.auftragsnummer}
                        </button>
                      ) : (r.texte?.auftragsnummer ?? "")}
                    </td>
                    <td className="rb-zahl">{formatEUR(r.netto)}</td>
                    <td className="rb-zahl">{formatEUR(r.brutto)}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-rand" onClick={() => setOffen(r.id)}>ansehen</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="small" style={{ marginTop: 8 }}>
            {gezeigt.length} {gezeigt.length === 1 ? "Beleg" : "Belege"} · Summe brutto {formatEUR(summe)}
            {sicht !== "alle" && " (nur die angezeigte Auswahl)"}
          </div>
        </>
      )}

      {beleg && (
        <div className="modal-overlay modal-rechnung" onClick={() => setOffen(null)}>
          <div className="modal-box rechnung-modal" onClick={(e) => e.stopPropagation()}>
            <style>{RECHNUNG_SEITE_CSS}</style>
            <div className="re-kopfleiste druck-weg">
              <h3>
                {beleg.art === "storno" ? "Stornorechnung" : "Rechnung"} {beleg.nummer_text}
                {beleg.storniert_durch && <span className="re-pille aufgehoben">storniert</span>}
              </h3>
              <button type="button" className="modal-close" onClick={() => setOffen(null)} aria-label="Schließen">×</button>
            </div>
            <div className="rechnung-vorschau">
              <div className="rechnung-vorschau-rahmen">
                <RechnungDokument daten={beleg} />
              </div>
            </div>
            <div className="re-fussleiste druck-weg">
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                Drucken / als PDF speichern
              </button>
              {/* Storniert wird am Auftrag, nicht hier: Dort ist der Zusammenhang sichtbar,
                  aus dem die Rechnung entstanden ist. */}
              {beleg.order_id && onAuftragOeffnen && (
                <button type="button" className="btn-secondary btn-rand"
                  onClick={() => { setOffen(null); onAuftragOeffnen(beleg.order_id!); }}>
                  Zum Auftrag
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

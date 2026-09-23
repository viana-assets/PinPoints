import { useMemo, useState } from "react";
import type { Rechnung } from "@/lib/types";
import { formatDate, formatEUR, suchtreffer, todayStr } from "@/lib/helpers";
import { istGueltig, mailtoRechnung, stornoAus, type RechnungEntwurf } from "@/lib/rechnung";
import { RechnungDokument } from "./RechnungDokument";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";

// Das Rechnungsbuch. Es zeigt, was das Haus ausgestellt hat – in der Reihenfolge der Nummern,
// absteigend, weil die letzte Rechnung die ist, nach der gefragt wird.
//
// Storniertes bleibt stehen und wird durchgestrichen. Eine Liste, die Stornos wegblendet,
// hat Lücken im Nummernkreis, und genau die sind bei einer Prüfung die Frage.

type Sicht = "alle" | "gueltig" | "storniert";

export function RechnungenPanel({ rechnungen, laedt, darfSchreiben, onAuftragOeffnen, onStornieren }: {
  rechnungen: Rechnung[];
  laedt?: boolean;
  darfSchreiben: boolean;
  // Der Weg zurück zum Auftrag. Null, wenn der Auftrag gelöscht wurde – die Rechnung bleibt
  // trotzdem: Sie ist ein Beleg, kein Anhang.
  onAuftragOeffnen?: (orderId: string) => void;
  // Stornieren, seit dem 22.09.2026 auch von hier aus.
  //
  // Vorher gab es den Knopf ausdrücklich NUR am Auftrag, mit dem Argument, man solle dabei den
  // Zusammenhang sehen, aus dem die Rechnung entstand. In der Praxis hieß das: Wer im
  // Rechnungsbuch eine falsche Rechnung fand, musste über „Zum Auftrag" springen und dort
  // dasselbe Fenster noch einmal öffnen – und hat den Storno gar nicht erst gefunden. Ein
  // Argument, das den Weg verlängert, ohne einen Fehler zu verhindern, trägt nicht.
  onStornieren: (entwurf: RechnungEntwurf & { hebt_auf: string }) => Promise<Rechnung>;
}) {
  const [suche, setSuche] = useState("");
  const [sicht, setSicht] = useState<Sicht>("alle");
  const [offen, setOffen] = useState<string | null>(null);
  const [stornoFrage, setStornoFrage] = useState<Rechnung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function stornieren(r: Rechnung) {
    setLaeuft(true); setFehler(null); setStornoFrage(null);
    try {
      const neu = await onStornieren(stornoAus(r, todayStr()));
      // Der frische Gegenbeleg wird gezeigt: Wer storniert, will sehen, was entstanden ist –
      // nicht die Rechnung, die er gerade aufgehoben hat.
      setOffen(neu.id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Rechnung konnte nicht storniert werden.");
    } finally {
      setLaeuft(false);
    }
  }

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
                {beleg.art === "storno" && <span className="re-pille storno">Storno</span>}
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
              {mailtoRechnung(beleg) && (
                <a className="btn-secondary btn-rand" href={mailtoRechnung(beleg)!}>
                  E-Mail vorbereiten
                </a>
              )}
              {beleg.art === "rechnung" && !beleg.storniert_durch && darfSchreiben && (
                <button type="button" className="btn-secondary btn-rand" disabled={laeuft}
                  onClick={() => setStornoFrage(beleg)}>
                  Stornieren
                </button>
              )}
              {beleg.storniert_durch && (
                <span className="small">
                  Aufgehoben am {beleg.storniert_am ? formatDate(beleg.storniert_am.slice(0, 10)) : ""} durch{" "}
                  {rechnungen.find((r) => r.id === beleg.storniert_durch)?.nummer_text ?? "eine Stornorechnung"}.
                </span>
              )}
              {beleg.order_id && onAuftragOeffnen && (
                <button type="button" className="btn-secondary btn-rand"
                  onClick={() => { setOffen(null); onAuftragOeffnen(beleg.order_id!); }}>
                  Zum Auftrag
                </button>
              )}
            </div>
            {fehler && <div className="hinweis-pflicht druck-weg">{fehler}</div>}
          </div>
        </div>
      )}

      {/* Wortgleich zur Rückfrage im Auftragsfenster – dieselbe Handlung, dieselbe Erklärung.
          Zwei verschiedene Texte für dasselbe wären zwei Gelegenheiten, es unterschiedlich zu
          verstehen. */}
      {stornoFrage && (
        <div className="modal-overlay modal-storno" onClick={() => setStornoFrage(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px" }}>Rechnung {stornoFrage.nummer_text} stornieren?</h3>
            <p>
              Die Rechnung bleibt stehen und bekommt eine Stornorechnung mit eigener Nummer
              daneben – so verlangt es der lückenlose Nummernkreis. Gelöscht wird nichts.
            </p>
            <p className="small">
              Danach lässt sich für diesen Auftrag eine neue Rechnung ausstellen.
            </p>
            <div className="re-fussleiste">
              <button type="button" className="btn-primary" disabled={laeuft}
                onClick={() => void stornieren(stornoFrage)}>
                Stornorechnung erzeugen
              </button>
              <button type="button" className="btn-secondary btn-rand" onClick={() => setStornoFrage(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

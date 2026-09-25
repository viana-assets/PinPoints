import { useMemo, useState } from "react";
import type { Rechnung } from "@/lib/types";
import { formatDate, formatEUR, suchtreffer, todayStr } from "@/lib/helpers";
import { monatLang } from "@/lib/auswertungAnsicht";
import { istGueltig, mailtoRechnung, stornoAus, type RechnungEntwurf } from "@/lib/rechnung";
import { RechnungDokument } from "./RechnungDokument";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";
import { auftragsNr, istTestrechnung } from "@/lib/testkunde";

// Das Rechnungsbuch. Es zeigt, was das Haus ausgestellt hat – in der Reihenfolge der Nummern,
// absteigend, weil die letzte Rechnung die ist, nach der gefragt wird.
//
// Storniertes bleibt stehen und wird durchgestrichen. Eine Liste, die Stornos wegblendet,
// hat Lücken im Nummernkreis, und genau die sind bei einer Prüfung die Frage.

type Sicht = "alle" | "gueltig" | "storniert";

// Ein erledigter Auftrag mit „Rechnung nötig", aber ohne Rechnung (Entwurf P, 26.09.2026).
export type OffeneRechnung = { id: string; nummer: number; kunde: string; datum: string; netto: number };

export function RechnungenPanel({ rechnungen, laedt, darfSchreiben, onAuftragOeffnen, onKundeOeffnen, onStornieren, offene = [] }: {
  // Noch nicht ausgestellt – dieselbe Liste wie die Karte in den Aufträgen (`rechnungOffen`).
  offene?: OffeneRechnung[];
  // Der Weg zum Kunden aus dem Beleg (neu am 26.09.2026).
  onKundeOeffnen?: (customerId: string) => void;
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
  onStornieren: (entwurf: RechnungEntwurf & { hebt_auf: string; storno_grund: string }) => Promise<Rechnung>;
}) {
  const [suche, setSuche] = useState("");
  const [sicht, setSicht] = useState<Sicht>("alle");
  const [offen, setOffen] = useState<string | null>(null);
  const [stornoFrage, setStornoFrage] = useState<Rechnung | null>(null);
  const [stornoGrund, setStornoGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const jahre = useMemo(() => [...new Set(rechnungen.map((r) => r.datum.slice(0, 4)))].sort().reverse(), [rechnungen]);
  const [jahr, setJahr] = useState<string | null>(() => todayStr().slice(0, 4));
  const [offeneZeigen, setOffeneZeigen] = useState(false);

  async function stornieren(r: Rechnung) {
    if (!stornoGrund.trim()) return;
    setLaeuft(true); setFehler(null); setStornoFrage(null);
    try {
      const neu = await onStornieren(stornoAus(r, todayStr(), stornoGrund));
      setStornoGrund("");
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
      if (jahr && r.datum.slice(0, 4) !== jahr) return false;
      if (sicht === "gueltig" && !istGueltig(r)) return false;
      if (sicht === "storniert" && !(r.art === "storno" || r.storniert_durch)) return false;
      if (!suche.trim()) return true;
      return suchtreffer(
        [r.nummer_text, r.empfaenger?.name, r.empfaenger?.company, String(r.kundennummer ?? ""), r.texte?.auftragsnummer != null ? auftragsNr(r.texte.auftragsnummer) : ""],
        suche
      );
    });
  }, [rechnungen, sicht, suche, jahr]);

  // Die Summen beziehen sich auf das, was in der Liste steht – nicht auf den Gesamtbestand.
  // Eine Kennzahl, die etwas anderes zählt als das Sichtbare, ist eine Falle.
  // Testrechnungen (Migration 60) zählen in keiner Summe.
  const summe = gezeigt.filter((r) => !istTestrechnung(r)).reduce((s, r) => s + r.brutto, 0);
  const beleg = offen ? rechnungen.find((r) => r.id === offen) ?? null : null;

  // Nach Monaten gruppiert (Entwurf P). Die Liste ist nach Nummer absteigend sortiert; Nummern und
  // Monate laufen gemeinsam, also bleiben die Gruppen zusammenhängend.
  // Testrechnungen haben negative Nummern und stehen deshalb ohnehin am Ende; sie bekommen eine
  // eigene Gruppe, statt einen Monat ein zweites Mal aufzumachen.
  const gruppen: { monat: string; belege: Rechnung[] }[] = [];
  const testbelege = gezeigt.filter(istTestrechnung);
  for (const r of gezeigt.filter((x) => !istTestrechnung(x))) {
    const m = r.datum.slice(0, 7);
    const g = gruppen[gruppen.length - 1];
    if (g && g.monat === m) g.belege.push(r); else gruppen.push({ monat: m, belege: [r] });
  }
  const zahl = (x: Sicht) => rechnungen.filter((r) => (!jahr || r.datum.slice(0, 4) === jahr)
    && (x === "alle" || (x === "gueltig" ? istGueltig(r) : r.art === "storno" || !!r.storniert_durch))).length;
  const imJahr = rechnungen.filter((r) => !jahr || r.datum.slice(0, 4) === jahr);
  const gueltigSumme = imJahr.filter((r) => !r.storniert_durch && !istTestrechnung(r)).reduce((n, r) => n + r.brutto, 0);
  const letzteEchte = rechnungen.find((r) => !istTestrechnung(r));
  const offenSumme = offene.reduce((n, o) => n + o.netto, 0);

  return (
    <div className="tabpanel active">
      <div className="module-page re-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Rechnungen</h2>
              <span className="lg-unter">
                {jahr ?? "Alle Jahre"}: {imJahr.length} {imJahr.length === 1 ? "Beleg" : "Belege"} · {formatEUR(gueltigSumme)} brutto
                {letzteEchte ? ` · zuletzt ${letzteEchte.nummer_text}` : ""}
              </span>
            </div>
          </div>
          <label className="lg-suchfeld re-suche">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Nummer, Kunde oder Auftrag …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Rechnung suchen" />
          </label>
          <div className="pl-filter au-filter" role="group" aria-label="Sicht">
            {([["alle", "Alle"], ["gueltig", "Gültig"], ["storniert", "Storniert"]] as const).map(([w, t]) => (
              <button key={w} type="button" className={"pl-pille" + (sicht === w ? " aktiv" : "")} aria-pressed={sicht === w} onClick={() => setSicht(w)}>
                {t}<span className="op-zahl">{zahl(w)}</span>
              </button>
            ))}
            {jahre.length > 0 && <span className="re-trenner" aria-hidden="true" />}
            {jahre.map((j2) => (
              <button key={j2} type="button" className={"pl-pille" + (jahr === j2 ? " aktiv" : "")} onClick={() => setJahr(j2)}>{j2}</button>
            ))}
            {jahre.length > 1 && (
              <button type="button" className={"pl-pille" + (jahr === null ? " aktiv" : "")} onClick={() => setJahr(null)}>Alle Jahre</button>
            )}
          </div>
        </div>

        {offene.length > 0 && (
          <button type="button" className="sl-chance au-rechnungen" onClick={() => setOffeneZeigen(true)}>
            <span className="db-punkt-zahl rot">{offene.length}</span>
            <span className="db-punkt-text">
              <span className="db-punkt-titel">Noch nicht ausgestellt</span>
              <span className="small">erledigt mit „Rechnung nötig“ · {formatEUR(offenSumme)} netto</span>
            </span>
            <span className="db-link">Ausstellen ›</span>
          </button>
        )}

        {laedt && rechnungen.length === 0 ? (
          <div className="db-karte"><div className="db-leer">Lädt …</div></div>
        ) : gezeigt.length === 0 ? (
          <div className="db-karte"><div className="db-leer">
            {rechnungen.length === 0 ? "Es ist noch keine Rechnung ausgestellt. Sie entstehen am Auftrag." : "Kein Treffer."}
          </div></div>
        ) : (
          [...gruppen, ...(testbelege.length ? [{ monat: "test", belege: testbelege }] : [])].map((g) => {
            const test = g.monat === "test";
            const summeG = test ? 0 : g.belege.filter((r) => !r.storniert_durch).reduce((n, r) => n + r.brutto, 0);
            return (
              <div key={g.monat} className="op-gruppe">
                <div className="au-gruppe-kopf">
                  <span className="op-gruppe-titel">{test ? "TESTRECHNUNGEN" : monatLang(g.monat).toUpperCase()}</span>
                  <span className="small">{g.belege.length} {g.belege.length === 1 ? "Beleg" : "Belege"}{test ? " · zählen nicht mit" : ` · ${formatEUR(summeG)}`}</span>
                </div>
                {g.belege.map((r) => {
                  const aufgehoben = !!r.storniert_durch;
                  const storno = r.art === "storno";
                  return (
                    <button key={r.id} type="button" className={"re-karte" + (aufgehoben ? " aufgehoben" : "") + (storno ? " storno" : "")} onClick={() => setOffen(r.id)}>
                      <span className="re-nr"><b>{r.nummer_text}</b><span>{formatDate(r.datum)}</span></span>
                      <span className="re-text">
                        <span className="re-kunde">{r.empfaenger?.company?.trim() || r.empfaenger?.name || "ohne Namen"}</span>
                        <span className="small">{[r.kundennummer != null ? `Kd.-Nr. ${r.kundennummer}` : null, r.texte?.auftragsnummer != null ? `Auftrag #${auftragsNr(r.texte.auftragsnummer)}` : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="re-betrag">
                        <b>{formatEUR(r.brutto)}</b>
                        <span className={"re-marke" + (storno || aufgehoben ? " grau" : "")}>{storno ? "Storno" : aufgehoben ? "storniert" : "gültig"}</span>
                        {test && <span className="test-marke">TEST</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
        {gezeigt.length > 0 && (
          <span className="small sl-fuss">
            {gezeigt.length} {gezeigt.length === 1 ? "Beleg" : "Belege"} · Summe brutto {formatEUR(summe)}
            {(sicht !== "alle" || suche.trim()) && " (nur die angezeigte Auswahl)"}
          </span>
        )}
      </div>

      {offeneZeigen && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setOffeneZeigen(false)}>
          <div className="auswahl-blatt am-breit" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Noch nicht ausgestellt">
            <div className="ab-griff" />
            <div className="ab-titel">Noch nicht ausgestellt</div>
            <span className="small">Erledigte Aufträge mit „Rechnung nötig“, aber ohne Rechnung. Die Rechnung entsteht im Auftrag.</span>
            {offene.map((o) => (
              <div key={o.id} className="am-listen-zeile statisch">
                <span className="am-lz-text"><b>{o.kunde}</b><span className="small">erledigt {formatDate(o.datum)} · #{auftragsNr(o.nummer)}</span></span>
                <b>{formatEUR(o.netto)}</b>
                {onAuftragOeffnen && <button type="button" className="am-mini" onClick={() => { setOffeneZeigen(false); onAuftragOeffnen(o.id); }}>Rechnung</button>}
              </div>
            ))}
          </div>
        </div>
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
                  onClick={() => { setStornoGrund(""); setStornoFrage(beleg); }}>
                  Stornieren
                </button>
              )}
              {beleg.storniert_durch && (
                <span className="small">
                  Aufgehoben am {beleg.storniert_am ? formatDate(beleg.storniert_am.slice(0, 10)) : ""} durch{" "}
                  {rechnungen.find((r) => r.id === beleg.storniert_durch)?.nummer_text ?? "eine Stornorechnung"}.
                </span>
              )}
              {beleg.art === "storno" && beleg.storno_grund && (
                <span className="small">Grund: {beleg.storno_grund}</span>
              )}
              {beleg.order_id && onAuftragOeffnen && (
                <button type="button" className="btn-secondary btn-rand"
                  onClick={() => { setOffen(null); onAuftragOeffnen(beleg.order_id!); }}>
                  Zum Auftrag
                </button>
              )}
              {beleg.customer_id && onKundeOeffnen && (
                <button type="button" className="btn-secondary btn-rand"
                  onClick={() => { setOffen(null); onKundeOeffnen(beleg.customer_id!); }}>
                  Zum Kunden
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
            <div className="field">
              <label htmlFor="stornoGrundListe">Grund der Stornierung *</label>
              <textarea
                id="stornoGrundListe" rows={2} value={stornoGrund} autoFocus
                onChange={(e) => setStornoGrund(e.target.value)}
                placeholder="z. B. falscher Kunde ausgewählt, Leistung nicht erbracht, Preis falsch"
              />
            </div>
            <div className="re-fussleiste">
              <button type="button" className="btn-primary" disabled={laeuft || !stornoGrund.trim()}
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

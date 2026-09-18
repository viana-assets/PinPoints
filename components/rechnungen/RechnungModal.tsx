import { useMemo, useState } from "react";
import type { Article, Betrieb, Customer, Order, OrderArticle, Rechnung } from "@/lib/types";
import { entwurfBauen, stornoAus, istGueltig, voraussichtlicheNummer } from "@/lib/rechnung";
import type { RechnungEntwurf } from "@/lib/rechnung";
import { RechnungDokument } from "./RechnungDokument";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";
import { formatDate, formatEUR, todayStr } from "@/lib/helpers";

// Das Rechnungsfenster am Auftrag.
//
// Es kennt drei Zustände, und der Unterschied zwischen ihnen ist der ganze Punkt:
//
//   ENTWURF     – noch keine Nummer. Alles am Auftrag lässt sich weiter ändern, das Fenster
//                 zeigt bei jedem Öffnen den aktuellen Stand.
//   AUSGESTELLT – Nummer vergeben, Inhalt eingefroren. Ab hier ist es ein Beleg.
//   STORNIERT   – aufgehoben durch eine zweite Rechnung. Beide bleiben stehen.
//
// Die Nummer wird erst auf Knopfdruck vergeben und nicht schon beim Öffnen. Eine Nummer, die
// entsteht, weil jemand nachsehen wollte, ist eine Lücke im Kreis, sobald er das Fenster
// wieder schließt.

export function RechnungModal({
  auftrag, kunde, betrieb, zeilen, artikel, kennzeichen, rechnungen,
  darfSchreiben, onAusstellen, onStornieren, onClose,
}: {
  auftrag: Order;
  kunde: Customer | null;
  betrieb: Betrieb | null;
  zeilen: OrderArticle[];
  artikel: Article[];
  kennzeichen: string[];
  rechnungen: Rechnung[];
  darfSchreiben: boolean;
  onAusstellen: (entwurf: RechnungEntwurf) => Promise<Rechnung>;
  onStornieren: (entwurf: RechnungEntwurf & { hebt_auf: string }) => Promise<Rechnung>;
  onClose: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stornoFrage, setStornoFrage] = useState<Rechnung | null>(null);
  // Welcher Beleg gerade gezeigt wird. Null heißt „der Entwurf".
  const [gezeigt, setGezeigt] = useState<string | null>(
    () => rechnungen.find(istGueltig)?.id ?? rechnungen.find((r) => r.art === "rechnung")?.id ?? null
  );

  const gueltige = rechnungen.find(istGueltig) ?? null;
  const beleg = gezeigt ? rechnungen.find((r) => r.id === gezeigt) ?? null : null;

  const entwurf = useMemo<RechnungEntwurf | null>(() => {
    if (!kunde || !betrieb) return null;
    return entwurfBauen({ auftrag, kunde, betrieb, zeilen, artikel, kennzeichen, heute: todayStr() });
  }, [auftrag, kunde, betrieb, zeilen, artikel, kennzeichen]);

  // Was einer Rechnung im Weg steht. ALLES auf einmal und nicht der erste Mangel: Wer dreimal
  // hintereinander eine Meldung bekommt, die jeweils einen weiteren nennt, hält das Programm
  // für schikanös – zu Recht (dieselbe Überlegung wie in RechnungsdatenBlock).
  const maengel: string[] = [];
  if (!kunde) maengel.push("der Kunde ist nicht geladen");
  if (!betrieb?.firma?.trim()) maengel.push("die Betriebsdaten fehlen (Admin → Betrieb)");
  if (!kunde?.address?.trim()) maengel.push("die Anschrift des Kunden fehlt");
  if (zeilen.length === 0) maengel.push("am Auftrag steht keine Leistung");

  async function ausstellen() {
    if (!entwurf) return;
    setLaeuft(true); setFehler(null);
    try {
      const neu = await onAusstellen(entwurf);
      setGezeigt(neu.id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Rechnung konnte nicht ausgestellt werden.");
    } finally {
      setLaeuft(false);
    }
  }

  async function stornieren(r: Rechnung) {
    setLaeuft(true); setFehler(null); setStornoFrage(null);
    try {
      const neu = await onStornieren(stornoAus(r, todayStr()));
      setGezeigt(neu.id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Rechnung konnte nicht storniert werden.");
    } finally {
      setLaeuft(false);
    }
  }

  const zeigbar = beleg ?? entwurf;

  return (
    <div className="modal-overlay modal-rechnung" onClick={onClose}>
      <div className="modal-box rechnung-modal" onClick={(e) => e.stopPropagation()}>
        <style>{RECHNUNG_SEITE_CSS}</style>

        <div className="re-kopfleiste druck-weg">
          <h3>
            Rechnung zu Auftrag {auftrag.order_number}
            {beleg && <span className={"re-pille" + (beleg.art === "storno" ? " storno" : beleg.storniert_durch ? " aufgehoben" : "")}>
              {beleg.art === "storno" ? "Storno" : beleg.storniert_durch ? "storniert" : "ausgestellt"}
            </span>}
            {!beleg && <span className="re-pille entwurf">Entwurf</span>}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {/* Mehrere Belege am selben Auftrag: nach einem Storno sind es mindestens drei. Die
            Leiste steht nur da, wenn es etwas zu wählen gibt. */}
        {rechnungen.length > 0 && (
          <div className="filterbar druck-weg re-auswahl">
            {rechnungen.map((r) => (
              <button
                key={r.id} type="button"
                className={`chip ${gezeigt === r.id ? "active" : ""}`}
                onClick={() => setGezeigt(r.id)}
              >
                {r.nummer_text}
                <span className="small"> · {formatDate(r.datum)} · {formatEUR(r.brutto)}</span>
              </button>
            ))}
            {!gueltige && (
              <button type="button" className={`chip ${gezeigt === null ? "active" : ""}`} onClick={() => setGezeigt(null)}>
                Neuer Entwurf
              </button>
            )}
          </div>
        )}

        {!beleg && maengel.length > 0 && (
          <div className="hinweis-pflicht druck-weg">
            So lässt sich noch keine Rechnung ausstellen: {maengel.join(", ")}.
          </div>
        )}
        {fehler && <div className="hinweis-pflicht druck-weg">{fehler}</div>}

        {zeigbar ? (
          <div className="rechnung-vorschau">
            <div className="rechnung-vorschau-rahmen">
              <RechnungDokument
                daten={beleg
                  ? beleg
                  : { ...(zeigbar as RechnungEntwurf), entwurf: true,
                      voraussichtlich: betrieb ? voraussichtlicheNummer(betrieb) : undefined }}
              />
            </div>
          </div>
        ) : (
          <div className="empty">Die Vorschau braucht Kunde und Betriebsdaten.</div>
        )}

        <div className="re-fussleiste druck-weg">
          {beleg ? (
            <>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                Drucken / als PDF speichern
              </button>
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
            </>
          ) : (
            <>
              <button
                type="button" className="btn-primary"
                disabled={laeuft || maengel.length > 0 || !darfSchreiben}
                onClick={() => void ausstellen()}
              >
                {laeuft ? "Stellt aus …" : "Rechnung ausstellen"}
              </button>
              <span className="small">
                Danach steht die Nummer fest und der Inhalt lässt sich nicht mehr ändern –
                eine Korrektur läuft über eine Stornorechnung.
              </span>
            </>
          )}
        </div>

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
    </div>
  );
}

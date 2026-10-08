import { useMemo, useState } from "react";
import type { Article, Betrieb, Customer, Order, OrderArticle, Rechnung } from "@/lib/types";
import { ausstellMaengel, entwurfBauen, stornoAus, istGueltig, voraussichtlicheNummer } from "@/lib/rechnung";
import type { RechnungEntwurf } from "@/lib/rechnung";
import { RechnungDokument } from "./RechnungDokument";
import { RECHNUNG_SEITE_CSS } from "@/lib/constants";
import { formatDate, formatEUR, rechnungOhneEmail, todayStr } from "@/lib/helpers";
import { auftragsNr } from "@/lib/testkunde";
import { Blatt } from "@/components/Blatt";
import { BelegHinweise, BelegKnoepfe, StornoBlatt } from "./BelegTeile";

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
  darfSchreiben, darfStornieren, onAusstellen, onStornieren, onClose,
}: {
  auftrag: Order;
  kunde: Customer | null;
  betrieb: Betrieb | null;
  zeilen: OrderArticle[];
  artikel: Article[];
  kennzeichen: string[];
  rechnungen: Rechnung[];
  darfSchreiben: boolean;
  // „Rechnungen stornieren“ (Migration 78). Fehlt es, gilt wie früher „Rechnungen schreiben“.
  darfStornieren?: boolean;
  onAusstellen: (entwurf: RechnungEntwurf) => Promise<Rechnung>;
  onStornieren: (entwurf: RechnungEntwurf & { hebt_auf: string; storno_grund: string }) => Promise<Rechnung>;
  onClose: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stornoFrage, setStornoFrage] = useState<Rechnung | null>(null);
  // Der Stornogrund (Migration 54). Pflicht – ohne ihn lehnt die Datenbank den Beleg ab.
  const [stornoGrund, setStornoGrund] = useState("");
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
  const maengel = ausstellMaengel({ kunde, betrieb, zeilenAnzahl: zeilen.length, anderswo: !!auftrag.rechnung_extern && !gueltige });

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
    if (!stornoGrund.trim()) return;
    setLaeuft(true); setFehler(null); setStornoFrage(null);
    try {
      const neu = await onStornieren(stornoAus(r, todayStr(), stornoGrund));
      setStornoGrund("");
      setGezeigt(neu.id);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Rechnung konnte nicht storniert werden.");
    } finally {
      setLaeuft(false);
    }
  }

  const zeigbar = beleg ?? entwurf;

  // Seit v135 (Runde 3 der Designprüfung) ein Blatt wie alle Fenster (components/Blatt.tsx),
  // Breite „dokument“; Knöpfe und Storno-Rückfrage teilt es mit dem Belegfenster unter
  // „Rechnungen“ (BelegTeile.tsx). `druck-fenster` an der Ebene: Ohne die Klasse greifen die
  // Druckregeln aus globals.css nicht (v109).
  return (
    <Blatt breite="dokument" ebene="druck-fenster modal-rechnung" className="rechnung-modal" onClose={onClose}
      label={`Rechnung zu Auftrag ${auftragsNr(auftrag.order_number)}`}
      titel={<>
        Rechnung zu Auftrag {auftragsNr(auftrag.order_number)}
        {beleg && <span className={"re-pille" + (beleg.art === "storno" ? " storno" : beleg.storniert_durch ? " aufgehoben" : "")}>
          {beleg.art === "storno" ? "Storno" : beleg.storniert_durch ? "storniert" : "ausgestellt"}
        </span>}
        {!beleg && <span className="re-pille entwurf">Entwurf</span>}
      </>}
      fuss={beleg
        ? <BelegKnoepfe beleg={beleg} darfStornieren={darfSchreiben && (darfStornieren ?? true)} laeuft={laeuft}
            onStornoFrage={(r) => { setStornoGrund(""); setStornoFrage(r); }} />
        : (
          <button
            type="button" className="btn-primary"
            disabled={laeuft || maengel.length > 0 || !darfSchreiben}
            onClick={() => void ausstellen()}
          >
            {laeuft ? "Stellt aus …" : "Rechnung ausstellen"}
          </button>
        )}>
      <style>{RECHNUNG_SEITE_CSS}</style>

      {/* Mehrere Belege am selben Auftrag: nach einem Storno sind es mindestens drei. Die
          Leiste steht nur da, wenn es etwas zu wählen gibt. */}
      {rechnungen.length > 0 && (
        <div className="pl-filter druck-weg re-auswahl">
          {rechnungen.map((r) => (
            <button key={r.id} type="button" className={"pl-pille" + (gezeigt === r.id ? " aktiv" : "")} onClick={() => setGezeigt(r.id)}>
              {r.nummer_text}
              <span className="re-auswahl-unter">{formatDate(r.datum)} · {formatEUR(r.brutto)}</span>
            </button>
          ))}
          {!gueltige && (
            <button type="button" className={"pl-pille" + (gezeigt === null ? " aktiv" : "")} onClick={() => setGezeigt(null)}>
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
      {/* v128: Ohne E-Mail lässt sich abschließen und ausstellen (Migration 79) – nur nicht per Mail
          schicken, und auf der Rechnung steht dann keine. Ein Hinweis, keine Sperre. */}
      {!beleg && maengel.length === 0 && rechnungOhneEmail(kunde) && (
        <div className="hinweis-pflicht druck-weg">
          Beim Kunden ist keine E-Mail-Adresse hinterlegt – die Rechnung lässt sich dann nur drucken, nicht per
          Mail schicken. Nachtragen im Auftrag unter „Rechnung nötig“.
        </div>
      )}
      {beleg
        ? <BelegHinweise beleg={beleg} rechnungen={rechnungen} />
        : (
          <div className="re-notizen druck-weg">
            <span>Mit „Rechnung ausstellen“ steht die Nummer fest und der Inhalt lässt sich nicht mehr ändern –
              eine Korrektur läuft über eine Stornorechnung.</span>
          </div>
        )}

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

      {stornoFrage && (
        <StornoBlatt rechnung={stornoFrage} grund={stornoGrund} onGrund={setStornoGrund} laeuft={laeuft}
          onStornieren={() => void stornieren(stornoFrage)} onAbbrechen={() => setStornoFrage(null)} />
      )}
    </Blatt>
  );
}

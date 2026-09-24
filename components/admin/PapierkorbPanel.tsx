import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPapierkorb, kundeEndgueltigLoeschen, kundeWiederherstellen, type PapierkorbKunde } from "@/lib/api/customers";
import { formatDate } from "@/lib/helpers";

// Der Papierkorb für Kunden (Fahrplan B2, Migration 56).
//
// Bis hierher wurde ein gelöschter Kunde nur markiert (`deleted_at`, Migration 19) und war danach
// nirgends mehr zu sehen – weder, dass es ihn gab, noch seit wann er gelöscht ist. Für eine
// Löschanfrage nach DSGVO gab es damit keinen bedienbaren Weg.
//
// Zwei Handlungen, bewusst ungleich gewichtet:
//   - Wiederherstellen: jeder, der Kunden schreiben darf. Holt die mitgelöschten Aufträge zurück.
//   - Endgültig löschen: nur der Superadmin, mit einer zweiten, ausdrücklichen Bestätigung.
//     Unumkehrbar. Ausgestellte Rechnungen bleiben als Beleg stehen (Aufbewahrungspflicht) –
//     das steht in der Bestätigung, damit es in die Antwort an den Kunden kommt.
export function PapierkorbPanel({ supabase, isSuperAdmin, onKundenbestandGeaendert }: {
  supabase: SupabaseClient;
  isSuperAdmin: boolean;
  // Nach einem Wiederherstellen muss die Kundenliste neu geladen werden, sonst fehlt der Kunde
  // dort, bis jemand die Seite neu lädt.
  onKundenbestandGeaendert: () => void;
}) {
  const [liste, setListe] = useState<PapierkorbKunde[] | null>(null);
  const [stand, setStand] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    fetchPapierkorb(supabase)
      .then((l) => { if (!abgebrochen) { setListe(l); setFehler(null); } })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); });
    return () => { abgebrochen = true; };
  }, [supabase, stand]);

  async function wiederherstellen(k: PapierkorbKunde) {
    setLaeuft(k.id); setFehler(null); setMeldung(null);
    try {
      await kundeWiederherstellen(supabase, k.id);
      setMeldung(`${k.name} ist wiederhergestellt – samt der mitgelöschten Aufträge.`);
      onKundenbestandGeaendert();
      setStand((n) => n + 1);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  }

  async function endgueltig(k: PapierkorbKunde) {
    setLaeuft(k.id); setFehler(null); setMeldung(null);
    try {
      const r = await kundeEndgueltigLoeschen(supabase, k.id);
      setMeldung(
        `Endgültig gelöscht${r.kundennummer ? ` (Kundennummer ${r.kundennummer})` : ""}: `
        + `${r.auftraege} ${r.auftraege === 1 ? "Auftrag" : "Aufträge"}, ${r.fahrzeuge} ${r.fahrzeuge === 1 ? "Fahrzeug" : "Fahrzeuge"}, `
        + `${r.protokolleintraege} Protokolleinträge.`
        + (r.rechnungen_bleiben > 0 ? ` ${r.rechnungen_bleiben} ${r.rechnungen_bleiben === 1 ? "Rechnung bleibt" : "Rechnungen bleiben"} als Beleg erhalten.` : "")
      );
      setBestaetigen(null);
      setStand((n) => n + 1);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="admin-card">
      <h4 style={{ margin: 0 }}>Papierkorb – gelöschte Kunden</h4>
      <p className="small" style={{ marginTop: 2 }}>
        Ein gelöschter Kunde ist aus allen Listen verschwunden, aber noch gespeichert – samt Aufträgen
        und Protokoll. Hier lässt er sich zurückholen oder
        {isSuperAdmin ? " endgültig entfernen, etwa auf eine Löschanfrage hin." : " vom Superadmin endgültig entfernen."}
      </p>

      {meldung && <div className="hinweis-ok" role="status">{meldung}</div>}
      {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}

      {liste === null ? (
        <div className="small">Lädt …</div>
      ) : liste.length === 0 ? (
        <div className="empty">Der Papierkorb ist leer.</div>
      ) : (
        // Eine Karte je Kunde statt einer Tabelle: Die Bestätigung zum endgültigen Löschen ist
        // ein ganzer Absatz, und in einer Tabellenzelle wird sie am Handy zur Spalte aus
        // Einzelwörtern.
        <div className="papierkorb-liste">
          {liste.map((k) => (
            <div key={k.id} className="papierkorb-eintrag">
              <div className="pk-kopf">
                <div className="pk-wer">
                  <b>{k.name}</b>{k.company ? <span className="small"> · {k.company}</span> : null}
                  <div className="small">
                    {k.address ? `${k.address} · ` : ""}gelöscht am {formatDate(k.deleted_at)}
                    {k.kundennummer ? ` · Nr. ${k.kundennummer}` : ""}
                  </div>
                </div>
                <div className="pk-knoepfe">
                  <button type="button" className="btn-secondary btn-rand" disabled={laeuft !== null} onClick={() => void wiederherstellen(k)}>
                    Wiederherstellen
                  </button>
                  {isSuperAdmin && !k.laufkundschaft && bestaetigen !== k.id && (
                    <button type="button" className="btn-secondary btn-rand" style={{ color: "#b33" }}
                            disabled={laeuft !== null} onClick={() => setBestaetigen(k.id)}>
                      Endgültig löschen …
                    </button>
                  )}
                </div>
              </div>
              {bestaetigen === k.id && (
                <div className="hinweis-pflicht" style={{ marginTop: 8 }}>
                  <b>Endgültig löschen ist nicht rückgängig zu machen.</b> Entfernt werden der
                  Kunde, seine Fahrzeuge, Aufträge, Kontakte, früheren Einlagerungen und alle
                  Protokolleinträge dazu. Ausgestellte Rechnungen bleiben als Beleg erhalten –
                  dazu besteht eine Aufbewahrungspflicht.
                  <div className="pk-knoepfe" style={{ marginTop: 8 }}>
                    <button type="button" className="btn-danger" disabled={laeuft !== null} onClick={() => void endgueltig(k)}>
                      {laeuft === k.id ? "Löscht …" : "Ja, endgültig löschen"}
                    </button>
                    <button type="button" className="btn-secondary btn-rand" onClick={() => setBestaetigen(null)}>Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

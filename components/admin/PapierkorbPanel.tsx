import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPapierkorb, kundeEndgueltigLoeschen, kundeWiederherstellen, testkundeLoeschen, type PapierkorbKunde } from "@/lib/api/customers";
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

  // Ein Testkunde (Migration 60) geht restlos – samt Testrechnungen, die beim echten Kunden
  // als Beleg bleiben müssten. `kunde_endgueltig_loeschen()` verweist ihn deshalb hierher.
  async function testkundeWeg(k: PapierkorbKunde) {
    setLaeuft(k.id); setFehler(null); setMeldung(null);
    try {
      const r = await testkundeLoeschen(supabase, k.id);
      setMeldung(`Testkunde restlos gelöscht: ${r.auftraege} ${r.auftraege === 1 ? "Auftrag" : "Aufträge"}, ${r.rechnungen} Testrechnungen, ${r.fahrzeuge} ${r.fahrzeuge === 1 ? "Fahrzeug" : "Fahrzeuge"}, ${r.protokolleintraege} Protokolleinträge.`);
      setBestaetigen(null);
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

  const initialen = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div className="ad-abschnitt">
      <span className="small ad-hilfe">
        Ein gelöschter Kunde ist aus allen Listen verschwunden, aber noch gespeichert – samt Aufträgen
        und Protokoll. Hier lässt er sich zurückholen oder
        {isSuperAdmin ? " endgültig entfernen, etwa auf eine Löschanfrage (DSGVO) hin." : " vom Superadmin endgültig entfernen."}
        {" "}Rechnungen bleiben als Beleg erhalten.
      </span>

      {meldung && <div className="hinweis-ok" role="status">{meldung}</div>}
      {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}

      {liste === null ? (
        <div className="db-karte"><div className="db-leer">Lädt …</div></div>
      ) : liste.length === 0 ? (
        <div className="db-karte"><div className="db-leer">Der Papierkorb ist leer.</div></div>
      ) : (
        // Eine Karte je Kunde statt einer Tabelle: Die Bestätigung zum endgültigen Löschen ist
        // ein ganzer Absatz, und in einer Tabellenzelle wird sie am Handy zur Spalte aus
        // Einzelwörtern.
        liste.map((k) => (
          <div key={k.id} className="ad-karte ad-karte-block">
            <div className="ad-karte-zeile">
              <span className="ad-kreis grau">{initialen(k.company?.trim() || k.name)}</span>
              <span className="ad-karte-text">
                <b>{k.name}{k.company ? ` · ${k.company}` : ""}{k.testkunde && <span className="test-marke">TEST</span>}</b>
                <span className="small">
                  gelöscht {formatDate(k.deleted_at)}
                  {k.kundennummer ? ` · Kd.-Nr. ${k.kundennummer}` : ""}
                  {k.address ? ` · ${k.address}` : ""}
                </span>
              </span>
              <span className="ad-karte-knoepfe">
                <button type="button" className="db-link" disabled={laeuft !== null} onClick={() => void wiederherstellen(k)}>
                  {laeuft === k.id && bestaetigen !== k.id ? "…" : "Wiederherstellen"}
                </button>
                {isSuperAdmin && !k.laufkundschaft && bestaetigen !== k.id && (
                  <button type="button" className="db-link ad-gefahr-link" disabled={laeuft !== null} onClick={() => setBestaetigen(k.id)}>
                    {k.testkunde ? "Restlos löschen …" : "Endgültig löschen …"}
                  </button>
                )}
              </span>
            </div>
            {bestaetigen === k.id && k.testkunde && (
              <div className="hinweis-pflicht">
                <b>Testkunde restlos löschen?</b> Entfernt werden der Kunde, seine Aufträge,
                Testrechnungen, Fahrzeuge, Reifen, Kontakte und alle Protokolleinträge dazu.
                <div className="pk-knoepfe" style={{ marginTop: 8 }}>
                  <button type="button" className="btn-danger" disabled={laeuft !== null} onClick={() => void testkundeWeg(k)}>
                    {laeuft === k.id ? "Löscht …" : "Ja, restlos löschen"}
                  </button>
                  <button type="button" className="btn-secondary btn-rand" onClick={() => setBestaetigen(null)}>Abbrechen</button>
                </div>
              </div>
            )}
            {bestaetigen === k.id && !k.testkunde && (
              <div className="hinweis-pflicht">
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
        ))
      )}
    </div>
  );
}

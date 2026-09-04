import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/helpers";
import { fetchKundenOhneKoordinaten, setzeKundenKoordinaten } from "@/lib/api/customers";

// Sammellauf für Kunden ohne Kartenposition.
//
// Anlass ist der Import der Altdaten (supabase/import/): über einen SQL-Befehl angelegte Kunden
// haben keine Koordinaten, weil die Geokodierung im Browser passiert und nicht in der
// Datenbank. Ohne diesen Lauf lägen 422 Kunden dauerhaft unter „Ohne Karte", und der einzige
// Weg wäre, jeden einzeln zu öffnen und die Adresse neu zu speichern.
//
// Der Lauf nimmt bewusst denselben Weg wie jede andere Adresse in dieser App: die eigene
// Serverroute `/api/geocode`. Die drosselt auf eine Anfrage pro Sekunde (Vorgabe von
// Nominatim), schickt einen erkennbaren User-Agent mit und merkt sich jede Adresse im Cache
// (Migration 17). Eine zweite, schnellere Abkürzung an dieser Route vorbei hätte genau die
// Schutzmaßnahmen umgangen, für die sie gebaut wurde.
//
// Rund eine Adresse pro Sekunde heißt: gut sieben Minuten für 422 Kunden. Deshalb läuft es
// sichtbar, mit Fortschritt und Abbruchmöglichkeit, statt hinter einem stummen Wartekreis.

type Stand = { gesamt: number; erledigt: number; treffer: number; ohneTreffer: number; fehler: number };

export function GeokodierLauf({ supabase }: { supabase: SupabaseClient }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const abbruch = useRef(false);

  async function starten() {
    setMeldung(null);
    setLaeuft(true);
    abbruch.current = false;
    try {
      const offen = await fetchKundenOhneKoordinaten(supabase);
      if (offen.length === 0) {
        setMeldung("Alle Kunden mit Adresse haben bereits eine Kartenposition.");
        setStand(null);
        return;
      }
      const s: Stand = { gesamt: offen.length, erledigt: 0, treffer: 0, ohneTreffer: 0, fehler: 0 };
      setStand({ ...s });
      for (const kunde of offen) {
        if (abbruch.current) { setMeldung(`Abgebrochen nach ${s.erledigt} von ${s.gesamt}. Ein erneuter Start macht dort weiter.`); break; }
        try {
          const treffer = await geocodeAddress(kunde.address);
          if (treffer) {
            await setzeKundenKoordinaten(supabase, kunde.id, treffer.lat, treffer.lng);
            s.treffer++;
          } else {
            // Kein Treffer ist kein Fehler: die Adresse ist unvollständig oder falsch
            // geschrieben. Der Kunde bleibt unter „Ohne Karte" und lässt sich dort abarbeiten.
            s.ohneTreffer++;
          }
        } catch {
          s.fehler++;
        }
        s.erledigt++;
        setStand({ ...s });
      }
      if (!abbruch.current) {
        setMeldung(`Fertig: ${s.treffer} von ${s.gesamt} Adressen gefunden.` +
          (s.ohneTreffer ? ` ${s.ohneTreffer} ohne Treffer – bitte die Adresse prüfen.` : "") +
          (s.fehler ? ` ${s.fehler} mit Fehler – ein erneuter Start versucht sie noch einmal.` : ""));
      }
    } finally {
      setLaeuft(false);
    }
  }

  const anteil = stand && stand.gesamt > 0 ? Math.round((stand.erledigt / stand.gesamt) * 100) : 0;

  return (
    <div className="wh-card" style={{ cursor: "default", maxWidth: 520 }}>
      <h4 style={{ marginTop: 0 }}>Adressen geokodieren</h4>
      <p className="small" style={{ marginTop: 0 }}>
        Trägt für alle Kunden ohne Kartenposition die Koordinaten nach. Läuft mit einer Adresse
        pro Sekunde über die eigene, gedrosselte Route – für einige hundert Kunden also einige
        Minuten. Das Fenster muss dabei offen bleiben; ein Abbruch verliert nichts, ein erneuter
        Start macht bei den verbliebenen weiter.
      </p>

      {stand && (
        <>
          <div className="fortschritt"><div className="fortschritt-balken" style={{ width: `${anteil}%` }} /></div>
          <div className="small" style={{ marginBottom: 8 }}>
            {stand.erledigt} von {stand.gesamt} · {stand.treffer} gefunden
            {stand.ohneTreffer > 0 && ` · ${stand.ohneTreffer} ohne Treffer`}
            {stand.fehler > 0 && ` · ${stand.fehler} Fehler`}
          </div>
        </>
      )}
      {meldung && <div className="small" style={{ marginBottom: 8 }}>{meldung}</div>}

      {laeuft ? (
        <button type="button" className="btn-secondary" onClick={() => { abbruch.current = true; }}>Abbrechen</button>
      ) : (
        <button type="button" className="btn-primary" onClick={starten}>Sammellauf starten</button>
      )}
    </div>
  );
}

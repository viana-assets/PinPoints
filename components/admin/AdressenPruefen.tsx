import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sucheAdressen, type Adressvorschlag } from "@/lib/api/adressen";
import { fetchKundenOhneKoordinaten, uebernehmeAdresse } from "@/lib/api/customers";
import { vorschlagOhneHausnummer } from "@/lib/helpers";

// Korrekturliste für Kunden ohne Kartenposition (siehe docs/kunden-und-karte.md).
//
// Anlass: von 422 importierten Altkunden ließen sich rund 130 nicht verorten. Die Ursachen sind
// harmlos und trotzdem unauffindbar – „Rehhostraße" statt „Rehhofstraße", „Balthaser-Neumann"
// statt „Balthasar-Neumann", eine fehlende Hausnummer. Jeden einzeln zu öffnen und daneben
// eine Karte aufzumachen ist ein Abend Arbeit; hier steht der Vorschlag gleich daneben.
//
// Die App ÄNDERT NICHTS VON SELBST. Auch wenn ein Vorschlag offensichtlich richtig aussieht,
// bleibt die Übernahme ein Klick: eine stillschweigend geänderte Kundenadresse fällt niemandem
// auf, und auf einem Lieferschein steht sie dann falsch, ohne dass jemand es entschieden hat.
//
// Zwei Befunde aus dem Betrieb am 14.09.2026 stecken hier drin:
//
// 1. Es gibt Fälle, in denen KEIN Vorschlag taugt – dann muss die Adresse von Hand korrigiert
//    werden. Dafür musste man die Liste verlassen, den Kunden suchen, ändern, zurückfinden und
//    die Liste neu aufbauen. Jetzt öffnet ein Klick auf den Namen das Kundenfenster; die Liste
//    bleibt dahinter stehen.
// 2. Der Kartendienst antwortet auf eine Adresse mit Hausnummer gern mit derselben Straße OHNE
//    Hausnummer. Dieser Vorschlag ist ärmer als das, was schon dasteht – ihn kommentarlos neben
//    „Übernehmen" zu setzen hieße, mit einem Klick eine gute Adresse zu verschlechtern.

type Zeile = {
  id: string;
  name: string;
  adresse: string;
  vorschlaege: Adressvorschlag[];
  zustand: "offen" | "sucht" | "fertig" | "kein-treffer" | "fehler" | "uebernommen";
};

// Wie viele Adressen gleichzeitig abgefragt werden. Nacheinander wäre bei 130 Zeilen eine
// spürbare Wartezeit, alle auf einmal wäre ein Ansturm auf einen kostenlosen Fremddienst.
const GLEICHZEITIG = 3;

export function AdressenPruefen({ supabase, onFertig, onKundeOeffnen }: {
  supabase: SupabaseClient;
  onFertig: () => void;
  // Öffnet das Kundenfenster über dieser Liste – für die Fälle, die kein Vorschlag löst.
  onKundeOeffnen: (kundenId: string) => void;
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const roh = await fetchKundenOhneKoordinaten(supabase);
        const offen = roh.map((k) => ({ id: k.id, name: k.name, adresse: k.address }));
        if (abgebrochen) return;
        if (offen.length === 0) { setMeldung("Alle Kunden mit Adresse haben eine Kartenposition."); setLaedt(false); return; }
        setZeilen(offen.map((k) => ({ ...k, vorschlaege: [], zustand: "offen" as const })));
        setLaedt(false);

        // Vorschläge nachladen, in kleinen Wellen.
        for (let i = 0; i < offen.length; i += GLEICHZEITIG) {
          if (abgebrochen) return;
          const welle = offen.slice(i, i + GLEICHZEITIG);
          await Promise.all(welle.map(async (k) => {
            setZeilen((z) => z.map((x) => (x.id === k.id ? { ...x, zustand: "sucht" } : x)));
            try {
              const treffer = await sucheAdressen(k.adresse);
              if (abgebrochen) return;
              setZeilen((z) => z.map((x) => (x.id === k.id
                ? { ...x, vorschlaege: treffer, zustand: treffer.length ? "fertig" : "kein-treffer" }
                : x)));
            } catch {
              if (abgebrochen) return;
              setZeilen((z) => z.map((x) => (x.id === k.id ? { ...x, zustand: "fehler" } : x)));
            }
          }));
        }
      } catch {
        if (!abgebrochen) { setMeldung("Die Kundenliste konnte nicht geladen werden."); setLaedt(false); }
      }
    })();
    return () => { abgebrochen = true; };
  }, [supabase]);

  async function uebernehmen(zeile: Zeile, v: Adressvorschlag) {
    await uebernehmeAdresse(supabase, zeile.id, v.label, v.lat, v.lng);
    setZeilen((z) => z.map((x) => (x.id === zeile.id ? { ...x, adresse: v.label, zustand: "uebernommen" } : x)));
    onFertig();
  }

  const offenAnzahl = zeilen.filter((z) => z.zustand !== "uebernommen").length;

  return (
    <div style={{ maxWidth: 760 }}>
      <h4 style={{ marginTop: 0 }}>Adressen prüfen</h4>
      <p className="small" style={{ marginTop: 0 }}>
        Kunden, für die der Kartendienst keine Position gefunden hat – meist ein Tippfehler oder
        eine fehlende Hausnummer. Der Vorschlag daneben ist ein Angebot: erst ein Klick auf
        &bdquo;Übernehmen&ldquo; ändert die Adresse und setzt die Kartenposition.
      </p>

      {laedt && <div className="small">Liste wird geladen …</div>}
      {meldung && <div className="small">{meldung}</div>}
      {!laedt && zeilen.length > 0 && (
        <div className="small" style={{ marginBottom: 8 }}>Noch offen: {offenAnzahl} von {zeilen.length}</div>
      )}

      {zeilen.map((z) => (
        <div key={z.id} className={`adr-pruef${z.zustand === "uebernommen" ? " erledigt" : ""}`}>
          <div className="adr-pruef-kopf">
            <button
              type="button"
              className="adr-pruef-kunde"
              onClick={() => onKundeOeffnen(z.id)}
              title="Kundenfenster öffnen – dort lässt sich die Adresse von Hand korrigieren"
            >
              <b>{z.name}</b>
              <span className="small">{z.adresse || "– keine Adresse hinterlegt –"}</span>
            </button>
            {z.zustand === "sucht" && <span className="small">sucht …</span>}
            {z.zustand === "uebernommen" && <span className="gespeichert-haken">✓ Übernommen</span>}
            {z.zustand === "kein-treffer" && <span className="small">kein Vorschlag</span>}
            {z.zustand === "fehler" && <span className="small">Dienst nicht erreichbar</span>}
          </div>

          {z.zustand === "fertig" && (
            <ul className="adr-pruef-liste">
              {z.vorschlaege.slice(0, 3).map((v) => {
                const aermer = vorschlagOhneHausnummer(z.adresse, v.label);
                return (
                  <li key={v.label} className={aermer ? "aermer" : undefined}>
                    <span>
                      {v.label}
                      {aermer && (
                        <em className="adr-warnung">
                          ohne Hausnummer – die Karte zeigt dann den Anfang der Straße
                        </em>
                      )}
                    </span>
                    <button type="button" className="btn-secondary" onClick={() => uebernehmen(z, v)}>
                      {aermer ? "Trotzdem übernehmen" : "Übernehmen"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Wenn gar nichts passt, ist der Weg über das Kundenfenster der einzige – und der
              Hinweis steht dort, wo man ihn braucht, statt in der Anleitung oben. */}
          {(z.zustand === "kein-treffer" || z.zustand === "fehler") && (
            <button type="button" className="btn-secondary adr-pruef-hand" onClick={() => onKundeOeffnen(z.id)}>
              Adresse von Hand korrigieren
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

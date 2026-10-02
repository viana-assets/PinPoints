import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer } from "@/lib/types";
import { DUBLETTEN_GRUND_LABEL, dublettenPaare, paarSchluessel, uebernommeneFelder, vorschlagBehalten, type DublettenPaar } from "@/lib/dubletten";
import { fetchKeineDubletten, keineDubletteVermerken, kundenZusammenfuehren } from "@/lib/api/dubletten";

// Dubletten im Kundenbestand (Fahrplan E1, v103) – Reiter „Dubletten" im Adminbereich.
//
// Die Liste rechnet die Anwendung aus dem geladenen Bestand (lib/dubletten.ts): gleiche Nummer,
// gleiche E-Mail, gleicher Name mit gleicher PLZ. Je Paar zwei Handlungen:
//
//   * Zusammenführen – alles vom einen geht an den anderen (Aufträge, Fahrzeuge, Reifensätze,
//     Kontakte, Rechnungsverweise), leere Felder werden gefüllt, der leere Rest kommt in den
//     Papierkorb. In der Datenbank, ganz oder gar nicht (`kunden_zusammenfuehren()`, Migration 64).
//   * Keine Dublette – das Ehepaar mit demselben Festnetz. Der Vermerk nimmt das Paar dauerhaft
//     aus der Liste.
//
// Nur Admin und Superadmin (der Reiter steht nur dort, die Datenbank prüft es noch einmal).
export function DublettenPanel({ supabase, kunden, onKundeOeffnen, onKundenbestandGeaendert }: {
  supabase: SupabaseClient;
  kunden: Customer[];
  onKundeOeffnen: (id: string) => void;
  onKundenbestandGeaendert: () => void;
}) {
  const [vermerkt, setVermerkt] = useState<Set<string> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offen, setOffen] = useState<{ paar: DublettenPaar; behaltenId: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  // Gerade zusammengeführt: bis die Kundenliste neu geladen ist, steht der aufgegangene noch darin.
  const [weg, setWeg] = useState<Set<string>>(new Set());

  useEffect(() => {
    let abgebrochen = false;
    fetchKeineDubletten(supabase)
      .then((m) => { if (!abgebrochen) setVermerkt(m); })
      .catch((e) => { if (!abgebrochen) { setFehler(e instanceof Error ? e.message : String(e)); setVermerkt(new Set()); } });
    return () => { abgebrochen = true; };
  }, [supabase]);

  const paare = useMemo(
    () => (vermerkt ? dublettenPaare(kunden.filter((k) => !weg.has(k.id)), vermerkt) : []),
    [kunden, vermerkt, weg]
  );

  async function keineDublette(p: DublettenPaar) {
    setFehler(null); setMeldung(null);
    try {
      await keineDubletteVermerken(supabase, p.a.id, p.b.id);
      setVermerkt(new Set([...(vermerkt ?? []), paarSchluessel(p.a.id, p.b.id).join("|")]));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function zusammenfuehren() {
    if (!offen) return;
    const behalten = offen.paar.a.id === offen.behaltenId ? offen.paar.a : offen.paar.b;
    const aufgeben = behalten === offen.paar.a ? offen.paar.b : offen.paar.a;
    setLaeuft(true); setFehler(null); setMeldung(null);
    try {
      const r = await kundenZusammenfuehren(supabase, behalten.id, aufgeben.id);
      const teile = [
        `${r.auftraege} ${r.auftraege === 1 ? "Auftrag" : "Aufträge"}`,
        `${r.fahrzeuge} ${r.fahrzeuge === 1 ? "Fahrzeug" : "Fahrzeuge"}${r.fahrzeuge_vereint > 0 ? ` (${r.fahrzeuge_vereint} doppelt, vereint)` : ""}`,
        `${r.reifensaetze} ${r.reifensaetze === 1 ? "Reifensatz" : "Reifensätze"}`,
        `${r.kontakte} ${r.kontakte === 1 ? "Kontakt" : "Kontakte"}`,
        ...(r.rechnungen > 0 ? [`${r.rechnungen} ${r.rechnungen === 1 ? "Rechnung" : "Rechnungen"} (Beleg bleibt, wie ausgestellt)`] : []),
      ];
      setMeldung(`Zusammengeführt in ${behalten.name}: ${teile.join(", ")}. Der andere liegt leer im Papierkorb.`);
      setWeg(new Set([...weg, aufgeben.id]));
      setOffen(null);
      onKundenbestandGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  const zeile = (k: Customer) => [k.address, k.phone_mobile, k.phone_landline, k.email].filter((x) => !!x?.trim()).join(" · ");

  return (
    <div className="ad-abschnitt">
      <span className="small ad-hilfe">
        Kunden, die vermutlich doppelt angelegt sind – gleiche Telefonnummer (in jeder Schreibweise),
        gleiche E-Mail oder gleicher Name mit gleicher PLZ. Zusammenführen legt alles beim einen ab und
        den leeren anderen in den Papierkorb; „Keine Dublette“ nimmt das Paar dauerhaft aus der Liste.
      </span>

      {meldung && <div className="hinweis-ok" role="status">{meldung}</div>}
      {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}

      {vermerkt === null ? (
        <div className="db-karte"><div className="db-leer">Lädt …</div></div>
      ) : paare.length === 0 ? (
        <div className="db-karte"><div className="db-leer">Keine vermuteten Dubletten.</div></div>
      ) : (
        paare.map((p) => (
          <div key={p.a.id + p.b.id} className="ad-karte ad-karte-block du-paar">
            <span className="du-gruende">{p.gruende.map((g) => DUBLETTEN_GRUND_LABEL[g]).join(" · ")}</span>
            {[p.a, p.b].map((k) => (
              <button key={k.id} type="button" className="du-kunde" onClick={() => onKundeOeffnen(k.id)}>
                <b>{k.name}{k.company ? ` · ${k.company}` : ""}{k.active === false ? " (deaktiviert)" : ""}</b>
                <span className="small">{[k.kundennummer != null ? `Kd.-Nr. ${k.kundennummer}` : "ohne Kundennummer", zeile(k)].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
            <div className="pk-knoepfe">
              <button type="button" className="btn-secondary btn-rand" onClick={() => void keineDublette(p)}>Keine Dublette</button>
              <button type="button" className="btn-primary" onClick={() => { setMeldung(null); setOffen({ paar: p, behaltenId: vorschlagBehalten(p.a, p.b).id }); }}>Zusammenführen …</button>
            </div>
          </div>
        ))
      )}

      {offen && (() => {
        const behalten = offen.paar.a.id === offen.behaltenId ? offen.paar.a : offen.paar.b;
        const aufgeben = behalten === offen.paar.a ? offen.paar.b : offen.paar.a;
        const felder = uebernommeneFelder(behalten, aufgeben);
        return (
          <div className="modal-overlay auswahl-overlay" onClick={() => !laeuft && setOffen(null)}>
            <div className="auswahl-blatt ar-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Kunden zusammenführen">
              <div className="ab-griff" />
              <div className="ab-titel">Zusammenführen</div>
              <span className="op-gruppe-titel">WER BLEIBT?</span>
              {[offen.paar.a, offen.paar.b].map((k) => (
                <button key={k.id} type="button" className={"ab-option" + (k.id === offen.behaltenId ? " gewaehlt" : "")} aria-pressed={k.id === offen.behaltenId}
                  onClick={() => setOffen({ ...offen, behaltenId: k.id })}>
                  <span className="ab-text">{k.id === offen.behaltenId ? "✓ " : ""}{k.name}{k.kundennummer != null ? ` · Kd.-Nr. ${k.kundennummer}` : ""}</span>
                  <span className="small">{zeile(k)}</span>
                </button>
              ))}
              <span className="small">
                Von {aufgeben.name} gehen alle Aufträge, Fahrzeuge, Reifensätze, Kontakte und Rechnungsverweise an {behalten.name}.
                {felder.length > 0 ? ` Ergänzt wird: ${felder.join(", ")}.` : " An den Kundendaten ändert sich nichts."}
                {" "}Fahrzeuge mit demselben Kennzeichen werden zu einem. Ausgestellte Rechnungen bleiben, wie sie sind.
                {" "}{aufgeben.name} kommt danach leer in den Papierkorb – zurückholen bringt die Aufträge nicht zurück.
              </span>
              <div className="pk-knoepfe" style={{ marginTop: 8 }}>
                <button type="button" className="btn-secondary btn-rand" disabled={laeuft} onClick={() => setOffen(null)}>Abbrechen</button>
                <button type="button" className="btn-danger" disabled={laeuft} onClick={() => void zusammenfuehren()}>
                  {laeuft ? "Führt zusammen …" : "Ja, zusammenführen"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

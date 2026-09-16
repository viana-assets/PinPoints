import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { Article, Employee } from "@/lib/types";
import { fetchAuswertungsdaten } from "@/lib/api/auswertung";
import type { AuswertungsAbzug } from "@/lib/api/auswertung";
import { jeArtikel, jeMitarbeiter, jeMonat, kennzahlen, zeitraumVorgabe } from "@/lib/auswertung";
import { formatEUR } from "@/lib/helpers";
import { IconAuswertung } from "@/components/icons";

// Register „Auswertungen" (Block D).
//
// Eine FESTE Seite und kein Auswertungsbaukasten. Der Unterschied ist keine Frage des
// Aufwands, sondern des Nutzens: Ein Baukasten, den man einmal im Quartal bedient, muss
// jedes Mal neu verstanden werden. Sechs Zahlen, die immer an derselben Stelle stehen, liest
// man im Vorbeigehen – und merkt, wenn eine sich verändert hat.
//
// WAS ALS UMSATZ ZÄHLT: nur erledigte Aufträge. Das steht auch in der Ansicht, weil eine Zahl
// ohne ihre Bedingung keine Auskunft ist. Ein offener Auftrag ist eine Absicht, ein
// stornierter ein Nichts.
//
// Gerechnet wird in lib/auswertung.ts – geprüft mit 17 Fällen. Diese Datei zeigt nur an.

function Kachel({ titel, wert, unten }: { titel: string; wert: string; unten?: string }) {
  return (
    <div className="aw-kachel">
      <span className="awk-titel">{titel}</span>
      <span className="awk-wert">{wert}</span>
      {unten && <span className="awk-unten">{unten}</span>}
    </div>
  );
}

// Ein Balkendiagramm aus einfachen divs statt einer Diagrammbibliothek: Zwölf Balken
// rechtfertigen keine zusätzliche Abhängigkeit, und die App soll offline laufen.
function Monatsbalken({ reihe }: { reihe: { monat: string; auftraege: number; umsatzNetto: number }[] }) {
  const hoechst = Math.max(1, ...reihe.map((m) => m.umsatzNetto));
  return (
    <div className="aw-balken">
      {reihe.map((m) => {
        const [jahr, monat] = m.monat.split("-");
        return (
          <div key={m.monat} className="awb-spalte" title={`${m.monat}: ${m.auftraege} Aufträge, ${formatEUR(m.umsatzNetto)} netto`}>
            <div className="awb-saeule">
              {/* Höhe ist die Aussage dieses Balkens und steht deshalb am Element. */}
              <div className="awb-fuellung" style={{ height: `${(m.umsatzNetto / hoechst) * 100}%` }} />
            </div>
            <span className="awb-zahl">{m.auftraege || ""}</span>
            <span className="awb-monat">{monat}{monat === "01" ? <><br />{jahr}</> : null}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AuswertungPanel({ employees, articles }: { employees: Employee[]; articles: Article[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [zeitraum, setZeitraum] = useState(() => zeitraumVorgabe("jahr"));
  const [abzug, setAbzug] = useState<AuswertungsAbzug | null>(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    fetchAuswertungsdaten(supabase, zeitraum.von, zeitraum.bis)
      .then((d) => { if (!abgebrochen) setAbzug(d); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [supabase, zeitraum.von, zeitraum.bis]);

  const daten = useMemo(() => ({
    orders: abzug?.orders ?? [],
    orderArticles: abzug?.orderArticles ?? [],
    orderEmployees: abzug?.orderEmployees ?? {},
    einlagerungen: abzug?.einlagerungen ?? [],
    employees, articles,
  }), [abzug, employees, articles]);

  const k = useMemo(() => kennzahlen(daten, zeitraum), [daten, zeitraum]);
  const monate = useMemo(() => jeMonat(daten, zeitraum), [daten, zeitraum]);
  const leute = useMemo(() => jeMitarbeiter(daten, zeitraum), [daten, zeitraum]);
  const posten = useMemo(() => jeArtikel(daten, zeitraum), [daten, zeitraum]);

  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="module-header">
          <div className="mh-icon"><IconAuswertung /></div>
          <div className="mh-text">
            <h2>Auswertungen</h2>
            <p>
              Alle Geldbeträge stammen aus <b>erledigten</b> Aufträgen – offene sind eine
              Absicht, stornierte ein Nichts. Steuer fällt nur dort an, wo am Auftrag
              &bdquo;Rechnung benötigt&ldquo; gesetzt ist.
            </p>
          </div>
        </div>

        <div className="filterbar">
          {([["jahr", "Dieses Jahr"], ["quartal", "Dieses Quartal"], ["letzte12", "Letzte 12 Monate"]] as const).map(([art, text]) => {
            const v = zeitraumVorgabe(art);
            const aktiv = v.von === zeitraum.von && v.bis === zeitraum.bis;
            return (
              <button key={art} type="button" className={`chip ${aktiv ? "active" : ""}`} onClick={() => setZeitraum(v)}>{text}</button>
            );
          })}
        </div>
        <div className="row" style={{ maxWidth: 380 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Von</label>
            <input type="date" value={zeitraum.von} onChange={(e) => setZeitraum({ ...zeitraum, von: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Bis</label>
            <input type="date" value={zeitraum.bis} onChange={(e) => setZeitraum({ ...zeitraum, bis: e.target.value })} />
          </div>
        </div>

        {laedt && <div className="small">Lädt …</div>}

        <div className="aw-kacheln">
          <Kachel titel="Erledigte Aufträge" wert={String(k.auftraegeErledigt)}
                  unten={`${k.auftraegeGesamt} insgesamt · ${k.auftraegeStorniert} storniert`} />
          <Kachel titel="Umsatz netto" wert={formatEUR(k.umsatzNetto)}
                  unten={`${formatEUR(k.umsatzBrutto)} brutto`} />
          {/* Die Steuer fällt nur an, wo „Rechnung benötigt" gesetzt ist – deshalb steht die
              Bezugsgröße dabei. Eine Steuersumme ohne die Angabe, worauf sie sich bezieht,
              sieht aus wie eine Gesamtzahl und ist keine. */}
          <Kachel titel="Steuer (nur mit Rechnung)" wert={formatEUR(k.umsatzsteuer)}
                  unten={`aus ${k.auftraegeMitRechnung} von ${k.auftraegeErledigt} Aufträgen`} />
          <Kachel titel="Gewährter Nachlass" wert={formatEUR(k.nachlass)}
                  unten="Listenpreis minus tatsächlicher Umsatz" />
          <Kachel titel="Kunden bedient" wert={String(k.kundenBedient)}
                  unten={`${k.auftraegeJeKunde.toFixed(1).replace(".", ",")} Aufträge je Kunde`} />
          <Kachel titel="Eingelagerte Sätze" wert={String(k.einlagerungen)}
                  unten="neu ins Lager gekommen" />
        </div>

        <h4>Verlauf – Umsatz je Monat</h4>
        <p className="small" style={{ marginTop: 0 }}>
          Die Säule ist der Nettoumsatz, die Zahl darunter die Anzahl der Aufträge. Leere
          Monate stehen mit drin: Bei einem Saisongeschäft sind die Lücken die Aussage.
        </p>
        <Monatsbalken reihe={monate} />

        <h4>Je Mitarbeiter</h4>
        <p className="small" style={{ marginTop: 0 }}>
          Ein Auftrag mit zwei Technikern zählt bei beiden voll – die Summe ist deshalb größer
          als die Zahl der Aufträge. Die Frage lautet &bdquo;woran war jemand beteiligt&ldquo;,
          nicht &bdquo;welchen Anteil hat jemand&ldquo;.
        </p>
        {leute.length === 0 ? <div className="empty">Keine erledigten Aufträge im Zeitraum.</div> : (
          <div className="modul-tabelle">
            <table className="appt-table">
              <thead><tr><th>Mitarbeiter</th><th>Aufträge</th><th>Umsatz netto</th></tr></thead>
              <tbody>
                {leute.map((m) => (
                  <tr key={m.id || "ohne"}>
                    <td>{m.name}</td>
                    <td>{m.auftraege}</td>
                    <td>{formatEUR(m.umsatzNetto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h4>Je Artikel – was wird verbraucht</h4>
        {posten.length === 0 ? <div className="empty">Keine Leistungen im Zeitraum.</div> : (
          <div className="modul-tabelle">
            <table className="appt-table">
              <thead><tr><th>Artikel</th><th>Menge</th><th>Umsatz netto</th></tr></thead>
              <tbody>
                {posten.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.menge.toLocaleString("de-DE")}</td>
                    <td>{formatEUR(a.umsatzNetto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

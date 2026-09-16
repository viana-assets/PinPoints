import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { Article, Customer, Employee, Vehicle } from "@/lib/types";
import { fetchAuswertungsdaten } from "@/lib/api/auswertung";
import type { AuswertungsAbzug } from "@/lib/api/auswertung";
import { artikelDetail, jeArtikel, jeMitarbeiter, jeMonat, kennzahlen, zeitraumVorgabe } from "@/lib/auswertung";
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

export function AuswertungPanel({ employees, articles, customers, vehicles }: {
  employees: Employee[]; articles: Article[];
  // Für die Artikelauswertung: Wer hat gekauft, und an welchem Auto wurde gearbeitet.
  customers: Customer[]; vehicles: Vehicle[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [zeitraum, setZeitraum] = useState(() => zeitraumVorgabe("jahr"));
  const [abzug, setAbzug] = useState<AuswertungsAbzug | null>(null);
  const [laedt, setLaedt] = useState(false);
  // Welcher Artikel im Detail betrachtet wird. Leer heißt: noch keiner gewählt – dann steht
  // dort der Hinweis statt einer Auswertung über nichts.
  const [detailArtikel, setDetailArtikel] = useState("");

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
    employees, articles, customers, vehicles,
  }), [abzug, employees, articles, customers, vehicles]);

  const k = useMemo(() => kennzahlen(daten, zeitraum), [daten, zeitraum]);
  const monate = useMemo(() => jeMonat(daten, zeitraum), [daten, zeitraum]);
  const leute = useMemo(() => jeMitarbeiter(daten, zeitraum), [daten, zeitraum]);
  const posten = useMemo(() => jeArtikel(daten, zeitraum), [daten, zeitraum]);
  const detail = useMemo(() => artikelDetail(daten, zeitraum, detailArtikel), [daten, zeitraum, detailArtikel]);

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
        <p className="small" style={{ marginTop: 0 }}>
          Ein Klick auf eine Zeile öffnet den Artikel unten im Detail.
        </p>
        {posten.length === 0 ? <div className="empty">Keine Leistungen im Zeitraum.</div> : (
          <div className="modul-tabelle">
            <table className="appt-table">
              <thead><tr><th>Artikel</th><th>Menge</th><th>Umsatz netto</th></tr></thead>
              <tbody>
                {posten.map((a) => (
                  <tr key={a.id} className="klickbar" onClick={() => setDetailArtikel(a.id)}>
                    <td>{a.name}</td>
                    <td>{a.menge.toLocaleString("de-DE")}</td>
                    <td>{formatEUR(a.umsatzNetto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------ Ein Artikel im Detail ------ */}
        <h4>Ein Artikel im Detail</h4>
        <div className="field" style={{ maxWidth: 380 }}>
          <label>Artikel</label>
          <select value={detailArtikel} onChange={(e) => setDetailArtikel(e.target.value)}>
            <option value="">– Artikel wählen –</option>
            {/* Alle Artikel, nicht nur die mit Umsatz: „von diesem Artikel haben wir nichts
                verkauft" ist auch eine Antwort, und sie geht verloren, wenn er gar nicht
                erst zur Auswahl steht. */}
            {[...articles].sort((a, b) => a.short_name.localeCompare(b.short_name, "de")).map((a) => (
              <option key={a.id} value={a.id}>{a.short_name}{a.active ? "" : " (inaktiv)"}</option>
            ))}
          </select>
        </div>

        {!detailArtikel ? (
          <div className="empty">
            Wähle einen Artikel – dann steht hier, in welchen Monaten er läuft, an wie viele
            Kunden er ging und wie viel davon auf ein Fahrzeug geht.
          </div>
        ) : (
          <>
            <div className="aw-kacheln">
              <Kachel titel="Menge" wert={detail.menge.toLocaleString("de-DE")}
                      unten={`in ${detail.auftraege} ${detail.auftraege === 1 ? "Auftrag" : "Aufträgen"}`} />
              <Kachel titel="Umsatz netto" wert={formatEUR(detail.umsatzNetto)} />
              <Kachel titel="Kunden" wert={String(detail.kunden)}
                      unten={`${detail.mengeJeKunde.toFixed(1).replace(".", ",")} je Kunde`} />
              <Kachel titel="Fahrzeuge" wert={String(detail.fahrzeuge)}
                      unten="mit Fahrzeug am Auftrag" />
              <Kachel titel="Je Auftrag" wert={detail.mengeJeAuftrag.toFixed(1).replace(".", ",")}
                      unten="Stück im Schnitt" />
            </div>

            <h4>Verlauf – Menge je Monat</h4>
            <Monatsbalken reihe={detail.jeMonat.map((m) => ({
              monat: m.monat, auftraege: m.menge, umsatzNetto: m.menge,
            }))} />

            <h4>Je Kunde</h4>
            {detail.jeKunde.length === 0 ? (
              <div className="empty">Dieser Artikel wurde im Zeitraum nicht verkauft.</div>
            ) : (
              <div className="modul-tabelle">
                <table className="appt-table">
                  <thead><tr><th>Kunde</th><th>Menge</th><th>Aufträge</th><th>Umsatz netto</th><th>zuletzt</th></tr></thead>
                  <tbody>
                    {detail.jeKunde.map((k) => (
                      <tr key={k.id}>
                        <td>{k.name}</td>
                        <td>{k.menge.toLocaleString("de-DE")}</td>
                        <td>{k.auftraege}</td>
                        <td>{formatEUR(k.umsatzNetto)}</td>
                        <td>{k.zuletzt ? new Date(k.zuletzt).toLocaleDateString("de-DE") : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4>Je Fahrzeug</h4>
            {detail.jeFahrzeug.length === 0 ? (
              <div className="empty">
                An keinem der Aufträge war ein Fahrzeug hinterlegt – ohne Fahrzeug am Auftrag
                lässt sich das nicht auswerten.
              </div>
            ) : (
              <div className="modul-tabelle">
                <table className="appt-table">
                  <thead><tr><th>Fahrzeug</th><th>Menge</th><th>Aufträge</th></tr></thead>
                  <tbody>
                    {detail.jeFahrzeug.map((f) => (
                      <tr key={f.id}>
                        <td>{f.bezeichnung}</td>
                        <td>{f.menge.toLocaleString("de-DE")}</td>
                        <td>{f.auftraege}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

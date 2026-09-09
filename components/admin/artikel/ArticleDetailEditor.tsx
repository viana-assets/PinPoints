import { useState } from "react";
import type { Article, ArticlePrice } from "@/lib/types";
import { formatDate, formatEUR, todayStr, DEFAULT_VAT_RATE } from "@/lib/helpers";
import { IconTrash } from "@/components/icons";

// Detailbereich eines Artikels im Artikelstamm: Kurz-/Langbezeichnung bearbeiten sowie die
// Preis-Historie einsehen und einen neuen Preis (gültig ab X) hinzufügen. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function ArticleDetailEditor({ article, prices, onUpdateArticle, onAddPrice, onUpdatePrice, onDeletePrice }: {
  article: Article;
  prices: ArticlePrice[];
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean; braucht_lagerplatz: boolean }) => Promise<void>;
  onAddPrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
  // Korrektur einer bestehenden Zeile: gibt einen Text zurück, wenn sie abgelehnt wurde
  // (z. B. überschneidender Zeitraum), sonst nichts.
  onUpdatePrice: (priceId: string, netPrice: number, vatRate: number, validFrom: string, validTo: string | null) => Promise<string | null>;
  onDeletePrice: (priceId: string) => Promise<void>;
}) {
  const [shortName, setShortName] = useState(article.short_name);
  const [longName, setLongName] = useState(article.long_name);
  const [brauchtLagerplatz, setBrauchtLagerplatz] = useState(article.braucht_lagerplatz);
  const [netPrice, setNetPrice] = useState("");
  const [vatRate, setVatRate] = useState(String(DEFAULT_VAT_RATE));
  const [validFrom, setValidFrom] = useState(todayStr());
  // Welche Preiszeile gerade korrigiert wird – bewusst nur eine zur Zeit, damit klar bleibt,
  // welche Eingaben zu welcher Zeile gehören.
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [eNetto, setENetto] = useState("");
  const [eMwst, setEMwst] = useState("");
  const [eVon, setEVon] = useState("");
  const [eBis, setEBis] = useState("");
  const [ePruefung, setEPruefung] = useState<string | null>(null);

  function bearbeitenStarten(p: ArticlePrice) {
    setBearbeitet(p.id);
    setENetto(String(p.net_price));
    setEMwst(String(p.vat_rate));
    setEVon(p.valid_from);
    setEBis(p.valid_to ?? "");
    setEPruefung(null);
  }

  const sortedPrices = prices.slice().sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  return (
    <div style={{ padding: "6px 2px" }}>
      <div className="row">
        <div className="field" style={{ marginBottom: 0 }}><label>Kurzbezeichnung</label><input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}><label>Langbezeichnung</label><input type="text" value={longName} onChange={(e) => setLongName(e.target.value)} /></div>
        <button
          className="btn-secondary"
          style={{ flex: "0 0 auto" }}
          onClick={() => onUpdateArticle(article.id, { short_name: shortName.trim() || article.short_name, long_name: longName.trim() || article.long_name, active: article.active, braucht_lagerplatz: brauchtLagerplatz })}
        >
          Speichern
        </button>
      </div>

      {/* Kennzeichen für Leistungen, bei denen etwas ins Lager geht (Migration 22). Es hängt
          hier am Artikel und nicht an einem festen Namen im Code – so löst auch eine später
          angelegte Leistung wie „Felgen einlagern" die Lagerplatzpflicht aus, ohne dass jemand
          eine Zeile Code anfasst. Siehe docs/lager.md. */}
      <div className="checkbox-row" style={{ marginTop: 6 }}>
        <input
          type="checkbox" id={`lagerpflicht-${article.id}`}
          checked={brauchtLagerplatz}
          onChange={(e) => setBrauchtLagerplatz(e.target.checked)}
        />
        <label htmlFor={`lagerpflicht-${article.id}`}>
          Braucht einen Lagerplatz (z. B. Reifeneinlagerung) – der Auftrag lässt sich erst
          abschließen, wenn ein Platz belegt ist
        </label>
      </div>

      <h4 style={{ margin: "8px 0 4px", fontSize: 13 }}>Preis-Historie</h4>
      {sortedPrices.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch kein Preis hinterlegt.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6, maxWidth: 620 }}>
          <thead><tr><th>Gültig von</th><th>Gültig bis</th><th>Nettopreis</th><th>MwSt.</th><th></th></tr></thead>
          <tbody>
            {sortedPrices.map((p) => (
              bearbeitet === p.id ? (
                <tr key={p.id}>
                  <td><input type="date" className="feld-kompakt" value={eVon} onChange={(e) => setEVon(e.target.value)} /></td>
                  <td>
                    <input type="date" className="feld-kompakt" value={eBis} onChange={(e) => setEBis(e.target.value)} />
                    <div className="small">leer = bis auf Weiteres</div>
                  </td>
                  <td><input type="number" min={0} step="0.01" className="feld-kompakt" style={{ width: 80 }} value={eNetto} onChange={(e) => setENetto(e.target.value)} /></td>
                  <td><input type="number" min={0} max={100} step="0.01" className="feld-kompakt" style={{ width: 64 }} value={eMwst} onChange={(e) => setEMwst(e.target.value)} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      type="button" className="btn-primary" style={{ padding: "3px 8px", fontSize: 11.5 }}
                      onClick={async () => {
                        const netto = parseFloat(eNetto.replace(",", "."));
                        const mwst = parseFloat(eMwst.replace(",", "."));
                        if (isNaN(netto) || netto < 0) { setEPruefung("Bitte einen gültigen Nettopreis eintragen."); return; }
                        if (!eVon) { setEPruefung("Bitte ein Startdatum eintragen."); return; }
                        const fehler = await onUpdatePrice(p.id, netto, isNaN(mwst) ? DEFAULT_VAT_RATE : mwst, eVon, eBis || null);
                        if (fehler) { setEPruefung(fehler); return; }
                        setBearbeitet(null); setEPruefung(null);
                      }}
                    >
                      Übernehmen
                    </button>{" "}
                    <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => { setBearbeitet(null); setEPruefung(null); }}>
                      Abbrechen
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{formatDate(p.valid_from)}</td>
                  <td>{p.valid_to ? formatDate(p.valid_to) : "bis auf Weiteres"}</td>
                  <td>{formatEUR(p.net_price)}</td>
                  <td>{p.vat_rate}%</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={() => bearbeitenStarten(p)}>
                      Ändern
                    </button>{" "}
                    <button
                      type="button" className="btn-secondary" style={{ padding: "3px 6px" }}
                      title="Diesen Preis entfernen"
                      onClick={async () => {
                        // Löschen ist endgültig, deshalb einmal nachfragen. Bestehende Aufträge
                        // bleiben unberührt: die haben ihren Preis als Schnappschuss gespeichert.
                        const sicher = window.confirm(
                          `Preis ${formatEUR(p.net_price)} ab ${formatDate(p.valid_from)} wirklich entfernen? Bereits geschriebene Auftragspositionen ändern sich dadurch nicht.`
                        );
                        if (!sicher) return;
                        await onDeletePrice(p.id);
                      }}
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}

      {ePruefung && <div className="hinweis-pflicht" style={{ marginBottom: 6, maxWidth: 620 }}>{ePruefung}</div>}

      <div className="row" style={{ maxWidth: 480, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Nettopreis (€)</label>
          <input type="number" min={0} step="0.01" value={netPrice} onChange={(e) => setNetPrice(e.target.value)} placeholder="0,00" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>MwSt. %</label>
          <input type="number" min={0} max={100} step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Gültig ab</label>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          style={{ flex: "0 0 auto" }}
          onClick={async () => {
            const price = parseFloat(netPrice.replace(",", "."));
            const vat = parseFloat(vatRate.replace(",", "."));
            if (isNaN(price) || price < 0) return;
            await onAddPrice(article.id, price, isNaN(vat) ? DEFAULT_VAT_RATE : vat, validFrom);
            setNetPrice("");
          }}
        >
          + Preis
        </button>
      </div>
    </div>
  );
}

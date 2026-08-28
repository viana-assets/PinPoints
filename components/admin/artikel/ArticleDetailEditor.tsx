import { useState } from "react";
import type { Article, ArticlePrice } from "@/lib/types";
import { formatDate, formatEUR, todayStr, DEFAULT_VAT_RATE } from "@/lib/helpers";

// Detailbereich eines Artikels im Artikelstamm: Kurz-/Langbezeichnung bearbeiten sowie die
// Preis-Historie einsehen und einen neuen Preis (gültig ab X) hinzufügen. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function ArticleDetailEditor({ article, prices, onUpdateArticle, onAddPrice }: {
  article: Article;
  prices: ArticlePrice[];
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean }) => Promise<void>;
  onAddPrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const [shortName, setShortName] = useState(article.short_name);
  const [longName, setLongName] = useState(article.long_name);
  const [netPrice, setNetPrice] = useState("");
  const [vatRate, setVatRate] = useState(String(DEFAULT_VAT_RATE));
  const [validFrom, setValidFrom] = useState(todayStr());
  const sortedPrices = prices.slice().sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  return (
    <div style={{ padding: "6px 2px" }}>
      <div className="row">
        <div className="field" style={{ marginBottom: 0 }}><label>Kurzbezeichnung</label><input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}><label>Langbezeichnung</label><input type="text" value={longName} onChange={(e) => setLongName(e.target.value)} /></div>
        <button
          className="btn-secondary"
          style={{ flex: "0 0 auto" }}
          onClick={() => onUpdateArticle(article.id, { short_name: shortName.trim() || article.short_name, long_name: longName.trim() || article.long_name, active: article.active })}
        >
          Speichern
        </button>
      </div>

      <h4 style={{ margin: "8px 0 4px", fontSize: 13 }}>Preis-Historie</h4>
      {sortedPrices.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch kein Preis hinterlegt.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6, maxWidth: 480 }}>
          <thead><tr><th>Gültig von</th><th>Gültig bis</th><th>Nettopreis</th><th>MwSt.</th></tr></thead>
          <tbody>
            {sortedPrices.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.valid_from)}</td>
                <td>{p.valid_to ? formatDate(p.valid_to) : "bis auf Weiteres"}</td>
                <td>{formatEUR(p.net_price)}</td>
                <td>{p.vat_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

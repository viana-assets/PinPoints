import { useState } from "react";
import type { Article, OrderArticle } from "@/lib/types";
import { formatEUR, orderArticleTotals } from "@/lib/helpers";
import { IconTrash } from "@/components/icons";

// Leistungen/Artikel-Zuordnung zu einem Auftrag: Liste bereits zugeordneter Positionen (Menge,
// Rabatt individuell je Position, Preis als Schnappschuss vom Zuordnungszeitpunkt) plus eine
// kleine Zeile zum Hinzufügen weiterer Artikel. Wird sowohl im Popover (Aufträge-Tab &
// Einsatzplanung) als auch direkt inline im Kunden-Detailfenster verwendet. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function ArticleAssignPanel({ orderId, articles, rows, gesperrt, onAdd, onUpdateQty, onUpdateDiscount, onRemove }: {
  orderId: string;
  articles: Article[];
  rows: OrderArticle[];
  // Ist der Auftrag abgeschlossen oder storniert, sind seine Positionen eingefroren – die
  // Datenbank lehnt jede Änderung ohnehin ab (Migration 20). Hier werden die Eingabefelder
  // deshalb gar nicht erst angeboten, statt den Nutzer in eine Fehlermeldung laufen zu lassen.
  gesperrt?: boolean;
  onAdd: (orderId: string, articleId: string, quantity: number, discountPercent: number) => Promise<void>;
  onUpdateQty: (id: string, quantity: number) => Promise<void>;
  onUpdateDiscount: (id: string, discountPercent: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const activeArticles = articles.filter((a) => a.active);
  const [articleId, setArticleId] = useState("");
  const [qty, setQty] = useState("1");
  const [discount, setDiscount] = useState("0");
  const totals = orderArticleTotals(rows);

  return (
    <div>
      <div className="small" style={{ fontWeight: 700, padding: "2px 0 4px" }}>Leistungen / Artikel</div>
      {rows.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch keine Leistungen zugeordnet.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6 }}>
          <thead><tr><th>Artikel</th><th>Menge</th><th>Rabatt %</th><th>Summe netto</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const art = articles.find((a) => a.id === r.article_id);
              const lineNet = r.quantity * r.net_price * (1 - (r.discount_percent || 0) / 100);
              return (
                <tr key={r.id}>
                  <td>{art ? art.short_name : "(gelöschter Artikel)"}<div className="small">{formatEUR(r.net_price)} / Stk.</div></td>
                  <td>
                    {gesperrt ? r.quantity : (
                      <input
                        type="number" min={0.01} step="0.01" value={r.quantity} style={{ width: 56 }}
                        onChange={(e) => onUpdateQty(r.id, parseFloat(e.target.value.replace(",", ".")) || 0)}
                      />
                    )}
                  </td>
                  <td>
                    {gesperrt ? `${r.discount_percent} %` : (
                      <input
                        type="number" min={0} max={100} step="1" value={r.discount_percent} style={{ width: 52 }}
                        onChange={(e) => onUpdateDiscount(r.id, parseFloat(e.target.value.replace(",", ".")) || 0)}
                      />
                    )}
                  </td>
                  <td>{formatEUR(lineNet)}</td>
                  <td>
                    {!gesperrt && (
                      <button type="button" className="btn-secondary" style={{ padding: "2px 6px" }} onClick={() => onRemove(r.id)}><IconTrash /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          Netto {formatEUR(totals.net)} · MwSt. {formatEUR(totals.vat)} · <b>Brutto {formatEUR(totals.gross)}</b>
        </div>
      )}
      {gesperrt ? (
        <div className="small">Der Auftrag ist abgeschlossen – die Leistungen stehen fest und lassen sich nicht mehr ändern.</div>
      ) : activeArticles.length === 0 ? (
        <div className="small">Noch keine Artikel im Artikelstamm angelegt (Admin → Artikelstamm).</div>
      ) : (
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Artikel</label>
            <select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">– wählen –</option>
              {activeArticles.map((a) => <option key={a.id} value={a.id}>{a.short_name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Menge</label>
            <input type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Rabatt %</label>
            <input type="number" min={0} max={100} step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: "0 0 auto" }}
            onClick={() => {
              if (!articleId) return;
              onAdd(orderId, articleId, parseFloat(qty.replace(",", ".")) || 1, parseFloat(discount.replace(",", ".")) || 0);
              setArticleId(""); setQty("1"); setDiscount("0");
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

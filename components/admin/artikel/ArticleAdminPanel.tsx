import { Fragment, useState } from "react";
import type { Article, ArticlePrice } from "@/lib/types";
import { formatEUR, currentArticlePrice } from "@/lib/helpers";
import { ArticleDetailEditor } from "./ArticleDetailEditor";

// Artikelstamm (Admin-Bereich, nur Admin/Superadmin – Migration 12): Kurz-/Langbezeichnung je
// Artikel, dazu eine Preis-Historie mit "gültig von/bis" statt nur einem einzigen aktuellen
// Preis. Rabatte werden bewusst NICHT hier, sondern individuell bei der Zuordnung zu einem
// Auftrag vergeben (siehe ArticleAssignPanel). Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 2.
export function ArticleAdminPanel({ articles, articlePrices, onAddArticle, onUpdateArticle, onAddArticlePrice }: {
  articles: Article[];
  articlePrices: ArticlePrice[];
  onAddArticle: (shortName: string, longName: string) => Promise<void>;
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean }) => Promise<void>;
  onAddArticlePrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const [newShort, setNewShort] = useState("");
  const [newLong, setNewLong] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="small" style={{ marginBottom: 8 }}>
        Zentrales Artikelstammdatenbuch für Dienstleistungen/Artikel, die einem Auftrag
        zugeordnet werden können. Jeder Artikel hat eine Preis-Historie (Nettopreis + MwSt.,
        jeweils gültig von/bis) statt nur eines einzigen aktuellen Preises – ein neuer Preis
        schließt den vorherigen automatisch einen Tag davor. Rabatte werden individuell bei der
        Zuordnung zu einem Auftrag vergeben, nicht hier am Artikel.
      </div>

      <div className="row" style={{ maxWidth: 560, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kurzbezeichnung</label>
          <input type="text" value={newShort} onChange={(e) => setNewShort(e.target.value)} placeholder="z. B. Reifenwechsel mobil" />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}>
          <label>Langbezeichnung</label>
          <input type="text" value={newLong} onChange={(e) => setNewLong(e.target.value)} placeholder="z. B. Mobiler Reifenwechsel direkt beim Kunden vor Ort" />
        </div>
        <button
          className="btn-primary"
          style={{ flex: "0 0 auto" }}
          onClick={async () => {
            if (!newShort.trim() || !newLong.trim()) return;
            await onAddArticle(newShort.trim(), newLong.trim());
            setNewShort(""); setNewLong("");
          }}
        >
          + Artikel
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="empty">Noch keine Artikel angelegt.</div>
      ) : (
        <table className="appt-table" style={{ marginTop: 8 }}>
          <thead><tr><th>Kurzbezeichnung</th><th>Langbezeichnung</th><th>Aktueller Preis</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>
            {articles.map((a) => {
              const prices = articlePrices.filter((p) => p.article_id === a.id);
              const current = currentArticlePrice(prices);
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td style={{ fontWeight: 700 }}>{a.short_name}</td>
                    <td>{a.long_name}</td>
                    <td>{current ? `${formatEUR(current.net_price)} netto (${current.vat_rate}% MwSt.)` : "– kein Preis hinterlegt –"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={a.active}
                        onChange={(e) => onUpdateArticle(a.id, { short_name: a.short_name, long_name: a.long_name, active: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11.5, fontWeight: 400 }} onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                        {openId === a.id ? "Schließen" : "Preise & Bearbeiten"}
                      </button>
                    </td>
                  </tr>
                  {openId === a.id && (
                    <tr>
                      <td colSpan={5} style={{ background: "rgba(0,0,0,.02)" }}>
                        <ArticleDetailEditor article={a} prices={prices} onUpdateArticle={onUpdateArticle} onAddPrice={onAddArticlePrice} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

import { Fragment, useState } from "react";
import type { Article, ArticlePrice } from "@/lib/types";
import { formatEUR, currentArticlePrice } from "@/lib/helpers";
import { IconArtikel } from "@/components/icons";
import { ArticleDetailEditor } from "./ArticleDetailEditor";

// Artikel-Übersicht (Migration 12 + 14): eigene Kachel in der Hauptnavigation (vorher ein
// Unter-Tab im Admin-Bereich, siehe docs/roadmap.md Phase 4 – Datei/Ordnerpfad bewusst
// unverändert gelassen, um kein verwaistes Duplikat im OneDrive-Ordner zu hinterlassen).
// Kurz-/Langbezeichnung je Artikel unter einer Artikelnummer, dazu eine Preis-Historie mit
// "gültig von/bis" statt nur einem einzigen aktuellen Preis. Pflegen bleibt laut RLS weiterhin
// nur Admin/Superadmin vorbehalten (Migration 12) – das Sehen der Übersicht selbst steuert
// `view.artikel` in den Modul-Berechtigungen. Die Artikelnummer wird beim Anlegen zwar
// automatisch vorbelegt (Sequenz `article_number_seq`, Migration 14), ist aber bewusst frei
// überschreibbar – für unterschiedliche Artikel(-gruppen) mit eigenen Nummernfolgen (z. B.
// eigene Nummernkreise je Kategorie), siehe onUpdateArticleNumber. Die Unique-Constraint aus
// Migration 14 verhindert weiterhin doppelt vergebene Nummern.
export function ArticleAdminPanel({ articles, articlePrices, onAddArticle, onUpdateArticle, onUpdateArticleNumber, onAddArticlePrice }: {
  articles: Article[];
  articlePrices: ArticlePrice[];
  onAddArticle: (shortName: string, longName: string) => Promise<void>;
  onUpdateArticle: (id: string, fields: { short_name: string; long_name: string; active: boolean; braucht_lagerplatz: boolean }) => Promise<void>;
  onUpdateArticleNumber: (id: string, articleNumber: number) => Promise<void>;
  onAddArticlePrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
}) {
  const [newShort, setNewShort] = useState("");
  const [newLong, setNewLong] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="tabpanel active">
      <div className="module-page">
        <div className="module-header">
          <div className="mh-icon"><IconArtikel /></div>
          <div className="mh-text">
            <h2>Artikel</h2>
            <p>Dienstleistungen/Artikel, die einem Auftrag zugeordnet werden können.</p>
          </div>
        </div>

      <div className="small" style={{ marginBottom: 8 }}>
        Zentrales Artikelverzeichnis für Dienstleistungen/Artikel, die einem Auftrag
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
          <thead><tr><th>Artikel-Nr.</th><th>Kurzbezeichnung</th><th>Langbezeichnung</th><th>Aktueller Preis</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>
            {articles.map((a) => {
              const prices = articlePrices.filter((p) => p.article_id === a.id);
              const current = currentArticlePrice(prices);
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td>
                      <input
                        type="number"
                        defaultValue={a.article_number}
                        className="feld-kompakt"
                        style={{ width: 70 }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val !== a.article_number) onUpdateArticleNumber(a.id, val);
                          else e.target.value = String(a.article_number);
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 700 }}>{a.short_name}</td>
                    <td>{a.long_name}</td>
                    <td>{current ? `${formatEUR(current.net_price)} netto (${current.vat_rate}% MwSt.)` : "– kein Preis hinterlegt –"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={a.active}
                        onChange={(e) => onUpdateArticle(a.id, { short_name: a.short_name, long_name: a.long_name, active: e.target.checked, braucht_lagerplatz: a.braucht_lagerplatz })}
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
                      <td colSpan={6} style={{ background: "rgba(0,0,0,.02)" }}>
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
    </div>
  );
}

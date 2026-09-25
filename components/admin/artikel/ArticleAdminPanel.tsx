import { useEffect, useMemo, useRef, useState } from "react";
import type { Article, ArticlePrice, ArtikelFelder } from "@/lib/types";
import { formatEUR, currentArticlePrice } from "@/lib/helpers";
import { ArticleDetailEditor } from "./ArticleDetailEditor";

// Artikel-Übersicht (Migration 12 + 14), seit 26.09.2026 im Stil der übrigen Listen
// (Entwurf Q): Karten statt Tabelle, Suche, Filter und die Bearbeitung als Blatt.
//
// Kurz-/Langbezeichnung je Artikel unter einer Artikelnummer, dazu eine Preis-Historie mit
// "gültig von/bis" statt nur einem einzigen aktuellen Preis. Pflegen bleibt laut RLS weiterhin
// nur Admin/Superadmin vorbehalten (Migration 12) – das Sehen der Übersicht selbst steuert
// `view.artikel` in den Modul-Berechtigungen. Die Artikelnummer wird beim Anlegen zwar
// automatisch vorbelegt (Sequenz `article_number_seq`, Migration 14), ist aber bewusst frei
// überschreibbar – für unterschiedliche Artikel(-gruppen) mit eigenen Nummernfolgen, siehe
// onUpdateArticleNumber. Die Unique-Constraint aus Migration 14 verhindert weiterhin doppelt
// vergebene Nummern. Datei/Ordnerpfad bewusst unverändert (kein verwaistes Duplikat).

type Filter = "aktiv" | "inaktiv" | "ohne" | "alle";
const FILTER: [Filter, string][] = [["aktiv", "Aktiv"], ["inaktiv", "Inaktiv"], ["ohne", "Ohne Preis"], ["alle", "Alle"]];

export function ArticleAdminPanel({ articles, articlePrices, onAddArticle, onUpdateArticle, onUpdateArticleNumber, onAddArticlePrice, onUpdateArticlePrice, onDeleteArticlePrice }: {
  articles: Article[];
  articlePrices: ArticlePrice[];
  onAddArticle: (shortName: string, longName: string) => Promise<void>;
  onUpdateArticle: (id: string, fields: ArtikelFelder) => Promise<void>;
  onUpdateArticleNumber: (id: string, articleNumber: number) => Promise<void>;
  onAddArticlePrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
  onUpdateArticlePrice: (priceId: string, netPrice: number, vatRate: number, validFrom: string, validTo: string | null) => Promise<string | null>;
  onDeleteArticlePrice: (priceId: string) => Promise<void>;
}) {
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState<Filter>("aktiv");
  const [openId, setOpenId] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [newShort, setNewShort] = useState("");
  const [newLong, setNewLong] = useState("");
  const [legtAn, setLegtAn] = useState(false);
  // Nach dem Anlegen soll gleich das Blatt des neuen Artikels aufgehen – dort gehören Preis
  // und Einheit hin. onAddArticle liefert keine ID zurück; der neue Artikel ist der, dessen ID
  // vor dem Anlegen noch nicht in der Liste stand.
  const bekannteIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const vorher = bekannteIds.current;
    if (!vorher) return;
    const neu = articles.find((a) => !vorher.has(a.id));
    if (neu) {
      bekannteIds.current = null;
      setOpenId(neu.id);
    }
  }, [articles]);

  const preiseJe = useMemo(() => {
    const m = new Map<string, ArticlePrice[]>();
    for (const p of articlePrices) {
      const l = m.get(p.article_id);
      if (l) l.push(p); else m.set(p.article_id, [p]);
    }
    return m;
  }, [articlePrices]);

  const aktuell = (a: Article) => currentArticlePrice(preiseJe.get(a.id) ?? []);
  // „Ohne Preis" zählt nur Artikel, die einen brauchen: Eine freie Position bekommt ihren
  // Preis am Auftrag, ein inaktiver Artikel wird nicht mehr verwendet.
  const ohnePreis = (a: Article) => a.active && !a.freitext && !aktuell(a);
  const passt = (a: Article, f: Filter) =>
    f === "alle" ? true : f === "aktiv" ? a.active : f === "inaktiv" ? !a.active : ohnePreis(a);

  const zahl = (f: Filter) => articles.filter((a) => passt(a, f)).length;
  const s = suche.trim().toLowerCase();
  const gezeigt = articles
    .filter((a) => passt(a, filter))
    .filter((a) => !s || `${a.article_number} ${a.short_name} ${a.long_name}`.toLowerCase().includes(s))
    .slice()
    .sort((a, b) => a.article_number - b.article_number);

  const offen = openId ? articles.find((a) => a.id === openId) ?? null : null;

  async function anlegen() {
    if (!newShort.trim() || !newLong.trim() || legtAn) return;
    setLegtAn(true);
    bekannteIds.current = new Set(articles.map((a) => a.id));
    try {
      await onAddArticle(newShort.trim(), newLong.trim());
      setNewShort(""); setNewLong(""); setNeuOffen(false);
      setFilter("aktiv"); setSuche("");
    } catch (e) {
      bekannteIds.current = null;
      throw e;
    } finally {
      setLegtAn(false);
    }
  }

  return (
    <div className="tabpanel active">
      <div className="module-page ar-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Artikel</h2>
              <span className="lg-unter">
                {articles.length} Artikel · {zahl("aktiv")} aktiv{zahl("ohne") > 0 ? ` · ${zahl("ohne")} ohne Preis` : ""}
              </span>
            </div>
            <button type="button" className="kl-neu" onClick={() => setNeuOffen(true)}>+ Artikel</button>
          </div>
          <label className="lg-suchfeld ar-suche">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Bezeichnung oder Artikelnummer …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Artikel suchen" />
          </label>
          <div className="pl-filter au-filter" role="group" aria-label="Filter">
            {FILTER.map(([f, t]) => (
              <button key={f} type="button" className={"pl-pille" + (filter === f ? " aktiv" : "")} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t}<span className="op-zahl">{zahl(f)}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="small ar-hilfe">
          Leistungen, die einem Auftrag zugeordnet werden. Jeder Preis gilt ab einem Datum – ein neuer
          Preis schließt den vorherigen einen Tag davor ab. Rabatte gibt es am Auftrag, nicht hier.
        </span>

        {gezeigt.length === 0 ? (
          <div className="db-karte"><div className="db-leer">
            {articles.length === 0 ? "Noch keine Artikel angelegt." : "Kein Treffer."}
          </div></div>
        ) : (
          <div className="ar-liste">
            {gezeigt.map((a) => {
              const p = aktuell(a);
              return (
                <button key={a.id} type="button" className={"ar-karte" + (a.active ? "" : " inaktiv")} onClick={() => setOpenId(a.id)}>
                  <span className="ar-nr">{a.article_number}</span>
                  <span className="ar-text">
                    <b>{a.short_name}</b>
                    <span className="small">{a.long_name}</span>
                    {(a.abrechnungsart === "lagergebuehr" || a.fragt_einlagerung || a.freitext || !a.active) && (
                      <span className="ar-marken">
                        {a.abrechnungsart === "lagergebuehr" && <span className="ar-marke blau">Lagergebühr · beim Auslagern</span>}
                        {a.fragt_einlagerung && <span className="ar-marke orange">fragt nach Altreifen</span>}
                        {a.freitext && <span className="ar-marke grau">Text am Auftrag</span>}
                        {!a.active && <span className="ar-marke grau">inaktiv</span>}
                      </span>
                    )}
                  </span>
                  <span className="ar-preis">
                    <b className={p || a.freitext ? "" : "fehlt"}>{p ? formatEUR(p.net_price) : a.freitext ? "am Auftrag" : "kein Preis"}</b>
                    <span className="small">{a.einheit}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {neuOffen && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setNeuOffen(false)}>
          <div className="auswahl-blatt am-breit ar-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Neuer Artikel">
            <div className="ab-griff" />
            <div className="ab-titel">Neuer Artikel</div>
            <label className="nk-feld">
              <span>Kurzbezeichnung</span>
              <input type="text" value={newShort} onChange={(e) => setNewShort(e.target.value)} placeholder="z. B. Reifenwechsel mobil" autoFocus />
            </label>
            <label className="nk-feld">
              <span>Langbezeichnung (steht auf der Rechnung)</span>
              <input type="text" value={newLong} onChange={(e) => setNewLong(e.target.value)} placeholder="z. B. Mobiler Reifenwechsel direkt beim Kunden vor Ort" />
            </label>
            <span className="small">Die Artikelnummer wird fortlaufend vergeben und lässt sich danach ändern. Preis, Einheit und Abrechnung stellst du im nächsten Schritt ein.</span>
            <button type="button" className="am-knopf" disabled={!newShort.trim() || !newLong.trim() || legtAn} onClick={anlegen}>
              {legtAn ? "Wird angelegt …" : "Anlegen"}
            </button>
          </div>
        </div>
      )}

      {offen && (
        <ArticleDetailEditor
          key={offen.id}
          article={offen}
          prices={preiseJe.get(offen.id) ?? []}
          onClose={() => setOpenId(null)}
          onUpdateArticle={onUpdateArticle}
          onUpdateArticleNumber={onUpdateArticleNumber}
          onAddPrice={onAddArticlePrice}
          onUpdatePrice={onUpdateArticlePrice}
          onDeletePrice={onDeleteArticlePrice}
        />
      )}
    </div>
  );
}

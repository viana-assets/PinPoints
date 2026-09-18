import { Fragment, useState } from "react";
import type { Article, ArticlePrice, OrderArticle } from "@/lib/types";
import { currentArticlePrice, formatEUR, orderArticleTotals, positionListenwert } from "@/lib/helpers";
import { IconTrash } from "@/components/icons";

// Leistungen/Artikel-Zuordnung zu einem Auftrag: Liste bereits zugeordneter Positionen (Menge,
// Endpreis je Position, Listenpreis als Schnappschuss vom Zuordnungszeitpunkt) plus eine
// kleine Zeile zum Hinzufügen weiterer Artikel.
//
// Seit Migration 38 steht hier ein ENDPREIS und kein Prozentrabatt mehr. Im Gespräch läuft es
// so: „das kostet 50, wir machen 40." Der Endpreis ist die Aussage; wie viel Nachlass das
// war, rechnet die Anwendung aus und zeigt es daneben – nicht umgekehrt. Wird sowohl im Popover (Aufträge-Tab &
// Einsatzplanung) als auch direkt inline im Kunden-Detailfenster verwendet. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function ArticleAssignPanel({ orderId, articles, articlePrices, rows, gesperrt, rechnungNoetig, onAdd, onUpdateQty, onUpdateEndpreis, onUpdateText, onRemove }: {
  orderId: string;
  articles: Article[];
  // Die Preishistorie, um zum gewählten Artikel den heute gültigen Listenpreis ZU ZEIGEN.
  // Gerechnet wird damit hier nicht – den Schnappschuss macht `insertOrderArticle` beim
  // Zuordnen (lib/api/articles.ts). Zwei Rechenwege für denselben Preis wären zwei Preise.
  articlePrices: ArticlePrice[];
  rows: OrderArticle[];
  // Ob auf den Nettobetrag die Steuer kommt, entscheidet der Auftrag – nicht die Position.
  // Deshalb kommt der Schalter von oben herein und wird hier nur angewandt.
  rechnungNoetig: boolean;
  // Ist der Auftrag abgeschlossen oder storniert, sind seine Positionen eingefroren – die
  // Datenbank lehnt jede Änderung ohnehin ab (Migration 20). Hier werden die Eingabefelder
  // deshalb gar nicht erst angeboten, statt den Nutzer in eine Fehlermeldung laufen zu lassen.
  gesperrt?: boolean;
  onAdd: (orderId: string, articleId: string, quantity: number, endpreisNetto: number | null, text: string | null) => Promise<void>;
  onUpdateQty: (id: string, quantity: number) => Promise<void>;
  // `null` heißt „kein Sonderpreis" – dann gilt wieder Menge × Listenpreis. Das ist etwas
  // anderes als 0, was „geschenkt" bedeutet, und beides muss eingebbar bleiben.
  onUpdateEndpreis: (id: string, endpreisNetto: number | null) => Promise<void>;
  // Der Text auf der Rechnung (Migration 50). Bei einem Freitext-Artikel ist er die
  // Bezeichnung, sonst eine Zusatzzeile darunter.
  onUpdateText: (id: string, text: string | null) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const activeArticles = articles.filter((a) => a.active);
  const [articleId, setArticleId] = useState("");
  const [qty, setQty] = useState("1");
  const [endpreis, setEndpreis] = useState("");
  const [text, setText] = useState("");
  const totals = orderArticleTotals(rows, rechnungNoetig);

  // Der heute gültige Listenpreis des oben gewählten Artikels. Ohne ihn stand im Zuordnen-
  // Bereich nur ein leeres Feld mit dem Platzhalter „Listenpreis" – man musste raten, wie hoch
  // der ist, und ein Platzhalter, der einen Wert BENENNT, den er nicht zeigt, ist eine
  // Zumutung. `null` heißt: für diesen Artikel ist kein Preis gepflegt.
  const gewaehlterPreis = articleId
    ? currentArticlePrice(articlePrices.filter((p) => p.article_id === articleId))
    : null;
  const gewaehlterArtikel = articleId ? articles.find((a) => a.id === articleId) ?? null : null;

  // Mengen sind bei allen Leistungen Stückzahlen – halbe Reifenwechsel gibt es nicht. Deshalb
  // ganze Zahlen, mindestens 1: mit step="0.01" zählten die Pfeiltasten in Hundertstel-Schritten.
  function ganzeMenge(text: string): number {
    const zahl = Math.round(parseFloat(text.replace(",", ".")));
    return isNaN(zahl) || zahl < 1 ? 1 : zahl;
  }

  // Was diese Zeile kosten wird, BEVOR sie angelegt ist.
  //
  // Der Grund steht im Feld daneben: „Endpreis netto" ist der Betrag der ganzen POSITION,
  // nicht der Stückpreis (so rechnet auch `orderArticleTotals`). Solange daneben nur
  // „50,00 € / Stk." stand, las man bei Menge 3 eine 50 und hätte sie beinahe als Endpreis
  // eingetragen – aus 150 wären 50 geworden, und niemand hätte es gemerkt. Die Summe hier
  // sagt, was ohne Eingabe gilt, und rechnet beim Tippen mit.
  const mengeJetzt = ganzeMenge(qty);
  const endpreisJetzt = endpreis.trim() === "" ? null : (parseFloat(endpreis.replace(",", ".")) || 0);
  const listenwertJetzt = gewaehlterPreis ? mengeJetzt * gewaehlterPreis.net_price : null;
  const summeJetzt = endpreisJetzt ?? listenwertJetzt;

  return (
    <div>
      <div className="small" style={{ fontWeight: 700, padding: "2px 0 4px" }}>Leistungen / Artikel</div>
      {rows.length === 0 ? (
        <div className="small" style={{ marginBottom: 6 }}>Noch keine Leistungen zugeordnet.</div>
      ) : (
        <table className="appt-table" style={{ marginBottom: 6 }}>
          <thead><tr><th>Artikel</th><th>Menge</th><th>Endpreis netto</th><th>Summe netto</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const art = articles.find((a) => a.id === r.article_id);
              const listenwert = positionListenwert(r);
              const lineNet = r.endpreis_netto ?? listenwert;
              const nachlass = listenwert - lineNet;
              // Zwei Zeilen je Position: die Zahlen oben, der Text darunter über die ganze
              // Breite. Der Text stand zuerst in der Artikel-Zelle – am Handy blieben davon
              // 90 Pixel übrig, und in 90 Pixel tippt niemand einen Satz. Im Browser bei
              // 390 px gemessen.
              return (
                <Fragment key={r.id}>
                <tr className="za-zeile">
                  <td className="za-artikel">
                    {art ? art.short_name : "(gelöschter Artikel)"}
                    <div className="small">{formatEUR(r.net_price)} / {art?.einheit?.trim() || "Stk."}</div>
                  </td>
                  <td>
                    {gesperrt ? r.quantity : (
                      <input
                        type="number" min={1} step={1} value={r.quantity} style={{ width: 56 }}
                        onChange={(e) => onUpdateQty(r.id, ganzeMenge(e.target.value))}
                      />
                    )}
                  </td>
                  <td>
                    {gesperrt ? (r.endpreis_netto == null ? "–" : formatEUR(r.endpreis_netto)) : (
                      <input
                        type="number" min={0} step="0.01" style={{ width: 82 }}
                        // Leeres Feld = kein Sonderpreis. Deshalb hier bewusst der leere
                        // String und nicht der errechnete Betrag als Vorbelegung: Stünde der
                        // Listenpreis drin, wäre jede Position sofort ein „Sonderpreis" in
                        // Höhe des Listenpreises – und der Nachlass in der Auswertung
                        // dauerhaft 0, obwohl niemand etwas eingegeben hat.
                        placeholder={listenwert.toFixed(2)}
                        value={r.endpreis_netto ?? ""}
                        onChange={(e) => {
                          const text = e.target.value.trim();
                          onUpdateEndpreis(r.id, text === "" ? null : (parseFloat(text.replace(",", ".")) || 0));
                        }}
                      />
                    )}
                  </td>
                  <td>
                    {formatEUR(lineNet)}
                    {/* Der Nachlass ist abgeleitet und wird deshalb angezeigt, nicht
                        eingegeben. */}
                    {nachlass > 0.004 && <div className="small">−{formatEUR(nachlass)}</div>}
                  </td>
                  <td>
                    {!gesperrt && (
                      <button type="button" className="btn-secondary" style={{ padding: "2px 6px" }} onClick={() => onRemove(r.id)}><IconTrash /></button>
                    )}
                  </td>
                </tr>
                {/* Der Text auf der Rechnung (Migration 50). Bei einem Freitext-Artikel ist er
                    die BEZEICHNUNG und ersetzt den Artikelnamen; sonst steht er als
                    Zusatzzeile darunter. Welches von beidem, entscheidet der Haken am
                    Artikel – deshalb hier nur eine andere Beschriftung.

                    Fehlt er bei einem Freitext-Artikel, bekommt das Feld einen farbigen Rand:
                    Auf der Rechnung stünde dann „Sonstiges". Das ist kein Fehler, aber es ist
                    nicht gemeint – gefragt wird, gesperrt nicht. */}
                {(!gesperrt || r.note) && (
                  <tr className="za-textzeile">
                    <td colSpan={5}>
                      {gesperrt ? (
                        <span className="small za-text-fest">{r.note}</span>
                      ) : (
                        <input
                          type="text"
                          className={"za-text" + (art?.freitext && !r.note?.trim() ? " fehlt" : "")}
                          placeholder={art?.freitext
                            ? "Was wurde gemacht? Dieser Text steht auf der Rechnung."
                            : "Zusatz auf der Rechnung, z. B. Radlager Reifen VR – optional"}
                          defaultValue={r.note ?? ""}
                          onBlur={(e) => {
                            const neu = e.target.value.trim();
                            if (neu !== (r.note ?? "").trim()) void onUpdateText(r.id, neu || null);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          {rechnungNoetig ? (
            <>Netto {formatEUR(totals.net)} · MwSt. {formatEUR(totals.vat)} · <b>Brutto {formatEUR(totals.gross)}</b></>
          ) : (
            <><b>Netto {formatEUR(totals.net)}</b> · ohne Steuer, weil keine Rechnung benötigt wird</>
          )}
        </div>
      )}
      {gesperrt ? (
        <div className="small">Der Auftrag ist abgeschlossen – die Leistungen stehen fest und lassen sich nicht mehr ändern.</div>
      ) : activeArticles.length === 0 ? (
        <div className="small">Noch keine Artikel im Artikelstamm angelegt (Admin → Artikelstamm).</div>
      ) : (
        /* Eigene Zeile statt `.row`, weil hier vier Felder plus Knopf stehen: `.row` bricht
           nie um, und am Handy wären das fünf Spalten auf 350 px. Diese Zeile bricht, sobald
           es eng wird, und behält dabei Feldbreiten, mit denen man noch tippen kann. */
        <div className="zuordnen-zeile">
          <div className="field zuordnen-artikel">
            <label>Artikel</label>
            <select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">– wählen –</option>
              {activeArticles.map((a) => {
                const preis = currentArticlePrice(articlePrices.filter((p) => p.article_id === a.id));
                return (
                  <option key={a.id} value={a.id}>
                    {a.short_name}{preis ? ` – ${formatEUR(preis.net_price)}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field zuordnen-menge">
            <label>Menge</label>
            <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field zuordnen-preis">
            {/* Die Beschriftung trug bis zum 17.09.2026 den Listenpreis als zweiten Text.
                Bei schmaler Spalte wurde sie dadurch zweizeilig – und weil die Zeile ihre
                Felder am unteren Rand ausrichtet, wuchs sie nach OBEN in die Zeile darüber
                hinein. Was neben einer Beschriftung steht, muss in eine Zeile passen oder
                woanders hin; hier gehört es in die Summe nebenan. */}
            <label>Endpreis netto</label>
            <input
              type="number" min={0} step="0.01"
              // Der Platzhalter zeigt, was ohne Eingabe gilt – und das ist der Betrag der
              // ganzen Position, nicht der Stückpreis. Vorher stand hier der Stückpreis:
              // bei Menge 3 also 50, wo 150 gilt.
              placeholder={listenwertJetzt !== null ? String(listenwertJetzt) : "Listenpreis"}
              value={endpreis} onChange={(e) => setEndpreis(e.target.value)}
            />
          </div>
          {/* Das Textfeld erscheint IMMER, nicht nur beim Freitext-Artikel: Die Zusatzzeile
              („Radlager Reifen VR") ist bei jeder Position möglich, und ein Feld, das je nach
              Artikel erscheint und verschwindet, lässt die Zeile bei jeder Auswahl springen.
              Was sich ändert, ist nur die Beschriftung – und die sagt, was der Text bewirkt. */}
          <div className="field zuordnen-text">
            <label>{gewaehlterArtikel?.freitext ? "Bezeichnung" : "Text auf der Rechnung"}</label>
            <input
              type="text"
              placeholder={gewaehlterArtikel?.freitext ? "Was wurde gemacht?" : "optional, z. B. Radlager Reifen VR"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="field zuordnen-summe-feld">
            <label>Summe netto</label>
            <div className="zuordnen-summe">
              {!articleId ? (
                <span className="zuordnen-summe-leer">–</span>
              ) : summeJetzt === null ? (
                <span className="zuordnen-summe-leer">kein Preis gepflegt</span>
              ) : (
                formatEUR(summeJetzt)
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary zuordnen-plus"
            onClick={() => {
              if (!articleId) return;
              const preisText = endpreis.trim();
              onAdd(
                orderId, articleId, ganzeMenge(qty),
                preisText === "" ? null : (parseFloat(preisText.replace(",", ".")) || 0),
                text.trim() || null
              );
              setArticleId(""); setQty("1"); setEndpreis(""); setText("");
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { Article, ArticlePrice, OrderArticle, ReifenZustand, StorageSlot, Verkaufsreifen, Warehouse } from "@/lib/types";
import { currentArticlePrice, formatEUR, orderArticleTotals, positionListenwert } from "@/lib/helpers";
import { reifenFrei, reifenZustandVonArtikel } from "@/lib/reifenverkauf";
import { ReifenSuche } from "./ReifenSuche";

// Was der Reifenverkauf (Migration 61) im Auftrag braucht. Fehlt es (kein Leserecht auf
// „Lager · Reifenverkauf", Bestand noch nicht geladen), gibt es den Knopf nicht – ein Artikel
// „Reifen neu" lässt sich dann wie jede Leistung eintragen, ohne Lagerbezug.
export type ReifenImAuftrag = {
  verkaufsreifen: Verkaufsreifen[];
  warehouses: Warehouse[];
  storageSlots: StorageSlot[];
  // Die Reifengröße des Fahrzeugs am Auftrag, für die Suche vorbelegt.
  vorschlag: string;
  onHinzufuegen: (posten: Verkaufsreifen, artikelId: string, menge: number) => Promise<void>;
};

// Leistungen/Artikel-Zuordnung zu einem Auftrag: Liste bereits zugeordneter Positionen (Menge,
// Endpreis je Position, Listenpreis als Schnappschuss vom Zuordnungszeitpunkt) plus eine
// kleine Zeile zum Hinzufügen weiterer Artikel.
//
// Seit Migration 38 steht hier ein ENDPREIS und kein Prozentrabatt mehr. Im Gespräch läuft es
// so: „das kostet 50, wir machen 40." Der Endpreis ist die Aussage; wie viel Nachlass das
// war, rechnet die Anwendung aus und zeigt es daneben – nicht umgekehrt. Wird sowohl im Popover (Aufträge-Tab &
// Einsatzplanung) als auch direkt inline im Kunden-Detailfenster verwendet. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Seit 26.09.2026 (Entwurf N): je Position eine Zeile mit −/+ statt eines Zahlenfelds, der
// Endpreis und der Rechnungstext klappen unter der Zeile auf. Neue Leistungen kommen aus einem
// Blatt mit Suche – ein Tipp legt sie mit Menge 1 an. Bei einer freien Position (Migration 50)
// klappt die Zeile von selbst auf, solange ihr Text fehlt: Auf der Rechnung stünde sonst
// „Sonstiges".
//
// Seit Migration 61: „Reifen aus dem Lager" öffnet die Reifensuche (ReifenSuche.tsx). Dieselbe
// Suche öffnet sich, wenn im Leistungsblatt ein Artikel mit der Abrechnungsart Reifenverkauf
// gewählt wird – der Artikel allein wüsste weder Preis noch Reifen.
export function ArticleAssignPanel({ orderId, articles, articlePrices, rows, gesperrt, rechnungNoetig, reifen, onAdd, onUpdateQty, onUpdateEndpreis, onUpdateText, onRemove }: {
  orderId: string;
  reifen?: ReifenImAuftrag | null;
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
  const [blattOffen, setBlattOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [fuegtHinzu, setFuegtHinzu] = useState<string | null>(null);
  const [offeneZeile, setOffeneZeile] = useState<string | null>(null);
  // undefined = zu; null = alle Zustände; sonst nur neue bzw. gebrauchte
  const [reifenSuche, setReifenSuche] = useState<ReifenZustand | null | undefined>(undefined);
  const totals = orderArticleTotals(rows, rechnungNoetig);
  const preisVon = (id: string) => currentArticlePrice(articlePrices.filter((p) => p.article_id === id));

  // Mengen sind bei allen Leistungen Stückzahlen – halbe Reifenwechsel gibt es nicht. Deshalb
  // ganze Zahlen, mindestens 1.
  function ganzeMenge(text: string): number {
    const zahl = Math.round(parseFloat(text.replace(",", ".")));
    return isNaN(zahl) || zahl < 1 ? 1 : zahl;
  }

  const s = suche.trim().toLowerCase();
  const katalog = activeArticles
    .filter((a) => !s || `${a.article_number} ${a.short_name} ${a.long_name}`.toLowerCase().includes(s))
    .slice()
    .sort((a, b) => a.article_number - b.article_number);

  async function hinzufuegen(a: Article) {
    if (fuegtHinzu) return;
    const zustand = reifenZustandVonArtikel(a);
    if (zustand && reifen) {
      setBlattOffen(false);
      setSuche("");
      setReifenSuche(zustand);
      return;
    }
    setFuegtHinzu(a.id);
    try {
      await onAdd(orderId, a.id, 1, null, null);
      setBlattOffen(false);
      setSuche("");
    } finally {
      setFuegtHinzu(null);
    }
  }

  return (
    <div className="ls-liste">
      {rows.length === 0 && (
        <div className="small ls-leer">Noch keine Leistungen zugeordnet.</div>
      )}
      {rows.map((r) => {
        const art = articles.find((a) => a.id === r.article_id);
        const listenwert = positionListenwert(r);
        const lineNet = r.endpreis_netto ?? listenwert;
        const nachlass = listenwert - lineNet;
        // Fehlt bei einem Freitext-Artikel der Text, steht die Zeile offen und das Feld hat
        // einen farbigen Rand: Auf der Rechnung stünde dann „Sonstiges". Das ist kein Fehler,
        // aber es ist nicht gemeint – gefragt wird, gesperrt nicht.
        const textFehlt = !!art?.freitext && !r.note?.trim();
        const offen = !gesperrt && (offeneZeile === r.id || textFehlt);
        // Reifen aus dem Lager (Migration 61): wo sie liegen – der Techniker holt sie dort ab –
        // und ob noch einer mehr frei wäre. Entscheiden tut das beim Ändern die Datenbank.
        const posten = r.verkaufsreifen_id ? reifen?.verkaufsreifen.find((v) => v.id === r.verkaufsreifen_id) ?? null : null;
        const ort = posten
          ? [reifen?.warehouses.find((w) => w.id === posten.warehouse_id)?.name,
             reifen?.storageSlots.find((sl) => sl.id === posten.storage_slot_id)?.code].filter(Boolean).join(" · ")
          : "";
        const keinerMehrFrei = !!posten && reifenFrei(posten) === 0;
        const info = [
          `${formatEUR(r.net_price)} / ${art?.einheit?.trim() || "Stk."}`,
          r.endpreis_netto != null ? "Sonderpreis" : null,
          r.verkaufsreifen_id ? (gesperrt ? "aus dem Lager, abgebucht" : `aus dem Lager${ort ? ` (${ort})` : ""}`) : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={r.id} className={"ls-zeile" + (offen ? " offen" : "")}>
            <div className="ls-haupt">
              <button type="button" className="ls-name" disabled={gesperrt} onClick={() => setOffeneZeile(offeneZeile === r.id ? null : r.id)}
                aria-expanded={offen} title={gesperrt ? undefined : "Endpreis und Text auf der Rechnung"}>
                <b>{art?.freitext && r.note?.trim() ? r.note : art ? art.short_name : "(gelöschter Artikel)"}</b>
                <span className="small">{info}</span>
                {r.note && !art?.freitext && <span className="small ls-zusatz">{r.note}</span>}
              </button>
              {gesperrt ? (
                <span className="ls-menge-fest">{r.quantity} ×</span>
              ) : (
                <span className="ls-stepper">
                  <button type="button" aria-label="Eins weniger" disabled={r.quantity <= 1} onClick={() => void onUpdateQty(r.id, r.quantity - 1)}>−</button>
                  <b>{r.quantity}</b>
                  <button type="button" aria-label="Eins mehr" disabled={keinerMehrFrei} title={keinerMehrFrei ? "Von diesem Reifen ist keiner mehr frei." : undefined}
                    onClick={() => void onUpdateQty(r.id, r.quantity + 1)}>+</button>
                </span>
              )}
              <span className="ls-summe">
                <b>{formatEUR(lineNet)}</b>
                {/* Der Nachlass ist abgeleitet und wird deshalb angezeigt, nicht eingegeben. */}
                {nachlass > 0.004 && <span className="small">−{formatEUR(nachlass)}</span>}
              </span>
            </div>
            {offen && (
              <div className="ls-details">
                <div className="nk-zeile">
                  <label className="nk-feld"><span>Menge</span>
                    <input type="number" min={1} step={1} value={r.quantity} onChange={(e) => void onUpdateQty(r.id, ganzeMenge(e.target.value))} />
                  </label>
                  <label className="nk-feld"><span>Endpreis netto (ganze Position)</span>
                    <input
                      type="number" min={0} step="0.01" inputMode="decimal"
                      // Leeres Feld = kein Sonderpreis. Deshalb hier bewusst der leere String
                      // und nicht der errechnete Betrag als Vorbelegung: Stünde der Listenpreis
                      // drin, wäre jede Position sofort ein „Sonderpreis" in Höhe des
                      // Listenpreises – und der Nachlass in der Auswertung dauerhaft 0.
                      placeholder={listenwert.toFixed(2)}
                      value={r.endpreis_netto ?? ""}
                      onChange={(e) => {
                        const t = e.target.value.trim();
                        void onUpdateEndpreis(r.id, t === "" ? null : (parseFloat(t.replace(",", ".")) || 0));
                      }}
                    />
                  </label>
                </div>
                {/* Der Text auf der Rechnung (Migration 50). Bei einem Freitext-Artikel ist er
                    die BEZEICHNUNG und ersetzt den Artikelnamen; sonst steht er als
                    Zusatzzeile darunter. Welches von beidem, entscheidet der Haken am Artikel. */}
                <label className="nk-feld"><span>{art?.freitext ? "Bezeichnung auf der Rechnung" : "Zusatz auf der Rechnung (optional)"}</span>
                  <input
                    type="text"
                    className={textFehlt ? "ls-fehlt" : undefined}
                    placeholder={art?.freitext ? "Was wurde gemacht?" : "z. B. Radlager Reifen VR"}
                    defaultValue={r.note ?? ""}
                    onBlur={(e) => {
                      const neu = e.target.value.trim();
                      if (neu !== (r.note ?? "").trim()) void onUpdateText(r.id, neu || null);
                    }}
                  />
                </label>
                <div className="ad-knoepfe">
                  <button type="button" className="es-knopf ad-gefahr" onClick={() => { setOffeneZeile(null); void onRemove(r.id); }}>Entfernen</button>
                  <span className="ad-luecke" />
                  {!textFehlt && <button type="button" className="es-knopf" onClick={() => setOffeneZeile(null)}>Fertig</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {gesperrt ? (
        rows.length > 0 && <div className="small ls-hinweis">Der Auftrag ist abgeschlossen – die Leistungen stehen fest.</div>
      ) : activeArticles.length === 0 ? (
        <div className="small ls-hinweis">Noch keine Artikel im Artikelstamm angelegt (Artikel → + Artikel).</div>
      ) : (
        <div className="ls-plus">
          <button type="button" className="dm-plus" onClick={() => setBlattOffen(true)}>+ Leistung hinzufügen</button>
          {reifen && <button type="button" className="dm-plus" onClick={() => setReifenSuche(null)}>+ Reifen aus dem Lager</button>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="ls-summen">
          {rechnungNoetig ? (
            <>
              <span className="small">Netto {formatEUR(totals.net)} · MwSt. {formatEUR(totals.vat)}</span>
              <b>Brutto {formatEUR(totals.gross)}</b>
            </>
          ) : (
            <>
              <span className="small">ohne Steuer – keine Rechnung nötig</span>
              <b>Netto {formatEUR(totals.net)}</b>
            </>
          )}
        </div>
      )}

      {blattOffen && (
        <div className="modal-overlay auswahl-overlay ls-overlay" onClick={() => setBlattOffen(false)}>
          <div className="auswahl-blatt am-breit ls-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Leistung hinzufügen">
            <div className="ab-griff" />
            <div className="ar-blatt-kopf">
              <div className="ab-titel">Leistung hinzufügen</div>
              <button type="button" className="modal-close" onClick={() => setBlattOffen(false)} aria-label="Schließen">×</button>
            </div>
            <label className="lg-suchfeld ls-suche">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input type="search" placeholder="Leistung suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Leistung suchen" autoFocus />
            </label>
            <span className="small">Menge 1 – Menge, Endpreis und Text danach an der Zeile.</span>
            {katalog.length === 0 && <span className="small ls-leer">Kein Treffer.</span>}
            {katalog.map((a) => {
              const preis = preisVon(a.id);
              return (
                <button key={a.id} type="button" className="ab-option ls-artikel" disabled={!!fuegtHinzu} onClick={() => void hinzufuegen(a)}>
                  <span className="ab-text ls-artikel-text">
                    <b>{a.short_name}</b>
                    <span className="small">{a.freitext ? "Bezeichnung wird am Auftrag eingegeben" : reifenZustandVonArtikel(a) && reifen ? "öffnet die Reifensuche im Lager" : a.long_name}</span>
                  </span>
                  <span className="ls-artikel-preis">{preis ? formatEUR(preis.net_price) : a.freitext ? "frei" : reifenZustandVonArtikel(a) ? "vom Reifen" : "–"}</span>
                  <span className="ls-artikel-plus" aria-hidden="true">{fuegtHinzu === a.id ? "…" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {reifen && reifenSuche !== undefined && (
        <ReifenSuche
          verkaufsreifen={reifen.verkaufsreifen}
          articles={articles}
          warehouses={reifen.warehouses}
          storageSlots={reifen.storageSlots}
          vorschlag={reifen.vorschlag}
          nurZustand={reifenSuche}
          onHinzufuegen={reifen.onHinzufuegen}
          onOhneLager={(artikelId) => onAdd(orderId, artikelId, 1, null, null)}
          onClose={() => setReifenSuche(undefined)}
        />
      )}
    </div>
  );
}

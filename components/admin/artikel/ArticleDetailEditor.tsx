import { useState } from "react";
import type { Article, ArticlePrice, ArtikelFelder } from "@/lib/types";
import { formatDate, formatEUR, todayStr, DEFAULT_VAT_RATE } from "@/lib/helpers";
import { IconTrash } from "@/components/icons";

// Detailbereich eines Artikels im Artikelstamm: Kurz-/Langbezeichnung bearbeiten sowie die
// Preis-Historie einsehen und einen neuen Preis (gültig ab X) hinzufügen. Ausgelagert aus
// app/page.tsx, siehe docs/roadmap.md Phase 2.
export function ArticleDetailEditor({ article, prices, onUpdateArticle, onAddPrice, onUpdatePrice, onDeletePrice }: {
  article: Article;
  prices: ArticlePrice[];
  onUpdateArticle: (id: string, fields: ArtikelFelder) => Promise<void>;
  onAddPrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
  // Korrektur einer bestehenden Zeile: gibt einen Text zurück, wenn sie abgelehnt wurde
  // (z. B. überschneidender Zeitraum), sonst nichts.
  onUpdatePrice: (priceId: string, netPrice: number, vatRate: number, validFrom: string, validTo: string | null) => Promise<string | null>;
  onDeletePrice: (priceId: string) => Promise<void>;
}) {
  const [shortName, setShortName] = useState(article.short_name);
  const [longName, setLongName] = useState(article.long_name);
  const [abrechnungsart, setAbrechnungsart] = useState<Article["abrechnungsart"]>(article.abrechnungsart);
  const [fragtEinlagerung, setFragtEinlagerung] = useState(article.fragt_einlagerung);
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
          onClick={() => onUpdateArticle(article.id, { short_name: shortName.trim() || article.short_name, long_name: longName.trim() || article.long_name, active: article.active, abrechnungsart, fragt_einlagerung: fragtEinlagerung })}
        >
          Speichern
        </button>
      </div>

      {/* WANN wird diese Leistung fällig (Migration 46)? Das Kennzeichen hängt am Artikel und
          nicht an einem Namen im Code – kommt später „Felgen einlagern" dazu, wird hier
          umgestellt statt Code geändert. Ein Vergleich auf „Reifeneinlagerung" wäre beim
          ersten Umbenennen still kaputt. */}
      <div className="field" style={{ marginTop: 8, maxWidth: 480 }}>
        <label htmlFor={`abrechnung-${article.id}`}>Abrechnung</label>
        <select
          id={`abrechnung-${article.id}`}
          value={abrechnungsart}
          onChange={(e) => setAbrechnungsart(e.target.value as Article["abrechnungsart"])}
        >
          <option value="normal">Normal – wird eingetragen, wenn die Leistung erbracht ist</option>
          <option value="lagergebuehr">Lagergebühr – wird beim Auslagern fällig, Menge = Monate</option>
        </select>
        <span className="small">
          {abrechnungsart === "lagergebuehr"
            ? "Beim Einlagern wird dieser Artikel nie verlangt. Beim Auslagern schlägt die App ihn vor, mit der Zahl der Lagermonate als Menge – angefangene Monate zählen voll."
            : "Der Normalfall: Der Artikel wird eingetragen, sobald die Leistung erbracht ist."}
        </span>
      </div>

      {/* Die zweite Hälfte des alten Hakens „braucht Lagerplatz": die Erinnerung. Sie gehört
          an eine ganz andere Leistung als die Gebühr – an den Wechsel, wo die alten Reifen
          anfallen, nicht an die Einlagerung selbst. Deshalb hat die Migration hier nichts
          vorbelegt: Was geraten wäre, wäre falsch geraten.

          Und es bleibt eine Frage, kein Zwang. Genug Kunden nehmen ihre alten Reifen mit;
          eine Sperre an dieser Stelle hielte den Normalfall auf, um den Ausnahmefall zu
          verhindern. */}
      <div className="field" style={{ marginTop: 8, maxWidth: 480 }}>
        <div className="checkbox-row" style={{ margin: 0 }}>
          <input
            type="checkbox"
            id={`fragt-einlagerung-${article.id}`}
            checked={fragtEinlagerung}
            onChange={(e) => setFragtEinlagerung(e.target.checked)}
          />
          <label htmlFor={`fragt-einlagerung-${article.id}`}>Bei dieser Leistung fallen Altreifen an</label>
        </div>
        <span className="small">
          {fragtEinlagerung
            ? "Steht dieser Artikel auf einem Auftrag und wurde nichts eingelagert, fragt das Auftragsfenster beim Abschließen nach, ob der Kunde die alten Reifen mitnimmt. Abschließen lässt sich der Auftrag so oder so."
            : "Setze den Haken bei Wechsel- und Montageleistungen. Dann erinnert die App daran, die alten Reifen einzulagern – statt sie stillschweigend verschwinden zu lassen."}
        </span>
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

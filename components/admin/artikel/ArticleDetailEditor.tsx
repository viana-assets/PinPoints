import { useState } from "react";
import type { Article, ArticlePrice, ArtikelFelder } from "@/lib/types";
import { EINHEITEN } from "@/lib/constants";
import { formatDate, formatEUR, todayStr, DEFAULT_VAT_RATE } from "@/lib/helpers";

// Ein Artikel als Blatt (Entwurf Q, 26.09.2026): Stammdaten, Abrechnung, die zwei Kennzeichen
// und die Preis-Historie als Zeitleiste. Die Stammdaten werden mit „Speichern" übernommen,
// Preise sofort – ein Preis ist ein eigener Datensatz mit eigener Prüfung (Zeitraum-
// Überschneidung), den man nicht mit einem vergessenen Speichern verlieren soll.
export function ArticleDetailEditor({ article, prices, onClose, onUpdateArticle, onUpdateArticleNumber, onAddPrice, onUpdatePrice, onDeletePrice }: {
  article: Article;
  prices: ArticlePrice[];
  onClose: () => void;
  onUpdateArticle: (id: string, fields: ArtikelFelder) => Promise<void>;
  onUpdateArticleNumber: (id: string, articleNumber: number) => Promise<void>;
  onAddPrice: (articleId: string, netPrice: number, vatRate: number, validFrom: string) => Promise<void>;
  // Korrektur einer bestehenden Zeile: gibt einen Text zurück, wenn sie abgelehnt wurde
  // (z. B. überschneidender Zeitraum), sonst nichts.
  onUpdatePrice: (priceId: string, netPrice: number, vatRate: number, validFrom: string, validTo: string | null) => Promise<string | null>;
  onDeletePrice: (priceId: string) => Promise<void>;
}) {
  const [nummer, setNummer] = useState(String(article.article_number));
  const [shortName, setShortName] = useState(article.short_name);
  const [longName, setLongName] = useState(article.long_name);
  const [aktiv, setAktiv] = useState(article.active);
  const [abrechnungsart, setAbrechnungsart] = useState<Article["abrechnungsart"]>(article.abrechnungsart);
  const [fragtEinlagerung, setFragtEinlagerung] = useState(article.fragt_einlagerung);
  const [einheit, setEinheit] = useState(article.einheit);
  const [freitext, setFreitext] = useState(article.freitext);
  const [speichert, setSpeichert] = useState(false);

  const [neuerPreis, setNeuerPreis] = useState(false);
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

  const nummerZahl = parseInt(nummer, 10);
  const geaendert =
    (nummer.trim() !== "" && nummerZahl !== article.article_number) ||
    shortName !== article.short_name || longName !== article.long_name || aktiv !== article.active ||
    abrechnungsart !== article.abrechnungsart || fragtEinlagerung !== article.fragt_einlagerung ||
    einheit !== article.einheit || freitext !== article.freitext;

  function schliessen() {
    if (geaendert && !window.confirm("Die Änderungen am Artikel sind noch nicht gespeichert. Verwerfen?")) return;
    onClose();
  }

  async function speichern() {
    if (speichert) return;
    setSpeichert(true);
    try {
      if (!isNaN(nummerZahl) && nummerZahl !== article.article_number) await onUpdateArticleNumber(article.id, nummerZahl);
      await onUpdateArticle(article.id, {
        short_name: shortName.trim() || article.short_name,
        long_name: longName.trim() || article.long_name,
        active: aktiv, abrechnungsart, fragt_einlagerung: fragtEinlagerung,
        einheit: einheit.trim() || "Stück", freitext,
      });
      onClose();
    } finally {
      setSpeichert(false);
    }
  }

  function bearbeitenStarten(p: ArticlePrice) {
    setBearbeitet(p.id);
    setENetto(String(p.net_price));
    setEMwst(String(p.vat_rate));
    setEVon(p.valid_from);
    setEBis(p.valid_to ?? "");
    setEPruefung(null);
  }

  const heute = todayStr();
  const sortedPrices = prices.slice().sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const gilt = (p: ArticlePrice) => p.valid_from <= heute && (!p.valid_to || p.valid_to >= heute);

  return (
    <div className="modal-overlay auswahl-overlay" onClick={schliessen}>
      <div className="auswahl-blatt am-breit ar-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Artikel ${article.short_name}`}>
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">{shortName.trim() || article.short_name}</div>
          <button type="button" className="ar-aktiv" aria-pressed={aktiv} onClick={() => setAktiv(!aktiv)}>
            {aktiv ? "aktiv" : "inaktiv"}
            <span className={"nk-spur klein" + (aktiv ? " an" : "")} aria-hidden="true"><span /></span>
          </button>
          <button type="button" className="modal-close" onClick={schliessen} aria-label="Schließen">×</button>
        </div>
        {!aktiv && <span className="small">Inaktive Artikel stehen nicht mehr zur Auswahl am Auftrag. Bestehende Aufträge behalten sie.</span>}

        <div className="ar-karte-feld">
          <div className="nk-zeile">
            <label className="nk-feld ar-nr-feld">
              <span>Nr.</span>
              <input type="number" value={nummer} onChange={(e) => setNummer(e.target.value)} />
            </label>
            <label className="nk-feld">
              <span>Kurzbezeichnung</span>
              <input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </label>
          </div>
          <label className="nk-feld">
            <span>Langbezeichnung (Rechnung)</span>
            <input type="text" value={longName} onChange={(e) => setLongName(e.target.value)} />
          </label>
          {/* Die Einheit auf der Rechnung (Migration 48). Sie gehört an den Artikel und nicht an
              die Position: „Stück" oder „Fahrt" ändert sich nicht von Auftrag zu Auftrag.
              Feste Liste plus freie Eingabe: Wer einen fünften Wert braucht, tippt ihn. */}
          <label className="nk-feld">
            <span>Einheit</span>
            <input type="text" list={`einheiten-${article.id}`} value={einheit} placeholder="Stück" onChange={(e) => setEinheit(e.target.value)} />
            <datalist id={`einheiten-${article.id}`}>
              {EINHEITEN.map((e) => <option key={e} value={e} />)}
            </datalist>
          </label>
          <span className="small">Steht hinter der Menge – zum Beispiel 4 {einheit.trim() || "Stück"}.</span>
        </div>

        {/* WANN wird diese Leistung fällig (Migration 46)? Das Kennzeichen hängt am Artikel und
            nicht an einem Namen im Code – ein Vergleich auf „Reifeneinlagerung" wäre beim
            ersten Umbenennen still kaputt. */}
        <span className="op-gruppe-titel">WIE WIRD ABGERECHNET?</span>
        <div className="lg-lagerwahl ar-segment" role="group" aria-label="Abrechnung">
          <button type="button" className={abrechnungsart === "normal" ? "aktiv" : ""} aria-pressed={abrechnungsart === "normal"} onClick={() => setAbrechnungsart("normal")}>Wenn erbracht</button>
          <button type="button" className={abrechnungsart === "lagergebuehr" ? "aktiv" : ""} aria-pressed={abrechnungsart === "lagergebuehr"} onClick={() => setAbrechnungsart("lagergebuehr")}>Lagergebühr (Monate)</button>
        </div>
        <span className="small">
          {abrechnungsart === "lagergebuehr"
            ? "Beim Einlagern wird dieser Artikel nie verlangt. Beim Auslagern schlägt die App ihn vor, mit der Zahl der Lagermonate als Menge – angefangene Monate zählen voll."
            : "Der Normalfall: Der Artikel wird eingetragen, sobald die Leistung erbracht ist."}
        </span>

        {/* Die Erinnerung an die Altreifen gehört an den Wechsel, wo sie anfallen – nicht an die
            Einlagerung. Und es bleibt eine Frage, kein Zwang: Genug Kunden nehmen ihre alten
            Reifen mit. */}
        <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={fragtEinlagerung} onClick={() => setFragtEinlagerung(!fragtEinlagerung)}>
          <span className="db-punkt-text">
            <span className="db-punkt-titel">Fragt nach Altreifen</span>
            <span className="small">
              {fragtEinlagerung
                ? "Steht der Artikel auf einem Auftrag und wurde nichts eingelagert, fragt das Auftragsfenster beim Abschließen, ob der Kunde die alten Reifen mitnimmt. Abschließen geht so oder so."
                : "Für Wechsel- und Montageleistungen. Dann erinnert die App daran, die alten Reifen einzulagern."}
            </span>
          </span>
          <span className={"nk-spur" + (fragtEinlagerung ? " an" : "")} aria-hidden="true"><span /></span>
        </button>
        {/* Die freie Position (Migration 50): Ein Haken am Artikel und keine Erkennung am Namen –
            „wenn der Artikel Sonstiges heißt" wäre beim ersten Umbenennen falsch. */}
        <button type="button" className="sl-chance nk-schalter ar-schalter" aria-pressed={freitext} onClick={() => setFreitext(!freitext)}>
          <span className="db-punkt-text">
            <span className="db-punkt-titel">Bezeichnung am Auftrag</span>
            <span className="small">
              {freitext
                ? "Auf der Rechnung steht der Text, der am Auftrag eingetippt wurde. Bleibt er leer, steht der Artikelname da."
                : "Für Sammelpositionen wie Sonstiges. Ohne den Schalter ist der eingetippte Text eine Zusatzzeile unter der Bezeichnung."}
            </span>
          </span>
          <span className={"nk-spur" + (freitext ? " an" : "")} aria-hidden="true"><span /></span>
        </button>

        <div className="ar-preise-kopf">
          <span className="op-gruppe-titel">PREISE</span>
          {!neuerPreis && <button type="button" className="db-link ar-link" onClick={() => setNeuerPreis(true)}>+ Neuer Preis ab …</button>}
        </div>
        <span className="small">Preise werden sofort gespeichert. Bereits geschriebene Auftragspositionen behalten ihren Preis.</span>

        {neuerPreis && (
          <div className="ar-karte-feld">
            <div className="nk-zeile">
              <label className="nk-feld"><span>Netto (€)</span>
                <input type="number" inputMode="decimal" min={0} step="0.01" value={netPrice} onChange={(e) => setNetPrice(e.target.value)} placeholder="0,00" autoFocus />
              </label>
              <label className="nk-feld ar-mwst"><span>MwSt. %</span>
                <input type="number" min={0} max={100} step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              </label>
            </div>
            <label className="nk-feld"><span>Gültig ab</span>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </label>
            <div className="ar-knoepfe">
              <button type="button" className="es-knopf" onClick={() => { setNeuerPreis(false); setNetPrice(""); }}>Abbrechen</button>
              <button
                type="button" className="am-mini"
                onClick={async () => {
                  const price = parseFloat(netPrice.replace(",", "."));
                  const vat = parseFloat(vatRate.replace(",", "."));
                  if (isNaN(price) || price < 0) return;
                  await onAddPrice(article.id, price, isNaN(vat) ? DEFAULT_VAT_RATE : vat, validFrom);
                  setNetPrice(""); setNeuerPreis(false);
                }}
              >
                Preis anlegen
              </button>
            </div>
          </div>
        )}

        {sortedPrices.length === 0 ? (
          <span className="small ar-leer">{freitext ? "Kein Preis nötig – er wird am Auftrag vereinbart." : "Noch kein Preis hinterlegt."}</span>
        ) : (
          <div className="ar-zeitleiste">
            {sortedPrices.map((p) => bearbeitet === p.id ? (
              <div key={p.id} className="ar-karte-feld">
                <div className="nk-zeile">
                  <label className="nk-feld"><span>Gültig von</span><input type="date" value={eVon} onChange={(e) => setEVon(e.target.value)} /></label>
                  <label className="nk-feld"><span>Gültig bis (leer = offen)</span><input type="date" value={eBis} onChange={(e) => setEBis(e.target.value)} /></label>
                </div>
                <div className="nk-zeile">
                  <label className="nk-feld"><span>Netto (€)</span><input type="number" min={0} step="0.01" value={eNetto} onChange={(e) => setENetto(e.target.value)} /></label>
                  <label className="nk-feld ar-mwst"><span>MwSt. %</span><input type="number" min={0} max={100} step="0.01" value={eMwst} onChange={(e) => setEMwst(e.target.value)} /></label>
                </div>
                {ePruefung && <div className="hinweis-pflicht">{ePruefung}</div>}
                <div className="ar-knoepfe">
                  <button type="button" className="es-knopf" onClick={() => { setBearbeitet(null); setEPruefung(null); }}>Abbrechen</button>
                  <button
                    type="button" className="am-mini"
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
                  </button>
                </div>
              </div>
            ) : (
              <div key={p.id} className={"ar-preiszeile" + (gilt(p) ? " gilt" : "")}>
                <span className="ar-punkt" aria-hidden="true" />
                <span className="ar-pz-text">
                  <b>{p.valid_to ? `${formatDate(p.valid_from)} – ${formatDate(p.valid_to)}` : `ab ${formatDate(p.valid_from)} · bis auf Weiteres`}</b>
                  <span className="small">netto · {p.vat_rate} % MwSt.{gilt(p) ? " · heute gültig" : p.valid_from > heute ? " · kommt noch" : ""}</span>
                </span>
                <b className="ar-pz-preis">{formatEUR(p.net_price)}</b>
                <span className="ar-pz-knoepfe">
                  <button type="button" className="db-link ar-link" onClick={() => bearbeitenStarten(p)}>Ändern</button>
                  <button
                    type="button" className="db-link ar-link gefahr"
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
                    Löschen
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="am-knopf" disabled={!geaendert || speichert} onClick={speichern}>
          {speichert ? "Speichert …" : geaendert ? "Speichern" : "Nichts geändert"}
        </button>
      </div>
    </div>
  );
}

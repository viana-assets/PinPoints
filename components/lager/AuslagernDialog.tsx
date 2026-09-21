"use client";

import { useState } from "react";
import type { Article, ArticlePrice, Customer, Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { currentArticlePrice, formatDate, formatEUR, istLanglieger, lagermonate, todayStr } from "@/lib/helpers";

// Was beim Auslagern passieren soll. Der Aufrufer entscheidet nicht selbst, sondern bekommt
// die Wahl des Nutzers als ein Stück – sonst müsste jede Aufrufstelle dieselben vier Fälle
// (Gebühr ja/nein, Auftrag alt/neu) noch einmal auseinandersortieren.
export type AuslagernWahl = {
  // Auf welchen Auftrag kommt die Gebühr? Null heißt: keine Gebühr berechnen.
  auftragId: string | null;
  // Statt eines bestehenden Auftrags einen neuen für diesen Kunden anlegen.
  neuerAuftrag: boolean;
  artikelId: string | null;
  menge: number;
};

// Der Dialog beim Herausgeben eines Reifensatzes (Migration 46).
//
// Er sitzt an der Stelle, an der die Dauer zum ersten Mal feststeht. Beim EINLAGERN weiß
// niemand, wie viele Monate der Satz liegen wird; eine Gebühr ließe sich dort gar nicht
// beziffern. Deshalb wird sie hier vorgeschlagen – als Vorschlag, nicht als Festsetzung:
// Die Menge bleibt änderbar, und „keine Gebühr" ist eine gleichberechtigte Antwort.
export function AuslagernDialog({
  satz, kunde, fahrzeug, slot, warehouse, gebuehrArtikel, articlePrices,
  offeneAuftraege, vorschlagAuftragId, onAbbrechen, onAuslagern,
}: {
  satz: TireStorage;
  kunde: Customer | undefined;
  fahrzeug: Vehicle | undefined;
  slot: StorageSlot | undefined;
  warehouse: Warehouse | undefined;
  // Alle Artikel mit Abrechnungsart „Lagergebühr". Leer heißt: Im Artikelstamm ist keiner
  // gepflegt – dann wird nur ausgelagert, und der Dialog sagt auch, warum.
  gebuehrArtikel: Article[];
  articlePrices: ArticlePrice[];
  // Offene und laufende Aufträge dieses Kunden, neueste zuerst.
  offeneAuftraege: Order[];
  // Der Auftrag, aus dem heraus ausgelagert wurde – falls es einen gibt. Er steht vorne.
  vorschlagAuftragId: string | null;
  onAbbrechen: () => void;
  onAuslagern: (wahl: AuslagernWahl) => Promise<void>;
}) {
  const monate = lagermonate(satz.created_at, todayStr());
  const [artikelId, setArtikelId] = useState(gebuehrArtikel[0]?.id ?? "");
  const [menge, setMenge] = useState(String(monate));
  // Vorbelegung in dieser Reihenfolge: der Auftrag, aus dem heraus ausgelagert wurde; sonst
  // der neueste offene Auftrag des Kunden; sonst ein neuer. Der Kunde steht meist gerade
  // daneben – wer hier erst ein Auswahlfeld durchsuchen muss, trägt die Gebühr nicht ein.
  // Der Vorschlag zählt nur, wenn er auch zur Auswahl steht. Ein Auftrag, der inzwischen
  // abgeschlossen wurde, wäre sonst ein Zustand ohne passende Zeile im Auswahlfeld: Angezeigt
  // stünde der erste Eintrag, gespeichert würde ein anderer.
  const vorschlagGilt = offeneAuftraege.some((o) => o.id === vorschlagAuftragId);
  const [ziel, setZiel] = useState<string>(
    (vorschlagGilt ? vorschlagAuftragId : null) ?? offeneAuftraege[0]?.id ?? "neu"
  );
  const [ohneGebuehr, setOhneGebuehr] = useState(gebuehrArtikel.length === 0);
  const [laeuft, setLaeuft] = useState(false);

  const artikel = gebuehrArtikel.find((a) => a.id === artikelId);
  const preis = artikel
    ? currentArticlePrice(articlePrices.filter((p) => p.article_id === artikel.id), todayStr())
    : null;
  const mengeZahl = Math.max(0, parseInt(menge, 10) || 0);
  const summe = preis ? preis.net_price * mengeZahl : null;
  const langlieger = istLanglieger(monate, summe);

  const platz = [warehouse?.name, slot?.code].filter(Boolean).join(" · ") || "Lagerplatz unbekannt";
  const bis = todayStr();

  // Ohne gültigen Preis gibt es nichts zu berechnen. Bis zum 21.09.2026 stand der Hinweis
  // „kein gültiger Preis hinterlegt" zwar da, der Knopf ließ sich aber trotzdem drücken – und
  // `insertOrderArticle` fiel mangels Preis auf 0,00 € zurück. Auf der Rechnung stand dann
  // „8 Monate · 0,00 €", und niemand sah, dass die App genau davor gewarnt hatte. Eine
  // Warnung, die man wegklicken kann, ohne dass etwas passiert, ist keine Warnung.
  const kannBerechnen = !!artikel && preis !== null && mengeZahl > 0;
  const wirdBerechnet = !ohneGebuehr && kannBerechnen;

  async function bestaetigen() {
    setLaeuft(true);
    try {
      await onAuslagern(
        !wirdBerechnet
          ? { auftragId: null, neuerAuftrag: false, artikelId: null, menge: 0 }
          : {
              auftragId: ziel === "neu" ? null : ziel,
              neuerAuftrag: ziel === "neu",
              artikelId: artikel.id,
              menge: mengeZahl,
            }
      );
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onAbbrechen(); }}>
      <div className="modal-box" style={{ position: "relative", maxWidth: 480 }}>
        <button className="modal-close" onClick={onAbbrechen} aria-label="Schließen">✕</button>
        <h2>Reifen auslagern</h2>
        <div>
          <div className="auslagern-satz">
            <strong>{kunde?.name ?? "Unbekannter Kunde"}</strong>
            {fahrzeug ? ` · ${[fahrzeug.license_plate, fahrzeug.make_model].filter(Boolean).join(" ")}` : ""}
            <br />
            {platz} · eingelagert {formatDate(satz.created_at.slice(0, 10))}
          </div>

          {/* Die Zahl steht groß da, weil sie die einzige ist, die hier zur Entscheidung
              gehört. Der Zeitraum daneben, damit man sie nachrechnen kann, ohne die
              Einlagerung zu suchen. */}
          <div className="auslagern-dauer">
            <span className="auslagern-monate">{monate}</span>
            <span>
              {monate === 1 ? "angefangener Monat" : "angefangene Monate"} im Regal
              <br />
              <span className="small">
                {formatDate(satz.created_at.slice(0, 10))} – {formatDate(bis)} · ein angefangener Monat zählt voll
              </span>
            </span>
          </div>

          {gebuehrArtikel.length === 0 ? (
            <div className="auslagern-hinweis">
              Im Artikelstamm ist kein Artikel mit der Abrechnungsart &bdquo;Lagergebühr&ldquo;
              hinterlegt. Der Satz wird nur ausgelagert – berechnet wird nichts. Wer das ändern
              will, stellt den Einlagerungsartikel unter &bdquo;Artikel&ldquo; um.
            </div>
          ) : (
            <>
              <div className="checkbox-row">
                <input
                  type="checkbox" id="auslagern-ohne-gebuehr"
                  checked={ohneGebuehr} onChange={(e) => setOhneGebuehr(e.target.checked)}
                />
                <label htmlFor="auslagern-ohne-gebuehr">Ohne Gebühr auslagern</label>
              </div>

              {!ohneGebuehr && (
                <>
                  {gebuehrArtikel.length > 1 && (
                    <div className="field">
                      <label htmlFor="auslagern-artikel">Leistung</label>
                      <select id="auslagern-artikel" value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
                        {gebuehrArtikel.map((a) => (
                          <option key={a.id} value={a.id}>{a.short_name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="row">
                    <div className="field" style={{ maxWidth: 140 }}>
                      <label htmlFor="auslagern-menge">Menge (Monate)</label>
                      <input
                        id="auslagern-menge" type="number" min={0} step={1}
                        value={menge} onChange={(e) => setMenge(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Ergibt</label>
                      <div className="auslagern-summe">
                        {preis === null ? (
                          <span className="small">
                            Für diesen Artikel ist kein gültiger Preis hinterlegt – so lässt sich
                            nichts berechnen. Entweder den Preis im Artikelstamm nachtragen oder
                            oben auf ohne Gebühr umschalten.
                          </span>
                        ) : (
                          <>
                            {formatEUR(summe ?? 0)} netto
                            <span className="small"> · {formatEUR(preis.net_price)} je Monat</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Kulanz ist eine Geschäftsentscheidung, keine Rechenaufgabe. Die Zahl darf
                      deshalb kleiner gesetzt werden, ohne dass die Anwendung widerspricht. */}
                  {mengeZahl === 0 && preis !== null && (
                    <div className="small" style={{ marginTop: -4, marginBottom: 8 }}>
                      Menge 0 heißt: es wird nichts berechnet. Dann ist die Angabe ohne Gebühr
                      die ehrlichere – sie steht auch später noch im Protokoll.
                    </div>
                  )}
                  {mengeZahl !== monate && mengeZahl > 0 && (
                    <div className="small" style={{ marginTop: -4, marginBottom: 8 }}>
                      Abweichend von den {monate} berechneten Monaten – so gewollt?
                    </div>
                  )}

                  {langlieger && (
                    <div className="auslagern-warnung">
                      Dieser Satz liegt ungewöhnlich lange. Die Gebühr summiert sich auf
                      {" "}{summe !== null ? formatEUR(summe) : `${monate} Monate`} – bitte einmal
                      ansehen, bevor die Rechnung geschrieben wird.
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="auslagern-ziel">Auf welchen Auftrag?</label>
                    <select id="auslagern-ziel" value={ziel} onChange={(e) => setZiel(e.target.value)}>
                      {offeneAuftraege.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.order_number} · {formatDate(o.order_date)} · {o.title}
                        </option>
                      ))}
                      <option value="neu">Neuen Auftrag für diesen Kunden anlegen</option>
                    </select>
                    {ziel === "neu" && (
                      <span className="small">
                        Der Auftrag wird mit dem heutigen Datum angelegt und danach geöffnet.
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="auslagern-fuss">
          <button type="button" className="btn-secondary btn-rand" onClick={onAbbrechen} disabled={laeuft}>Abbrechen</button>
          <button
            type="button" className="btn-primary" onClick={bestaetigen}
            disabled={laeuft || (!ohneGebuehr && gebuehrArtikel.length > 0 && !kannBerechnen)}
          >
            {ohneGebuehr || gebuehrArtikel.length === 0
              ? "Auslagern"
              : ziel === "neu" ? "Auslagern und Auftrag anlegen" : "Auslagern und berechnen"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { Article, ArticlePrice, Customer, Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { currentArticlePrice, formatDate, formatEUR, istLanglieger, lagermonate, todayStr } from "@/lib/helpers";
import { auftragsNr } from "@/lib/testkunde";
import { lagerBis } from "@/lib/lagerVormerkung";
import { Blatt } from "@/components/Blatt";

// Was beim Auslagern passieren soll. Der Aufrufer entscheidet nicht selbst, sondern bekommt
// die Wahl des Nutzers als ein Stück – sonst müsste jede Aufrufstelle dieselben vier Fälle
// (Gebühr ja/nein, Auftrag alt/neu) noch einmal auseinandersortieren.
//
// Seit Migration 67 (v111) wird mit einem Auftrag nur VORGEMERKT: Der Satz bleibt im Regal und geht
// erst beim Abschließen dieses Auftrags heraus. Sofort ausgelagert wird nur noch ohne Auftrag
// (`sofort`) – etwa wenn der Kunde seine Reifen selbst im Lager abholt.
export type AuslagernWahl = {
  // Mit welchem Auftrag geht der Satz heraus (dort steht auch die Gebühr)? Null bei `sofort` und
  // bei `neuerAuftrag`.
  auftragId: string | null;
  // Statt eines bestehenden Auftrags einen neuen für diesen Kunden anlegen.
  neuerAuftrag: boolean;
  // Ohne Auftrag, jetzt gleich auslagern – der Platz ist sofort frei.
  sofort: boolean;
  // Null heißt: keine Gebühr berechnen.
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
  offeneAuftraege, vorschlagAuftragId, vorgemerktFuer, onAbbrechen, onAuslagern, onAuftragOeffnen, onZuruecknehmen,
  darfNeuerAuftrag = true, darfAuslagern = true, darfGebuehrAnpassen = true,
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
  // Ist der Satz schon für einen Auftrag vorgemerkt (Migration 67), zeigt der Dialog nur das –
  // mit dem Weg zum Auftrag und zum Zurücknehmen. Ein zweites Vormerken lässt die Datenbank
  // ohnehin nicht zu.
  vorgemerktFuer: Order | null;
  onAbbrechen: () => void;
  onAuslagern: (wahl: AuslagernWahl) => Promise<void>;
  onAuftragOeffnen: (auftragId: string) => void;
  onZuruecknehmen: () => Promise<void>;
  // Darf hier ein neuer Auftrag entstehen? Der Techniker darf keine Aufträge anlegen (Migration
  // 42) – ohne diesen Schalter bot ihm die Liste eine Wahl an, die beim Ausführen scheiterte (v119).
  darfNeuerAuftrag?: boolean;
  // Rechte aus Migration 78: „Reifen auslagern“ (auch Vormerkung zurücknehmen) und „Lagergebühr
  // anpassen“. Ohne Letzteres gelten die berechneten Monate, und mit einem Auftrag geht es nur mit
  // Gebühr – die Datenbank prüft beides (`lager_handlungen_pruefen()`, `lagergebuehr_pruefen()`).
  darfAuslagern?: boolean;
  darfGebuehrAnpassen?: boolean;
}) {
  const [artikelId, setArtikelId] = useState(gebuehrArtikel[0]?.id ?? "");
  // Die Menge folgt den berechneten Monaten, bis jemand sie selbst ändert.
  const [mengeEigen, setMengeEigen] = useState<string | null>(null);
  // Vorbelegung in dieser Reihenfolge: der Auftrag, aus dem heraus ausgelagert wurde; sonst
  // der neueste offene Auftrag des Kunden; sonst ein neuer. Der Kunde steht meist gerade
  // daneben – wer hier erst ein Auswahlfeld durchsuchen muss, trägt die Gebühr nicht ein.
  // Der Vorschlag zählt nur, wenn er auch zur Auswahl steht. Ein Auftrag, der inzwischen
  // abgeschlossen wurde, wäre sonst ein Zustand ohne passende Zeile im Auswahlfeld: Angezeigt
  // stünde der erste Eintrag, gespeichert würde ein anderer.
  //
  // Ohne offenen Auftrag und ohne Gebührenartikel ist „sofort" die Vorbelegung: Dann gibt es weder
  // etwas zu berechnen noch einen Termin, auf den die Reifen warten.
  //
  // Der Auftrag, in dem der Satz EINGELAGERT wurde, steht nicht zur Wahl: Mit ihm herausgeben
  // hieße, ihn im selben Termin hinein- und wieder hinauszutragen. Ist er noch offen, wird
  // offenbar eine Einlagerung rückgängig gemacht („Einlagerung entfernen") – dann ist „sofort"
  // die Vorbelegung.
  const eigenerOffen = !!satz.order_id && offeneAuftraege.some((o) => o.id === satz.order_id);
  const auswahl = offeneAuftraege.filter((o) => o.id !== satz.order_id);
  const vorschlagGilt = auswahl.some((o) => o.id === vorschlagAuftragId);
  const [ziel, setZiel] = useState<string>(
    eigenerOffen ? "sofort"
      : (vorschlagGilt ? vorschlagAuftragId : null) ?? auswahl[0]?.id ?? (gebuehrArtikel.length > 0 && darfNeuerAuftrag ? "neu" : "sofort")
  );
  const [ohneGebuehr, setOhneGebuehr] = useState(gebuehrArtikel.length === 0);
  const [laeuft, setLaeuft] = useState(false);

  // Gezählt wird bis zum Termin des Auftrags, mit dem die Reifen herausgehen – nicht bis heute.
  const zielAuftrag = auswahl.find((o) => o.id === ziel) ?? null;
  const bis = lagerBis(todayStr(), zielAuftrag);
  const monate = lagermonate(satz.created_at, bis);
  const menge = darfGebuehrAnpassen ? mengeEigen ?? String(monate) : String(monate);
  const sofort = ziel === "sofort";

  const artikel = gebuehrArtikel.find((a) => a.id === artikelId);
  const preis = artikel
    ? currentArticlePrice(articlePrices.filter((p) => p.article_id === artikel.id), todayStr())
    : null;
  const mengeZahl = Math.max(0, parseInt(menge, 10) || 0);
  const summe = preis ? preis.net_price * mengeZahl : null;
  const langlieger = istLanglieger(monate, summe);

  const platz = [warehouse?.name, slot?.code].filter(Boolean).join(" · ") || "Lagerplatz unbekannt";

  // Ohne gültigen Preis gibt es nichts zu berechnen. Bis zum 21.09.2026 stand der Hinweis
  // „kein gültiger Preis hinterlegt" zwar da, der Knopf ließ sich aber trotzdem drücken – und
  // `insertOrderArticle` fiel mangels Preis auf 0,00 € zurück. Auf der Rechnung stand dann
  // „8 Monate · 0,00 €", und niemand sah, dass die App genau davor gewarnt hatte. Eine
  // Warnung, die man wegklicken kann, ohne dass etwas passiert, ist keine Warnung.
  const kannBerechnen = !!artikel && preis !== null && mengeZahl > 0;
  // Ohne „Lagergebühr anpassen“ gibt es kein „ohne Gebühr“ – außer es lässt sich nichts berechnen.
  const ohne = darfGebuehrAnpassen ? ohneGebuehr : !kannBerechnen;
  const wirdBerechnet = !sofort && !ohne && kannBerechnen;

  async function bestaetigen() {
    setLaeuft(true);
    try {
      await onAuslagern({
        auftragId: sofort || ziel === "neu" ? null : ziel,
        neuerAuftrag: ziel === "neu",
        sofort,
        artikelId: wirdBerechnet ? artikel.id : null,
        menge: wirdBerechnet ? mengeZahl : 0,
      });
    } finally {
      setLaeuft(false);
    }
  }

  async function zuruecknehmen() {
    setLaeuft(true);
    try { await onZuruecknehmen(); } finally { setLaeuft(false); }
  }

  // Seit v134 ein Blatt (components/Blatt.tsx) auf derselben Ebene wie bisher (10002, über dem
  // Auftrag): Kopf mit dem Satz, Felder in grauen Gruppen, Knöpfe unten.
  const satzKarte = (
    <div className="kp-gewaehlt auslagern-satz">
      <span className="kp-text">
        <b>{kunde?.name ?? "Unbekannter Kunde"}{fahrzeug ? ` · ${[fahrzeug.license_plate, fahrzeug.make_model].filter(Boolean).join(" ")}` : ""}</b>
        <span>{platz} · eingelagert {formatDate(satz.created_at.slice(0, 10))}</span>
      </span>
    </div>
  );

  if (vorgemerktFuer) {
    return (
      <Blatt titel="Zum Auslagern vorgemerkt" ebene="modal-auslagern" onClose={onAbbrechen}
        fuss={<>
          {darfAuslagern && (
            <button type="button" className="btn-secondary" onClick={() => void zuruecknehmen()} disabled={laeuft}>
              Vormerkung zurücknehmen
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => onAuftragOeffnen(vorgemerktFuer.id)} disabled={laeuft}>
            Auftrag öffnen
          </button>
        </>}>
        {satzKarte}
        <div className="auslagern-hinweis">
          Vorgemerkt für Auftrag {auftragsNr(vorgemerktFuer.order_number)} am {formatDate(vorgemerktFuer.order_date)}
          {vorgemerktFuer.title ? ` · ${vorgemerktFuer.title}` : ""}. Die Reifen liegen noch im Regal
          und gehen heraus, wenn dieser Auftrag abgeschlossen wird.
        </div>
      </Blatt>
    );
  }

  if (!darfAuslagern) {
    return (
      <Blatt titel="Reifen auslagern" ebene="modal-auslagern" onClose={onAbbrechen}
        fuss={<button type="button" className="btn-secondary" onClick={onAbbrechen}>Schließen</button>}>
        <div className="auslagern-hinweis">
          Auslagern ist für deine Rolle nicht freigegeben (Admin › Rechte › Lager › Reifen auslagern).
        </div>
      </Blatt>
    );
  }

  return (
    <Blatt titel="Reifen auslagern" ebene="modal-auslagern" onClose={onAbbrechen}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onAbbrechen} disabled={laeuft}>Abbrechen</button>
        <button
          type="button" className="btn-primary" onClick={bestaetigen}
          disabled={laeuft || (!sofort && !ohne && gebuehrArtikel.length > 0 && !kannBerechnen)}
        >
          {sofort
            ? "Jetzt auslagern"
            : ziel === "neu"
              ? "Vormerken und Auftrag anlegen"
              : wirdBerechnet ? "Vormerken und berechnen" : "Vormerken"}
        </button>
      </>}>
      {satzKarte}

      <div className="nk-feld">
        <label htmlFor="auslagern-ziel" className="kp-label">Mit welchem Auftrag?</label>
        <select id="auslagern-ziel" value={ziel} onChange={(e) => setZiel(e.target.value)}>
          {auswahl.map((o) => (
            <option key={o.id} value={o.id}>
              {auftragsNr(o.order_number)} · {formatDate(o.order_date)} · {o.title}
            </option>
          ))}
          {darfNeuerAuftrag && <option value="neu">Neuen Auftrag für diesen Kunden anlegen</option>}
          <option value="sofort">Ohne Auftrag – jetzt gleich auslagern</option>
        </select>
        <span className="bl-hilfe">
          {sofort
            ? "Der Platz ist sofort frei – etwa wenn der Kunde seine Reifen selbst abholt."
            : ziel === "neu"
              ? "Der Auftrag wird mit dem heutigen Datum angelegt und danach geöffnet. Die Reifen bleiben bis zu seinem Abschluss im Regal."
              : `Die Reifen bleiben im Regal und belegen ihren Platz, bis Auftrag ${auftragsNr(zielAuftrag?.order_number ?? 0)} abgeschlossen wird – erst dann gelten sie als ausgelagert.`}
        </span>
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
            {formatDate(satz.created_at.slice(0, 10))} – {formatDate(bis)}{bis > todayStr() ? " (Termin)" : ""} · ein angefangener Monat zählt voll
          </span>
        </span>
      </div>

      {sofort ? null : gebuehrArtikel.length === 0 ? (
        <div className="auslagern-hinweis">
          Im Artikelstamm ist kein Artikel mit der Abrechnungsart &bdquo;Lagergebühr&ldquo;
          hinterlegt. Der Satz wird nur vorgemerkt – berechnet wird nichts. Wer das ändern
          will, stellt den Einlagerungsartikel unter &bdquo;Artikel&ldquo; um.
        </div>
      ) : (
        <div className="ar-karte-feld">
          <div className="bl-gruppe-titel auslagern-gebuehr-titel">LAGERGEBÜHR</div>
          {darfGebuehrAnpassen && (
            <label className="auslagern-ohne" htmlFor="auslagern-ohne-gebuehr">
              <input
                type="checkbox" id="auslagern-ohne-gebuehr"
                checked={ohneGebuehr} onChange={(e) => setOhneGebuehr(e.target.checked)}
              />
              <span>Ohne Gebühr</span>
            </label>
          )}

          {!ohne && (
            <>
              {gebuehrArtikel.length > 1 && (
                <div className="nk-feld">
                  <label htmlFor="auslagern-artikel" className="kp-label">Leistung</label>
                  <select id="auslagern-artikel" value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
                    {gebuehrArtikel.map((a) => (
                      <option key={a.id} value={a.id}>{a.short_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="nk-zeile auslagern-rechnung">
                <div className="nk-feld auslagern-menge">
                  <label htmlFor="auslagern-menge" className="kp-label">Menge (Monate)</label>
                  <input
                    id="auslagern-menge" type="number" min={0} step={1} disabled={!darfGebuehrAnpassen}
                    title={darfGebuehrAnpassen ? undefined : "Die Monate ändert, wer „Lagergebühr anpassen“ darf."}
                    value={menge} onChange={(e) => setMengeEigen(e.target.value)}
                  />
                </div>
                <div className="nk-feld">
                  <span className="kp-label">Ergibt</span>
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
                <div className="bl-hilfe">
                  Menge 0 heißt: es wird nichts berechnet. Dann ist die Angabe ohne Gebühr
                  die ehrlichere – sie steht auch später noch im Protokoll.
                </div>
              )}
              {mengeZahl !== monate && mengeZahl > 0 && (
                <div className="bl-hilfe">
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
            </>
          )}
        </div>
      )}
    </Blatt>
  );
}

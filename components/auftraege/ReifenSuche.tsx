import { useState } from "react";
import type { Article, ReifenZustand, Saison, StorageSlot, Verkaufsreifen, Warehouse } from "@/lib/types";
import { formatEUR } from "@/lib/helpers";
import { REIFEN_ZUSTAENDE, REIFEN_ZUSTAND_LABEL, SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import {
  artikelFuer, groesseAusText, groesseText, passtZurSuche, reifenFrei, reifenHinweise, reifenName,
  reifenUnterzeile, sortiereReifen, vorschlagMenge,
} from "@/lib/reifenverkauf";

// „Reifen aus dem Lager" im Auftrag (Migration 61, docs/lager.md „Reifenverkauf").
//
// Das Suchfeld steht schon auf der Reifengröße des Fahrzeugs am Auftrag – ein Tipp, und man
// sieht, was passt. Getippt wird, wie man spricht: „235", „235 55 17", „Michelin"
// (`passtZurSuche`). Ein Treffer klappt auf: Stückzahl wählen, hinzufügen. Die Position bekommt
// den Preis und den Text des Reifens; ob wirklich noch so viele frei sind, entscheidet beim
// Eintragen die Datenbank – ein zweites Gerät kann schneller gewesen sein.
export function ReifenSuche({ verkaufsreifen, articles, warehouses, storageSlots, vorschlag, nurZustand, onHinzufuegen, onOhneLager, onClose }: {
  verkaufsreifen: Verkaufsreifen[];
  articles: Article[];
  warehouses: Warehouse[];
  storageSlots: StorageSlot[];
  // Die Reifengröße des Fahrzeugs am Auftrag, schon lesbar gemacht – oder leer.
  vorschlag: string;
  // Kommt man über den Artikel „Reifen gebraucht", sind nur gebrauchte vorgewählt.
  nurZustand: ReifenZustand | null;
  onHinzufuegen: (posten: Verkaufsreifen, artikelId: string, menge: number) => Promise<void>;
  // Reifen, die nicht im Lager liegen (bestellt): der Artikel ohne Bestand, wie jede Leistung.
  onOhneLager: (artikelId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [suche, setSuche] = useState(vorschlag);
  const [zustand, setZustand] = useState<ReifenZustand | null>(nurZustand);
  const [saison, setSaison] = useState<Saison | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [menge, setMenge] = useState(4);
  const [fuegtHinzu, setFuegtHinzu] = useState(false);

  const treffer = sortiereReifen(
    verkaufsreifen.filter((p) =>
      p.bestand > 0
      && (!zustand || p.zustand === zustand)
      && (!saison || p.saison === saison)
      && passtZurSuche(p, suche)),
    groesseAusText(suche)
  );

  function ort(p: Verkaufsreifen): string {
    const lager = warehouses.find((w) => w.id === p.warehouse_id)?.name;
    const platz = storageSlots.find((s) => s.id === p.storage_slot_id)?.code;
    return [lager, platz ? `Platz ${platz}` : null].filter(Boolean).join(" · ");
  }

  function aufklappen(p: Verkaufsreifen) {
    if (offen === p.id) { setOffen(null); return; }
    setOffen(p.id);
    setMenge(vorschlagMenge(reifenFrei(p)));
  }

  async function hinzufuegen(p: Verkaufsreifen, artikelId: string) {
    if (fuegtHinzu) return;
    setFuegtHinzu(true);
    try {
      await onHinzufuegen(p, artikelId, menge);
      onClose();
    } finally {
      setFuegtHinzu(false);
    }
  }

  const ohneLagerArtikel = artikelFuer(articles, zustand ?? "neu");

  return (
    <div className="modal-overlay auswahl-overlay ls-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit ls-blatt vk-suche" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reifen aus dem Lager">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Reifen aus dem Lager</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <label className="lg-suchfeld ls-suche">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="235 55 17 oder Michelin" value={suche}
            onChange={(e) => { setSuche(e.target.value); setOffen(null); }} aria-label="Reifen suchen" />
        </label>
        {vorschlag && suche !== vorschlag && (
          <button type="button" className="lg-link" onClick={() => { setSuche(vorschlag); setOffen(null); }}>Größe des Fahrzeugs: {vorschlag}</button>
        )}
        {vorschlag && suche === vorschlag && <span className="small">Vorbelegt mit der Reifengröße des Fahrzeugs.</span>}

        <div className="pl-filter vk-pillen" role="group" aria-label="Filter">
          {REIFEN_ZUSTAENDE.map((z) => (
            <button key={z} type="button" className={"pl-pille" + (zustand === z ? " aktiv" : "")} aria-pressed={zustand === z}
              onClick={() => { setZustand(zustand === z ? null : z); setOffen(null); }}>{REIFEN_ZUSTAND_LABEL[z]}</button>
          ))}
          {SAISON_LISTE.map((s) => (
            <button key={s} type="button" className={"pl-pille" + (saison === s ? " aktiv" : "")} aria-pressed={saison === s}
              onClick={() => { setSaison(saison === s ? null : s); setOffen(null); }}>{SAISON_LABEL[s]}</button>
          ))}
        </div>

        {treffer.length === 0 && (
          <span className="small ls-leer">
            {verkaufsreifen.some((p) => p.bestand > 0) ? "Kein Reifen im Lager passt dazu." : "Es liegen keine Reifen zum Verkauf im Lager."}
          </span>
        )}
        {treffer.slice(0, 40).map((p) => {
          const f = reifenFrei(p);
          const hinweise = reifenHinweise(p);
          const gesperrt = hinweise.some((h) => h.sperrt);
          const artikel = artikelFuer(articles, p.zustand);
          const istOffen = offen === p.id;
          return (
            <div key={p.id} className={"vk-treffer" + (istOffen ? " offen" : "")}>
              <button type="button" className="vk-karte flach" disabled={f === 0 || gesperrt} onClick={() => aufklappen(p)} aria-expanded={istOffen}>
                <span className={"vk-groesse-marke " + p.zustand}>
                  <b>{groesseText(p)}</b>
                  <span>{REIFEN_ZUSTAND_LABEL[p.zustand]}</span>
                </span>
                <span className="vk-text">
                  <b>{reifenName(p)}</b>
                  <span className="small">{reifenUnterzeile(p)}</span>
                  {ort(p) && <span className="small">{ort(p)}</span>}
                  {hinweise.length > 0 && <span className="lg-zeile-grund">{hinweise.map((h) => h.text).join(" · ")}</span>}
                </span>
                <span className="vk-zahlen">
                  <b>{formatEUR(p.preis_netto)}</b>
                  <span className={"vk-frei" + (f === 0 ? " null" : "")}>
                    {f === 0 ? "alle reserviert" : `${f} frei von ${p.bestand}`}
                  </span>
                </span>
              </button>
              {istOffen && (
                <div className="vk-nehmen">
                  {artikel ? (
                    <>
                      <span className="ls-stepper">
                        <button type="button" aria-label="Eins weniger" disabled={menge <= 1} onClick={() => setMenge(menge - 1)}>−</button>
                        <b>{menge}</b>
                        <button type="button" aria-label="Eins mehr" disabled={menge >= f} onClick={() => setMenge(menge + 1)}>+</button>
                      </span>
                      <button type="button" className="dm-plus orange vk-nehmen-knopf" disabled={fuegtHinzu} onClick={() => void hinzufuegen(p, artikel.id)}>
                        {fuegtHinzu ? "Wird eingetragen …" : `Hinzufügen · ${formatEUR(menge * p.preis_netto)}`}
                      </button>
                    </>
                  ) : (
                    <span className="small vk-fehler">
                      Im Artikelstamm fehlt ein aktiver Artikel mit der Abrechnungsart „Reifenverkauf {p.zustand}“.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {treffer.length > 40 && <span className="small">Es werden die ersten 40 gezeigt – bitte genauer suchen.</span>}

        {ohneLagerArtikel && (
          <button type="button" className="lg-link vk-ohne" disabled={fuegtHinzu}
            onClick={() => { setFuegtHinzu(true); void onOhneLager(ohneLagerArtikel.id).then(onClose, () => setFuegtHinzu(false)); }}>
            Nicht im Lager (z. B. bestellt)? „{ohneLagerArtikel.short_name}“ ohne Bestand eintragen ›
          </button>
        )}
      </div>
    </div>
  );
}

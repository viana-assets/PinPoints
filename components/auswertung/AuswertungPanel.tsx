import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { Article, ArticlePrice, Customer, Employee, Order, OrderArticle, Vehicle } from "@/lib/types";
import { fetchAuswertungsdaten, type AuswertungsAbzug } from "@/lib/api/auswertung";
import { artikelDetail, jeArtikel, jeMitarbeiter, kennzahlen, type Auswertungsdaten, type Zeitraum } from "@/lib/auswertung";
import {
  AUSWERTUNGS_ZEITRAUM_LABEL, aktuelleOderNaechsteSaison, ausDemRegal, belegtAm, belegungVerlauf, einsatz, EINSATZ_RASTER_VON,
  erbrachtNichtAbgerechnet, lagerAusblick, lagerBewegung, monatImZeitraum, monatKurz, monatLang, monatsreihe, neuAngelegteKunden,
  neuUndBestand, postenFuerPerson, rasterHinweis, saisonFenster, tagDeutsch, umsatzJeMonat, umsatzposten, umsatzstaerksteKunden, umsatzSumme,
  veraenderung, verschiebeJahr, vorigeSaison, vorjahr, wiederkehr, zeitraumFuer, zeitraumTitel, type AuswertungsZeitraum,
} from "@/lib/auswertungAnsicht";
import { csv, datevBuchungsstapel, datevEinstellungFehler, debitorenlisteCsv, rechnungslisteCsv, windows1252 } from "@/lib/datev";
import { currentArticlePrice, formatEUR, LANGLIEGER_EURO, LANGLIEGER_MONATE, naechsteSaison, orderArticleTotals, todayStr } from "@/lib/helpers";
import { employeeColorFor } from "@/lib/calendar";
import { langlieger } from "@/lib/langlieger";
import { auftragsNr } from "@/lib/testkunde";

// Register „Auswertungen" – neu gestaltet am 26.09.2026 (Entwurf „M · Auswertungen", Fahrplan
// E13). Vorher eine starre Seite: drei Zeiträume, sechs Kacheln, ein Balkendiagramm, zwei
// Tabellen – kein Vergleich, kein Hineinklicken, kein Export, und der Umsatz aus den Aufträgen
// statt aus dem Rechnungsbuch.
//
// Weiterhin FESTE Ansichten und kein Auswertungsbaukasten (Entscheidung aus Block D): Ein
// Baukasten, den man einmal im Quartal bedient, muss jedes Mal neu verstanden werden. Neu ist,
// dass jede Ansicht filterbar (Zeitraum, Mitarbeiter), vergleichbar (Vorjahr bis zum selben Tag)
// und anklickbar ist – bis zur Rechnung, zum Auftrag, zum Kunden.
//
// Fünf Reiter: Umsatz (Quelle Rechnungsbuch), Kunden, Einsatz, Lager, Artikel. Export: DATEV-
// Buchungsstapel, Debitorenliste, Rechnungsliste, die aktuelle Ansicht als Tabelle.
//
// Gerechnet wird in lib/auswertung.ts, lib/auswertungAnsicht.ts und lib/datev.ts – alle mit
// Prüffällen. Diese Datei zeigt nur an.

type Reiter = "umsatz" | "kunden" | "einsatz" | "lager" | "artikel";
const REITER: { wert: Reiter; text: string }[] = [
  { wert: "umsatz", text: "Umsatz" }, { wert: "kunden", text: "Kunden" }, { wert: "einsatz", text: "Einsatz" },
  { wert: "lager", text: "Lager" }, { wert: "artikel", text: "Artikel" },
];
type Blatt = null | "frei" | "person" | "export" | "offen" | "monat" | "artikel";

const eur0 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const stunden = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const LEER_ABZUG: AuswertungsAbzug = { orders: [], orderArticles: [], orderEmployees: {}, einlagerungen: [], auftragFahrzeuge: [], rechnungen: [], offeneRechnungsauftraege: [], lagerplaetze: 0, betrieb: null };

function herunterladen(name: string, inhalt: BlobPart, typ: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Erst freigeben, wenn der Browser den Download angenommen hat – Safari liefert sonst eine
  // leere Datei (wie in components/lager/ReifensatzEtikett.tsx).
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function Delta({ jetzt, vorher, dunkel, einheit }: { jetzt: number; vorher: number; dunkel?: boolean; einheit?: string }) {
  const p = veraenderung(jetzt, vorher);
  // Beides null: nichts zu vergleichen, und „im Vorjahr keine Werte" wäre nur Lärm.
  if (!jetzt && !vorher) return null;
  if (p == null) return <span className={"am-delta" + (dunkel ? " dunkel" : "")}>im Vorjahr keine Werte</span>;
  return (
    <span className={"am-delta " + (p >= 0 ? "plus" : "minus") + (dunkel ? " dunkel" : "")}>
      {p >= 0 ? "▲" : "▼"} {Math.abs(p)} % zum Vorjahr{einheit ? ` (${einheit})` : ""}
    </span>
  );
}

function Kachel({ titel, wert, unter, children }: { titel: string; wert: string; unter?: string; children?: React.ReactNode }) {
  return (
    <div className="db-kachel am-kachel">
      <span className="db-k-titel">{titel}</span>
      <span className="db-k-wert">{wert}</span>
      {unter && <span className="db-k-unter">{unter}</span>}
      {children}
    </div>
  );
}

// Säulen aus divs statt einer Diagrammbibliothek: zwölf Säulen rechtfertigen keine Abhängigkeit,
// und die App soll offline laufen. Die Höhe ist die Aussage und steht deshalb am Element.
function Saeulen({ werte, vorjahr, monate, z, onMonat, gewaehlt, deckel, farbe }: {
  werte: number[]; vorjahr: number[] | null; monate: string[]; z: Zeitraum;
  onMonat?: (m: string) => void; gewaehlt?: string | null; deckel?: number; farbe?: "navy";
}) {
  const max = Math.max(1, deckel ?? 0, ...werte, ...(vorjahr ?? []));
  return (
    <div className="am-saeulen" role="list">
      {deckel != null && <span className="am-deckel"><span>{deckel} Plätze</span></span>}
      {monate.map((m, i) => {
        const drin = monatImZeitraum(m, z);
        const titel = `${monatLang(m)}: ${deckel != null ? werte[i] + " belegt" : formatEUR(werte[i])}${vorjahr ? ` · Vorjahr ${deckel != null ? vorjahr[i] : formatEUR(vorjahr[i])}` : ""}`;
        const inhalt = (
          <>
            <span className="am-paar">
              {vorjahr && <span className="am-vj" style={{ height: `${Math.max(1, (vorjahr[i] / max) * 100)}%` }} />}
              <span className={"am-bar" + (drin ? " drin" : "") + (farbe ? " " + farbe : "")} style={{ height: `${Math.max(1, (werte[i] / max) * 100)}%` }} />
            </span>
            <span className={"am-mon" + (drin ? " drin" : "")}>{monatKurz(m)}</span>
          </>
        );
        return onMonat ? (
          <button key={m} type="button" role="listitem" className={"am-spalte" + (gewaehlt === m ? " gewaehlt" : "")} onClick={() => onMonat(m)} title={titel}>{inhalt}</button>
        ) : (
          <span key={m} role="listitem" className="am-spalte" title={titel}>{inhalt}</span>
        );
      })}
    </div>
  );
}

export function AuswertungPanel(p: {
  employees: Employee[]; articles: Article[]; articlePrices: ArticlePrice[];
  // Für die Artikelauswertung: Wer hat gekauft, und an welchem Auto wurde gearbeitet.
  customers: Customer[]; vehicles: Vehicle[];
  // Darf der Nutzer das Rechnungsbuch lesen (`rechnungen · lesen`)? Sonst liefert die Datenbank
  // still keine Rechnungen – dann rechnet der Umsatz wie bisher aus den erledigten Aufträgen.
  darfRechnungen: boolean;
  standardDauerMin: number;
  onOpenOrder: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  onZuSaison?: () => void;
  onZuLager?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const heute = todayStr();
  const [reiter, setReiter] = useState<Reiter>("umsatz");
  const [art, setArt] = useState<AuswertungsZeitraum>("saison");
  const [frei, setFrei] = useState<Zeitraum>(() => zeitraumFuer("jahr", todayStr()));
  const [freiEntwurf, setFreiEntwurf] = useState<Zeitraum>(frei);
  const [vergleich, setVergleich] = useState(true);
  const [person, setPerson] = useState<string | null>(null);
  const [blatt, setBlatt] = useState<Blatt>(null);
  const [monat, setMonat] = useState<string | null>(null);
  const [artikelId, setArtikelId] = useState("");
  const [exportFehler, setExportFehler] = useState<string[]>([]);

  const z = art === "frei" ? frei : zeitraumFuer(art, heute);
  const zVJ = vorjahr(z);
  const monate = monatsreihe(z);
  const monateVJ = monate.map((m) => verschiebeJahr(m + "-01", -1).slice(0, 7));
  const saisonJetzt = aktuelleOderNaechsteSaison(heute);
  const saisonVJ = saisonFenster(saisonJetzt.art, saisonJetzt.jahr - 1);

  // Was geladen wird: der Zeitraum, das Vorjahr, die Monate der Säulen samt Vorjahr und beide
  // Saisonpaare der Wiederkehr – in EINER Abfrage, damit das Umschalten zwischen den Reitern
  // nichts nachlädt.
  const ladeVon = [zVJ.von, verschiebeJahr(monate[0] + "-01", -1), vorigeSaison(saisonVJ).von].sort()[0];
  const ladeBis = [z.bis, saisonJetzt.bis].sort()[1];

  const [abzug, setAbzug] = useState<AuswertungsAbzug | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    setLadeFehler(null);
    fetchAuswertungsdaten(supabase, ladeVon, ladeBis, p.darfRechnungen)
      .then((d) => { if (!abgebrochen) setAbzug(d); })
      .catch((e) => { if (!abgebrochen) setLadeFehler(e instanceof Error ? e.message : "Die Auswertung konnte nicht geladen werden."); })
      .finally(() => { if (!abgebrochen) setLaedt(false); });
    return () => { abgebrochen = true; };
  }, [supabase, ladeVon, ladeBis, p.darfRechnungen]);

  const a = abzug ?? LEER_ABZUG;
  const nachPerson = (o: Order) => !person || (a.orderEmployees[o.id] ?? []).includes(person);
  const daten: Auswertungsdaten = useMemo(() => ({
    orders: a.orders, orderArticles: a.orderArticles, orderEmployees: a.orderEmployees, einlagerungen: a.einlagerungen,
    auftragFahrzeuge: a.auftragFahrzeuge, employees: p.employees, articles: p.articles, customers: p.customers, vehicles: p.vehicles,
  }), [a, p.employees, p.articles, p.customers, p.vehicles]);
  const datenP: Auswertungsdaten = useMemo(() => (person ? { ...daten, orders: daten.orders.filter((o) => (daten.orderEmployees[o.id] ?? []).includes(person)) } : daten), [daten, person]);

  const summeAuftrag = useMemo(() => {
    const je = new Map<string, OrderArticle[]>();
    for (const r of a.orderArticles) { const l = je.get(r.order_id); if (l) l.push(r); else je.set(r.order_id, [r]); }
    return (o: Order) => orderArticleTotals(je.get(o.id) ?? [], o.rechnung_noetig);
  }, [a.orderArticles]);
  const posten = useMemo(() => postenFuerPerson(umsatzposten(a.rechnungen, a.orders, summeAuftrag, p.darfRechnungen), person, a.orderEmployees),
    [a.rechnungen, a.orders, a.orderEmployees, summeAuftrag, p.darfRechnungen, person]);

  // ---------------------------------------------------------------- Umsatz
  const s = umsatzSumme(posten, z);
  const sVJ = umsatzSumme(posten, zVJ);
  const k = kennzahlen(datenP, z);
  const kVJ = kennzahlen(datenP, zVJ);
  const jeMonat = umsatzJeMonat(posten, monate);
  const jeMonatVJ = umsatzJeMonat(posten, monateVJ);
  const offene = erbrachtNichtAbgerechnet(a.offeneRechnungsauftraege.filter(nachPerson));
  const offenSumme = offene.reduce((n, o) => n + summeAuftrag(o).net, 0);
  const artikelWerte = jeArtikel(datenP, z);
  const artikelWerteVJ = new Map(jeArtikel(datenP, zVJ).map((x) => [x.id, x]));
  const artikelSumme = artikelWerte.reduce((n, x) => n + x.umsatzNetto, 0);
  const woher = [...artikelWerte.slice(0, 3), ...(artikelWerte.length > 3 ? [{ id: "rest", name: "Übrige Leistungen", menge: 0, umsatzNetto: artikelWerte.slice(3).reduce((n, x) => n + x.umsatzNetto, 0) }] : [])];
  const WOHER_FARBE = ["var(--accent)", "var(--navy)", "var(--green)", "var(--frei-linie)"];
  const leute = jeMitarbeiter(daten, z);
  const leuteMax = Math.max(1, ...leute.map((l) => l.umsatzNetto));

  // ---------------------------------------------------------------- Kunden
  const w = wiederkehr(a.orders, p.customers, saisonJetzt);
  const wVJ = wiederkehr(a.orders, p.customers, saisonVJ);
  const laufIds = new Set(p.customers.filter((c) => c.laufkundschaft || c.einmalkunde).map((c) => c.id));
  const nettoOhneSammel = posten.filter((x) => x.datum >= z.von && x.datum <= z.bis && !(x.customer_id && laufIds.has(x.customer_id))).reduce((n, x) => n + x.netto, 0);
  const neu = neuAngelegteKunden(datenP.orders, p.customers, z);
  const wechsel = p.articles.find((x) => x.active && x.fragt_einlagerung);
  const wechselPreis = wechsel ? currentArticlePrice(p.articlePrices.filter((x) => x.article_id === wechsel.id), heute)?.net_price ?? null : null;
  const reifenSaison = naechsteSaison(new Date(heute + "T12:00:00"));
  const regal = ausDemRegal(a.einlagerungen, a.orders, reifenSaison, heute, wechselPreis);
  const top = umsatzstaerksteKunden(posten, z, p.customers, 5);
  const neuBestand = neuUndBestand(datenP.orders, p.customers, monate);
  const nbMax = Math.max(1, ...neuBestand.map((x) => x.neu + x.bestand));

  // ---------------------------------------------------------------- Einsatz
  const e = einsatz(datenP.orders, a.orderEmployees, p.employees, p.standardDauerMin, z);
  const eVJ = einsatz(datenP.orders, a.orderEmployees, p.employees, p.standardDauerMin, zVJ);
  const eMax = Math.max(1, ...e.jePerson.map((x) => x.minuten));
  const rMax = Math.max(1, ...e.raster.flat());
  const mitSonntag = e.raster[6].some((v) => v > 0);
  const hinweis = rasterHinweis(e.raster);

  // ---------------------------------------------------------------- Lager
  const belegt = belegtAm(a.einlagerungen, heute);
  const ausblick = lagerAusblick(a.einlagerungen, heute);
  const verlauf = belegungVerlauf(a.einlagerungen, monate, heute);
  const verlaufVJ = belegungVerlauf(a.einlagerungen, monateVJ, verschiebeJahr(heute, -1));
  const bewegung = lagerBewegung(a.einlagerungen, z);
  const gebuehrArtikel = new Set(p.articles.filter((x) => x.abrechnungsart === "lagergebuehr").map((x) => x.id));
  const gebuehr = artikelWerte.filter((x) => gebuehrArtikel.has(x.id)).reduce((n, x) => n + x.umsatzNetto, 0);
  const gebuehrVJ = [...artikelWerteVJ.values()].filter((x) => gebuehrArtikel.has(x.id)).reduce((n, x) => n + x.umsatzNetto, 0);
  const gebuehrPreis = (() => {
    const g = p.articles.find((x) => x.active && x.abrechnungsart === "lagergebuehr");
    return g ? currentArticlePrice(p.articlePrices.filter((x) => x.article_id === g.id), heute)?.net_price ?? null : null;
  })();
  const lang = langlieger(a.einlagerungen, heute, gebuehrPreis, LANGLIEGER_MONATE, LANGLIEGER_EURO);
  const langSumme = lang.reduce((n, x) => n + (x.summeNetto ?? 0), 0);

  // ---------------------------------------------------------------- Artikel
  const ohneVerkauf = p.articles.filter((x) => x.active && !artikelWerte.some((w2) => w2.id === x.id)).map((x) => x.short_name).sort((x, y) => x.localeCompare(y, "de"));
  const einheit = (id: string) => (gebuehrArtikel.has(id) ? "Monate" : "Stück");
  const detail = artikelDetail(datenP, z, artikelId);
  // Die Monate dazu über dieselben zwölf Monate wie die Umsatzsäulen – ein einzelner Monat
  // sagt über ein Saisongeschäft nichts.
  const detailMonate = artikelDetail(datenP, { von: monate[0] + "-01", bis: z.bis }, artikelId).jeMonat;

  // ---------------------------------------------------------------- Kopf
  const titel = zeitraumTitel(art, z);
  const personName = person ? p.employees.find((x) => x.id === person)?.name ?? "Mitarbeiter" : "Alle Mitarbeiter";
  const quelle = p.darfRechnungen ? "Quelle: Rechnungsbuch" : "Quelle: erledigte Aufträge";

  // ---------------------------------------------------------------- Export
  const datevHinweise = a.betrieb ? datevEinstellungFehler(a.betrieb) : ["Die Betriebsdaten sind noch nicht geladen."];
  function exportDatev() {
    if (!a.betrieb) return;
    const d = datevBuchungsstapel(a.rechnungen, a.betrieb, z, `Rechnungen ${titel}`, new Date());
    if (d.fehler.length) { setExportFehler(d.fehler); return; }
    setExportFehler([]);
    herunterladen(d.dateiname, windows1252(d.inhalt) as BlobPart, "text/csv;charset=windows-1252");
  }
  function exportAnsicht() {
    const zeilen: (string | number | null)[][] =
      reiter === "umsatz" ? [["Monat", "Umsatz netto", "Vorjahr netto"], ...monate.map((m, i) => [monatLang(m), jeMonat[m], jeMonatVJ[monateVJ[i]]])]
      : reiter === "kunden" ? [["Kunde", "Umsatz netto", "Aufträge"], ...umsatzstaerksteKunden(posten, z, p.customers, 10000).map((x) => [x.name, x.netto, x.auftraege])]
      : reiter === "einsatz" ? [["Mitarbeiter", "Stunden", "Termine"], ...e.jePerson.map((x) => [x.name, Math.round((x.minuten / 60) * 100) / 100, x.termine])]
      : reiter === "lager" ? [["Monat", "Belegt am Monatsende", "Vorjahr"], ...monate.map((m, i) => [monatLang(m), verlauf[i], verlaufVJ[i]])]
      : [["Artikel", "Menge", "Einheit", "Umsatz netto"], ...artikelWerte.map((x) => [x.name, x.menge, einheit(x.id), x.umsatzNetto])];
    herunterladen(`Auswertung_${reiter}_${z.von}_${z.bis}.csv`, csv(zeilen), "text/csv;charset=utf-8");
  }

  const pfeil = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
  const monatZeilen = monat ? posten.filter((x) => x.datum.slice(0, 7) === monat).sort((x, y) => x.datum.localeCompare(y.datum)) : [];
  const monatVJ = monat ? verschiebeJahr(monat + "-01", -1).slice(0, 7) : "";

  return (
    <div className="tabpanel active">
      <div className="module-page am-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Auswertungen</h2>
              <span className="lg-unter">{titel} · {quelle}{laedt ? " · lädt …" : ""}</span>
            </div>
            <button type="button" className="kl-neu am-export" onClick={() => { setExportFehler([]); setBlatt("export"); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              Export
            </button>
          </div>
          <div className="am-reiter" role="tablist">
            {REITER.map((r) => (
              <button key={r.wert} type="button" role="tab" aria-selected={reiter === r.wert} className={reiter === r.wert ? "aktiv" : ""} onClick={() => setReiter(r.wert)}>{r.text}</button>
            ))}
          </div>
          <div className="lg-lagerwahl am-zeitraum" role="group" aria-label="Zeitraum">
            {(Object.keys(AUSWERTUNGS_ZEITRAUM_LABEL) as AuswertungsZeitraum[]).map((x) => (
              <button key={x} type="button" className={art === x ? "aktiv" : ""} aria-pressed={art === x}
                onClick={() => { if (x === "frei") { setFreiEntwurf(frei); setBlatt("frei"); } else setArt(x); }}>
                {AUSWERTUNGS_ZEITRAUM_LABEL[x]}
              </button>
            ))}
          </div>
          <div className="pl-filter am-filter">
            <button type="button" className={"pl-pille" + (vergleich ? " aktiv" : "")} aria-pressed={vergleich} onClick={() => setVergleich(!vergleich)}>
              <span className={"am-vgl-punkt" + (vergleich ? " an" : "")} aria-hidden="true" />Vergleich: Vorjahr
            </button>
            {p.employees.length > 0 && (
              <button type="button" className={"pl-pille" + (person ? " aktiv" : "")} onClick={() => setBlatt("person")}>
                {person && <span className="pl-punkt" style={{ background: employeeColorFor(p.employees, person) }} />}
                {personName}{pfeil}
              </button>
            )}
          </div>
        </div>

        {ladeFehler && <div className="hinweis-pflicht">{ladeFehler}</div>}

        {/* ============================================================ UMSATZ */}
        {reiter === "umsatz" && (
          <>
            <div className="am-antwort">
              <span className="am-a-titel">UMSATZ · {titel.toUpperCase()}</span>
              <div className="am-a-zeile"><span className="am-a-wert">{eur0(s.netto)}</span><span className="am-a-unter">netto</span></div>
              {p.darfRechnungen && (
                <span className="am-a-klein">{eur0(s.mitRechnung)} abgerechnet · {eur0(s.ohneRechnung)} ohne Rechnung ({s.ohneAnzahl} {s.ohneAnzahl === 1 ? "Auftrag" : "Aufträge"})</span>
              )}
              {vergleich && (
                <>
                  <Delta jetzt={s.netto} vorher={sVJ.netto} dunkel einheit={eur0(sVJ.netto)} />
                  <span className="am-a-balken"><i>{z.bis.slice(0, 4)}</i><span><b style={{ width: `${(s.netto / Math.max(1, s.netto, sVJ.netto)) * 100}%` }} /></span></span>
                  <span className="am-a-balken vj"><i>{zVJ.bis.slice(0, 4)}</i><span><b style={{ width: `${(sVJ.netto / Math.max(1, s.netto, sVJ.netto)) * 100}%` }} /></span></span>
                  <span className="am-a-klein">Vorjahr: {zeitraumTitel("frei", zVJ)} – bis zum selben Tag</span>
                </>
              )}
            </div>

            <div className="am-kacheln">
              {p.darfRechnungen ? (
                <Kachel titel="Rechnungen" wert={String(s.rechnungen)} unter={s.stornos ? `${s.stornos} storniert` : "aus dem Rechnungsbuch"} />
              ) : (
                <Kachel titel="Erledigte Aufträge" wert={String(k.auftraegeErledigt)} unter={`${k.auftraegeStorniert} storniert`} />
              )}
              <Kachel titel="Ø je Auftrag" wert={k.auftraegeErledigt ? eur0(s.netto / k.auftraegeErledigt) : "–"} unter={`${k.auftraegeErledigt} erledigte Aufträge`} />
              <Kachel titel="Umsatzsteuer" wert={eur0(s.steuer)} unter={`brutto ${eur0(s.brutto)}`} />
              <Kachel titel="Nachlass gegeben" wert={eur0(k.nachlass)} unter="Listenpreis minus Umsatz">
                {vergleich && <Delta jetzt={k.nachlass} vorher={kVJ.nachlass} />}
              </Kachel>
            </div>

            {offene.length > 0 && (
              <button type="button" className="sl-chance am-offen" onClick={() => setBlatt("offen")}>
                <span className="db-punkt-zahl rot">{offene.length}</span>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Erbracht, noch nicht abgerechnet</span>
                  <span className="small">erledigt mit „Rechnung nötig“, ohne Rechnung · {formatEUR(offenSumme)} netto</span>
                </span>
                <span className="db-link">Zeigen ›</span>
              </button>
            )}

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Umsatz je Monat</span><span className="small">Säule antippen</span></div>
              <Saeulen werte={monate.map((m) => jeMonat[m])} vorjahr={vergleich ? monateVJ.map((m) => jeMonatVJ[m]) : null} monate={monate} z={z}
                gewaehlt={blatt === "monat" ? monat : null} onMonat={(m) => { setMonat(m); setBlatt("monat"); }} />
              <div className="am-legende">
                <span><i className="drin" />im Zeitraum</span><span><i />übrige Monate</span>{vergleich && <span><i className="vj" />Vorjahr</span>}
              </div>
              <span className="small am-fuss">Leere Monate stehen mit drin – bei einem Saisongeschäft sind die Lücken die Aussage.</span>
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Woher der Umsatz kommt</span><span className="small">aus erledigten Aufträgen</span></div>
              {artikelSumme <= 0 ? <div className="db-leer">Keine Leistungen im Zeitraum.</div> : (
                <>
                  <div className="am-anteile">{woher.map((x, i) => <span key={x.id} style={{ width: `${(x.umsatzNetto / artikelSumme) * 100}%`, background: WOHER_FARBE[i] }} />)}</div>
                  {woher.map((x, i) => (
                    <div key={x.id} className="am-anteil-zeile">
                      <span className="am-punkt" style={{ background: WOHER_FARBE[i] }} />
                      <span className="am-name">{x.name}</span>
                      <b>{eur0(x.umsatzNetto)}</b>
                      <span className="am-pct">{Math.round((x.umsatzNetto / artikelSumme) * 100)} %</span>
                    </div>
                  ))}
                </>
              )}
              {k.auftraegeLaufkundschaft > 0 && (
                <span className="small am-fuss">davon Laufkundschaft: {eur0(k.umsatzNettoLaufkundschaft)} aus {k.auftraegeLaufkundschaft} {k.auftraegeLaufkundschaft === 1 ? "Barverkauf" : "Barverkäufen"}</span>
              )}
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Je Mitarbeiter</span><span className="small">aus erledigten Aufträgen</span></div>
              {leute.length === 0 ? <div className="db-leer">Keine erledigten Aufträge im Zeitraum.</div> : leute.map((l) => (
                <div key={l.id || "ohne"} className="am-balkenzeile">
                  <div className="am-bz-kopf">
                    <span className="am-punkt rund" style={{ background: l.id ? employeeColorFor(p.employees, l.id) : "var(--frei-linie)" }} />
                    <span className="am-name">{l.name}</span>
                    <span className="small">{l.auftraege} {l.auftraege === 1 ? "Auftrag" : "Aufträge"}</span>
                    <b>{eur0(l.umsatzNetto)}</b>
                  </div>
                  <span className="am-bz-spur"><span style={{ width: `${(l.umsatzNetto / leuteMax) * 100}%`, background: l.id ? employeeColorFor(p.employees, l.id) : "var(--frei-linie)" }} /></span>
                </div>
              ))}
              <span className="small am-fuss">Ein Auftrag mit zwei Technikern zählt bei beiden voll – die Frage ist „woran war jemand beteiligt“.</span>
            </div>
          </>
        )}

        {/* ============================================================ KUNDEN */}
        {reiter === "kunden" && (
          <>
            <div className="am-antwort">
              <span className="am-a-titel">WIEDERKEHR · {w.vorige.art === "fruehjahr" ? "FRÜHJAHR" : "HERBST"} {w.vorige.jahr} → {w.saison.art === "herbst" ? "HERBST" : "FRÜHJAHR"} {w.saison.jahr}</span>
              {w.quote == null ? (
                <span className="am-a-unter">In der vorigen Saison gab es noch keine erledigten Aufträge.</span>
              ) : (
                <>
                  <div className="am-a-zeile"><span className="am-a-wert">{w.quote} %</span><span className="am-a-unter">der Kunden kamen wieder</span></div>
                  <span className="am-a-balken nur"><span><b style={{ width: `${w.quote}%` }} /></span></span>
                  <span className="am-a-klein">{w.wieder} von {w.basis} · {w.ohne.length} noch ohne Termin in dieser Saison</span>
                  {vergleich && wVJ.quote != null && (
                    <span className={"am-delta dunkel " + (w.quote >= wVJ.quote ? "plus" : "minus")}>
                      {w.quote >= wVJ.quote ? "▲" : "▼"} {Math.abs(w.quote - wVJ.quote)} Punkte zum Vorjahr ({wVJ.quote} %)
                    </span>
                  )}
                </>
              )}
              <span className="am-a-klein">Unabhängig vom gewählten Zeitraum. Geplante Termine zählen mit, Laufkundschaft und Einmalkunden nicht.</span>
            </div>

            <div className="am-kacheln">
              <Kachel titel="Kunden bedient" wert={String(k.kundenBedient)} unter="ohne Laufkundschaft">
                {vergleich && <Delta jetzt={k.kundenBedient} vorher={kVJ.kundenBedient} />}
              </Kachel>
              <Kachel titel="Davon neu angelegt" wert={String(neu)} unter="im Zeitraum angelegt" />
              <Kachel titel="Ø Umsatz je Kunde" wert={k.kundenBedient ? eur0(nettoOhneSammel / k.kundenBedient) : "–"} unter={`${k.auftraegeJeKunde.toFixed(1).replace(".", ",")} Aufträge je Kunde`} />
              <Kachel titel="Laufkundschaft" wert={String(k.auftraegeLaufkundschaft)} unter={k.auftraegeLaufkundschaft === 1 ? "Barverkauf" : "Barverkäufe"} />
            </div>

            <div className="db-karte am-regal">
              <div className="db-karte-kopf">
                <span className="db-karte-titel">Absehbar aus dem Regal</span>
                <span className="small">{reifenSaison === "winter" ? "Winterreifen" : "Sommerreifen"} im Lager</span>
              </div>
              {regal.saetze === 0 ? <div className="db-leer">Für diese Saison liegen keine Sätze im Lager.</div> : (
                <>
                  <div className="am-a-zeile hell">
                    <span className="am-a-wert navy">{regal.wertMit != null && regal.wertOhne != null ? `ca. ${eur0(regal.wertMit + regal.wertOhne)}` : `${regal.saetze} Sätze`}</span>
                    <span className="small">{regal.wertMit != null ? `aus ${regal.saetze} Sätzen` : "kein Preis für den Wechsel gepflegt"}</span>
                  </div>
                  <div className="am-anteile"><span style={{ width: `${(regal.mitTermin / regal.saetze) * 100}%`, background: "var(--green)" }} /><span style={{ width: `${(regal.ohneTermin / regal.saetze) * 100}%`, background: "#f3c9b5" }} /></div>
                  <div className="am-regal-zeile">
                    <span className="gruen">{regal.mitTermin} mit Termin{regal.wertMit != null ? ` · ${eur0(regal.wertMit)}` : ""}</span>
                    <span className="orange">{regal.ohneTermin} ohne Termin{regal.wertOhne != null ? ` · ${eur0(regal.wertOhne)}` : ""}</span>
                  </div>
                  <span className="small am-fuss">Satz × heutiger Preis „{wechsel?.short_name ?? "Wechsel"}“ – eine Schätzung, kein Umsatz.</span>
                  {p.onZuSaison && regal.kundenOhneTermin > 0 && (
                    <button type="button" className="am-knopf" onClick={p.onZuSaison}>{regal.kundenOhneTermin} Kunden anrufen – zur Saisonliste</button>
                  )}
                </>
              )}
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Umsatzstärkste Kunden</span><span className="small">im Zeitraum</span></div>
              {top.length === 0 ? <div className="db-leer">Kein Umsatz im Zeitraum.</div> : top.map((x, i) => (
                <button key={x.id} type="button" className="am-listen-zeile" onClick={() => p.onOpenCustomer(x.id)}>
                  <span className="am-rang">{i + 1}</span>
                  <span className="am-lz-text"><b>{x.name}</b><span className="small">{x.auftraege} {x.auftraege === 1 ? "Beleg bzw. Auftrag" : "Belege bzw. Aufträge"}</span></span>
                  <b>{eur0(x.netto)}</b>
                  <span className="am-chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Neu und Bestand</span><span className="small">bediente Kunden je Monat</span></div>
              <div className="am-saeulen klein">
                {neuBestand.map((x) => (
                  <span key={x.monat} className="am-spalte" title={`${monatLang(x.monat)}: ${x.neu} neu, ${x.bestand} Bestand`}>
                    <span className="am-stapel">
                      <span className="neu" style={{ height: `${(x.neu / nbMax) * 100}%` }} />
                      <span className="alt" style={{ height: `${(x.bestand / nbMax) * 100}%` }} />
                    </span>
                    <span className={"am-mon" + (monatImZeitraum(x.monat, z) ? " drin" : "")}>{monatKurz(x.monat)}</span>
                  </span>
                ))}
              </div>
              <div className="am-legende"><span><i className="drin" />neu angelegt</span><span><i className="navy" />Bestandskunde</span></div>
            </div>
          </>
        )}

        {/* ============================================================ EINSATZ */}
        {reiter === "einsatz" && (
          <>
            <div className="am-antwort">
              <span className="am-a-titel">EINSATZZEIT · {titel.toUpperCase()}</span>
              <div className="am-a-zeile"><span className="am-a-wert">{Math.round(e.minuten / 60)} Std.</span><span className="am-a-unter">an {e.tage} Einsatztagen</span></div>
              <span className="am-a-klein">
                {e.tage ? `Ø ${stunden(e.minuten / e.tage)} Std. je Tag` : "–"} · {e.termine ? `Ø ${Math.round(e.minuten / e.termine)} Min. je Termin` : "keine Termine"}
              </span>
              {vergleich && <Delta jetzt={e.minuten} vorher={eVJ.minuten} dunkel einheit={`${Math.round(eVJ.minuten / 60)} Std.`} />}
              <span className="am-a-klein">Zeit beim Kunden laut Termin (von–bis) – ohne Fahrzeit.</span>
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Je Mitarbeiter</span></div>
              {e.jePerson.length === 0 ? <div className="db-leer">Keine erledigten Termine mit Mitarbeiter im Zeitraum.</div> : e.jePerson.map((x) => {
                const umsatz = leute.find((l) => l.id === x.id)?.umsatzNetto ?? 0;
                return (
                  <div key={x.id} className="am-balkenzeile">
                    <div className="am-bz-kopf">
                      <span className="am-punkt rund" style={{ background: employeeColorFor(p.employees, x.id) }} />
                      <span className="am-name">{x.name}</span>
                      <b className="am-gross">{Math.round(x.minuten / 60)} Std.</b>
                    </div>
                    <span className="am-bz-spur"><span style={{ width: `${(x.minuten / eMax) * 100}%`, background: employeeColorFor(p.employees, x.id) }} /></span>
                    <span className="small">{x.termine} Termine · Ø {Math.round(x.minuten / x.termine)} Min.{x.minuten > 0 && umsatz > 0 ? ` · ${eur0(umsatz / (x.minuten / 60))} je Std.` : ""}</span>
                  </div>
                );
              })}
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Wann wir unterwegs sind</span></div>
              <span className="small">Erledigte Termine je Wochentag und Stunde – je dunkler, desto voller.</span>
              <div className="am-raster" style={{ gridTemplateColumns: `28px repeat(${e.raster[0].length}, minmax(0, 1fr))` }}>
                <span />
                {e.raster[0].map((_, h) => <span key={h} className="am-r-stunde">{EINSATZ_RASTER_VON + h}</span>)}
                {e.raster.slice(0, mitSonntag ? 7 : 6).map((zeile, t) => (
                  <RasterZeile key={t} tag={["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][t]} zeile={zeile} max={rMax} />
                ))}
              </div>
              {hinweis && <span className="am-hinweis">{hinweis}</span>}
            </div>

            {(e.ohneEnde > 0 || e.ohneZeit > 0) && (
              <div className="sl-chance am-still">
                <span className="db-punkt-zahl grau">{e.ohneEnde + e.ohneZeit}</span>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Nicht ganz genau</span>
                  <span className="small">
                    {e.ohneEnde > 0 && `${e.ohneEnde} ohne Endzeit (mit ${p.standardDauerMin} Min. gezählt)`}
                    {e.ohneEnde > 0 && e.ohneZeit > 0 && " · "}
                    {e.ohneZeit > 0 && `${e.ohneZeit} ohne Uhrzeit (nicht gezählt)`}
                  </span>
                </span>
              </div>
            )}
          </>
        )}

        {/* ============================================================ LAGER */}
        {reiter === "lager" && (
          <>
            <div className="am-antwort">
              <span className="am-a-titel">BELEGUNG HEUTE</span>
              <div className="am-a-zeile"><span className="am-a-wert">{belegt}</span><span className="am-a-unter">{a.lagerplaetze ? `von ${a.lagerplaetze} Plätzen · ${Math.round((belegt / a.lagerplaetze) * 100)} %` : "Sätze eingelagert"}</span></div>
              {a.lagerplaetze > 0 && <span className="am-a-balken nur"><span><b style={{ width: `${Math.min(100, (belegt / a.lagerplaetze) * 100)}%` }} /></span></span>}
              {ausblick && (
                <span className="am-a-klein">
                  Im Vorjahr {ausblick.zuwachsVorjahr >= 0 ? `kamen im ${monatLang(ausblick.monat).split(" ")[0]} ${ausblick.zuwachsVorjahr} Sätze dazu` : `gingen im ${monatLang(ausblick.monat).split(" ")[0]} ${-ausblick.zuwachsVorjahr} Sätze mehr hinaus als herein`} – das ergäbe {ausblick.erwartet}{a.lagerplaetze ? ` von ${a.lagerplaetze}` : ""}.
                  {a.lagerplaetze > 0 && (ausblick.erwartet > a.lagerplaetze ? " Das reicht nicht." : ausblick.erwartet > a.lagerplaetze * 0.95 ? " Es reicht, aber knapp." : "")}
                </span>
              )}
            </div>

            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Belegung im Verlauf</span><span className="small">am Monatsende</span></div>
              <Saeulen werte={verlauf} vorjahr={vergleich ? verlaufVJ : null} monate={monate} z={z} deckel={a.lagerplaetze || undefined} farbe="navy" />
              <span className="small am-fuss">Ab der ersten Erfassung in PinPoints – was bei der Übernahme schon im Regal lag, steht ab dem Tag der Übernahme drin.</span>
            </div>

            <div className="am-kacheln">
              <Kachel titel="Eingelagert" wert={String(bewegung.ein)} unter="Sätze im Zeitraum" />
              <Kachel titel="Ausgelagert" wert={String(bewegung.aus)} unter="Sätze im Zeitraum" />
              <Kachel titel="Lagergebühr" wert={eur0(gebuehr)} unter="aus erledigten Aufträgen">
                {vergleich && <Delta jetzt={gebuehr} vorher={gebuehrVJ} />}
              </Kachel>
              <Kachel titel="Ø Liegedauer" wert={bewegung.liegedauerMonate != null ? `${String(bewegung.liegedauerMonate).replace(".", ",")} Mon.` : "–"} unter="der im Zeitraum ausgelagerten" />
            </div>

            {lang.length > 0 && (
              <button type="button" className="sl-chance am-lang" onClick={p.onZuLager} disabled={!p.onZuLager}>
                <span className="db-punkt-zahl orange">{lang.length}</span>
                <span className="db-punkt-text">
                  <span className="db-punkt-titel">Langlieger</span>
                  <span className="small">ab {LANGLIEGER_MONATE} Monaten oder {LANGLIEGER_EURO} €{gebuehrPreis != null ? ` · ${eur0(langSumme)} Gebühr aufgelaufen` : ""}</span>
                </span>
                {p.onZuLager && <span className="db-link">Zum Lager ›</span>}
              </button>
            )}
          </>
        )}

        {/* ============================================================ ARTIKEL */}
        {reiter === "artikel" && (
          <>
            <div className="db-karte">
              <div className="db-karte-kopf"><span className="db-karte-titel">Was verkauft wird</span><span className="small">antippen für Einzelheiten</span></div>
              {artikelWerte.length === 0 ? <div className="db-leer">Keine Leistungen im Zeitraum.</div> : artikelWerte.map((x) => {
                const vj = artikelWerteVJ.get(x.id)?.umsatzNetto ?? 0;
                const d = veraenderung(x.umsatzNetto, vj);
                return (
                  <button key={x.id} type="button" className="am-artikel" onClick={() => { setArtikelId(x.id); setBlatt("artikel"); }}>
                    <span className="am-bz-kopf"><span className="am-name">{x.name}</span><b>{eur0(x.umsatzNetto)}</b></span>
                    <span className="am-bz-spur"><span style={{ width: `${(x.umsatzNetto / Math.max(1, artikelWerte[0].umsatzNetto)) * 100}%`, background: "var(--accent)" }} /></span>
                    <span className="am-bz-fuss">
                      <span>{x.menge.toLocaleString("de-DE")} {einheit(x.id)}{artikelSumme > 0 ? ` · ${Math.round((x.umsatzNetto / artikelSumme) * 100)} %` : ""}</span>
                      {vergleich && d != null && <span className={"am-delta " + (d >= 0 ? "plus" : "minus")}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)} % zum Vorjahr</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {ohneVerkauf.length > 0 && <span className="small am-fuss">Ohne Verkauf im Zeitraum: {ohneVerkauf.join(", ")}.</span>}
            <span className="small am-fuss">Bei der Lagergebühr ist die Menge die Zahl der Monate, nicht der Sätze.</span>
          </>
        )}
      </div>

      {/* ============================================================ BLÄTTER */}
      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setBlatt(null)}>
          <div className={"auswahl-blatt" + (blatt === "monat" || blatt === "artikel" || blatt === "offen" ? " am-breit" : "")} onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Auswahl">
            <div className="ab-griff" />

            {blatt === "frei" && (
              <>
                <div className="ab-titel">Zeitraum frei wählen</div>
                <div className="am-frei">
                  <label>Von<input type="date" value={freiEntwurf.von} onChange={(ev) => setFreiEntwurf({ ...freiEntwurf, von: ev.target.value })} /></label>
                  <label>Bis<input type="date" value={freiEntwurf.bis} onChange={(ev) => setFreiEntwurf({ ...freiEntwurf, bis: ev.target.value })} /></label>
                </div>
                <button type="button" className="am-knopf" disabled={!freiEntwurf.von || !freiEntwurf.bis || freiEntwurf.von > freiEntwurf.bis}
                  onClick={() => { setFrei(freiEntwurf); setArt("frei"); setBlatt(null); }}>Übernehmen</button>
              </>
            )}

            {blatt === "person" && (
              <>
                <div className="ab-titel">Mitarbeiter</div>
                {[{ id: "", name: "Alle Mitarbeiter" }, ...p.employees].map((x) => (
                  <button key={x.id || "alle"} type="button" className={"ab-option" + ((person ?? "") === x.id ? " aktiv" : "")} onClick={() => { setPerson(x.id || null); setBlatt(null); }}>
                    <span className="pl-punkt" style={{ background: x.id ? employeeColorFor(p.employees, x.id) : "var(--text)" }} />
                    <span className="ab-text">{x.name}</span>
                    {(person ?? "") === x.id && <span className="ab-haken">✓</span>}
                  </button>
                ))}
                <span className="small">Gilt für Umsatz, Kunden, Einsatz und Artikel: nur Aufträge, an denen der Mitarbeiter beteiligt war.</span>
              </>
            )}

            {blatt === "export" && (
              <>
                <div className="ab-titel">Exportieren</div>
                <span className="small">Zeitraum: {titel} ({zeitraumTitel("frei", z)})</span>
                {p.darfRechnungen ? (
                  <>
                    <button type="button" className="ab-option am-x" disabled={datevHinweise.length > 0} onClick={exportDatev}>
                      <span className="am-x-marke gruen">DATEV</span>
                      <span className="ab-text"><b>DATEV-Buchungsstapel</b><span className="small">für den Steuerberater · SKR{a.betrieb?.datev_skr ?? "03"}, je Kunde ein Debitor</span></span>
                    </button>
                    {datevHinweise.length > 0 && <span className="small am-x-hinweis">Erst in den Betriebsdaten eintragen (Admin → Betriebsdaten → DATEV-Export): {datevHinweise.join(" ")}</span>}
                    {exportFehler.length > 0 && <div className="hinweis-pflicht">{exportFehler.map((f) => <div key={f}>{f}</div>)}</div>}
                    <button type="button" className="ab-option am-x" disabled={!a.betrieb} onClick={() => a.betrieb && herunterladen(`Debitoren_${z.von}_${z.bis}.csv`, debitorenlisteCsv(a.rechnungen, a.betrieb, z), "text/csv;charset=utf-8")}>
                      <span className="am-x-marke blau">CSV</span>
                      <span className="ab-text"><b>Debitorenliste</b><span className="small">Konto, Kundennummer, Name, Anschrift – für die Personenkonten</span></span>
                    </button>
                    <button type="button" className="ab-option am-x" onClick={() => herunterladen(`Rechnungsliste_${z.von}_${z.bis}.csv`, rechnungslisteCsv(a.rechnungen, z), "text/csv;charset=utf-8")}>
                      <span className="am-x-marke blau">CSV</span>
                      <span className="ab-text"><b>Rechnungsliste</b><span className="small">Nummer, Datum, Kunde, netto, Steuer, brutto, Storno</span></span>
                    </button>
                  </>
                ) : (
                  <span className="small">DATEV-Export und Rechnungsliste brauchen das Recht, das Rechnungsbuch zu lesen.</span>
                )}
                <button type="button" className="ab-option am-x" onClick={exportAnsicht}>
                  <span className="am-x-marke grau">CSV</span>
                  <span className="ab-text"><b>Diese Ansicht</b><span className="small">die Zahlen des Reiters „{REITER.find((r) => r.wert === reiter)?.text}“ als Tabelle</span></span>
                </button>
                <span className="small">Die Dateien enthalten Kundennamen – nur an den Steuerberater weitergeben.</span>
              </>
            )}

            {blatt === "offen" && (
              <>
                <div className="ab-titel">Erbracht, noch nicht abgerechnet</div>
                <span className="small">Erledigte Aufträge mit „Rechnung nötig“, aber ohne Rechnung – der Umsatz ist da, steht aber in keinem Rechnungsbuch.</span>
                {offene.map((o) => {
                  const c = p.customers.find((x) => x.id === o.customer_id);
                  return (
                    <div key={o.id} className="am-listen-zeile statisch">
                      <span className="am-lz-text"><b>{(c?.company || "").trim() || c?.name || o.title}</b><span className="small">erledigt {tagDeutsch(o.order_date)} · #{auftragsNr(o.order_number)}</span></span>
                      <b>{formatEUR(summeAuftrag(o).net)}</b>
                      <button type="button" className="am-mini" onClick={() => { setBlatt(null); p.onOpenOrder(o.id); }}>Rechnung</button>
                    </div>
                  );
                })}
              </>
            )}

            {blatt === "monat" && monat && (
              <>
                <div className="am-blatt-kopf"><span className="ab-titel">{monatLang(monat)}</span><b>{eur0(jeMonat[monat] ?? 0)}</b></div>
                <div className="am-felder">
                  <span><i>Aufträge erledigt</i><b>{datenP.orders.filter((o) => o.status === "erledigt" && o.order_date.slice(0, 7) === monat).length}</b></span>
                  <span><i>Rechnungen</i><b>{monatZeilen.filter((x) => x.quelle === "rechnung").length}</b></span>
                  <span><i>Vorjahr</i><b>{(() => { const d = veraenderung(jeMonat[monat] ?? 0, jeMonatVJ[monatVJ] ?? 0); return d == null ? "–" : `${d >= 0 ? "+" : "−"}${Math.abs(d)} %`; })()}</b></span>
                </div>
                {monatZeilen.length === 0 ? <div className="db-leer">In diesem Monat kein Umsatz.</div> : (
                  <div className="am-monat-liste">
                    {monatZeilen.map((x, i) => (
                      <button key={(x.rechnung?.id ?? x.order_id ?? "") + i} type="button" className="am-listen-zeile" disabled={!x.order_id} onClick={() => { if (x.order_id) { setBlatt(null); p.onOpenOrder(x.order_id); } }}>
                        <span className="am-nr">{x.rechnung ? x.rechnung.nummer_text : "ohne"}</span>
                        <span className="am-lz-text">
                          <b>{x.rechnung ? ((x.rechnung.empfaenger?.company || "").trim() || x.rechnung.empfaenger?.name) : ((p.customers.find((c) => c.id === x.customer_id)?.company || "").trim() || p.customers.find((c) => c.id === x.customer_id)?.name || "Auftrag")}</b>
                          <span className="small">{tagDeutsch(x.datum)}{x.quelle === "storno" ? " · Storno" : x.quelle === "ohne" ? " · ohne Rechnung" : ""}</span>
                        </span>
                        <b>{formatEUR(x.netto)}</b>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {blatt === "artikel" && artikelId && (
              <>
                <div className="am-blatt-kopf"><span className="ab-titel">{p.articles.find((x) => x.id === artikelId)?.short_name ?? "Artikel"}</span><b>{eur0(detail.umsatzNetto)}</b></div>
                <div className="am-felder">
                  <span><i>{einheit(artikelId)}</i><b>{detail.menge.toLocaleString("de-DE")}</b></span>
                  <span><i>Kunden</i><b>{detail.kunden}</b></span>
                  <span><i>je Auftrag</i><b>{detail.mengeJeAuftrag.toFixed(1).replace(".", ",")}</b></span>
                </div>
                <span className="am-zwischen">MENGE JE MONAT</span>
                <div className="am-saeulen mini">
                  {detailMonate.map((m) => {
                    const max = Math.max(1, ...detailMonate.map((x) => x.menge));
                    const drin = monatImZeitraum(m.monat, z);
                    return (
                      <span key={m.monat} className="am-spalte" title={`${monatLang(m.monat)}: ${m.menge}`}>
                        <span className="am-paar"><span className={"am-bar" + (drin ? " drin" : "")} style={{ height: `${Math.max(1, (m.menge / max) * 100)}%` }} /></span>
                        <span className={"am-mon" + (drin ? " drin" : "")}>{monatKurz(m.monat)}</span>
                      </span>
                    );
                  })}
                </div>
                <span className="am-zwischen">WER KAUFT</span>
                {detail.jeKunde.length === 0 ? <div className="db-leer">Im Zeitraum nicht verkauft.</div> : detail.jeKunde.slice(0, 10).map((x) => (
                  <button key={x.id} type="button" className="am-listen-zeile" onClick={() => { setBlatt(null); p.onOpenCustomer(x.id); }}>
                    <span className="am-lz-text"><b>{x.name}</b><span className="small">{x.auftraege} {x.auftraege === 1 ? "Auftrag" : "Aufträge"} · zuletzt {x.zuletzt ? tagDeutsch(x.zuletzt) : "–"}</span></span>
                    <b>{x.menge.toLocaleString("de-DE")}×</b>
                  </button>
                ))}
                {detail.jeFahrzeug.length > 0 && (
                  <>
                    <span className="am-zwischen">AN WELCHEM FAHRZEUG</span>
                    {detail.jeFahrzeug.slice(0, 10).map((x) => (
                      <div key={x.id} className="am-listen-zeile statisch">
                        <span className="am-lz-text"><b>{x.bezeichnung}</b><span className="small">{x.auftraege} {x.auftraege === 1 ? "Auftrag" : "Aufträge"}</span></span>
                        <b>{x.menge.toLocaleString("de-DE", { maximumFractionDigits: 1 })}×</b>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RasterZeile({ tag, zeile, max }: { tag: string; zeile: number[]; max: number }) {
  return (
    <>
      <span className="am-r-tag">{tag}</span>
      {zeile.map((v, h) => {
        const stufe = v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5));
        return <span key={h} className={"am-r-zelle s" + stufe} title={`${tag} ${EINSATZ_RASTER_VON + h}–${EINSATZ_RASTER_VON + h + 1} Uhr: ${v} Termine`} />;
      })}
    </>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Blatt } from "@/components/Blatt";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import type { Article, ArticlePrice, Customer, KundenPreis } from "@/lib/types";
import { currentArticlePrice, formatEUR, todayStr } from "@/lib/helpers";
import { kundenName } from "@/lib/kundengruppe";
import { entwurfAus, kundenpreisMaengel, kundenpreisZustand, preiseVonKunde, preisLesen, zeitraumText, type KundenpreisEntwurf } from "@/lib/kundenpreise";
import { kundenpreisAendern, kundenpreisAnlegen, kundenpreisLoeschen } from "@/lib/api/kundenpreise";
import { kundenartikelMaengel, kundenartikelVon, istKundenartikel, type KundenartikelEntwurf } from "@/lib/kundenartikel";
import { kundenartikelAnlegen } from "@/lib/api/kundenartikel";
import { EINHEITEN } from "@/lib/constants";

// „Preise und Artikel“ im Kundenfenster (docs/artikelstammdaten.md „Kundenartikel“ und „Kundenpreise“):
//   - Kundenartikel (Migration 119, v192): eigene Leistungen, die nur bei diesem Kunden (und seiner Kundengruppe) in der
//     Auswahl stehen. Sehen mit „Artikel“ lesen, anlegen und ändern mit „Artikel“ schreiben – bearbeitet wird im selben
//     Fenster wie im Artikelstamm (`artikelEditor` baut die Seite).
//   - Kundenpreise (Migration 118, v191): je Artikel ein eigener Netto-Preis, wahlweise mit Zeitraum; die Datenbank setzt
//     ihn beim Anlegen einer Position ein. Nur mit „Endpreis überschreiben“ – nur dann liest man die Tabelle (RLS).
export function KundenpreiseKarte({ supabase, kunde, kunden, preise, articles, articlePrices, fehlt, darfKundenpreise = true,
  darfArtikel = false, darfArtikelSchreiben = false, artikelEditor, onArtikelAngelegt }: {
  supabase: SupabaseClient;
  kunde: Customer;
  kunden: Customer[];
  preise: KundenPreis[];
  articles: Article[];
  articlePrices: ArticlePrice[];
  // Migration 118 fehlt (die Abfrage scheitert).
  fehlt?: boolean;
  darfKundenpreise?: boolean;
  // Kundenartikel (Migration 119): sehen bzw. anlegen/ändern.
  darfArtikel?: boolean;
  darfArtikelSchreiben?: boolean;
  artikelEditor?: (a: Article, onClose: () => void) => ReactNode;
  onArtikelAngelegt?: () => Promise<void> | void;
}) {
  const [blatt, setBlatt] = useState<KundenPreis | "neu" | null>(null);
  const [kaBlatt, setKaBlatt] = useState<Article | "neu" | null>(null);
  if (kunde.laufkundschaft || (!darfKundenpreise && !darfArtikel)) return null;
  const heute = todayStr();
  const meineArtikel = kundenartikelVon(kunde.id, articles);
  const hauptKunde = kunde.haupt_kunde_id ? kunden.find((k) => k.id === kunde.haupt_kunde_id) ?? null : null;
  const geerbteArtikel = hauptKunde ? kundenartikelVon(hauptKunde.id, articles).filter((a) => a.active) : [];
  const lpVon = (id: string) => currentArticlePrice(articlePrices.filter((p) => p.article_id === id))?.net_price ?? null;
  const artikelTeil = darfArtikel && (
    <>
      <div className="dm-kp-abschnitt">
        <span className="dm-kp-titel">Kundenartikel{meineArtikel.length ? ` (${meineArtikel.length})` : ""}</span>
        {darfArtikelSchreiben && <button type="button" className="db-link" onClick={() => setKaBlatt("neu")}>+ Kundenartikel</button>}
      </div>
      {meineArtikel.length === 0 && geerbteArtikel.length === 0 && (
        <span className="small">Noch keine. Ein Kundenartikel steht nur in Aufträgen dieses Kunden in der Auswahl – etwa ein Flottencheck oder ein Bringservice.</span>
      )}
      {meineArtikel.map((a) => {
        const lp = lpVon(a.id);
        return (
          <button key={a.id} type="button" className={"dm-kp-zeile" + (a.active ? "" : " vorbei")} disabled={!darfArtikelSchreiben || !artikelEditor}
            onClick={() => setKaBlatt(a)}>
            <span className="dm-kp-text">
              <b>{a.short_name}</b>
              <span className="small">Nr. {a.article_number} · {a.long_name}{a.active ? "" : " · inaktiv"}</span>
            </span>
            <span className="dm-kp-preis">
              <b>{lp != null ? formatEUR(Number(lp)) : "kein Preis"}</b>
              <span className="small">je {a.einheit}</span>
            </span>
          </button>
        );
      })}
      {geerbteArtikel.length > 0 && hauptKunde && (
        <div className="dm-kp-geerbt">
          <span className="small">Vom Hauptkunden {kundenName(hauptKunde)} – auch hier wählbar:</span>
          {geerbteArtikel.map((a) => {
            const lp = lpVon(a.id);
            return <span key={a.id} className="small">{a.short_name}{lp != null ? ` ${formatEUR(Number(lp))}` : ""}</span>;
          })}
        </div>
      )}
      {kaBlatt === "neu" && (
        <KundenartikelBlatt supabase={supabase} kunde={kunde} onClose={() => setKaBlatt(null)} onAngelegt={onArtikelAngelegt} />
      )}
      {kaBlatt && kaBlatt !== "neu" && artikelEditor?.(kaBlatt, () => setKaBlatt(null))}
    </>
  );
  if (!darfKundenpreise || fehlt) {
    return (
      <div className="db-karte dm-kp">
        <div className="db-karte-kopf"><span className="db-karte-titel">Preise und Artikel</span></div>
        {artikelTeil}
        {darfKundenpreise && fehlt && <span className="small">Kundenpreise gibt es ab Migration 118 – im Supabase-SQL-Editor ausführen.</span>}
      </div>
    );
  }
  const eigene = preiseVonKunde(kunde.id, preise, articles);
  const haupt = kunde.haupt_kunde_id ? kunden.find((k) => k.id === kunde.haupt_kunde_id) ?? null : null;
  const geerbt = haupt ? preiseVonKunde(haupt.id, preise, articles).filter((p) => kundenpreisZustand(p, heute) !== "vorbei") : [];
  const name = (id: string) => articles.find((a) => a.id === id)?.short_name ?? "(gelöschter Artikel)";
  const liste = (id: string) => currentArticlePrice(articlePrices.filter((p) => p.article_id === id))?.net_price ?? null;

  return (
    <div className="db-karte dm-kp">
      <div className="db-karte-kopf"><span className="db-karte-titel">Preise und Artikel</span></div>
      {artikelTeil}
      <div className="dm-kp-abschnitt">
        <span className="dm-kp-titel">Kundenpreise{eigene.length ? ` (${eigene.length})` : ""}</span>
        <button type="button" className="db-link" onClick={() => setBlatt("neu")}>+ Kundenpreis</button>
      </div>
      {eigene.length === 0 && (
        <span className="small">Noch keine. Ein Kundenpreis ersetzt den Listenpreis, sobald der Artikel in einen Auftrag dieses Kunden kommt.</span>
      )}
      {eigene.map((p) => {
        const z = kundenpreisZustand(p, heute);
        const lp = liste(p.article_id);
        return (
          <button key={p.id} type="button" className={"dm-kp-zeile" + (z === "vorbei" ? " vorbei" : "")} onClick={() => setBlatt(p)}>
            <span className="dm-kp-text">
              <b>{name(p.article_id)}</b>
              <span className="small">{zeitraumText(p)}{z === "vorbei" ? " · abgelaufen" : z === "kommt" ? " · noch nicht gültig" : ""}{p.notiz ? ` · ${p.notiz}` : ""}</span>
            </span>
            <span className="dm-kp-preis">
              <b>{formatEUR(Number(p.net_price))}</b>
              {lp != null && <span className="small">Liste {formatEUR(Number(lp))}</span>}
            </span>
          </button>
        );
      })}
      {geerbt.length > 0 && haupt && (
        <div className="dm-kp-geerbt">
          <span className="small">Vom Hauptkunden {kundenName(haupt)} – gelten hier, wenn kein eigener Kundenpreis da ist:</span>
          {geerbt.map((p) => (
            <span key={p.id} className="small">{name(p.article_id)} {formatEUR(Number(p.net_price))} · {zeitraumText(p)}</span>
          ))}
        </div>
      )}
      {blatt && (
        <KundenpreisBlatt supabase={supabase} kunde={kunde} preis={blatt === "neu" ? null : blatt} preise={preise} articles={articles}
          articlePrices={articlePrices} onClose={() => setBlatt(null)} />
      )}
    </div>
  );
}

function KundenpreisBlatt({ supabase, kunde, preis, preise, articles, articlePrices, onClose }: {
  supabase: SupabaseClient; kunde: Customer; preis: KundenPreis | null; preise: KundenPreis[]; articles: Article[]; articlePrices: ArticlePrice[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [e, setE] = useState<KundenpreisEntwurf>(() => entwurfAus(preis));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const mangel = kundenpreisMaengel(e, kunde.id, preis?.id ?? null, preise, articles);
  const setze = (p: Partial<KundenpreisEntwurf>) => { setFehler(null); setE({ ...e, ...p }); };
  // Wählbar: aktive Artikel außer Reifenverkauf; beim Ändern bleibt der bisherige stehen, auch wenn er inaktiv ist.
  const wahl = articles
    .filter((a) => (a.active && !a.abrechnungsart.startsWith("reifenverkauf") && !istKundenartikel(a)) || a.id === preis?.article_id)
    .slice().sort((a, b) => a.short_name.localeCompare(b.short_name, "de"));
  const art = articles.find((a) => a.id === e.artikelId);
  const lp = e.artikelId ? currentArticlePrice(articlePrices.filter((p) => p.article_id === e.artikelId)) : null;
  const zahl = preisLesen(e.preis);

  async function ausfuehren(was: () => Promise<void>) {
    setLaeuft(true); setFehler(null);
    try {
      await was();
      await queryClient.invalidateQueries({ queryKey: qk.kundenpreise() });
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Blatt titel={preis ? "Kundenpreis ändern" : "Neuer Kundenpreis"} unter={kundenName(kunde)} breite="mittel" ebene="modal-storno" onClose={onClose}
      fuss={<>
        {preis && !loeschenFrage && <button type="button" className="btn-secondary" disabled={laeuft} onClick={() => setLoeschenFrage(true)}>Löschen</button>}
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={laeuft || !!mangel}
          onClick={() => void ausfuehren(() => preis ? kundenpreisAendern(supabase, preis.id, e) : kundenpreisAnlegen(supabase, kunde.id, e))}>
          {laeuft ? "speichert …" : "Speichern"}
        </button>
      </>}>
      <div className="dm-kp-formular">
        <label className="nk-feld"><span>Artikel *</span>
          <select value={e.artikelId} onChange={(ev) => setze({ artikelId: ev.target.value })}>
            <option value="">– wählen –</option>
            {wahl.map((a) => <option key={a.id} value={a.id}>{a.short_name}{a.active ? "" : " (inaktiv)"}</option>)}
          </select>
        </label>
        <label className="nk-feld"><span>Preis netto je {art?.einheit?.trim() || "Einheit"} *</span>
          <input type="text" inputMode="decimal" autoComplete="off" value={e.preis} placeholder={lp ? String(Number(lp.net_price)).replace(".", ",") : "z. B. 20"}
            onChange={(ev) => setze({ preis: ev.target.value.replace(/[^0-9.,]/g, "") })} />
        </label>
        {lp && (
          <span className="small">Listenpreis {formatEUR(Number(lp.net_price))}{zahl != null && zahl < Number(lp.net_price) ? ` · ${formatEUR(Number(lp.net_price) - zahl)} günstiger` : ""}</span>
        )}
        <div className="nk-zeile">
          <label className="nk-feld"><span>Gültig ab (freiwillig)</span><input type="date" value={e.ab} onChange={(ev) => setze({ ab: ev.target.value })} /></label>
          <label className="nk-feld"><span>Gültig bis (freiwillig)</span><input type="date" value={e.bis} onChange={(ev) => setze({ bis: ev.target.value })} /></label>
        </div>
        <label className="nk-feld"><span>Notiz</span>
          <input type="text" value={e.notiz} maxLength={300} placeholder="z. B. Rahmenvertrag 2027" onChange={(ev) => setze({ notiz: ev.target.value })} />
        </label>
        <span className="small">Gilt für neue Leistungen in Aufträgen dieses Kunden{kunde.haupt_kunde_id ? "" : " und seiner Unterdebitoren"} – maßgeblich ist das Datum des Auftrags. Bereits eingetragene Leistungen behalten ihren Preis.</span>
        {mangel && e.artikelId && e.preis && <div className="fi-hinweis fi-info">{mangel}</div>}
        {loeschenFrage && preis && (
          <div className="fi-hinweis fi-warn">
            Diesen Kundenpreis löschen? Leistungen, die ihn schon haben, behalten ihren Preis.
            <div className="pk-knoepfe">
              <button type="button" className="btn-secondary" onClick={() => setLoeschenFrage(false)} disabled={laeuft}>Doch nicht</button>
              <button type="button" className="btn-primary" onClick={() => void ausfuehren(() => kundenpreisLoeschen(supabase, preis.id))} disabled={laeuft}>Löschen</button>
            </div>
          </div>
        )}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

// Neuer Kundenartikel (Migration 119): das Nötigste – Einheit und weitere Preise danach im Artikelfenster.
function KundenartikelBlatt({ supabase, kunde, onClose, onAngelegt }: {
  supabase: SupabaseClient; kunde: Customer; onClose: () => void; onAngelegt?: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [e, setE] = useState<KundenartikelEntwurf>({ kurz: "", lang: "", einheit: "Stück", preis: "", mwst: "19" });
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const mangel = kundenartikelMaengel(e, kunde);
  const setze = (p: Partial<KundenartikelEntwurf>) => { setFehler(null); setE({ ...e, ...p }); };
  async function anlegen() {
    if (mangel) return;
    setLaeuft(true); setFehler(null);
    try {
      await kundenartikelAnlegen(supabase, kunde.id, e);
      await queryClient.invalidateQueries({ queryKey: qk.artikel() });
      await queryClient.invalidateQueries({ queryKey: qk.artikelpreise() });
      await onAngelegt?.();
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <Blatt titel="Neuer Kundenartikel" unter={kundenName(kunde)} breite="mittel" ebene="modal-storno" onClose={onClose}
      fuss={<>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={laeuft}>Abbrechen</button>
        <button type="button" className="btn-primary" disabled={laeuft || !!mangel} onClick={() => void anlegen()}>{laeuft ? "legt an …" : "Anlegen"}</button>
      </>}>
      <div className="dm-kp-formular">
        <label className="nk-feld"><span>Kurzbezeichnung *</span>
          <input type="text" value={e.kurz} maxLength={80} placeholder="z. B. Flottencheck" onChange={(ev) => setze({ kurz: ev.target.value })} />
        </label>
        <label className="nk-feld"><span>Bezeichnung auf der Rechnung *</span>
          <input type="text" value={e.lang} maxLength={200} placeholder="z. B. Flottencheck je Fahrzeug laut Rahmenvertrag" onChange={(ev) => setze({ lang: ev.target.value })} />
        </label>
        <div className="nk-zeile">
          <label className="nk-feld"><span>Preis netto *</span>
            <input type="text" inputMode="decimal" autoComplete="off" value={e.preis} placeholder="z. B. 40" onChange={(ev) => setze({ preis: ev.target.value.replace(/[^0-9.,]/g, "") })} />
          </label>
          <label className="nk-feld"><span>je</span>
            <select value={e.einheit} onChange={(ev) => setze({ einheit: ev.target.value })}>
              {EINHEITEN.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="nk-feld"><span>MwSt. %</span>
            <input type="text" inputMode="decimal" autoComplete="off" value={e.mwst} onChange={(ev) => setze({ mwst: ev.target.value.replace(/[^0-9.,]/g, "") })} />
          </label>
        </div>
        <span className="small">Steht nur in Aufträgen dieses Kunden{kunde.haupt_kunde_id ? "" : " und seiner Unterdebitoren"} in der Auswahl. Die Artikelnummer wird fortlaufend vergeben; Preis ab heute. Weitere Preise, Einheit und „aktiv“ danach über die Zeile.</span>
        {mangel && (e.kurz || e.lang || e.preis) && <div className="fi-hinweis fi-info">{mangel}</div>}
        {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
      </div>
    </Blatt>
  );
}

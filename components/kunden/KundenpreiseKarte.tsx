"use client";

import { useState } from "react";
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

// Kundenpreise im Kundenfenster (Migration 118, v191, docs/artikelstammdaten.md „Kundenpreise“): je Artikel ein eigener
// Netto-Preis, wahlweise mit Zeitraum. Kommt der Artikel in einen Auftrag dieses Kunden, setzt die Datenbank ihn ein.
// Die Karte erscheint nur für Leute mit „Endpreis überschreiben“ – nur sie lesen die Tabelle (RLS).
export function KundenpreiseKarte({ supabase, kunde, kunden, preise, articles, articlePrices, fehlt }: {
  supabase: SupabaseClient;
  kunde: Customer;
  kunden: Customer[];
  preise: KundenPreis[];
  articles: Article[];
  articlePrices: ArticlePrice[];
  // Migration 118 fehlt (die Abfrage scheitert).
  fehlt?: boolean;
}) {
  const [blatt, setBlatt] = useState<KundenPreis | "neu" | null>(null);
  if (kunde.laufkundschaft) return null;
  if (fehlt) {
    return (
      <div className="db-karte dm-kp"><div className="db-karte-kopf"><span className="db-karte-titel">Kundenpreise</span></div>
        <span className="small">Kundenpreise gibt es ab Migration 118 – im Supabase-SQL-Editor ausführen.</span></div>
    );
  }
  const heute = todayStr();
  const eigene = preiseVonKunde(kunde.id, preise, articles);
  const haupt = kunde.haupt_kunde_id ? kunden.find((k) => k.id === kunde.haupt_kunde_id) ?? null : null;
  const geerbt = haupt ? preiseVonKunde(haupt.id, preise, articles).filter((p) => kundenpreisZustand(p, heute) !== "vorbei") : [];
  const name = (id: string) => articles.find((a) => a.id === id)?.short_name ?? "(gelöschter Artikel)";
  const liste = (id: string) => currentArticlePrice(articlePrices.filter((p) => p.article_id === id))?.net_price ?? null;

  return (
    <div className="db-karte dm-kp">
      <div className="db-karte-kopf">
        <span className="db-karte-titel">Kundenpreise{eigene.length ? ` (${eigene.length})` : ""}</span>
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
    .filter((a) => (a.active && !a.abrechnungsart.startsWith("reifenverkauf")) || a.id === preis?.article_id)
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

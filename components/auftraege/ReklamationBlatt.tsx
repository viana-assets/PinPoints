import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, Customer, Order, OrderArticle, ReklamationGrund } from "@/lib/types";
import { Blatt } from "@/components/Blatt";
import { SuchFeld } from "@/components/SuchFeld";
import { CustomerPicker } from "@/components/CustomerPicker";
import { anzeigeName } from "@/lib/kundenAnsicht";
import { kundenartikelKunden } from "@/lib/kundenartikel";
import { formatDate } from "@/lib/format";
import { auftragsNr } from "@/lib/testkunde";
import {
  nummerAusSuche, REKLAMATION_GRUENDE, REKLAMATION_OHNE_BEZUG_MAX, REKLAMATION_TEXT_MAX, reklamationKandidaten, reklamationMaengel,
  type ReklamationEntwurf,
} from "@/lib/reklamation";
import { fetchErledigteAuftraege, fetchErledigtNachNummer, kundenNachKennzeichen } from "@/lib/api/reklamation";

// „Reklamation anlegen“ (Migration 120, v193, docs/auftraege.md „Reklamation“).
//
// Zwei Wege hierher: „+ Auftrag ▾ › Reklamation“ in den Aufträgen (dann wird der Bezugsauftrag gesucht) und „Reklamation zu
// diesem Auftrag“ im Menü eines erledigten Auftrags (dann ist er schon gewählt). Gesucht wird nach Kunde, Kennzeichen oder
// Auftragsnummer; die Auswahl zeigt die erledigten Aufträge des Kunden und seiner Kundengruppe, die jüngsten zuerst – auch
// alte, die in den Aufträgen nicht mehr geladen sind. Ohne Bezugsauftrag (Sonderfall) braucht es den Kunden und eine kurze
// Begründung. Termin, Team und Leistungen kommen wie immer im Auftragsfenster dazu, das sich danach öffnet.

export type ReklamationVorgabe = { order: Order; positionen: OrderArticle[] };

function leistungenKurz(orderId: string, positionen: readonly OrderArticle[], articles: readonly Article[]): string {
  const zeilen = positionen.filter((p) => p.order_id === orderId && !p.deleted_at);
  if (!zeilen.length) return "ohne Leistung";
  return zeilen.map((p) => `${p.quantity > 1 ? p.quantity + "× " : ""}${articles.find((a) => a.id === p.article_id)?.short_name ?? "Leistung"}`).join(" · ");
}

export function ReklamationBlatt({ supabase, customers, articles, vorgabe, onAnlegen, onClose }: {
  supabase: SupabaseClient;
  customers: Customer[];
  articles: Article[];
  vorgabe?: ReklamationVorgabe | null;
  // Legt die Reklamation an und öffnet das Auftragsfenster. Wirft mit Klartext, wenn die Datenbank ablehnt.
  onAnlegen: (e: ReklamationEntwurf) => Promise<void>;
  onClose: () => void;
}) {
  const [modus, setModus] = useState<"auftrag" | "ohne">("auftrag");
  const [suche, setSuche] = useState("");
  const [kundeId, setKundeId] = useState(vorgabe?.order.customer_id ?? "");
  // Der gewählte Bezugsauftrag samt Leistungen, und die Auswahl je Kunde (null = noch nicht geladen).
  const [von, setVon] = useState<ReklamationVorgabe | null>(vorgabe ?? null);
  const [auswahl, setAuswahl] = useState<{ kundeId: string; orders: Order[]; positionen: OrderArticle[] } | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [grund, setGrund] = useState<ReklamationGrund | "">("");
  const [text, setText] = useState("");
  const [ohneBezug, setOhneBezug] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [treffer, setTreffer] = useState<{ fuer: string; nummer: Order | null; kennzeichen: { customer_id: string; license_plate: string }[]; fehler?: string } | null>(null);

  const name = (id: string) => { const c = customers.find((x) => x.id === id); return c ? anzeigeName(c) : "Unbekannter Kunde"; };

  // Auftragsnummer und Kennzeichen fragt die Datenbank – kurz nach dem letzten Tastendruck.
  useEffect(() => {
    const t = suche.trim();
    if (modus !== "auftrag" || (nummerAusSuche(t) == null && t.length < 2)) return;
    let abgebrochen = false;
    const uhr = setTimeout(() => {
      const nr = nummerAusSuche(t);
      Promise.all([nr == null ? Promise.resolve(null) : fetchErledigtNachNummer(supabase, nr), nr == null ? kundenNachKennzeichen(supabase, t) : Promise.resolve([])])
        .then(([nummer, kennzeichen]) => { if (!abgebrochen) setTreffer({ fuer: t, nummer, kennzeichen }); })
        .catch((e) => { if (!abgebrochen) setTreffer({ fuer: t, nummer: null, kennzeichen: [], fehler: e instanceof Error ? e.message : String(e) }); });
    }, 300);
    return () => { abgebrochen = true; clearTimeout(uhr); };
  }, [supabase, suche, modus]);

  const q = suche.trim().toLowerCase();
  const kundenTreffer = q && nummerAusSuche(q) == null
    ? customers.filter((c) => !c.deleted_at && ((c.company || "").toLowerCase().includes(q) || c.name.toLowerCase().includes(q))).slice(0, 6)
    : [];
  const t = treffer && treffer.fuer === suche.trim() ? treffer : null;

  async function kundeWaehlen(id: string) {
    setKundeId(id); setSuche(""); setFehler(null); setLaedt(true);
    try {
      const d = await fetchErledigteAuftraege(supabase, kundenartikelKunden(id, customers));
      setAuswahl({ kundeId: id, ...d });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaedt(false);
    }
  }
  async function nummerWaehlen(o: Order) {
    if (o.status !== "erledigt") return;
    setKundeId(o.customer_id); setSuche(""); setFehler(null); setLaedt(true);
    try {
      const d = await fetchErledigteAuftraege(supabase, kundenartikelKunden(o.customer_id, customers));
      setAuswahl({ kundeId: o.customer_id, ...d });
      setVon({ order: o, positionen: d.positionen.filter((p) => p.order_id === o.id) });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaedt(false);
    }
  }

  const entwurf: ReklamationEntwurf = {
    // Die Reklamation gehört dem Kunden des Bezugsauftrags – bei einer Kundengruppe also dem Unterdebitor, dessen Auto es war.
    kundeId: modus === "auftrag" ? von?.order.customer_id ?? "" : kundeId,
    vonId: modus === "auftrag" ? von?.order.id ?? null : null,
    grund, text, ohneBezug: modus === "ohne" ? ohneBezug : "",
  };
  const mangel = reklamationMaengel(entwurf);

  async function anlegen() {
    if (mangel || laeuft) { setFehler(mangel); return; }
    setLaeuft(true); setFehler(null);
    try {
      await onAnlegen(entwurf);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  const kandidaten = auswahl ? reklamationKandidaten(auswahl.orders) : [];

  return (
    <Blatt titel="Reklamation anlegen" breite="mittel" ebene="modal-bestaetigung" className="rk-blatt" onClose={onClose}
      fuss={<>
        {fehler && <div className="hinweis-pflicht">{fehler}</div>}
        <button type="button" className="btn-primary" disabled={!!mangel || laeuft} onClick={() => void anlegen()} title={mangel ?? undefined}>
          {laeuft ? "Wird angelegt …" : "Reklamation anlegen"}
        </button>
      </>}>
      <p className="bl-hilfe">
        Der Kunde meldet ein Problem nach einer Arbeit von uns. Die Reklamation bekommt einen Termin wie jeder Auftrag – der
        Techniker sieht darin, was damals gemacht wurde.
      </p>

      <div className="lg-lagerwahl rk-modus" role="group" aria-label="Bezug">
        <button type="button" className={modus === "auftrag" ? "aktiv" : ""} aria-pressed={modus === "auftrag"} onClick={() => { setModus("auftrag"); setFehler(null); }}>Zu einem Auftrag</button>
        <button type="button" className={modus === "ohne" ? "aktiv" : ""} aria-pressed={modus === "ohne"} onClick={() => { setModus("ohne"); setFehler(null); }}>Ohne Bezugsauftrag</button>
      </div>

      {modus === "auftrag" && von && (
        <div className="rk-gewaehlt">
          <span className="rk-gewaehlt-text">
            <b>#{auftragsNr(von.order.order_number)} · {formatDate(von.order.order_date)} · {name(von.order.customer_id)}</b>
            <span className="small">{leistungenKurz(von.order.id, von.positionen, articles)}</span>
          </span>
          <button type="button" className="kp-aendern" onClick={() => { setVon(null); if (!auswahl || auswahl.kundeId !== von.order.customer_id) void kundeWaehlen(von.order.customer_id); }}>Anderen wählen</button>
        </div>
      )}

      {modus === "auftrag" && !von && (
        <div className="rk-suche">
          {!auswahl && (
            <>
              <SuchFeld value={suche} onWert={setSuche} placeholder="Kunde, Kennzeichen oder Auftragsnummer …" ariaLabel="Auftrag für die Reklamation suchen" />
              {(q || t) && (
                <div className="kp-liste" role="listbox" aria-label="Treffer">
                  {t?.nummer && (
                    <button type="button" role="option" aria-selected={false} className="kp-treffer" disabled={t.nummer.status !== "erledigt"} onClick={() => void nummerWaehlen(t.nummer!)}>
                      <b>Auftrag #{auftragsNr(t.nummer.order_number)} · {formatDate(t.nummer.order_date)}</b>
                      <span>{name(t.nummer.customer_id)}{t.nummer.status !== "erledigt" ? " · noch nicht erledigt – dafür keine Reklamation" : ""}</span>
                    </button>
                  )}
                  {kundenTreffer.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={false} className="kp-treffer" onClick={() => void kundeWaehlen(c.id)}>
                      <b>{anzeigeName(c)}</b>
                      <span>{c.address}</span>
                    </button>
                  ))}
                  {t?.kennzeichen.map((v) => (
                    <button key={v.customer_id + v.license_plate} type="button" role="option" aria-selected={false} className="kp-treffer" onClick={() => void kundeWaehlen(v.customer_id)}>
                      <b>{v.license_plate}</b>
                      <span>{name(v.customer_id)}</span>
                    </button>
                  ))}
                  {t?.fehler && <div className="kp-leer">{t.fehler}</div>}
                  {t && !t.nummer && !t.kennzeichen.length && !kundenTreffer.length && !t.fehler && <div className="kp-leer">Keine Treffer</div>}
                </div>
              )}
            </>
          )}
          {auswahl && (
            <>
              <div className="rk-kopf">
                <b>{name(auswahl.kundeId)}</b>
                <button type="button" className="kp-aendern" onClick={() => { setAuswahl(null); setKundeId(""); }}>Anderer Kunde</button>
              </div>
              {kandidaten.length === 0 && <div className="kp-leer">Für diesen Kunden gibt es keinen erledigten Auftrag. Dann „Ohne Bezugsauftrag“ wählen.</div>}
              {kandidaten.length > 0 && (
                <div className="kp-liste rk-auftraege" role="listbox" aria-label="Erledigte Aufträge">
                  {kandidaten.map((o) => (
                    <button key={o.id} type="button" role="option" aria-selected={false} className="kp-treffer"
                      onClick={() => setVon({ order: o, positionen: auswahl.positionen.filter((p) => p.order_id === o.id) })}>
                      <b>#{auftragsNr(o.order_number)} · {formatDate(o.order_date)}{o.customer_id !== auswahl.kundeId ? ` · ${name(o.customer_id)}` : ""}</b>
                      <span>{leistungenKurz(o.id, auswahl.positionen, articles)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {laedt && <span className="small">Lädt die erledigten Aufträge …</span>}
        </div>
      )}

      {modus === "ohne" && (
        <>
          <CustomerPicker customers={customers.filter((c) => !c.deleted_at)} value={kundeId} onChange={setKundeId} />
          <label className="nk-feld">
            <span>Warum gibt es keinen Bezugsauftrag? *</span>
            <textarea rows={2} maxLength={REKLAMATION_OHNE_BEZUG_MAX} value={ohneBezug} onChange={(e) => setOhneBezug(e.target.value)}
              placeholder="z. B. Arbeit vor Einführung der App" />
          </label>
        </>
      )}

      <div className="nk-feld">
        <span>Grund *</span>
        <div className="pl-filter rk-gruende" role="group" aria-label="Grund der Reklamation">
          {REKLAMATION_GRUENDE.map((g) => (
            <button key={g.wert} type="button" className={"pl-pille" + (grund === g.wert ? " aktiv" : "")} aria-pressed={grund === g.wert} onClick={() => setGrund(g.wert)}>{g.text}</button>
          ))}
        </div>
      </div>
      <label className="nk-feld">
        <span>Was sagt der Kunde?</span>
        <textarea rows={3} maxLength={REKLAMATION_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Lenkrad vibriert ab 100 km/h" />
      </label>
    </Blatt>
  );
}

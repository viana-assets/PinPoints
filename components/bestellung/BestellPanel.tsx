"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { BestellStatus, Bestellwunsch, Customer, Employee, Firmenfahrzeug, Order } from "@/lib/types";
import {
  bestellListeText, bestellPlusText, bestellSortierung, bestellWer, bestellZahlen, BESTELL_FUER_LABEL, BESTELL_GRENZEN,
  BESTELL_STATUS_LABEL, darfAendern, istMeiner, type BestellFilter,
} from "@/lib/bestellung";
import { bestellPlusSetzen, bestellStandSetzen, bestellwunschLoeschen } from "@/lib/api/bestellungen";
import { useBestellFotoLinks } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { anzeigeName } from "@/lib/kundenAnsicht";
import { auftragsNr } from "@/lib/testkunde";
import { formatDate } from "@/lib/helpers";
import { Blatt } from "@/components/Blatt";
import { bezugBestellwunsch, type ChatBezug } from "@/lib/chat";

// Die Seite „Bestellliste“ (Migration 104, v173, Mockup_Bestellliste_v1). Für alle mit „Bestellliste sehen“:
// eigene Einträge ändern/löschen, solange offen, bei fremden „+1 – brauche ich auch“. Wer verwalten darf
// (ab Werk der Admin), setzt den Stand: bestellt (mit Lieferant/Notiz, auch für mehrere auf einmal), da,
// nicht nötig (mit Grund), zurück auf offen – und kopiert die Liste für die Mail an den Lieferanten.
// Die Regeln selbst stehen in der Datenbank (`bestellwunsch_pruefen()`); hier erscheinen nur Knöpfe, die wirken.
const FILTER: { wert: BestellFilter; text: string }[] = [
  { wert: "offen", text: "Offen" }, { wert: "bestellt", text: "Bestellt" }, { wert: "da", text: "Da" },
  { wert: "nicht_noetig", text: "Nicht nötig" }, { wert: "alle", text: "Alle" },
];

export function BestellPanel(p: {
  supabase: SupabaseClient;
  ich: string | null;
  verwalter: boolean;
  darfSchreiben: boolean;
  wuensche: Bestellwunsch[];
  laedt: boolean;
  fehler: string | null;
  employees: Employee[];
  kunden: Customer[];
  orders: Order[];
  transporter: Firmenfahrzeug[];
  // Aus einer Push-Meldung: diesen Eintrag zeigen und kurz hervorheben.
  hervor?: string | null;
  onNeu: () => void;
  onBearbeiten: (w: Bestellwunsch) => void;
  onOpenOrder: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  // Seit v174 (Migration 105): einen Eintrag als Karte in den Chat – wie einen Auftrag.
  onInDenChat?: (b: ChatBezug) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<BestellFilter>("offen");
  const [nurMeine, setNurMeine] = useState(!p.verwalter);
  const [markiert, setMarkiert] = useState<Set<string>>(new Set());
  const [blatt, setBlatt] = useState<{ art: "bestellt" | "nicht"; ids: string[] } | null>(null);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fotoGross, setFotoGross] = useState<string | null>(null);

  // Aus der Push-Meldung: den richtigen Filter wählen, damit der Eintrag zu sehen ist.
  // Solange niemand selbst umschaltet, gilt der Filter des hervorgehobenen Eintrags.
  const hervorWunsch = p.hervor ? p.wuensche.find((w) => w.id === p.hervor) ?? null : null;
  const [hervorGesehen, setHervorGesehen] = useState<string | null>(null);
  const hervorAktiv = !!hervorWunsch && hervorGesehen !== hervorWunsch.id;
  const filterJetzt: BestellFilter = hervorAktiv ? hervorWunsch!.status : filter;
  const nurMeineJetzt = hervorAktiv ? false : nurMeine;
  const hervorId = hervorAktiv ? hervorWunsch!.id : null;
  useEffect(() => {
    if (!hervorId) return;
    const t = setTimeout(() => document.getElementById("bw-" + hervorId)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, [hervorId]);

  const basis = nurMeineJetzt ? p.wuensche.filter((w) => istMeiner(w, p.ich)) : p.wuensche;
  const zahlen = bestellZahlen(basis);
  const sichtbar = basis.filter((w) => filterJetzt === "alle" || w.status === filterJetzt).sort(bestellSortierung);
  const markierteWuensche = sichtbar.filter((w) => markiert.has(w.id));
  const fotoPfade = sichtbar.map((w) => w.foto_pfad).filter((x): x is string => !!x);
  const links = useBestellFotoLinks(p.supabase, fotoPfade, fotoPfade.length > 0).data ?? {};

  // Seit v174 (Migration 105) der Name aus der Anmeldung – vorher stand bei Zugängen ohne Mitarbeiter „Büro“.
  const wer = (w: Bestellwunsch) => (p.ich && w.erstellt_von === p.ich ? "dir" : bestellWer(w, p.employees));
  const fuerText = (w: Bestellwunsch) => {
    if (w.fuer !== "transporter") return BESTELL_FUER_LABEL[w.fuer];
    const t = p.transporter.find((x) => x.id === w.firmenfahrzeug_id);
    return t ? t.bezeichnung?.trim() || t.kennzeichen : "Transporter";
  };

  async function ausfuehren(arbeit: () => Promise<void>, erfolg: string) {
    setLaeuft(true);
    setFehler(null);
    try {
      await arbeit();
      await queryClient.invalidateQueries({ queryKey: qk.bestellungen() });
      setMeldung(erfolg);
      setTimeout(() => setMeldung(null), 2600);
      return true;
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLaeuft(false);
    }
  }

  async function standSetzen(ids: string[], status: BestellStatus, zusatz: { notiz?: string | null; grund?: string | null } = {}) {
    const ok = await ausfuehren(() => bestellStandSetzen(p.supabase, ids, status, zusatz),
      `${ids.length === 1 ? "1 Eintrag" : `${ids.length} Einträge`}: ${BESTELL_STATUS_LABEL[status]}`);
    if (ok) {
      setMarkiert((m) => { const n = new Set(m); ids.forEach((i) => n.delete(i)); return n; });
      setBlatt(null);
      setEingabe("");
    }
  }

  async function kopieren() {
    const liste = markierteWuensche.length ? markierteWuensche : sichtbar.filter((w) => w.status === "offen");
    const text = bestellListeText(liste);
    if (!text) { setMeldung("Nichts zum Kopieren."); return; }
    try {
      await navigator.clipboard.writeText(text);
      setMeldung(`${liste.length} ${liste.length === 1 ? "Zeile" : "Zeilen"} kopiert – in die Mail an den Lieferanten einfügen.`);
    } catch {
      setMeldung("Kopieren ging nicht – bitte von Hand markieren.");
    }
    setTimeout(() => setMeldung(null), 3500);
  }

  function umschalten(id: string) {
    setMarkiert((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div className="tabpanel active">
      <div className="module-page bw-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Bestellliste</h2>
              <span className="lg-unter">Was fehlt – frei eingetragen{p.verwalter ? "; den Stand setzt du" : "; bestellt wird im Büro"}</span>
            </div>
            <span className="bw-kopf-knoepfe">
              {p.verwalter && <button type="button" className="es-knopf" onClick={() => void kopieren()}>{markiert.size ? "Markierte kopieren" : "Liste kopieren"}</button>}
              {p.darfSchreiben && (
                <button type="button" className="kl-neu" onClick={p.onNeu}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Was fehlt?
                </button>
              )}
            </span>
          </div>
          <div className="pl-filter" role="group" aria-label="Stand">
            {FILTER.map((f) => (
              <button key={f.wert} type="button" className={"pl-pille" + (filterJetzt === f.wert ? " aktiv" : "")} aria-pressed={filterJetzt === f.wert}
                onClick={() => { setFilter(f.wert); setNurMeine(nurMeineJetzt); setHervorGesehen(hervorWunsch?.id ?? null); setMarkiert(new Set()); }}>
                {f.text}<span className="op-zahl">{zahlen[f.wert]}</span>
              </button>
            ))}
            <button type="button" className={"pl-pille" + (nurMeineJetzt ? " aktiv" : "")} aria-pressed={nurMeineJetzt}
              onClick={() => { setFilter(filterJetzt); setNurMeine(!nurMeineJetzt); setHervorGesehen(hervorWunsch?.id ?? null); }}>Nur meine</button>
          </div>
        </div>

        {meldung && <div className="bw-meldung" role="status">{meldung}</div>}
        {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}
        {p.fehler && <div className="hinweis-pflicht" role="alert">{p.fehler}</div>}

        {p.laedt && <div className="db-karte"><div className="db-leer">lädt …</div></div>}
        {!p.laedt && sichtbar.length === 0 && (
          <div className="db-karte"><div className="db-leer">
            {p.wuensche.length === 0 ? "Noch nichts eingetragen. Fehlt etwas, oben auf „Was fehlt?“." : "Nichts in dieser Ansicht."}
          </div></div>
        )}

        <div className="bw-liste">
          {sichtbar.map((w) => {
            const meinPlus = !!p.ich && w.plus.includes(p.ich);
            const eigen = !!p.ich && w.erstellt_von === p.ich;
            const kunde = w.kunde_id ? p.kunden.find((k) => k.id === w.kunde_id) : null;
            const auftrag = w.auftrag_id ? p.orders.find((o) => o.id === w.auftrag_id) : null;
            const waehlbar = p.verwalter && w.status === "offen";
            return (
              <div key={w.id} id={"bw-" + w.id} className={"db-karte bw-karte" + (w.id === hervorId ? " hervor" : "") + (w.dringend && w.status === "offen" ? " dringend" : "")}>
                <div className="bw-zeile">
                  {waehlbar && (
                    <button type="button" className={"bw-box" + (markiert.has(w.id) ? " an" : "")} aria-pressed={markiert.has(w.id)}
                      aria-label="Für Sammelaktion markieren" onClick={() => umschalten(w.id)}>{markiert.has(w.id) ? "✓" : ""}</button>
                  )}
                  <div className="bw-text">
                    <b>{w.text}{w.menge ? <span className="bw-menge"> · {w.menge}</span> : null}</b>
                    <span className="small">
                      {fuerText(w)} · von <b className="bw-wer">{wer(w)}</b> · {formatDate(w.created_at.slice(0, 10))}
                      {bestellPlusText(w, p.ich) ? ` · ${bestellPlusText(w, p.ich)}` : ""}
                    </span>
                    {(kunde || auftrag) && (
                      <span className="bw-bezug">
                        {kunde && <button type="button" className="bw-link" onClick={() => p.onOpenCustomer(kunde.id)}>{anzeigeName(kunde)}</button>}
                        {auftrag && <button type="button" className="bw-link" onClick={() => p.onOpenOrder(auftrag.id)}>Auftrag #{auftragsNr(auftrag.order_number)} · {formatDate(auftrag.order_date)}</button>}
                      </span>
                    )}
                    {w.status === "bestellt" && w.notiz && <span className="small bw-notiz">Bestellt: {w.notiz}</span>}
                    {w.status === "da" && <span className="small bw-notiz">Da{w.status_am ? ` seit ${formatDate(w.status_am.slice(0, 10))}` : ""}{w.notiz ? ` · ${w.notiz}` : ""}</span>}
                    {w.status === "nicht_noetig" && w.grund && <span className="small bw-notiz">Nicht nötig: {w.grund}</span>}
                  </div>
                  <span className="bw-marken">
                    {w.dringend && w.status === "offen" && <span className="bw-pille dringend">dringend</span>}
                    <span className={"bw-pille " + w.status}>{BESTELL_STATUS_LABEL[w.status]}</span>
                  </span>
                  {w.foto_pfad && (
                    <button type="button" className="bw-daumen" onClick={() => setFotoGross(w.foto_pfad)} aria-label="Foto groß">
                      {links[w.foto_pfad] ? <img src={links[w.foto_pfad]} alt="" loading="lazy" /> : <span>📷</span>}
                    </button>
                  )}
                </div>
                <div className="bw-aktionen">
                  {p.verwalter && w.status === "offen" && <>
                    <button type="button" className="es-knopf" disabled={laeuft} onClick={() => { setEingabe(""); setBlatt({ art: "nicht", ids: [w.id] }); }}>Nicht nötig</button>
                    <button type="button" className="es-knopf bw-haupt" disabled={laeuft} onClick={() => { setEingabe(""); setBlatt({ art: "bestellt", ids: [w.id] }); }}>Bestellt</button>
                  </>}
                  {p.verwalter && w.status === "bestellt" && <>
                    <button type="button" className="es-knopf" disabled={laeuft} onClick={() => void standSetzen([w.id], "offen")}>Zurück auf offen</button>
                    <button type="button" className="es-knopf bw-haupt" disabled={laeuft} onClick={() => void standSetzen([w.id], "da")}>Ist da</button>
                  </>}
                  {p.verwalter && (w.status === "da" || w.status === "nicht_noetig") && (
                    <button type="button" className="es-knopf" disabled={laeuft} onClick={() => void standSetzen([w.id], "offen")}>Zurück auf offen</button>
                  )}
                  {darfAendern(w, p.ich, p.verwalter) && (w.status === "offen" || p.verwalter) && <>
                    <button type="button" className="es-knopf" disabled={laeuft} onClick={() => p.onBearbeiten(w)}>Ändern</button>
                    <button type="button" className="es-knopf" disabled={laeuft}
                      onClick={() => { if (window.confirm(`„${w.text}“ von der Bestellliste löschen?`)) void ausfuehren(() => bestellwunschLoeschen(p.supabase, w), "Gelöscht."); }}>Löschen</button>
                  </>}
                  {p.onInDenChat && (
                    <button type="button" className="es-knopf" onClick={() => p.onInDenChat!(bezugBestellwunsch(w, {
                      fuer: fuerText(w), von: bestellWer(w, p.employees),
                      stand: BESTELL_STATUS_LABEL[w.status] + (w.dringend && w.status === "offen" ? ", dringend" : ""),
                    }))}>In den Chat</button>
                  )}
                  {p.darfSchreiben && !eigen && p.ich && (w.status === "offen" || w.status === "bestellt") && (
                    <button type="button" className={"es-knopf" + (meinPlus ? " bw-plus-an" : "")} disabled={laeuft} aria-pressed={meinPlus}
                      onClick={() => void ausfuehren(() => bestellPlusSetzen(p.supabase, w.id, p.ich!, !meinPlus), meinPlus ? "„+1“ zurückgenommen." : "„+1“ vermerkt.")}>
                      {meinPlus ? "✓ brauche ich auch" : "+1 brauche ich auch"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {p.verwalter && markiert.size > 0 && (
          <div className="bw-sammel" role="region" aria-label="Sammelaktion">
            <b>{markiert.size} markiert</b>
            <button type="button" className="es-knopf" onClick={() => setMarkiert(new Set())}>Auswahl aufheben</button>
            <button type="button" className="es-knopf bw-haupt" disabled={laeuft}
              onClick={() => { setEingabe(""); setBlatt({ art: "bestellt", ids: [...markiert] }); }}>Als bestellt markieren …</button>
          </div>
        )}
      </div>

      {blatt && (
        <Blatt titel={blatt.art === "bestellt" ? (blatt.ids.length === 1 ? "Bestellt" : `${blatt.ids.length} als bestellt markieren`) : "Nicht nötig"}
          unter={blatt.art === "bestellt" ? "Lieferant oder Notiz – freiwillig, sieht auch der Techniker." : "Kurzer Grund – der Techniker bekommt ihn als Meldung."}
          ebene="modal-bestaetigung" onClose={() => { if (!laeuft) setBlatt(null); }}
          fuss={<button type="button" className="am-knopf" disabled={laeuft || (blatt.art === "nicht" && eingabe.trim().length < BESTELL_GRENZEN.grundMin)}
            onClick={() => void (blatt.art === "bestellt"
              ? standSetzen(blatt.ids, "bestellt", { notiz: eingabe.trim() || null })
              : standSetzen(blatt.ids, "nicht_noetig", { grund: eingabe.trim() }))}>
            {laeuft ? "speichert …" : blatt.art === "bestellt" ? "Als bestellt markieren" : "Nicht nötig"}</button>}>
          <label className="nk-feld"><span>{blatt.art === "bestellt" ? "Lieferant / Notiz" : "Grund *"}</span>
            <input type="text" value={eingabe} maxLength={BESTELL_GRENZEN.notiz} autoFocus
              placeholder={blatt.art === "bestellt" ? "z. B. Würth, Lieferung Do" : "z. B. liegt noch im Lager"} onChange={(e) => setEingabe(e.target.value)} />
          </label>
          {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}
        </Blatt>
      )}

      {fotoGross && (
        <div className="modal-overlay auswahl-overlay modal-storno bw-foto-gross" onClick={() => setFotoGross(null)} role="dialog" aria-label="Foto zur Bestellung">
          {links[fotoGross] ? <img src={links[fotoGross]} alt="Foto zur Bestellung" /> : <span className="bw-foto-laedt">Foto lädt …</span>}
        </div>
      )}
    </div>
  );
}

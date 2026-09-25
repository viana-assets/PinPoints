import { useState } from "react";
import type { Customer, Order } from "@/lib/types";
import { KUNDEN_FILTER, type KundenFilter } from "@/lib/constants";
import { getPhoneNumbers, type KundenZustand } from "@/lib/helpers";
import { anzeigeName, initialen, nachBuchstaben } from "@/lib/kundenAnsicht";
import { plzVorschlaege } from "@/lib/saisonAnsicht";
import { datumKurz } from "@/lib/dashboard";
import { IconNavPin } from "@/components/icons";
import { CustomerRowMeta } from "./CustomerRowMeta";

// Die Kundenliste (26.09.2026, Entwurf „J · Kundenliste") – vorher als Block direkt in
// app/page.tsx: Suchfeld, sieben Filterknöpfe, PLZ-Eingabe und eine Buchstabenleiste über vier
// Zeilen, darunter schmale Zeilen mit einem kleinen Punkt.
//
// Jetzt im Stil von Einsatzplanung, Lager und Saisonliste: eine Bedienleiste, die beim Scrollen
// stehen bleibt (Suche, Zustand als Pillen mit Farbpunkt wie die Nadeln auf der Karte, Gebiet
// und A–Z als Blätter), darunter die Kunden nach Anfangsbuchstaben in weißen Karten. Gefiltert,
// gezählt und sortiert wird weiterhin in app/page.tsx über den ganzen Bestand – hier wird nur
// gezeichnet. Die Karte daneben bleibt, wie sie ist.

// Welche Farbe der Kreis vor dem Namen hat – dieselben Zustände wie die Nadel (`.dot.*`).
const KREIS: Record<KundenZustand | "gray", string> = {
  red: "red", green: "green", wiedervorlage: "wiedervorlage", termin: "termin",
  "kein-interesse": "kein-interesse", laufkundschaft: "laufkundschaft", einmalkunde: "einmalkunde", gray: "gray",
};
const FILTER_PUNKT: Partial<Record<KundenFilter, string>> = {
  offen: "red", wiedervorlage: "wiedervorlage", termin: "termin", ok: "green", kein_interesse: "kein-interesse", nogeo: "gray",
};

export function KundenListePanel(p: {
  sichtbar: Customer[];
  gesamtTreffer: number;
  onMehr: () => void;
  schritt: number;
  gesamtKunden: number;
  search: string;
  onSearch: (s: string) => void;
  filter: KundenFilter;
  onFilter: (f: KundenFilter) => void;
  filterZahlen: Record<KundenFilter, number>;
  plz: string;
  onPlz: (p: string) => void;
  buchstabe: string | null;
  onBuchstabe: (b: string | null) => void;
  buchstaben: string[];
  // Grundlage der Gebietsvorschläge: alle aktiven Kunden, nicht die gefilterten – sonst
  // schrumpfen die Vorschläge mit jedem Filter mit.
  alleKunden: Customer[];
  zustand: (c: Customer) => KundenZustand;
  naechsterTermin: (c: Customer) => Order | null;
  rowDisplay: "datum" | "status" | "tage";
  istOffline: boolean;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
  onNavigate: (e: React.MouseEvent, c: Customer) => void;
  onCall: (e: React.MouseEvent, c: Customer) => void;
  onNeu?: () => void;
}) {
  const [blatt, setBlatt] = useState<null | "gebiet" | "az">(null);
  const [plzEingabe, setPlzEingabe] = useState("");
  const gruppen = nachBuchstaben(p.sichtbar);
  const rueckrufe = p.filterZahlen.rueckruf;

  function status(c: Customer, farbe: KundenZustand | "gray"): string {
    if (farbe === "gray") return "Ohne Karte";
    if (farbe === "termin") {
      const t = p.naechsterTermin(c);
      return t ? `Termin ${datumKurz(t.order_date)}${t.time ? " " + t.time.slice(0, 5) : ""}` : "Termin";
    }
    if (farbe === "wiedervorlage") return c.wiedervorlage_am ? `Wiedervorlage ${datumKurz(c.wiedervorlage_am)}` : "Wiedervorlage";
    if (farbe === "red") return c.wiedervorlage_am ? `Rückruf seit ${datumKurz(c.wiedervorlage_am)}` : "Offen";
    if (farbe === "green") return "Kontaktiert";
    if (farbe === "kein-interesse") return "Kein Interesse";
    if (farbe === "laufkundschaft") return "Laufkundschaft";
    return "Einmalkunde";
  }

  return (
    <div className="tabpanel active">
      <div className="kl-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Kunden</h2>
              <span className="lg-unter">{p.gesamtKunden} Kunden{p.filterZahlen.offen ? ` · ${p.filterZahlen.offen} offen` : ""}</span>
            </div>
            {p.onNeu && (
              <button type="button" className="kl-neu" onClick={p.onNeu}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Neu
              </button>
            )}
          </div>
          <label className="lg-suchfeld">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Name, Firma, Adresse …" value={p.search}
              onChange={(e) => p.onSearch(e.target.value)} aria-label="Kunde suchen" />
          </label>
          {/* Die Zahl steht an JEDER Pille, nicht nur an der aktiven: So sieht man, was ein Klick
              bringen würde, bevor man klickt. */}
          <div className="pl-filter" role="group" aria-label="Zustand">
            {KUNDEN_FILTER.map(({ wert, text }) => (
              <button key={wert} type="button" className={"pl-pille" + (p.filter === wert ? " aktiv" : "")}
                aria-pressed={p.filter === wert} onClick={() => p.onFilter(wert)}>
                {FILTER_PUNKT[wert] && <span className={`dot ${FILTER_PUNKT[wert]} kl-punkt`} aria-hidden="true" />}
                {text}<span className="op-zahl">{p.filterZahlen[wert]}</span>
              </button>
            ))}
          </div>
          <div className="kl-zeile2">
            <button type="button" className={"pl-pille" + (p.plz ? " aktiv" : "")} onClick={() => { setPlzEingabe(p.plz); setBlatt("gebiet"); }}>
              {p.plz ? `PLZ ${p.plz} …` : "Gebiet"} <span aria-hidden="true">▾</span>
            </button>
            <button type="button" className={"pl-pille" + (p.buchstabe ? " aktiv" : "")} onClick={() => setBlatt("az")}>
              {p.buchstabe ? `Buchstabe ${p.buchstabe}` : "A–Z"} <span aria-hidden="true">▾</span>
            </button>
          </div>
        </div>

        {/* Rückrufe: die Frage, mit der ein Bürotag anfängt. Antippen zeigt genau diese Kunden
            (eigener Filter „rueckruf", dieselbe Regel wie im Dashboard). */}
        {p.filter === "rueckruf" ? (
          <div className="lg-hinweis kl-rueckruf-an">
            <span>Nur fällige Rückrufe · {rueckrufe}</span>
            <button type="button" onClick={() => p.onFilter("all")}>Alle zeigen ✕</button>
          </div>
        ) : rueckrufe > 0 && !p.search.trim() && (
          <button type="button" className="kl-rueckruf" onClick={() => p.onFilter("rueckruf")}>
            <span className="kl-rueckruf-zahl">{rueckrufe}</span>
            <span className="db-punkt-text">
              <b>{rueckrufe === 1 ? "Rückruf heute fällig" : "Rückrufe heute fällig"}</b>
              <span>Wiedervorlagen bis heute · antippen zeigt sie</span>
            </span>
            <span className="db-pfeil" aria-hidden="true">›</span>
          </button>
        )}

        {p.gesamtTreffer === 0 && (
          <div className="db-karte">
            <div className="db-leer">
              {p.istOffline
                ? "Offline und kein gespeicherter Stand vorhanden – bitte einmal mit Netz öffnen."
                : "Keine Kunden gefunden."}
            </div>
          </div>
        )}

        {gruppen.map((g, gi) => (
          <div key={g.buchstabe + gi} className="kl-gruppe">
            <span className="kl-buchstabe">{g.buchstabe}</span>
            <div className="kl-karte">
              {g.kunden.map((c) => {
                const farbe: KundenZustand | "gray" = c.lat == null ? "gray" : p.zustand(c);
                const titel = anzeigeName(c);
                const firma = !!(c.company || "").trim();
                return (
                  <div key={c.id} className="kl-zeile" onMouseEnter={() => p.onHover(c.id)} onMouseLeave={() => p.onHover(null)}>
                    <span className={`kl-kreis ${KREIS[farbe]}`} aria-hidden="true">{initialen(titel)}</span>
                    <button type="button" className="kl-text" onClick={() => { p.onHover(null); p.onOpen(c.id); }}>
                      <span className="kl-name">{titel}{c.testkunde && <span className="test-marke">TEST</span>}</span>
                      <span className="kl-adresse">{[firma ? c.name : null, c.address].filter(Boolean).join(" · ")}</span>
                      <span className="kl-meta">
                        <span className={`kl-status ${KREIS[farbe]}`}>{status(c, farbe)}</span>
                        {c.lat != null && p.rowDisplay !== "status" && <CustomerRowMeta customer={c} rowDisplay={p.rowDisplay} />}
                      </span>
                    </button>
                    {/* Hinfahren und anrufen direkt aus der Liste: die beiden Handlungen, die im
                        Außendienst auf eine Kundenzeile folgen. */}
                    {c.address.trim() && (
                      <button type="button" className="kl-rund nav" title="Navigation starten (Google Maps / Apple Karten)" aria-label="Navigation"
                        onClick={(e) => p.onNavigate(e, c)}>
                        <IconNavPin />
                      </button>
                    )}
                    {getPhoneNumbers(c).length > 0 && (
                      <button type="button" className="kl-rund anruf" title="Anrufen" aria-label="Anrufen" onClick={(e) => p.onCall(e, c)}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {p.gesamtTreffer > p.sichtbar.length && (
          <div className="listen-mehr">
            <span>{p.sichtbar.length} von {p.gesamtTreffer} Kunden</span>
            <button type="button" onClick={p.onMehr}>
              Weitere {Math.min(p.schritt, p.gesamtTreffer - p.sichtbar.length)} anzeigen
            </button>
          </div>
        )}
      </div>

      {blatt && (
        <div className="modal-overlay auswahl-overlay" onClick={() => setBlatt(null)}>
          <div className="auswahl-blatt lg-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={blatt === "gebiet" ? "Gebiet" : "Anfangsbuchstabe"}>
            <div className="ab-griff" />
            {blatt === "az" && (
              <>
                <div className="ab-titel">Anfangsbuchstabe</div>
                <div className="kl-az">
                  <button type="button" className={!p.buchstabe ? "aktiv" : ""} onClick={() => { p.onBuchstabe(null); setBlatt(null); }}>A–Z</button>
                  {p.buchstaben.map((b) => (
                    <button key={b} type="button" className={p.buchstabe === b ? "aktiv" : ""} onClick={() => { p.onBuchstabe(b); setBlatt(null); }}>{b}</button>
                  ))}
                </div>
              </>
            )}
            {blatt === "gebiet" && (
              <>
                <div className="ab-titel">Gebiet</div>
                <span className="small">Postleitzahl beginnt mit – antippen oder selbst eingeben.</span>
                <button type="button" className={"ab-option" + (!p.plz ? " aktiv" : "")} onClick={() => { p.onPlz(""); setBlatt(null); }}>
                  <span className="ab-text">Alle Gebiete</span><span className="small">{p.gesamtKunden} Kunden</span>
                </button>
                {plzVorschlaege(p.alleKunden.map((c) => ({ cust: c }))).map((v) => (
                  <button key={v.praefix} type="button" className={"ab-option" + (p.plz === v.praefix ? " aktiv" : "")} onClick={() => { p.onPlz(v.praefix); setBlatt(null); }}>
                    <span className="ab-text">{v.praefix}{v.ort ? ` · ${v.ort}` : ""}</span><span className="small">{v.kunden} {v.kunden === 1 ? "Kunde" : "Kunden"}</span>
                  </button>
                ))}
                <div className="field" style={{ marginTop: 4 }}>
                  <label>Eigene Eingabe</label>
                  <div className="row">
                    <input type="text" inputMode="numeric" placeholder="z. B. 904" value={plzEingabe}
                      onChange={(e) => setPlzEingabe(e.target.value.replace(/\D/g, "").slice(0, 5))}
                      onKeyDown={(e) => { if (e.key === "Enter") { p.onPlz(plzEingabe); setBlatt(null); } }} />
                    <button type="button" className="btn-primary" style={{ flex: "0 0 auto" }} onClick={() => { p.onPlz(plzEingabe); setBlatt(null); }}>Übernehmen</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

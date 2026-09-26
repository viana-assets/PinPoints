"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Customer } from "@/lib/types";
import { KUNDEN_ZUSTAND_LABEL, suchtreffer, type KundenZustand } from "@/lib/helpers";
import { MAP_STYLES, type MapStyleKey } from "@/lib/mapStyles";
import { zahlText, zustandText, type TagesStation } from "@/lib/karte";
import { nadelHtml, stationHtml } from "./nadel";

// Alles, was auf der Karte liegt und keine Nadel ist (26.09.2026, Entwurf „W · Karte & Nadeln"):
// oben Suche (Handy) und Zustands-Pillen, darunter die Hinweiszeile; rechts unten Ebenen,
// Standort und Zoom; links unten die Legende; im Tagesmodus unten der Streifen mit den Stationen.
//
// Sitzt INNERHALB des Kartencontainers, damit es am Rechner genau über der Kartenspalte liegt,
// ohne deren Breite nachzurechnen. Damit ein Wischen über die Knöpfe nicht die Karte verschiebt
// und ein Tipp darauf nicht als Kartenklick zählt, sperrt app/page.tsx diese Fläche für Leaflet
// (kartenFlaecheSperren). Deshalb hier nur onClick – keine onPointerDown/onTouchStart.

export type KartenPerson = { id: string; name: string; farbe: string };
export type StreifenStation = TagesStation & { kunde: Customer; titel: string };

// Legende: gezeichnet mit derselben Funktion wie die Nadeln auf der Karte.
const KUNDEN_LEGENDE = [
  { form: nadelHtml("red"), titel: "Offen", info: "noch anzurufen – rot, bis jemand Kontakt hatte" },
  { form: nadelHtml("wiedervorlage"), titel: "Wiedervorlage", info: "hellblau bis zum vereinbarten Tag" },
  { form: nadelHtml("termin", false, "12:00"), titel: "Termin", info: "dunkelblau mit Uhrzeit, solange ein Termin ansteht" },
  { form: nadelHtml("green"), titel: "Kontaktiert", info: "grün, bis die Wiedervorlage-Frist abläuft" },
  { form: nadelHtml("kein-interesse"), titel: "Kein Interesse", info: "weißer Kreis mit rotem Kreuz" },
  { form: nadelHtml("red", true), titel: "Ungefähre Position", info: "hohl und gestrichelt – nur die Straße ist bekannt" },
  { form: '<span class="pin-buendel" style="width:30px;height:30px;background:conic-gradient(var(--red) 0deg 200deg, var(--blau-marker) 200deg 250deg, var(--green) 250deg 360deg)"><b>24</b></span>', titel: "Bündel", info: "weit weg: Anzahl, der Ring zeigt die Anteile – antippen zum Heranzoomen" },
];
const TAG_LEGENDE = [
  { form: stationHtml(1, "vorbei", null, ""), titel: "Vorbei", info: "erledigt oder schon zu Ende" },
  { form: stationHtml(2, "laeuft", null, ""), titel: "Läuft gerade", info: "in Arbeit oder jetzt im Zeitfenster" },
  { form: stationHtml(3, "kommt", "#E8622C", ""), titel: "Kommt noch", info: "der Ring hat die Farbe des Mitarbeiters" },
  { form: '<span class="kt-legende-linie"></span>', titel: "Reihenfolge", info: "je Mitarbeiter von Station zu Station – als Luftlinie, nicht als Strecke" },
];

export function KartenBedienung({ flaeche, ...p }: {
  flaeche: (el: HTMLElement | null) => void;
  // Oben
  sucheKunden: Customer[];
  onSucheWaehlen: (kundeId: string) => void;
  onListe: () => void;
  zustaende: readonly KundenZustand[];
  sichtbar: KundenZustand[];
  zahlen: Record<KundenZustand, number>;
  onZustand: (z: KundenZustand) => void;
  onAlle: () => void;
  hinweise: string[];
  // Rechts
  stil: MapStyleKey;
  stile: MapStyleKey[];
  onStil: (s: MapStyleKey) => void;
  onStandort: () => void;
  standortSucht: boolean;
  onRein: () => void;
  onRaus: () => void;
  // Zustand
  kundeOffen: boolean;
  tag: null | {
    titel: string;
    personen: KartenPerson[];
    person: string;
    onPerson: (id: string) => void;
    stationen: StreifenStation[];
    ohnePosition: number;
    farbeVon: (s: TagesStation) => string | null;
    gewaehlt: string | null;
    onWaehlen: (orderId: string) => void;
    onNavigation: (e: React.MouseEvent, kunde: Customer) => void;
    onAuftrag: (orderId: string) => void;
  };
}) {
  const [suche, setSuche] = useState("");
  const [legende, setLegende] = useState(false);
  const [ebenen, setEbenen] = useState(false);

  const treffer = useMemo(() => {
    const q = suche.trim();
    if (!q) return [];
    return p.sucheKunden
      .filter((c) => suchtreffer([c.name, c.company, c.address, c.kundennummer != null ? String(c.kundennummer) : null], q))
      .slice(0, 6);
  }, [suche, p.sucheKunden]);

  const tag = p.tag;
  const klasse = "kt-flaeche" + (tag ? " tag-modus" : "") + (p.kundeOffen ? " kk-offen" : "");

  return (
    <div className={klasse}>
      <div className="kt-oben" ref={flaeche}>
        <div className="kt-suchzeile">
          {tag ? (
            <span className="kt-tagtitel">{tag.titel}</span>
          ) : (
            <label className="kt-suche">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input
                type="search" value={suche} onChange={(e) => setSuche(e.target.value)}
                placeholder="Kunde, Straße oder Ort …" aria-label="Auf der Karte suchen"
              />
            </label>
          )}
          <button type="button" className="kt-liste" onClick={p.onListe}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            Liste
          </button>
        </div>

        {treffer.length > 0 && !tag && (
          <div className="kt-treffer">
            {treffer.map((c) => (
              <button key={c.id} type="button" onClick={() => { setSuche(""); p.onSucheWaehlen(c.id); }}>
                <b>{c.company || c.name}</b>
                <span>{c.address}</span>
              </button>
            ))}
          </div>
        )}

        {tag ? (
          tag.personen.length > 1 && (
            <div className="kt-pillen">
              <button type="button" className={"kt-pille" + (tag.person === "alle" ? " gewaehlt" : "")} onClick={() => tag.onPerson("alle")}>Alle</button>
              {tag.personen.map((m) => (
                <button key={m.id} type="button" className={"kt-pille" + (tag.person === m.id ? " gewaehlt" : "")} onClick={() => tag.onPerson(m.id)}>
                  <span className="kt-punkt" style={{ background: m.farbe }} />{m.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="kt-pillen">
            {/* Der Weg zurück, ohne jede Pille einzeln anzutippen – und zugleich die Antwort auf
                „warum fehlt hier eine Nadel?". Erscheint nur, wenn etwas ausgeblendet ist. */}
            {p.sichtbar.length < p.zustaende.length && (
              <button type="button" className="kt-pille alle" onClick={p.onAlle}>Alle zeigen</button>
            )}
            {p.zustaende.map((z) => {
              const an = p.sichtbar.includes(z);
              return (
                <button
                  key={z} type="button" className={"kt-pille" + (an ? " an" : " aus")}
                  onClick={() => p.onZustand(z)} aria-pressed={an}
                  title={an ? `${KUNDEN_ZUSTAND_LABEL[z]} ausblenden` : `${KUNDEN_ZUSTAND_LABEL[z]} einblenden`}
                >
                  <span className={"kt-punkt z-" + z} />
                  {zustandText(z)}
                  <small>{zahlText(p.zahlen[z])}</small>
                </button>
              );
            })}
          </div>
        )}

        {p.hinweise.map((h) => <span key={h} className="kt-hinweis">{h}</span>)}
      </div>

      <div className="kt-rechts" ref={flaeche}>
        {ebenen && (
          <div className="kt-ebenen">
            {p.stile.map((s) => (
              <button key={s} type="button" className={s === p.stil ? "an" : ""} onClick={() => { setEbenen(false); p.onStil(s); }}>
                <span className={"kt-ebene e-" + s} />
                {MAP_STYLES[s].label.replace(" (Standard)", "")}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="kt-knopf" onClick={() => { setEbenen((o) => !o); setLegende(false); }} aria-label="Kartenansicht" aria-expanded={ebenen} title="Kartenansicht">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M2 12l10 5 10-5" /><path d="M2 16l10 5 10-5" /></svg>
        </button>
        <button type="button" className={"kt-knopf standort" + (p.standortSucht ? " sucht" : "")} onClick={p.onStandort} aria-label="Mein Standort" title="Mein Standort">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
        </button>
        <span className="kt-zoom">
          <button type="button" onClick={p.onRein} aria-label="Näher heran" title="Näher heran">+</button>
          <button type="button" onClick={p.onRaus} aria-label="Weiter weg" title="Weiter weg">−</button>
        </span>
      </div>

      <div className="kt-links" ref={flaeche}>
        {legende && (
          <div className="kt-legende">
            <b>{tag ? "Der Tag auf der Karte" : "Die Nadeln"}</b>
            {(tag ? TAG_LEGENDE : KUNDEN_LEGENDE).map((z) => (
              <span key={z.titel} className="kt-legende-zeile">
                <span className="kt-legende-form" dangerouslySetInnerHTML={{ __html: z.form }} />
                <span><b>{z.titel}</b><small>{z.info}</small></span>
              </span>
            ))}
          </div>
        )}
        <button type="button" className="kt-legende-knopf" onClick={() => { setLegende((o) => !o); setEbenen(false); }} aria-expanded={legende}>
          <span className="kt-legende-punkte" aria-hidden="true"><i className="z-red" /><i className="z-wiedervorlage" /><i className="z-termin" /><i className="z-green" /></span>
          {legende ? "Legende schließen" : "Was bedeuten die Nadeln?"}
        </button>
      </div>

      {tag && <TagesStreifen tag={tag} flaeche={flaeche} />}
    </div>
  );
}

function TagesStreifen({ tag, flaeche }: { tag: NonNullable<Parameters<typeof KartenBedienung>[0]["tag"]>; flaeche: (el: HTMLElement | null) => void }) {
  const karten = useRef<Record<string, HTMLDivElement | null>>({});
  // Wird eine Nadel angetippt, rückt ihre Karte im Streifen ins Bild.
  useEffect(() => {
    if (tag.gewaehlt) karten.current[tag.gewaehlt]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [tag.gewaehlt]);

  if (tag.stationen.length === 0) {
    return (
      <div className="kt-streifen leer" ref={flaeche}>
        <span className="kt-hinweis">
          {tag.ohnePosition > 0 ? `${tag.ohnePosition} Termine ohne Position auf der Karte` : "An diesem Tag stehen keine Termine an."}
        </span>
      </div>
    );
  }
  return (
    <div className="kt-streifen" ref={flaeche}>
      {tag.stationen.map((s) => (
        <div
          key={s.orderId}
          ref={(el) => { karten.current[s.orderId] = el; }}
          className={"kt-station" + (tag.gewaehlt === s.orderId ? " gewaehlt" : "")}
        >
          <button type="button" className="kt-station-kopf" onClick={() => tag.onWaehlen(s.orderId)}>
            <span className="kt-station-nr" dangerouslySetInnerHTML={{ __html: stationHtml(s.nr, s.phase, tag.farbeVon(s), "") }} />
            <span>
              <small>{s.zeit}{s.phase === "laeuft" ? " · läuft" : s.phase === "vorbei" ? " · vorbei" : ""}</small>
              <b>{s.kunde.company || s.kunde.name}</b>
              <span>{s.titel || s.kunde.address}</span>
            </span>
          </button>
          <span className="kt-station-knoepfe">
            <button type="button" onClick={(e) => tag.onNavigation(e, s.kunde)} disabled={!s.kunde.address.trim()}>Navigation</button>
            <button type="button" className="haupt" onClick={() => tag.onAuftrag(s.orderId)}>Auftrag</button>
          </span>
        </div>
      ))}
      {tag.ohnePosition > 0 && (
        <span className="kt-station ohne">{tag.ohnePosition} {tag.ohnePosition === 1 ? "Termin" : "Termine"} ohne Position – nur in der Liste</span>
      )}
    </div>
  );
}

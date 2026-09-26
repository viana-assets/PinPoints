import { useState } from "react";
import type { ReifenZustand, Saison, StorageSlot, Verkaufsreifen, VerkaufsreifenFelder, Warehouse } from "@/lib/types";
import { formatEUR } from "@/lib/helpers";
import { REIFEN_ZUSTAENDE, REIFEN_ZUSTAND_LABEL, SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import {
  groesseAusText, groesseText, lagerwert, passtZurSuche, reifenFrei, reifenHinweise, reifenName,
  reifenUnterzeile, sortiereReifen,
} from "@/lib/reifenverkauf";
import { VerkaufsreifenBlatt } from "./VerkaufsreifenBlatt";

// Der Reiter „Verkauf" im Lager (Migration 61, docs/lager.md „Reifenverkauf"): alles, was der
// Betrieb an Reifen und Kompletträdern verkauft, über alle Lager – auch das Lager „Zuhause",
// das keine Plätze hat.
//
// Oben drei Zahlen (frei, reserviert, Lagerwert), darunter Suche und Filter, dann je Posten eine
// Karte. Ein Tipp öffnet das Blatt zum Ändern. Ausverkaufte Posten verschwinden aus der Liste
// und stehen unter „Ausverkauft" – sie bleiben als Beleg der Aufträge, auf denen sie standen.

type VerkaufFilter = "alle" | ReifenZustand | Saison | "ausverkauft";

function euroGanz(betrag: number): string {
  return `${Math.round(betrag).toLocaleString("de-DE")} €`;
}

export function VerkaufPanel({ verkaufsreifen, warehouses, storageSlots, platzBelegt, darfSchreiben, darfLoeschen, oeffneId, onGeoeffnet, onSpeichern, onLoeschen }: {
  verkaufsreifen: Verkaufsreifen[];
  warehouses: Warehouse[];
  storageSlots: StorageSlot[];
  platzBelegt: Set<string>;
  darfSchreiben: boolean;
  darfLoeschen: boolean;
  // Von der Regalwand aus: diesen Posten gleich öffnen.
  oeffneId: string | null;
  onGeoeffnet: () => void;
  onSpeichern: (felder: VerkaufsreifenFelder, id: string | null) => Promise<void>;
  onLoeschen: (id: string) => Promise<void>;
}) {
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState<VerkaufFilter>("alle");
  // undefined = kein Blatt, null = neu erfassen, sonst die Kennung
  const [blatt, setBlatt] = useState<string | null | undefined>(undefined);

  // Kommt der Wunsch von der Regalwand, gilt er, bis das Blatt geschlossen wird – abgeleitet statt
  // per Effekt in den eigenen Zustand kopiert.
  const blattId = blatt !== undefined ? blatt : (oeffneId ?? undefined);
  function schliessen() {
    setBlatt(undefined);
    if (oeffneId) onGeoeffnet();
  }

  const liegend = verkaufsreifen.filter((p) => p.bestand > 0);
  const wert = lagerwert(liegend);
  const frei = liegend.reduce((s, p) => s + reifenFrei(p), 0);
  const reserviert = liegend.reduce((s, p) => s + p.reserviert, 0);
  const ausverkauft = verkaufsreifen.length - liegend.length;

  const gezeigt = sortiereReifen(
    verkaufsreifen.filter((p) => {
      if (filter === "ausverkauft") { if (p.bestand > 0) return false; }
      else if (p.bestand <= 0) return false;
      if (filter === "neu" || filter === "gebraucht") { if (p.zustand !== filter) return false; }
      else if (filter !== "alle" && filter !== "ausverkauft" && p.saison !== filter) return false;
      return passtZurSuche(p, suche);
    }),
    groesseAusText(suche)
  );

  function ort(p: Verkaufsreifen): string {
    const lager = warehouses.find((w) => w.id === p.warehouse_id)?.name;
    const platz = storageSlots.find((s) => s.id === p.storage_slot_id)?.code;
    return [lager, platz ? `Platz ${platz}` : null].filter(Boolean).join(" · ") || "ohne Lager";
  }

  const offen = blattId === undefined ? undefined : blattId === null ? null : verkaufsreifen.find((p) => p.id === blattId) ?? undefined;

  return (
    <>
      <div className="db-kacheln">
        <div className="db-kachel">
          <span className="db-k-titel">Frei</span>
          <span className="db-k-wert">{frei}</span>
          <span className="db-k-unter">Stück zum Verkauf</span>
        </div>
        <div className="db-kachel">
          <span className="db-k-titel">Reserviert</span>
          <span className="db-k-wert">{reserviert}</span>
          <span className="db-k-unter">auf offenen Aufträgen</span>
        </div>
        <div className="db-kachel">
          <span className="db-k-titel">Lagerwert</span>
          {/* Ganze Euro: Die Kachel ist am Handy ein Drittel breit, und Cent sagen beim Lagerwert nichts. */}
          <span className="db-k-wert vk-wert">{euroGanz(wert.vk)}</span>
          <span className="db-k-unter">
            netto{wert.stueckMitEk > 0 ? ` · EK ${euroGanz(wert.ek)}${wert.stueckMitEk < wert.stueck ? ` (${wert.stueckMitEk} von ${wert.stueck} Stk.)` : ""}` : ""}
          </span>
        </div>
      </div>

      <div className="lg-suche">
        <label className="lg-suchfeld">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="235 55 17 oder Michelin" value={suche}
            onChange={(e) => setSuche(e.target.value)} aria-label="Verkaufsreifen suchen" />
        </label>
        {darfSchreiben && (
          <button type="button" className="vk-neu" onClick={() => setBlatt(null)} title="Reifen zum Verkauf erfassen">+ Erfassen</button>
        )}
      </div>

      <div className="pl-filter lg-filter" role="group" aria-label="Filter">
        {([
          ["alle", "Alle"],
          ...REIFEN_ZUSTAENDE.map((z) => [z, REIFEN_ZUSTAND_LABEL[z]] as const),
          ...SAISON_LISTE.map((s) => [s, SAISON_LABEL[s]] as const),
          ...(ausverkauft > 0 ? [["ausverkauft", `Ausverkauft · ${ausverkauft}`] as const] : []),
        ] as const).map(([wert, text]) => (
          <button key={wert} type="button" className={"pl-pille" + (filter === wert ? " aktiv" : "")}
            aria-pressed={filter === wert} onClick={() => setFilter(filter === wert ? "alle" : wert)}>{text}</button>
        ))}
      </div>

      {verkaufsreifen.length === 0 ? (
        <div className="db-karte">
          <div className="db-leer">
            Noch keine Reifen zum Verkauf erfasst.{darfSchreiben ? " Mit „+ Erfassen“ geht es los – vier gleiche Reifen sind ein Eintrag mit Bestand 4." : ""}
          </div>
        </div>
      ) : gezeigt.length === 0 ? (
        <span className="lg-gruppe-titel">KEIN REIFEN PASST DAZU</span>
      ) : (
        <div className="vk-liste">
          {gezeigt.map((p) => {
            const f = reifenFrei(p);
            const hinweise = reifenHinweise(p);
            return (
              <button key={p.id} type="button" className={"vk-karte" + (p.bestand <= 0 ? " leer" : "")} onClick={() => setBlatt(p.id)}>
                <span className={"vk-groesse-marke " + p.zustand}>
                  <b>{groesseText(p)}</b>
                  <span>{REIFEN_ZUSTAND_LABEL[p.zustand]}</span>
                </span>
                <span className="vk-text">
                  <b>{reifenName(p)}</b>
                  <span className="small">{reifenUnterzeile(p)}</span>
                  <span className="small">{ort(p)}</span>
                  {hinweise.length > 0 && <span className="lg-zeile-grund">{hinweise.map((h) => h.text).join(" · ")}</span>}
                </span>
                <span className="vk-zahlen">
                  <b>{formatEUR(p.preis_netto)}</b>
                  <span className="small">je Stück netto</span>
                  <span className={"vk-frei" + (f === 0 ? " null" : "")}>
                    {p.bestand <= 0 ? `${p.verkauft} verkauft` : `${f} frei${p.reserviert > 0 ? ` · ${p.reserviert} res.` : ""}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {offen !== undefined && (
        <VerkaufsreifenBlatt
          key={offen?.id ?? "neu"}
          posten={offen}
          warehouses={warehouses}
          storageSlots={storageSlots}
          platzBelegt={platzBelegt}
          vorgabeLagerId={null}
          darfSchreiben={darfSchreiben}
          darfLoeschen={darfLoeschen}
          onSpeichern={onSpeichern}
          onLoeschen={onLoeschen}
          onClose={schliessen}
        />
      )}
    </>
  );
}

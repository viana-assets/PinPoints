import { useEffect, useMemo, useState } from "react";
import type { Customer, Order } from "@/lib/types";
import { formatDate, geocodeAddress, navigationsZiel, terminZeitraum } from "@/lib/helpers";
import { kundeFuerAuftrag } from "@/lib/laufkunde";
import { MAPS_ZWISCHENZIELE_MAX, mapsRoutenUrl, routenvorschlag, UMWEG_FAKTOR, type Punkt } from "@/lib/route";

// Die Tagesroute (Fahrplan E5, v104): die Termine eines Tages von der Firmenadresse los und wieder zurück.
// Seit v161 (Wunsch Vitali 16.10.2026) zuerst NACH UHRZEIT – frühester Termin zuerst, Termine ohne Uhrzeit
// mit dem kleinsten Umweg eingereiht; „Kürzeste Strecke“ zeigt als Vergleich, wie man am kürzesten führe.
// Gerechnet in lib/route.ts (Luftlinie, nächster Nachbar + 2-opt) – ohne Routendienst, die Kilometer stehen
// deshalb als „ca." da. Der Google-Maps-Link folgt der gewählten Reihenfolge.
//
// Ein VORSCHLAG: Die Uhrzeiten bleiben, wie sie sind – ein vereinbarter Termin ist eine Zusage an
// den Kunden. Wer danach plant, verschiebt die Termine im Stundenraster wie sonst auch.
//
// Der Startpunkt ist die Firmenadresse aus den Betriebsdaten. Sie wird über die eigene, gedrosselte
// Geocode-Route nachgeschlagen (wie jede Kundenadresse) und für diese Sitzung gemerkt; findet sich
// keine, beginnt die Route beim ersten Termin.

export type RoutenGruppe = { id: string; name: string; orders: Order[] };

const MERKER = "pinpoints-firmenstart:";

function startAusSpeicher(adresse: string): Punkt | null | undefined {
  try {
    const roh = sessionStorage.getItem(MERKER + adresse);
    if (roh === null) return undefined;
    return roh === "-" ? null : (JSON.parse(roh) as Punkt);
  } catch {
    return undefined;
  }
}

export function RoutenBlatt({ datum, gruppen, startGruppeId, customers, firmenadresse, onOpenOrder, onClose }: {
  datum: string;
  gruppen: RoutenGruppe[];
  startGruppeId: string;
  customers: Customer[];
  // „Gewerbering 4, 90513 Zirndorf" – null, wenn in den Betriebsdaten keine steht.
  firmenadresse: string | null;
  onOpenOrder: (id: string) => void;
  onClose: () => void;
}) {
  const [gruppeId, setGruppeId] = useState(startGruppeId);
  const [modus, setModus] = useState<"uhrzeit" | "kuerzeste">("uhrzeit");
  const gruppe = gruppen.find((g) => g.id === gruppeId) ?? gruppen[0];

  // undefined = wird gesucht, null = nicht gefunden / keine Adresse.
  const [start, setStart] = useState<Punkt | null | undefined>(() => (firmenadresse ? startAusSpeicher(firmenadresse) : null));
  useEffect(() => {
    if (!firmenadresse || start !== undefined) return;
    let abgebrochen = false;
    geocodeAddress(firmenadresse)
      .then((t) => {
        if (abgebrochen) return;
        const p = t ? { lat: t.lat, lng: t.lng } : null;
        setStart(p);
        try { sessionStorage.setItem(MERKER + firmenadresse, p ? JSON.stringify(p) : "-"); } catch { /* nur ein Merker */ }
      })
      .catch(() => { if (!abgebrochen) setStart(null); });
    return () => { abgebrochen = true; };
  }, [firmenadresse, start]);

  const stopps = useMemo(() => (gruppe?.orders ?? [])
    .slice()
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.order_number - b.order_number)
    .map((o) => {
      const k = kundeFuerAuftrag(o, customers);
      return { eintrag: { o, k }, punkt: k && k.lat != null && k.lng != null ? { lat: k.lat, lng: k.lng } : null, fest: !!o.time };
    }), [gruppe, customers]);
  const r = useMemo(() => (start === undefined ? null : routenvorschlag(start, stopps)), [start, stopps]);

  const startText = start ? `${start.lat},${start.lng}` : null;
  const liste = r ? (modus === "uhrzeit" ? r.nachUhrzeit : r.reihenfolge) : [];
  const ziele = r ? liste.map((e) => (e.k ? navigationsZiel(e.k) : "")).filter(Boolean) : [];
  const url = mapsRoutenUrl(startText, ziele);
  const zuViele = ziele.length > MAPS_ZWISCHENZIELE_MAX + (startText ? 0 : 1);

  return (
    <div className="modal-overlay auswahl-overlay" onClick={onClose}>
      <div className="auswahl-blatt am-breit ar-blatt ro-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tagesroute">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">Route · {formatDate(datum)}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {gruppen.length > 1 && (
          <div className="pl-filter" role="group" aria-label="Wessen Route">
            {gruppen.map((g) => (
              <button key={g.id} type="button" className={"pl-pille" + (g.id === gruppe?.id ? " aktiv" : "")} aria-pressed={g.id === gruppe?.id}
                onClick={() => setGruppeId(g.id)}>{g.name} · {g.orders.length}</button>
            ))}
          </div>
        )}

        <span className="small">
          {!firmenadresse ? "In den Betriebsdaten steht keine Firmenadresse – die Route beginnt beim ersten Termin."
            : start === undefined ? `Start und Ende: ${firmenadresse} – wird auf der Karte gesucht …`
            : start === null ? `Die Firmenadresse (${firmenadresse}) ist auf der Karte nicht zu finden – die Route beginnt beim ersten Termin.`
            : `Start und Ende: ${firmenadresse}`}
        </span>

        {r && (
          <>
            {r.reihenfolge.length > 1 && r.andersAlsUhrzeit && (
              <div className="lg-lagerwahl es-segment fi-reiter-breit" role="group" aria-label="Reihenfolge">
                <button type="button" className={modus === "uhrzeit" ? "aktiv" : ""} aria-pressed={modus === "uhrzeit"} onClick={() => setModus("uhrzeit")}>Nach Uhrzeit</button>
                <button type="button" className={modus === "kuerzeste" ? "aktiv" : ""} aria-pressed={modus === "kuerzeste"} onClick={() => setModus("kuerzeste")}>Kürzeste Strecke</button>
              </div>
            )}
            <div className="ro-summe">
              <b>ca. {modus === "uhrzeit" ? r.kmNachUhrzeit : r.kmVorschlag} km</b>
              <span className="small">
                {r.reihenfolge.length < 2 ? "Nur ein Termin mit Kartenposition."
                  : !r.andersAlsUhrzeit ? "Die Uhrzeiten passen schon zur kürzesten Reihenfolge."
                  : modus === "uhrzeit"
                  ? `kürzeste Reihenfolge ca. ${r.kmVorschlag} km${r.kmNachUhrzeit > r.kmVorschlag ? ` – ca. ${r.kmNachUhrzeit - r.kmVorschlag} km weniger` : ""}`
                  : `nach Uhrzeit ca. ${r.kmNachUhrzeit} km${r.kmNachUhrzeit > r.kmVorschlag ? ` – spart ca. ${r.kmNachUhrzeit - r.kmVorschlag} km` : ""}`}
              </span>
            </div>

            <ol className="ro-liste">
              {liste.map(({ o, k }, i) => {
                const platz = r.nachUhrzeit.findIndex((x) => x.o.id === o.id) + 1;
                const index = i + 1;
                return (
                  <li key={o.id}>
                    <button type="button" className="ro-stopp" onClick={() => onOpenOrder(o.id)}>
                      <span className="ro-nr">{index}</span>
                      <span className="ro-text">
                        <b>{k?.name ?? "Kunde"}</b>
                        <span className="small">{[terminZeitraum(o) || "ohne Uhrzeit", k?.address].filter(Boolean).join(" · ")}</span>
                      </span>
                      {modus === "kuerzeste" && r.andersAlsUhrzeit && platz !== index && <span className="ro-anders">nach Uhrzeit {platz}.</span>}
                      {modus === "uhrzeit" && !o.time && <span className="ro-anders">ohne Uhrzeit</span>}
                    </button>
                  </li>
                );
              })}
            </ol>

            {r.ohnePosition.length > 0 && (
              <div className="ro-ohne">
                <span className="op-gruppe-titel">OHNE KARTENPOSITION – NICHT EINGEPLANT</span>
                {r.ohnePosition.map(({ o, k }) => (
                  <button key={o.id} type="button" className="ro-stopp leise" onClick={() => onOpenOrder(o.id)}>
                    <span className="ro-text"><b>{k?.name ?? "Kunde"}</b><span className="small">{[terminZeitraum(o) || "ohne Uhrzeit", k?.address].filter(Boolean).join(" · ")}</span></span>
                  </button>
                ))}
              </div>
            )}

            {url && (
              <a className="am-knopf ro-maps" href={url} target="_blank" rel="noreferrer">In Google Maps öffnen</a>
            )}
            {zuViele && <span className="small">Google Maps nimmt in einem Link höchstens {MAPS_ZWISCHENZIELE_MAX} Zwischenziele – die übrigen Stopps fehlen dort.</span>}
            <span className="small">Luftlinie mal {String(UMWEG_FAKTOR).replace(".", ",")}, also ungefähr. {modus === "uhrzeit"
              ? (liste.some((x) => !x.o.time) ? " Termine ohne Uhrzeit sind dort eingereiht, wo sie den kleinsten Umweg machen." : "")
              : " Die Uhrzeiten bleiben, wie sie sind – verschoben wird im Stundenraster."}</span>
          </>
        )}
      </div>
    </div>
  );
}

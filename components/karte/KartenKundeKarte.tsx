"use client";

import { useEffect, useState } from "react";
import type { Customer, Order } from "@/lib/types";
import { formatOrderDateTime, getPhoneNumbers, type KundenZustand } from "@/lib/helpers";
import { initialen } from "@/lib/kundenAnsicht";
import { kundenInfoZeile, zustandText } from "@/lib/karte";

// Die Kundenkarte auf der Karte (26.09.2026, Entwurf „W · Karte & Nadeln"). Sie ersetzt das
// Leaflet-Popup, das bis v78 als HTML-Zeichenkette in app/page.tsx entstand (buildPopupEl).
//
// Am Handy ein Blatt von unten, wie die übrigen Auswahlblätter der App; am Rechner eine Karte,
// die an der Nadel hängt und beim Verschieben mitwandert. Die Stelle setzt app/page.tsx über
// die CSS-Variablen --x/--y am Element (anker) – ohne React-Neuzeichnen je Mausbewegung.
//
// Was sie zeigen soll: wer, warum diese Farbe, was steht als Nächstes an – und die vier Dinge,
// die man an einer Nadel tut. Alles Weitere steht im Kundenfenster, einen Tipp entfernt.

export type KartenMitarbeiter = { id: string; name: string; farbe: string };

export function KartenKundeKarte({ anker, ...p }: {
  kunde: Customer;
  zustand: KundenZustand;
  naechster: Order | null;
  naechsterMitarbeiter: KartenMitarbeiter[];
  anker: React.Ref<HTMLDivElement>;
  onSchliessen: () => void;
  onAnrufen: (e: React.MouseEvent) => void;
  onNavigation: (e: React.MouseEvent) => void;
  onKontakt: () => void;
  onAuftrag: () => void;
  onKundenfenster: () => void;
  onOffen: () => void;
  onDeaktivieren: () => void;
  onPositionSetzen: () => void;
}) {
  const [menueOffen, setMenueOffen] = useState(false);
  const k = p.kunde;
  const ungefaehr = k.geo_genauigkeit === "ungefaehr";
  const hatTelefon = getPhoneNumbers(k).length > 0;
  const hatAdresse = !!k.address.trim();

  // Esc schließt – erst das Menü, dann die Karte.
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (menueOffen) setMenueOffen(false);
      else p.onSchliessen();
    }
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [menueOffen, p]);

  return (
    <div className="kk-karte" ref={anker} role="dialog" aria-label={`Kunde ${k.company || k.name}`}>
      <span className="kk-griff" aria-hidden="true" />
      <div className="kk-kopf">
        <span className={"kk-kreis z-" + p.zustand}>{initialen(k.company || k.name)}</span>
        <span className="kk-name">
          <b>{k.company || k.name}</b>
          {k.company && <span>{k.name}</span>}
          <span>{k.address || "ohne Adresse"}</span>
        </span>
        <button type="button" className="kk-zu" onClick={p.onSchliessen} aria-label="Schließen">×</button>
      </div>

      <div className="kk-zeile">
        <span className={"kk-pille z-" + p.zustand}>{zustandText(p.zustand)}</span>
        <span className="kk-info">{kundenInfoZeile(k, p.zustand)}</span>
      </div>

      {p.naechster && (
        <div className="kk-termin">
          <span>
            <small>NÄCHSTER TERMIN</small>
            <b>{formatOrderDateTime(p.naechster)}</b>
            {p.naechster.title && <em>{p.naechster.title}</em>}
          </span>
          {p.naechsterMitarbeiter.length > 0 && (
            <span className="kk-leute">
              {p.naechsterMitarbeiter.map((m) => (
                <i key={m.id} style={{ background: m.farbe }}>{m.name.split(" ")[0]}</i>
              ))}
            </span>
          )}
        </div>
      )}

      {ungefaehr && (
        <div className="kk-ungefaehr">
          <span>Ungefähre Position – nur die Straße ist bekannt. Die Navigation läuft über die Adresse.</span>
          <button type="button" onClick={p.onPositionSetzen}>Position setzen</button>
        </div>
      )}

      {k.note && <div className="kk-notiz">{k.note}</div>}

      <div className="kk-aktionen">
        <button type="button" onClick={p.onAnrufen} disabled={!hatTelefon} title={hatTelefon ? "Anrufen" : "Keine Telefonnummer hinterlegt"}>
          <span className="kk-sym a-anruf" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
          </span>
          Anrufen
        </button>
        <button type="button" onClick={p.onNavigation} disabled={!hatAdresse} title="Navigation starten (Google Maps / Apple Karten)">
          <span className="kk-sym a-nav" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11 21 3l-8 18-2-8-8-2Z" /></svg>
          </span>
          Navigation
        </button>
        <button type="button" onClick={p.onKontakt} title="Kontakt festhalten">
          <span className="kk-sym a-kontakt" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
          </span>
          Kontakt
        </button>
        <button type="button" onClick={p.onAuftrag} title="Auftrag anlegen">
          <span className="kk-sym a-auftrag" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          Auftrag
        </button>
      </div>

      <div className="kk-fuss">
        <button type="button" className="kk-oeffnen" onClick={p.onKundenfenster}>Kundenfenster öffnen ›</button>
        <span className="kk-mehr-huelle">
          <button type="button" className="kk-mehr" onClick={() => setMenueOffen((o) => !o)} aria-expanded={menueOffen} aria-label="Weitere Aktionen">⋯</button>
          {menueOffen && (
            <span className="kk-menue" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenueOffen(false); p.onOffen(); }}>Auf offen setzen</button>
              <button type="button" role="menuitem" onClick={() => { setMenueOffen(false); p.onPositionSetzen(); }}>Position auf der Karte setzen</button>
              {/* Nur bei „kein Interesse": Das Deaktivieren bleibt ein eigener, bewusster Schritt
                  und passiert nicht als Nebenwirkung des Anrufergebnisses (Migration 23). */}
              {p.zustand === "kein-interesse" && (
                <button type="button" role="menuitem" className="rot" onClick={() => { setMenueOffen(false); p.onDeaktivieren(); }}>Kunde deaktivieren</button>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

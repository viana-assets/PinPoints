"use client";

import { useState } from "react";
import type { Warehouse } from "@/lib/types";
import { navigationsLager } from "@/lib/lagerNavigation";

// Einstellungen › Navigation (v169, Migration 102): zu welchem Lager der Knopf „Zum Lager“ im Schnellmenü navigiert –
// und, wer Lager ändern darf (`lager.regale` S), gleich Name und Adresse dieses Lagers. Leer heißt „automatisch“:
// das Lager mit „Hauptlager“ im Namen, sonst das erste mit Adresse (lib/lagerNavigation.ts).
export function LagerNavEinstellung({ lager, gewaehltId, onWaehlen, onSpeichern }: {
  lager: Warehouse[];
  gewaehltId: string | null | undefined;
  onWaehlen: (id: string | null) => void;
  onSpeichern?: (id: string, f: { name: string; address: string; note: string }) => Promise<void>;
}) {
  const ziel = navigationsLager(lager, gewaehltId);
  const [entwurf, setEntwurf] = useState<{ id: string; name: string; address: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const wahlGilt = !!gewaehltId && lager.some((w) => w.id === gewaehltId);

  async function speichern() {
    if (!entwurf || !onSpeichern || !ziel) return;
    if (!entwurf.name.trim()) { setFehler("Der Name darf nicht leer sein."); return; }
    setLaeuft(true); setFehler(null);
    try {
      await onSpeichern(entwurf.id, { name: entwurf.name.trim(), address: entwurf.address.trim(), note: ziel.note ?? "" });
      setEntwurf(null);
    } catch (e) { setFehler(e instanceof Error ? e.message : "Das Lager konnte nicht gespeichert werden."); }
    finally { setLaeuft(false); }
  }

  if (!lager.length) {
    return <span className="small es-fuss">Noch kein Lager angelegt – im Reiter „Lager“ unter „Lager verwalten“.</span>;
  }
  return (
    <>
      <div className="es-block">
        <span className="db-punkt-text"><b>Knopf „Zum Lager“</b><span className="small">im Schnellmenü oben rechts am Handy</span></span>
        <label className="nk-feld">
          <select aria-label="Lager für die Navigation" value={wahlGilt ? (gewaehltId as string) : ""}
            onChange={(e) => { setEntwurf(null); onWaehlen(e.target.value || null); }}>
            <option value="">Automatisch{ziel && !wahlGilt ? ` (${ziel.name})` : ""}</option>
            {lager.map((w) => <option key={w.id} value={w.id}>{w.name}{(w.address || "").trim() ? "" : " – ohne Adresse"}</option>)}
          </select>
        </label>
      </div>
      {ziel && !entwurf && (
        <div className="es-zeile statisch">
          <span className="db-punkt-text">
            <b>{ziel.name}</b>
            <span className={"small" + ((ziel.address || "").trim() ? "" : " es-warn")}>{(ziel.address || "").trim() || "Keine Adresse hinterlegt – ohne Adresse kann nicht navigiert werden."}</span>
          </span>
          {onSpeichern && <button type="button" className="es-knopf" onClick={() => setEntwurf({ id: ziel.id, name: ziel.name, address: ziel.address ?? "" })}>Bearbeiten</button>}
        </div>
      )}
      {entwurf && (
        <div className="es-block ln-form">
          <label className="nk-feld"><span>Name</span>
            <input type="text" value={entwurf.name} maxLength={80} onChange={(e) => setEntwurf({ ...entwurf, name: e.target.value })} />
          </label>
          <label className="nk-feld"><span>Adresse</span>
            <input type="text" value={entwurf.address} maxLength={200} placeholder="Straße Nr., PLZ Ort" autoComplete="street-address"
              onChange={(e) => setEntwurf({ ...entwurf, address: e.target.value })} />
          </label>
          {fehler && <span className="small es-warn" role="alert">{fehler}</span>}
          <div className="pk-knoepfe">
            <button type="button" className="am-mini" disabled={laeuft} onClick={() => void speichern()}>{laeuft ? "Speichert …" : "Speichern"}</button>
            <button type="button" className="btn-secondary btn-rand" disabled={laeuft} onClick={() => { setEntwurf(null); setFehler(null); }}>Abbrechen</button>
          </div>
        </div>
      )}
      <span className="small es-fuss">Navigiert wird zur Adresse des Lagers, mit Google Maps oder Apple Karten. Gilt für dich auf allen Geräten.</span>
    </>
  );
}

"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALLE_DATEN_BESTAETIGUNG } from "@/lib/constants";
import { alleDatenLoeschen, alleDatenUmfang, type AlleDatenUmfang } from "@/lib/api/alleDaten";
import { sicherungSpeichern } from "./AlleDatenSichern";
import { datenSpeicherLeeren } from "@/app/providers";
import { ausgangLeeren } from "@/lib/offline/speicher";
import { APP_VERSION } from "@/lib/version";

// „Alle Daten löschen“ (Migration 72, v117) – nur für den Superadmin, unter Admin › Wartung.
//
// Stellt die Datenbank auf null, als wäre es ein frisches Unternehmen: Kunden, Aufträge,
// Rechnungen, Lager, Artikel, Mitarbeiter, Transporter, Briefkopf, Protokoll – alles. Übrig
// bleiben die Zugänge mit der Rolle Admin oder Superadmin und die Rechtetabelle. Entschieden am
// 06.10.2026 (Rückfrage): auch echte Rechnungen; Sicherung angeboten, aber keine Pflicht.
//
// Drei Hürden: der Knopf hier, die Übersicht, was weggeht, und das Wort „löschen“ – das die
// Datenbank noch einmal selbst prüft. Danach werden der Speicher auf diesem Gerät und der
// Ausgangskorb geleert und die App neu geladen.

// Die Bereiche, die in der Übersicht einzeln genannt werden; der Rest steht als „weitere Einträge“.
const BEREICHE: [string, string][] = [
  ["customers", "Kunden"], ["vehicles", "Fahrzeuge"], ["orders", "Aufträge"], ["rechnungen", "Rechnungen"],
  ["tire_storage", "eingelagerte Sätze"], ["verkaufsreifen", "Verkaufsreifen"], ["articles", "Artikel"],
  ["storage_slots", "Lagerplätze"], ["employees", "Mitarbeiter"], ["firmenfahrzeuge", "Transporter"],
  ["audit_log", "Protokolleinträge"],
  // Seit Migration 80–85 (genannt seit v142, gelöscht wurden sie schon vorher): Chat und Stempeluhr.
  ["chat_nachrichten", "Chat-Nachrichten (Team- und Einzelchats)"], ["zeit_schichten", "Stempelzeiten (mit Pausen, Heimfahrten, Korrekturen)"],
  ["zeit_abwesenheiten", "Urlaube und Abwesenheiten"],
];

export function AlleDatenLoeschen({ supabase }: { supabase: SupabaseClient }) {
  const [offen, setOffen] = useState(false);
  const [umfang, setUmfang] = useState<AlleDatenUmfang | null>(null);
  const [wort, setWort] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gesichert, setGesichert] = useState<string | null>(null);

  async function oeffnen() {
    setOffen(true); setFehler(null); setWort(""); setGesichert(null);
    try { setUmfang(await alleDatenUmfang(supabase)); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Der Umfang konnte nicht ermittelt werden."); }
  }

  async function sichern() {
    setFehler(null); setLaeuft("Sicherung wird erstellt …");
    try {
      setGesichert(await sicherungSpeichern(supabase));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Die Sicherung konnte nicht erstellt werden.");
    } finally { setLaeuft(null); }
  }

  async function loeschen() {
    if (wort.trim() !== ALLE_DATEN_BESTAETIGUNG) return;
    setFehler(null); setLaeuft("Wird gelöscht …");
    try {
      await alleDatenLoeschen(supabase, wort.trim(), setLaeuft, APP_VERSION);
      setLaeuft("Gelöscht. Die App wird neu geladen …");
      // Was auf diesem Gerät noch liegt, gehört zu den gelöschten Daten.
      await ausgangLeeren().catch(() => undefined);
      await datenSpeicherLeeren();
      window.location.replace("/");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Löschen hat nicht geklappt.");
      setLaeuft(null);
    }
  }

  const zahl = (t: string) => umfang?.tabellen[t] ?? 0;
  const genannt = new Set(BEREICHE.map(([t]) => t));
  const weitere = umfang ? Object.entries(umfang.tabellen).filter(([t]) => !genannt.has(t)).reduce((s, [, n]) => s + n, 0) : 0;
  const passt = wort.trim() === ALLE_DATEN_BESTAETIGUNG;

  return (
    <div className="ad-alles">
      <b className="ad-aktion-titel">Alle Daten löschen</b>
      <span className="small">
        Stellt die App auf null, wie bei einem frischen Unternehmen: Kunden, Aufträge, Rechnungen, Lager,
        Artikel und Preise, Mitarbeiter, Transporter, Briefkopf, Fotos, Chat, Stempelzeiten und Urlaube,
        Protokoll und der Verlauf „Was gibt es Neues“. Übrig bleiben nur die
        Zugänge mit der Rolle Admin oder Superadmin und die Rechte. Nur für den Superadmin.
      </span>
      {!offen ? (
        <button type="button" className="btn-danger" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => void oeffnen()}>
          Alle Daten löschen …
        </button>
      ) : (
        <div className="hinweis-pflicht ad-alles-frage">
          <b>Das lässt sich nicht rückgängig machen.</b>
          {umfang ? (
            <>
              <span>Gelöscht werden:</span>
              <ul className="ad-alles-liste">
                {BEREICHE.filter(([t]) => zahl(t) > 0).map(([t, text]) => (
                  <li key={t}><b>{zahl(t).toLocaleString("de-DE")}</b> {text}</li>
                ))}
                {umfang.belege > 0 && <li><b>{umfang.belege.toLocaleString("de-DE")}</b> Fotos und Unterschriften</li>}
                {(umfang.chat_fotos ?? 0) > 0 && <li><b>{(umfang.chat_fotos ?? 0).toLocaleString("de-DE")}</b> Fotos im Chat</li>}
                {weitere > 0 && <li><b>{weitere.toLocaleString("de-DE")}</b> weitere Einträge (Leistungen, Kontakte, Verfügbarkeit …)</li>}
                <li><b>{umfang.zugaenge_weg}</b> Zugänge von Technikern und Nutzern – sie können sich danach nicht mehr anmelden</li>
                <li>Briefkopf und Nummernkreise – Kunden-, Auftrags- und Rechnungsnummern beginnen neu</li>
                <li>„Was gibt es Neues“ – die bisherigen Fassungen bis {APP_VERSION} erscheinen nicht mehr</li>
              </ul>
              <span>Es bleiben {umfang.zugaenge_bleiben} Zugänge (Admin und Superadmin) und die Rechtetabelle.</span>
              {umfang.rechnungen_echt > 0 && (
                <span>
                  <b>Achtung:</b> Darunter sind {umfang.rechnungen_echt} ausgestellte Rechnungen. Sie unterliegen der
                  Aufbewahrungspflicht (in der Regel acht Jahre) – nur löschen, wenn sie anderswo aufbewahrt sind.
                </span>
              )}
            </>
          ) : !fehler && <span>Lädt …</span>}

          <div className="ad-alles-schritt">
            <button type="button" className="btn-secondary btn-rand" disabled={laeuft !== null} onClick={() => void sichern()}>
              Sicherung herunterladen
            </button>
            <span className="small">
              {gesichert
                ? `Gespeichert: ${gesichert}`
                : "Freiwillig: alle Daten als eine Datei (am iPhone in der Dateien-App, am PC unter Downloads). Fotos nur als Liste."}
            </span>
          </div>

          <label className="nk-feld">
            <span>Zum Bestätigen „{ALLE_DATEN_BESTAETIGUNG}“ eintippen</span>
            <input type="text" value={wort} onChange={(e) => setWort(e.target.value)} disabled={laeuft !== null}
              autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder={ALLE_DATEN_BESTAETIGUNG} />
          </label>
          <div className="pk-knoepfe">
            <button type="button" className="btn-danger" disabled={!passt || laeuft !== null || !umfang} onClick={() => void loeschen()}>
              {laeuft ?? "Alle Daten endgültig löschen"}
            </button>
            <button type="button" className="btn-secondary btn-rand" disabled={laeuft !== null} onClick={() => setOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
      {fehler && <div className="hinweis-pflicht" role="alert">{fehler}</div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alleDatenSicherung } from "@/lib/api/alleDaten";
import { todayStr } from "@/lib/format";
import { dateiHerunterladen } from "@/lib/download";

// „Alle Daten sichern“ (v143, Wunsch Vitali 13.10.2026) – unter Admin › Wartung, nur für den Superadmin.
//
// Dieselbe Sicherung, die „Alle Daten löschen“ vor dem Löschen anbietet (Migration 72,
// `alle_daten_sicherung()`), jetzt auch für sich allein: ein Backup bei Bedarf, ohne etwas zu löschen.
// Alle Tabellen als eine JSON-Datei; die Fotos stecken nur als Liste darin (`auftrag_belege`), nicht als
// Bild. Die Datenbank prüft „nur Superadmin“ selbst.

// Lädt die Sicherung herunter und gibt „Dateiname · Größe“ zurück. Auch von AlleDatenLoeschen benutzt.
export async function sicherungSpeichern(supabase: SupabaseClient): Promise<string> {
  const inhalt = await alleDatenSicherung(supabase);
  const name = `MR-Sicherung-${todayStr()}.json`;
  dateiHerunterladen(name, inhalt, "application/json;charset=utf-8");
  return `${name} · ${(inhalt.length / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

export function AlleDatenSichern({ supabase }: { supabase: SupabaseClient }) {
  const [laeuft, setLaeuft] = useState(false);
  const [gesichert, setGesichert] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function sichern() {
    setLaeuft(true); setFehler(null); setGesichert(null);
    try { setGesichert(await sicherungSpeichern(supabase)); }
    catch (e) { setFehler(e instanceof Error ? e.message : "Die Sicherung konnte nicht erstellt werden."); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="ad-alles">
      <b className="ad-aktion-titel">Alle Daten sichern</b>
      <span className="small">
        Ein Backup bei Bedarf: alle Daten als eine Datei – Kunden, Aufträge, Rechnungen, Lager, Artikel,
        Mitarbeiter, Chat, Stempelzeiten, Protokoll, Einstellungen. Gelöscht wird dabei nichts. Fotos und
        Unterschriften sind nur als Liste enthalten, nicht als Bild. Nur für den Superadmin.
      </span>
      <div className="ad-alles-schritt">
        <button type="button" className="btn-secondary btn-rand" style={{ marginTop: 8 }} disabled={laeuft} onClick={() => void sichern()}>
          {laeuft ? "Sicherung wird erstellt …" : "Sicherung herunterladen"}
        </button>
        <span className="small">
          {gesichert ? `Gespeichert: ${gesichert}` : "Am iPhone in der Dateien-App, am PC unter Downloads. Die Datei enthält Kundendaten – sicher aufbewahren."}
        </span>
      </div>
      {fehler && <div className="zt-hinweis fehler" role="alert">{fehler}</div>}
    </div>
  );
}

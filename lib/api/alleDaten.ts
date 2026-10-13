import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fetchPaged, qOne } from "./client";
import { belegDateienLoeschen } from "./belege";

// „Alle Daten löschen“ für den Superadmin (Migration 72, v117). Die Prüfungen – nur Superadmin,
// nur mit dem Wort „löschen“ – stehen in der Datenbank; hier wird nur aufgerufen.

export type AlleDatenUmfang = {
  // Zeilen je Tabelle, die gelöscht würden (Tabellenname → Anzahl).
  tabellen: Record<string, number>;
  zugaenge_weg: number;
  zugaenge_bleiben: number;
  belege: number;
  rechnungen_echt: number;
  // Migration 86: Fotos im Chat (vorher fehlt der Wert).
  chat_fotos?: number;
};

// Stand der App (Migration 86, Tabelle `app_stand`): Nach „Alle Daten löschen“ zeigt „Was gibt es
// Neues“ nur die Fassungen NACH `neuigkeiten_ab`. Vor Migration 86 gibt es die Tabelle nicht –
// dann gilt die ganze Liste.
export type AppStand = { neuigkeiten_ab: string | null; alles_geloescht_am: string | null };

export async function fetchAppStand(supabase: SupabaseClient): Promise<AppStand | null> {
  const { data, error } = await supabase.from("app_stand").select("neuigkeiten_ab, alles_geloescht_am").maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(error.message);
  }
  return (data as AppStand | null) ?? null;
}

export async function alleDatenUmfang(supabase: SupabaseClient): Promise<AlleDatenUmfang> {
  return qOne<AlleDatenUmfang>("Der Umfang konnte nicht ermittelt werden", supabase.rpc("alle_daten_umfang"));
}

// Alle Tabellen als ein JSON-Dokument (als Text, so wie es in die Datei kommt).
export async function alleDatenSicherung(supabase: SupabaseClient): Promise<string> {
  const daten = await qOne<unknown>("Die Sicherung konnte nicht erstellt werden", supabase.rpc("alle_daten_sicherung"));
  return JSON.stringify(daten, null, 1);
}

// Erst die Bilddateien (SQL darf Storage nicht löschen, und nach dem Löschen der Aufträge ließen
// die Speicher-Richtlinien es nicht mehr zu), dann die Datenbank in einem Schritt.
export async function alleDatenLoeschen(
  supabase: SupabaseClient,
  bestaetigung: string,
  fortschritt?: (text: string) => void,
  // Die laufende Fassung (APP_VERSION) – bis einschließlich ihr verschwinden die Neuigkeiten.
  fassung?: string,
): Promise<Record<string, unknown>> {
  fortschritt?.("Bilddateien werden gelöscht …");
  const pfade = (await fetchPaged<{ id: string; pfad: string }>("Die Fotos konnten nicht gelesen werden",
    (von, bis) => supabase.from("auftrag_belege").select("id, pfad").order("id").range(von, bis))).map((z) => z.pfad);
  if (pfade.length) await belegDateienLoeschen(supabase, pfade);
  fortschritt?.("Daten werden gelöscht …");
  // Mit Fassung: „Was gibt es Neues“ beginnt danach neu (Migration 86). Gibt es die Funktion mit
  // zwei Werten noch nicht (Migration 86 nicht gelaufen), wie bisher ohne.
  let ergebnis: Record<string, unknown>;
  try {
    ergebnis = await qOne<Record<string, unknown>>("Die Daten konnten nicht gelöscht werden",
      supabase.rpc("alle_daten_loeschen", { p_bestaetigung: bestaetigung, p_fassung: fassung ?? null }));
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "PGRST202") throw e;
    ergebnis = await qOne<Record<string, unknown>>("Die Daten konnten nicht gelöscht werden",
      supabase.rpc("alle_daten_loeschen", { p_bestaetigung: bestaetigung }));
  }
  // Die Chat-Fotos: Die Datenbank hat ihre Pfade beim Leeren vorgemerkt (Migration 84); löschen
  // darf sie nur der Server mit dem Dienstschlüssel – auch die aus Einzelchats, die der Superadmin
  // nicht lesen darf. Klappt das nicht, räumt der Minutenlauf sie ab; kein Grund für eine Fehlermeldung.
  fortschritt?.("Chat-Fotos werden gelöscht …");
  try {
    await fetch("/api/alle-daten/fotos", { method: "POST" });
  } catch { /* der Minutenlauf holt es nach */ }
  return ergebnis;
}

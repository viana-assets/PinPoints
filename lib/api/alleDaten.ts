import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPaged, qOne } from "./client";
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
};

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
): Promise<Record<string, unknown>> {
  fortschritt?.("Bilddateien werden gelöscht …");
  const pfade = (await fetchPaged<{ id: string; pfad: string }>("Die Fotos konnten nicht gelesen werden",
    (von, bis) => supabase.from("auftrag_belege").select("id, pfad").order("id").range(von, bis))).map((z) => z.pfad);
  if (pfade.length) await belegDateienLoeschen(supabase, pfade);
  fortschritt?.("Daten werden gelöscht …");
  return qOne<Record<string, unknown>>("Die Daten konnten nicht gelöscht werden",
    supabase.rpc("alle_daten_loeschen", { p_bestaetigung: bestaetigung }));
}

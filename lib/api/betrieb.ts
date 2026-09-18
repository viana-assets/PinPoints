import type { SupabaseClient } from "@supabase/supabase-js";
import type { Betrieb, BetriebFelder } from "@/lib/types";
import { q, qWrite } from "./client";

// Einstellungen, die für den BETRIEB gelten und nicht für einen Nutzer (Migration 38/48).
//
// Der Unterschied zu `user_settings` ist keine Formsache: Kartenstil und
// Wiedervorlage-Zeitraum sind Ansichtssachen jedes Einzelnen. Das Terminraster dagegen
// bestimmt, was in die AUFTRÄGE geschrieben wird – hätte jeder seinen eigenen Wert, hinge die
// Dauer eines Termins davon ab, wer ihn angelegt hat. Und der Briefkopf steht auf jeder
// Rechnung, die das Haus verlässt.
//
// Es gibt garantiert genau eine Zeile; die Datenbank lässt keine zweite zu.

export async function fetchBetrieb(supabase: SupabaseClient): Promise<Betrieb | null> {
  const zeilen = await q<Betrieb[]>(
    "Die Betriebseinstellungen konnten nicht geladen werden",
    // `*`: Die Tabelle hat genau eine Zeile, und gebraucht wird jedes Feld darin.
    supabase.from("betrieb").select("*").limit(1)
  );
  return zeilen?.[0] ?? null;
}

export async function setzeTerminIntervall(supabase: SupabaseClient, minuten: number): Promise<void> {
  await qWrite(
    "Das Terminraster konnte nicht gespeichert werden",
    // `eq("id", true)` statt eines Treffers auf alles: Die Tabelle hat genau eine Zeile, und
    // ein Update ohne Bedingung lehnt PostgREST aus gutem Grund ab.
    supabase.from("betrieb").update({ termin_intervall_min: minuten, updated_at: new Date().toISOString() }).eq("id", true)
  );
}

// Der Briefkopf. Eigene Funktion und nicht dieselbe wie oben: Das Terminraster speichert bei
// jedem Klick, die Betriebsdaten erst auf Knopfdruck – zwei verschiedene Bedienungen.
export async function speichereBetrieb(supabase: SupabaseClient, felder: BetriebFelder): Promise<void> {
  await qWrite(
    "Die Betriebsdaten konnten nicht gespeichert werden",
    supabase.from("betrieb").update({ ...felder, updated_at: new Date().toISOString() }).eq("id", true)
  );
}

// Die nächste Rechnungsnummer von Hand setzen. Bewusst NICHT Teil von `speichereBetrieb()`:
// Dieser eine Wert verschiebt einen Nummernkreis, und ein Wert, der das kann, gehört nicht in
// dasselbe Formular wie eine Telefonnummer, die man nebenbei korrigiert.
export async function setzeNaechsteRechnungsnummer(supabase: SupabaseClient, nummer: number): Promise<void> {
  await qWrite(
    "Die nächste Rechnungsnummer konnte nicht gesetzt werden",
    supabase.from("betrieb").update({ rechnung_naechste_nummer: nummer, updated_at: new Date().toISOString() }).eq("id", true)
  );
}

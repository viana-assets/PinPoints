import type { SupabaseClient } from "@supabase/supabase-js";
import type { StempelArt, ZeitAbwesenheit, ZeitKorrektur, ZeitPerson, ZeitSchicht, ZeitStatus } from "@/lib/zeiterfassung";
import { fetchPaged, q } from "./client";

// Datenzugriff für die Stempeluhr (Migration 82, v131). Geschrieben wird ausschließlich über die
// Funktionen der Datenbank – sie nehmen die Uhrzeit des Servers und prüfen die Rechte
// („Zeiterfassung“ zum Stempeln, „Zeiten aller“ zum Korrigieren). Gelesen wird, was die RLS
// herausgibt: die eigenen Schichten oder, mit „Zeiten aller“, alle.
//
// Nur mit Netz: Eine Stempelung, die erst Stunden später ankäme, trüge die falsche Uhrzeit.

const SPALTEN = "id,profile_id,beginn,ende,korrigiert_am,korrigiert_von,korrektur_grund,pausen:zeit_pausen(id,beginn,ende)";

export async function fetchZeitStatus(supabase: SupabaseClient): Promise<ZeitStatus> {
  const daten = await q<ZeitStatus>("Die Stempeluhr konnte nicht geladen werden", supabase.rpc("zeit_status"));
  return { jetzt: daten?.jetzt ?? new Date().toISOString(), schicht: daten?.schicht ?? null };
}

// Schichten, die im Zeitraum BEGONNEN haben.
export async function fetchZeitSchichten(supabase: SupabaseClient, von: string, bis: string): Promise<ZeitSchicht[]> {
  return fetchPaged<ZeitSchicht>("Die Arbeitszeiten konnten nicht geladen werden", (a, b) =>
    supabase.from("zeit_schichten").select(SPALTEN).gte("beginn", von).lt("beginn", bis)
      .order("beginn").order("id").range(a, b)
  );
}

// Offene Schichten aller (für den Hinweis „nicht ausgestempelt“), unabhängig von der Woche.
export async function fetchZeitOffene(supabase: SupabaseClient): Promise<ZeitSchicht[]> {
  return (await q<ZeitSchicht[]>("Die offenen Stempelungen konnten nicht geladen werden",
    supabase.from("zeit_schichten").select(SPALTEN).is("ende", null).order("beginn").order("id"))) || [];
}

export async function fetchZeitPersonen(supabase: SupabaseClient): Promise<ZeitPerson[]> {
  return (await q<ZeitPerson[]>("Die Mitarbeiter der Zeiterfassung konnten nicht geladen werden", supabase.rpc("zeit_personen"))) || [];
}

const STEMPEL_RPC: Record<StempelArt, string> = {
  ein: "zeit_einstempeln",
  pause: "zeit_pause_beginnen",
  weiter: "zeit_pause_beenden",
  aus: "zeit_ausstempeln",
};
const STEMPEL_FEHLER: Record<StempelArt, string> = {
  ein: "Einstempeln hat nicht geklappt",
  pause: "Die Pause konnte nicht begonnen werden",
  weiter: "Die Pause konnte nicht beendet werden",
  aus: "Ausstempeln hat nicht geklappt",
};

export async function zeitStempeln(supabase: SupabaseClient, art: StempelArt): Promise<void> {
  await q(STEMPEL_FEHLER[art], supabase.rpc(STEMPEL_RPC[art]));
}

// Korrigieren oder nachtragen (`id` leer). Grund ist Pflicht – das prüft auch die Datenbank.
export async function zeitSchichtSpeichern(supabase: SupabaseClient, s: {
  id: string | null; profileId: string; beginn: string; ende: string | null; pausen: { beginn: string; ende: string }[]; grund: string;
}): Promise<string> {
  const id = await q<string>("Die Korrektur konnte nicht gespeichert werden", supabase.rpc("zeit_schicht_speichern", {
    p_id: s.id, p_profile: s.profileId, p_beginn: s.beginn, p_ende: s.ende, p_pausen: s.pausen, p_grund: s.grund,
  }));
  return id ?? "";
}

export async function zeitSchichtLoeschen(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Die Schicht konnte nicht gelöscht werden", supabase.rpc("zeit_schicht_loeschen", { p_id: id, p_grund: grund }));
}

// ---------------------------------------------------------------------------------------------
// Urlaub und Korrekturen (Migration 83, v136)
// ---------------------------------------------------------------------------------------------

// Eingetragene Urlaubstage im Zeitraum (Tage JJJJ-MM-TT, beide einschließlich).
export async function fetchZeitAbwesenheiten(supabase: SupabaseClient, vonTag: string, bisTag: string): Promise<ZeitAbwesenheit[]> {
  return fetchPaged<ZeitAbwesenheit>("Der Urlaub konnte nicht geladen werden", (a, b) =>
    supabase.from("zeit_abwesenheiten").select("id,profile_id,tag,art,minuten,notiz").gte("tag", vonTag).lte("tag", bisTag)
      .order("tag").order("id").range(a, b)
  );
}

// Die Korrekturen einer Person, die seit `ab` gemacht wurden. Zu welchem Tag sie gehören, sagt
// `korrekturTag()` – eine Korrektur an einer Schicht vom Montag kann am Freitag passiert sein.
export async function fetchZeitKorrekturen(supabase: SupabaseClient, profileId: string, ab: string): Promise<ZeitKorrektur[]> {
  return (await q<ZeitKorrektur[]>("Die Korrekturen konnten nicht geladen werden",
    supabase.from("zeit_korrekturen").select("id,schicht_id,profile_id,vorher,nachher,grund,von,am")
      .eq("profile_id", profileId).gte("am", ab).order("am", { ascending: false }).limit(500))) || [];
}

// Urlaub eintragen (Werktage im Zeitraum) bzw. entfernen – Grund ist Pflicht, Recht „Zeiten aller“.
export async function zeitUrlaubSetzen(supabase: SupabaseClient, u: { profileId: string; von: string; bis: string; minuten: number; grund: string }): Promise<number> {
  return (await q<number>("Der Urlaub konnte nicht eingetragen werden", supabase.rpc("zeit_urlaub_setzen", {
    p_profile: u.profileId, p_von: u.von, p_bis: u.bis, p_minuten: u.minuten, p_grund: u.grund,
  }))) ?? 0;
}

export async function zeitUrlaubLoeschen(supabase: SupabaseClient, u: { profileId: string; von: string; bis: string; grund: string }): Promise<number> {
  return (await q<number>("Der Urlaub konnte nicht entfernt werden", supabase.rpc("zeit_urlaub_loeschen", {
    p_profile: u.profileId, p_von: u.von, p_bis: u.bis, p_grund: u.grund,
  }))) ?? 0;
}

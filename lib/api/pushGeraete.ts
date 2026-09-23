import type { SupabaseClient } from "@supabase/supabase-js";
import { q, qWrite } from "./client";

// Die Geräte, die für das eigene Konto Benachrichtigungen empfangen.
//
// WARUM ES DIESE LISTE GIBT (22.09.2026): Die Einstellungen sagten bis dahin nur „Dieses Gerät
// ist angemeldet" – über alle anderen schwiegen sie. Nach einem Neuinstallieren der App vom
// Startbildschirm bleibt die alte Zustelladresse in der Tabelle stehen: Apple meldet sie nicht
// sofort als tot, und der Aufräumer beim Senden entfernt nur, was ausdrücklich abgelehnt wird.
// Die Meldung lautete dann „An 2 Geräte geschickt", obwohl es ein Telefon gab – und die Frage,
// welches das zweite ist, war nur in der Datenbank zu beantworten.
//
// KEINE ZUSTELLADRESSE VERLÄSST DEN SERVER. Sie ist eine persönliche Adresse beim Push-Dienst
// und hat in der Oberfläche nichts verloren. Ob eine Zeile das GERADE benutzte Gerät ist,
// entscheidet deshalb nicht die Oberfläche, sondern der Vergleich im Aufrufer: Er kennt die
// eigene Adresse ohnehin und schickt sie zum Abgleich mit (siehe `eigenesGeraet`).
//
// Row-Level-Security macht die Absicherung: `push_geraete` lässt seit Migration 26 nur die
// eigenen Zeilen lesen und löschen – auch für Admins, denn eine fremde Push-Anmeldung ist ein
// Zugang zu einem fremden Sperrbildschirm.

export type PushGeraet = {
  id: string;
  geraet: string | null;
  created_at: string;
  last_used_at: string | null;
};

export async function fetchPushGeraete(supabase: SupabaseClient): Promise<PushGeraet[]> {
  return (await q<PushGeraet[]>(
    "Die angemeldeten Geräte konnten nicht geladen werden",
    supabase
      .from("push_geraete")
      .select("id,geraet,created_at,last_used_at")
      .order("created_at", { ascending: true })
  )) ?? [];
}

export async function deletePushGeraet(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Das Gerät konnte nicht entfernt werden",
    supabase.from("push_geraete").delete().eq("id", id)
  );
}

// Welche Zeile gehört zu DIESEM Browser? Der Vergleich läuft über die Kennung der eigenen
// Anmeldung, die nur hier im Browser bekannt ist.
export async function eigenesGeraet(supabase: SupabaseClient, endpoint: string): Promise<string | null> {
  if (!endpoint) return null;
  const treffer = await q<{ id: string }[]>(
    "Die eigene Anmeldung konnte nicht bestimmt werden",
    supabase.from("push_geraete").select("id").eq("endpoint", endpoint).limit(1)
  );
  return treffer && treffer.length > 0 ? treffer[0].id : null;
}

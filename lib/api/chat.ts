import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_LADEN_ANZAHL, type ChatBezug, type ChatNachricht, type ChatPerson } from "@/lib/chat";
import { q, qOne, qWrite } from "./client";

// Datenzugriff für den Team-Chat (Migration 80, v129). Wer lesen und schreiben darf, entscheidet
// die Datenbank (`darf('chat', …)`); hier wird nur gefragt.
//
// Nur mit Netz: Eine Chatnachricht, die erst Stunden später ankommt, wäre schlimmer als eine, die
// gar nicht abgeht – wer offline schreibt, sieht eine Fehlermeldung und kann es noch einmal versuchen.

const SPALTEN = "id,autor,text,bezug_art,bezug_id,bezug_titel,bezug_unter,erwaehnt,created_at";

// Die letzten Nachrichten, älteste zuerst.
export async function fetchChatNachrichten(supabase: SupabaseClient): Promise<ChatNachricht[]> {
  const daten = await q<ChatNachricht[]>(
    "Der Chat konnte nicht geladen werden",
    supabase.from("chat_nachrichten").select(SPALTEN).eq("kanal", "team")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(CHAT_LADEN_ANZAHL)
  );
  return (daten || []).slice().reverse();
}

export async function sendeChatNachricht(
  supabase: SupabaseClient,
  n: { text: string; bezug: ChatBezug | null; erwaehnt: string[] }
): Promise<ChatNachricht> {
  return qOne<ChatNachricht>(
    "Die Nachricht konnte nicht gesendet werden",
    supabase.from("chat_nachrichten").insert({
      text: n.text,
      bezug_art: n.bezug?.art ?? null,
      bezug_id: n.bezug?.id ?? null,
      bezug_titel: n.bezug?.titel ?? null,
      bezug_unter: n.bezug?.unter ?? null,
      erwaehnt: n.erwaehnt,
    }).select(SPALTEN).single()
  );
}

// „Gelesen bis“ auf den Zeitpunkt der neuesten gesehenen Nachricht – die Uhr der Datenbank, nicht
// die des Geräts: Geht das Handy zwei Minuten nach, bliebe sonst eine Nachricht ewig ungelesen.
export async function chatGelesenSetzen(supabase: SupabaseClient, profileId: string, bis: string): Promise<void> {
  await qWrite(
    "Der Lesestand konnte nicht gespeichert werden",
    supabase.from("chat_gelesen").upsert({ profile_id: profileId, gelesen_bis: bis }, { onConflict: "profile_id" })
  );
}

export async function fetchChatUngelesen(supabase: SupabaseClient): Promise<number> {
  const n = await q<number>("Die ungelesenen Nachrichten konnten nicht gezählt werden", supabase.rpc("chat_ungelesen"));
  return typeof n === "number" ? n : 0;
}

export async function fetchChatPersonen(supabase: SupabaseClient): Promise<ChatPerson[]> {
  return (await q<ChatPerson[]>("Die Personen im Chat konnten nicht geladen werden", supabase.rpc("chat_personen"))) || [];
}

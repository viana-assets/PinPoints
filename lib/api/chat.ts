import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_FOTO_BUCKET, CHAT_LADEN_ANZAHL, chatFotoPfad,
  type ChatBezug, type ChatNachricht, type ChatPerson, type ChatUnterhaltung,
} from "@/lib/chat";
import { ApiError, q, qOne, qWrite } from "./client";

// Datenzugriff für den Team-Chat (Migration 80, v129). Wer lesen und schreiben darf, entscheidet
// die Datenbank (`darf('chat', …)`); hier wird nur gefragt.
//
// Nur mit Netz: Eine Chatnachricht, die erst Stunden später ankommt, wäre schlimmer als eine, die
// gar nicht abgeht – wer offline schreibt, sieht eine Fehlermeldung und kann es noch einmal versuchen.

// Seit Migration 81 mit `antwort_auf` und den Reaktionen (über den Fremdschlüssel eingebettet),
// seit Migration 84 mit Kanal, Empfänger, bearbeitet/gelöscht und Foto.
const SPALTEN = "id,kanal,an,autor,text,bezug_art,bezug_id,bezug_titel,bezug_unter,erwaehnt,created_at,antwort_auf,bearbeitet_am,geloescht_am,foto_pfad,foto_breite,foto_hoehe,reaktionen:chat_reaktionen(profile_id,emoji)";

// Die letzten `anzahl` Nachrichten einer Unterhaltung, älteste zuerst. `partner` leer = Team-Chat;
// sonst der Einzelchat zwischen mir und dieser Person (welche Zeilen ich sehe, entscheidet ohnehin
// die Datenbank – hier wird nur auf die eine Unterhaltung eingegrenzt).
export async function fetchChatNachrichten(
  supabase: SupabaseClient,
  ziel: { partner?: string | null; ichId?: string | null; anzahl?: number } = {}
): Promise<ChatNachricht[]> {
  let abfrage = supabase.from("chat_nachrichten").select(SPALTEN);
  if (ziel.partner && ziel.ichId) {
    abfrage = abfrage.eq("kanal", "direkt")
      .or(`and(autor.eq.${ziel.ichId},an.eq.${ziel.partner}),and(autor.eq.${ziel.partner},an.eq.${ziel.ichId})`);
  } else {
    abfrage = abfrage.eq("kanal", "team");
  }
  const daten = await q<ChatNachricht[]>(
    "Der Chat konnte nicht geladen werden",
    abfrage.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(ziel.anzahl ?? CHAT_LADEN_ANZAHL)
  );
  return (daten || []).slice().reverse();
}

export type ChatFotoAnhang = { pfad: string; breite: number; hoehe: number };

export async function sendeChatNachricht(
  supabase: SupabaseClient,
  n: { text: string; bezug: ChatBezug | null; erwaehnt: string[]; antwortAuf?: string | null; an?: string | null; foto?: ChatFotoAnhang | null }
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
      antwort_auf: n.antwortAuf ?? null,
      // Einzelchat und Foto (Migration 84) – nur mitschicken, wenn gebraucht.
      ...(n.an ? { kanal: "direkt", an: n.an } : {}),
      ...(n.foto ? { foto_pfad: n.foto.pfad, foto_breite: n.foto.breite, foto_hoehe: n.foto.hoehe } : {}),
    }).select(SPALTEN).single()
  );
}

// Bearbeiten und Löschen (Migration 84): nur die eigene Nachricht, Bearbeiten nur 24 Stunden – das
// prüft die Datenbank; ihre Meldung kommt so, wie sie ist, beim Nutzer an.
export async function chatNachrichtBearbeiten(supabase: SupabaseClient, id: string, text: string): Promise<void> {
  await qWrite("Die Nachricht konnte nicht geändert werden",
    supabase.from("chat_nachrichten").update({ text }).eq("id", id));
}

export async function chatNachrichtLoeschen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Die Nachricht konnte nicht gelöscht werden",
    supabase.from("chat_nachrichten").update({ geloescht_am: new Date().toISOString() }).eq("id", id));
}

// Ein Foto (schon verkleinert, lib/belegBild.ts) in den eigenen Ordner laden. Gibt den Pfad zurück,
// der dann mit der Nachricht geschrieben wird.
export async function chatFotoHochladen(
  supabase: SupabaseClient,
  ichId: string,
  datei: Blob,
  masse: { breite: number; hoehe: number }
): Promise<ChatFotoAnhang> {
  const zufall = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 10);
  const pfad = chatFotoPfad(ichId, zufall, new Date(), datei.type === "image/png" ? "png" : "jpg");
  const { error } = await supabase.storage.from(CHAT_FOTO_BUCKET).upload(pfad, datei, { contentType: datei.type || "image/jpeg", upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("Fotos im Chat gehen erst nach Migration 84.");
    if (/payload too large|exceeded the maximum|413/i.test(error.message)) throw new Error("Das Foto ist zu groß (höchstens 3 MB).");
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error("Keine Berechtigung, im Chat Fotos zu senden.");
    throw new Error(`Das Foto konnte nicht hochgeladen werden (${error.message}).`);
  }
  return { pfad, ...masse };
}

// Kam die Nachricht nicht an, die eben hochgeladene Datei wieder entfernen (eigener Ordner).
export async function chatFotoVerwerfen(supabase: SupabaseClient, pfad: string): Promise<void> {
  await supabase.storage.from(CHAT_FOTO_BUCKET).remove([pfad]).catch(() => {});
}

// Zeitlich begrenzte Links zum Anzeigen (eine Stunde) – wie bei den Auftragsfotos.
export async function chatFotoLinks(supabase: SupabaseClient, pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {};
  const { data, error } = await supabase.storage.from(CHAT_FOTO_BUCKET).createSignedUrls(pfade, 3600);
  if (error) throw new ApiError("Die Fotos konnten nicht geladen werden", { message: error.message });
  const links: Record<string, string> = {};
  for (const z of data ?? []) if (z.path && z.signedUrl) links[z.path] = z.signedUrl;
  return links;
}

export async function fetchChatUnterhaltungen(supabase: SupabaseClient): Promise<ChatUnterhaltung[]> {
  return (await q<ChatUnterhaltung[]>("Die Unterhaltungen konnten nicht geladen werden", supabase.rpc("chat_unterhaltungen"))) || [];
}

// „Gelesen bis“ auf den Zeitpunkt der neuesten gesehenen Nachricht – die Uhr der Datenbank, nicht
// die des Geräts: Geht das Handy zwei Minuten nach, bliebe sonst eine Nachricht ewig ungelesen.
export async function chatGelesenSetzen(supabase: SupabaseClient, profileId: string, bis: string): Promise<void> {
  await qWrite(
    "Der Lesestand konnte nicht gespeichert werden",
    supabase.from("chat_gelesen").upsert({ profile_id: profileId, gelesen_bis: bis }, { onConflict: "profile_id" })
  );
}

// Lesestand im Einzelchat (Migration 84): je Partner ein eigenes „gelesen bis“.
export async function chatGelesenDirektSetzen(supabase: SupabaseClient, profileId: string, partner: string, bis: string): Promise<void> {
  await qWrite(
    "Der Lesestand konnte nicht gespeichert werden",
    supabase.from("chat_gelesen_direkt").upsert({ profile_id: profileId, partner, gelesen_bis: bis }, { onConflict: "profile_id,partner" })
  );
}

export async function fetchChatUngelesen(supabase: SupabaseClient): Promise<number> {
  const n = await q<number>("Die ungelesenen Nachrichten konnten nicht gezählt werden", supabase.rpc("chat_ungelesen"));
  return typeof n === "number" ? n : 0;
}

export async function fetchChatPersonen(supabase: SupabaseClient): Promise<ChatPerson[]> {
  return (await q<ChatPerson[]>("Die Personen im Chat konnten nicht geladen werden", supabase.rpc("chat_personen"))) || [];
}

// Reaktion setzen oder ersetzen (Migration 81): je Nachricht und Zugang höchstens eine. `null`
// nimmt sie zurück.
export async function chatReaktionSetzen(supabase: SupabaseClient, profileId: string, nachrichtId: string, emoji: string | null): Promise<void> {
  if (emoji === null) {
    await qWrite(
      "Die Reaktion konnte nicht zurückgenommen werden",
      supabase.from("chat_reaktionen").delete().eq("nachricht_id", nachrichtId).eq("profile_id", profileId)
    );
    return;
  }
  await qWrite(
    "Die Reaktion konnte nicht gespeichert werden",
    supabase.from("chat_reaktionen").upsert({ nachricht_id: nachrichtId, profile_id: profileId, emoji }, { onConflict: "nachricht_id,profile_id" })
  );
}

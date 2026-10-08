"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatGelesenSetzen, chatReaktionSetzen, sendeChatNachricht } from "@/lib/api/chat";
import type { ChatBezug, ChatNachricht, ChatPerson } from "@/lib/chat";
import { useChatNachrichten, useChatPersonen, useChatUngelesen } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";

// Der Team-Chat auf der Startseite (Migration 80, v129): ob er offen ist, welche Karte an der
// Eingabe hängt, die Zahl der Ungelesenen – und die Live-Verbindung, über die neue Nachrichten
// ohne Neuladen erscheinen. Nach dem Muster der Handlungs-Hooks (useLagerAktionen & Co.).
//
// Gelesen ist, was bei offenem Chat geladen war: Der Lesestand rückt auf die neueste Nachricht
// vor, sobald sie im offenen Fenster angekommen ist. Die Zahl am App-Symbol (`setAppBadge`) folgt
// der Zahl an der Blase; der Service Worker setzt sie zusätzlich beim Eintreffen einer Meldung.

const KEINE_NACHRICHTEN: ChatNachricht[] = [];
const KEINE_PERSONEN: ChatPerson[] = [];

type Abzeichen = Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export type ChatKontext = {
  supabase: SupabaseClient;
  // Sitzung steht und die Rolle darf den Chat lesen.
  aktiv: boolean;
  meineId: string | null;
};

export function useChat({ supabase, aktiv, meineId }: ChatKontext) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [bezug, setBezug] = useState<ChatBezug | null>(null);

  const nachrichtenQuery = useChatNachrichten(supabase, aktiv && offen);
  const ungelesenQuery = useChatUngelesen(supabase, aktiv);
  const personenQuery = useChatPersonen(supabase, aktiv && offen);

  // Live: jede neue Zeile in `chat_nachrichten` macht Verlauf und Zahl ungültig. Was die Rolle
  // nicht lesen darf, schickt Supabase Realtime gar nicht erst (es prüft dieselbe Regel).
  useEffect(() => {
    if (!aktiv) return;
    const kanal = supabase
      .channel("team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_nachrichten" }, () => {
        void queryClient.invalidateQueries({ queryKey: qk.chat() });
      })
      // Reaktionen (Migration 81): setzen, ändern, zurücknehmen – nur der Verlauf, die Zahl nicht.
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reaktionen" }, () => {
        void queryClient.invalidateQueries({ queryKey: qk.chatNachrichten() });
      })
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
  }, [aktiv, supabase, queryClient]);

  // Lesestand vorrücken, solange der Chat offen ist.
  const neueste = nachrichtenQuery.data?.at(-1)?.created_at ?? null;
  const gemeldet = useRef<string | null>(null);
  useEffect(() => {
    if (!offen || !neueste || !meineId || gemeldet.current === neueste) return;
    gemeldet.current = neueste;
    chatGelesenSetzen(supabase, meineId, neueste)
      .then(() => queryClient.invalidateQueries({ queryKey: qk.chatUngelesen() }))
      .catch(() => { gemeldet.current = null; });
  }, [offen, neueste, meineId, supabase, queryClient]);

  const ungelesen = offen || !aktiv ? 0 : (ungelesenQuery.data ?? 0);

  // Das rote Abzeichen am App-Symbol. Wo das Gerät es nicht kann, passiert nichts.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const n = navigator as Abzeichen;
    if (!n.setAppBadge || !n.clearAppBadge) return;
    void (ungelesen > 0 ? n.setAppBadge(ungelesen) : n.clearAppBadge()).catch(() => {});
  }, [ungelesen]);

  function oeffnen() { setOffen(true); }
  function schliessen() { setOffen(false); setBezug(null); }
  function inDenChat(b: ChatBezug) { setBezug(b); setOffen(true); }

  async function senden(n: { text: string; bezug: ChatBezug | null; erwaehnt: string[]; antwortAuf?: string | null }) {
    await sendeChatNachricht(supabase, n);
    setBezug(null);
    await queryClient.invalidateQueries({ queryKey: qk.chatNachrichten() });
  }

  // Reaktion setzen, ersetzen oder (null) zurücknehmen (Migration 81).
  async function reagieren(nachrichtId: string, emoji: string | null) {
    if (!meineId) return;
    await chatReaktionSetzen(supabase, meineId, nachrichtId, emoji);
    await queryClient.invalidateQueries({ queryKey: qk.chatNachrichten() });
  }

  return {
    offen, oeffnen, schliessen, inDenChat, bezug, setBezug, senden, reagieren, ungelesen,
    nachrichten: nachrichtenQuery.data ?? KEINE_NACHRICHTEN,
    laedt: nachrichtenQuery.isPending,
    fehler: nachrichtenQuery.error ? nachrichtenQuery.error.message : null,
    personen: personenQuery.data ?? KEINE_PERSONEN,
  };
}

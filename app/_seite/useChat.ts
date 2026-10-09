"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chatFotoHochladen, chatFotoVerwerfen, chatGelesenDirektSetzen, chatGelesenSetzen, chatNachrichtBearbeiten,
  chatNachrichtLoeschen, chatReaktionSetzen, sendeChatNachricht,
} from "@/lib/api/chat";
import {
  CHAT_LADEN_ANZAHL, CHAT_NACHLADEN_ANZAHL,
  type ChatBezug, type ChatFotoAuswahl, type ChatNachricht, type ChatPerson, type ChatUnterhaltung,
} from "@/lib/chat";
import { useChatFotoLinks, useChatHaken, useChatNachrichten, useChatPersonen, useChatUngelesen, useChatUnterhaltungen } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";

// Der Team-Chat auf der Startseite (Migration 80, v129): ob er offen ist, welche Karte an der
// Eingabe hängt, die Zahl der Ungelesenen – und die Live-Verbindung, über die neue Nachrichten
// ohne Neuladen erscheinen. Nach dem Muster der Handlungs-Hooks (useLagerAktionen & Co.).
//
// Gelesen ist, was bei offenem Chat geladen war: Der Lesestand rückt auf die neueste Nachricht
// vor, sobald sie im offenen Fenster angekommen ist. Die Zahl am App-Symbol (`setAppBadge`) folgt
// der Zahl an der Blase; der Service Worker setzt sie zusätzlich beim Eintreffen einer Meldung.
//
// Seit Migration 84 (v137): Einzelchats (`partner` – leer ist der Team-Chat, je Unterhaltung ein
// eigener Lesestand), Bearbeiten und Löschen der eigenen Nachricht, Fotos und „Ältere laden“.

const KEINE_NACHRICHTEN: ChatNachricht[] = [];
const KEINE_PERSONEN: ChatPerson[] = [];
const KEINE_UNTERHALTUNGEN: ChatUnterhaltung[] = [];

type Abzeichen = Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export type ChatKontext = {
  supabase: SupabaseClient;
  // Sitzung steht und die Rolle darf den Chat lesen.
  aktiv: boolean;
  meineId: string | null;
};

export type ChatSenden = {
  text: string; bezug: ChatBezug | null; erwaehnt: string[]; antwortAuf?: string | null; foto?: ChatFotoAuswahl | null;
};

export function useChat({ supabase, aktiv, meineId }: ChatKontext) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [bezug, setBezug] = useState<ChatBezug | null>(null);
  const [partner, setPartner] = useState<string | null>(null);
  const [anzahl, setAnzahl] = useState(CHAT_LADEN_ANZAHL);

  const nachrichtenQuery = useChatNachrichten(supabase, aktiv && offen, { partner, ichId: meineId, anzahl });
  const ungelesenQuery = useChatUngelesen(supabase, aktiv);
  const personenQuery = useChatPersonen(supabase, aktiv && offen);
  const unterhaltungenQuery = useChatUnterhaltungen(supabase, aktiv && offen);
  const hakenQuery = useChatHaken(supabase, aktiv && offen, partner);

  // Live: jede neue oder geänderte Zeile in `chat_nachrichten` macht Verlauf, Liste und Zahl
  // ungültig. Was die Rolle nicht lesen darf (fremde Einzelchats), schickt Supabase Realtime gar
  // nicht erst – es prüft dieselbe Regel.
  useEffect(() => {
    if (!aktiv) return;
    const kanal = supabase
      .channel("team-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_nachrichten" }, () => {
        void queryClient.invalidateQueries({ queryKey: qk.chat() });
      })
      // Bearbeitet oder gelöscht (Migration 84).
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_nachrichten" }, () => {
        void queryClient.invalidateQueries({ queryKey: qk.chat() });
      })
      // Reaktionen (Migration 81): setzen, ändern, zurücknehmen – nur der Verlauf, die Zahl nicht.
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reaktionen" }, () => {
        void queryClient.invalidateQueries({ queryKey: qk.chatNachrichten() });
      })
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
  }, [aktiv, supabase, queryClient]);

  // Der Verlauf gehört zur gewählten Unterhaltung erst, wenn er kein Platzhalter mehr ist.
  const nachrichten = nachrichtenQuery.data ?? KEINE_NACHRICHTEN;
  const echt = !!nachrichtenQuery.data && !nachrichtenQuery.isPlaceholderData;

  // Lesestand vorrücken, solange der Chat offen ist – je Unterhaltung.
  const neueste = echt ? nachrichten.at(-1)?.created_at ?? null : null;
  const gemeldet = useRef<string | null>(null);
  useEffect(() => {
    const schluessel = `${partner ?? "team"}|${neueste}`;
    if (!offen || !neueste || !meineId || gemeldet.current === schluessel) return;
    gemeldet.current = schluessel;
    (partner ? chatGelesenDirektSetzen(supabase, meineId, partner, neueste) : chatGelesenSetzen(supabase, meineId, neueste))
      .then(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.chatUngelesen() }),
        queryClient.invalidateQueries({ queryKey: qk.chatUnterhaltungen() }),
      ]))
      .catch(() => { gemeldet.current = null; });
  }, [offen, neueste, partner, meineId, supabase, queryClient]);

  const ungelesen = offen || !aktiv ? 0 : (ungelesenQuery.data ?? 0);

  // Das rote Abzeichen am App-Symbol. Wo das Gerät es nicht kann, passiert nichts.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const n = navigator as Abzeichen;
    if (!n.setAppBadge || !n.clearAppBadge) return;
    void (ungelesen > 0 ? n.setAppBadge(ungelesen) : n.clearAppBadge()).catch(() => {});
  }, [ungelesen]);

  // Fotos: Links für alle Bilder im Verlauf (eine Stunde gültig, lib/queries/hooks.ts).
  const fotoPfade = useMemo(
    () => Array.from(new Set(nachrichten.map((n) => n.foto_pfad).filter((x): x is string => !!x))).sort(),
    [nachrichten]
  );
  const fotoLinks = useChatFotoLinks(supabase, fotoPfade, aktiv && offen);

  function oeffnen(ziel: string | null = partner) {
    if (ziel !== partner) { setPartner(ziel); setAnzahl(CHAT_LADEN_ANZAHL); }
    setOffen(true);
  }
  function schliessen() { setOffen(false); setBezug(null); }
  function inDenChat(b: ChatBezug) { setBezug(b); setOffen(true); }
  function wechseln(ziel: string | null) {
    if (ziel === partner) return;
    setPartner(ziel);
    setAnzahl(CHAT_LADEN_ANZAHL);
  }
  function mehrLaden() { setAnzahl((a) => a + CHAT_NACHLADEN_ANZAHL); }

  async function senden(n: ChatSenden) {
    if (!meineId) return;
    // Erst die Datei, dann die Zeile (wie bei den Auftragsfotos). Kommt die Zeile nicht an, geht
    // die Datei wieder weg.
    const foto = n.foto ? await chatFotoHochladen(supabase, meineId, n.foto.blob, { breite: n.foto.breite, hoehe: n.foto.hoehe }) : null;
    try {
      await sendeChatNachricht(supabase, { text: n.text, bezug: n.bezug, erwaehnt: n.erwaehnt, antwortAuf: n.antwortAuf, an: partner, foto });
    } catch (e) {
      if (foto) await chatFotoVerwerfen(supabase, foto.pfad);
      throw e;
    }
    setBezug(null);
    await queryClient.invalidateQueries({ queryKey: qk.chat() });
  }

  async function bearbeiten(id: string, text: string) {
    await chatNachrichtBearbeiten(supabase, id, text);
    await queryClient.invalidateQueries({ queryKey: qk.chat() });
  }

  async function loeschen(id: string) {
    await chatNachrichtLoeschen(supabase, id);
    await queryClient.invalidateQueries({ queryKey: qk.chat() });
  }

  // Reaktion setzen, ersetzen oder (null) zurücknehmen (Migration 81).
  async function reagieren(nachrichtId: string, emoji: string | null) {
    if (!meineId) return;
    await chatReaktionSetzen(supabase, meineId, nachrichtId, emoji);
    await queryClient.invalidateQueries({ queryKey: qk.chatNachrichten() });
  }

  return {
    offen, oeffnen, schliessen, inDenChat, bezug, setBezug, senden, reagieren, bearbeiten, loeschen, ungelesen,
    partner, wechseln, mehrLaden,
    // Voll geladen = es kamen so viele, wie angefragt – dann gibt es vielleicht noch ältere.
    hatMehr: echt && nachrichten.length >= anzahl,
    laedtMehr: nachrichtenQuery.isFetching && nachrichtenQuery.isPlaceholderData,
    nachrichten: echt || nachrichtenQuery.isPlaceholderData ? nachrichten : KEINE_NACHRICHTEN,
    laedt: nachrichtenQuery.isPending,
    fehler: nachrichtenQuery.error ? nachrichtenQuery.error.message : null,
    personen: personenQuery.data ?? KEINE_PERSONEN,
    unterhaltungen: unterhaltungenQuery.data ?? KEINE_UNTERHALTUNGEN,
    fotoLinks,
    haken: hakenQuery.data ?? null,
  };
}

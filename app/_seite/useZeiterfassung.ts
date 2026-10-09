"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zeitFeierabend, zeitStempeln } from "@/lib/api/zeiterfassung";
import { useZeitSchichten, useZeitStatus } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { tagVon, wochenMontag, zustand, type StempelArt, type ZeitSchicht } from "@/lib/zeiterfassung";

// Die Stempeluhr auf der Startseite (Migration 82, v131): der eigene Stand, die Stempel-Handlungen
// und das Blatt, das die grüne Anzeige oben rechts öffnet. Nach dem Muster der Handlungs-Hooks.
//
// Die Uhr des Geräts kann falsch gehen. Die Datenbank liefert deshalb mit jedem Stand ihre eigene
// Uhrzeit; `versatzMs` ist der Unterschied, und die laufende Anzeige rechnet damit. Eine Stempelung
// selbst trägt ohnehin immer die Uhrzeit der Datenbank.
//
// Nur mit Netz – keine Absicht im Ausgangskorb: Eine Stempelung, die erst Stunden später ankäme,
// trüge die Uhrzeit ihres Eintreffens.

export type ZeitKontext = {
  supabase: SupabaseClient;
  // Sitzung steht und die Rolle darf die eigenen Zeiten sehen.
  aktiv: boolean;
  meineId: string | null;
};

const KEINE: ZeitSchicht[] = [];

export function useZeiterfassung({ supabase, aktiv, meineId }: ZeitKontext) {
  const queryClient = useQueryClient();
  const statusQuery = useZeitStatus(supabase, aktiv);
  // Die laufende Woche für „Woche: 31:20 h“ an der Stempeluhr. Einmal beim Start festgelegt; wer die
  // App über das Wochenende offen lässt, sieht am Montag nach dem nächsten Laden die neue Woche.
  const [montag] = useState(() => wochenMontag(tagVon(new Date())));
  const wocheQuery = useZeitSchichten(supabase, montag, aktiv);
  const [blattOffen, setBlattOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const schicht = statusQuery.data?.schicht ?? null;
  const versatzMs = statusQuery.data ? new Date(statusQuery.data.jetzt).getTime() - statusQuery.dataUpdatedAt : 0;

  async function stempeln(art: StempelArt) {
    setLaeuft(true);
    setFehler(null);
    try {
      await zeitStempeln(supabase, art);
      await queryClient.invalidateQueries({ queryKey: qk.zeit() });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Stempeln hat nicht geklappt.");
      // Der Stand kann sich auf einem anderen Gerät geändert haben – neu holen.
      void queryClient.invalidateQueries({ queryKey: qk.zeitStatus() });
    } finally {
      setLaeuft(false);
    }
  }

  // „Für heute fertig? – Ja“ (Migration 85): ausstempeln mit Heimfahrt. Fehler gehen an das Fenster.
  async function feierabend() {
    try {
      await zeitFeierabend(supabase);
    } finally {
      await queryClient.invalidateQueries({ queryKey: qk.zeit() });
    }
  }

  return {
    schicht,
    zustand: zustand(schicht),
    versatzMs,
    montag,
    wocheSchichten: (wocheQuery.data ?? KEINE).filter((s) => s.profile_id === meineId),
    stempeln,
    feierabend,
    laeuft,
    fehler,
    blattOffen,
    setBlattOffen: (offen: boolean) => { setBlattOffen(offen); if (!offen) setFehler(null); },
  };
}

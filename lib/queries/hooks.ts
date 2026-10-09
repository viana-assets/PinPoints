"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { qk } from "./keys";
import { fetchCustomers, fetchContactHistory } from "@/lib/api/customers";
import { fetchGepackt } from "@/lib/api/mitnehmen";
import { fetchOrders, fetchOrdersFuerKunde, type AuftragsFenster, type Auftragsdaten } from "@/lib/api/orders";
import { fetchEmployees } from "@/lib/api/employees";
import { fetchFirmenfahrzeuge } from "@/lib/api/firmenfahrzeuge";
import { fetchVerfuegbarkeiten } from "@/lib/api/verfuegbarkeit";
import { chatEmpfangen, chatFotoLinks, fetchChatHaken, fetchChatNachrichten, fetchChatPersonen, fetchChatUngelesen, fetchChatUnterhaltungen } from "@/lib/api/chat";
import { CHAT_ABFRAGE_MS } from "@/lib/chat";
import { fetchZeitAbwesenheiten, fetchZeitKorrekturen, fetchZeitOffene, fetchZeitPersonen, fetchZeitSchichten, fetchZeitStatus } from "@/lib/api/zeiterfassung";
import { monatVonBis, wocheVonBis, ZEIT_STATUS_ABFRAGE_MS } from "@/lib/zeiterfassung";
import { fetchAuftragFahrzeuge } from "@/lib/api/auftragFahrzeuge";
import { fetchVehiclesFuerKunden } from "@/lib/api/vehicles";
import type { Order } from "@/lib/types";
import { fetchVehicles, fetchVehiclesFuerKunde } from "@/lib/api/vehicles";
import { fetchArticles, fetchArticlePrices } from "@/lib/api/articles";
import { fetchVorlagen } from "@/lib/api/vorlagen";
import {
  fetchWarehouses, fetchStorageSlots, fetchTireStorages, fetchLagerKennzahlen,
  fetchEingelagerteRaeder,
} from "@/lib/api/lager";
import { fetchModulePermissions } from "@/lib/api/permissions";
import { fetchVerkaufsreifen } from "@/lib/api/verkaufsreifen";
import { fetchBetrieb } from "@/lib/api/betrieb";
import { fetchRechnungen, fetchRechnungenZuAuftrag } from "@/lib/api/rechnungen";
import { belegLinks, fetchBelege } from "@/lib/api/belege";

// Datenbestände der Anwendung als Abfragen (Roadmap Phase 10).
//
// Vorher lud `HomePage` beim Start zwölf Tabellen vollständig und nacheinander, bevor
// überhaupt etwas zu sehen war – und nach jeder einzelnen Änderung die betroffene Tabelle
// komplett neu. Ein Häkchen im Mitarbeiter-Popover zog einen Vollabzug nach sich.
//
// Jetzt gilt: jeder Datenbestand wird geladen, wenn er gebraucht wird (`aktiv`), danach
// zwischengespeichert, und nach einer Änderung wird gezielt der betroffene Schlüssel für
// ungültig erklärt. Die Oberfläche bekommt weiterhin einfache Arrays – an den Panels ändert
// sich nichts.
//
// Bewusst NICHT nach Bedarf, sondern immer geladen: Kunden und das Auftrags-Zeitfenster. Beide
// stecken in der Karte, im Dashboard und in fast jeder Liste; sie erst beim Tabwechsel zu holen
// würde nur ein Flackern erzeugen, ohne etwas zu sparen.
//
// ABER: auch diese beiden warten auf `aktiv`. Jede Abfrage hier bekommt einen solchen Schalter,
// und app/page.tsx setzt ihn erst, wenn die Anmeldung fertig geprüft ist. Sonst starten die
// Abfragen parallel zum Sitzungs-Bootstrap und können ihn überholen – dann geht die erste
// Anfrage mit einem abgelaufenen Zugriffstoken hinaus und Supabase antwortet mit 401, während
// im Hintergrund gerade ein frisches Token geholt wird.

// Zwischenspeicher-Dauer: eine Minute gilt ein Bestand als frisch. Kurz genug, dass Änderungen
// eines Kollegen zeitnah ankommen, lang genug, dass ein Tabwechsel nicht jedes Mal neu lädt.
const FRISCH_MS = 60_000;

export function useKunden(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.kunden(),
    queryFn: () => fetchCustomers(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useAuftraege(supabase: SupabaseClient, fenster: AuftragsFenster, aktiv: boolean) {
  return useQuery<Auftragsdaten>({
    queryKey: qk.auftraege(fenster),
    queryFn: () => fetchOrders(supabase, fenster),
    enabled: aktiv,
    staleTime: FRISCH_MS,
    // Beim Umschalten des Zeitfensters die bisherigen Zeilen stehen lassen, statt die Liste
    // kurz leer zu zeigen.
    placeholderData: (vorher) => vorher,
  });
}

export function useKundenAuftraege(supabase: SupabaseClient, kundeId: string | null, aktiv: boolean) {
  return useQuery<Auftragsdaten>({
    queryKey: qk.kundeAuftraege(kundeId || "-"),
    queryFn: () => fetchOrdersFuerKunde(supabase, kundeId as string),
    enabled: aktiv && !!kundeId,
    staleTime: FRISCH_MS,
  });
}

// Die eigenen Transporter. Klein und selten geändert – wird überall dort gebraucht, wo ein
// Auftrag eingeteilt oder angezeigt wird.
export function useFirmenfahrzeuge(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.firmenfahrzeuge(),
    queryFn: () => fetchFirmenfahrzeuge(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Verfügbarkeit der Mitarbeiter (Migration 68): ab zwei Monaten zurück. Für die Einsatzplanung
// und das Auftragsfenster (Teamauswahl).
export function useVerfuegbarkeiten(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.verfuegbarkeiten(),
    queryFn: () => {
      const d = new Date();
      d.setDate(d.getDate() - 62);
      return fetchVerfuegbarkeiten(supabase, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    },
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Die Fahrzeuge am geöffneten Auftrag (Migration 44). Bis v112 ein `useEffect` mit eigenem Zustand
// in app/page.tsx – und damit offline leer: Was nicht im Zwischenspeicher liegt, kennt das Gerät
// ohne Netz nicht (Offline Runde 2, v113).
export function useAuftragFahrzeuge(supabase: SupabaseClient, orderId: string | null, aktiv: boolean) {
  return useQuery({
    queryKey: qk.auftragFahrzeuge(orderId || "-"),
    queryFn: () => fetchAuftragFahrzeuge(supabase, [orderId as string]),
    enabled: aktiv && !!orderId,
    staleTime: FRISCH_MS,
  });
}

// Wie weit voraus der Vorrat reicht, und wie weit zurück (ein Termin von gestern wird oft erst
// heute fertig erfasst).
export const VORRAT_TAGE_VORAUS = 14;
export const VORRAT_TAGE_ZURUECK = 1;

// Der Vorrat für unterwegs (Offline Runde 2, v113): Für die kommenden offenen Aufträge werden die
// Fahrzeuge am Auftrag und die Fahrzeuge der Kunden geladen, solange Netz da ist, und in die
// Einzelspeicher der Auftrags- und Kundenfenster gelegt. Wer morgens die App öffnet, hat damit am
// Nachmittag ohne Netz noch Kennzeichen und Kilometerstand jedes Termins – auch von Aufträgen, die
// er online nie geöffnet hat.
export function useEinsatzVorrat(supabase: SupabaseClient, auftraege: Order[], aktiv: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.einsatzVorrat(),
    queryFn: async () => {
      const heute = new Date();
      const tag = (n: number) => { const d = new Date(heute); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
      const von = tag(-VORRAT_TAGE_ZURUECK), bis = tag(VORRAT_TAGE_VORAUS);
      const kommend = auftraege.filter((o) => (o.status === "offen" || o.status === "in_arbeit") && !o.deleted_at
        && o.order_date >= von && o.order_date <= bis).slice(0, 300);
      const zuordnungen = await fetchAuftragFahrzeuge(supabase, kommend.map((o) => o.id));
      const kundenIds = [...new Set(kommend.map((o) => o.customer_id))];
      const fahrzeuge = await fetchVehiclesFuerKunden(supabase, kundenIds);
      for (const o of kommend) {
        queryClient.setQueryData(qk.auftragFahrzeuge(o.id), zuordnungen.filter((z) => z.order_id === o.id));
      }
      for (const k of kundenIds) {
        queryClient.setQueryData(qk.kundeFahrzeuge(k), fahrzeuge.filter((v) => v.customer_id === k));
      }
      return { auftraege: kommend.length, stand: new Date().toISOString() };
    },
    enabled: aktiv && auftraege.length > 0,
    staleTime: 10 * 60_000,
  });
}

// Alle Fahrzeuge – für Lager und Saisonliste, wo viele Sätze nebeneinander stehen.
export function useFahrzeuge(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.fahrzeuge(),
    queryFn: () => fetchVehicles(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useKundeFahrzeuge(supabase: SupabaseClient, kundeId: string | null, aktiv: boolean) {
  return useQuery({
    queryKey: qk.kundeFahrzeuge(kundeId || "-"),
    queryFn: () => fetchVehiclesFuerKunde(supabase, kundeId as string),
    enabled: aktiv && !!kundeId,
    staleTime: FRISCH_MS,
  });
}

export function useKundeHistorie(supabase: SupabaseClient, kundeId: string | null, aktiv: boolean) {
  return useQuery({
    queryKey: qk.kundeHistorie(kundeId || "-"),
    queryFn: () => fetchContactHistory(supabase, kundeId as string),
    enabled: aktiv && !!kundeId,
    staleTime: FRISCH_MS,
  });
}

export function useMitarbeiter(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.mitarbeiter(),
    queryFn: () => fetchEmployees(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useVorlagen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.vorlagen(),
    queryFn: () => fetchVorlagen(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useArtikel(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.artikel(),
    queryFn: () => fetchArticles(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useArtikelpreise(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.artikelpreise(),
    queryFn: () => fetchArticlePrices(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useLager(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.lager(),
    queryFn: () => fetchWarehouses(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useLagerplaetze(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.lagerplaetze(),
    queryFn: () => fetchStorageSlots(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useEinlagerungen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.einlagerungen(),
    queryFn: () => fetchTireStorages(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Für die Dashboard-Kachel: zwei count-Abfragen statt des kompletten Lagers.
// Die einzeln erfassten Räder. Eine schmale Tabelle – vier Zeilen je Satz, nur bei
// Einzelerfassung –, deshalb als Vollabzug wie die Einlagerungen selbst.
export function useEingelagerteRaeder(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.eingelagerteRaeder(),
    queryFn: () => fetchEingelagerteRaeder(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Reifenverkauf (Migration 61): eine schmale Tabelle, als Vollabzug wie die Einlagerungen.
export function useVerkaufsreifen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.verkaufsreifen(),
    queryFn: () => fetchVerkaufsreifen(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useLagerKennzahlen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.lagerKennzahlen(),
    queryFn: () => fetchLagerKennzahlen(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Haken bei „Reifen mitnehmen" (Migration 58). Alle 30 Sekunden neu, solange das Dashboard
// offen ist: Das Büro soll sehen, was der Techniker gerade einlädt, ohne neu zu laden.
export function useGepackt(supabase: SupabaseClient, daten: string[], aktiv: boolean) {
  return useQuery({
    queryKey: qk.gepackt(daten),
    queryFn: () => fetchGepackt(supabase, daten),
    enabled: aktiv && daten.length > 0,
    staleTime: 15_000,
    refetchInterval: aktiv ? 30_000 : false,
  });
}

export function useModulrechte(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.modulrechte(),
    queryFn: () => fetchModulePermissions(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Der Briefkopf (Migration 48). Er ändert sich fast nie und steht auf jeder Rechnung – also
// länger frisch als alles andere. Eine Minute wäre hier nur Netzverkehr.
const BRIEFKOPF_FRISCH_MS = 10 * 60_000;

export function useBetrieb(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.betrieb(),
    queryFn: () => fetchBetrieb(supabase),
    enabled: aktiv,
    staleTime: BRIEFKOPF_FRISCH_MS,
  });
}

export function useRechnungen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.rechnungen(),
    queryFn: () => fetchRechnungen(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

// Die Belege zu EINEM Auftrag. Getrennt vom Vollabzug: Das Auftragsfenster soll nicht alle
// Rechnungen des Hauses laden, um eine anzuzeigen.
export function useAuftragRechnungen(supabase: SupabaseClient, orderId: string | null, aktiv: boolean) {
  return useQuery({
    queryKey: qk.auftragRechnungen(orderId ?? "-"),
    queryFn: () => fetchRechnungenZuAuftrag(supabase, orderId!),
    enabled: aktiv && !!orderId,
    staleTime: FRISCH_MS,
  });
}

// Fotos und Unterschrift eines Auftrags (Migration 65, E3) – nur solange das Auftragsfenster offen ist.
export function useAuftragBelege(supabase: SupabaseClient, orderId: string | null, aktiv: boolean) {
  return useQuery({
    queryKey: qk.auftragBelege(orderId ?? "-"),
    queryFn: () => fetchBelege(supabase, orderId!),
    enabled: aktiv && !!orderId,
    staleTime: FRISCH_MS,
  });
}

// Die Anzeige-Links gelten eine Stunde (lib/api/belege.ts). Nach 45 Minuten gelten sie hier als
// alt und werden beim nächsten Öffnen neu geholt, nach 50 Minuten fliegen sie aus dem Speicher –
// ein abgelaufener Link wäre ein kaputtes Bild.
const BELEG_LINK_FRISCH_MS = 45 * 60_000;
export function useBelegLinks(supabase: SupabaseClient, pfade: string[], aktiv: boolean) {
  return useQuery({
    queryKey: qk.belegLinks(pfade),
    queryFn: () => belegLinks(supabase, pfade),
    enabled: aktiv && pfade.length > 0,
    staleTime: BELEG_LINK_FRISCH_MS,
    // Nicht in den Offline-Lesespeicher – das regelt app/providers.tsx über den Schlüssel.
    gcTime: BELEG_LINK_FRISCH_MS + 5 * 60_000,
  });
}

// Team-Chat (Migration 80, v129). Neue Nachrichten kommen live (app/_seite/useChat.ts hört auf
// Supabase Realtime und erklärt `qk.chat()` für ungültig); die Abfrage im Takt ist nur der
// Rückfall, falls die Live-Verbindung nicht steht. Der Verlauf wird nur geladen, solange der Chat
// offen ist – die Zahl an der Blase immer.
//
// Seit Migration 84 je Unterhaltung (Team oder Einzelchat) und mit wachsender Anzahl („Ältere
// laden“). Beim Nachladen bleibt der bisherige Verlauf stehen, bis der längere da ist – beim
// Wechsel in eine andere Unterhaltung nicht (sonst stünde kurz der falsche Chat da).
export function useChatNachrichten(
  supabase: SupabaseClient,
  aktiv: boolean,
  ziel: { partner: string | null; ichId: string | null; anzahl: number }
) {
  return useQuery({
    queryKey: qk.chatVerlauf(ziel.partner, ziel.anzahl),
    queryFn: () => fetchChatNachrichten(supabase, ziel),
    enabled: aktiv,
    refetchInterval: aktiv ? CHAT_ABFRAGE_MS : false,
    placeholderData: (vorher, vorherAbfrage) => (vorherAbfrage?.queryKey[2] === (ziel.partner ?? "team") ? vorher : undefined),
  });
}

// Die Haken an meinen Nachrichten (Migration 85): angekommen/gelesen der anderen ändern sich ohne
// Ereignis bei mir – deshalb im Takt, solange der Chat offen ist.
export function useChatHaken(supabase: SupabaseClient, aktiv: boolean, partner: string | null) {
  return useQuery({
    queryKey: qk.chatHaken(partner),
    queryFn: () => fetchChatHaken(supabase, partner),
    enabled: aktiv,
    refetchInterval: aktiv ? CHAT_ABFRAGE_MS : false,
  });
}

export function useChatUnterhaltungen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.chatUnterhaltungen(),
    queryFn: () => fetchChatUnterhaltungen(supabase),
    enabled: aktiv,
    refetchInterval: aktiv ? 3 * CHAT_ABFRAGE_MS : false,
  });
}

// Anzeige-Links der Fotos im geladenen Verlauf – wie bei den Auftragsfotos 45 Minuten frisch.
// Kommt ein Foto dazu, ändert sich der Satz Pfade; geholt werden dann nur die Links, die noch
// fehlen oder älter als 45 Minuten sind. Sonst bekäme jedes Bild einen neuen Link und lüde neu.
type ChatFotoLink = { url: string; am: number };
export function useChatFotoLinks(supabase: SupabaseClient, pfade: string[], aktiv: boolean) {
  const queryClient = useQueryClient();
  const abfrage = useQuery({
    queryKey: qk.chatFotoLinks(pfade),
    queryFn: async () => {
      const jetzt = Date.now();
      const bekannt: Record<string, ChatFotoLink> = {};
      for (const [, daten] of queryClient.getQueriesData<Record<string, ChatFotoLink>>({ queryKey: ["chatfotolinks"] })) {
        for (const [pfad, l] of Object.entries(daten ?? {})) if (jetzt - l.am < BELEG_LINK_FRISCH_MS && (!bekannt[pfad] || bekannt[pfad].am < l.am)) bekannt[pfad] = l;
      }
      const neu = await chatFotoLinks(supabase, pfade.filter((p) => !bekannt[p]));
      const ergebnis: Record<string, ChatFotoLink> = {};
      for (const p of pfade) {
        if (bekannt[p]) ergebnis[p] = bekannt[p];
        else if (neu[p]) ergebnis[p] = { url: neu[p], am: jetzt };
      }
      return ergebnis;
    },
    enabled: aktiv && pfade.length > 0,
    staleTime: BELEG_LINK_FRISCH_MS,
    gcTime: BELEG_LINK_FRISCH_MS + 5 * 60_000,
    placeholderData: (vorher) => vorher,
  });
  const daten = abfrage.data;
  const links = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [p, l] of Object.entries(daten ?? {})) m[p] = l.url;
    return m;
  }, [daten]);
  return links;
}

export function useChatUngelesen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.chatUngelesen(),
    // Mit der Zahl zugleich „abgeholt“ melden (Migration 85): zwei graue Haken beim Schreiber.
    queryFn: async () => { await chatEmpfangen(supabase); return fetchChatUngelesen(supabase); },
    enabled: aktiv,
    // Seltener als der Verlauf: Die Zahl hält Realtime aktuell, das hier fängt nur Lücken.
    refetchInterval: aktiv ? 3 * CHAT_ABFRAGE_MS : false,
  });
}

export function useChatPersonen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.chatPersonen(),
    queryFn: () => fetchChatPersonen(supabase),
    enabled: aktiv,
    staleTime: 10 * FRISCH_MS,
  });
}

// Zeiterfassung (Migration 82, v131). Der eigene Stand der Stempeluhr wird im Minutentakt
// nachgefragt (ein zweites Gerät könnte gestempelt haben); die Sekunden zählt das Gerät selbst.
export function useZeitStatus(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.zeitStatus(),
    queryFn: () => fetchZeitStatus(supabase),
    enabled: aktiv,
    refetchInterval: aktiv ? ZEIT_STATUS_ABFRAGE_MS : false,
  });
}

// Die Schichten einer Woche (Montag JJJJ-MM-TT) – die eigenen oder, mit „Zeiten aller“, alle.
export function useZeitSchichten(supabase: SupabaseClient, montag: string, aktiv: boolean) {
  return useQuery({
    queryKey: qk.zeitSchichten(montag),
    queryFn: () => { const { von, bis } = wocheVonBis(montag); return fetchZeitSchichten(supabase, von, bis); },
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useZeitOffene(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({ queryKey: qk.zeitOffene(), queryFn: () => fetchZeitOffene(supabase), enabled: aktiv, staleTime: FRISCH_MS });
}

export function useZeitPersonen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({ queryKey: qk.zeitPersonen(), queryFn: () => fetchZeitPersonen(supabase), enabled: aktiv, staleTime: 10 * FRISCH_MS });
}

// Monat (JJJJ-MM), Urlaub und Korrekturen (Migration 83, v136). Nur, solange die Zeiterfassung offen ist.
export function useZeitMonat(supabase: SupabaseClient, monat: string, aktiv: boolean) {
  return useQuery({
    queryKey: qk.zeitMonat(monat),
    queryFn: () => { const { von, bis } = monatVonBis(monat); return fetchZeitSchichten(supabase, von, bis); },
    enabled: aktiv, staleTime: FRISCH_MS, placeholderData: (alt) => alt,
  });
}
export function useZeitUrlaub(supabase: SupabaseClient, vonTag: string, bisTag: string, aktiv: boolean) {
  return useQuery({
    queryKey: qk.zeitUrlaub(vonTag, bisTag),
    queryFn: () => fetchZeitAbwesenheiten(supabase, vonTag, bisTag),
    enabled: aktiv, staleTime: FRISCH_MS, placeholderData: (alt) => alt,
  });
}
export function useZeitKorrekturen(supabase: SupabaseClient, profileId: string | null, ab: string, aktiv: boolean) {
  return useQuery({
    queryKey: qk.zeitKorrekturen(profileId ?? "", ab),
    queryFn: () => fetchZeitKorrekturen(supabase, profileId as string, ab),
    enabled: aktiv && !!profileId, staleTime: FRISCH_MS,
  });
}

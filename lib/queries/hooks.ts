"use client";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { qk } from "./keys";
import { fetchCustomers, fetchContactHistory } from "@/lib/api/customers";
import { fetchOrders, fetchOrdersFuerKunde, type AuftragsFenster, type Auftragsdaten } from "@/lib/api/orders";
import { fetchEmployees } from "@/lib/api/employees";
import { fetchVehiclesFuerKunde } from "@/lib/api/vehicles";
import { fetchArticles, fetchArticlePrices } from "@/lib/api/articles";
import {
  fetchWarehouses, fetchStorageSlots, fetchTireStorages, fetchLagerKennzahlen,
} from "@/lib/api/lager";
import { fetchModulePermissions } from "@/lib/api/permissions";

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

// Zwischenspeicher-Dauer: eine Minute gilt ein Bestand als frisch. Kurz genug, dass Änderungen
// eines Kollegen zeitnah ankommen, lang genug, dass ein Tabwechsel nicht jedes Mal neu lädt.
const FRISCH_MS = 60_000;

export function useKunden(supabase: SupabaseClient) {
  return useQuery({
    queryKey: qk.kunden(),
    queryFn: () => fetchCustomers(supabase),
    staleTime: FRISCH_MS,
  });
}

export function useAuftraege(supabase: SupabaseClient, fenster: AuftragsFenster) {
  return useQuery<Auftragsdaten>({
    queryKey: qk.auftraege(fenster),
    queryFn: () => fetchOrders(supabase, fenster),
    staleTime: FRISCH_MS,
    // Beim Umschalten des Zeitfensters die bisherigen Zeilen stehen lassen, statt die Liste
    // kurz leer zu zeigen.
    placeholderData: (vorher) => vorher,
  });
}

export function useKundenAuftraege(supabase: SupabaseClient, kundeId: string | null) {
  return useQuery<Auftragsdaten>({
    queryKey: qk.kundeAuftraege(kundeId || "-"),
    queryFn: () => fetchOrdersFuerKunde(supabase, kundeId as string),
    enabled: !!kundeId,
    staleTime: FRISCH_MS,
  });
}

export function useKundeFahrzeuge(supabase: SupabaseClient, kundeId: string | null) {
  return useQuery({
    queryKey: qk.kundeFahrzeuge(kundeId || "-"),
    queryFn: () => fetchVehiclesFuerKunde(supabase, kundeId as string),
    enabled: !!kundeId,
    staleTime: FRISCH_MS,
  });
}

export function useKundeHistorie(supabase: SupabaseClient, kundeId: string | null) {
  return useQuery({
    queryKey: qk.kundeHistorie(kundeId || "-"),
    queryFn: () => fetchContactHistory(supabase, kundeId as string),
    enabled: !!kundeId,
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
export function useLagerKennzahlen(supabase: SupabaseClient, aktiv: boolean) {
  return useQuery({
    queryKey: qk.lagerKennzahlen(),
    queryFn: () => fetchLagerKennzahlen(supabase),
    enabled: aktiv,
    staleTime: FRISCH_MS,
  });
}

export function useModulrechte(supabase: SupabaseClient) {
  return useQuery({
    queryKey: qk.modulrechte(),
    queryFn: () => fetchModulePermissions(supabase),
    staleTime: FRISCH_MS,
  });
}

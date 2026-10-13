import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, q, qWrite } from "./client";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";

// Finance (Migration 87, v145, docs/finance.md). Phase F0: nur die Einstellungen je Wirtschaftsjahr.
// Lesen mit dem Recht „finance“, schreiben mit „finance.einstellungen“ – durchgesetzt von RLS.

export type FinEinstellungenStand =
  // Migration 87 ist noch nicht gelaufen: Die Seite sagt das, statt mit einem Fehler leer zu bleiben.
  | { status: "fehlt" }
  // `einstellungen: null` = für dieses Jahr noch nichts gespeichert (die Seite zeigt die Vorgabe).
  | { status: "da"; einstellungen: FinEinstellungen | null };

// Tabelle unbekannt: Postgres 42P01, PostgREST PGRST205 („not in the schema cache“).
const TABELLE_FEHLT = new Set(["42P01", "PGRST205"]);

const SPALTEN =
  "wirtschaftsjahr, rechtsform, gewinnermittlung, kontenrahmen, besteuerung, versteuerung, voranmeldung, dauerfrist, r13b_empfaenger, innergemeinschaftlich, wj_beginn_monat, start_datum, aktualisiert_am";

export async function fetchFinEinstellungen(supabase: SupabaseClient, jahr: number): Promise<FinEinstellungenStand> {
  try {
    const zeile = await q<FinEinstellungen>(
      "Die Finance-Einstellungen konnten nicht geladen werden",
      supabase.from("fin_einstellungen").select(SPALTEN).eq("wirtschaftsjahr", jahr).maybeSingle()
    );
    return { status: "da", einstellungen: zeile ?? null };
  } catch (e) {
    if (e instanceof ApiError && e.code && TABELLE_FEHLT.has(e.code)) return { status: "fehlt" };
    throw e;
  }
}

// Anlegen oder ändern in einem: je Wirtschaftsjahr gibt es genau eine Zeile (Primärschlüssel).
// Wer wann geändert hat, setzt die Datenbank (Trigger `fin_einstellungen_stempel`).
export async function saveFinEinstellungen(supabase: SupabaseClient, e: FinEinstellungen): Promise<void> {
  const { aktualisiert_am: _weg, ...felder } = e;
  void _weg;
  await qWrite(
    "Die Finance-Einstellungen konnten nicht gespeichert werden",
    supabase.from("fin_einstellungen").upsert(felder, { onConflict: "wirtschaftsjahr" })
  );
}

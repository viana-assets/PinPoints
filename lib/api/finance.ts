import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fetchPaged, q, qWrite } from "./client";
import type { FinEinstellungen, Kontenrahmen } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinFestschreibung, FinKonto, FinPosten, FinSteuerschluessel } from "@/lib/finance/buchung";

// Finance (Migration 87/88, docs/finance.md). F0 (v145): Einstellungen je Wirtschaftsjahr; F1 (v146): Konten, Journal.
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

// ---------------------------------------------------------------- F1: Konten, Journal (Migration 88, v146)

export async function fetchFinKonten(supabase: SupabaseClient, rahmen: Kontenrahmen): Promise<FinKonto[]> {
  return fetchPaged<FinKonto>("Die Konten konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_konten").select("kontenrahmen, nummer, bezeichnung, kategorie, eigen, aktiv")
      .eq("kontenrahmen", rahmen).order("nummer").range(von, bis));
}

export async function fetchFinSteuerschluessel(supabase: SupabaseClient, rahmen: Kontenrahmen): Promise<FinSteuerschluessel[]> {
  const zeilen = await q<FinSteuerschluessel[]>("Die Steuerschlüssel konnten nicht geladen werden",
    supabase.from("fin_steuerschluessel").select("kontenrahmen, schluessel, bezeichnung, satz, art, ust_konto, vst_konto")
      .eq("kontenrahmen", rahmen).order("schluessel"));
  // numeric kommt als Text oder Zahl – einheitlich als Zahl.
  return (zeilen ?? []).map((s) => ({ ...s, satz: Number(s.satz) }));
}

// Das Journal eines Jahres mit allen Zeilen. Sortiert nach Nummer und id – eindeutig für das Blättern.
export async function fetchFinBuchungen(supabase: SupabaseClient, jahr: number): Promise<FinBuchung[]> {
  const alle = await fetchPaged<FinBuchung>("Die Buchungen konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_buchungen")
      .select("id, jahr, nr, datum, text, beleg, quelle, quelle_id, storno_von, storniert_durch, grund, erstellt_am, fin_buchungszeilen(id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)")
      .eq("jahr", jahr).order("nr").order("id").range(von, bis));
  return alle.map((b) => ({
    ...b,
    fin_buchungszeilen: [...(b.fin_buchungszeilen ?? [])]
      .map((z) => ({ ...z, betrag: Number(z.betrag) }))
      .sort((a, c) => (a.id ?? 0) - (c.id ?? 0)),
  }));
}

export async function fetchFinFestschreibungen(supabase: SupabaseClient, jahr: number): Promise<FinFestschreibung[]> {
  return (await q<FinFestschreibung[]>("Die Festschreibungen konnten nicht geladen werden",
    supabase.from("fin_festschreibungen").select("jahr, monat, am").eq("jahr", jahr).order("monat"))) ?? [];
}

export type FinNeueBuchung = { datum: string; text: string; beleg: string; posten: FinPosten[] };

// Die Datenbank rechnet die Steuer, schreibt die Zeilen und vergibt die Nummer (`fin_buchen()`).
export async function finBuchen(supabase: SupabaseClient, b: FinNeueBuchung): Promise<{ id: string; jahr: number; nr: number }> {
  const r = await q<{ id: string; jahr: number; nr: number }>("Nicht gebucht",
    supabase.rpc("fin_buchen", { p_datum: b.datum, p_text: b.text, p_beleg: b.beleg, p_posten: b.posten }));
  if (!r) throw new ApiError("Nicht gebucht", { message: "Die Datenbank hat keine Nummer zurückgegeben." });
  return r;
}

export async function finStornieren(supabase: SupabaseClient, id: string, grund: string): Promise<{ id: string; jahr: number; nr: number }> {
  const r = await q<{ id: string; jahr: number; nr: number }>("Nicht storniert",
    supabase.rpc("fin_stornieren", { p_id: id, p_grund: grund }));
  if (!r) throw new ApiError("Nicht storniert", { message: "Die Datenbank hat keine Nummer zurückgegeben." });
  return r;
}

export async function finMonatFestschreiben(supabase: SupabaseClient, jahr: number, monat: number): Promise<number> {
  return (await q<number>("Nicht festgeschrieben", supabase.rpc("fin_monat_festschreiben", { p_jahr: jahr, p_monat: monat }))) ?? 0;
}

export async function finKontoAnlegen(supabase: SupabaseClient, k: Pick<FinKonto, "kontenrahmen" | "nummer" | "bezeichnung" | "kategorie">): Promise<void> {
  await qWrite("Das Konto konnte nicht angelegt werden", supabase.from("fin_konten").insert({ ...k, eigen: true }));
}

export async function finKontoAktiv(supabase: SupabaseClient, rahmen: Kontenrahmen, nummer: number, aktiv: boolean): Promise<void> {
  await qWrite("Das Konto konnte nicht geändert werden",
    supabase.from("fin_konten").update({ aktiv }).eq("kontenrahmen", rahmen).eq("nummer", nummer));
}

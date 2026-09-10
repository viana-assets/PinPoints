import type { SupabaseClient } from "@supabase/supabase-js";
import type { Firmenfahrzeug } from "@/lib/types";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für die eigenen Transporter (Migration 32, Konzept in
// docs/lager-ausbaukonzept.md Block C). Bewusst getrennt von lib/api/vehicles.ts: das dort
// sind Kundenfahrzeuge. Zwei Bedeutungen in einer Datei wären der Anfang von zwei Bedeutungen
// an fünfzig Stellen.

export type FirmenfahrzeugFelder = {
  kennzeichen: string;
  bezeichnung: string;
  notiz: string;
  aktiv: boolean;
};

function toRow(felder: FirmenfahrzeugFelder) {
  return {
    kennzeichen: felder.kennzeichen.trim(),
    bezeichnung: felder.bezeichnung.trim() || null,
    notiz: felder.notiz.trim() || null,
    aktiv: felder.aktiv,
  };
}

// Auch die ausgemusterten kommen mit: An alten Aufträgen hängen sie weiter, und eine Liste,
// die den Namen zum Auftrag nicht mehr auflösen kann, zeigt „unbekannt" statt „N-VI 100".
// Gefiltert wird erst in der Oberfläche, dort wo es um die Auswahl für NEUE Aufträge geht.
export async function fetchFirmenfahrzeuge(supabase: SupabaseClient): Promise<Firmenfahrzeug[]> {
  return fetchPaged<Firmenfahrzeug>("Die Firmenfahrzeuge konnten nicht geladen werden", (von, bis) =>
    supabase.from("firmenfahrzeuge").select("*").order("kennzeichen").range(von, bis)
  );
}

// Ein doppeltes Kennzeichen ist ein Bedienfehler, keine Störung – deshalb kommt es als
// Rückgabewert zurück und nicht als Ausnahme (gleiches Muster wie die Artikelnummer in
// lib/api/articles.ts). 23505 ist der Postgres-Code für „verletzt Eindeutigkeit".
export async function insertFirmenfahrzeug(
  supabase: SupabaseClient,
  felder: FirmenfahrzeugFelder
): Promise<{ error?: string }> {
  const { error } = await supabase.from("firmenfahrzeuge").insert(toRow(felder));
  if (!error) return {};
  return { error: error.code === "23505" ? "Dieses Kennzeichen ist schon angelegt." : error.message };
}

export async function updateFirmenfahrzeugById(
  supabase: SupabaseClient,
  id: string,
  felder: FirmenfahrzeugFelder
): Promise<{ error?: string }> {
  const { error } = await supabase.from("firmenfahrzeuge").update(toRow(felder)).eq("id", id);
  if (!error) return {};
  return { error: error.code === "23505" ? "Dieses Kennzeichen ist schon angelegt." : error.message };
}

// Kein Löschen, sondern Ausmustern. Ein gelöschtes Fahrzeug nähme die Antwort auf die Frage
// mit, womit ein Auftrag vor zwei Jahren gefahren wurde – die Datenbank setzt die Zuordnung
// dabei auf null (`on delete set null`). Wer wirklich löschen will, tut das im SQL-Editor und
// weiß dann, was er aufgibt.
export async function firmenfahrzeugAusmustern(
  supabase: SupabaseClient,
  id: string,
  aktiv: boolean
): Promise<void> {
  await qWrite(
    "Das Firmenfahrzeug konnte nicht geändert werden",
    supabase.from("firmenfahrzeuge").update({ aktiv }).eq("id", id)
  );
}

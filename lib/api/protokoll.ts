import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import { q } from "./client";
import { auftragsNr } from "@/lib/testkunde";

// Das Namensverzeichnis für das Protokoll.
//
// Die Aufzeichnung hält fest, WAS in der Datenbank steht: `article_id: c5cc3cb9-…`. Das ist
// richtig und für einen Menschen wertlos – „was hat diese Person wo gemacht" beantwortet eine
// Kennung nicht.
//
// Aufgelöst wird deshalb beim LESEN und nicht beim Schreiben, aus demselben Grund, aus dem der
// Trigger die ganze Zeile ablegt und nicht nur die Änderung: Eine Aufzeichnung soll festhalten,
// was war; eine Anzeige soll verständlich sein. Würde der Trigger Namen mitschreiben, stünde im
// Protokoll der Name von damals als Tatsache da – und bei einem umbenannten Artikel wüsste
// niemand mehr, dass es derselbe ist.
//
// Geholt werden nur Kennung und Beschriftung, nicht die ganzen Tabellen: Es geht um ein
// Wörterbuch, nicht um Daten.

export type Namensverzeichnis = Map<string, string>;

type Zeile = { id: string };

async function sammle<T extends Zeile>(
  supabase: SupabaseClient,
  tabelle: string,
  spalten: string,
  label: (z: T) => string | null,
  ziel: Namensverzeichnis
): Promise<void> {
  // Ein einzelner fehlgeschlagener Abruf darf das Protokoll nicht leer lassen – dann bleiben
  // eben die gekürzten Kennungen stehen, wie bisher. Deshalb hier kein `throw`.
  try {
    // Die Spaltenliste steht in einer Variablen, also kann supabase-js den Zeilentyp nicht
    // aus ihr ableiten – deshalb hier ausdrücklich gesagt, was zurückkommt. Der Typ steht am
    // Aufruf unten, wo Spaltenliste und Beschriftungsfunktion nebeneinander stehen und ein
    // Tippfehler auffällt.
    const abfrage = supabase.from(tabelle).select(spalten).limit(5000) as unknown as
      PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
    const zeilen = await q<T[]>(`Namen für das Protokoll (${tabelle})`, abfrage);
    (zeilen ?? []).forEach((z) => {
      const text = label(z);
      if (z.id && text) ziel.set(z.id, text);
    });
  } catch {
    /* Ohne Namen bleibt die Kennung. Weniger, als man will, aber wahr. */
  }
}

export async function fetchNamensverzeichnis(supabase: SupabaseClient): Promise<Namensverzeichnis> {
  const namen: Namensverzeichnis = new Map();

  await Promise.all([
    sammle<{ id: string; order_number: number }>(supabase, "orders", "id, order_number",
      (z) => (z.order_number != null ? `Auftrag ${auftragsNr(z.order_number)}` : null), namen),
    sammle<{ id: string; name: string | null; company: string | null }>(supabase, "customers", "id, name, company",
      (z) => z.company?.trim() || z.name?.trim() || null, namen),
    sammle<{ id: string; short_name: string | null }>(supabase, "articles", "id, short_name",
      (z) => z.short_name?.trim() || null, namen),
    sammle<{ id: string; name: string | null }>(supabase, "employees", "id, name",
      (z) => z.name?.trim() || null, namen),
    sammle<{ id: string; kennzeichen: string | null; bezeichnung: string | null }>(supabase, "firmenfahrzeuge", "id, kennzeichen, bezeichnung",
      (z) => z.kennzeichen?.trim() || z.bezeichnung?.trim() || null, namen),
    sammle<{ id: string; license_plate: string | null }>(supabase, "vehicles", "id, license_plate",
      (z) => z.license_plate?.trim() || null, namen),
    sammle<{ id: string; code: string | null }>(supabase, "storage_slots", "id, code",
      (z) => (z.code?.trim() ? `Platz ${z.code.trim()}` : null), namen),
    sammle<{ id: string; name: string | null }>(supabase, "warehouses", "id, name",
      (z) => z.name?.trim() || null, namen),
  ]);

  return namen;
}

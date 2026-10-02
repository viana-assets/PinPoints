import type { SupabaseClient } from "@supabase/supabase-js";
import { paarSchluessel } from "@/lib/dubletten";
import { ApiError, q, qWrite } from "./client";

// Dubletten (Fahrplan E1, Migration 64). Gesucht wird in lib/dubletten.ts; hier stehen nur die
// zwei Dinge, die die Datenbank weiß: welche Paare ein Mensch als „keine Dublette" vermerkt hat,
// und das Zusammenführen selbst (`kunden_zusammenfuehren()`).

// Die vermerkten Paare als „a|b". Fehlt die Tabelle (Migration 64 nicht gelaufen), ist die Menge
// leer – die Liste zeigt dann einfach alle Treffer.
export async function fetchKeineDubletten(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("kunden_keine_dublette").select("kunde_a,kunde_b")
    .order("kunde_a").order("kunde_b").range(0, 9999);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /kunden_keine_dublette/.test(error.message)) return new Set();
    throw new ApiError("Die Dublettenvermerke konnten nicht geladen werden", error);
  }
  return new Set((data ?? []).map((z: { kunde_a: string; kunde_b: string }) => `${z.kunde_a}|${z.kunde_b}`));
}

export async function keineDubletteVermerken(supabase: SupabaseClient, a: string, b: string): Promise<void> {
  const [kunde_a, kunde_b] = paarSchluessel(a, b);
  await qWrite("Der Vermerk „keine Dublette“ konnte nicht gespeichert werden",
    supabase.from("kunden_keine_dublette").upsert({ kunde_a, kunde_b }, { onConflict: "kunde_a,kunde_b", ignoreDuplicates: true }));
}

export type Zusammengefuehrt = {
  kundennummer_weg: number | null;
  auftraege: number;
  fahrzeuge: number;
  fahrzeuge_vereint: number;
  reifensaetze: number;
  kontakte: number;
  rechnungen: number;
};

// Ganz oder gar nicht, in der Datenbank. Die Vorbedingungen (Admin, nicht die Laufkundschaft,
// nicht Test mit echt) prüft die Funktion und sagt im Klartext, woran es scheitert.
export async function kundenZusammenfuehren(supabase: SupabaseClient, behalten: string, weg: string): Promise<Zusammengefuehrt> {
  const zeilen = await q<Zusammengefuehrt[]>(
    "Die Kunden konnten nicht zusammengeführt werden",
    supabase.rpc("kunden_zusammenfuehren", { p_behalten: behalten, p_weg: weg })
  );
  const erste = zeilen?.[0];
  if (!erste) throw new ApiError("Die Kunden konnten nicht zusammengeführt werden", { message: "keine Rückmeldung der Datenbank." });
  return erste;
}

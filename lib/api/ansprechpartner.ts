import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ansprechpartner } from "@/lib/types";
import type { ApEntwurf } from "@/lib/ansprechpartner";
import { geocodeAddress } from "@/lib/helpers";
import { fetchPaged, qOne, qWrite } from "./client";

// Ansprechpartner je Kunde (Migration 117, v189). Geladen werden alle auf einmal wie die Kunden selbst – es sind wenige,
// und die Karte braucht die mit Nadel. Fehlt die Migration, liefert die Abfrage einen Fehler; der Hook wiederholt dann
// nicht (`retry: false`), und die App läuft ohne Ansprechpartner weiter.
export async function fetchAnsprechpartner(supabase: SupabaseClient): Promise<Ansprechpartner[]> {
  return fetchPaged<Ansprechpartner>("Die Ansprechpartner konnten nicht geladen werden", (von, bis) =>
    supabase.from("kunden_ansprechpartner").select("*").order("customer_id").order("sortierung").order("id").range(von, bis));
}

const spalten = (e: ApEntwurf) => ({
  anrede: e.anrede || null, name: e.name.trim(), funktion: (e.funktion ?? "").trim() || null, telefon: (e.telefon ?? "").trim() || null,
  email: (e.email ?? "").trim() || null, address: (e.address ?? "").trim() || null, auf_karte: e.auf_karte && !!(e.address ?? "").trim(),
  notiz: (e.notiz ?? "").trim() || null,
});

// Die Koordinate kommt aus einem angenommenen Adressvorschlag – sonst wird die Adresse geokodiert. Scheitert das, bleibt
// der Ansprechpartner ohne Position (wie beim Kunden): gespeichert ist er trotzdem.
async function position(adresse: string, koordinate: { lat: number; lng: number } | null | undefined) {
  if (!adresse.trim()) return { lat: null, lng: null, geo_genauigkeit: null };
  if (koordinate) return { lat: koordinate.lat, lng: koordinate.lng, geo_genauigkeit: "exakt" as const };
  try {
    const r = await geocodeAddress(adresse);
    if (r) return { lat: r.lat, lng: r.lng, geo_genauigkeit: r.genauigkeit };
  } catch {
    // Geokodieren ist unkritisch.
  }
  return { lat: null, lng: null, geo_genauigkeit: null };
}

export async function ansprechpartnerAnlegen(supabase: SupabaseClient, kundeId: string, e: ApEntwurf, sortierung: number,
  koordinate?: { lat: number; lng: number } | null): Promise<Ansprechpartner> {
  return qOne<Ansprechpartner>("Der Ansprechpartner konnte nicht angelegt werden",
    supabase.from("kunden_ansprechpartner").insert({ customer_id: kundeId, sortierung, ...spalten(e), ...(await position(e.address ?? "", koordinate)) })
      .select("*").single());
}

// Neu geokodiert wird nur, wenn sich die Adresse geändert hat.
export async function ansprechpartnerAendern(supabase: SupabaseClient, vorher: Ansprechpartner, e: ApEntwurf,
  koordinate?: { lat: number; lng: number } | null): Promise<void> {
  const neu = spalten(e);
  const ort = (neu.address ?? "") !== (vorher.address ?? "").trim() || koordinate ? await position(neu.address ?? "", koordinate) : {};
  await qWrite("Der Ansprechpartner konnte nicht gespeichert werden",
    supabase.from("kunden_ansprechpartner").update({ ...neu, ...ort }).eq("id", vorher.id));
}

export async function ansprechpartnerLoeschen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Der Ansprechpartner konnte nicht gelöscht werden", supabase.from("kunden_ansprechpartner").delete().eq("id", id));
}

export async function ansprechpartnerKarte(supabase: SupabaseClient, id: string, an: boolean): Promise<void> {
  await qWrite("Die Nadel konnte nicht umgeschaltet werden", supabase.from("kunden_ansprechpartner").update({ auf_karte: an }).eq("id", id));
}

// Die Firma selbst auf der Karte – oder nur Rechnungsadresse.
export async function kundeAufKarte(supabase: SupabaseClient, kundeId: string, an: boolean): Promise<void> {
  await qWrite("Die Nadel konnte nicht umgeschaltet werden", supabase.from("customers").update({ auf_karte: an }).eq("id", kundeId));
}

// Fahrzeug einem Ansprechpartner zuordnen (null = keinem).
export async function fahrzeugAnsprechpartner(supabase: SupabaseClient, fahrzeugId: string, apId: string | null): Promise<void> {
  await qWrite("Das Fahrzeug konnte nicht zugeordnet werden", supabase.from("vehicles").update({ ansprechpartner_id: apId }).eq("id", fahrzeugId));
}

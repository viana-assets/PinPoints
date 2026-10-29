import type { SupabaseClient } from "@supabase/supabase-js";
import type { BestellFuer, BestellStatus, Bestellwunsch } from "@/lib/types";
import { BESTELL_FOTO_BUCKET, bestellFotoPfad } from "@/lib/bestellung";
import { ApiError, fetchPaged, qWrite } from "./client";

// Bestellliste (Migration 104, v173). Was erlaubt ist, entscheidet die Datenbank (`bestellwunsch_pruefen()`);
// ihre Meldungen kommen so, wie sie sind, beim Nutzer an.

type Zeile = Omit<Bestellwunsch, "plus"> & { bestellwunsch_plus: { profile_id: string }[] | null };

export async function fetchBestellwuensche(supabase: SupabaseClient): Promise<Bestellwunsch[]> {
  const zeilen = await fetchPaged<Zeile>("Die Bestellliste konnte nicht geladen werden", (von, bis) =>
    supabase.from("bestellwuensche").select("*, bestellwunsch_plus(profile_id)")
      .order("created_at", { ascending: false }).order("id").range(von, bis));
  return zeilen.map(({ bestellwunsch_plus, ...w }) => ({ ...w, plus: (bestellwunsch_plus || []).map((p) => p.profile_id) }));
}

export type BestellFelder = {
  text: string;
  menge: string | null;
  dringend: boolean;
  fuer: BestellFuer;
  firmenfahrzeug_id: string | null;
  kunde_id: string | null;
  auftrag_id: string | null;
  foto_pfad?: string | null;
  foto_breite?: number | null;
  foto_hoehe?: number | null;
};

export async function bestellwunschAnlegen(supabase: SupabaseClient, f: BestellFelder): Promise<void> {
  await qWrite("Der Bestellwunsch konnte nicht eingetragen werden", supabase.from("bestellwuensche").insert(f));
}

export async function bestellwunschAendern(supabase: SupabaseClient, id: string, f: Partial<BestellFelder>): Promise<void> {
  await qWrite("Der Bestellwunsch konnte nicht geändert werden", supabase.from("bestellwuensche").update(f).eq("id", id));
}

// Erst die Zeile, dann das Foto: Scheitert das Löschen (nicht mehr offen), bleibt das Foto beim Eintrag.
export async function bestellwunschLoeschen(supabase: SupabaseClient, w: Pick<Bestellwunsch, "id" | "foto_pfad">): Promise<void> {
  await qWrite("Der Bestellwunsch konnte nicht gelöscht werden", supabase.from("bestellwuensche").delete().eq("id", w.id));
  if (w.foto_pfad) await bestellFotoVerwerfen(supabase, w.foto_pfad);
}

// Stand für einen oder mehrere Wünsche (nur „Bestellliste verwalten“). Notiz bzw. Grund gehen mit.
export async function bestellStandSetzen(
  supabase: SupabaseClient, ids: string[], status: BestellStatus, zusatz: { notiz?: string | null; grund?: string | null } = {}
): Promise<void> {
  if (ids.length === 0) return;
  await qWrite("Der Stand konnte nicht gesetzt werden",
    supabase.from("bestellwuensche").update({ status, ...zusatz }).in("id", ids));
}

export async function bestellPlusSetzen(supabase: SupabaseClient, id: string, ich: string, an: boolean): Promise<void> {
  if (an) {
    await qWrite("„Brauche ich auch“ ging nicht",
      supabase.from("bestellwunsch_plus").upsert({ wunsch_id: id, profile_id: ich }, { onConflict: "wunsch_id,profile_id", ignoreDuplicates: true }));
  } else {
    await qWrite("„Brauche ich auch“ ließ sich nicht zurücknehmen",
      supabase.from("bestellwunsch_plus").delete().eq("wunsch_id", id).eq("profile_id", ich));
  }
}

export async function bestellFotoHochladen(
  supabase: SupabaseClient, ich: string, datei: Blob, masse: { breite: number; hoehe: number }
): Promise<{ pfad: string; breite: number; hoehe: number }> {
  const zufall = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 10);
  const pfad = bestellFotoPfad(ich, zufall, new Date(), datei.type === "image/png" ? "png" : "jpg");
  const { error } = await supabase.storage.from(BESTELL_FOTO_BUCKET).upload(pfad, datei, { contentType: datei.type || "image/jpeg", upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("Fotos zur Bestellung gehen erst nach Migration 104.");
    if (/payload too large|exceeded the maximum|413/i.test(error.message)) throw new Error("Das Foto ist zu groß (höchstens 3 MB).");
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error("Keine Berechtigung, Fotos zur Bestellung hochzuladen.");
    throw new Error(`Das Foto konnte nicht hochgeladen werden (${error.message}).`);
  }
  return { pfad, ...masse };
}

export async function bestellFotoVerwerfen(supabase: SupabaseClient, pfad: string): Promise<void> {
  await supabase.storage.from(BESTELL_FOTO_BUCKET).remove([pfad]).catch(() => {});
}

export async function bestellFotoLinks(supabase: SupabaseClient, pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {};
  const { data, error } = await supabase.storage.from(BESTELL_FOTO_BUCKET).createSignedUrls(pfade, 3600);
  if (error) throw new ApiError("Die Fotos konnten nicht geladen werden", { message: error.message });
  const links: Record<string, string> = {};
  for (const z of data ?? []) if (z.path && z.signedUrl) links[z.path] = z.signedUrl;
  return links;
}

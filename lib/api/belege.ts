import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragBeleg, BelegArt } from "@/lib/types";
import { BELEG_BUCKET } from "@/lib/constants";
import { belegPfad } from "@/lib/belege";
import { ApiError, q, qOne, qWrite } from "./client";

// Foto und Unterschrift am Auftrag (Fahrplan E3, Migration 65). Die Datei liegt im privaten Bucket,
// die Zeile in `auftrag_belege`. Reihenfolge immer: erst die Datei, dann die Zeile beim Anlegen –
// und beim Löschen erst die Datei, dann die Zeile. So bleibt im schlimmsten Fall eine Datei ohne
// Zeile übrig (unsichtbar, harmlos), nie eine Zeile ohne Datei (ein kaputtes Bild im Auftrag).

// Die Meldungen der Storage-Schnittstelle sind englisch und technisch. Die drei, die im Betrieb
// vorkommen, auf Deutsch – alles andere mit dem Originaltext dahinter, damit es sich finden lässt.
export function speicherFehlerText(meldung: string): string {
  if (/row-level security|unauthorized|403/i.test(meldung)) return "Keine Berechtigung, an diesem Auftrag Fotos abzulegen.";
  if (/bucket not found/i.test(meldung)) return "Der Speicherbereich für Fotos fehlt noch – Migration 65 ist nicht ausgeführt.";
  if (/payload too large|exceeded the maximum|413/i.test(meldung)) return "Das Bild ist zu groß (höchstens 3 MB).";
  return `Das Bild konnte nicht hochgeladen werden (${meldung}).`;
}

// Fehlt die Tabelle (Migration 65 nicht gelaufen), gibt es schlicht keine Belege.
export async function fetchBelege(supabase: SupabaseClient, orderId: string): Promise<AuftragBeleg[]> {
  const { data, error } = await supabase.from("auftrag_belege").select("*").eq("order_id", orderId)
    .order("created_at").order("id").range(0, 499);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /auftrag_belege/.test(error.message)) return [];
    throw new ApiError("Die Fotos konnten nicht geladen werden", error);
  }
  return (data ?? []) as AuftragBeleg[];
}

export async function belegHochladen(
  supabase: SupabaseClient,
  orderId: string,
  art: BelegArt,
  datei: Blob,
  masse: { breite: number; hoehe: number },
  beschriftung: string | null
): Promise<AuftragBeleg> {
  const endung = datei.type === "image/png" ? "png" : "jpg";
  const zufall = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Math.random()).slice(2, 10);
  const pfad = belegPfad(orderId, art, zufall, new Date(), endung);
  const { error } = await supabase.storage.from(BELEG_BUCKET).upload(pfad, datei, { contentType: datei.type || "image/jpeg", upsert: false });
  if (error) throw new Error(speicherFehlerText(error.message));
  return qOne<AuftragBeleg>("Das Bild ist hochgeladen, aber nicht am Auftrag eingetragen",
    supabase.from("auftrag_belege").insert({
      order_id: orderId, art, pfad, beschriftung: beschriftung?.trim() || null,
      breite: masse.breite, hoehe: masse.hoehe, bytes: datei.size,
    }).select("*").single());
}

// Zeitlich begrenzte Links zum Anzeigen (eine Stunde). Ein Link, der nach außen gerät, verfällt.
export async function belegLinks(supabase: SupabaseClient, pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {};
  const { data, error } = await supabase.storage.from(BELEG_BUCKET).createSignedUrls(pfade, 3600);
  if (error) throw new ApiError("Die Fotos konnten nicht geladen werden", { message: error.message });
  const links: Record<string, string> = {};
  for (const z of data ?? []) if (z.path && z.signedUrl) links[z.path] = z.signedUrl;
  return links;
}

// Dateien entfernen – SQL darf das in Supabase nicht, nur die Storage-Schnittstelle.
export async function belegDateienLoeschen(supabase: SupabaseClient, pfade: string[]): Promise<void> {
  for (let i = 0; i < pfade.length; i += 100) {
    const { error } = await supabase.storage.from(BELEG_BUCKET).remove(pfade.slice(i, i + 100));
    if (error) throw new ApiError("Die Bilddateien konnten nicht gelöscht werden", { message: error.message });
  }
}

export async function belegLoeschen(supabase: SupabaseClient, beleg: Pick<AuftragBeleg, "id" | "pfad">): Promise<void> {
  await belegDateienLoeschen(supabase, [beleg.pfad]);
  await qWrite("Der Beleg konnte nicht entfernt werden", supabase.from("auftrag_belege").delete().eq("id", beleg.id));
}

// Alle Bildpfade eines Kunden (auch an gelöschten Aufträgen) – vor dem endgültigen Löschen, damit
// die Dateien nicht im Speicher zurückbleiben. Ohne Tabelle: keine.
export async function belegPfadeFuerKunde(supabase: SupabaseClient, kundeId: string): Promise<string[]> {
  const auftraege = await q<{ id: string }[]>("Die Aufträge des Kunden konnten nicht geladen werden",
    supabase.from("orders").select("id").eq("customer_id", kundeId));
  const ids = (auftraege ?? []).map((a) => a.id);
  const pfade: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("auftrag_belege").select("pfad").in("order_id", ids.slice(i, i + 200));
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || /auftrag_belege/.test(error.message)) return [];
      throw new ApiError("Die Fotos des Kunden konnten nicht geladen werden", error);
    }
    pfade.push(...(data ?? []).map((z: { pfad: string }) => z.pfad));
  }
  return pfade;
}

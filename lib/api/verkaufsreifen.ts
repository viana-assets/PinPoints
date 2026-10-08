import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticlePrice, Verkaufsreifen, VerkaufsreifenFelder } from "@/lib/types";
import { currentArticlePrice, DEFAULT_VAT_RATE } from "@/lib/helpers";
import { positionsText } from "@/lib/reifenverkauf";
import { fetchPaged, q, qOne, qWrite } from "./client";

// Datenzugriff für den Reifenverkauf (Migration 61). Reine Supabase-Wrapper ohne React-State –
// Muster wie lib/api/lager.ts.
//
// `reserviert` und `verkauft` schreibt diese Schicht nie: Die Datenbank zählt sie selbst und
// würde mitgeschickte Werte ohnehin verwerfen (`verkaufsreifen_pruefen`).

// Alle Spalten außer dem Einkaufspreis. Seit Migration 77 darf `authenticated` `ek_netto` nicht
// mehr direkt lesen – ein `select("*")` scheitert dann für JEDE Rolle. Den Einkaufspreis holt
// `einkaufspreiseErgaenzen()` über `verkaufsreifen_einkaufspreise()`, die das Recht
// „Lager › Einkaufspreise“ prüft. Eine neue Spalte an `verkaufsreifen` gehört hier hinein UND
// braucht in ihrer Migration ein eigenes `grant select (spalte) to authenticated`.
// (Ein einziges Zeichenketten-Literal, kein „+“: Sonst kann supabase-js die Liste nicht lesen.)
export const VERKAUFSREIFEN_SPALTEN = "id,zustand,breite,querschnitt,zoll,kennung,hersteller,modell,saison,dot,profiltiefe_mm,felge,runflat,xl,eprel,preis_netto,bestand,reserviert,verkauft,warehouse_id,storage_slot_id,notiz,created_at,updated_at,herkunft_satz_id";

// Trägt den Einkaufspreis nach, soweit die Rolle ihn sehen darf; sonst bleibt er leer (null).
export async function einkaufspreiseErgaenzen(supabase: SupabaseClient, posten: Omit<Verkaufsreifen, "ek_netto">[]): Promise<Verkaufsreifen[]> {
  if (posten.length === 0) return [];
  const preise = await q<{ id: string; ek_netto: number | string | null }[]>(
    "Die Einkaufspreise konnten nicht geladen werden",
    supabase.rpc("verkaufsreifen_einkaufspreise")
  );
  const ek = new Map((preise ?? []).map((x) => [x.id, x.ek_netto == null ? null : Number(x.ek_netto)]));
  return posten.map((p) => ({ ...p, ek_netto: ek.get(p.id) ?? null }));
}

export async function fetchVerkaufsreifen(supabase: SupabaseClient): Promise<Verkaufsreifen[]> {
  const posten = await fetchPaged<Omit<Verkaufsreifen, "ek_netto">>("Die Verkaufsreifen konnten nicht geladen werden", (von, bis) =>
    supabase.from("verkaufsreifen").select(VERKAUFSREIFEN_SPALTEN).order("updated_at", { ascending: false }).order("id").range(von, bis)
  );
  return einkaufspreiseErgaenzen(supabase, posten);
}

export async function insertVerkaufsreifen(supabase: SupabaseClient, felder: VerkaufsreifenFelder): Promise<string> {
  const neu = await qOne<{ id: string }>(
    "Der Reifen konnte nicht angelegt werden",
    supabase.from("verkaufsreifen").insert(felder).select("id").single()
  );
  return neu.id;
}

export async function updateVerkaufsreifen(supabase: SupabaseClient, id: string, felder: VerkaufsreifenFelder): Promise<void> {
  await qWrite("Der Reifen konnte nicht gespeichert werden", supabase.from("verkaufsreifen").update(felder).eq("id", id));
}

export async function deleteVerkaufsreifen(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite("Der Reifen konnte nicht gelöscht werden", supabase.from("verkaufsreifen").delete().eq("id", id));
}

// Trägt Reifen aus dem Lager als Position auf einen Auftrag ein. Preis und Text kommen vom
// Posten und werden als Schnappschuss gespeichert – wie bei jeder Position (siehe
// insertOrderArticle). Der Steuersatz kommt vom Artikel, gibt es dort keinen Preis, gilt der
// übliche. Ob noch genug frei ist, entscheidet die Datenbank; eine Absage kommt als Meldung.
export async function reifenAufAuftrag(
  supabase: SupabaseClient,
  artikelpreise: ArticlePrice[],
  orderId: string,
  articleId: string,
  posten: Verkaufsreifen,
  menge: number
): Promise<void> {
  const preis = currentArticlePrice(artikelpreise.filter((p) => p.article_id === articleId));
  await qWrite(
    "Der Reifen konnte nicht eingetragen werden",
    supabase.from("order_articles").insert({
      order_id: orderId,
      article_id: articleId,
      quantity: menge,
      net_price: posten.preis_netto,
      vat_rate: preis ? preis.vat_rate : DEFAULT_VAT_RATE,
      endpreis_netto: null,
      note: positionsText(posten),
      verkaufsreifen_id: posten.id,
    })
  );
}

// Ein eingelagerter Satz wird zum Verkaufsposten (E17, Migration 64): auslagern und die Posten auf
// denselben Platz legen – in der Datenbank, in einem Zug. Die Posten kommen fertig aus
// `entwurfAlsPosten` (lib/reifenverkauf.ts). Gibt die Kennungen der neuen Posten zurück.
export async function satzZumVerkauf(supabase: SupabaseClient, satzId: string, posten: Record<string, string | number | boolean | null>[]): Promise<string[]> {
  const ids = await q<string[]>("Der Satz konnte nicht in den Reifenverkauf übernommen werden",
    supabase.rpc("satz_zum_verkauf", { p_satz: satzId, p_posten: posten }));
  return ids ?? [];
}

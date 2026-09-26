import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticlePrice, Verkaufsreifen, VerkaufsreifenFelder } from "@/lib/types";
import { currentArticlePrice, DEFAULT_VAT_RATE } from "@/lib/helpers";
import { positionsText } from "@/lib/reifenverkauf";
import { fetchPaged, qOne, qWrite } from "./client";

// Datenzugriff für den Reifenverkauf (Migration 61). Reine Supabase-Wrapper ohne React-State –
// Muster wie lib/api/lager.ts.
//
// `reserviert` und `verkauft` schreibt diese Schicht nie: Die Datenbank zählt sie selbst und
// würde mitgeschickte Werte ohnehin verwerfen (`verkaufsreifen_pruefen`).

export async function fetchVerkaufsreifen(supabase: SupabaseClient): Promise<Verkaufsreifen[]> {
  return fetchPaged<Verkaufsreifen>("Die Verkaufsreifen konnten nicht geladen werden", (von, bis) =>
    supabase.from("verkaufsreifen").select("*").order("updated_at", { ascending: false }).range(von, bis)
  );
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

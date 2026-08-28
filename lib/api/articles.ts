import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticlePrice, OrderArticle } from "@/lib/types";
import { currentArticlePrice, DEFAULT_VAT_RATE } from "@/lib/helpers";

// Datenzugriffsschicht für das Artikelstammdatenbuch (Migration 12): Artikel, Preis-Historie
// und die Zuordnung von Artikeln zu Aufträgen. Reine Supabase-Wrapper ohne React-State –
// siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 3.

export async function fetchArticles(supabase: SupabaseClient): Promise<Article[]> {
  const { data } = await supabase.from("articles").select("*").order("article_number");
  return (data as Article[]) || [];
}

export async function fetchArticlePrices(supabase: SupabaseClient): Promise<ArticlePrice[]> {
  const { data } = await supabase.from("article_prices").select("*").order("valid_from", { ascending: false });
  return (data as ArticlePrice[]) || [];
}

export async function fetchOrderArticles(supabase: SupabaseClient): Promise<OrderArticle[]> {
  const { data } = await supabase.from("order_articles").select("*").order("created_at");
  return (data as OrderArticle[]) || [];
}

export async function insertArticle(supabase: SupabaseClient, shortName: string, longName: string): Promise<void> {
  await supabase.from("articles").insert({ short_name: shortName, long_name: longName });
}

export async function updateArticleById(supabase: SupabaseClient, id: string, fields: { short_name: string; long_name: string; active: boolean }): Promise<void> {
  await supabase.from("articles").update(fields).eq("id", id);
}

// Neuer Preis für einen Artikel: schließt zunächst einen ggf. noch offenen (oder bis nach dem
// neuen Startdatum reichenden) bestehenden Preiszeitraum automatisch einen Tag vor dem neuen
// Startdatum, damit sich Preis-Zeiträume nie überlappen und die Historie lückenlos bleibt.
// `existingPrices` ist bewusst ein Parameter (statt eines eigenen Fetches) – die Komponente
// hat die aktuelle Preis-Historie ohnehin schon im State geladen.
export async function insertArticlePrice(
  supabase: SupabaseClient,
  existingPrices: ArticlePrice[],
  articleId: string,
  netPrice: number,
  vatRate: number,
  validFrom: string
): Promise<void> {
  const overlapping = existingPrices.filter(
    (p) => p.article_id === articleId && p.valid_from < validFrom && (!p.valid_to || p.valid_to >= validFrom)
  );
  for (const row of overlapping) {
    const d = new Date(validFrom + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const closeDate = d.toISOString().slice(0, 10);
    await supabase.from("article_prices").update({ valid_to: closeDate }).eq("id", row.id);
  }
  await supabase.from("article_prices").insert({ article_id: articleId, net_price: netPrice, vat_rate: vatRate, valid_from: validFrom });
}

// Legt eine Auftrags-Artikelzeile an, mit dem aktuell gültigen Preis (aus `existingPrices`) als
// Schnappschuss – ändert sich der Artikelpreis später, bleibt der hier gespeicherte Preis fest.
export async function insertOrderArticle(
  supabase: SupabaseClient,
  existingPrices: ArticlePrice[],
  orderId: string,
  articleId: string,
  quantity: number,
  discountPercent: number
): Promise<void> {
  const price = currentArticlePrice(existingPrices.filter((p) => p.article_id === articleId));
  await supabase.from("order_articles").insert({
    order_id: orderId, article_id: articleId, quantity,
    net_price: price ? price.net_price : 0, vat_rate: price ? price.vat_rate : DEFAULT_VAT_RATE,
    discount_percent: discountPercent,
  });
}

export async function updateOrderArticleQtyById(supabase: SupabaseClient, id: string, quantity: number): Promise<void> {
  await supabase.from("order_articles").update({ quantity }).eq("id", id);
}

export async function updateOrderArticleDiscountById(supabase: SupabaseClient, id: string, discountPercent: number): Promise<void> {
  await supabase.from("order_articles").update({ discount_percent: discountPercent }).eq("id", id);
}

export async function deleteOrderArticleById(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("order_articles").delete().eq("id", id);
}

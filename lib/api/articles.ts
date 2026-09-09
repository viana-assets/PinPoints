import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticlePrice } from "@/lib/types";
import { currentArticlePrice, preisZeitraumKollision, DEFAULT_VAT_RATE } from "@/lib/helpers";
import { fetchPaged, qWrite } from "./client";

// Datenzugriffsschicht für das Artikelstammdatenbuch (Migration 12): Artikel, Preis-Historie
// und die Zuordnung von Artikeln zu Aufträgen. Reine Supabase-Wrapper ohne React-State –
// siehe lib/api/employees.ts für das Muster. Ausgelagert aus app/page.tsx, siehe
// docs/roadmap.md Phase 3.

export async function fetchArticles(supabase: SupabaseClient): Promise<Article[]> {
  return fetchPaged<Article>("Die Artikel konnten nicht geladen werden", (von, bis) =>
    supabase.from("articles").select("*").order("article_number").range(von, bis)
  );
}

export async function fetchArticlePrices(supabase: SupabaseClient): Promise<ArticlePrice[]> {
  return fetchPaged<ArticlePrice>("Die Artikelpreise konnten nicht geladen werden", (von, bis) =>
    supabase.from("article_prices").select("*").order("valid_from", { ascending: false }).range(von, bis)
  );
}

// Ein eigener Vollabzug über `order_articles` ist seit Roadmap-Phase 10 nicht mehr nötig: die
// Auftragspositionen kommen verschachtelt mit den Aufträgen mit (siehe lib/api/orders.ts) und
// passen dadurch immer zum geladenen Zeitfenster.

export async function insertArticle(supabase: SupabaseClient, shortName: string, longName: string): Promise<void> {
  await qWrite(
    "Der Artikel konnte nicht angelegt werden",
    supabase.from("articles").insert({ short_name: shortName, long_name: longName })
  );
}

export async function updateArticleById(supabase: SupabaseClient, id: string, fields: { short_name: string; long_name: string; active: boolean; braucht_lagerplatz: boolean }): Promise<void> {
  await qWrite("Der Artikel konnte nicht gespeichert werden", supabase.from("articles").update(fields).eq("id", id));
}

// Artikelnummer ist von der Datenbank vorbelegt (Sequenz `article_number_seq`, Migration 14),
// aber bewusst frei überschreibbar: verschiedene Artikel(-gruppen) brauchen unterschiedliche
// eigene Nummernfolgen (z. B. eigene Nummernkreise je Kategorie), das lässt sich nicht mit
// einer einzigen fortlaufenden Sequenz abbilden. Die Unique-Constraint aus Migration 14 bleibt
// bestehen – ein Postgres-Fehler mit Code "23505" bedeutet, dass die Nummer schon vergeben ist.
//
// Diese Funktion wirft bewusst NICHT (anders als der Rest dieser Schicht, siehe ./client.ts):
// eine doppelte Nummer ist keine Störung, sondern eine normale Rückmeldung an den Nutzer, der
// sie direkt in der Tabellenzelle korrigieren soll.
export async function updateArticleNumberById(supabase: SupabaseClient, id: string, articleNumber: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from("articles").update({ article_number: articleNumber }).eq("id", id);
  if (!error) return { error: null };
  return { error: error.code === "23505" ? "Diese Artikelnummer ist schon vergeben." : error.message };
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
    await qWrite(
      "Der bisherige Preiszeitraum konnte nicht abgeschlossen werden",
      supabase.from("article_prices").update({ valid_to: closeDate }).eq("id", row.id)
    );
  }
  await qWrite(
    "Der neue Preis konnte nicht gespeichert werden",
    supabase.from("article_prices").insert({ article_id: articleId, net_price: netPrice, vat_rate: vatRate, valid_from: validFrom })
  );
}

// Korrigiert einen bereits erfassten Preis. Gedacht für den Tippfehler unmittelbar nach der
// Eingabe – ohne diese Möglichkeit bliebe nur, einen zweiten Preis "ab morgen" nachzuschieben
// und die falsche Zeile für immer in der Historie stehen zu lassen.
//
// Für schon geschriebene Auftragspositionen ist das ungefährlich: die speichern ihren Preis als
// Schnappschuss (siehe insertOrderArticle), eine Korrektur hier wirkt also nicht rückwirkend auf
// bestehende Aufträge. Wer einen Auftrag zum korrigierten Preis will, entfernt die Position und
// ordnet sie neu zu.
//
// Überschneidungen werden vorher abgefangen und als Text gemeldet: die Datenbank lehnt sie seit
// Migration 18 ohnehin ab (article_prices_kein_ueberlapp), aber mit einer Meldung, die niemand
// versteht.
export async function updateArticlePrice(
  supabase: SupabaseClient,
  existingPrices: ArticlePrice[],
  priceId: string,
  netPrice: number,
  vatRate: number,
  validFrom: string,
  validTo: string | null
): Promise<{ error?: string }> {
  const eigen = existingPrices.find((p) => p.id === priceId);
  if (!eigen) return { error: "Dieser Preis wurde zwischenzeitlich entfernt." };
  if (validTo && validTo < validFrom) return { error: "Das Enddatum liegt vor dem Startdatum." };

  if (preisZeitraumKollision(existingPrices, priceId, eigen.article_id, validFrom, validTo)) {
    return { error: "Dieser Zeitraum überschneidet sich mit einem anderen Preis dieses Artikels." };
  }

  await qWrite(
    "Der Preis konnte nicht geändert werden",
    supabase
      .from("article_prices")
      .update({ net_price: netPrice, vat_rate: vatRate, valid_from: validFrom, valid_to: validTo })
      .eq("id", priceId)
  );
  return {};
}

// Entfernt eine Preiszeile ganz – für den Fall, dass sie versehentlich angelegt wurde. Der
// unmittelbare Vorgänger wird dabei wieder geöffnet (übernimmt das Ende der gelöschten Zeile),
// sonst entstünde eine Lücke, in der der Artikel gar keinen Preis hätte.
export async function deleteArticlePrice(
  supabase: SupabaseClient,
  existingPrices: ArticlePrice[],
  priceId: string
): Promise<void> {
  const eigen = existingPrices.find((p) => p.id === priceId);
  await qWrite(
    "Der Preis konnte nicht entfernt werden",
    supabase.from("article_prices").delete().eq("id", priceId)
  );
  if (!eigen) return;

  const vorgaenger = existingPrices
    .filter((p) => p.id !== priceId && p.article_id === eigen.article_id && p.valid_from < eigen.valid_from)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  if (vorgaenger) {
    await qWrite(
      "Der vorherige Preiszeitraum konnte nicht wieder geöffnet werden",
      supabase.from("article_prices").update({ valid_to: eigen.valid_to }).eq("id", vorgaenger.id)
    );
  }
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
  await qWrite(
    "Die Leistung konnte dem Auftrag nicht zugeordnet werden",
    supabase.from("order_articles").insert({
      order_id: orderId, article_id: articleId, quantity,
      net_price: price ? price.net_price : 0, vat_rate: price ? price.vat_rate : DEFAULT_VAT_RATE,
      discount_percent: discountPercent,
    })
  );
}

export async function updateOrderArticleQtyById(supabase: SupabaseClient, id: string, quantity: number): Promise<void> {
  await qWrite("Die Menge konnte nicht gespeichert werden", supabase.from("order_articles").update({ quantity }).eq("id", id));
}

export async function updateOrderArticleDiscountById(supabase: SupabaseClient, id: string, discountPercent: number): Promise<void> {
  await qWrite(
    "Der Rabatt konnte nicht gespeichert werden",
    supabase.from("order_articles").update({ discount_percent: discountPercent }).eq("id", id)
  );
}

// Soft-Delete seit Migration 19: eine einmal einem Auftrag zugeordnete Leistung ist eine
// Belegposition mit Preis-Schnappschuss – die darf nicht spurlos verschwinden.
export async function deleteOrderArticleById(supabase: SupabaseClient, id: string): Promise<void> {
  await qWrite(
    "Die Leistung konnte nicht entfernt werden",
    supabase.from("order_articles").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  );
}

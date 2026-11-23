import type { SupabaseClient } from "@supabase/supabase-js";
import { todayStr } from "@/lib/helpers";
import { entwurfMwst, entwurfPreis, type KundenartikelEntwurf } from "@/lib/kundenartikel";
import { qOne, qWrite } from "./client";

// Kundenartikel aus dem Kundenfenster anlegen (Migration 119, v192): ein Artikel mit `customer_id`, dazu sein erster
// Preis ab heute. Die Nummer vergibt die Datenbank aus dem normalen Nummernkreis. Bearbeitet wird er danach im selben
// Fenster wie jeder Artikel (Preise, Einheit, aktiv) – über die Funktionen in ./articles.ts.
export async function kundenartikelAnlegen(supabase: SupabaseClient, kundeId: string, e: KundenartikelEntwurf): Promise<string> {
  const neu = await qOne<{ id: string }>("Der Kundenartikel konnte nicht angelegt werden",
    supabase.from("articles").insert({
      short_name: e.kurz.trim(), long_name: e.lang.trim(), einheit: e.einheit.trim() || "Stück", customer_id: kundeId,
    }).select("id").single());
  await qWrite("Der Preis des Kundenartikels konnte nicht gespeichert werden",
    supabase.from("article_prices").insert({ article_id: neu.id, net_price: entwurfPreis(e), vat_rate: entwurfMwst(e), valid_from: todayStr() }));
  return neu.id;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderArticle } from "@/lib/types";
import type { ReklamationEntwurf } from "@/lib/reklamation";
import { q, qOne } from "./client";

// Reklamationsauftrag (Migration 120, v193). Angelegt wird ein gewöhnlicher Auftrag mit `art = 'reklamation'`; Bezug,
// Grund und Texte prüft die Datenbank (`auftrag_reklamation_pruefen()`), die auch den Schnappschuss des Bezugsauftrags
// schreibt und „Rechnung nötig“ auf aus setzt. Termin, Team und Leistungen kommen danach im Auftragsfenster dazu.
export async function reklamationAnlegen(supabase: SupabaseClient, e: ReklamationEntwurf, titel: string, datum: string): Promise<string> {
  const neu = await qOne<{ id: string }>("Die Reklamation konnte nicht angelegt werden",
    supabase.from("orders").insert({
      customer_id: e.kundeId, title: titel, order_date: datum, status: "offen", art: "reklamation",
      reklamation_von: e.vonId, reklamation_grund: e.grund || null, reklamation_text: e.text.trim() || null,
      reklamation_ohne_bezug: e.vonId ? null : e.ohneBezug.trim() || null,
    }).select("id").single());
  return neu.id;
}

// Die erledigten Aufträge eines Kunden (oder seiner Kundengruppe) samt Leistungen – ohne Zeitfenster, die Reklamation
// kann sich auf einen Auftrag vom letzten Jahr beziehen. Die 60 jüngsten reichen für die Auswahl.
export const REKLAMATION_AUSWAHL_MAX = 60;
export async function fetchErledigteAuftraege(supabase: SupabaseClient, kundenIds: string[]): Promise<{ orders: Order[]; positionen: OrderArticle[] }> {
  if (!kundenIds.length) return { orders: [], positionen: [] };
  const zeilen = await q<(Order & { order_articles: OrderArticle[] | null })[]>("Die erledigten Aufträge konnten nicht geladen werden",
    supabase.from("orders").select("*, order_articles(*)").in("customer_id", kundenIds).eq("status", "erledigt").is("deleted_at", null)
      .order("order_date", { ascending: false }).order("order_number", { ascending: false }).order("id").limit(REKLAMATION_AUSWAHL_MAX));
  const orders: Order[] = [];
  const positionen: OrderArticle[] = [];
  for (const z of zeilen ?? []) {
    const { order_articles, ...o } = z;
    orders.push(o as Order);
    for (const p of order_articles ?? []) if (!p.deleted_at) positionen.push(p);
  }
  return { orders, positionen };
}

// Ein erledigter Auftrag über seine Nummer – für „#441“ in der Suche.
export async function fetchErledigtNachNummer(supabase: SupabaseClient, nummer: number): Promise<Order | null> {
  const zeilen = await q<Order[]>("Der Auftrag konnte nicht gesucht werden",
    supabase.from("orders").select("*").eq("order_number", nummer).is("deleted_at", null).limit(1));
  return zeilen?.[0] ?? null;
}

// Kunden über das Kennzeichen eines ihrer Fahrzeuge.
export async function kundenNachKennzeichen(supabase: SupabaseClient, text: string): Promise<{ customer_id: string; license_plate: string }[]> {
  const t = text.trim().replace(/[%_\\]/g, "");
  if (t.length < 2) return [];
  return (await q<{ customer_id: string; license_plate: string }[]>("Das Kennzeichen konnte nicht gesucht werden",
    supabase.from("vehicles").select("customer_id, license_plate").ilike("license_plate", `%${t}%`).order("license_plate").order("id").limit(20))) ?? [];
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragFahrzeug, Order, OrderArticle, TireStorage } from "@/lib/types";
import { fetchPaged, q } from "./client";

// Datenbeschaffung für das Register „Auswertungen" (Block D).
//
// Eigene Abfrage statt der vorhandenen Auftragsliste, weil die ein ZEITFENSTER lädt (die
// nächsten Wochen) – eine Auswertung über ein Jahr braucht etwas anderes. Geholt wird genau
// der gewählte Zeitraum und nicht mehr.
//
// Gerechnet wird anschließend im Browser (lib/auswertung.ts) und nicht in der Datenbank. Das
// ist eine bewusste Abwägung: Bei diesen Mengen – ein Betrieb mit einigen hundert Aufträgen
// im Jahr – ist der Unterschied nicht spürbar, und eine Rechnung in TypeScript lässt sich
// mit `vitest` prüfen. Eine Rechnung in SQL könnte das hier niemand. Sollte der Bestand
// einmal so wachsen, dass es hakt, gehört die Summierung in eine Datenbanksicht – dann aber
// mit denselben Prüffällen.

export type AuswertungsAbzug = {
  orders: Order[];
  orderArticles: OrderArticle[];
  orderEmployees: Record<string, string[]>;
  einlagerungen: TireStorage[];
  // Welche Fahrzeuge an einem Auftrag hingen (Migration 44). Bis zum 21.09.2026 las die
  // Auswertung dafür `orders.vehicle_id` – das ließ nur EINES zu und wurde mit Migration 51
  // entfernt.
  auftragFahrzeuge: AuftragFahrzeug[];
};

export async function fetchAuswertungsdaten(
  supabase: SupabaseClient,
  von: string,
  bis: string
): Promise<AuswertungsAbzug> {
  const orders = await fetchPaged<Order>(
    "Die Aufträge für die Auswertung konnten nicht geladen werden",
    (a, b) => supabase.from("orders").select("*")
      .gte("order_date", von).lte("order_date", bis).order("order_date").range(a, b)
  );

  const ids = orders.map((o) => o.id);
  if (ids.length === 0) return { orders, orderArticles: [], orderEmployees: {}, einlagerungen: [], auftragFahrzeuge: [] };

  // In Blöcken, weil eine `in`-Liste mit tausend Kennungen die URL-Länge sprengt, die
  // PostgREST für eine GET-Abfrage zulässt – ein Fehler, der erst im Betrieb auftritt und
  // dann aussieht, als sei die Auswertung kaputt.
  const BLOCK = 200;
  const positionen: OrderArticle[] = [];
  const zuordnungen: Record<string, string[]> = {};
  const fahrzeuge: AuftragFahrzeug[] = [];

  for (let i = 0; i < ids.length; i += BLOCK) {
    const teil = ids.slice(i, i + BLOCK);
    const p = await q<OrderArticle[]>(
      "Die Leistungen für die Auswertung konnten nicht geladen werden",
      supabase.from("order_articles").select("*").in("order_id", teil).is("deleted_at", null)
    );
    positionen.push(...(p || []));

    const z = await q<{ order_id: string; employee_id: string }[]>(
      "Die Mitarbeiter-Zuordnungen konnten nicht geladen werden",
      supabase.from("order_employees").select("order_id, employee_id").in("order_id", teil)
    );
    for (const zeile of z || []) {
      (zuordnungen[zeile.order_id] ??= []).push(zeile.employee_id);
    }

    const f = await q<AuftragFahrzeug[]>(
      "Die Fahrzeuge für die Auswertung konnten nicht geladen werden",
      supabase.from("auftrag_fahrzeuge").select("*").in("order_id", teil)
    );
    fahrzeuge.push(...(f || []));
  }

  // Einlagerungen nach Anlagedatum – die Frage „wie viele Sätze sind reingekommen" hängt
  // nicht am Auftrag, sondern am Vorgang selbst (es gibt Einlagerungen ohne Auftrag).
  const einlagerungen = await fetchPaged<TireStorage>(
    "Die Einlagerungen für die Auswertung konnten nicht geladen werden",
    (a, b) => supabase.from("tire_storage").select("*")
      .gte("created_at", von).lte("created_at", `${bis}T23:59:59`).range(a, b)
  );

  return { orders, orderArticles: positionen, orderEmployees: zuordnungen, einlagerungen, auftragFahrzeuge: fahrzeuge };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragFahrzeug, Betrieb, Order, OrderArticle, Rechnung, TireStorage } from "@/lib/types";
import { fetchBetrieb } from "./betrieb";
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
  // Seit dem 26.09.2026 ALLE Einlagerungen, nicht nur die im Zeitraum angelegten: Die Belegung im
  // Verlauf braucht auch die Sätze, die vorher kamen und im Zeitraum noch lagen.
  einlagerungen: TireStorage[];
  // Welche Fahrzeuge an einem Auftrag hingen (Migration 44). Bis zum 21.09.2026 las die
  // Auswertung dafür `orders.vehicle_id` – das ließ nur EINES zu und wurde mit Migration 51
  // entfernt.
  auftragFahrzeuge: AuftragFahrzeug[];
  // Das Rechnungsbuch im geladenen Zeitraum (Entwurf M): die Quelle des Umsatzes. Leer, wenn der
  // Nutzer es nicht lesen darf – das entscheidet die Oberfläche, nicht diese Abfrage.
  rechnungen: Rechnung[];
  // Erledigt mit „Rechnung nötig", aber ohne Rechnung – unabhängig vom Zeitraum.
  offeneRechnungsauftraege: Order[];
  lagerplaetze: number;
  betrieb: Betrieb | null;
};

// `von`/`bis` ist der GELADENE Zeitraum: Er umfasst den gewählten, das Vorjahr, die zwölf
// Monate der Säulen und die beiden Saisons für die Wiederkehr (siehe `ladeFenster` in
// components/auswertung/AuswertungPanel.tsx).
export async function fetchAuswertungsdaten(
  supabase: SupabaseClient,
  von: string,
  bis: string,
  mitRechnungen: boolean
): Promise<AuswertungsAbzug> {
  const orders = await fetchPaged<Order>(
    "Die Aufträge für die Auswertung konnten nicht geladen werden",
    (a, b) => supabase.from("orders").select("*").is("deleted_at", null)
      .gte("order_date", von).lte("order_date", bis).order("order_date").range(a, b)
  );
  const offeneRechnungsauftraege = await fetchPaged<Order>(
    "Die noch nicht abgerechneten Aufträge konnten nicht geladen werden",
    (a, b) => supabase.from("orders").select("*").is("deleted_at", null)
      .eq("status", "erledigt").eq("rechnung_noetig", true).is("rechnung_erstellt_am", null)
      .order("order_date").range(a, b)
  );

  const bekannt = new Set(orders.map((o) => o.id));
  const ids = [...orders.map((o) => o.id), ...offeneRechnungsauftraege.filter((o) => !bekannt.has(o.id)).map((o) => o.id)];

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

  const einlagerungen = await fetchPaged<TireStorage>(
    "Die Einlagerungen für die Auswertung konnten nicht geladen werden",
    (a, b) => supabase.from("tire_storage").select("*").order("created_at").range(a, b)
  );

  const rechnungen = mitRechnungen
    ? await fetchPaged<Rechnung>("Das Rechnungsbuch für die Auswertung konnte nicht geladen werden", (a, b) =>
        supabase.from("rechnungen").select("*").gte("datum", von).lte("datum", bis).order("nummer").range(a, b))
    : [];

  const plaetze = await supabase.from("storage_slots").select("id", { count: "exact", head: true });
  const betrieb = await fetchBetrieb(supabase);

  // Testkunden (Migration 60) zählen in keiner Auswertung: Ihre Aufträge und Rechnungen tragen
  // negative Nummern, ihre Reifen erkennt man am Kunden. Gefiltert wird hier an EINER Stelle,
  // damit keine der Kennzahlen darunter es vergessen kann.
  const testIds = new Set((await q<{ id: string }[]>(
    "Die Testkunden konnten nicht geladen werden",
    supabase.from("customers").select("id").eq("testkunde", true)
  ) || []).map((k) => k.id));
  const testAuftrag = new Set([...orders, ...offeneRechnungsauftraege].filter((o) => o.order_number < 0).map((o) => o.id));
  const echt = <T extends { order_id: string }>(zeilen: T[]) => zeilen.filter((z) => !testAuftrag.has(z.order_id));

  return {
    orders: orders.filter((o) => o.order_number > 0),
    orderArticles: echt(positionen),
    orderEmployees: Object.fromEntries(Object.entries(zuordnungen).filter(([id]) => !testAuftrag.has(id))),
    einlagerungen: einlagerungen.filter((t) => !testIds.has(t.customer_id)),
    auftragFahrzeuge: echt(fahrzeuge),
    rechnungen: rechnungen.filter((r) => r.nummer > 0),
    offeneRechnungsauftraege: offeneRechnungsauftraege.filter((o) => o.order_number > 0),
    lagerplaetze: plaetze.error ? 0 : plaetze.count ?? 0, betrieb,
  };
}

import { describe, expect, it } from "vitest";
import { groesseSchluessel, packliste } from "@/lib/packliste";
import type { Article, AuftragFahrzeug, Order, OrderArticle, Vehicle } from "@/lib/types";

const auftrag = (id: string, kunde: string, status: Order["status"] = "offen", datum = "2026-10-03") =>
  ({ id, customer_id: kunde, order_date: datum, status, deleted_at: null }) as unknown as Order;
const pos = (order_id: string, article_id: string, quantity: number, deleted_at: string | null = null) =>
  ({ id: order_id + article_id + quantity, order_id, article_id, quantity, deleted_at }) as unknown as OrderArticle;
const art = (id: string, short_name: string) => ({ id, short_name }) as unknown as Article;
const auto = (id: string, customer_id: string, tire_size: string | null) => ({ id, customer_id, tire_size }) as unknown as Vehicle;
const af = (order_id: string, vehicle_id: string) => ({ id: order_id + vehicle_id, order_id, vehicle_id }) as unknown as AuftragFahrzeug;

describe("packliste", () => {
  const artikel = [art("w", "Räderwechsel"), art("a", "Auswuchten")];
  const fahrzeuge = [auto("v1", "k1", "205/55 R16"), auto("v2", "k2", "205/55r16"), auto("v3", "k3", "225/45 R17"), auto("v4", "k3", "195/65 R15"), auto("v5", "k4", null)];
  const auftraege = [auftrag("o1", "k1"), auftrag("o2", "k2"), auftrag("o3", "k3"), auftrag("o4", "k4"), auftrag("o5", "k1", "erledigt"), auftrag("o6", "k1", "offen", "2026-10-04")];
  const positionen = [pos("o1", "w", 1), pos("o2", "w", 1), pos("o2", "a", 4), pos("o3", "w", 1), pos("o5", "w", 9), pos("o6", "w", 9), pos("o1", "a", 4, "2026-10-01")];

  it("zählt Leistungen nur offener Aufträge des Tages, ohne gelöschte Positionen", () => {
    const p = packliste("2026-10-03", auftraege, positionen, artikel, [], fahrzeuge);
    expect(p.auftraege).toBe(4);
    expect(p.leistungen).toEqual([{ name: "Auswuchten", menge: 4 }, { name: "Räderwechsel", menge: 3 }]);
  });
  it("Größen: Fahrzeug am Auftrag, sonst das einzige des Kunden, sonst unbekannt", () => {
    const p = packliste("2026-10-03", auftraege, positionen, artikel, [af("o3", "v3")], fahrzeuge);
    expect(p.groessen).toEqual([{ groesse: "205/55 R16", autos: 2 }, { groesse: "225/45 R17", autos: 1 }]);
    expect(p.ohneGroesse).toBe(1); // o4: Auto ohne Größe
    const ohneZuordnung = packliste("2026-10-03", auftraege, positionen, artikel, [], fahrzeuge);
    expect(ohneZuordnung.ohneGroesse).toBe(2); // o3: zwei Autos, keines am Auftrag; o4
  });
  it("vereinheitlicht die Schreibweise", () => {
    expect(groesseSchluessel(" 205/55r16 91V")).toBe("205/55 R16 91V");
  });
});

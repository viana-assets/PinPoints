import { describe, expect, it } from "vitest";
import { nachPlatz, packlisteGesamt, packlisteSpanne, packlisteTage, PACKLISTE_HORIZONT_TAGE } from "@/lib/packlisteAnsicht";
import type { Article, Order, OrderArticle, TireStorage, Vehicle, Verkaufsreifen } from "@/lib/types";

const auftrag = (id: string, kunde: string, datum: string, time: string | null = null, status: Order["status"] = "offen", nr = 1) =>
  ({ id, customer_id: kunde, order_date: datum, time, status, deleted_at: null, order_number: nr }) as unknown as Order;
const pos = (order_id: string, article_id: string, quantity: number, verkaufsreifen_id: string | null = null) =>
  ({ id: order_id + article_id, order_id, article_id, quantity, deleted_at: null, verkaufsreifen_id }) as unknown as OrderArticle;
const satz = (id: string, customer_id: string, slot: string) =>
  ({ id, customer_id, storage_slot_id: slot, vehicle_id: null, order_id: null, removed_at: null, created_at: "2026-01-01" }) as unknown as TireStorage;
const auto = (id: string, customer_id: string, tire_size: string | null) => ({ id, customer_id, tire_size }) as unknown as Vehicle;
const artikel = [{ id: "w", short_name: "Räderwechsel" }, { id: "r", short_name: "Reifen neu" }] as unknown as Article[];
const reifen = { id: "vr1", breite: 205, querschnitt: 55, zoll: 16, hersteller: "Muster", modell: null, storage_slot_id: "VK1" } as unknown as Verkaufsreifen;

describe("packlisteSpanne", () => {
  // 26.10.2026 ist ein Montag.
  it("rechnet die Zeiträume ab heute", () => {
    expect(packlisteSpanne("heute", "2026-10-26")).toEqual({ von: "2026-10-26", bis: "2026-10-26" });
    expect(packlisteSpanne("morgen", "2026-10-26")).toEqual({ von: "2026-10-27", bis: "2026-10-27" });
    expect(packlisteSpanne("woche", "2026-10-28")).toEqual({ von: "2026-10-28", bis: "2026-11-01" });
    expect(packlisteSpanne("naechste", "2026-10-28")).toEqual({ von: "2026-11-02", bis: "2026-11-08" });
    expect(packlisteSpanne("naechste", "2026-11-01")).toEqual({ von: "2026-11-02", bis: "2026-11-08" });
    expect(packlisteSpanne("14", "2026-10-26")).toEqual({ von: "2026-10-26", bis: "2026-11-08" });
    expect(packlisteSpanne("alle", "2026-10-26").bis).toBe("2027-01-25");
    expect(PACKLISTE_HORIZONT_TAGE).toBe(92);
  });
});

describe("packlisteTage", () => {
  const auftraege = [
    auftrag("o1", "k1", "2026-10-26", "10:00"),
    auftrag("o2", "k2", "2026-10-26", "08:00"),
    auftrag("o3", "k1", "2026-10-29", "09:00"), // zweiter Termin von k1 – sein Satz steht schon am 26.
    auftrag("o4", "k3", "2026-10-25"), // gestern: gehört nicht dazu
    auftrag("o5", "k3", "2026-10-27", null, "erledigt"),
    auftrag("o6", "k4", "2026-10-30"),
  ];
  const basis = {
    von: "2026-10-26", bis: "2026-11-08", auftraege, artikel,
    positionen: [pos("o1", "w", 1), pos("o2", "w", 1), pos("o6", "r", 4, "vr1")],
    auftragFahrzeuge: [], fahrzeuge: [auto("v1", "k1", "205/55 R16"), auto("v2", "k2", "225/45 R17")],
    einlagerungen: [satz("s1", "k1", "BC-10"), satz("s2", "k2", "BC-2")],
    verkaufsreifen: [reifen],
  };

  it("nur offene Aufträge ab heute, Tage aufsteigend, Aufträge nach Uhrzeit", () => {
    const tage = packlisteTage(basis);
    expect(tage.map((t) => t.datum)).toEqual(["2026-10-26", "2026-10-29", "2026-10-30"]);
    expect(tage[0].auftraege.map((o) => o.id)).toEqual(["o2", "o1"]);
    expect(tage[0].kw).toBe(44);
  });
  it("ein Satz nur beim ersten Termin, auch über mehrere Tage", () => {
    const tage = packlisteTage(basis);
    expect(tage[0].saetze.map((s) => s.satz.id)).toEqual(["s2", "s1"]);
    expect(tage[1].saetze).toEqual([]);
  });
  it("reservierte Verkaufsreifen gehören zum Tag ihres Auftrags", () => {
    const tage = packlisteTage(basis);
    expect(tage[2].verkauf).toHaveLength(1);
    expect(tage[2].verkauf[0].reifen?.id).toBe("vr1");
    expect(tage[2].verkauf[0].position.quantity).toBe(4);
    expect(tage[0].verkauf).toEqual([]);
  });
  it("Leistungen und Größen wie die Packliste im Dashboard", () => {
    const t = packlisteTage(basis)[0];
    expect(t.liste.leistungen).toEqual([{ name: "Räderwechsel", menge: 2 }]);
    expect(t.liste.groessen).toHaveLength(2);
  });
  it("ohne Lagerrecht keine Sätze", () => {
    const tage = packlisteTage({ ...basis, einlagerungen: [] });
    expect(tage.flatMap((t) => t.saetze)).toEqual([]);
  });
});

describe("packlisteGesamt und nachPlatz", () => {
  const tage = packlisteTage({
    von: "2026-10-26", bis: "2026-11-08", artikel,
    auftraege: [auftrag("o1", "k1", "2026-10-26"), auftrag("o2", "k2", "2026-11-03"), auftrag("o3", "k3", "2026-11-04")],
    positionen: [pos("o1", "w", 1), pos("o2", "w", 1), pos("o3", "w", 2)],
    auftragFahrzeuge: [], fahrzeuge: [auto("v1", "k1", "205/55 R16"), auto("v2", "k2", "205/55 R16"), auto("v3", "k3", null)],
    einlagerungen: [satz("s1", "k1", "BC-10"), satz("s2", "k2", "BC-2"), satz("s3", "k3", "AA-7")],
    verkaufsreifen: [],
  });

  it("summiert Leistungen und Größen je Kalenderwoche", () => {
    const g = packlisteGesamt(tage);
    expect(g.auftraege).toBe(3);
    expect(g.wochen).toEqual([44, 45]);
    expect(g.leistungen).toEqual([{ name: "Räderwechsel", menge: 4 }]);
    expect(g.groessen).toEqual([{ groesse: "205/55 R16", jeWoche: { 44: 1, 45: 1 }, summe: 2 }]);
    expect(g.ohneGroesse).toBe(1);
    expect(g.saetze.map((s) => s.datum)).toEqual(["2026-10-26", "2026-11-03", "2026-11-04"]);
  });
  it("sortiert die Sätze nach Lager und Platz in natürlicher Reihenfolge", () => {
    const g = packlisteGesamt(tage);
    const lager: Record<string, string> = { "BC-10": "Hauptlager", "BC-2": "Hauptlager", "AA-7": "Hauptlager" };
    const sortiert = nachPlatz(g.saetze, (id) => ({ lager: lager[id], code: id }));
    expect(sortiert.map((s) => s.satz.storage_slot_id)).toEqual(["AA-7", "BC-2", "BC-10"]);
  });
});

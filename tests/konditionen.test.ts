import { describe, expect, it } from "vitest";
import type { Article, Customer, Order, OrderArticle } from "@/lib/types";
import { artikelWerteTeilen, gruppenSumme, konditionenJeKunde, konditionenSumme, kundenMitKonditionen, positionsArt } from "@/lib/konditionen";

// Kundenkonditionen in der Auswertung (v192). Erfundene Daten.
const Z = { von: "2026-11-01", bis: "2026-11-30" };
const c = (id: string, extra: Partial<Customer> = {}) => ({ id, name: "", company: "Firma " + id, kundennummer: 10000, haupt_kunde_id: null, laufkundschaft: false, einmalkunde: false, deleted_at: null, ...extra }) as unknown as Customer;
const o = (id: string, kunde: string, datum: string, extra: Partial<Order> = {}) => ({ id, customer_id: kunde, order_date: datum, status: "erledigt", deleted_at: null, rechnung_noetig: true, ...extra }) as unknown as Order;
const p = (id: string, auftrag: string, artikel: string, menge: number, preis: number, liste: number | null = null, extra: Partial<OrderArticle> = {}) =>
  ({ id, order_id: auftrag, article_id: artikel, quantity: menge, net_price: preis, vat_rate: 19, endpreis_netto: null, note: null, created_at: "", deleted_at: null, listenpreis_netto: liste, ...extra }) as OrderArticle;
const A = [{ id: "w", customer_id: null }, { id: "z", customer_id: null }, { id: "fc", customer_id: "h" }] as Pick<Article, "id" | "customer_id">[];
const KUNDEN = [c("h", { company: "Holding" }), c("u", { company: "Nord", haupt_kunde_id: "h" }), c("x"), c("l", { laufkundschaft: true }), c("alt", { deleted_at: "2026-01-01" })];
const AUFTRAEGE = [o("o1", "u", "2026-11-05"), o("o2", "u", "2026-11-20"), o("o3", "h", "2026-11-10"), o("o4", "x", "2026-11-11"),
  o("o5", "l", "2026-11-12"), o("o6", "u", "2026-10-30"), o("o7", "u", "2026-11-15", { status: "offen" })];
const POS = [
  p("1", "o1", "w", 1, 20, 25), p("2", "o1", "z", 4, 12), p("3", "o2", "w", 2, 20, 25), p("4", "o3", "fc", 3, 40),
  p("5", "o4", "w", 1, 25), p("6", "o5", "w", 1, 20, 25), p("7", "o6", "w", 1, 20, 25), p("8", "o7", "w", 1, 20, 25),
  p("9", "o2", "z", 1, 12, null, { deleted_at: "x" }),
];
const D = { orders: AUFTRAEGE, orderArticles: POS, articles: A, customers: KUNDEN };

describe("Konditionen je Kunde", () => {
  it("Art der Position", () => {
    const ka = new Set(["fc"]);
    expect(positionsArt({ article_id: "fc", listenpreis_netto: null }, ka)).toBe("kundenartikel");
    expect(positionsArt({ article_id: "w", listenpreis_netto: 25 }, ka)).toBe("kundenpreis");
    expect(positionsArt({ article_id: "w", listenpreis_netto: null }, ka)).toBe("liste");
  });
  it("Aufteilung, Preisvorteil, Aufträge, letzter Auftrag – nur erledigt, im Zeitraum, ohne Laufkundschaft", () => {
    const je = konditionenJeKunde(D, Z);
    expect(je.get("u")).toMatchObject({ auftraege: 2, netto: 108, liste: 48, kundenpreis: 60, kundenartikel: 0, preisvorteil: 15, letzterAuftrag: "2026-11-20" });
    expect(je.get("h")).toMatchObject({ auftraege: 1, netto: 120, kundenartikel: 120, preisvorteil: 0 });
    expect(je.get("x")).toMatchObject({ netto: 25, liste: 25 });
    expect(je.has("l")).toBe(false);
  });
  it("Kunden mit Konditionen: hinterlegt oder abgerechnet, größter Vorteil zuerst; Summe; Gruppe", () => {
    const je = konditionenJeKunde(D, Z);
    const liste = kundenMitKonditionen(je, D, [{ customer_id: "u" }, { customer_id: "alt" }]);
    expect(liste.map((x) => x.id)).toEqual(["u", "h"]);
    expect(liste[0].hinterlegt).toBe(true);
    expect(liste[1].hinterlegt).toBe(true);
    expect(konditionenSumme(liste)).toEqual({ kunden: 2, netto: 228, kundenpreis: 60, kundenartikel: 120, preisvorteil: 15 });
    expect(gruppenSumme("h", je, KUNDEN)).toMatchObject({ netto: 228, preisvorteil: 15 });
    expect(gruppenSumme("x", je, KUNDEN)).toBeNull();
  });
  it("ein hinterlegter Kundenpreis ohne Auftrag steht mit null in der Liste", () => {
    const liste = kundenMitKonditionen(new Map(), D, [{ customer_id: "x" }]);
    expect(liste.map((x) => [x.id, x.netto, x.hinterlegt])).toEqual([["x", 0, true], ["h", 0, true]]);
  });
  it("Artikelwerte: Kundenartikel getrennt, mit Kunde", () => {
    const t = artikelWerteTeilen([{ id: "w", name: "Wechsel", menge: 3, umsatzNetto: 60 }, { id: "fc", name: "Flottencheck", menge: 3, umsatzNetto: 120 }], A, KUNDEN);
    expect(t.standard.map((x) => x.id)).toEqual(["w"]);
    expect(t.kunden).toEqual([{ id: "fc", name: "Flottencheck", menge: 3, umsatzNetto: 120, kundeId: "h", kunde: "Holding" }]);
  });
});

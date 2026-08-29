import { describe, expect, it } from "vitest";
import { currentArticlePrice, orderArticleTotals, terminTitel, DEFAULT_VAT_RATE } from "@/lib/helpers";
import type { ArticlePrice, OrderArticle } from "@/lib/types";

// Diese Funktionen tragen später die Rechnungsstellung (docs/roadmap.md Phase 5). Ein Fehler
// hier fällt im Alltag nicht auf, sondern erst auf einer falschen Rechnung – deshalb sind sie
// die erste Stelle, die Tests bekommt.

// Object.assign statt Spread, damit die Fabriken auch unter "strict": true (Roadmap Phase 12)
// den vollständigen Typ zurückgeben: ein Spread aus Partial<T> würde jedes Feld wieder als
// möglicherweise undefined typisieren.
function preis(teil: Partial<ArticlePrice>): ArticlePrice {
  const standard: ArticlePrice = {
    id: "p1",
    article_id: "a1",
    net_price: 100,
    vat_rate: DEFAULT_VAT_RATE,
    valid_from: "2026-01-01",
    valid_to: null,
    created_at: "2026-01-01T00:00:00Z",
  };
  return Object.assign(standard, teil);
}

function position(teil: Partial<OrderArticle>): OrderArticle {
  const standard: OrderArticle = {
    id: "oa1",
    order_id: "o1",
    article_id: "a1",
    quantity: 1,
    net_price: 100,
    vat_rate: DEFAULT_VAT_RATE,
    discount_percent: 0,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  };
  return Object.assign(standard, teil);
}

describe("currentArticlePrice", () => {
  it("nimmt den zum Stichtag gültigen Preis", () => {
    const prices = [
      preis({ id: "alt", net_price: 80, valid_from: "2026-01-01", valid_to: "2026-05-31" }),
      preis({ id: "neu", net_price: 90, valid_from: "2026-06-01", valid_to: null }),
    ];
    expect(currentArticlePrice(prices, "2026-03-15")?.id).toBe("alt");
    expect(currentArticlePrice(prices, "2026-08-01")?.id).toBe("neu");
  });

  it("nimmt bei mehreren passenden Zeiträumen den zuletzt begonnenen", () => {
    const prices = [
      preis({ id: "frueher", net_price: 80, valid_from: "2026-01-01", valid_to: null }),
      preis({ id: "spaeter", net_price: 90, valid_from: "2026-06-01", valid_to: null }),
    ];
    expect(currentArticlePrice(prices, "2026-08-01")?.id).toBe("spaeter");
  });

  it("liefert null, wenn zum Stichtag kein Preis gilt", () => {
    const prices = [preis({ valid_from: "2026-06-01", valid_to: "2026-06-30" })];
    expect(currentArticlePrice(prices, "2026-01-01")).toBeNull();
    expect(currentArticlePrice(prices, "2026-07-01")).toBeNull();
  });

  it("schließt die Randtage des Gültigkeitszeitraums ein", () => {
    const prices = [preis({ valid_from: "2026-06-01", valid_to: "2026-06-30" })];
    expect(currentArticlePrice(prices, "2026-06-01")).not.toBeNull();
    expect(currentArticlePrice(prices, "2026-06-30")).not.toBeNull();
  });
});

describe("orderArticleTotals", () => {
  it("rechnet Menge und MwSt. zusammen", () => {
    const summe = orderArticleTotals([position({ quantity: 2, net_price: 50, vat_rate: 19 })]);
    expect(summe.net).toBeCloseTo(100, 6);
    expect(summe.vat).toBeCloseTo(19, 6);
    expect(summe.gross).toBeCloseTo(119, 6);
  });

  it("zieht den Rabatt je Position vom Nettobetrag ab, bevor die MwSt. gerechnet wird", () => {
    const summe = orderArticleTotals([position({ quantity: 1, net_price: 200, discount_percent: 25, vat_rate: 19 })]);
    expect(summe.net).toBeCloseTo(150, 6);
    expect(summe.vat).toBeCloseTo(28.5, 6);
    expect(summe.gross).toBeCloseTo(178.5, 6);
  });

  it("addiert Positionen mit unterschiedlichen MwSt.-Sätzen korrekt", () => {
    const summe = orderArticleTotals([
      position({ id: "a", net_price: 100, vat_rate: 19 }),
      position({ id: "b", net_price: 100, vat_rate: 7 }),
    ]);
    expect(summe.net).toBeCloseTo(200, 6);
    expect(summe.vat).toBeCloseTo(26, 6);
    expect(summe.gross).toBeCloseTo(226, 6);
  });

  it("liefert für einen Auftrag ohne Leistungen überall null", () => {
    expect(orderArticleTotals([])).toEqual({ net: 0, vat: 0, gross: 0 });
  });
});

describe("terminTitel", () => {
  it("hängt den Kundennamen an", () => {
    expect(terminTitel("Daniel Hartman")).toBe("Termin – Daniel Hartman");
  });

  it("fällt auf den blanken Titel zurück, wenn kein Name da ist", () => {
    expect(terminTitel("")).toBe("Termin");
    expect(terminTitel("   ")).toBe("Termin");
    expect(terminTitel(null)).toBe("Termin");
    expect(terminTitel(undefined)).toBe("Termin");
  });

  it("entfernt überflüssigen Leerraum um den Namen", () => {
    expect(terminTitel("  Daniel Hartman  ")).toBe("Termin – Daniel Hartman");
  });
});

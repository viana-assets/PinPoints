// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Article, Customer, Order, OrderArticle } from "@/lib/types";

// Auswertung: Reiter „Konditionen“, Kundenartikel im Reiter „Artikel“, Aufteilung im Reiter „Kunden“ (v192). Erfundene Daten.
const heute = new Date();
const tag = (d: number) => { const x = new Date(heute); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const o = (id: string, kunde: string, datum: string) => ({ id, customer_id: kunde, order_date: datum, status: "erledigt", deleted_at: null, rechnung_noetig: false, order_number: 1 }) as unknown as Order;
const p = (id: string, auftrag: string, artikel: string, menge: number, preis: number, liste: number | null = null) =>
  ({ id, order_id: auftrag, article_id: artikel, quantity: menge, net_price: preis, vat_rate: 19, endpreis_netto: null, note: null, created_at: "", deleted_at: null, listenpreis_netto: liste }) as OrderArticle;
const daten = vi.hoisted(() => ({ abzug: null as unknown }));
vi.mock("@/lib/supabaseClient", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/api/auswertung", () => ({ fetchAuswertungsdaten: vi.fn(async () => daten.abzug) }));
vi.mock("@/lib/api/zeiterfassung", () => ({ fetchZeitSchichten: vi.fn(async () => []), fetchZeitAbwesenheiten: vi.fn(async () => []), fetchZeitKorrekturenZeitraum: vi.fn(async () => []) }));

import { AuswertungPanel } from "@/components/auswertung/AuswertungPanel";

const K = [
  { id: "h", name: "", company: "Kunterbunt Holding", kundennummer: 10001, haupt_kunde_id: null, laufkundschaft: false, einmalkunde: false, deleted_at: null },
  { id: "u", name: "", company: "Kunterbunt Nord", kundennummer: 10002, haupt_kunde_id: "h", laufkundschaft: false, einmalkunde: false, deleted_at: null },
] as unknown as Customer[];
const A = [
  { id: "w", article_number: 1, short_name: "Radwechsel", long_name: "", active: true, abrechnungsart: "normal", einheit: "Stück", customer_id: null },
  { id: "fc", article_number: 601, short_name: "Flottencheck", long_name: "", active: true, abrechnungsart: "normal", einheit: "Stück", customer_id: "h" },
] as unknown as Article[];
afterEach(() => cleanup());

function zeigen(darf: boolean) {
  daten.abzug = {
    orders: [o("o1", "u", tag(1)), o("o2", "h", tag(2))], orderArticles: [p("1", "o1", "w", 2, 20, 25), p("2", "o2", "fc", 3, 40)],
    orderEmployees: {}, einlagerungen: [], auftragFahrzeuge: [], rechnungen: [], offeneRechnungsauftraege: [], lagerplaetze: 0, betrieb: null, reifenVerkauf: null,
  };
  render(<AuswertungPanel employees={[]} articles={A} articlePrices={[]} customers={K} vehicles={[]} darfRechnungen={false} darfReifenverkauf={false}
    standardDauerMin={60} onOpenOrder={() => {}} onOpenCustomer={() => {}} darfKonditionen={darf} kundenpreise={[]} />);
}

describe("Auswertung – Konditionen", () => {
  it("Reiter nur mit Recht", () => {
    zeigen(false);
    expect(screen.queryByRole("tab", { name: "Konditionen" })).toBeNull();
  });
  it("Konditionen: Preisvorteil, Kunden, Gruppe gesamt", async () => {
    zeigen(true);
    fireEvent.click(screen.getByRole("button", { name: /12 Monate/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Konditionen" }));
    await screen.findByText("Kunden mit Konditionen", { selector: ".db-karte-titel" });
    expect(document.querySelector(".am-a-titel")?.textContent).toMatch(/^PREISVORTEIL/);
    expect(document.querySelector(".am-a-wert")?.textContent).toMatch(/10\s€/);
    const zeilen = [...document.querySelectorAll(".am-listen-zeile b")].map((e) => e.textContent ?? "");
    expect(zeilen[0]).toContain("Kunterbunt Nord");
    expect(screen.getByText(/Gruppe gesamt/)).toBeTruthy();
  });
  it("Artikel: Kundenartikel getrennt, Umschalter", async () => {
    zeigen(true);
    fireEvent.click(screen.getByRole("button", { name: /12 Monate/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Artikel" }));
    await screen.findByText("Kundenartikel", { selector: ".db-karte-titel" });
    expect(screen.getByText(/· Kunterbunt Holding/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    expect(screen.queryByText("Kundenartikel", { selector: ".db-karte-titel" })).toBeNull();
    expect(screen.getByText("Radwechsel")).toBeTruthy();
  });
  it("Kunden: Karte Kundenkonditionen", async () => {
    zeigen(true);
    fireEvent.click(screen.getByRole("button", { name: /12 Monate/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Kunden" }));
    await screen.findByText("Kundenkonditionen");
    expect(screen.getByRole("button", { name: /2 Kunden mit Konditionen ansehen/ })).toBeTruthy();
  });
});

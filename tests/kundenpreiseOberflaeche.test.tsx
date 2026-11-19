// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticlePrice, Customer, KundenPreis, OrderArticle } from "@/lib/types";

// Kundenpreise im Kundenfenster und in der Leistungsauswahl (Migration 118, v191). Erfundene Daten.
const api = vi.hoisted(() => ({
  kundenpreisAnlegen: vi.fn(async () => undefined), kundenpreisAendern: vi.fn(async () => undefined),
  kundenpreisLoeschen: vi.fn(async () => undefined), fetchKundenpreise: vi.fn(),
}));
vi.mock("@/lib/api/kundenpreise", () => api);

import { KundenpreiseKarte } from "@/components/kunden/KundenpreiseKarte";
import { ArticleAssignPanel } from "@/components/auftraege/ArticleAssignPanel";
import { kundenpreiseAm } from "@/lib/kundenpreise";

const sb = {} as SupabaseClient;
const k = (id: string, extra: Partial<Customer> = {}) => ({ id, name: "", company: "Firma " + id, address: "Weg 1", haupt_kunde_id: null, laufkundschaft: false, ...extra }) as unknown as Customer;
const H = k("h", { company: "Gruppe" });
const U = k("u", { haupt_kunde_id: "h" });
const ART = [
  { id: "w", article_number: 1, short_name: "Radwechsel", long_name: "", active: true, abrechnungsart: "normal", einheit: "Satz" },
  { id: "z", article_number: 2, short_name: "Aufziehen", long_name: "", active: true, abrechnungsart: "normal", einheit: "Stück" },
  { id: "r", article_number: 3, short_name: "Reifen neu", long_name: "", active: true, abrechnungsart: "reifenverkauf_neu", einheit: "Stück" },
] as unknown as Article[];
const LISTE: ArticlePrice[] = [
  { id: "p1", article_id: "w", net_price: 25, vat_rate: 19, valid_from: "2020-01-01", valid_to: null, created_at: "" },
  { id: "p2", article_id: "z", net_price: 12, vat_rate: 19, valid_from: "2020-01-01", valid_to: null, created_at: "" },
];
const kp = (id: string, kunde: string, artikel: string, preis: number, extra: Partial<KundenPreis> = {}): KundenPreis =>
  ({ id, customer_id: kunde, article_id: artikel, net_price: preis, valid_from: null, valid_to: null, notiz: null, ...extra });
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("KundenpreiseKarte", () => {
  it("listet eigene Preise mit Listenpreis und die des Hauptkunden", () => {
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={U} kunden={[H, U]} articles={ART} articlePrices={LISTE}
      preise={[kp("1", "u", "w", 18, { valid_to: "2099-12-31", notiz: "Rahmenvertrag" }), kp("2", "h", "z", 9), kp("3", "h", "w", 1, { valid_to: "2020-01-01" })]} />));
    expect(screen.getByText("Kundenpreise (1)")).toBeTruthy();
    expect(screen.getByText("18,00 €")).toBeTruthy();
    expect(screen.getByText("Liste 25,00 €")).toBeTruthy();
    expect(screen.getByText(/Rahmenvertrag/)).toBeTruthy();
    expect(screen.getByText(/Vom Hauptkunden Gruppe/)).toBeTruthy();
    expect(screen.getByText(/Aufziehen 9,00 €/)).toBeTruthy();
    // Abgelaufene des Hauptkunden erscheinen nicht.
    expect(screen.queryByText(/1,00 €/)).toBeNull();
  });
  it("Laufkundschaft ohne Karte, fehlende Migration als Hinweis", () => {
    const { container } = render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={k("l", { laufkundschaft: true })} kunden={[]} articles={ART} articlePrices={LISTE} preise={[]} />));
    expect(container.innerHTML).toBe("");
    cleanup();
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={H} kunden={[H]} articles={ART} articlePrices={LISTE} preise={[]} fehlt />));
    expect(screen.getByText(/ab Migration 118/)).toBeTruthy();
  });
  it("neu anlegen: Reifenverkauf nicht wählbar, Überschneidung gemeldet, Speichern", async () => {
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={H} kunden={[H]} articles={ART} articlePrices={LISTE} preise={[kp("1", "h", "w", 20)]} />));
    fireEvent.click(screen.getByRole("button", { name: "+ Kundenpreis" }));
    const dlg = screen.getByRole("dialog");
    const wahl = within(dlg).getByRole("combobox") as HTMLSelectElement;
    expect([...wahl.options].map((o) => o.textContent)).toEqual(["– wählen –", "Aufziehen", "Radwechsel"]);
    const speichern = within(dlg).getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    fireEvent.change(wahl, { target: { value: "w" } });
    fireEvent.change(within(dlg).getByPlaceholderText("25"), { target: { value: "19,50" } });
    expect(within(dlg).getByText(/schon einen Kundenpreis/)).toBeTruthy();
    expect(speichern.disabled).toBe(true);
    fireEvent.change(wahl, { target: { value: "z" } });
    expect(within(dlg).getByText(/Listenpreis 12,00 €/)).toBeTruthy();
    fireEvent.change(within(dlg).getByPlaceholderText("12"), { target: { value: "10" } });
    expect(within(dlg).getByText(/2,00 € günstiger/)).toBeTruthy();
    expect(speichern.disabled).toBe(false);
    fireEvent.click(speichern);
    await vi.waitFor(() => expect(api.kundenpreisAnlegen).toHaveBeenCalledWith(sb, "h", expect.objectContaining({ artikelId: "z", preis: "10" })));
  });
  it("ändern und löschen mit Rückfrage", async () => {
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={H} kunden={[H]} articles={ART} articlePrices={LISTE} preise={[kp("1", "h", "w", 20)]} />));
    fireEvent.click(screen.getByRole("button", { name: /Radwechsel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByText(/Kundenpreis löschen\?/)).toBeTruthy();
    const knoepfe = screen.getAllByRole("button", { name: "Löschen" });
    fireEvent.click(knoepfe[knoepfe.length - 1]);
    await vi.waitFor(() => expect(api.kundenpreisLoeschen).toHaveBeenCalledWith(sb, "1"));
  });
});

describe("Leistungen im Auftrag", () => {
  const zeile = (extra: Partial<OrderArticle>) => ({ id: "x", order_id: "o1", article_id: "w", quantity: 1, net_price: 18, vat_rate: 19, endpreis_netto: null, note: null,
    created_at: "", deleted_at: null, ...extra }) as OrderArticle;
  it("die Zeile nennt den Kundenpreis, die Auswahl zeigt ihn mit durchgestrichenem Listenpreis", () => {
    render(<ArticleAssignPanel orderId="o1" articles={ART} articlePrices={LISTE} rows={[zeile({ listenpreis_netto: 25 })]} rechnungNoetig={false}
      onAdd={async () => {}} onUpdateQty={async () => {}} onUpdateEndpreis={async () => {}} onUpdateText={async () => {}} onRemove={async () => {}}
      kundenpreise={kundenpreiseAm("u", "2026-12-10", [kp("1", "h", "w", 18)], [H, U])} />);
    expect(screen.getByText(/Kundenpreis \(Liste 25,00 €\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ Leistung hinzufügen" }));
    const dlg = screen.getByRole("dialog", { name: "Leistung hinzufügen" });
    const wechsel = within(dlg).getByRole("button", { name: /Radwechsel/ });
    expect(wechsel.textContent).toMatch(/18,00\s€/);
    expect(wechsel.querySelector("s")?.textContent).toMatch(/^25,00\s€$/);
    expect(within(dlg).getByRole("button", { name: /Aufziehen/ }).querySelector("s")).toBeNull();
  });
});

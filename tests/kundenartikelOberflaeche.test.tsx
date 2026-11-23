// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticlePrice, Customer } from "@/lib/types";

// Kundenartikel im Kundenfenster, in der Leistungsauswahl und im Artikelstamm (Migration 119, v192). Erfundene Daten.
const api = vi.hoisted(() => ({ kundenartikelAnlegen: vi.fn(async () => "neu") }));
vi.mock("@/lib/api/kundenartikel", () => api);
vi.mock("@/lib/api/kundenpreise", () => ({ kundenpreisAnlegen: vi.fn(), kundenpreisAendern: vi.fn(), kundenpreisLoeschen: vi.fn(), fetchKundenpreise: vi.fn() }));

import { KundenpreiseKarte } from "@/components/kunden/KundenpreiseKarte";
import { ArticleAssignPanel } from "@/components/auftraege/ArticleAssignPanel";
import { ArticleAdminPanel } from "@/components/admin/artikel/ArticleAdminPanel";

const sb = {} as SupabaseClient;
const k = (id: string, extra: Partial<Customer> = {}) => ({ id, name: "", company: "Firma " + id, kundennummer: 10000, address: "Weg 1", haupt_kunde_id: null, laufkundschaft: false, ...extra }) as unknown as Customer;
const H = k("h", { company: "Kunterbunt Holding", kundennummer: 10001 });
const U = k("u", { company: "Kunterbunt Nord", haupt_kunde_id: "h", kundennummer: 10002 });
const X = k("x", { company: "Andere GmbH", kundennummer: 10003 });
const a = (id: string, nr: number, name: string, kunde: string | null, extra: Partial<Article> = {}) =>
  ({ id, article_number: nr, short_name: name, long_name: name + " (Rechnung)", active: true, abrechnungsart: "normal", einheit: "Stück", freitext: false, fragt_einlagerung: false, customer_id: kunde, ...extra }) as unknown as Article;
const ART = [a("w", 1, "Radwechsel", null), a("fc", 601, "Flottencheck", "h"), a("bs", 602, "Bringservice", "u"), a("fr", 603, "Fremddienst", "x"), a("alt", 604, "Altdienst", "u", { active: false })];
const LP = (id: string, art: string, preis: number): ArticlePrice => ({ id, article_id: art, net_price: preis, vat_rate: 19, valid_from: "2020-01-01", valid_to: null, created_at: "" });
const LISTE = [LP("1", "w", 25), LP("2", "fc", 40), LP("3", "bs", 15), LP("4", "fr", 9)];
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Kundenfenster: Preise und Artikel", () => {
  it("eigene Kundenartikel mit Preis, inaktive blass, die des Hauptkunden darunter", () => {
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={U} kunden={[H, U, X]} preise={[]} articles={ART} articlePrices={LISTE}
      darfKundenpreise={false} darfArtikel darfArtikelSchreiben artikelEditor={() => null} />));
    expect(screen.getByText("Preise und Artikel")).toBeTruthy();
    expect(screen.getByText("Kundenartikel (2)")).toBeTruthy();
    expect(screen.getByText("Bringservice")).toBeTruthy();
    expect(screen.getByText(/604 · Altdienst \(Rechnung\) · inaktiv/)).toBeTruthy();
    expect(screen.getByText(/Vom Hauptkunden Kunterbunt Holding/)).toBeTruthy();
    expect(screen.getByText(/Flottencheck/)).toBeTruthy();
    expect(screen.queryByText(/Fremddienst/)).toBeNull();
    expect(screen.queryByText(/Kundenpreise/)).toBeNull();
  });
  it("ohne Schreibrecht kein Anlegen; ohne beide Rechte keine Karte", () => {
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={H} kunden={[H]} preise={[]} articles={ART} articlePrices={LISTE} darfKundenpreise={false} darfArtikel />));
    expect(screen.queryByRole("button", { name: "+ Kundenartikel" })).toBeNull();
    cleanup();
    const { container } = render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={H} kunden={[H]} preise={[]} articles={ART} articlePrices={LISTE} darfKundenpreise={false} />));
    expect(container.innerHTML).toBe("");
  });
  it("neuen Kundenartikel anlegen", async () => {
    const angelegt = vi.fn();
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={X} kunden={[X]} preise={[]} articles={ART} articlePrices={LISTE}
      darfKundenpreise={false} darfArtikel darfArtikelSchreiben onArtikelAngelegt={angelegt} />));
    fireEvent.click(screen.getByRole("button", { name: "+ Kundenartikel" }));
    const dlg = screen.getByRole("dialog");
    const anlegen = within(dlg).getByRole("button", { name: "Anlegen" }) as HTMLButtonElement;
    expect(anlegen.disabled).toBe(true);
    fireEvent.change(within(dlg).getByPlaceholderText("z. B. Flottencheck"), { target: { value: "Hofservice" } });
    fireEvent.change(within(dlg).getByPlaceholderText(/je Fahrzeug laut Rahmenvertrag/), { target: { value: "Hofservice am Standort" } });
    fireEvent.change(within(dlg).getByPlaceholderText("z. B. 40"), { target: { value: "35,50" } });
    expect(anlegen.disabled).toBe(false);
    fireEvent.click(anlegen);
    await vi.waitFor(() => expect(api.kundenartikelAnlegen).toHaveBeenCalledWith(sb, "x", expect.objectContaining({ kurz: "Hofservice", preis: "35,50", mwst: "19", einheit: "Stück" })));
    await vi.waitFor(() => expect(angelegt).toHaveBeenCalled());
  });
  it("ein Kundenartikel öffnet das Artikelfenster der Seite", () => {
    const editor = vi.fn(() => <div>Artikelfenster</div>);
    render(mitQuery(<KundenpreiseKarte supabase={sb} kunde={U} kunden={[H, U]} preise={[]} articles={ART} articlePrices={LISTE}
      darfKundenpreise={false} darfArtikel darfArtikelSchreiben artikelEditor={editor} />));
    fireEvent.click(screen.getByRole("button", { name: /Bringservice/ }));
    expect(screen.getByText("Artikelfenster")).toBeTruthy();
    expect((editor.mock.calls[0] as unknown[])[0]).toMatchObject({ id: "bs" });
  });
});

describe("Leistungsauswahl im Auftrag", () => {
  it("Kundenartikel der Gruppe oben, fremde und inaktive nicht", () => {
    render(<ArticleAssignPanel orderId="o" articles={ART} articlePrices={LISTE} rows={[]} rechnungNoetig={false}
      onAdd={async () => {}} onUpdateQty={async () => {}} onUpdateEndpreis={async () => {}} onUpdateText={async () => {}} onRemove={async () => {}}
      kundenIds={["h", "u"]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Leistung hinzufügen" }));
    const dlg = screen.getByRole("dialog", { name: "Leistung hinzufügen" });
    const texte = [...dlg.querySelectorAll(".ls-gruppe, .ls-artikel b")].map((e) => e.textContent);
    expect(texte).toEqual(["Für diesen Kunden", "Flottencheck", "Bringservice", "Alle Leistungen", "Radwechsel"]);
  });
  it("ohne Kundenangabe keine Kundenartikel und keine Überschriften", () => {
    render(<ArticleAssignPanel orderId="o" articles={ART} articlePrices={LISTE} rows={[]} rechnungNoetig={false}
      onAdd={async () => {}} onUpdateQty={async () => {}} onUpdateEndpreis={async () => {}} onUpdateText={async () => {}} onRemove={async () => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Leistung hinzufügen" }));
    const dlg = screen.getByRole("dialog", { name: "Leistung hinzufügen" });
    expect([...dlg.querySelectorAll(".ls-gruppe, .ls-artikel b")].map((e) => e.textContent)).toEqual(["Radwechsel"]);
  });
});

describe("Artikelstamm", () => {
  it("Reiter Artikel ohne Kundenartikel, Reiter Kundenartikel je Kunde mit Suche und Sprung", () => {
    const zum = vi.fn();
    const leer = async () => {};
    render(<ArticleAdminPanel articles={ART} articlePrices={LISTE} kunden={[H, U, X]} onZumKunden={zum} onAddArticle={leer} onUpdateArticle={leer}
      onUpdateArticleNumber={leer} onAddArticlePrice={leer} onUpdateArticlePrice={async () => null} onDeleteArticlePrice={leer} />);
    expect(screen.getByText(/1 Artikel · 1 aktiv · 4 Kundenartikel/)).toBeTruthy();
    expect(screen.queryByText("Flottencheck")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Kundenartikel/ }));
    expect([...document.querySelectorAll(".ar-kunde-kopf b")].map((e) => e.textContent)).toEqual(["Andere GmbH", "Kunterbunt Holding", "Kunterbunt Nord"]);
    expect(screen.getByText(/Kd.-Nr. 10002 · 2 Artikel/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Artikel suchen"), { target: { value: "nord" } });
    expect([...document.querySelectorAll(".ar-kunde-kopf b")].map((e) => e.textContent)).toEqual(["Kunterbunt Nord"]);
    fireEvent.click(screen.getByRole("button", { name: "Zum Kunden ›" }));
    expect(zum).toHaveBeenCalledWith("u");
  });
});

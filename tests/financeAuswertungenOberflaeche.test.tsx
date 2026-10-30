// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F6 (v152): Summen & Salden → Kontenblatt, BWA, EÜR nur bei EÜR. v158: BWA gegen das Vorjahr.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinEinstellungen: vi.fn(async (): Promise<unknown> => ({ status: "da", einstellungen: null })),
  fetchFinSalden: vi.fn(async (_s: unknown, _jahr?: number): Promise<unknown[]> => [{ konto: 8400, monat: 10, soll: 0, haben: 300 }, { konto: 4210, monat: 10, soll: 100, haben: 0 }, { konto: 1200, monat: 10, soll: 357, haben: 157 }]),
  fetchFinKonten: vi.fn(async () => [konto(1200, "Bank", "geld"), konto(4210, "Miete", "aufwand"), konto(8400, "Erlöse 19 % USt", "erloes"), konto(1776, "Umsatzsteuer 19 %", "steuer")]),
  fetchFinSteuerschluessel: vi.fn(async () => [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "USt 19", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }]),
  fetchFinEuer: vi.fn(async () => ({ eingerichtet: true, unklar: 0, konten: [{ konto: 8400, wirkung: 300 }, { konto: 1776, wirkung: 57 }, { konto: 4210, wirkung: -100 }] })),
  // v186: Plan (Migration 115).
  fetchFinPlan: vi.fn(async (): Promise<unknown[]> => []),
  finPlanSetzen: vi.fn(async () => 12), finPlanAusVorjahr: vi.fn(async () => 3),
  fetchFinKontenblatt: vi.fn(async () => [
    { datum: "2026-10-02", nr: 4, text: "Barverkauf", beleg: null, seite: "H", betrag: 300, steuer: "ust19", storno: false, gegen: "1200" },
  ]),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceAuswertungen } from "@/components/finance/FinanceAuswertungen";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(gewinnermittlung: "euer" | "bilanz" = "euer") {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceAuswertungen supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={{ ...finVorgabe(2026, "2026-10-14"), gewinnermittlung }} onEinstellungen={() => {}}
      rechte={{ rechnungen: false, belege: false, bank: false, steuern: false, planen: false }} />
  </QueryClientProvider>);
  // Seit v186 steht das Cockpit vorn.
  fireEvent.click(screen.getByRole("tab", { name: "Summen & Salden" }));
}

describe("FinanceAuswertungen", () => {
  it("Summen & Salden gruppiert, ein Tipp öffnet das Kontenblatt", async () => {
    zeigen();
    const zeile = (await screen.findByText("Erlöse 19 % USt")).closest("button")!;
    expect(zeile.textContent).toMatch(/300,00\s€ H/);
    expect(screen.getByText(/Summe Soll 457,00\s€ · Summe Haben 457,00\s€ – stimmt überein/)).toBeTruthy();
    fireEvent.click(zeile);
    expect(await screen.findByText("Barverkauf")).toBeTruthy();
    expect(api.fetchFinKontenblatt).toHaveBeenCalledWith(supabase, 2026, 8400);
  });

  it("BWA und EÜR", async () => {
    zeigen();
    await screen.findByText("Erlöse 19 % USt");
    fireEvent.click(screen.getByRole("tab", { name: "BWA" }));
    expect(screen.getByText("Rohertrag").closest("tr")!.textContent).toMatch(/300,00\s€300,00\s€/);
    expect(screen.getByText("Betriebsergebnis").closest("tr")!.textContent).toMatch(/200,00\s€/);
    fireEvent.click(screen.getByRole("tab", { name: "EÜR" }));
    expect((await screen.findByText("Summe Betriebseinnahmen")).closest("tr")!.textContent).toMatch(/357,00\s€/);
    expect(screen.getByText("Gewinn").closest("tr")!.textContent).toMatch(/257,00\s€/);
  });

  it("bei Bilanz keine EÜR", async () => {
    zeigen("bilanz");
    await screen.findByText("Erlöse 19 % USt");
    expect(screen.queryByRole("tab", { name: "EÜR" })).toBeNull();
  });

  it("BWA gegen das Vorjahr: Abweichung in Euro und Prozent; ohne Vorjahr ein Hinweis", async () => {
    zeigen();
    await screen.findByText("Erlöse 19 % USt");
    fireEvent.click(screen.getByRole("tab", { name: "BWA" }));
    fireEvent.click(screen.getByRole("button", { name: "Vorjahr" }));
    expect(await screen.findByText(/Für 2025 ist Finance nicht eingerichtet/)).toBeTruthy();
    expect(screen.getByText("Umsatzerlöse").closest("tr")!.textContent).toMatch(/300,00\s€––/);
  });

  it("mit Vorjahr: Werte und Abweichung", async () => {
    api.fetchFinEinstellungen.mockImplementation(async () => ({ status: "da", einstellungen: finVorgabe(2025, "2025-01-01") }));
    api.fetchFinSalden.mockImplementation(async (_s: unknown, jahr?: number) => jahr === 2025
      ? [{ konto: 8400, monat: 3, soll: 0, haben: 200 }, { konto: 8400, monat: 11, soll: 0, haben: 999 }, { konto: 4210, monat: 10, soll: 125, haben: 0 }]
      : [{ konto: 8400, monat: 10, soll: 0, haben: 300 }, { konto: 4210, monat: 10, soll: 100, haben: 0 }, { konto: 1200, monat: 10, soll: 357, haben: 157 }]);
    zeigen();
    await screen.findByText("Erlöse 19 % USt");
    fireEvent.click(screen.getByRole("tab", { name: "BWA" }));
    fireEvent.click(screen.getByRole("button", { name: "Vorjahr" }));
    // Januar bis Oktober: 300 gegen 200 (der November des Vorjahres zählt nicht mit)
    await vi.waitFor(() => expect(screen.getByText("Umsatzerlöse").closest("tr")!.textContent).toMatch(/300,00\s€200,00\s€100,00\s€\+50 %/));
    expect(screen.getByText("Betriebsergebnis").closest("tr")!.textContent).toMatch(/200,00\s€75,00\s€125,00\s€\+166,7 %/);
    fireEvent.change(screen.getByLabelText("Zeitraum des Vergleichs"), { target: { value: "m" } });
    expect(screen.getByText("Umsatzerlöse").closest("tr")!.textContent).toMatch(/300,00\s€0,00\s€300,00\s€–/);
  });
});

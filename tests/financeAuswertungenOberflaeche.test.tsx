// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F6 (v152): Summen & Salden → Kontenblatt, BWA, EÜR nur bei EÜR.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinSalden: vi.fn(async () => [{ konto: 8400, monat: 10, soll: 0, haben: 300 }, { konto: 4210, monat: 10, soll: 100, haben: 0 }, { konto: 1200, monat: 10, soll: 357, haben: 157 }]),
  fetchFinKonten: vi.fn(async () => [konto(1200, "Bank", "geld"), konto(4210, "Miete", "aufwand"), konto(8400, "Erlöse 19 % USt", "erloes"), konto(1776, "Umsatzsteuer 19 %", "steuer")]),
  fetchFinSteuerschluessel: vi.fn(async () => [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "USt 19", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }]),
  fetchFinEuer: vi.fn(async () => ({ eingerichtet: true, unklar: 0, konten: [{ konto: 8400, wirkung: 300 }, { konto: 1776, wirkung: 57 }, { konto: 4210, wirkung: -100 }] })),
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
    <FinanceAuswertungen supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={{ ...finVorgabe(2026, "2026-10-14"), gewinnermittlung }} onEinstellungen={() => {}} />
  </QueryClientProvider>);
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
});

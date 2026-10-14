// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F3 (v147): Finance › Rechnungen – Reiter, „Rechnung erstellen“, Zahlung, „Jetzt buchen“.
const api = vi.hoisted(() => ({
  fetchFinRechnungenStand: vi.fn(),
  fetchFinMahnungen: vi.fn(async () => []),
  fetchFinSkonti: vi.fn(async () => []),
  finRechnungNachbuchen: vi.fn(async () => undefined),
  finRechnungBezahlt: vi.fn(async () => ({ nr: 9 })),
  finZahlungZuruecknehmen: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceRechnungen } from "@/components/finance/FinanceRechnungen";

const supabase = {} as SupabaseClient;
const zeile = (p: Record<string, unknown>) => ({
  rechnung_id: "r1", nummer_text: "RE1782", datum: "2026-10-01", brutto: 119, order_id: "o1", order_number: 1500, kunde: "Kunde A",
  storniert: false, storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 3, ...p,
});
const STAND = {
  vorgaenge: [
    { order_id: "o2", order_number: 1501, datum: "2026-10-10", zeit: null, status: "erledigt", kunde: "Kunde B", kundennummer: 11, betrag: 140.4 },
    { order_id: "o3", order_number: 1502, datum: "2026-10-20", zeit: "09:00", status: "offen", kunde: "Kunde C", kundennummer: null, betrag: 0 },
  ],
  rechnungen: [zeile({}), zeile({ rechnung_id: "r2", nummer_text: "RE1783", status: "fehler", fehler: "Der 10/2026 ist festgeschrieben – dort wird nicht mehr gebucht." })],
  anderswo: [],
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function zeigen(modus: "rechnungen" | "op" = "rechnungen", oeffnen = vi.fn()) {
  api.fetchFinRechnungenStand.mockResolvedValue(STAND);
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceRechnungen supabase={supabase} jahr={2026} heute="2026-10-13" modus={modus} darfSchreiben onRechnungOeffnen={oeffnen} onEinstellungen={() => {}} />
  </QueryClientProvider>);
  return oeffnen;
}

describe("FinanceRechnungen", () => {
  it("Zu erstellen öffnet das Rechnungsfenster des Auftrags", async () => {
    const oeffnen = zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Rechnung erstellen" }));
    expect(oeffnen).toHaveBeenCalledWith("o2");
    expect(screen.getByRole("tab", { name: /Vorgemerkt1/ })).toBeTruthy();
  });

  it("Ausgestellt: bar bezahlt bucht die Zahlung", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: /Ausgestellt/ }));
    fireEvent.click(screen.getByRole("button", { name: /RE1782/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bar bezahlt" }));
    fireEvent.click(screen.getByRole("button", { name: "Zahlung buchen" }));
    expect(await screen.findByText(/Zahlung erfasst \(Buchung Nr\. 9\)/)).toBeTruthy();
    expect(api.finRechnungBezahlt).toHaveBeenCalledWith(supabase, "r1", "bar", "2026-10-13");
  });

  it("Nicht gebucht: Grund und „Jetzt buchen“", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: /Ausgestellt/ }));
    fireEvent.click(screen.getByRole("button", { name: /RE1783/ }));
    expect(screen.getAllByText(/festgeschrieben/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Jetzt buchen" }));
    expect(await screen.findByText("RE1783 ist gebucht.")).toBeTruthy();
    expect(api.finRechnungNachbuchen).toHaveBeenCalledWith(supabase, "r2");
  });

  it("Offene Posten: Summe und nur Gebuchtes", async () => {
    zeigen("op");
    expect(await screen.findByRole("button", { name: /RE1782/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /RE1783/ })).toBeNull();
    expect(screen.getAllByText(/119,00\s€/).length).toBeGreaterThan(0);
  });
});

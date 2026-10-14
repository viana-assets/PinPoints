// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// v156: Skonto im Fenster der Rechnung – abziehen und zurücknehmen.
const api = vi.hoisted(() => ({
  fetchFinSkonti: vi.fn(async () => [{ ziel_id: "anderer", buchung_id: "x", datum: "2026-09-01", betrag: 1, nr: 3 }]),
  finSkontoBuchen: vi.fn(async () => ({ nr: 6, rest: 0 })),
  finSkontoZuruecknehmen: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/finance", () => api);

import { SkontoAbschnitt } from "@/components/finance/FinanceSkonto";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(onFertig = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient()}>
    <SkontoAbschnitt supabase={supabase} art="rechnung" ziel="r1" brutto={140.42} rest={2.81} datumAb="2026-09-10" heute="2026-09-21" offen darfSchreiben onFertig={onFertig} />
  </QueryClientProvider>);
  return onFertig;
}

describe("SkontoAbschnitt", () => {
  it("Rest als Skonto buchen", async () => {
    const fertig = zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Skonto abziehen …" }));
    expect((screen.getByLabelText("Skontobetrag") as HTMLInputElement).value).toBe("2,81");
    fireEvent.click(screen.getByRole("button", { name: "Skonto buchen" }));
    await vi.waitFor(() => expect(fertig).toHaveBeenCalledWith("Skonto gebucht (Nr. 6) – der Posten ist ausgeglichen."));
    expect(api.finSkontoBuchen).toHaveBeenCalledWith(supabase, "rechnung", "r1", "2026-09-21", 2.81);
  });
  it("über 10 % gesperrt", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Skonto abziehen …" }));
    fireEvent.change(screen.getByLabelText("Skontobetrag"), { target: { value: "20" } });
    expect(screen.getByText(/Höher als der offene Rest/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Skonto buchen" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("vorhandener Skonto: zurücknehmen mit Grund", async () => {
    api.fetchFinSkonti.mockResolvedValueOnce([{ ziel_id: "r1", buchung_id: "b9", datum: "2026-09-21", betrag: 2.81, nr: 6 }]);
    const fertig = zeigen();
    expect(await screen.findByText(/Skonto 2,81\s€ am 21\.09\. \(Buchung Nr\. 6\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurücknehmen …" }));
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "doch nicht" } });
    fireEvent.click(screen.getByRole("button", { name: "Zurücknehmen" }));
    await vi.waitFor(() => expect(fertig).toHaveBeenCalled());
    expect(api.finSkontoZuruecknehmen).toHaveBeenCalledWith(supabase, "b9", "doch nicht");
  });
});

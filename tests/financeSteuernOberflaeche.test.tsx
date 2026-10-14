// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F5 (v150): Voranmeldungen mit Frist und Zustand, Formularansicht, Abgabe festhalten.
const api = vi.hoisted(() => ({
  fetchFinUstStand: vi.fn(async (_s: unknown, jahr: number) => ({
    eingerichtet: true, umsatz_vorjahr: null, sondervorauszahlung: jahr === 2026 ? 1100 : null, umsatz_jahr: 788,
    zeitraeume: Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const bis = new Date(Date.UTC(jahr, i + 1, 0)).toISOString().slice(0, 10);
      return {
        zeitraum: `M${m}`, von: `${jahr}-${m}-01`, bis,
        kennzahlen: m === "08" ? { "81": { b: 150.4, s: 28.58 }, "66": { s: 9.5 } } : {},
        abgaben: m === "07" ? [{ fassung: 1, abgegeben_am: `${jahr}-09-05`, kennzahlen: {}, notiz: null, erstellt_am: "x" }] : [],
      };
    }),
  })),
  finUstAbgegeben: vi.fn(async () => ({ fassung: 1 })),
  finSteuerJahrSpeichern: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceSteuern } from "@/components/finance/FinanceSteuern";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(dauerfrist = true) {
  const e = { ...finVorgabe(2026, "2026-10-14"), besteuerung: "regel" as const, voranmeldung: "monat" as const, dauerfrist, start_datum: "2026-07-01" };
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceSteuern supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={e} darfSchreiben onEinstellungen={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceSteuern", () => {
  it("zeigt die Zeiträume bis heute mit Frist und Zustand", async () => {
    zeigen();
    const aug = (await screen.findByText("August 2026")).closest("button")!;
    expect(aug.textContent).toMatch(/Frist 12\.10\.2026 · überfällig seit 2 Tagen/);
    expect(aug.textContent).toMatch(/19,00\s€/);
    expect(screen.getByText("Juli 2026").closest("button")!.textContent).toMatch(/abgegeben/);
    expect(screen.getByText("Oktober 2026").closest("button")!.textContent).toMatch(/läuft noch/);
    expect(screen.queryByText("November 2026")).toBeNull();
    expect(screen.queryByText("Juni 2026")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alle Zeiträume des Jahres zeigen" }));
    expect(screen.getByText("Juni 2026").closest("button")!.textContent).toMatch(/vor dem Start von Finance/);
    expect(screen.getByLabelText("Festgesetzte Sondervorauszahlung")).toBeTruthy();
  });

  it("Formular und Abgabe festhalten", async () => {
    zeigen();
    fireEvent.click(await screen.findByText("August 2026"));
    const tabelle = screen.getByRole("table");
    expect(within(tabelle).getByText("Steuerpflichtige Umsätze 19 %").closest("tr")!.textContent).toMatch(/150\s€28,50\s€/);
    expect(tabelle.textContent).toMatch(/Verbleibende Vorauszahlung19,00\s€/);
    expect(screen.getByText(/Laut Buchhaltung 19,08\s€/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Als abgegeben festhalten …" }));
    fireEvent.change(screen.getByPlaceholderText("z. B. über Steuerberater"), { target: { value: "ELSTER" } });
    fireEvent.click(screen.getByRole("button", { name: "Abgabe festhalten" }));
    expect(await screen.findByText("Abgabe festgehalten.")).toBeTruthy();
    expect(api.finUstAbgegeben).toHaveBeenCalledWith(supabase, 2026, "M08", "2026-10-14", "ELSTER");
  });

  it("ohne Dauerfrist keine Sondervorauszahlung, Frist am 10.", async () => {
    zeigen(false);
    expect((await screen.findByText("September 2026")).closest("button")!.textContent).toMatch(/Frist 12\.10\.2026/);
    expect(screen.queryByLabelText("Festgesetzte Sondervorauszahlung")).toBeNull();
  });
});

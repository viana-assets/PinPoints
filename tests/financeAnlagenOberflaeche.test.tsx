// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F7 (v153): Verzeichnis mit Buchwert, Abschreibungslauf, Anlage erfassen mit Plan.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinAnlagen: vi.fn(async () => [{
    id: "m", bezeichnung: "Wuchtmaschine", konto: 210, art: "linear", anschaffung: "2026-03-15", ak: 1200, monate: 36, satz: null, afa_konto: 4830,
    beleg_id: null, fahrzeug_id: null, abgang: null, abgang_buchung_id: null, notiz: null, erstellt_am: "x",
  }]),
  fetchFinAfaGebucht: vi.fn(async () => ({ m: 200 })),
  fetchFinKonten: vi.fn(async () => [konto(210, "Maschinen (Montier-, Wuchtmaschine)", "anlage"), konto(350, "Lkw und Transporter", "anlage"), konto(4830, "Abschreibungen auf Sachanlagen", "aufwand")]),
  fetchFinEinstellungen: vi.fn(async () => ({ status: "da", einstellungen: null })),
  fetchFinBelege: vi.fn(async () => []), fetchFinLieferanten: vi.fn(async () => []), fetchFirmenfahrzeugeFuerAnlagen: vi.fn(async () => []),
  finAfaBuchen: vi.fn(async () => ({ nr: 9, anlagen: 1, summe: 66.67 })),
  finAnlageSpeichern: vi.fn(async () => "neu"), finAnlageLoeschen: vi.fn(), finAnlageAbgang: vi.fn(), finAnlageAbgangZuruecknehmen: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceAnlagen } from "@/components/finance/FinanceAnlagen";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
const E = finVorgabe(2026, "2026-01-01");
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen() {
  api.fetchFinEinstellungen.mockResolvedValue({ status: "da", einstellungen: E } as never);
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceAnlagen supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={E} darfSchreiben belegeSehen onEinstellungen={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceAnlagen", () => {
  it("Buchwert und Abschreibungslauf bis Oktober", async () => {
    zeigen();
    const zeile = (await screen.findByText("Wuchtmaschine")).closest("button")!;
    expect(zeile.textContent).toMatch(/Linear · ab 15\.03\.2026 · 1\.200,00\s€ · 3 Jahre · AfA 2026 333,33\s€/);
    expect(zeile.textContent).toMatch(/933,33\s€/);
    fireEvent.click(await screen.findByRole("button", { name: /Abschreibungen buchen \(66,67\s€\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    expect(await screen.findByText(/Abschreibungen bis Oktober gebucht \(Nr\. 9/)).toBeTruthy();
    expect(api.finAfaBuchen).toHaveBeenCalledWith(supabase, 2026, 10);
  });

  it("Anlage erfassen: Nutzungsdauer aus dem Vorschlag, Plan, Speichern", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Anlage erfassen" }));
    fireEvent.change(screen.getByLabelText("Anlagekonto"), { target: { value: "350" } });
    expect((screen.getByLabelText("Nutzungsdauer") as HTMLInputElement).value).toBe("9");
    fireEvent.change(screen.getByLabelText("Anschaffungskosten"), { target: { value: "36.000,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Degressiv" }));
    expect(screen.getByRole("table").textContent).toMatch(/20262\.700,00\s€33\.300,00\s€/);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/Anlage erfasst/)).toBeTruthy();
    expect(api.finAnlageSpeichern).toHaveBeenCalledWith(supabase, null, expect.objectContaining({ konto: 350, art: "degressiv", ak: 36000, monate: 108, bezeichnung: "Lkw und Transporter" }));
  });
});

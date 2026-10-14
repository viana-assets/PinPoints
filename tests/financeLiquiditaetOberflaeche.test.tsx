// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// v158: Liquiditätsvorschau – Bestand, Wochen, Überfälliges, Planposten anlegen und löschen.
const rechnung = (p: Record<string, unknown>) => ({
  rechnung_id: "r1", nummer_text: "RE1", datum: "2026-10-01", brutto: 119, order_id: "o1", order_number: 1, kunde: "Kunde A", storniert: false,
  storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-20", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1, ...p,
});
const api = vi.hoisted(() => ({
  fetchFinSalden: vi.fn(async (): Promise<unknown[]> => [{ konto: 1200, monat: 10, soll: 1000, haben: 0 }]),
  fetchFinKonten: vi.fn(async () => [{ kontenrahmen: "skr03", nummer: 1200, bezeichnung: "Bank", kategorie: "geld", eigen: false, aktiv: true }]),
  fetchFinRechnungenStand: vi.fn(async (_s: unknown, jahr: number): Promise<unknown> => ({ vorgaenge: [], anderswo: [], rechnungen: [] })),
  fetchFinBelege: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinBankkonten: vi.fn(async () => []),
  fetchFinBankimporte: vi.fn(async () => []),
  fetchFinBankumsaetze: vi.fn(async () => [{ id: "u1", status: "offen" }]),
  fetchFinUstStand: vi.fn(async () => ({ eingerichtet: false })),
  fetchFinPlanposten: vi.fn(async (): Promise<unknown[]> => []),
  finPlanpostenSpeichern: vi.fn(async () => "neu"),
  finPlanpostenLoeschen: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceLiquiditaet } from "@/components/finance/FinanceLiquiditaet";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  api.fetchFinRechnungenStand.mockImplementation(async () => ({ vorgaenge: [], anderswo: [], rechnungen: [] }));
  api.fetchFinBelege.mockImplementation(async () => []);
  api.fetchFinPlanposten.mockImplementation(async () => []);
});
function zeigen(darfPlanen = true) {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceLiquiditaet supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={finVorgabe(2026, "2026-09-01")}
      rechnungenSehen belegeSehen bankSehen steuernSehen darfPlanen={darfPlanen} />
  </QueryClientProvider>);
}

describe("FinanceLiquiditaet", () => {
  it("Bestand, überfällige Rechnung auf heute, Beleg und Vorjahresrechnung; Tiefpunkt", async () => {
    api.fetchFinRechnungenStand.mockImplementation(async (_s: unknown, jahr: number) => ({ vorgaenge: [], anderswo: [], rechnungen: jahr === 2026
      ? [rechnung({ faellig_am: "2026-10-05" })]
      : [rechnung({ rechnung_id: "alt", nummer_text: "RE0", datum: "2025-12-20", faellig_am: "2026-01-03", brutto: 50 })] }));
    api.fetchFinBelege.mockImplementation(async () => [{ id: "b1", lieferant_id: null, belegdatum: "2026-10-01", belegnummer: "L-1", text: "Reifen", faellig_am: "2026-10-21",
      posten: [], status: "gebucht", brutto: 2000, bezahlt_am: null, bezahlt_art: null, erstellt_am: "x" }]);
    zeigen();
    const heute = (await screen.findByText("Bestand heute")).closest(".fi-kachel")!;
    await vi.waitFor(() => expect(heute.textContent).toMatch(/1\.000,00\s€/));
    // KW 42: 119 + 50 überfällig ein; KW 43: 2.000 aus → Ende −831
    const kw42 = (await screen.findByText("KW 42 · 14.10.–18.10.")).closest("button")!;
    await vi.waitFor(() => expect(screen.getByText("KW 42 · 14.10.–18.10.").closest("button")!.textContent).toMatch(/Ein 169,00\s€ · Aus 0,00\s€1\.169,00\s€/));
    expect(screen.getByText("Tiefster Stand").closest(".fi-kachel")!.textContent).toMatch(/−831,00\s€|-831,00\s€/);
    fireEvent.click(kw42);
    expect(screen.getAllByText(/war schon fällig/).length).toBe(2);
    expect(screen.getByText(/Bankumsatz ist noch nicht zugeordnet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Überfälliges einrechnen/ }));
    expect(screen.getByText(/Nicht eingerechnet: 169,00\s€ Eingänge, 0,00\s€ Ausgänge/)).toBeTruthy();
  });

  it("Planposten anlegen: Pflichtfelder, dann speichern", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Planposten hinzufügen …" }));
    expect((screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Miete Halle" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "850,00" } });
    fireEvent.change(screen.getByLabelText("Erster Termin"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Planposten gespeichert.")).toBeTruthy();
    expect(api.finPlanpostenSpeichern).toHaveBeenCalledWith(supabase, null, { text: "Miete Halle", art: "aus", betrag: 850, ab: "2026-11-01", rhythmus: "monat", bis: null, notiz: null });
  });

  it("vorhandener Planposten wirkt in der Vorschau und lässt sich löschen; ohne Recht kein Knopf", async () => {
    api.fetchFinPlanposten.mockImplementation(async () => [{ id: "p1", text: "Leasing", art: "aus", betrag: 300, ab: "2026-10-15", rhythmus: "monat", bis: null, notiz: null, erstellt_am: "x", geaendert_am: null }]);
    zeigen();
    await vi.waitFor(() => expect(screen.getByText("KW 42 · 14.10.–18.10.").closest("button")!.textContent).toMatch(/Aus 300,00\s€700,00\s€/));
    const zeile = (await screen.findByText("Leasing")).closest("button")!;
    expect(zeile.textContent).toMatch(/monatlich ab 15\.10\.2026/);
    expect(screen.getByText("KW 42 · 14.10.–18.10.").closest("button")!.textContent).toMatch(/Aus 300,00\s€700,00\s€/);
    fireEvent.click(zeile);
    fireEvent.click(screen.getByRole("button", { name: "Löschen …" }));
    fireEvent.click(screen.getByRole("button", { name: "Wirklich löschen" }));
    expect(await screen.findByText("„Leasing“ gelöscht.")).toBeTruthy();
    expect(api.finPlanpostenLoeschen).toHaveBeenCalledWith(supabase, "p1");
    cleanup();
    zeigen(false);
    await screen.findByText("Leasing");
    expect(screen.queryByRole("button", { name: "Planposten hinzufügen …" })).toBeNull();
    expect(within(document.body).getByText("Leasing").closest("button")!.hasAttribute("disabled")).toBe(true);
  });
});

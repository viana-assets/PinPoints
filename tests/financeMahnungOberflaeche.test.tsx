// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinMahnung } from "@/lib/finance/mahnung";
import type { FinRechnungZeile } from "@/lib/finance/rechnungen";

// v157: Mahnwesen im Fenster der Rechnung – Erinnerung erstellen, Mahnung mit Zinsen, zurückziehen.
const api = vi.hoisted(() => ({
  fetchFinMahnungen: vi.fn(async (): Promise<unknown[]> => []),
  finMahnungErstellen: vi.fn(async () => ({ id: "neu" })),
  finMahnungZurueckziehen: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/finance", () => api);

import { MahnAbschnitt } from "@/components/finance/FinanceMahnung";

const r: FinRechnungZeile = {
  rechnung_id: "r1", nummer_text: "RE-2026-0001", datum: "2026-09-01", brutto: 119, order_id: "o", order_number: 1, kunde: "K", storniert: false,
  storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-09-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1,
};
const mahnung = (p: Partial<FinMahnung>): FinMahnung => ({
  id: "m1", rechnung_id: "r1", stufe: 1, datum: "2026-09-25", frist: "2026-10-05", nummer_text: "RE-2026-0001", rechnung_datum: "2026-09-01",
  faellig_am: "2026-09-15", brutto: 119, bezahlt: 0, offen: 119, gebuehr: 0, zinsen: 0, zinssatz: null, text: "Sehr geehrte Damen und Herren,\n\nBitte zahlen.",
  absender: { firma: "Beispielbetrieb", ort: "Musterstadt" }, empfaenger: { name: "Kunde", email: null }, zurueckgezogen_am: null, zurueck_grund: null, erstellt_am: "x", ...p,
});

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(onFertig = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient()}>
    <MahnAbschnitt supabase={supabase} r={r} heute="2026-10-14" darfSchreiben onFertig={onFertig} />
  </QueryClientProvider>);
  return onFertig;
}

describe("MahnAbschnitt", () => {
  it("Zahlungserinnerung erstellen und gleich ansehen", async () => {
    const fertig = zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Zahlungserinnerung erstellen …" }));
    expect((screen.getByLabelText("Frist") as HTMLInputElement).value).toBe("2026-10-24");
    expect((screen.getByLabelText("Text der Mahnung") as HTMLTextAreaElement).value).toMatch(/RE-2026-0001 vom 01\.09\.2026 ist noch offen/);
    api.fetchFinMahnungen.mockResolvedValue([mahnung({ id: "neu", datum: "2026-10-14", frist: "2026-10-24" })]);
    fireEvent.click(screen.getByRole("button", { name: "Zahlungserinnerung erstellen" }));
    expect(await screen.findByText("Zahlungserinnerung erstellt – jetzt drucken oder als PDF speichern.")).toBeTruthy();
    expect(fertig).not.toHaveBeenCalled(); // das Rechnungsfenster bleibt offen
    expect(api.finMahnungErstellen).toHaveBeenCalledWith(supabase, "r1", expect.objectContaining({ stufe: 1, datum: "2026-10-14", frist: "2026-10-24", gebuehr: 0, zinsen: 0, zinssatz: null }));
    expect(await screen.findByRole("button", { name: "Drucken / als PDF speichern" })).toBeTruthy();
    expect(screen.getByText(/Für eine E-Mail fehlt die Adresse/)).toBeTruthy();
  });

  it("Mahnung mit Verzugszinsen ab dem Tag nach der Frist; Gebühr über 100 € gesperrt", async () => {
    api.fetchFinMahnungen.mockResolvedValue([mahnung({})]);
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Mahnung erstellen …" }));
    fireEvent.click(screen.getByRole("button", { name: /Verzugszinsen ausweisen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unternehmen (+9 Punkte)" }));
    // 06.10.–14.10.2026 = 9 Tage zu 10,52 % auf 119 €
    expect(screen.getByText(/ab 06\.10\.2026 .* 10,52 % · 9 Tage · 0,31\s€/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mahngebühr"), { target: { value: "120" } });
    expect((screen.getByRole("button", { name: "Mahnung erstellen" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Mahngebühr"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Mahnung erstellen" }));
    await vi.waitFor(() => expect(api.finMahnungErstellen).toHaveBeenCalledWith(supabase, "r1", expect.objectContaining({ stufe: 2, gebuehr: 40, zinsen: 0.31, zinssatz: 10.52 })));
  });

  it("die letzte zurückziehen, mit Grund", async () => {
    api.fetchFinMahnungen.mockResolvedValue([mahnung({})]);
    const fertig = zeigen();
    expect(await screen.findByText(/vom 25\.09\.2026 · Frist 05\.10\.2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurückziehen …" }));
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "Kunde hat bezahlt" } });
    fireEvent.click(screen.getByRole("button", { name: "Zurückziehen" }));
    await vi.waitFor(() => expect(fertig).toHaveBeenCalledWith("Zahlungserinnerung zurückgezogen."));
    expect(api.finMahnungZurueckziehen).toHaveBeenCalledWith(supabase, "m1", "Kunde hat bezahlt");
  });
});

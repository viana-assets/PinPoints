// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F1 (v146): das Buchungsfenster – Vorschau wie die Datenbank, Buchen über fin_buchen().
const api = vi.hoisted(() => ({
  finBuchen: vi.fn(async () => ({ id: "b1", jahr: 2026, nr: 7 })),
  finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);

import { BuchungNeu } from "@/components/finance/FinanceBuchungen";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";

const supabase = {} as SupabaseClient;
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1400, "Forderungen", "forderung"), k(1776, "Umsatzsteuer 19 %", "steuer"), k(8400, "Erlöse 19 %", "erloes"), k(1200, "Bank", "geld")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "Umsatzsteuer 19 %", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }];
const e = finVorgabe(2026, "2026-10-13");
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function oeffnen(onGebucht = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient()}>
    <BuchungNeu supabase={supabase} heute="2026-10-13" jahr={2026} einstellungen={e} konten={KONTEN} schluessel={SCHL} onGebucht={onGebucht} onClose={() => {}} />
  </QueryClientProvider>);
  return onGebucht;
}
const eingeben = () => {
  fireEvent.change(screen.getByPlaceholderText("Was ist passiert?"), { target: { value: "Rechnung RE-1" } });
  fireEvent.change(screen.getByLabelText("Soll-Konto Posten 1"), { target: { value: "1400" } });
  fireEvent.change(screen.getByLabelText("Haben-Konto Posten 1"), { target: { value: "8400" } });
  fireEvent.change(screen.getByLabelText("Betrag Posten 1"), { target: { value: "119,00" } });
  fireEvent.change(screen.getByLabelText("Steuer Posten 1"), { target: { value: "ust19" } });
};

describe("BuchungNeu", () => {
  it("zeigt die Zeilen mit herausgerechneter Steuer und bucht", async () => {
    const gebucht = oeffnen();
    expect((screen.getByRole("button", { name: "Buchen" }) as HTMLButtonElement).disabled).toBe(true);
    eingeben();
    const tabelle = screen.getByRole("table").textContent ?? "";
    expect(tabelle).toMatch(/1400 Forderungen119,00\s€/);
    expect(tabelle).toMatch(/8400 Erlöse 19\s%100,00\s€/);
    expect(tabelle).toMatch(/1776 Umsatzsteuer 19\s%19,00\s€/);
    expect(screen.getByText(/Betrag brutto/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    await vi.waitFor(() => expect(gebucht).toHaveBeenCalledWith(7));
    expect(api.finBuchen).toHaveBeenCalledWith(supabase, {
      datum: "2026-10-13", text: "Rechnung RE-1", beleg: "", posten: [{ soll: 1400, haben: 8400, betrag: 119, steuer: "ust19" }],
    });
  });

  it("Steuerschlüssel auf Bank/Forderung: Hinweis, kein Buchen", () => {
    oeffnen();
    eingeben();
    fireEvent.change(screen.getByLabelText("Haben-Konto Posten 1"), { target: { value: "1200" } });
    expect(screen.getByRole("alert").textContent).toMatch(/genau ein Erlös-, Aufwands- oder Anlagekonto/);
    expect((screen.getByRole("button", { name: "Buchen" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Ablehnung der Datenbank steht im Fenster", async () => {
    api.finBuchen.mockRejectedValueOnce(new Error("Nicht gebucht: Der 09/2026 ist festgeschrieben – dort wird nicht mehr gebucht."));
    oeffnen();
    eingeben();
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/festgeschrieben/);
  });

  it("zweiter Posten übernimmt den Steuerschlüssel", () => {
    oeffnen();
    eingeben();
    fireEvent.click(screen.getByRole("button", { name: "+ Weiterer Posten" }));
    expect((screen.getByLabelText("Steuer Posten 2") as HTMLSelectElement).value).toBe("ust19");
  });
});

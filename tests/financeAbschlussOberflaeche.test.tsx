// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F8 (v154): Jahresabschluss des Vorjahres – Schritte, Abschlussbuchung, Saldenvortrag, Bilanz.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinEinstellungen: vi.fn(),
  fetchFinSalden: vi.fn(async () => [
    { konto: 1200, monat: 1, soll: 5000, haben: 0 }, { konto: 9000, monat: 1, soll: 5000, haben: 5000 }, { konto: 880, monat: 1, soll: 0, haben: 5000 },
    { konto: 1200, monat: 3, soll: 1190, haben: 0 }, { konto: 8400, monat: 3, soll: 0, haben: 1000 }, { konto: 1776, monat: 3, soll: 0, haben: 190 },
  ]),
  fetchFinKonten: vi.fn(async () => [
    konto(880, "Kapital (Einzelunternehmen)", "kapital"), konto(1200, "Bank", "geld"), konto(1776, "Umsatzsteuer 19 %", "steuer"),
    konto(8400, "Erlöse 19 % USt", "erloes"), konto(4950, "Rechts- und Beratungskosten", "aufwand"), konto(9000, "Saldenvorträge (Anfangsbestände)", "vortrag"),
    konto(970, "Sonstige Rückstellungen", "verbindlichkeit"), konto(1790, "Umsatzsteuer Vorjahr", "steuer"),
  ]),
  fetchFinFestschreibungen: vi.fn(async () => []),
  fetchFinAnlagen: vi.fn(async () => []),
  fetchFinAfaGebucht: vi.fn(async () => ({})),
  fetchFinAbschlussposten: vi.fn(async () => []),
  fetchFinVortrag: vi.fn(async () => ({
    eingerichtet: true, folgejahr: true, folgejahrRahmen: "skr03", vonHand: 0, gebucht: null,
    zeilen: [{ konto: 1200, betrag: 6190 }, { konto: 1790, betrag: -190 }, { konto: 880, betrag: -6000 }],
  })),
  finAbschlusspostenBuchen: vi.fn(async () => ({ nr: 12 })), finAbschlusspostenAufloesen: vi.fn(), finAbschlusspostenZuruecknehmen: vi.fn(),
  finVortragBuchen: vi.fn(async () => ({ nr: 1, konten: 3 })), finVortragZuruecknehmen: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceAbschluss } from "@/components/finance/FinanceAbschluss";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(heute = "2026-02-10") {
  api.fetchFinEinstellungen.mockImplementation(async (_s: unknown, jahr: number) => ({ status: "da", einstellungen: { ...finVorgabe(jahr, `${jahr}-01-01`), gewinnermittlung: "bilanz" } }));
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceAbschluss supabase={supabase} jahr={2026} heute={heute} darfSchreiben onSeite={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceAbschluss", () => {
  it("im Februar das Vorjahr: Schritte, Vortrag buchen", async () => {
    zeigen();
    expect((await screen.findByRole("button", { name: "2025" })).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("Saldenvortrag nach 2026")).toBeTruthy();
    expect(screen.getByText("Kapital (Einzelunternehmen)").closest(".es-zeile")!.textContent).toMatch(/6\.000,00\s€ H/);
    fireEvent.click(screen.getByRole("button", { name: "Saldenvortrag buchen" }));
    expect(await screen.findByText(/Saldenvortrag gebucht \(Nr\. 1 in 2026, 3 Konten\)/)).toBeTruthy();
    expect(api.finVortragBuchen).toHaveBeenCalledWith(supabase, 2025, null);
  });

  it("Rückstellung buchen", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Abschlussbuchung …" }));
    const blatt = screen.getByRole("dialog");
    fireEvent.change(within(blatt).getByLabelText("Aufwandskonto"), { target: { value: "4950" } });
    fireEvent.change(within(blatt).getByLabelText("Betrag"), { target: { value: "500,00" } });
    fireEvent.change(within(blatt).getByLabelText("Text"), { target: { value: "Abschlusskosten" } });
    fireEvent.click(within(blatt).getByRole("button", { name: "Buchen" }));
    expect(await screen.findByText(/Rückstellung gebucht \(Nr\. 12\)/)).toBeTruthy();
    expect(api.finAbschlusspostenBuchen).toHaveBeenCalledWith(supabase, 2025, "rueckstellung", 4950, 500, "Abschlusskosten");
  });

  it("Bilanz: Aktiva gleich Passiva", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: "Bilanz" }));
    const tabellen = await screen.findAllByRole("table");
    expect(tabellen[0].textContent).toMatch(/Summe Aktiva6\.190,00\s€/);
    expect(tabellen[1].textContent).toMatch(/Gewinn1\.000,00\s€/);
    expect(tabellen[1].textContent).toMatch(/Summe Passiva6\.190,00\s€/);
  });

  it("im laufenden Jahr: noch kein Vortrag, Abschlussbuchung erst ab Dezember", async () => {
    zeigen("2026-10-14");
    expect((await screen.findByRole("button", { name: "2026" })).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText(/Vorgetragen wird, wenn das Jahr vorbei ist – ab dem 01\.01\.2027/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Abschlussbuchung …" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

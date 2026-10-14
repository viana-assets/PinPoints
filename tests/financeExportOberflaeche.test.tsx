// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F9 (v155): Zeitraum wählen, DATEV-Datei mit Protokoll, GoBD-ZIP, „seitdem geändert“.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinEinstellungen: vi.fn(),
  fetchFinKonten: vi.fn(async () => [konto(1400, "Forderungen", "forderung"), konto(8400, "Erlöse 19 % USt", "erloes"), konto(1776, "Umsatzsteuer 19 %", "steuer")]),
  fetchFinSteuerschluessel: vi.fn(async () => [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "USt 19", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }]),
  fetchFinFestschreibungen: vi.fn(async () => [{ jahr: 2026, monat: 9, am: "x" }]),
  fetchFinExportProtokolle: vi.fn(async () => [{ id: "p1", art: "datev", von: "2026-08-01", bis: "2026-08-31", buchungen: 2, summe: 100, letzte_nr: 2, erstellt_am: "2026-09-05T10:00:00Z", jetzt: { buchungen: 3, summe: 150, letzte_nr: 7 } }]),
  fetchFinExportJournal: vi.fn(async () => [{
    id: "b1", jahr: 2026, nr: 1, datum: "2026-09-01", text: "Rechnung", beleg: "RE-1", quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x",
    fin_buchungszeilen: [
      { id: 1, posten: 1, seite: "S", konto: 1400, betrag: 119, steuerschluessel: "ust19", ist_steuer: false },
      { id: 2, posten: 1, seite: "H", konto: 8400, betrag: 100, steuerschluessel: "ust19", ist_steuer: false },
      { id: 3, posten: 1, seite: "H", konto: 1776, betrag: 19, steuerschluessel: "ust19", ist_steuer: true },
    ],
  }]),
  fetchFinExportBelege: vi.fn(async () => []),
  finExportProtokollieren: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/finance", () => api);
const betrieb = vi.hoisted(() => ({ fetchBetrieb: vi.fn() }));
vi.mock("@/lib/api/betrieb", () => betrieb);
const download = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/download", () => download);

import { FinanceExport } from "@/components/finance/FinanceExport";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen(berater: number | null = 1234567) {
  api.fetchFinEinstellungen.mockImplementation(async (_s: unknown, jahr: number) => ({ status: "da", einstellungen: jahr === 2026 ? finVorgabe(2026, "2026-01-01") : null }));
  betrieb.fetchBetrieb.mockResolvedValue({ firma: "Beispielbetrieb", ort: "Musterstadt", datev_berater: berater, datev_mandant: 10001, datev_sachkontenlaenge: 4, datev_skr: "03" });
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceExport supabase={supabase} jahr={2026} heute="2026-10-14" onSeite={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceExport", () => {
  it("September vorgewählt: DATEV-Datei mit einem Satz, Protokoll", async () => {
    zeigen();
    expect(((await screen.findByLabelText("Zeitraum")) as HTMLSelectElement).value).toBe("m9");
    const knopf = await screen.findByRole("button", { name: "DATEV-Datei (1 Satz)" });
    fireEvent.click(knopf);
    expect(await screen.findByText(/EXTF_Finance_2026-09-01_2026-09-30\.csv gespeichert – 1 Satz aus 1 Buchung/)).toBeTruthy();
    expect(download.dateiHerunterladen).toHaveBeenCalledWith("EXTF_Finance_2026-09-01_2026-09-30.csv", expect.anything(), "text/csv;charset=windows-1252");
    expect(api.finExportProtokollieren).toHaveBeenCalledWith(supabase, "datev", "2026-09-01", "2026-09-30");
    expect(screen.getByText(/seitdem geändert \(jetzt 3\)/)).toBeTruthy();
  });

  it("ohne Beraternummer gesperrt; GoBD-ZIP geht trotzdem", async () => {
    zeigen(null);
    expect(await screen.findByText(/Die Beraternummer fehlt/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^DATEV-Datei/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ZIP herunterladen" }));
    expect(await screen.findByText(/GoBD_Finance_2026-09-01_2026-09-30\.zip gespeichert – 1 Buchungen, 0 Belege/)).toBeTruthy();
    expect(api.finExportProtokollieren).toHaveBeenCalledWith(supabase, "gobd", "2026-09-01", "2026-09-30");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stufe E Teil 2 (v186): Zahlungsvorschlag → SEPA-Datei; die Abbuchung aus der Datei ordnet sich mit Skonto zu. Daten erfunden.
const AUFTRAG = {
  id: "a1", bankkonto_id: "k1", ausfuehrung: "2026-10-09", msg_id: "MR2026100912000000012345678", anzahl: 1, summe: 116.62, status: "erstellt",
  verworfen_grund: null, erstellt_am: "2026-10-08T10:00:00Z",
  fin_zahlauftrag_posten: [{ id: "p1", auftrag_id: "a1", beleg_id: "b1", lieferant_id: "l1", name: "Reifen Nord GmbH", iban: "DE02120300000000202051", bic: null,
    betrag: 116.62, skonto: 2.38, zweck: "Rechnung LR-1 abzgl. Skonto 2,38", e2e: "Bb1" }],
};
const api = vi.hoisted(() => ({
  fetchFinBankkonten: vi.fn(async () => [{ id: "k1", name: "Geschäftskonto", iban: "DE89370400440532013000", konto: 1200, aktiv: true }]),
  fetchFinBankumsaetze: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinBankimporte: vi.fn(async () => []),
  fetchFinKonten: vi.fn(async () => [
    { kontenrahmen: "skr03", nummer: 1200, bezeichnung: "Bank", kategorie: "geld", eigen: false, aktiv: true },
    { kontenrahmen: "skr03", nummer: 1600, bezeichnung: "Verbindlichkeiten", kategorie: "verbindlichkeit", eigen: false, aktiv: true },
  ]),
  fetchFinSteuerschluessel: vi.fn(async () => []),
  fetchFinBuchungen: vi.fn(async () => []),
  fetchFinRechnungenStand: vi.fn(async () => ({ vorgaenge: [], anderswo: [], rechnungen: [] })),
  fetchFinBelege: vi.fn(async () => [{
    id: "b1", lieferant_id: "l1", belegdatum: "2026-10-05", belegnummer: "LR-1", text: null, faellig_am: null, posten: [], datei_pfad: null, datei_typ: null,
    datei_name: null, status: "gebucht", brutto: 119, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-05T00:00:00Z", teilbezahlt: 0,
  }]),
  fetchFinLieferanten: vi.fn(async () => [{ id: "l1", name: "Reifen Nord GmbH", ust_id: null, konto: null, steuer: null, aktiv: true,
    iban: "DE02120300000000202051", bic: null, zahlungsziel_tage: 30, skonto_prozent: 2, skonto_tage: 10 }]),
  fetchFinKassenstuerze: vi.fn(async () => []),
  fetchFinKostenstellen: vi.fn(async () => []),
  fetchFinBankregeln: vi.fn(async () => []),
  fetchFinZahlauftraege: vi.fn(async (): Promise<unknown[]> => []),
  finZahlauftragAnlegen: vi.fn(async () => ({ id: "a1", msg_id: "MR1", anzahl: 1, summe: 116.62 })),
  finZahlauftragVerwerfen: vi.fn(async () => undefined),
  finBankSammeln: vi.fn(async () => ({ posten: 1, rest: 0, von: 21 })),
  finBankEinlesen: vi.fn(), finBankZuRechnung: vi.fn(), finBankZuKonto: vi.fn(), finBankZuBeleg: vi.fn(), finBankIgnorieren: vi.fn(), finBankAufheben: vi.fn(),
  finBankImportZuruecknehmen: vi.fn(), finBankkontoAnlegen: vi.fn(), finBankkontoAendern: vi.fn(), finBuchen: vi.fn(), finKassensturz: vi.fn(),
  finBankregelSpeichern: vi.fn(), finBankregelLoeschen: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
vi.mock("@/lib/api/betrieb", () => ({ fetchBetrieb: vi.fn(async () => ({ firma: "Testbetrieb", inhaber: "", iban: "", bic: "" })) }));

import { FinanceBank } from "@/components/finance/FinanceBank";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); api.fetchFinZahlauftraege.mockResolvedValue([]); });
function zeigen(darfZahlen = true) {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceBank supabase={supabase} jahr={2026} heute="2026-10-09" einstellungen={finVorgabe(2026, "2026-10-09")} darfSchreiben darfLoeschen
      rechnungenSehen belegeSehen buchungenSehen darfBuchen zahlungenSehen darfZahlen={darfZahlen} onEinstellungen={() => {}} />
  </QueryClientProvider>);
}

describe("Zahlungen", () => {
  it("Vorschlag mit Skonto → SEPA-Datei", async () => {
    const url = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() });
    api.fetchFinZahlauftraege.mockResolvedValueOnce([]).mockResolvedValue([AUFTRAG]);
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: "Zahlungen" }));
    expect(await screen.findByText(/Skonto 2,38\s€ bis 15\.10\.2026/)).toBeTruthy();
    const knopf = await screen.findByRole("button", { name: /SEPA-Datei erstellen \(1 · 116,62\s€\)/ });
    fireEvent.click(knopf);
    expect(await screen.findByText(/SEPA-Datei mit 1 Überweisung über 116,62\s€ erstellt/)).toBeTruthy();
    expect(api.finZahlauftragAnlegen).toHaveBeenCalledWith(supabase, "k1", "2026-10-09", [{ beleg: "b1", betrag: 116.62, skonto: 2.38 }]);
    await waitFor(() => expect(url).toHaveBeenCalled());
    expect(await screen.findByText(/09\.10\.2026 · 1 Überweisung/)).toBeTruthy();
  });

  it("ohne Recht kein Reiter, ohne Schreibrecht kein Knopf", async () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <FinanceBank supabase={supabase} jahr={2026} heute="2026-10-09" einstellungen={finVorgabe(2026, "2026-10-09")} darfSchreiben darfLoeschen
        rechnungenSehen belegeSehen buchungenSehen darfBuchen onEinstellungen={() => {}} />
    </QueryClientProvider>);
    await screen.findByRole("tab", { name: /^Offen/ });
    expect(screen.queryByRole("tab", { name: "Zahlungen" })).toBeNull();
    cleanup();
    zeigen(false);
    fireEvent.click(await screen.findByRole("tab", { name: "Zahlungen" }));
    await screen.findByText(/Skonto 2,38/);
    expect(screen.queryByRole("button", { name: /SEPA-Datei erstellen/ })).toBeNull();
  });

  it("Zahlauftrag verwerfen braucht einen Grund", async () => {
    api.fetchFinZahlauftraege.mockResolvedValue([AUFTRAG]);
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: "Zahlungen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Verwerfen …" }));
    const knopf = screen.getByRole("button", { name: "Verwerfen" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("z. B. nicht hochgeladen"), { target: { value: "Bank lehnt ab" } });
    fireEvent.click(knopf);
    await waitFor(() => expect(api.finZahlauftragVerwerfen).toHaveBeenCalledWith(supabase, "a1", "Bank lehnt ab"));
    api.fetchFinZahlauftraege.mockResolvedValue([]);
  });

  it("die Abbuchung aus der Datei ordnet sich wie im Zahlauftrag zu – mit Skonto", async () => {
    api.fetchFinZahlauftraege.mockResolvedValue([AUFTRAG]);
    api.fetchFinBankumsaetze.mockResolvedValueOnce([{ id: "u1", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-10", valuta: null, betrag: -116.62,
      zweck: "Rechnung LR-1 abzgl. Skonto 2,38", name: "Reifen Nord GmbH", iban: null, referenz: null, status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null }]);
    zeigen();
    fireEvent.click(await screen.findByText("Reifen Nord GmbH"));
    expect(await screen.findByText(/Aus der SEPA-Datei vom 09\.10\.2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "So zuordnen" }));
    expect(await screen.findByText(/Wie im Zahlauftrag zugeordnet: 1 Beleg bezahlt \(ab Nr\. 21\)/)).toBeTruthy();
    expect(api.finBankSammeln).toHaveBeenCalledWith(supabase, "u1", [{ art: "beleg", id: "b1", betrag: 116.62, skonto: 2.38 }], null);
    api.fetchFinZahlauftraege.mockResolvedValue([]);
  });
});

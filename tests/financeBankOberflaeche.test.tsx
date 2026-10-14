// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F4 (v149): Kontoauszug einlesen, Umsatz einer Rechnung zuordnen, auf ein Konto buchen. Daten erfunden.
const IBAN = "DE89370400440532013000";
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinBankkonten: vi.fn(async () => [{ id: "k1", name: "Geschäftskonto", iban: "DE89370400440532013000", konto: 1200, aktiv: true }]),
  fetchFinBankumsaetze: vi.fn(async () => [
    { id: "u1", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-05", valuta: null, betrag: 119, zweck: "RE-2026-0042", name: "Muster GmbH",
      iban: null, referenz: null, status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null },
    { id: "u2", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-06", valuta: null, betrag: -12.5, zweck: "Kontoführung", name: "Bank",
      iban: null, referenz: null, status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null },
    { id: "u0", bankkonto_id: "k1", import_id: "i0", datum: "2026-09-06", valuta: null, betrag: -12.5, zweck: "Kontoführung", name: "Bank",
      iban: null, referenz: null, status: "zugeordnet", zuordnung: "konto", zuordnung_id: null, buchung_id: "B0", notiz: null },
  ]),
  fetchFinBankimporte: vi.fn(async () => []),
  fetchFinKonten: vi.fn(async () => [
    konto(1000, "Kasse", "geld"), konto(1200, "Bank", "geld"), konto(1400, "Forderungen", "forderung"), konto(4970, "Nebenkosten des Geldverkehrs", "aufwand"),
  ]),
  fetchFinSteuerschluessel: vi.fn(async () => []),
  fetchFinBuchungen: vi.fn(async () => [{
    id: "B0", jahr: 2026, nr: 4, datum: "2026-09-06", text: "Bank", beleg: null, quelle: "bank", quelle_id: "u0", storno_von: null, storniert_durch: null,
    grund: null, erstellt_am: "2026-09-06T00:00:00Z",
    fin_buchungszeilen: [{ id: 1, posten: 1, seite: "S", konto: 4970, betrag: 12.5, steuerschluessel: null, ist_steuer: false },
      { id: 2, posten: 1, seite: "H", konto: 1200, betrag: 12.5, steuerschluessel: null, ist_steuer: false }],
  }]),
  fetchFinRechnungenStand: vi.fn(async () => ({ vorgaenge: [], anderswo: [], rechnungen: [{
    rechnung_id: "r1", nummer_text: "RE-2026-0042", datum: "2026-10-01", brutto: 119, order_id: "o1", order_number: 42, kunde: "Muster GmbH",
    storniert: false, storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 3,
  }] })),
  fetchFinBelege: vi.fn(async () => []),
  fetchFinLieferanten: vi.fn(async () => []),
  finBankEinlesen: vi.fn(async () => ({ import_id: "i2", anzahl: 2, neu: 1, doppelt: 1 })),
  finBankZuRechnung: vi.fn(async () => ({ nr: 9 })),
  finBankZuKonto: vi.fn(async () => ({ nr: 10 })),
  finBankZuBeleg: vi.fn(), finBankIgnorieren: vi.fn(), finBankAufheben: vi.fn(), finBankImportZuruecknehmen: vi.fn(),
  finBankkontoAnlegen: vi.fn(), finBankkontoAendern: vi.fn(), finBuchen: vi.fn(),
  fetchFinKassenstuerze: vi.fn(async () => []),
  finKassensturz: vi.fn(async () => ({ buchbestand: 0, differenz: -2, nr: 11 })),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceBank } from "@/components/finance/FinanceBank";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen() {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceBank supabase={supabase} jahr={2026} heute="2026-10-13" einstellungen={finVorgabe(2026, "2026-10-13")} darfSchreiben darfLoeschen
      rechnungenSehen belegeSehen buchungenSehen darfBuchen onEinstellungen={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceBank", () => {
  it("liest eine CSV, erkennt das Konto an der IBAN und liest ein", async () => {
    zeigen();
    const csv = `Konto;${IBAN}\nBuchungstag;Betrag;Verwendungszweck;Name\n05.10.2026;119,00;RE-2026-0042;Muster GmbH\n06.10.2026;-12,50;Kontoführung;Bank\n`;
    const datei = new File([csv], "umsaetze.csv", { type: "text/csv" });
    await screen.findByText("Muster GmbH");
    fireEvent.change(screen.getByLabelText("Kontoauszug-Datei"), { target: { files: [datei] } });
    expect(await screen.findByText(/2 Umsätze vom 05\.10\.2026 bis 06\.10\.2026/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Bankkonto für den Import") as HTMLSelectElement).value).toBe("k1"));
    fireEvent.click(screen.getByRole("button", { name: "Einlesen" }));
    expect(await screen.findByText("1 Umsatz eingelesen, 1 waren schon da.")).toBeTruthy();
    expect(api.finBankEinlesen).toHaveBeenCalledWith(supabase, "k1", "umsaetze.csv", expect.objectContaining({ format: "csv", iban: IBAN }));
  });

  it("ordnet einen Eingang der passenden Rechnung zu", async () => {
    zeigen();
    fireEvent.click(await screen.findByText("Muster GmbH"));
    expect(await screen.findByText(/RE-2026-0042 · Muster GmbH/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zuordnen" }));
    expect(await screen.findByText(/Zugeordnet und gebucht \(Nr\. 9\)/)).toBeTruthy();
    expect(api.finBankZuRechnung).toHaveBeenCalledWith(supabase, "u1", "r1");
  });

  it("bucht wie beim letzten Mal auf dasselbe Konto", async () => {
    zeigen();
    await screen.findByText("Muster GmbH");
    await waitFor(() => expect(api.fetchFinBuchungen).toHaveBeenCalled());
    fireEvent.click(screen.getAllByText("Bank").find((el) => el.tagName === "B")!);
    expect(await screen.findByText(/Wie beim letzten Umsatz von Bank/)).toBeTruthy();
    expect((screen.getByLabelText("Gegenkonto") as HTMLSelectElement).value).toBe("4970");
    expect(screen.getByRole("table").textContent).toMatch(/4970 Nebenkosten des Geldverkehrs12,50/);
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    expect(await screen.findByText("Gebucht (Nr. 10).")).toBeTruthy();
    expect(api.finBankZuKonto).toHaveBeenCalledWith(supabase, "u2", 4970, null, "Bank: Kontoführung");
  });

  it("kleiner Eingang wird Teilzahlung", async () => {
    api.finBankZuRechnung.mockResolvedValueOnce({ nr: 12, rest: 69 } as never);
    api.fetchFinBankumsaetze.mockResolvedValueOnce([
      { id: "u9", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-05", valuta: null, betrag: 50, zweck: "Anzahlung", name: "Muster GmbH",
        iban: null, referenz: null, status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null },
    ] as never);
    zeigen();
    fireEvent.click(await screen.findByText("Muster GmbH"));
    expect(await screen.findByText(/als Teilzahlung/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Teilzahlung" }));
    expect(await screen.findByText(/Teilzahlung gebucht \(Nr\. 12\) – offen bleiben 69,00\s€/)).toBeTruthy();
    expect(api.finBankZuRechnung).toHaveBeenCalledWith(supabase, "u9", "r1");
  });

  it("Kassensturz mit Differenz", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: "Kasse" }));
    fireEvent.click(await screen.findByRole("button", { name: "Kassensturz" }));
    fireEvent.change(screen.getByLabelText("Gezählter Bestand"), { target: { value: "-1" } });
    expect((screen.getByRole("button", { name: "Festhalten" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Gezählter Bestand"), { target: { value: "45,00" } });
    expect(screen.getByText("Differenz ausbuchen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Festhalten" }));
    expect(await screen.findByText(/Differenz -2,00\s€ ausgebucht \(Nr\. 11\)/)).toBeTruthy();
    expect(api.finKassensturz).toHaveBeenCalledWith(supabase, "2026-10-13", 45, "", true);
  });
});

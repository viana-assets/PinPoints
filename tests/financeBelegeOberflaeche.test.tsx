// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F2 (v148): Beleg erfassen – Lieferant mit Kontovorschlag, Vorschau, Buchen; E-Rechnung füllt aus.
const api = vi.hoisted(() => ({
  fetchFinBelege: vi.fn(async () => []),
  fetchFinLieferanten: vi.fn(async () => [{ id: "l1", name: "Tankstelle Muster", ust_id: null, konto: 4530, steuer: "vst19", aktiv: true }]),
  fetchFinKonten: vi.fn(async () => [
    { kontenrahmen: "skr03", nummer: 4530, bezeichnung: "Laufende Kfz-Kosten", kategorie: "aufwand", eigen: false, aktiv: true },
    { kontenrahmen: "skr03", nummer: 3400, bezeichnung: "Wareneingang 19 %", kategorie: "aufwand", eigen: false, aktiv: true },
    { kontenrahmen: "skr03", nummer: 1576, bezeichnung: "Vorsteuer 19 %", kategorie: "steuer", eigen: false, aktiv: true },
    { kontenrahmen: "skr03", nummer: 1600, bezeichnung: "Verbindlichkeiten", kategorie: "verbindlichkeit", eigen: false, aktiv: true },
  ]),
  fetchFinSteuerschluessel: vi.fn(async () => [{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }]),
  finBelegSpeichern: vi.fn(async () => "neu1"),
  finBelegBuchen: vi.fn(async () => ({ nr: 12, brutto: 59.5 })),
  finBelegDateiHochladen: vi.fn(async () => "neu1/x.xml"),
  finLieferantAnlegen: vi.fn(async (_s: unknown, l: { name: string }) => ({ id: "l2", name: l.name, ust_id: null, konto: null, steuer: null, aktiv: true })),
  finBelegBezahlt: vi.fn(), finBelegDateiLink: vi.fn(), finBelegStornieren: vi.fn(), finBelegVerwerfen: vi.fn(),
  finBelegZahlungZuruecknehmen: vi.fn(), finLieferantAendern: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);

import { FinanceBelege } from "@/components/finance/FinanceBelege";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function zeigen() {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceBelege supabase={supabase} jahr={2026} heute="2026-10-13" einstellungen={finVorgabe(2026, "2026-10-13")} darfSchreiben darfLoeschen onEinstellungen={() => {}} />
  </QueryClientProvider>);
}

describe("FinanceBelege", () => {
  it("Lieferant bringt Konto und Steuer mit, gebucht wird mit Bar-Zahlung", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Beleg erfassen" }));
    await waitFor(() => expect(screen.getAllByRole("option", { name: "Tankstelle Muster" }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText("Lieferant"), { target: { value: "l1" } });
    expect((screen.getByLabelText("Konto Posten 1") as HTMLSelectElement).value).toBe("4530");
    expect((screen.getByLabelText("Steuer Posten 1") as HTMLSelectElement).value).toBe("vst19");
    fireEvent.change(screen.getByLabelText("Betrag Posten 1"), { target: { value: "59,50" } });
    expect(screen.getByRole("table").textContent).toMatch(/1576 Vorsteuer 19 %9,50/);
    fireEvent.click(screen.getByRole("button", { name: "bar bezahlt" }));
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    expect(await screen.findByText(/Beleg gebucht \(Nr\. 12/)).toBeTruthy();
    expect(api.finBelegSpeichern).toHaveBeenCalledWith(supabase, null, expect.objectContaining({ lieferant_id: "l1", posten: [{ konto: 4530, betrag: 59.5, steuer: "vst19" }] }));
    expect(api.finBelegBuchen).toHaveBeenCalledWith(supabase, "neu1", "bar", "2026-10-13");
  });

  it("E-Rechnung füllt Nummer, Datum, neuen Lieferanten und Betrag", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Beleg erfassen" }));
    const xml = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="c" xmlns:cbc="b">
      <cbc:ID>R-9</cbc:ID><cbc:IssueDate>2026-10-02</cbc:IssueDate>
      <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Neu GmbH</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
      <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxableAmount>100</cbc:TaxableAmount><cbc:TaxAmount>19</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
      <cac:LegalMonetaryTotal><cbc:PayableAmount>119</cbc:PayableAmount></cac:LegalMonetaryTotal></Invoice>`;
    const datei = new File([xml], "rechnung.xml", { type: "application/xml" });
    fireEvent.change(document.querySelector('[role="dialog"] input[type="file"]') as HTMLInputElement, { target: { files: [datei] } });
    expect(await screen.findByText(/E-Rechnung \(UBL\) gelesen/)).toBeTruthy();
    expect((screen.getByPlaceholderText("Rechnungsnummer") as HTMLInputElement).value).toBe("R-9");
    expect((screen.getByLabelText("Betrag Posten 1") as HTMLInputElement).value).toBe("119");
    await waitFor(() => expect(api.finBelegDateiHochladen).toHaveBeenCalled());
    // Der neue Lieferant entsteht beim ersten Speichern, und der Entwurf bekommt schon die Werte aus der Datei.
    expect(api.finLieferantAnlegen).toHaveBeenCalledWith(supabase, expect.objectContaining({ name: "Neu GmbH" }));
    expect(api.finBelegSpeichern).toHaveBeenCalledWith(supabase, null, expect.objectContaining({
      lieferant_id: "l2", belegnummer: "R-9", belegdatum: "2026-10-02", posten: [{ konto: null, betrag: 119, steuer: "vst19" }],
    }));
    expect(api.finBelegDateiHochladen).toHaveBeenCalledWith(supabase, "neu1", expect.anything(), "rechnung.xml", null);
  });

  it("Belegkorb: mehrere Dateien → je ein Entwurf", async () => {
    api.finBelegSpeichern.mockResolvedValueOnce("k1").mockResolvedValueOnce("k2");
    zeigen();
    const pdf = (n: string) => new File(["%PDF-1.4 leer"], n, { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText("Mehrere Belege hochladen"), { target: { files: [pdf("Tanken 1.pdf"), pdf("Tanken 2.pdf"), new File(["x"], "liste.txt", { type: "text/plain" })] } });
    expect(await screen.findByText(/2 Entwürfe angelegt/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/liste\.txt/);
    expect(api.finBelegSpeichern).toHaveBeenCalledWith(supabase, null, expect.objectContaining({ text: "Tanken 1", belegdatum: "2026-10-13", posten: [] }));
    expect(api.finBelegDateiHochladen).toHaveBeenCalledWith(supabase, "k2", expect.anything(), "Tanken 2.pdf", null);
  });

  it("Lieferant mit IBAN, Zahlungsziel und Skonto; das Ziel setzt die Fälligkeit", async () => {
    zeigen();
    fireEvent.click(await screen.findByRole("tab", { name: "Lieferanten" }));
    fireEvent.click(screen.getByRole("button", { name: "Lieferant anlegen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("input") as HTMLInputElement, { target: { value: "Reifen Nord" } });
    fireEvent.change(screen.getByPlaceholderText("DE.."), { target: { value: "DE12" } });
    expect(screen.getByRole("alert").textContent).toBe("Die IBAN ist nicht gültig.");
    fireEvent.change(screen.getByPlaceholderText("DE.."), { target: { value: "de02 1203 0000 0000 2020 51" } });
    fireEvent.change(screen.getByPlaceholderText("z. B. 30"), { target: { value: "30" } });
    fireEvent.change(screen.getByPlaceholderText("z. B. 2"), { target: { value: "2" } });
    expect(screen.getByRole("alert").textContent).toMatch(/Prozent und Tage/);
    fireEvent.change(screen.getByPlaceholderText("z. B. 10"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.finLieferantAnlegen).toHaveBeenCalledWith(supabase, expect.objectContaining({
      name: "Reifen Nord", iban: "DE02120300000000202051", zahlungsziel_tage: 30, skonto_prozent: 2, skonto_tage: 10 })));
  });

  it("Zahlungsziel des Lieferanten füllt die Fälligkeit", async () => {
    api.fetchFinLieferanten.mockResolvedValueOnce([{ id: "l1", name: "Tankstelle Muster", ust_id: null, konto: 4530, steuer: "vst19", aktiv: true, zahlungsziel_tage: 14 } as never]);
    zeigen();
    fireEvent.click(await screen.findByRole("button", { name: "Beleg erfassen" }));
    fireEvent.change(screen.getByLabelText("Lieferant"), { target: { value: "l1" } });
    expect((document.querySelector('[role="dialog"] input[type="date"][value="2026-10-27"]'))).toBeTruthy();
  });
});

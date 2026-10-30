// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stufen F, G, H (v186): Cockpit, Plan/Ist, OP-Analyse, Prüfliste, Belegbild an der Buchung. Daten erfunden.
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinEinstellungen: vi.fn(async (): Promise<unknown> => ({ status: "fehlt" })),
  fetchFinSalden: vi.fn(async () => [{ konto: 8400, monat: 10, soll: 0, haben: 3000 }, { konto: 4210, monat: 10, soll: 500, haben: 0 }, { konto: 1200, monat: 10, soll: 2500, haben: 0 }]),
  fetchFinKonten: vi.fn(async () => [konto(1200, "Bank", "geld"), konto(4210, "Miete", "aufwand"), konto(8400, "Erlöse 19 % USt", "erloes")]),
  fetchFinSteuerschluessel: vi.fn(async () => []),
  fetchFinEuer: vi.fn(async () => ({ eingerichtet: false })),
  fetchFinKontenblatt: vi.fn(async () => []),
  fetchFinPlan: vi.fn(async (): Promise<unknown[]> => [{ konto: 8400, monat: 10, betrag: 2500 }]),
  finPlanSetzen: vi.fn(async () => 12), finPlanAusVorjahr: vi.fn(async () => 3),
  fetchFinRechnungenStand: vi.fn(async () => ({ vorgaenge: [], anderswo: [], rechnungen: [
    { rechnung_id: "r1", nummer_text: "RE-1", datum: "2026-06-01", brutto: 119, order_id: null, order_number: null, kunde: "Muster GmbH", storniert: false, storno_nummer: null,
      status: "gebucht", fehler: null, faellig_am: "2026-06-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1 },
  ] })),
  fetchFinBelege: vi.fn(async () => []),
  fetchFinLieferanten: vi.fn(async () => []),
  fetchFinPruefung: vi.fn(async () => ({ eingerichtet: true, luecken_buchungen: [], luecken_rechnungen: [4], ohne_beleg_zahl: 1,
    ohne_beleg: [{ id: "x", nr: 7, datum: "2026-10-27", text: "Porto", betrag: 5 }], ohne_personenkonto: 0, bank_offen: { zahl: 0, summe: 0, aeltester: null },
    entwuerfe_alt: 0, monate_offen: [] })),
  fetchFinBuchungen: vi.fn(async () => []),
  fetchFinBuchungDateien: vi.fn(async (): Promise<unknown[]> => [{ id: "d1", buchung_id: "B1", pfad: "buchung/B1/1-a.pdf", name: "Quittung.pdf", typ: "application/pdf", erstellt_am: "2026-10-01" }]),
  finBuchungDateiHochladen: vi.fn(async () => undefined),
  finBelegDateiLink: vi.fn(async () => "https://x"),
}));
vi.mock("@/lib/api/finance", () => api);
vi.mock("@/lib/api/betrieb", () => ({ fetchBetrieb: vi.fn(async () => ({ firma: "Testbetrieb", inhaber: "", iban: "", bic: "" })) }));

import { FinanceAuswertungen } from "@/components/finance/FinanceAuswertungen";
import { FinancePruefung } from "@/components/finance/FinancePruefung";
import { BelegBilder } from "@/components/finance/BelegBilder";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const E = finVorgabe(2026, "2026-10-14");
function auswertungen(planen = true) {
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceAuswertungen supabase={supabase} jahr={2026} heute="2026-10-14" einstellungen={E} onEinstellungen={() => {}}
      rechte={{ rechnungen: true, belege: true, bank: false, steuern: false, planen }} />
  </QueryClientProvider>);
}

describe("Auswertungen Stufe G", () => {
  it("Cockpit: Kacheln mit Plan, Antippen führt in die Auswertung", async () => {
    auswertungen();
    const umsatz = (await screen.findByText("Umsatz im Jahr")).closest("button")!;
    await waitFor(() => expect(umsatz.textContent).toMatch(/3\.000,00\s€Plan 2\.500,00\s€ · \+500,00\s€/));
    expect(screen.getByText("Kasse und Bank").closest("button")!.textContent).toMatch(/2\.500,00\s€/);
    fireEvent.click(screen.getByText("Vorläufiges Ergebnis").closest("button")!);
    expect(await screen.findByText("Januar bis Oktober 2026")).toBeTruthy();
  });

  it("Plan/Ist: Konto planen speichert zwölf Monate", async () => {
    auswertungen();
    fireEvent.click(await screen.findByRole("tab", { name: "Plan/Ist" }));
    expect((await screen.findByText("Umsatzerlöse")).closest("tr")!.textContent).toMatch(/2\.500,00\s€3\.000,00\s€500,00\s€\+20 %/);
    fireEvent.click(screen.getByRole("button", { name: "Konto planen" }));
    fireEvent.change(screen.getByLabelText("Konto für den Plan"), { target: { value: "4210" } });
    fireEvent.change(screen.getByLabelText("Jahresbetrag"), { target: { value: "6.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verteilen" }));
    expect((screen.getByLabelText("Plan Dezember") as HTMLInputElement).value).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.finPlanSetzen).toHaveBeenCalledWith(supabase, 2026, 4210, Array(12).fill(500)));
  });

  it("Plan/Ist ohne Recht: kein Planen; Drucken öffnet den Bericht", async () => {
    auswertungen(false);
    fireEvent.click(await screen.findByRole("tab", { name: "Plan/Ist" }));
    await screen.findByText("Umsatzerlöse");
    expect(screen.queryByRole("button", { name: "Konto planen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Drucken" }));
    expect(screen.getByRole("dialog", { name: "Plan und Ist" }).textContent).toMatch(/Testbetrieb/);
  });

  it("OP-Analyse: gestaffelt nach Tagen über der Fälligkeit", async () => {
    auswertungen();
    fireEvent.click(await screen.findByRole("tab", { name: "OP-Analyse" }));
    expect((await screen.findByText("über 90 Tage")).closest("tr")!.textContent).toMatch(/119,00\s€/);
    expect(screen.getByText("Muster GmbH")).toBeTruthy();
  });
});

describe("Prüfliste und Belegbild", () => {
  it("Prüfliste zeigt offene Punkte mit Sprung", async () => {
    const onSeite = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <FinancePruefung supabase={supabase} jahr={2026} heute="2026-10-14" e={E} onSeite={onSeite}
        rechte={{ rechnungen: true, belege: false, buchen: true, steuern: false, zahlungen: false }} />
    </QueryClientProvider>);
    expect(await screen.findByText(/2 Punkte offen/)).toBeTruthy();
    expect(screen.getByText(/Es fehlen 4 im Rechnungskreis/)).toBeTruthy();
    expect(screen.getByText("Porto")).toBeTruthy();
    const zeile = screen.getByText("Jede Buchung von Hand hat einen Beleg").closest(".es-zeile")!;
    fireEvent.click(zeile.querySelector("button")!);
    expect(onSeite).toHaveBeenCalledWith("buchungen");
  });

  it("Belegbild an der Buchung: zeigen und anhängen", async () => {
    render(<QueryClientProvider client={new QueryClient()}><BelegBilder supabase={supabase} buchungId="B1" darfAnhaengen /></QueryClientProvider>);
    expect(await screen.findByRole("button", { name: "Quittung.pdf" })).toBeTruthy();
    const pdf = new File(["%PDF"], "Beleg 2.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Belegbild anhängen"), { target: { files: [pdf] } });
    await waitFor(() => expect(api.finBuchungDateiHochladen).toHaveBeenCalledWith(supabase, "B1", pdf, "Beleg 2.pdf"));
    fireEvent.change(screen.getByLabelText("Belegbild anhängen"), { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Nur Fotos/);
  });
});

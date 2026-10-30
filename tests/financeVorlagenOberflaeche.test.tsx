// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Vorlagen und wiederkehrende Buchungen (Migration 107, v181): Liste, Fenster, Vorlage im Stapel, Holen, „Als Vorlage“.
const api = vi.hoisted(() => ({
  finVorlageSpeichern: vi.fn(async () => "v-neu"), finVorlageLoeschen: vi.fn(async () => undefined),
  finWiederkehrendSpeichern: vi.fn(async () => "w-neu"), finWiederkehrendLoeschen: vi.fn(async () => undefined),
  finWiederkehrendHolen: vi.fn(async () => 2),
  finStapelAnlegen: vi.fn(), finStapelZeileSpeichern: vi.fn(), finStapelZeileLoeschen: vi.fn(), finStapelLoeschen: vi.fn(), finStapelBuchen: vi.fn(),
  finBuchen: vi.fn(), finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
const daten = vi.hoisted(() => ({ stapel: [] as unknown[], vorlagen: [] as unknown[], wks: [] as unknown[] }));
vi.mock("@/lib/queries/hooks", () => ({
  useFinStapel: () => ({ data: daten.stapel, isError: false, isPending: false }),
  useFinVorlagen: () => ({ data: daten.vorlagen, isError: false, isPending: false }),
  useFinWiederkehrend: () => ({ data: daten.wks, isError: false, isPending: false }),
}));

import { FinanceVorlagen } from "@/components/finance/FinanceVorlagen";
import { FinanceStapel } from "@/components/finance/FinanceStapel";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinVorlage, FinWiederkehrend } from "@/lib/finance/vorlagen";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1000, "Kasse", "geld"), k(1200, "Bank", "geld"), k(1576, "Vorsteuer", "steuer"), k(4530, "Kfz-Kosten", "aufwand"), k(4570, "Leasing", "aufwand")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }];
const E = finVorgabe(2027, "2027-04-10");
const TANK: FinVorlage = { id: "v1", kurz: "Tank", text: "Tanken", soll: 4530, haben: 1000, betrag: null, steuer: "vst19" };
const LEASING: FinWiederkehrend = { id: "w1", text: "Leasing VW", soll: 4570, haben: 1200, betrag: 476, steuer: "vst19", rhythmus: "monat", ab: "2027-01-30", bis: null, aktiv: true };
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Vorlagen-Seite", () => {
  it("listet beide, legt eine Vorlage an", async () => {
    daten.vorlagen = [TANK]; daten.wks = [LEASING];
    daten.stapel = [{ id: "s0", jahr: 2027, bezeichnung: "Jan", zustand: "gebucht", erstellt_am: "x", gebucht_am: "x",
      fin_stapel_zeilen: [{ id: "z", stapel_id: "s0", lfd: 1, datum: "2027-01-30", beleg: null, text: "t", soll: 4570, haben: 1200, betrag: 476, steuer: null, buchung_id: null, wiederkehrend_id: "w1", termin: "2027-01-30" }] }];
    render(mitQuery(<FinanceVorlagen supabase={{} as SupabaseClient} jahr={2027} heute="2027-04-10" einstellungen={E} konten={KONTEN} schluessel={SCHL} darfBuchen />));
    const vl = screen.getByRole("region", { name: "Buchungsvorlagen" });
    expect(within(vl).getByText("jedes Mal")).toBeTruthy();
    const wk = screen.getByRole("region", { name: "Wiederkehrende Buchungen" });
    expect(within(wk).getByText("28.02.2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ Vorlage" }));
    fireEvent.change(screen.getByPlaceholderText("z. B. Tanken"), { target: { value: "Konto" } });
    fireEvent.change(screen.getAllByRole("textbox").find((t) => (t as HTMLInputElement).maxLength === 200)!, { target: { value: "Kontoführung" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "12,9" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Speichern" })); });
    expect(api.finVorlageSpeichern).toHaveBeenCalledWith(expect.anything(), null, { kurz: "Konto", text: "Kontoführung", soll: 4530, haben: 1200, betrag: 12.9, steuer: null });
  });

  it("wiederkehrende ohne Betrag geht nicht; ändern öffnet mit Werten", () => {
    daten.vorlagen = []; daten.wks = [LEASING]; daten.stapel = [];
    render(mitQuery(<FinanceVorlagen supabase={{} as SupabaseClient} jahr={2027} heute="2027-04-10" einstellungen={E} konten={KONTEN} schluessel={SCHL} darfBuchen />));
    const wk = screen.getByRole("region", { name: "Wiederkehrende Buchungen" });
    fireEvent.keyDown(wk, { key: "Home" });
    fireEvent.keyDown(wk, { key: "Enter" });
    expect(screen.getByText("Wiederkehrende Buchung ändern")).toBeTruthy();
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("476,00");
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toBe("Eine wiederkehrende Buchung braucht einen festen Betrag.");
  });
});

describe("Im Stapel", () => {
  const offen = { id: "s1", jahr: 2027, bezeichnung: "April", zustand: "offen", erstellt_am: "2027-04-01", gebucht_am: null, fin_stapel_zeilen: [] };
  function stapel() {
    daten.stapel = [offen]; daten.vorlagen = [TANK]; daten.wks = [LEASING];
    const onMeldung = vi.fn();
    render(mitQuery(<FinanceStapel supabase={{} as SupabaseClient} jahr={2027} heute="2027-04-10" einstellungen={E} konten={KONTEN} schluessel={SCHL}
      fest={[]} buchungen={[]} darfBuchen onMeldung={onMeldung} onOeffnen={() => {}} onKontoblatt={() => {}} />));
    return onMeldung;
  }
  it("Vorlage füllt die Erfassungszeile", () => {
    stapel();
    fireEvent.change(screen.getByRole("combobox", { name: "Vorlage" }), { target: { value: "v1" } });
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("Tanken");
    expect((screen.getByLabelText("Soll-Konto") as HTMLInputElement).value).toBe("4530");
    expect((screen.getByLabelText("Steuer") as HTMLSelectElement).value).toBe("vst19");
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("");
  });
  it("Wiederkehrende holen: Vorschau bis Monatsende, holen", async () => {
    const onMeldung = stapel();
    fireEvent.click(screen.getByRole("button", { name: "Wiederkehrende holen …" }));
    expect((screen.getByLabelText("Fällig bis") as HTMLInputElement).value).toBe("2027-04-30");
    expect(screen.getByText("Leasing VW 04/2027")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "4 Zeilen holen" })); });
    expect(api.finWiederkehrendHolen).toHaveBeenCalledWith(expect.anything(), "s1", "2027-04-30");
    expect(onMeldung).toHaveBeenCalledWith("2 wiederkehrende Buchungen geholt – im Stapel prüfen und buchen.");
  });
  it("Als Vorlage: Fenster mit den Werten der Zeile", () => {
    stapel();
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Buchungstext"), { target: { value: "Parken" } });
    fireEvent.click(screen.getByRole("button", { name: "Als Vorlage …" }));
    expect(screen.getByText("Neue Buchungsvorlage")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByDisplayValue("Parken")).toBeTruthy();
  });
});

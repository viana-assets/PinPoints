// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Kostenstellen am Rechner (Migration 108, v182): Seite mit Auswertung und Pflege, Auswahl im Stapel und im Buchungsfenster.
const api = vi.hoisted(() => ({
  finKostenstelleSpeichern: vi.fn(async () => "k-neu"), finKostenstellenUebernehmen: vi.fn(async () => 1),
  finStapelAnlegen: vi.fn(), finStapelZeileSpeichern: vi.fn(async () => "z"), finStapelZeileLoeschen: vi.fn(), finStapelLoeschen: vi.fn(), finStapelBuchen: vi.fn(),
  finWiederkehrendHolen: vi.fn(), finVorlageSpeichern: vi.fn(), finVorlageLoeschen: vi.fn(), finWiederkehrendSpeichern: vi.fn(), finWiederkehrendLoeschen: vi.fn(),
  finBuchen: vi.fn(async () => ({ id: "b", jahr: 2027, nr: 4 })), finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
const daten = vi.hoisted(() => ({ stapel: [] as unknown[] }));
vi.mock("@/lib/queries/hooks", () => ({
  useFinStapel: () => ({ data: daten.stapel, isError: false, isPending: false }),
  useFinVorlagen: () => ({ data: [], isError: false, isPending: false }),
  useFinWiederkehrend: () => ({ data: [], isError: false, isPending: false }),
}));

import { FinanceKostenstellen } from "@/components/finance/FinanceKostenstellen";
import { FinanceStapel } from "@/components/finance/FinanceStapel";
import { BuchungNeu } from "@/components/finance/FinanceBuchungen";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinKostenstelle } from "@/lib/finance/kostenstellen";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(1400, "Forderungen", "forderung"), k(4530, "Kfz", "aufwand"), k(8400, "Erlöse", "erloes")];
const SCHL: FinSteuerschluessel[] = [];
const E = finVorgabe(2027, "2027-02-10");
const KS: FinKostenstelle[] = [
  { id: "a", art: "kost1", nummer: "T1", bezeichnung: "NB-MR 12", aktiv: true, firmenfahrzeug_id: "f" },
  { id: "d", art: "kost2", nummer: "100", bezeichnung: "Montage", aktiv: true, firmenfahrzeug_id: null }];
const zeile = (seite: "S" | "H", konto: number, betrag: number, kost1: string | null = null, kost2: string | null = null) =>
  ({ posten: 1, seite, konto, betrag, steuerschluessel: null, ist_steuer: false, kost1, kost2 });
const BU: FinBuchung[] = [
  { id: "b1", jahr: 2027, nr: 1, datum: "2027-02-01", text: "Tanken", beleg: null, quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x",
    fin_buchungszeilen: [zeile("S", 4530, 50, "T1"), zeile("H", 1200, 50)] },
  { id: "b2", jahr: 2027, nr: 2, datum: "2027-02-02", text: "Montage", beleg: null, quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x",
    fin_buchungszeilen: [zeile("S", 1400, 200), zeile("H", 8400, 200, "T1", "100")] }];
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const zeilen = () => screen.getAllByRole("row").filter((r) => r.dataset.key);

describe("Kostenstellen-Seite", () => {
  it("Erlöse, Aufwand, Ergebnis; ohne Leistungsart; ändern; Transporter übernehmen", async () => {
    render(mitQuery(<FinanceKostenstellen supabase={{} as SupabaseClient} jahr={2027} buchungen={BU} konten={KONTEN} kostenstellen={KS} laedt={false} fehlt={false} darfPflegen />));
    const t1 = zeilen().find((r) => r.dataset.key === "a")!;
    expect(within(t1).getAllByRole("cell").map((c) => c.textContent).slice(1)).toEqual(["Transporter", "T1", "NB-MR 12", "200,00", "50,00", "150,00", "2"]);
    expect(within(zeilen().find((r) => r.dataset.key === "ohne-kost2")!).getByText("ohne Leistungsart")).toBeTruthy();
    expect(screen.getByText(/Gesamt im Zeitraum/).textContent).toMatch(/200,00.*50,00.*150,00/);
    fireEvent.click(t1);
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Sprinter" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Speichern" })); });
    expect(api.finKostenstelleSpeichern).toHaveBeenCalledWith(expect.anything(), "a", { art: "kost1", nummer: "T1", bezeichnung: "Sprinter", aktiv: true });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Transporter übernehmen" })); });
    expect(screen.getByText("1 Kostenstelle dazugekommen.")).toBeTruthy();
  });
});

describe("Auswahl beim Erfassen", () => {
  it("Stapel: Transporter und Leistung in der Erfassungszeile, Spalten in der Liste", async () => {
    daten.stapel = [{ id: "s1", jahr: 2027, bezeichnung: "Feb", zustand: "offen", erstellt_am: "x", gebucht_am: null,
      fin_stapel_zeilen: [{ id: "z1", stapel_id: "s1", lfd: 1, datum: "2027-02-03", beleg: null, text: "Alt", soll: 4530, haben: 1200, betrag: 5, steuer: null, buchung_id: null, kost1: "T1", kost2: null }] }];
    render(mitQuery(<FinanceStapel supabase={{} as SupabaseClient} jahr={2027} heute="2027-02-10" einstellungen={E} konten={KONTEN} schluessel={SCHL}
      fest={[]} buchungen={[]} darfBuchen onMeldung={() => {}} onOeffnen={() => {}} onKontoblatt={() => {}} kostenstellen={KS} />));
    expect(within(zeilen()[0]).getByText("T1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "1002" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Transporter"), { target: { value: "T1" } });
    fireEvent.change(screen.getByLabelText("Buchungstext"), { target: { value: "Waschen" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Übernehmen ⏎" })); });
    expect(api.finStapelZeileSpeichern).toHaveBeenCalledWith(expect.anything(), "s1", null, expect.objectContaining({ kost1: "T1", kost2: null }));
  });

  it("Buchungsfenster: je Posten Transporter und Leistung", async () => {
    render(mitQuery(<BuchungNeu supabase={{} as SupabaseClient} heute="2027-02-10" jahr={2027} einstellungen={E} konten={KONTEN} schluessel={SCHL}
      kostenstellen={KS} onGebucht={() => {}} onClose={() => {}} />));
    fireEvent.change(screen.getByPlaceholderText("Was ist passiert?"), { target: { value: "Rechnung" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto Posten 1"), { target: { value: "1400" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto Posten 1"), { target: { value: "8400" } });
    fireEvent.change(screen.getByLabelText("Betrag Posten 1"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Leistung"), { target: { value: "100" } });
    expect(screen.getByText("· 100")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Buchen" })); });
    expect(api.finBuchen).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ posten: [{ soll: 1400, haben: 8400, betrag: 200, steuer: null, kost2: "100" }] }));
  });
});

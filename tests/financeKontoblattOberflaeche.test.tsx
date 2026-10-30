// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance Stufe B (v179): Kontoblatt und Konten am Rechner, Sprünge aus dem Journal und über Gegenkonten.
const api = vi.hoisted(() => ({
  finBuchen: vi.fn(), finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(),
  finKontoAktiv: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/finance", () => api);
const download = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/download", () => download);
const daten = vi.hoisted(() => ({ konten: [] as unknown[], buchungen: [] as unknown[] }));
vi.mock("@/lib/queries/hooks", () => {
  const q = (data: unknown) => ({ data, isError: false, isPending: false });
  return {
    useFinKonten: () => q(daten.konten), useFinSteuerschluessel: () => q([]), useFinBuchungen: () => q(daten.buchungen),
    useFinFestschreibungen: () => q([]),
    useFinKostenstellen: () => q([]),
  };
});

import { FinanceKontoblatt } from "@/components/finance/FinanceKontoblatt";
import { FinanceKontenArbeitsplatz } from "@/components/finance/FinanceKontenArbeitsplatz";
import { FinanceBuchungen } from "@/components/finance/FinanceBuchungen";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand", aktiv = true): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv });
const KONTEN = [k(1200, "Bank", "geld"), k(4530, "Kfz-Betriebskosten"), k(4540, "Kfz-Reparaturen"), k(8400, "Erlöse 19 %", "erloes"), k(4999, "Alt")];
const z = (seite: "S" | "H", konto: number, betrag: number): FinZeile => ({ posten: 1, seite, konto, betrag, ist_steuer: false, steuerschluessel: null });
const b = (nr: number, datum: string, text: string, s: number, h: number, betrag: number): FinBuchung => ({
  id: `b${nr}`, jahr: 2027, nr, datum, text, beleg: `BE-${nr}`, quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null,
  grund: null, erstellt_am: datum, fin_buchungszeilen: [z("S", s, betrag), z("H", h, betrag)],
});
const BUCHUNGEN = [b(1, "2027-01-05", "Einnahme", 1200, 8400, 500), b(2, "2027-01-08", "Tanken", 4530, 1200, 78.4),
  b(3, "2027-02-03", "Werkstatt", 4540, 1200, 300)];
daten.konten = KONTEN;
daten.buchungen = BUCHUNGEN;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
const zeilen = () => screen.getAllByRole("row").filter((r) => r.dataset.key);

describe("Kontoblatt", () => {
  function blatt(konto: number | null, zurueck: number | null = null) {
    const onKonto = vi.fn(), onZurueck = vi.fn(), onOeffnen = vi.fn();
    render(<FinanceKontoblatt buchungen={BUCHUNGEN} konten={KONTEN} fest={[]} jahr={2027} laedt={false} konto={konto} onKonto={onKonto}
      zurueck={zurueck} onZurueck={onZurueck} darfBuchen onNeu={() => {}} onOeffnen={onOeffnen} />);
    return { onKonto, onZurueck, onOeffnen };
  }
  it("Bank: Bewegungen mit laufendem Saldo, Endsaldo, Verkehrszahlen", () => {
    blatt(1200);
    expect(zeilen().map((r) => within(r).getAllByRole("cell")[8].textContent)).toEqual(["500,00 S", "421,60 S", "121,60 S"]);
    expect(screen.getAllByText("121,60 S").length).toBeGreaterThan(1);
    expect(screen.getByText(/Verkehrszahlen Soll/).textContent).toMatch(/500,00.*378,40.*121,60 S/);
  });
  it("Klick aufs Gegenkonto und F3 öffnen dessen Kontoblatt; Enter öffnet die Buchung; Zurück", () => {
    const { onKonto, onZurueck, onOeffnen } = blatt(1200, 4530);
    fireEvent.click(screen.getByRole("button", { name: "8400" }));
    expect(onKonto).toHaveBeenLastCalledWith(8400);
    const tabelle = screen.getByRole("region", { name: "Kontoblatt 1200" });
    fireEvent.keyDown(tabelle, { key: "Home" });
    fireEvent.keyDown(document.body, { key: "F3" });
    expect(onKonto).toHaveBeenLastCalledWith(8400);
    fireEvent.keyDown(tabelle, { key: "Enter" });
    expect(onOeffnen).toHaveBeenCalledWith(BUCHUNGEN[0]);
    fireEvent.click(screen.getByRole("button", { name: "← 4530" }));
    expect(onZurueck).toHaveBeenCalled();
  });
  it("Zeitraum Februar: Eröffnung aus Januar", () => {
    blatt(1200);
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "m2" } });
    expect(zeilen().length).toBe(1);
    expect(screen.getByText("Eröffnung").parentElement?.textContent).toMatch(/421,60 S/);
  });
  it("frei von–bis, CSV mit Eröffnung", () => {
    blatt(1200);
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "frei" } });
    fireEvent.change(screen.getByLabelText("Zeitraum von"), { target: { value: "2027-01-06" } });
    expect(zeilen().length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    const [datei, inhalt] = download.dateiHerunterladen.mock.calls[0];
    expect(datei).toBe("kontoblatt_1200_2027-01-06_2027-12-31.csv");
    expect(inhalt).toContain("Eröffnungssaldo;;;;;500;S");
  });
  it("ohne Konto: Hinweis und Fokus im Kontofeld", () => {
    blatt(null);
    expect(screen.getByText("Konto oben eintippen – Nummer oder Name.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Konto für das Kontoblatt"));
  });
});

describe("Konten", () => {
  function konten() {
    const onKontoblatt = vi.fn();
    render(mitQuery(<FinanceKontenArbeitsplatz supabase={{} as SupabaseClient} rahmen="skr03" buchungen={BUCHUNGEN} konten={KONTEN} jahr={2027}
      laedt={false} darfKonten onKontoblatt={onKontoblatt} />));
    return onKontoblatt;
  }
  it("nur bebuchte, Summen stimmen, Enter öffnet das Kontoblatt", () => {
    const onKontoblatt = konten();
    expect(zeilen().map((r) => r.dataset.key)).toEqual(["1200", "4530", "4540", "8400"]);
    expect(screen.getByText(/stimmt überein/)).toBeTruthy();
    const tabelle = screen.getByRole("region", { name: "Konten 2027" });
    fireEvent.keyDown(tabelle, { key: "ArrowDown" });
    fireEvent.keyDown(tabelle, { key: "Enter" });
    expect(onKontoblatt).toHaveBeenCalledWith(4530);
  });
  it("Filter Art und alle Konten; Ausblenden", async () => {
    konten();
    fireEvent.change(screen.getByRole("combobox", { name: "Art" }), { target: { value: "erloes" } });
    expect(zeilen().map((r) => r.dataset.key)).toEqual(["8400"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Art" }), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("nur bebuchte"));
    expect(zeilen().length).toBe(5);
    fireEvent.click(zeilen().find((r) => r.dataset.key === "4999")!);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ausblenden" })); });
    expect(api.finKontoAktiv).toHaveBeenCalledWith(expect.anything(), "skr03", 4999, false);
  });
});

describe("Sprünge auf der Seite Buchungen", () => {
  it("Journal → F3 Kontoblatt → Gegenkonto → Zurück", () => {
    render(mitQuery(<FinanceBuchungen supabase={{} as SupabaseClient} jahr={2027} heute="2027-02-10" einstellungen={finVorgabe(2027, "2027-02-10")}
      darfBuchen darfFestschreiben darfKonten onEinstellungen={() => {}} />));
    const journal = screen.getByRole("region", { name: "Journal 2027" });
    fireEvent.click(zeilen().find((r) => r.dataset.key === "b2")!);
    fireEvent.keyDown(journal, { key: "F3" });
    expect(screen.getByRole("tab", { name: "Kontoblatt" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Kontoblatt 4530" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1200" }));
    expect(screen.getByRole("region", { name: "Kontoblatt 1200" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← 4530" }));
    expect(screen.getByRole("region", { name: "Kontoblatt 4530" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^← / })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Konten" }));
    expect(screen.getByRole("region", { name: "Konten 2027" })).toBeTruthy();
  });
});

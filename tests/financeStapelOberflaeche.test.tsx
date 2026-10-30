// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Buchungsstapel am Rechner (Migration 106, v180): erfassen mit Enter, ändern, löschen, Prüfung, Strg+S bucht.
const api = vi.hoisted(() => ({
  finStapelAnlegen: vi.fn(async () => "s-neu"), finStapelZeileSpeichern: vi.fn(async () => "z-neu"), finStapelZeileLoeschen: vi.fn(async () => undefined),
  finStapelLoeschen: vi.fn(async () => undefined), finStapelTeilSpeichern: vi.fn(async () => "t-neu"), finStapelBuchen: vi.fn(async () => ({ anzahl: 2, jahr: 2027, von: 5, bis: 6 })),
  finBuchen: vi.fn(), finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
const daten = vi.hoisted(() => ({ stapel: [] as unknown[], vorlagen: [] as unknown[], wks: [] as unknown[] }));
vi.mock("@/lib/queries/hooks", () => ({
  useFinStapel: () => ({ data: daten.stapel, isError: false, isPending: false }),
  useFinVorlagen: () => ({ data: daten.vorlagen, isError: false, isPending: false }),
  useFinWiederkehrend: () => ({ data: daten.wks, isError: false, isPending: false }),
}));

import { FinanceStapel } from "@/components/finance/FinanceStapel";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinStapel, FinStapelZeile } from "@/lib/finance/stapel";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(1576, "Vorsteuer", "steuer"), k(4530, "Laufende Kfz-Kosten", "aufwand"), k(8400, "Erlöse", "erloes"), k(1400, "Forderungen", "forderung")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }];
const zeile = (id: string, lfd: number, datum: string, soll: number, haben: number, betrag: number, text: string, buchung_id: string | null = null): FinStapelZeile =>
  ({ id, stapel_id: "s1", lfd, datum, beleg: `ER-${lfd}`, text, soll, haben, betrag, steuer: null, buchung_id });
const stapel = (zustand: FinStapel["zustand"], zeilen: FinStapelZeile[]): FinStapel =>
  ({ id: "s1", jahr: 2027, bezeichnung: "Februar 2027", zustand, erstellt_am: "2027-02-01T10:00:00Z", gebucht_am: zustand === "gebucht" ? "2027-02-20T10:00:00Z" : null, fin_stapel_zeilen: zeilen });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function zeigen(st: FinStapel[], buchungen: FinBuchung[] = []) {
  daten.stapel = st;
  const onMeldung = vi.fn(), onOeffnen = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceStapel supabase={{} as SupabaseClient} jahr={2027} heute="2027-02-15" einstellungen={finVorgabe(2027, "2027-02-15")} konten={KONTEN}
      schluessel={SCHL} fest={[]} buchungen={buchungen} darfBuchen onMeldung={onMeldung} onOeffnen={onOeffnen} onKontoblatt={() => {}} />
  </QueryClientProvider>);
  return { onMeldung, onOeffnen };
}
const zeilen = () => screen.getAllByRole("row").filter((r) => r.dataset.key);

describe("Buchungsstapel", () => {
  it("ohne Stapel: Hinweis, neuen anlegen", async () => {
    zeigen([]);
    expect(screen.getByText("Noch kein Buchungsstapel in 2027.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ Neuer Stapel" }));
    const feld = screen.getByDisplayValue("Februar 2027");
    await act(async () => { fireEvent.keyDown(feld, { key: "Enter" }); });
    expect(api.finStapelAnlegen).toHaveBeenCalledWith(expect.anything(), 2027, "Februar 2027");
  });

  it("Prüfung je Zeile; mit Fehler kein Buchen", () => {
    zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken"), zeile("b", 2, "2027-02-04", 4530, 9999, 5, "Kaputt")])]);
    expect(screen.getByText(/1 mit Fehler/)).toBeTruthy();
    expect(within(zeilen()[1]).getByText(/Konto 9999 gibt es/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Stapel buchen (Strg+S)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Erfassen mit Enter von Feld zu Feld, im Text übernimmt es; Beleg zählt weiter", async () => {
    zeigen([stapel("offen", [])]);
    const datum = screen.getByLabelText("Datum") as HTMLInputElement;
    expect(datum.value).toBe("15.02.");
    fireEvent.change(datum, { target: { value: "1002" } });
    fireEvent.keyDown(datum, { key: "Enter" });
    const beleg = screen.getByLabelText("Beleg");
    expect(document.activeElement).toBe(beleg);
    fireEvent.change(beleg, { target: { value: "ER-0041" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "78,4" } });
    fireEvent.change(screen.getByLabelText("Steuer"), { target: { value: "vst19" } });
    const text = screen.getByLabelText("Buchungstext");
    fireEvent.change(text, { target: { value: "Tanken" } });
    expect(screen.getByText(/So wird gebucht: S 4530 65,88 · H 1200 78,40 · S 1576 12,52/)).toBeTruthy();
    await act(async () => { fireEvent.keyDown(text, { key: "Enter" }); });
    expect(api.finStapelZeileSpeichern).toHaveBeenCalledWith(expect.anything(), "s1", null,
      { datum: "2027-02-10", beleg: "ER-0041", soll: 4530, haben: 1200, betrag: 78.4, steuer: "vst19", text: "Tanken" });
    expect((screen.getByLabelText("Beleg") as HTMLInputElement).value).toBe("ER-0042");
    expect((screen.getByLabelText("Datum") as HTMLInputElement).value).toBe("1002");
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("");
  });

  it("Unvollständig: Hinweis und kein Speichern", async () => {
    zeigen([stapel("offen", [])]);
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Übernehmen ⏎" })); });
    expect(screen.getByRole("alert").textContent).toBe("Haben-Konto fehlt.");
    expect(api.finStapelZeileSpeichern).not.toHaveBeenCalled();
  });

  it("Enter auf einer Zeile ändert sie, Entf löscht", async () => {
    zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken")])]);
    const tabelle = screen.getByRole("region", { name: "Stapel Februar 2027" });
    fireEvent.keyDown(tabelle, { key: "Home" });
    fireEvent.keyDown(tabelle, { key: "Enter" });
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("Tanken");
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("50,00");
    expect(screen.getByRole("button", { name: "Ändern ⏎" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ändern ⏎" })); });
    expect(api.finStapelZeileSpeichern).toHaveBeenCalledWith(expect.anything(), "s1", "a", expect.objectContaining({ datum: "2027-02-03", betrag: 50 }));
    await act(async () => { fireEvent.keyDown(tabelle, { key: "Delete" }); });
    expect(api.finStapelZeileLoeschen).toHaveBeenCalledWith(expect.anything(), "a");
  });

  it("Strg+S fragt und bucht alle Zeilen", async () => {
    const { onMeldung } = zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken"), zeile("b", 2, "2027-02-01", 1400, 8400, 119, "Rechnung")])]);
    expect(zeilen().map((r) => r.dataset.key)).toEqual(["b", "a"]);
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "2 Buchungen buchen" })); });
    expect(api.finStapelBuchen).toHaveBeenCalledWith(expect.anything(), "s1");
    expect(onMeldung).toHaveBeenCalledWith("Stapel „Februar 2027“ gebucht: 2 Buchungen, Nr. 2027-5 bis 2027-6.");
  });

  it("gebucht: nur lesen, mit Nummer, Enter öffnet die Buchung", () => {
    const b = { id: "j5", jahr: 2027, nr: 5, datum: "2027-02-03", text: "Tanken", beleg: null, quelle: "manuell", quelle_id: null, storno_von: null,
      storniert_durch: null, grund: null, erstellt_am: "x", fin_buchungszeilen: [] } as FinBuchung;
    const { onOeffnen } = zeigen([stapel("gebucht", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken", "j5")])], [b]);
    expect(screen.queryByLabelText("Buchungstext")).toBeNull();
    expect(screen.queryByRole("button", { name: /Stapel buchen/ })).toBeNull();
    expect(within(zeilen()[0]).getByText("2027-5")).toBeTruthy();
    const tabelle = screen.getByRole("region", { name: "Stapel Februar 2027" });
    fireEvent.keyDown(tabelle, { key: "Home" });
    fireEvent.keyDown(tabelle, { key: "Enter" });
    expect(onOeffnen).toHaveBeenCalledWith(b);
  });

  it("Splitt: T hängt einen Teil an, Datum/Text gesperrt, gespeichert als Teil; Teile stehen als 1.1 und zählen nicht als Buchung", async () => {
    const kopf = zeile("a", 1, "2027-02-03", 4530, 1200, 119, "Werkstatt");
    const teil = { ...zeile("t", 2, "2027-02-03", 4530, 1200, 20, "Werkstatt"), teil_von: "a" };
    zeigen([stapel("offen", [kopf, teil, zeile("b", 3, "2027-02-05", 4530, 1200, 5, "Wasser")])]);
    expect(zeilen().map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["1", "1.1", "2"]);
    expect(screen.getByText(/\(2 Buchungen\)/)).toBeTruthy();
    const tabelle = screen.getByRole("region", { name: "Stapel Februar 2027" });
    fireEvent.keyDown(tabelle, { key: "Home" });
    fireEvent.keyDown(tabelle, { key: "t" });
    expect(screen.getByRole("group", { name: "Teil zu Zeile 1 erfassen" })).toBeTruthy();
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("Werkstatt");
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "10" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Teil ⏎" })); });
    expect(api.finStapelTeilSpeichern).toHaveBeenCalledWith(expect.anything(), "a", null, { soll: 4530, haben: 1200, betrag: 10, steuer: null, kost1: null, kost2: null });
    expect(api.finStapelZeileSpeichern).not.toHaveBeenCalled();
    // gleich der nächste Teil
    expect(screen.getByRole("group", { name: "Teil zu Zeile 1 erfassen" })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Betrag"), { key: "Escape" });
    expect(screen.getByRole("group", { name: "Neue Zeile erfassen" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
    expect(screen.getByRole("button", { name: "2 Buchungen buchen" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stapel am Handy (v183): schlanke Maske, Zeile erfassen / „+ Nächste“, ändern, löschen, buchen.
const api = vi.hoisted(() => ({
  finStapelAnlegen: vi.fn(async () => "s-neu"), finStapelZeileSpeichern: vi.fn(async () => "z-neu"), finStapelZeileLoeschen: vi.fn(async () => undefined),
  finStapelLoeschen: vi.fn(async () => undefined), finStapelTeilSpeichern: vi.fn(async () => "t-neu"), finStapelBuchen: vi.fn(async () => ({ anzahl: 2, jahr: 2027, von: 5, bis: 6 })),
  finBuchen: vi.fn(), finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
const daten = vi.hoisted(() => ({ stapel: [] as unknown[], vorlagen: [] as unknown[] }));
vi.mock("@/lib/queries/hooks", () => ({
  useFinStapel: () => ({ data: daten.stapel, isError: false, isPending: false }),
  useFinVorlagen: () => ({ data: daten.vorlagen, isError: false, isPending: false }),
}));

import { FinanceStapelHandy } from "@/components/finance/FinanceStapelHandy";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";
import type { FinStapel, FinStapelZeile } from "@/lib/finance/stapel";
import type { FinVorlage } from "@/lib/finance/vorlagen";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(1576, "Vorsteuer", "steuer"), k(4530, "Laufende Kfz-Kosten", "aufwand"), k(8400, "Erlöse", "erloes")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }];
const zeile = (id: string, lfd: number, datum: string, soll: number, haben: number, betrag: number, text: string): FinStapelZeile =>
  ({ id, stapel_id: "s1", lfd, datum, beleg: `ER-${lfd}`, text, soll, haben, betrag, steuer: null, buchung_id: null });
const stapel = (zustand: FinStapel["zustand"], zeilen: FinStapelZeile[]): FinStapel =>
  ({ id: "s1", jahr: 2027, bezeichnung: "Februar 2027", zustand, erstellt_am: "2027-02-01T10:00:00Z", gebucht_am: null, fin_stapel_zeilen: zeilen });
afterEach(() => { cleanup(); vi.clearAllMocks(); daten.vorlagen = []; });

function zeigen(st: FinStapel[], darfBuchen = true) {
  daten.stapel = st;
  const onMeldung = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}>
    <FinanceStapelHandy supabase={{} as SupabaseClient} jahr={2027} heute="2027-02-15" einstellungen={finVorgabe(2027, "2027-02-15")} konten={KONTEN}
      schluessel={SCHL} fest={[]} darfBuchen={darfBuchen} onMeldung={onMeldung} />
  </QueryClientProvider>);
  return { onMeldung };
}

describe("Stapel am Handy", () => {
  it("Zeile erfassen mit Vorschau, „+ Nächste“ lässt Datum und Steuer stehen und zählt den Beleg weiter", async () => {
    zeigen([stapel("offen", [])]);
    fireEvent.click(screen.getByRole("button", { name: "+ Zeile" }));
    expect((screen.getByLabelText("Datum") as HTMLInputElement).value).toBe("2027-02-15");
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "78,40" } });
    fireEvent.change(screen.getByLabelText("Buchungstext"), { target: { value: "Tanken" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Steuer"), { target: { value: "vst19" } });
    fireEvent.change(screen.getByLabelText("Beleg"), { target: { value: "ER-0041" } });
    expect(screen.getByText("SO WIRD GEBUCHT")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "+ Nächste" })); });
    expect(api.finStapelZeileSpeichern).toHaveBeenCalledWith(expect.anything(), "s1", null,
      { datum: "2027-02-15", beleg: "ER-0041", soll: 4530, haben: 1200, betrag: 78.4, steuer: "vst19", text: "Tanken" });
    expect((screen.getByLabelText("Beleg") as HTMLInputElement).value).toBe("ER-0042");
    expect((screen.getByLabelText("Steuer") as HTMLSelectElement).value).toBe("vst19");
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("");
  });

  it("was fehlt, sagt die Maske, ohne zu speichern", async () => {
    zeigen([stapel("offen", [])]);
    fireEvent.click(screen.getByRole("button", { name: "+ Zeile" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Übernehmen" })); });
    expect(screen.getByRole("alert").textContent).toBe("Soll-Konto fehlt.");
    expect(api.finStapelZeileSpeichern).not.toHaveBeenCalled();
  });

  it("Vorlage füllt die Maske", () => {
    daten.vorlagen = [{ id: "v1", kurz: "Miete", text: "Miete Halle", soll: 4530, haben: 1200, betrag: 900, steuer: null, kost1: null, kost2: null } as FinVorlage];
    zeigen([stapel("offen", [])]);
    fireEvent.click(screen.getByRole("button", { name: "+ Zeile" }));
    fireEvent.change(screen.getByLabelText("Vorlage"), { target: { value: "v1" } });
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("Miete Halle");
    expect((screen.getByLabelText("Soll-Konto") as HTMLSelectElement).value).toBe("4530");
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("900,00");
  });

  it("Antippen ändert, Löschen entfernt; Fehler stehen an der Zeile, dann kein Buchen", async () => {
    zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken"), zeile("b", 2, "2027-02-04", 4530, 9999, 5, "Kaputt")])]);
    expect(screen.getByText(/Konto 9999 gibt es/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Stapel buchen" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zeile 1: Tanken" }));
    expect((screen.getByLabelText("Buchungstext") as HTMLInputElement).value).toBe("Tanken");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Löschen" })); });
    expect(api.finStapelZeileLoeschen).toHaveBeenCalledWith(expect.anything(), "a");
  });

  it("buchen mit Rückfrage", async () => {
    const { onMeldung } = zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken"), zeile("b", 2, "2027-02-04", 4530, 1200, 5, "Wasser")])]);
    fireEvent.click(screen.getByRole("button", { name: "Stapel buchen" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "2 Buchungen buchen" })); });
    expect(api.finStapelBuchen).toHaveBeenCalledWith(expect.anything(), "s1");
    expect(onMeldung).toHaveBeenCalledWith("Stapel „Februar 2027“ gebucht: 2 Buchungen, Nr. 2027-5 bis 2027-6.");
  });

  it("ohne Recht: nur ansehen", () => {
    zeigen([stapel("offen", [zeile("a", 1, "2027-02-03", 4530, 1200, 50, "Tanken")])], false);
    expect(screen.queryByRole("button", { name: "+ Zeile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stapel buchen" })).toBeNull();
    expect((screen.getByRole("button", { name: "Zeile 1: Tanken" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Splitt: + Teil im Fenster der Zeile, ohne Datum und Text; Teile erscheinen eingerückt", async () => {
    const kopf = zeile("a", 1, "2027-02-03", 4540, 1200, 119, "Werkstatt");
    zeigen([stapel("offen", [kopf, { ...zeile("t", 2, "2027-02-03", 4530, 1200, 20, "Werkstatt"), teil_von: "a" }])]);
    expect(screen.getByRole("button", { name: "Teil 1.1" })).toBeTruthy();
    expect(screen.getByText(/2 Zeilen \(1 Buchung\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zeile 1: Werkstatt" }));
    expect(screen.getByText(/1 Teil – zusammen eine Buchung/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ Teil" }));
    expect(screen.getByText("Teil erfassen")).toBeTruthy();
    expect(screen.queryByLabelText("Buchungstext")).toBeNull();
    expect(screen.queryByLabelText("Datum")).toBeNull();
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Soll-Konto"), { target: { value: "4530" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto"), { target: { value: "1200" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Übernehmen" })); });
    expect(api.finStapelTeilSpeichern).toHaveBeenCalledWith(expect.anything(), "a", null, { soll: 4530, haben: 1200, betrag: 10, steuer: null, kost1: null, kost2: null });
  });
});


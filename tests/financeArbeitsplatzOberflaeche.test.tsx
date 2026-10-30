// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance-Arbeitsplatz am Rechner (v178, Stufe A): Journal als Tabelle mit Tastatur, Kontofeld, Schnellbuchung,
// Seitenleiste in Bereichen.
const api = vi.hoisted(() => ({
  finBuchen: vi.fn(async () => ({ id: "b9", jahr: 2027, nr: 9 })),
  finStornieren: vi.fn(), finMonatFestschreiben: vi.fn(), finKontoAnlegen: vi.fn(), finKontoAktiv: vi.fn(),
}));
vi.mock("@/lib/api/finance", () => api);
const download = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/download", () => download);

import { FinanceJournalArbeitsplatz } from "@/components/finance/FinanceJournalArbeitsplatz";
import { KontoFeld } from "@/components/finance/arbeitsplatz/KontoFeld";
import { BuchungNeu } from "@/components/finance/FinanceBuchungen";
import { FinanceNavigation } from "@/components/finance/FinanceNavigation";
import { FIN_NAV_ZU_MERKER, FINANCE_SEITEN } from "@/lib/finance/seiten";
import { NAV_ZU_MERKER } from "@/lib/navGruppen";
import { finVorgabe } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinKonto, FinSteuerschluessel, FinZeile } from "@/lib/finance/buchung";

const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand"): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(1400, "Forderungen", "forderung"), k(1776, "Umsatzsteuer 19 %", "steuer"),
  k(4530, "Laufende Kfz-Betriebskosten"), k(4540, "Kfz-Reparaturen"), k(8400, "Erlöse 19 %", "erloes")];
const SCHL: FinSteuerschluessel[] = [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "Umsatzsteuer 19 %", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }];
const z = (seite: "S" | "H", konto: number, betrag: number): FinZeile => ({ posten: 1, seite, konto, betrag, ist_steuer: false, steuerschluessel: null });
const b = (nr: number, datum: string, text: string, s: number, h: number, betrag: number): FinBuchung => ({
  id: `b${nr}`, jahr: 2027, nr, datum, text, beleg: `BE-${nr}`, quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null,
  grund: null, erstellt_am: datum, fin_buchungszeilen: [z("S", s, betrag), z("H", h, betrag)],
});
const BUCHUNGEN = [b(1, "2027-01-08", "Tanken", 4530, 1200, 78.4), b(2, "2027-01-10", "Reifen verkauft", 1400, 8400, 1190),
  b(3, "2027-02-03", "Werkstatt", 4540, 1200, 300)];

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function journal(darfBuchen = true) {
  const onNeu = vi.fn(), onOeffnen = vi.fn();
  render(<FinanceJournalArbeitsplatz buchungen={BUCHUNGEN} konten={KONTEN} schluessel={SCHL} fest={[]} jahr={2027} laedt={false}
    darfBuchen={darfBuchen} onNeu={onNeu} onOeffnen={onOeffnen} />);
  return { onNeu, onOeffnen, tabelle: screen.getByRole("region", { name: "Journal 2027" }) };
}
const detailTitel = () => within(screen.getByRole("complementary", { name: "Gewählte Buchung" })).getByRole("heading").textContent;
const zeilenTexte = () => screen.getAllByRole("row").filter((r) => r.dataset.key).map((r) => r.dataset.key);

describe("Journal am Rechner", () => {
  it("zeigt alle Buchungen, rechts die neueste, mit Saldo vor und nach", () => {
    journal();
    expect(zeilenTexte()).toEqual(["b1", "b2", "b3"]);
    expect(detailTitel()).toBe("Buchung 2027-3");
    expect(screen.getByText("Saldo 4540 vor der Buchung")).toBeTruthy();
    expect(screen.getByText("3 Buchungen")).toBeTruthy();
    expect(screen.getByText("1.568,40")).toBeTruthy();
  });

  it("Pfeiltasten wählen, Leertaste markiert, Enter öffnet", () => {
    const { onOeffnen, tabelle } = journal();
    fireEvent.keyDown(tabelle, { key: "Home" });
    expect(detailTitel()).toBe("Buchung 2027-1");
    fireEvent.keyDown(tabelle, { key: "ArrowDown" });
    expect(detailTitel()).toBe("Buchung 2027-2");
    fireEvent.keyDown(tabelle, { key: " " });
    expect(screen.getByText("1 markiert")).toBeTruthy();
    fireEvent.keyDown(tabelle, { key: "Enter" });
    expect(onOeffnen).toHaveBeenCalledWith(BUCHUNGEN[1]);
    fireEvent.click(screen.getByRole("button", { name: "Markierte als CSV" }));
    expect(download.dateiHerunterladen).toHaveBeenCalledWith("journal_2027.csv", expect.stringContaining("Reifen verkauft"), "text/csv;charset=utf-8");
    expect(download.dateiHerunterladen.mock.calls[0][1]).not.toContain("Tanken");
  });

  it("Spaltenkopf sortiert, zweiter Klick dreht um", () => {
    journal();
    fireEvent.click(screen.getByRole("button", { name: "Umsatz" }));
    expect(zeilenTexte()).toEqual(["b1", "b3", "b2"]);
    fireEvent.click(screen.getByRole("button", { name: /Umsatz/ }));
    expect(zeilenTexte()).toEqual(["b2", "b3", "b1"]);
  });

  it("Filter: Zeitraum, Zustand, Suche; F3 nur das Konto der Zeile; zurücksetzen", () => {
    journal();
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "2" } });
    expect(zeilenTexte()).toEqual(["b3"]);
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "0" } });
    fireEvent.click(screen.getAllByRole("row").find((r) => r.dataset.key === "b1")!);
    fireEvent.keyDown(window, { key: "F3" });
    expect(zeilenTexte()).toEqual(["b1"]);
    expect((screen.getByLabelText("Nur Buchungen mit Konto") as HTMLInputElement).value).toBe("4530");
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(zeilenTexte()).toEqual(["b1", "b2", "b3"]);
    fireEvent.change(screen.getByLabelText("Journal durchsuchen"), { target: { value: "1.190" } });
    expect(zeilenTexte()).toEqual(["b2"]);
  });

  it("F2 springt in die Suche, N öffnet die Schnellbuchung – aber nicht beim Tippen und nicht ohne Recht", () => {
    const { onNeu } = journal();
    fireEvent.keyDown(window, { key: "F2" });
    expect(document.activeElement).toBe(screen.getByLabelText("Journal durchsuchen"));
    fireEvent.keyDown(screen.getByLabelText("Journal durchsuchen"), { key: "n" });
    expect(onNeu).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onNeu).toHaveBeenCalledTimes(1);
    cleanup();
    const ohne = journal(false);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(ohne.onNeu).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Schnellbuchung/ })).toBeNull();
  });

  it("Spalten lassen sich ausblenden", () => {
    journal();
    expect(screen.getByRole("button", { name: "Beleg" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Sichtbare Spalten" })).getByLabelText("Beleg"));
    expect(screen.queryByRole("button", { name: "Beleg" })).toBeNull();
  });
});

describe("Kontofeld", () => {
  function feld() {
    const onWert = vi.fn();
    render(<KontoFeld konten={KONTEN} wert={null} onWert={onWert} label="Konto" />);
    return { onWert, input: screen.getByLabelText("Konto") as HTMLInputElement };
  }
  it("Name tippen, ↓ und Enter nimmt den Vorschlag", () => {
    const { onWert, input } = feld();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "kfz" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["4540 Kfz-Reparaturen", "4530 Laufende Kfz-Betriebskosten"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onWert).toHaveBeenLastCalledWith(4530);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("Tab nimmt den hellen Vorschlag, das Verlassen überschreibt ihn nicht", () => {
    const { onWert, input } = feld();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "kfz" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.blur(input);
    expect(onWert).toHaveBeenLastCalledWith(4540);
  });
  it("volle Nummer gilt sofort; Mehrdeutiges wird beim Verlassen rot", () => {
    const { onWert, input } = feld();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1200" } });
    expect(onWert).toHaveBeenLastCalledWith(1200);
    fireEvent.change(input, { target: { value: "kfz" } });
    fireEvent.blur(input);
    expect(onWert).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("kein eindeutiges Konto")).toBeTruthy();
  });
});

describe("Schnellbuchung am Rechner", () => {
  it("Konten per Nummer, Betrag mit Komma, Strg+Enter bucht", async () => {
    const onGebucht = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <BuchungNeu supabase={{} as SupabaseClient} heute="2027-01-15" jahr={2027} einstellungen={finVorgabe(2027, "2027-01-15")}
        konten={KONTEN} schluessel={SCHL} tastatur onGebucht={onGebucht} onClose={() => {}} />
    </QueryClientProvider>);
    expect(screen.getByText("Schnellbuchung")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Was ist passiert?"));
    fireEvent.change(screen.getByPlaceholderText("Was ist passiert?"), { target: { value: "Rechnung RE-1" } });
    const soll = screen.getByLabelText("Soll-Konto Posten 1");
    fireEvent.change(soll, { target: { value: "1400" } });
    fireEvent.change(screen.getByLabelText("Haben-Konto Posten 1"), { target: { value: "erl" } });
    fireEvent.focus(screen.getByLabelText("Haben-Konto Posten 1"));
    fireEvent.keyDown(screen.getByLabelText("Haben-Konto Posten 1"), { key: "Enter" });
    const betrag = screen.getByLabelText("Betrag Posten 1") as HTMLInputElement;
    fireEvent.change(betrag, { target: { value: "1190" } });
    fireEvent.blur(betrag);
    expect(betrag.value).toBe("1.190,00");
    await act(async () => { fireEvent.keyDown(betrag, { key: "Enter", ctrlKey: true }); });
    expect(api.finBuchen).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      text: "Rechnung RE-1", posten: [{ soll: 1400, haben: 8400, betrag: 1190, steuer: null }],
    }));
    expect(onGebucht).toHaveBeenCalledWith(9);
  });
});

describe("Finance-Seitenleiste", () => {
  it("Bereiche klappen mit eigenem Merker, getrennt von FSM", () => {
    const onSeite = vi.fn();
    render(<FinanceNavigation seiten={FINANCE_SEITEN} aktiv="uebersicht" onSeite={onSeite} />);
    const kopf = screen.getAllByRole("button").find((x) => x.classList.contains("nav-gruppe-kopf") && x.textContent?.startsWith("Buchführung"))!;
    fireEvent.click(kopf);
    expect(screen.queryByText("Buchungen")).toBeNull();
    expect(JSON.parse(localStorage.getItem(FIN_NAV_ZU_MERKER) || "[]")).toEqual(["Buchführung"]);
    expect(localStorage.getItem(NAV_ZU_MERKER)).toBeNull();
    fireEvent.click(screen.getByText("Belege"));
    expect(onSeite).toHaveBeenCalledWith("belege");
  });
});

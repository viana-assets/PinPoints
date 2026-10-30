// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// Personenkonten (Migration 110, v184): Liste am Rechner, Kontoblatt mit offenen Posten, Karten am Handy.
const download = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/download", () => download);

import { FinancePersonenkonten } from "@/components/finance/FinancePersonenkonten";
import type { FinBuchung, FinZeile } from "@/lib/finance/buchung";
import type { FinPersonenkonto } from "@/lib/finance/personen";

let id = 0;
const z = (seite: "S" | "H", konto: number, betrag: number, personenkonto: number | null = null): FinZeile =>
  ({ id: ++id, posten: 1, seite, konto, betrag, steuerschluessel: null, ist_steuer: false, personenkonto });
const b = (nr: number, datum: string, beleg: string, zeilen: FinZeile[]): FinBuchung => ({ id: `b${nr}`, jahr: 2027, nr, datum, text: `Rechnung ${beleg}`, beleg,
  quelle: "rechnung", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x", fin_buchungszeilen: zeilen });
const B = [b(1, "2027-01-10", "RE1", [z("S", 1400, 119, 10000), z("H", 8400, 119)]), b(2, "2027-01-12", "RE2", [z("S", 1400, 59.5, 69999), z("H", 8400, 59.5)]),
  b(3, "2027-01-20", "RE1", [z("S", 1200, 100), z("H", 1400, 100, 10000)])];
const P: FinPersonenkonto[] = [
  { nummer: 10000, art: "debitor", sammel: false, name: "Anna Kunde", kundennummer: 10000, customer_id: "c1", lieferant_id: null, anschrift: "Weg 1", ust_id: null, vortrag: 0 },
  { nummer: 69999, art: "debitor", sammel: true, name: "Sammeldebitor Laufkundschaft", kundennummer: null, customer_id: null, lieferant_id: null, anschrift: null, ust_id: null, vortrag: 0 },
  { nummer: 70000, art: "kreditor", sammel: false, name: "Reifen GmbH", kundennummer: null, customer_id: null, lieferant_id: "l1", anschrift: null, ust_id: null, vortrag: -50 },
];
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const zeilen = (name: string) => within(screen.getByRole("region", { name })).getAllByRole("row").filter((r) => r.dataset.key);

function zeigen(amRechner: boolean) {
  const onOeffnen = vi.fn();
  render(<FinancePersonenkonten personen={P} buchungen={B} fest={[]} jahr={2027} heute="2027-02-11" laedt={false} fehlt={false} amRechner={amRechner} onOeffnen={onOeffnen} />);
  return { onOeffnen };
}

describe("Personenkonten am Rechner", () => {
  it("Liste mit Saldo, Filter, offene Posten in der Detailspalte", () => {
    zeigen(true);
    expect(zeilen("Personenkonten").map((r) => within(r).getAllByRole("cell").slice(1).map((c) => c.textContent)[7])).toEqual(["19,00 S", "59,50 S", "50,00 H"]);
    expect(screen.getByText(/3 Konten/).parentElement?.textContent).toMatch(/Saldo 28,50 S/);
    const aside = screen.getByRole("complementary", { name: "Gewähltes Personenkonto" });
    expect(within(aside).getByText("Anna Kunde")).toBeTruthy();
    expect(within(aside).getByText("RE1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Art"), { target: { value: "kreditor" } });
    expect(zeilen("Personenkonten").map((r) => r.dataset.key)).toEqual(["70000"]);
  });
  it("Enter öffnet das Kontoblatt mit offenen Posten; Zurück", () => {
    const { onOeffnen } = zeigen(true);
    const t = screen.getByRole("region", { name: "Personenkonten" });
    fireEvent.keyDown(t, { key: "Home" });
    fireEvent.keyDown(t, { key: "Enter" });
    expect(zeilen("Personenkonto 10000").map((r) => r.dataset.key)).toEqual(["b1:1", "b3:6"]);
    expect(zeilen("Offene Posten 10000").map((r) => within(r).getAllByRole("cell").slice(1).map((c) => c.textContent)[5])).toEqual(["19,00 S"]);
    const op = screen.getByRole("region", { name: "Offene Posten 10000" });
    fireEvent.keyDown(op, { key: "Home" });
    fireEvent.keyDown(op, { key: "Enter" });
    expect(onOeffnen).toHaveBeenCalledWith(B[0]);
    fireEvent.click(screen.getByRole("button", { name: "← Personenkonten" }));
    expect(screen.getByRole("region", { name: "Personenkonten" })).toBeTruthy();
  });
  it("Liste als CSV", () => {
    zeigen(true);
    fireEvent.click(screen.getByRole("button", { name: "Liste als CSV" }));
    expect(download.dateiHerunterladen).toHaveBeenCalledWith("personenkonten_2027.csv", expect.stringContaining("10000;Debitor;Anna Kunde;10000;Weg 1;"), "text/csv;charset=utf-8");
  });
});

describe("Personenkonten am Handy", () => {
  it("Karten mit Saldo, Antippen zeigt offene Posten", () => {
    zeigen(false);
    expect(screen.getByRole("button", { name: "70000 Reifen GmbH" }).textContent).toMatch(/50,00 H/);
    fireEvent.click(screen.getByRole("button", { name: "10000 Anna Kunde" }));
    const d = screen.getByRole("dialog");
    expect(within(d).getByText("RE1")).toBeTruthy();
    expect(within(d).getByText("32")).toBeTruthy();
  });
});

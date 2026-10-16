// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ArticleAssignPanel, MengeFeld } from "@/components/auftraege/ArticleAssignPanel";
import type { Article, OrderArticle } from "@/lib/types";

// v159 (Wunsch Vitali 16.10.2026): eine neue Leistung steht gleich offen; das Mengenfeld markiert beim
// Antippen, darf beim Tippen leer sein und überschreibt statt anzuhängen.
afterEach(() => cleanup());
const artikel = { id: "a1", article_number: 10, short_name: "Reifenwechsel mobil", long_name: "", active: true, einheit: "Stück" } as unknown as Article;
const zeile = (id: string, menge = 1) => ({ id, order_id: "o1", article_id: "a1", quantity: menge, net_price: 50, vat_rate: 19, endpreis_netto: null, note: null,
  created_at: "", deleted_at: null, lager_satz_id: null, verkaufsreifen_id: null }) as unknown as OrderArticle;

function Gefaess({ start, onQty }: { start: OrderArticle[]; onQty: (id: string, n: number) => void }) {
  const [rows, setRows] = useState(start);
  return (
    <ArticleAssignPanel orderId="o1" articles={[artikel]} articlePrices={[]} rows={rows} rechnungNoetig={false}
      onAdd={async () => { setRows((r) => [...r, zeile("neu")]); }}
      onUpdateQty={async (id, n) => { onQty(id, n); setRows((r) => r.map((x) => (x.id === id ? { ...x, quantity: n } : x))); }}
      onUpdateEndpreis={async () => {}} onUpdateText={async () => {}} onRemove={async () => {}} />
  );
}

describe("Leistungen", () => {
  it("die eben hinzugefügte Leistung steht offen, die vorhandene nicht; Fertig klappt zu", async () => {
    render(<Gefaess start={[zeile("alt")]} onQty={() => {}} />);
    expect(screen.queryByLabelText("Menge")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Leistung hinzufügen" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Leistung hinzufügen" })).getByRole("button", { name: /Reifenwechsel mobil/ }));
    expect(await screen.findByLabelText("Menge")).toBeTruthy();
    expect(screen.getAllByLabelText("Menge")).toHaveLength(1);
    const knoepfe = screen.getAllByRole("button", { name: /Reifenwechsel mobil/ });
    expect(knoepfe.map((k) => k.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(screen.queryByLabelText("Menge")).toBeNull();
  });

  it("Menge: markiert beim Antippen, leer erlaubt, 5 statt 15; leer beim Verlassen zurück auf den Wert", () => {
    const onWert = vi.fn();
    render(<MengeFeld wert={1} onWert={onWert} />);
    const feld = screen.getByLabelText("Menge") as HTMLInputElement;
    fireEvent.focus(feld);
    expect([feld.selectionStart, feld.selectionEnd]).toEqual([0, 1]);
    fireEvent.change(feld, { target: { value: "" } });
    expect(feld.value).toBe("");
    expect(onWert).not.toHaveBeenCalled();
    fireEvent.change(feld, { target: { value: "5" } });
    expect(onWert).toHaveBeenCalledWith(5);
    fireEvent.change(feld, { target: { value: "0" } });
    fireEvent.change(feld, { target: { value: "" } });
    fireEvent.blur(feld);
    expect(feld.value).toBe("1");
    expect(onWert).toHaveBeenCalledTimes(1);
  });
});

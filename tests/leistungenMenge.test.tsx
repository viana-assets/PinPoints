// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ArticleAssignPanel, MengeFeld, PreisFeld } from "@/components/auftraege/ArticleAssignPanel";
import type { Article, OrderArticle } from "@/lib/types";

// v160 (Wunsch Vitali 16.10.2026): eine neue Leistung steht gleich offen; das Mengenfeld markiert beim
// Antippen, darf beim Tippen leer sein und überschreibt statt anzuhängen. v163: Menge und Endpreis speichern
// beim Verlassen – schnelles Tippen verliert keine Ziffer mehr.
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

  it("Menge: markiert beim Antippen, leer erlaubt, 5 statt 15; gespeichert erst beim Verlassen", () => {
    const onWert = vi.fn();
    render(<MengeFeld wert={1} onWert={onWert} />);
    const feld = screen.getByLabelText("Menge") as HTMLInputElement;
    fireEvent.focus(feld);
    expect([feld.selectionStart, feld.selectionEnd]).toEqual([0, 1]);
    fireEvent.change(feld, { target: { value: "" } });
    expect(feld.value).toBe("");
    fireEvent.change(feld, { target: { value: "5" } });
    expect(onWert).not.toHaveBeenCalled();
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenCalledWith(5);
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "" } });
    fireEvent.blur(feld);
    expect(feld.value).toBe("1");
    expect(onWert).toHaveBeenCalledTimes(1);
  });

  it("Endpreis: schnelles Tippen bleibt stehen, auch wenn der gespeicherte Wert dazwischenkommt; leer = kein Sonderpreis", () => {
    const onWert = vi.fn();
    const { rerender } = render(<PreisFeld wert={null} onWert={onWert} placeholder="50.00" />);
    const feld = screen.getByLabelText("Endpreis netto") as HTMLInputElement;
    expect(feld.placeholder).toBe("50,00");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "6" } });
    rerender(<PreisFeld wert={6} onWert={onWert} placeholder="50.00" />); // eine verspätete Antwort von außen
    fireEvent.change(feld, { target: { value: "65" } });
    expect(feld.value).toBe("65");
    expect(onWert).not.toHaveBeenCalled();
    fireEvent.keyDown(feld, { key: "Enter" });
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenLastCalledWith(65);
    rerender(<PreisFeld wert={65} onWert={onWert} />);
    expect(feld.value).toBe("65");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "44,904" } });
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenLastCalledWith(44.9);
    rerender(<PreisFeld wert={44.9} onWert={onWert} />);
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "" } });
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenLastCalledWith(null);
  });
});

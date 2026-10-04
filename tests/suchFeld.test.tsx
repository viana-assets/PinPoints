// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuchFeld } from "@/components/SuchFeld";

// Suchfeld mit eigenem × (v110): Safari am iPhone zeigt im Suchfeld keins.
describe("SuchFeld", () => {
  afterEach(cleanup);
  it("zeigt das × erst, wenn etwas drinsteht", () => {
    const { rerender } = render(<SuchFeld value="" onWert={() => {}} placeholder="" ariaLabel="Kunde suchen" />);
    expect(screen.queryByLabelText("Suche leeren")).toBeNull();
    rerender(<SuchFeld value="Mül" onWert={() => {}} placeholder="" ariaLabel="Kunde suchen" />);
    expect(screen.getByLabelText("Suche leeren")).toBeTruthy();
  });
  it("leert die Suche mit einem Tipp und lässt den Cursor im Feld", () => {
    const onWert = vi.fn();
    render(<SuchFeld value="Mül" onWert={onWert} placeholder="" ariaLabel="Kunde suchen" />);
    fireEvent.click(screen.getByLabelText("Suche leeren"));
    expect(onWert).toHaveBeenCalledWith("");
    expect(document.activeElement).toBe(screen.getByLabelText("Kunde suchen"));
  });
  it("meldet die Eingabe weiter", () => {
    const onWert = vi.fn();
    render(<SuchFeld value="" onWert={onWert} placeholder="" ariaLabel="Kunde suchen" />);
    fireEvent.change(screen.getByLabelText("Kunde suchen"), { target: { value: "Ber" } });
    expect(onWert).toHaveBeenCalledWith("Ber");
  });
});

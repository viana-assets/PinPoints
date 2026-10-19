// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ZeitFeld } from "@/components/ZeitFeld";

// v168: Das Zeitfeld nimmt Getipptes beim Verlassen und Gewähltes aus der Liste.
afterEach(() => cleanup());
describe("ZeitFeld", () => {
  it("tippen und verlassen übernimmt", () => {
    const onWert = vi.fn();
    render(<ZeitFeld wert="" onWert={onWert} ariaLabel="Von" />);
    const feld = screen.getByLabelText("Von");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "1030" } });
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenCalledWith("10:30");
  });
  it("Unsinn bleibt beim alten Wert", () => {
    const onWert = vi.fn();
    render(<ZeitFeld wert="08:00" onWert={onWert} ariaLabel="Von" />);
    const feld = screen.getByLabelText("Von") as HTMLInputElement;
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "99" } });
    fireEvent.blur(feld);
    expect(onWert).not.toHaveBeenCalled();
    expect(feld.value).toBe("08:00");
  });
  it("aus der Liste wählen", () => {
    const onWert = vi.fn();
    render(<ZeitFeld wert="" onWert={onWert} ariaLabel="Von" />);
    fireEvent.focus(screen.getByLabelText("Von"));
    fireEvent.click(screen.getByRole("option", { name: "14:15" }));
    expect(onWert).toHaveBeenCalledWith("14:15");
  });
  it("Wahl aus der Liste wird vom folgenden Verlassen nicht überschrieben", () => {
    const onWert = vi.fn();
    render(<ZeitFeld wert="09:00" onWert={onWert} ariaLabel="Von" />);
    const feld = screen.getByLabelText("Von");
    fireEvent.focus(feld);
    fireEvent.click(screen.getByRole("option", { name: "11:30" }));
    fireEvent.blur(feld);
    expect(onWert).toHaveBeenCalledTimes(1);
    expect(onWert).toHaveBeenLastCalledWith("11:30");
  });
  it("Pfeiltaste und Enter", () => {
    const onWert = vi.fn();
    render(<ZeitFeld wert="09:00" onWert={onWert} ariaLabel="Von" />);
    const feld = screen.getByLabelText("Von");
    fireEvent.focus(feld);
    fireEvent.keyDown(feld, { key: "ArrowDown" });
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(onWert).toHaveBeenCalledWith("09:15");
  });
  it("bis-Feld: Liste nach dem Beginn mit Dauer", () => {
    render(<ZeitFeld wert="" onWert={vi.fn()} ab="10:00" ariaLabel="Bis" />);
    fireEvent.focus(screen.getByLabelText("Bis"));
    const erste = screen.getAllByRole("option")[0];
    expect(erste.textContent).toBe("10:1515 Min.");
  });
});

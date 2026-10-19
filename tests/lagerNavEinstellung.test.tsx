// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Warehouse } from "@/lib/types";
import { LagerNavEinstellung } from "@/components/admin/LagerNavEinstellung";

// v169: Einstellungen › Navigation.
const w = (id: string, name: string, address: string | null): Warehouse => ({ id, name, address, note: "n", created_at: "" });
const L = [w("a", "Container", null), w("c", "Hauptlager", "Hofweg 1, 90000 Ort")];
afterEach(() => cleanup());

describe("LagerNavEinstellung", () => {
  it("Automatisch nennt das Hauptlager, Wahl wird gemeldet", () => {
    const waehlen = vi.fn();
    render(<LagerNavEinstellung lager={L} gewaehltId={null} onWaehlen={waehlen} />);
    expect(screen.getByRole("option", { name: "Automatisch (Hauptlager)" })).toBeTruthy();
    expect(screen.getByText("Hofweg 1, 90000 Ort")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Lager für die Navigation"), { target: { value: "a" } });
    expect(waehlen).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });
  it("ohne Adresse ein Hinweis; mit Recht Name und Adresse bearbeiten", async () => {
    const speichern = vi.fn(async () => {});
    render(<LagerNavEinstellung lager={L} gewaehltId="a" onWaehlen={vi.fn()} onSpeichern={speichern} />);
    expect(screen.getByText(/Keine Adresse hinterlegt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Adresse"), { target: { value: " Am Hafen 2, 90000 Ort " } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await vi.waitFor(() => expect(speichern).toHaveBeenCalledWith("a", { name: "Container", address: "Am Hafen 2, 90000 Ort", note: "n" }));
  });
  it("ohne Lager ein Hinweis", () => {
    render(<LagerNavEinstellung lager={[]} gewaehltId={null} onWaehlen={vi.fn()} />);
    expect(screen.getByText(/Noch kein Lager angelegt/)).toBeTruthy();
  });
});

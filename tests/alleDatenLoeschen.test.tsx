// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Komponententest (v117): „Alle Daten löschen“ unter Admin › Wartung. Die eigentliche Prüfung
// (nur Superadmin, nur mit dem Wort) steht in der Datenbank (Migration 72); hier geht es darum,
// dass der Knopf erst mit genau dem Wort scharf wird und dass die Übersicht stimmt.
const api = vi.hoisted(() => ({
  alleDatenUmfang: vi.fn(),
  alleDatenSicherung: vi.fn(async () => "{}"),
  alleDatenLoeschen: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/alleDaten", () => api);
vi.mock("@/app/providers", () => ({ datenSpeicherLeeren: vi.fn(async () => {}) }));
vi.mock("@/lib/offline/speicher", () => ({ ausgangLeeren: vi.fn(async () => {}) }));

import { AlleDatenLoeschen } from "@/components/admin/AlleDatenLoeschen";

const supabase = {} as SupabaseClient;
const umfang = (rechnungen_echt = 0) => ({
  tabellen: { customers: 12, orders: 30, rechnungen: 4, order_items: 55 },
  zugaenge_weg: 3, zugaenge_bleiben: 2, belege: 7, rechnungen_echt,
});

beforeEach(() => {
  api.alleDatenUmfang.mockReset();
  api.alleDatenLoeschen.mockClear();
});
afterEach(cleanup);

async function oeffnen(r = 0) {
  api.alleDatenUmfang.mockResolvedValue(umfang(r));
  render(<AlleDatenLoeschen supabase={supabase} />);
  fireEvent.click(screen.getByRole("button", { name: "Alle Daten löschen …" }));
  await screen.findByText("Gelöscht werden:");
}

describe("AlleDatenLoeschen", () => {
  it("zeigt, was gelöscht wird und was bleibt", async () => {
    await oeffnen();
    expect(screen.getByText(/Kunden$/).textContent).toContain("12");
    expect(screen.getByText(/Fotos und Unterschriften/).textContent).toContain("7");
    expect(screen.getByText(/weitere Einträge/).textContent).toContain("55");
    expect(screen.getByText(/Zugänge von Technikern und Nutzern/).textContent).toContain("3");
    expect(screen.getByText(/Es bleiben 2 Zugänge/)).toBeTruthy();
    expect(screen.queryByText(/Aufbewahrungspflicht/)).toBeNull();
  });

  it("warnt bei ausgestellten Rechnungen", async () => {
    await oeffnen(4);
    expect(screen.getByText(/Aufbewahrungspflicht/)).toBeTruthy();
  });

  it("löscht erst mit genau dem Wort „löschen“", async () => {
    await oeffnen();
    const knopf = screen.getByRole("button", { name: "Alle Daten endgültig löschen" }) as HTMLButtonElement;
    const feld = screen.getByLabelText(/eintippen/);
    expect(knopf.disabled).toBe(true);
    for (const falsch of ["Löschen", "LÖSCHEN", "loeschen", "lösch"]) {
      fireEvent.change(feld, { target: { value: falsch } });
      expect(knopf.disabled).toBe(true);
    }
    fireEvent.change(feld, { target: { value: "löschen" } });
    expect(knopf.disabled).toBe(false);
    const ersetzen = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, replace: ersetzen } });
    fireEvent.click(knopf);
    await waitFor(() => expect(ersetzen).toHaveBeenCalledWith("/"));
    expect(api.alleDatenLoeschen).toHaveBeenCalledWith(supabase, "löschen", expect.any(Function));
  });

  it("Abbrechen schließt ohne zu löschen", async () => {
    await oeffnen();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("button", { name: "Alle Daten löschen …" })).toBeTruthy();
    expect(api.alleDatenLoeschen).not.toHaveBeenCalled();
  });
});

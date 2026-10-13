// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

// „Alle Daten sichern“ (v143): eigener Knopf unter Admin › Wartung, ohne zu löschen.
const api = vi.hoisted(() => ({ alleDatenSicherung: vi.fn(async () => '{"tabellen":{}}') }));
const dl = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/api/alleDaten", () => api);
vi.mock("@/lib/download", () => dl);

import { AlleDatenSichern } from "@/components/admin/AlleDatenSichern";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AlleDatenSichern", () => {
  it("lädt die Sicherung als JSON herunter und nennt Datei und Größe", async () => {
    render(<AlleDatenSichern supabase={supabase} />);
    fireEvent.click(screen.getByRole("button", { name: "Sicherung herunterladen" }));
    expect(await screen.findByText(/Gespeichert: MR-Sicherung-\d{4}-\d{2}-\d{2}\.json · 0 MB/)).toBeTruthy();
    expect(api.alleDatenSicherung).toHaveBeenCalledWith(supabase);
    expect(dl.dateiHerunterladen).toHaveBeenCalledWith(expect.stringMatching(/^MR-Sicherung-.*\.json$/), '{"tabellen":{}}', "application/json;charset=utf-8");
  });

  it("zeigt den Fehler der Datenbank", async () => {
    api.alleDatenSicherung.mockRejectedValueOnce(new Error("Die Sicherung aller Daten erstellt nur der Superadmin."));
    render(<AlleDatenSichern supabase={supabase} />);
    fireEvent.click(screen.getByRole("button", { name: "Sicherung herunterladen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/nur der Superadmin/);
    expect(dl.dateiHerunterladen).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, Customer, Employee, Order, OrderArticle, StorageSlot, TireStorage, Warehouse } from "@/lib/types";

// Packliste als eigene Seite (v171): Tage, Haken „eingeladen“ (derselbe wie im Dashboard), Gesamtansicht.
const api = vi.hoisted(() => ({
  fetchAuftragFahrzeuge: vi.fn(async () => []),
  fetchGepackt: vi.fn(async () => []),
  setzeGepackt: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/auftragFahrzeuge", () => ({ fetchAuftragFahrzeuge: api.fetchAuftragFahrzeuge }));
vi.mock("@/lib/api/mitnehmen", () => ({ fetchGepackt: api.fetchGepackt, setzeGepackt: api.setzeGepackt }));

import { PacklistePanel } from "@/components/packliste/PacklistePanel";

const auftrag = (id: string, kunde: string, datum: string, time: string) =>
  ({ id, customer_id: kunde, order_date: datum, time, status: "offen", deleted_at: null, order_number: 1, title: "Termin" }) as unknown as Order;
const kunde = (id: string, name: string) => ({ id, name }) as unknown as Customer;
const satz = (id: string, customer_id: string, slot: string) =>
  ({ id, customer_id, storage_slot_id: slot, vehicle_id: null, order_id: null, removed_at: null, saison: "winter", created_at: "2026-01-01" }) as unknown as TireStorage;
const supabase = {} as SupabaseClient;

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 26, 10, 0)); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

function zeigen(darfLager = true) {
  const employees = [{ id: "e1", name: "Roman", profile_id: "p1" }, { id: "e2", name: "Paul", profile_id: "p2" }] as unknown as Employee[];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PacklistePanel
        supabase={supabase}
        orders={[auftrag("o1", "k1", "2026-10-26", "09:00"), auftrag("o2", "k2", "2026-11-03", "11:00")]}
        orderEmployees={{ o1: ["e1"], o2: ["e2"] }}
        customers={[kunde("k1", "Huber"), kunde("k2", "Wagner")]}
        employees={employees}
        filterMitarbeiter={employees}
        tireStorages={[satz("s1", "k1", "pl10"), satz("s2", "k2", "pl2")]}
        storageSlots={[{ id: "pl10", code: "BC-10", warehouse_id: "w1" }, { id: "pl2", code: "BC-2", warehouse_id: "w1" }] as unknown as StorageSlot[]}
        warehouses={[{ id: "w1", name: "Hauptlager" }] as unknown as Warehouse[]}
        vehicles={[]}
        orderArticles={[{ id: "a1", order_id: "o1", article_id: "w", quantity: 1, deleted_at: null }] as unknown as OrderArticle[]}
        articles={[{ id: "w", short_name: "Räderwechsel" }] as unknown as Article[]}
        verkaufsreifen={[]}
        darfLager={darfLager}
        lagerLaedt={false}
        isTechniker={false}
        onOpenOrder={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("PacklistePanel", () => {
  it("zeigt die Tage des Zeitraums, heute aufgeklappt, mit Kalenderwochen", async () => {
    zeigen();
    expect(await screen.findByText("Montag, 26.10.")).toBeTruthy();
    expect(screen.getByText("Dienstag, 03.11.")).toBeTruthy();
    expect(screen.getByText("KW 44")).toBeTruthy();
    expect(screen.getByText("KW 45")).toBeTruthy();
    expect(screen.getAllByText("Aus dem Lager mitnehmen")).toHaveLength(2);
    expect(screen.getByText("BC-10")).toBeTruthy();
  });

  it("der Haken schreibt denselben Eintrag wie im Dashboard", async () => {
    zeigen();
    await screen.findByText("Montag, 26.10.");
    const zeile = screen.getAllByRole("button", { name: /09:00 · Huber/ }).find((b) => b.hasAttribute("aria-pressed"))!;
    fireEvent.click(zeile);
    await waitFor(() => expect(api.setzeGepackt).toHaveBeenCalledWith(supabase, "s1", "2026-10-26", true));
  });

  it("filtert nach Mitarbeiter und zeigt die Gesamtansicht nach Platz", async () => {
    zeigen();
    await screen.findByText("Montag, 26.10.");
    fireEvent.click(screen.getByRole("button", { name: "Gesamt" }));
    const plaetze = screen.getAllByText(/^BC-\d+$/).map((e) => e.textContent);
    expect(plaetze).toEqual(["BC-2", "BC-10"]);
    fireEvent.click(screen.getByRole("button", { name: /Paul/ }));
    expect(screen.getAllByText(/^BC-\d+$/).map((e) => e.textContent)).toEqual(["BC-2"]);
  });

  it("ohne Lagerrecht keine Sätze und keine Lagervorbereitung", async () => {
    zeigen(false);
    await screen.findByText("Montag, 26.10.");
    expect(screen.queryByText("Aus dem Lager mitnehmen")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gesamt" }));
    expect(screen.queryByText("Im Lager vorbereiten")).toBeNull();
    expect(screen.getByText("Reifengrößen je Woche")).toBeTruthy();
  });
});

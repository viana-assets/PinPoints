// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Komponententest (C6, v106): Endgültiges Löschen im Papierkorb räumt auch die Bilddateien (E3) ab –
// in der richtigen Reihenfolge: Pfade VOR dem Löschen holen (danach gibt es die Zeilen nicht mehr),
// Dateien NACH dem Löschen entfernen (lehnt die Datenbank ab, sollen die Bilder noch da sein).

const ablauf: string[] = [];
const zustand = { rpcFehler: null as string | null, dateiFehler: false };

vi.mock("@/lib/api/customers", () => ({
  fetchPapierkorb: vi.fn(async () => [{
    id: "k1", name: "Petra Beispiel", company: null, address: "Ring 2, 90763 Fürth", kundennummer: 10042,
    laufkundschaft: false, testkunde: false, deleted_at: "2026-10-01T10:00:00Z",
  }]),
  kundeWiederherstellen: vi.fn(),
  testkundeLoeschen: vi.fn(),
  kundeEndgueltigLoeschen: vi.fn(async () => {
    ablauf.push("rpc");
    if (zustand.rpcFehler) throw new Error(zustand.rpcFehler);
    return { kundennummer: 10042, auftraege: 2, fahrzeuge: 1, protokolleintraege: 9, rechnungen_bleiben: 0 };
  }),
}));
vi.mock("@/lib/api/belege", () => ({
  belegPfadeFuerKunde: vi.fn(async () => { ablauf.push("pfade"); return ["o1/vorher-a.jpg", "o1/unterschrift-b.png"]; }),
  belegDateienLoeschen: vi.fn(async (_s: unknown, pfade: string[]) => {
    ablauf.push(`dateien:${pfade.length}`);
    if (zustand.dateiFehler) throw new Error("x");
  }),
}));

import { PapierkorbPanel } from "@/components/admin/PapierkorbPanel";

beforeEach(() => { ablauf.length = 0; zustand.rpcFehler = null; zustand.dateiFehler = false; });
afterEach(cleanup);

async function endgueltigLoeschen() {
  render(<PapierkorbPanel supabase={{} as SupabaseClient} isSuperAdmin onKundenbestandGeaendert={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Endgültig löschen …" }));
  fireEvent.click(screen.getByRole("button", { name: "Ja, endgültig löschen" }));
}

describe("PapierkorbPanel – Bilder beim endgültigen Löschen", () => {
  it("Pfade holen → löschen → Dateien entfernen, und die Meldung sagt es", async () => {
    await endgueltigLoeschen();
    expect((await screen.findByRole("status")).textContent).toContain("2 Fotos/Unterschriften gelöscht.");
    expect(ablauf).toEqual(["pfade", "rpc", "dateien:2"]);
  });

  it("lehnt die Datenbank ab, bleiben die Bilder", async () => {
    zustand.rpcFehler = "Von diesem Kunden liegen noch Reifen im Regal. Erst auslagern, dann endgültig löschen.";
    await endgueltigLoeschen();
    expect((await screen.findByRole("alert")).textContent).toContain("Von diesem Kunden liegen noch Reifen im Regal.");
    expect(ablauf).toEqual(["pfade", "rpc"]);
  });

  it("scheitern nur die Dateien, steht es deutlich da", async () => {
    zustand.dateiFehler = true;
    await endgueltigLoeschen();
    expect((await screen.findByRole("status")).textContent).toMatch(/ACHTUNG: 2 Bilddateien konnten nicht .* entfernt werden/);
  });
});

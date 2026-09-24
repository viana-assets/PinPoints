import { describe, expect, it } from "vitest";
import { langlieger } from "@/lib/langlieger";

// Fahrplan E4: alle liegenden Sätze über X Monaten bzw. Y Euro.

function satz(id: string, created_at: string, felder: Record<string, unknown> = {}) {
  return {
    id, storage_slot_id: "p1", customer_id: "k1", vehicle_id: null, saison: "winter",
    erfassungsart: "sammel", anzahl_raeder: 4, dot_date: null, profiltiefe_mm: null, note: null,
    created_at, updated_at: created_at, removed_at: null, entnahme_order_id: null, order_id: null,
    ...felder,
  } as never;
}

const HEUTE = "2026-09-23";

describe("langlieger", () => {
  it("findet Sätze ab der Monatsschwelle und sortiert die ältesten nach vorn", () => {
    const r = langlieger(
      [satz("jung", "2026-03-01"), satz("alt", "2024-01-10"), satz("mittel", "2025-03-10")],
      HEUTE, null, 18, null
    );
    expect(r.map((z) => z.satz.id)).toEqual(["alt", "mittel"]);
    expect(r[0].monate).toBe(33);
  });

  it("findet auch einen jüngeren Satz, wenn die Summe die Euro-Schwelle reißt", () => {
    // 7 Monate × 25 € = 175 €
    const r = langlieger([satz("teuer", "2026-02-25")], HEUTE, 25, 18, 150);
    expect(r).toHaveLength(1);
    expect(r[0].summeNetto).toBe(175);
  });

  it("ohne gepflegten Preis zählt nur die Monatsschwelle", () => {
    const r = langlieger([satz("teuer", "2026-02-25")], HEUTE, null, 18, 150);
    expect(r).toEqual([]);
  });

  it("ausgelagerte Sätze gehören nicht dazu", () => {
    const r = langlieger([satz("weg", "2023-01-01", { removed_at: "2026-04-01" })], HEUTE, 8, 18, 150);
    expect(r).toEqual([]);
  });

  it("die Schwellen sind einstellbar", () => {
    const r = langlieger([satz("a", "2026-01-01")], HEUTE, 8, 6, null);
    expect(r).toHaveLength(1);
    expect(r[0].summeNetto).toBe(72);
  });
});

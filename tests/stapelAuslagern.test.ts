import { describe, expect, it } from "vitest";
import type { Order, StorageSlot, TireStorage, Warehouse } from "@/lib/types";
import { gebuehrVorschlag, stapelSchritte } from "@/lib/stapelAuslagern";

// Stapel-Auslagern (E7, v104).

const satz = (id: string, slot: string): TireStorage => ({ id, storage_slot_id: slot, created_at: "2026-04-10T08:00:00Z" } as TireStorage);
const auftrag = (id: string): Order => ({ id } as Order);
const plaetze = [
  { id: "p1", warehouse_id: "w2", code: "A-10" }, { id: "p2", warehouse_id: "w1", code: "B-02" },
  { id: "p3", warehouse_id: "w1", code: "A-9" }, { id: "p4", warehouse_id: "w1", code: "A-10" },
] as StorageSlot[];
const lager = [{ id: "w1", name: "Halle" }, { id: "w2", name: "Zuhause" }] as Warehouse[];

describe("stapelSchritte", () => {
  it("in der Reihenfolge des Regals: Lager, dann Platz (A-9 vor A-10)", () => {
    const s = stapelSchritte([
      { auftrag: auftrag("o1"), saetze: [satz("s1", "p1"), satz("s2", "p2")] },
      { auftrag: auftrag("o2"), saetze: [satz("s3", "p3"), satz("s4", "p4")] },
    ], plaetze, lager);
    expect(s.map((x) => x.platz?.code + "@" + x.lagerName)).toEqual(["A-9@Halle", "A-10@Halle", "B-02@Halle", "A-10@Zuhause"]);
    expect(s[0].auftrag.id).toBe("o2");
  });
  it("ein Satz ohne bekannten Platz steht am Ende", () => {
    const s = stapelSchritte([{ auftrag: auftrag("o1"), saetze: [satz("s9", "weg"), satz("s1", "p2")] }], plaetze, lager);
    expect(s.map((x) => x.satz.id)).toEqual(["s1", "s9"]);
  });
});

describe("gebuehrVorschlag", () => {
  it("angefangene Monate mal Preis", () => {
    expect(gebuehrVorschlag({ created_at: "2026-04-10T08:00:00Z" }, "2026-10-12", 9.5, false)).toEqual({ monate: 7, summe: 66.5, an: true, grund: null });
  });
  it("aus ohne Preis oder wenn schon gebucht", () => {
    expect(gebuehrVorschlag({ created_at: "2026-04-10" }, "2026-10-12", null, false).an).toBe(false);
    expect(gebuehrVorschlag({ created_at: "2026-04-10" }, "2026-10-12", 9.5, true).grund).toMatch(/schon/);
  });
});

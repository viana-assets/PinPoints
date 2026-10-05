import { describe, expect, it } from "vitest";
import { frueherEingelagert, istVorgemerkt, lagerBis, saetzeAusDemLager, satzZustand } from "@/lib/lagerVormerkung";
import type { TireStorage } from "@/lib/types";

function satz(teil: Partial<TireStorage>): TireStorage {
  return {
    id: "t1", storage_slot_id: "s1", customer_id: "c1", vehicle_id: null, saison: null,
    erfassungsart: "sammel", anzahl_raeder: 4, dot_date: null, profiltiefe_mm: null, note: null,
    created_at: "2026-04-01T08:00:00Z", updated_at: "2026-04-01T08:00:00Z",
    removed_at: null, entnahme_order_id: null, order_id: null, ...teil,
  };
}

// Auslagern erst beim Abschließen (Migration 67, v111).
describe("satzZustand", () => {
  it("unterscheidet im Regal, vorgemerkt und ausgelagert", () => {
    expect(satzZustand(satz({}))).toBe("im_regal");
    expect(satzZustand(satz({ entnahme_order_id: "o1" }))).toBe("vorgemerkt");
    expect(satzZustand(satz({ entnahme_order_id: "o1", removed_at: "2026-10-08T10:00:00Z" }))).toBe("ausgelagert");
    expect(satzZustand(satz({ removed_at: "2026-10-08T10:00:00Z" }))).toBe("ausgelagert");
    expect(istVorgemerkt(satz({ entnahme_order_id: "o1" }))).toBe(true);
  });
});

describe("lagerBis", () => {
  it("rechnet bis zum Termin, wenn er noch kommt, sonst bis heute", () => {
    expect(lagerBis("2026-10-01", { order_date: "2026-10-08" })).toBe("2026-10-08");
    expect(lagerBis("2026-10-05", { order_date: "2026-09-30" })).toBe("2026-10-05");
    expect(lagerBis("2026-10-05", null)).toBe("2026-10-05");
  });
});

describe("Sätze am Auftrag", () => {
  const liste = [
    satz({ id: "a", entnahme_order_id: "o1", created_at: "2026-04-02T00:00:00Z" }),
    satz({ id: "b", entnahme_order_id: "o1", removed_at: "2026-10-08T00:00:00Z", created_at: "2026-04-01T00:00:00Z" }),
    satz({ id: "c", entnahme_order_id: "o2" }),
    satz({ id: "d", order_id: "o1", removed_at: "2027-04-01T00:00:00Z" }),
    satz({ id: "e", order_id: "o1" }),
  ];
  it("zeigt, was mit dem Auftrag herausgeht oder herausging – vorgemerkt und ausgelagert", () => {
    expect(saetzeAusDemLager(liste, "o1").map((t) => t.id)).toEqual(["b", "a"]);
  });
  it("zeigt, was hier eingelagert und später wieder herausgegeben wurde", () => {
    expect(frueherEingelagert(liste, "o1").map((t) => t.id)).toEqual(["d"]);
  });
});

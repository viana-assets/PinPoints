import { describe, expect, it } from "vitest";
import type { Customer, Order, TireStorage } from "@/lib/types";
import { alsNaechstes, saisonBarometer, wochenUmsatz, zuErledigen } from "@/lib/dashboard";

// Das neue Dashboard (25.09.2026). Nur Rechnungen auf vorhandenen Beständen.

const HEUTE = "2026-09-25"; // ein Freitag
function auftrag(id: string, teil: Partial<Order> = {}): Order {
  return {
    id, order_number: 1, customer_id: "k1", title: "Termin", description: null, status: "offen",
    order_date: HEUTE, time: null, end_time: null, techniker_notiz: null, firmenfahrzeug_id: null,
    completed_at: null, completed_by: null, cancelled_at: null, deleted_at: null,
    rechnung_noetig: false, rechnung_erstellt_am: null, laufkunde_name: null, laufkunde_telefon: null, laufkunde_ort: null,
    ...teil,
  } as unknown as Order;
}
function kunde(id: string, teil: Partial<Customer> = {}): Customer {
  return { id, name: "Kunde " + id, address: "", active: true, deleted_at: null, laufkundschaft: false, einmalkunde: false, wiedervorlage_am: null, ...teil } as unknown as Customer;
}
function satz(id: string, kundeId: string, saison: "winter" | "sommer", removed: string | null = null): TireStorage {
  return { id, storage_slot_id: "p", customer_id: kundeId, vehicle_id: null, saison, removed_at: removed } as unknown as TireStorage;
}

describe("alsNaechstes", () => {
  it("nimmt den nächsten Termin heute, der noch nicht vorbei ist", () => {
    const os = [auftrag("a", { time: "09:00", end_time: "10:00" }), auftrag("b", { time: "13:00", end_time: "14:00" }), auftrag("c", { time: "15:00" })];
    expect(alsNaechstes(os, HEUTE, 12 * 60, 60)?.id).toBe("b");
  });
  it("ein laufender Termin zählt, bis sein Ende erreicht ist", () => {
    const os = [auftrag("b", { time: "12:00", end_time: "13:00", status: "in_arbeit" })];
    expect(alsNaechstes(os, HEUTE, 12 * 60 + 30, 60)?.id).toBe("b");
  });
  it("springt auf einen späteren Tag, wenn heute nichts mehr kommt", () => {
    const os = [auftrag("a", { time: "09:00" }), auftrag("m", { order_date: "2026-09-26", time: "08:00" })];
    expect(alsNaechstes(os, HEUTE, 18 * 60, 60)?.id).toBe("m");
  });
  it("übergeht erledigte und stornierte", () => {
    expect(alsNaechstes([auftrag("a", { time: "14:00", status: "erledigt" })], HEUTE, 8 * 60, 60)).toBeNull();
  });
});

describe("zuErledigen", () => {
  const basis = {
    heute: HEUTE, standardMin: 60, customers: [kunde("k1")], istRueckruf: () => true,
    kundeName: (o: Order) => o.customer_id, mitarbeiterName: (id: string) => id, freiePlaetze: 40, gesamtPlaetze: 100,
  };
  it("zählt offene Rechnungen, fehlende Einteilung und Überschneidungen", () => {
    const orders = [
      auftrag("r1", { status: "erledigt", rechnung_noetig: true, order_date: "2026-09-24" }),
      auftrag("r2", { status: "erledigt", rechnung_noetig: true, rechnung_erstellt_am: "2026-09-24T10:00:00Z" }),
      auftrag("o1", { order_date: "2026-09-28", time: "09:00" }),
      auftrag("x1", { order_date: "2026-09-26", time: "09:00", end_time: "10:00" }),
      auftrag("x2", { order_date: "2026-09-26", time: "09:30", end_time: "10:30" }),
    ];
    const p = zuErledigen({ ...basis, orders, orderEmployees: { x1: ["jan"], x2: ["jan"] } });
    const zahl = (id: string) => p.find((x) => x.id === id)?.zahl ?? 0;
    expect(zahl("rechnungen")).toBe(1);
    expect(zahl("ohne_mitarbeiter")).toBe(1);
    expect(zahl("ueberschneidung")).toBe(1);
    expect(p.find((x) => x.id === "lager")).toBeUndefined();
  });
  it("findet fällige Rückrufe und Laufkunden ohne Namen, warnt bei knappem Lager", () => {
    const customers = [kunde("k1", { wiedervorlage_am: "2026-09-20" }), kunde("k2", { wiedervorlage_am: "2026-10-01" }), kunde("lauf", { laufkundschaft: true })];
    const orders = [auftrag("l1", { customer_id: "lauf" }), auftrag("l2", { customer_id: "lauf", laufkunde_name: "Max" })];
    const p = zuErledigen({ ...basis, customers, orders, orderEmployees: { l1: ["a"], l2: ["a"] }, freiePlaetze: 6 });
    expect(p.find((x) => x.id === "rueckrufe")?.zeilen.map((z) => z.kundeId)).toEqual(["k1"]);
    expect(p.find((x) => x.id === "laufkunde")?.zahl).toBe(1);
    expect(p.find((x) => x.id === "lager")?.zahl).toBe(6);
  });
  it("lässt leere Punkte weg", () => {
    expect(zuErledigen({ ...basis, orders: [], orderEmployees: {} })).toEqual([]);
  });
});

describe("saisonBarometer", () => {
  it("zählt Kunden mit Sätzen der Saison, die noch keinen Termin haben – jeden einmal", () => {
    const saetze = [satz("s1", "a", "winter"), satz("s2", "a", "winter"), satz("s3", "b", "winter"), satz("s4", "c", "sommer"), satz("s5", "d", "winter", "2026-01-01")];
    const orders = [auftrag("t", { customer_id: "b", order_date: "2026-10-02" })];
    expect(saisonBarometer(saetze, orders, "winter", HEUTE)).toEqual({ kunden: 1, saetze: 2, mitTermin: 1 });
  });
});

describe("wochenUmsatz", () => {
  it("summiert Erledigtes je Tag der laufenden Woche", () => {
    const orders = [
      auftrag("a", { order_date: "2026-09-21", status: "erledigt" }),
      auftrag("b", { order_date: "2026-09-25", status: "erledigt" }),
      auftrag("c", { order_date: "2026-09-25" }),
      auftrag("d", { order_date: "2026-09-20", status: "erledigt" }),
      auftrag("e", { order_date: "2026-09-26", status: "storniert" }),
    ];
    const w = wochenUmsatz(orders, HEUTE, () => 100);
    expect(w.summe).toBe(200);
    expect(w.jeTag[0]).toBe(100);
    expect(w.jeTag[4]).toBe(100);
    expect(w.erledigt).toBe(2);
    expect(w.gesamt).toBe(3);
  });
});

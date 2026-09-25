import { describe, expect, it } from "vitest";
import type { StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { eingelagerteSaetze } from "@/lib/eingelagert";

// Die Liste „Eingelagerte Reifen" im Kundenfenster (25.09.2026).

const lager: Warehouse[] = [
  { id: "w1", name: "Hauptlager", address: null, note: null, created_at: "" },
  { id: "w2", name: "Außenlager", address: null, note: null, created_at: "" },
];
const platz = (id: string, code: string, w = "w1"): StorageSlot => ({ id, warehouse_id: w, code, note: null, created_at: "" });
const plaetze = [platz("p17", "17"), platz("p20", "20"), platz("p100", "100"), platz("pa2", "A-2"), platz("pa10", "A-10"), platz("px", "5", "w2")];
const fz = (id: string, kz: string): Vehicle => ({ id, customer_id: "k", license_plate: kz, make_model: null, tire_size: "205/55 R16", note: null, created_at: "", updated_at: "" });
const satz = (id: string, slot: string, vehicle: string | null, removed: string | null = null): TireStorage => ({
  id, storage_slot_id: slot, customer_id: "k", vehicle_id: vehicle, saison: "winter", erfassungsart: "sammel",
  anzahl_raeder: 4, dot_date: null, profiltiefe_mm: null, note: null, created_at: "", updated_at: "",
  removed_at: removed, entnahme_order_id: null, order_id: null,
});

describe("eingelagerteSaetze", () => {
  it("sortiert nach Lager und natürlich nach Platznummer", () => {
    const liste = eingelagerteSaetze(
      [satz("s1", "p100", null), satz("s2", "p20", "v1"), satz("s3", "p17", "v2"), satz("s4", "pa10", null), satz("s5", "pa2", null), satz("s6", "px", null)],
      plaetze, lager, [fz("v1", "N-AB 1"), fz("v2", "N-AB 2")]
    );
    expect(liste.map((z) => `${z.lager}/${z.platz}`)).toEqual([
      "Außenlager/5", "Hauptlager/17", "Hauptlager/20", "Hauptlager/100", "Hauptlager/A-2", "Hauptlager/A-10",
    ]);
  });

  it("nimmt Sätze ohne Fahrzeug mit und hängt das Kennzeichen an, wo es eines gibt", () => {
    const liste = eingelagerteSaetze([satz("s1", "p17", "v1"), satz("s2", "p20", null)], plaetze, lager, [fz("v1", "N-AB 1")]);
    expect(liste[0].fahrzeug?.license_plate).toBe("N-AB 1");
    expect(liste[1].fahrzeug).toBeNull();
  });

  it("lässt ausgelagerte Sätze weg", () => {
    expect(eingelagerteSaetze([satz("s1", "p17", null, "2026-09-01")], plaetze, lager, [])).toEqual([]);
  });
});

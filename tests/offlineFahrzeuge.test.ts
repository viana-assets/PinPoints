import { describe, expect, it } from "vitest";
import { auftragFahrzeugeAnwenden, fahrzeugeAnwenden, saetzeAnwenden, wartetAufAnlage, zusammenlegen, type Absicht } from "@/lib/offline/ausgang";
import type { AuftragFahrzeug, TireStorage, Vehicle } from "@/lib/types";

// Offline schreiben, Runde 2 (v113): Fahrzeuge am Auftrag.

const meta = (id: string) => ({ id, erstellt: "2026-10-05T10:00:00Z", titel: "t", zustand: "wartet" as const });
const zeile = (id: string, vehicle_id: string, km: number | null = null): AuftragFahrzeug =>
  ({ id, order_id: "o1", vehicle_id, kilometerstand: km, created_at: "", updated_at: "" });
const auto = (id: string, kz: string): Vehicle =>
  ({ id, customer_id: "k1", license_plate: kz, make_model: null, tire_size: null, note: null, created_at: "", updated_at: "" });

const neuesAuto: Absicht = { ...meta("a1"), art: "fahrzeug_neu", kundeId: "k1", auftragId: "o1", zeile: { id: "v9", customer_id: "k1", license_plate: "N-AB 9", make_model: null, tire_size: null, note: null } };
const zuordnung: Absicht = { ...meta("a2"), art: "fahrzeug_zu", auftragId: "o1", zeile: { id: "z9", order_id: "o1", vehicle_id: "v9", kilometerstand: null } };

describe("auf dem Gerät vorgreifen", () => {
  it("zeigt das offline angelegte Auto in der Kartei des Kunden", () => {
    expect(fahrzeugeAnwenden([auto("v1", "N-AB 1")], [neuesAuto], "k1").map((v) => v.id)).toEqual(["v1", "v9"]);
    expect(fahrzeugeAnwenden([auto("v1", "N-AB 1")], [neuesAuto], "k2").map((v) => v.id)).toEqual(["v1"]);
  });
  it("legt Zuordnung, Kilometerstand und Entfernen auf die Liste des Auftrags", () => {
    const km: Absicht = { ...meta("a3"), art: "km", auftragId: "o1", zeileId: "z1", felder: { kilometerstand: 81234 }, basis: { kilometerstand: null } };
    const weg: Absicht = { ...meta("a4"), art: "fahrzeug_weg", auftragId: "o1", zeileId: "z2" };
    const liste = auftragFahrzeugeAnwenden([zeile("z1", "v1"), zeile("z2", "v2")], [zuordnung, km, weg], "o1");
    expect(liste.map((z) => [z.id, z.kilometerstand])).toEqual([["z1", 81234], ["z9", null]]);
  });
  it("ordnet dasselbe Auto nicht zweimal zu", () => {
    expect(auftragFahrzeugeAnwenden([zeile("z1", "v9")], [zuordnung], "o1")).toHaveLength(1);
  });
  it("lässt Abgelehntes weg", () => {
    expect(auftragFahrzeugeAnwenden([], [{ ...zuordnung, zustand: "abgelehnt" }], "o1")).toEqual([]);
  });
});

describe("zusammenlegen", () => {
  it("rechnet den Kilometerstand in eine offline angelegte Zuordnung ein", () => {
    const korb = zusammenlegen([neuesAuto, zuordnung], { art: "km", auftragId: "o1", zeileId: "z9", felder: { kilometerstand: 5000 }, basis: { kilometerstand: null } });
    expect(korb).not.toBeNull();
    expect(korb!.find((a) => a.id === "a2")).toMatchObject({ zeile: { kilometerstand: 5000 } });
    expect(korb).toHaveLength(2);
  });
  it("entfernt eine offline angelegte Zuordnung ganz, statt das Entfernen anzuhängen", () => {
    const korb = zusammenlegen([neuesAuto, zuordnung], { art: "fahrzeug_weg", auftragId: "o1", zeileId: "z9" });
    expect(korb!.map((a) => a.id)).toEqual(["a1"]);
  });
  it("legt zwei Kilometerstände derselben Zeile zusammen, mit der ersten Basis", () => {
    const erster: Absicht = { ...meta("k1"), art: "km", auftragId: "o1", zeileId: "z1", felder: { kilometerstand: 100 }, basis: { kilometerstand: 50 } };
    const korb = zusammenlegen([erster], { art: "km", auftragId: "o1", zeileId: "z1", felder: { kilometerstand: 120 }, basis: { kilometerstand: 100 } });
    expect(korb![0]).toMatchObject({ felder: { kilometerstand: 120 }, basis: { kilometerstand: 50 } });
  });
  it("hängt das Entfernen einer Zeile vom Server an", () => {
    expect(zusammenlegen([neuesAuto], { art: "fahrzeug_weg", auftragId: "o1", zeileId: "z1" })).toBeNull();
  });
});

describe("wartetAufAnlage", () => {
  it("erkennt offline angelegte Autos und Zuordnungen", () => {
    expect(wartetAufAnlage([neuesAuto, zuordnung], "v9")).toBe(true);
    expect(wartetAufAnlage([neuesAuto, zuordnung], "z9")).toBe(true);
    expect(wartetAufAnlage([neuesAuto, zuordnung], "v1")).toBe(false);
  });
});

// v115: Notizen am Satz gehen ebenfalls ohne Netz (Absicht „satz“).
describe("Notizen am Satz ohne Netz", () => {
  const s = { id: "s1", erfassungsart: "sammel", profiltiefe_mm: 5, note: null, notiz_vr: null } as unknown as TireStorage;
  const n1: Absicht = { ...meta("n1"), art: "satz", satzId: "s1", felder: { notiz_vr: "Schraube" }, basis: { notiz_vr: null } };
  it("liegen sofort über dem Satz", () => {
    expect(saetzeAnwenden([s], [n1])[0]).toMatchObject({ notiz_vr: "Schraube", profiltiefe_mm: 5 });
    expect(saetzeAnwenden([s], [{ ...n1, zustand: "abgelehnt" }])[0].notiz_vr).toBeNull();
  });
  it("zwei Änderungen am selben Satz werden eine, mit der ersten Basis", () => {
    const korb = zusammenlegen([n1], { art: "satz", satzId: "s1", felder: { notiz_vr: "Schraube VR", note: "Rückruf" }, basis: { notiz_vr: "Schraube", note: null } });
    expect(korb).toHaveLength(1);
    expect(korb![0]).toMatchObject({ felder: { notiz_vr: "Schraube VR", note: "Rückruf" }, basis: { notiz_vr: null, note: null } });
  });
  it("ein anderer Satz bekommt eine eigene Absicht", () => {
    expect(zusammenlegen([n1], { art: "satz", satzId: "s2", felder: { note: "x" }, basis: { note: null } })).toBeNull();
  });
});

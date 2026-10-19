import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/types";
import { adresseVergleich, gleicheAnschrift, gruppeVon, gruppenMitglieder, gruppenText, hauptkundeKandidaten, istHauptkunde, kundenName, unterdebitorKandidaten, unterdebitoren } from "@/lib/kundengruppe";
import { nadelFaecher } from "@/lib/karte";
import { letzterSatzFuer } from "@/lib/helpers";

// Kundengruppen (Migration 101, v165): Hauptkunde mit Unterdebitoren, genau eine Ebene.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "101_kundengruppen.sql"), "utf8");
const ROLL = readFileSync(join(__dirname, "..", "supabase", "migrations", "rollback", "101_rollback.sql"), "utf8");
const k = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id, name: "Kontakt " + id, company: null, haupt_kunde_id: null, deleted_at: null, laufkundschaft: false, einmalkunde: false, testkunde: false, active: true, ...extra,
}) as unknown as Customer;

const H = k("h", { company: "Gruppe Beispiel" });
const U1 = k("u1", { company: "Zwei GmbH", haupt_kunde_id: "h" });
const U2 = k("u2", { company: "Eins gGmbH", haupt_kunde_id: "h" });
const X = k("x");
const ALLE = [H, U1, U2, X];

describe("Kundengruppe – Ableitungen", () => {
  it("die Gruppe ist der Hauptkunde, sonst der Kunde selbst", () => {
    expect(gruppeVon("u1", ALLE)).toBe("h");
    expect(gruppeVon("h", ALLE)).toBe("h");
    expect(gruppeVon("x", ALLE)).toBe("x");
    expect(gruppeVon(null, ALLE)).toBeNull();
  });
  it("Mitglieder: Hauptkunde zuerst, Unterdebitoren nach Namen", () => {
    expect(gruppenMitglieder("u2", ALLE).map((c) => c.id)).toEqual(["h", "u2", "u1"]);
    expect(gruppenMitglieder("x", ALLE).map((c) => c.id)).toEqual(["x"]);
  });
  it("gelöschte Unterdebitoren zählen nicht", () => {
    const geloescht = k("u3", { haupt_kunde_id: "h", deleted_at: "2026-10-01" });
    expect(unterdebitoren("h", [...ALLE, geloescht]).map((c) => c.id)).toEqual(["u2", "u1"]);
    expect(istHauptkunde("x", [...ALLE, k("u4", { haupt_kunde_id: "x", deleted_at: "x" })])).toBe(false);
  });
  it("Name: Firma vor Ansprechpartner", () => {
    expect(kundenName(U1)).toBe("Zwei GmbH");
    expect(kundenName(X)).toBe("Kontakt x");
  });
  it("Zeile zur Einordnung", () => {
    expect(gruppenText(U1, ALLE)).toBe("Unterdebitor von Gruppe Beispiel");
    expect(gruppenText(H, ALLE)).toBe("Hauptkunde · 2 Unterdebitoren");
    expect(gruppenText(X, ALLE)).toBeNull();
  });
  it("Kandidaten wie kunde_gruppe_pruefen(): keine Unterdebitoren, keine Laufkundschaft, Testkunde nur zu Testkunde", () => {
    const lauf = k("l", { laufkundschaft: true });
    const test = k("t", { testkunde: true });
    const inaktiv = k("i", { active: false });
    const kartei = [...ALLE, lauf, test, inaktiv];
    expect(hauptkundeKandidaten(X, kartei).map((c) => c.id)).toEqual(["h"]);
    expect(hauptkundeKandidaten(test, kartei).map((c) => c.id)).toEqual([]);
    expect(hauptkundeKandidaten(H, kartei)).toEqual([]);
    expect(hauptkundeKandidaten(lauf, kartei)).toEqual([]);
  });
});

describe("Vorgeschichte über die Gruppe", () => {
  it("letzterSatzFuer nimmt eine Liste von Kunden", () => {
    const satz = (id: string, customer_id: string, created_at: string) => ({ id, customer_id, vehicle_id: null, created_at });
    const saetze = [satz("a", "u1", "2026-01-01"), satz("b", "u2", "2026-02-01"), satz("c", "x", "2026-03-01")];
    expect(letzterSatzFuer(saetze, ["h", "u1", "u2"], [])?.id).toBe("b");
    expect(letzterSatzFuer(saetze, "h", [])).toBeNull();
    expect(letzterSatzFuer(saetze, [], [])).toBeNull();
  });
});

describe("Migration 101 – Text", () => {
  it("Regeln, Funktionen und Rückweg passen zusammen", () => {
    for (const f of ["kunde_gruppe_pruefen", "kunde_gruppe", "fahrzeug_kunde_wechseln", "satz_kunde_wechseln"]) {
      expect(MIG).toContain(`function public.${f}(`);
      expect(ROLL).toMatch(new RegExp(`drop function if exists public\\.${f}\\(`));
    }
    expect(MIG).toContain("add column if not exists haupt_kunde_id");
    expect(ROLL).toContain("drop column if exists haupt_kunde_id");
    // Die drei umgeschriebenen Funktionen kommen im Rückweg in ihrer alten Fassung zurück.
    for (const f of ["tire_storage_fahrzeug_passt", "tire_storage_tausch_pruefen", "tire_storage_vormerkung_pruefen", "ist_eigener_kunde"]) {
      expect(MIG).toContain(`function public.${f}(`);
      expect(ROLL).toContain(`function public.${f}(`);
    }
  });
});

describe("v166 – Gruppe vom Hauptkunden aus, gleiche Anschrift", () => {
  it("Unterdebitor-Kandidaten: keine Unterdebitoren, keine Hauptkunden, nicht unter einem Unterdebitor", () => {
    const lauf = k("l", { laufkundschaft: true });
    const neu = k("n");
    const kartei = [...ALLE, lauf, neu];
    expect(unterdebitorKandidaten(H, kartei).map((c) => c.id).sort()).toEqual(["n", "x"]);
    expect(unterdebitorKandidaten(X, kartei).map((c) => c.id).sort()).toEqual(["n"]);
    expect(unterdebitorKandidaten(U1, kartei)).toEqual([]);
    expect(unterdebitorKandidaten(lauf, kartei)).toEqual([]);
  });
  it("Anschrift vergleichen: Satzzeichen, Leerzeichen, Straße/Str.", () => {
    expect(adresseVergleich("Hauptstraße 5,  90513 Zirndorf")).toBe(adresseVergleich("hauptstr. 5 90513 Zirndorf"));
    expect(adresseVergleich("")).toBe("");
    const a = k("a", { address: "Musterweg 9, 90000 Ort" } as Partial<Customer>);
    const b = k("b", { address: "Musterweg 9 90000 Ort" } as Partial<Customer>);
    const c = k("c", { address: "Musterweg 10, 90000 Ort" } as Partial<Customer>);
    expect(gleicheAnschrift(a, [a, b, c]).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("v166 – Nadeln am selben Ort auffächern", () => {
  it("einzelne Nadeln bleiben, wo sie sind", () => {
    expect(nadelFaecher([{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }]).size).toBe(0);
  });
  it("drei am selben Punkt stehen nebeneinander um den Mittelpunkt", () => {
    const f = nadelFaecher([{ id: "a", x: 50, y: 50 }, { id: "b", x: 50, y: 50 }, { id: "c", x: 52, y: 50 }]);
    const xs = ["a", "b", "c"].map((id) => f.get(id)!.x);
    expect(xs[1] - xs[0]).toBeCloseTo(28);
    expect(xs[2] - xs[1]).toBeCloseTo(28);
    expect((xs[0] + xs[2]) / 2).toBeCloseTo(50 + 2 / 3);
    expect(new Set(["a", "b", "c"].map((id) => f.get(id)!.y)).size).toBe(1);
  });
  it("ab sechs im Kreis, alle verschieden", () => {
    const f = nadelFaecher(Array.from({ length: 8 }, (_, i) => ({ id: "p" + i, x: 0, y: 0 })));
    const lagen = new Set([...f.values()].map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`));
    expect(lagen.size).toBe(8);
    for (const p of f.values()) expect(Math.hypot(p.x, p.y)).toBeCloseTo((28 * 8) / (2 * Math.PI));
  });
});

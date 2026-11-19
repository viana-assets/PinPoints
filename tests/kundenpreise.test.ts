import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Article, Customer, KundenPreis } from "@/lib/types";
import {
  entwurfAus, gilt, kundenpreisFuer, kundenpreiseAm, kundenpreisMaengel, kundenpreisZustand, preiseVonKunde, preisLesen, zeitraumText,
} from "@/lib/kundenpreise";
import { kundenpreisZeile } from "@/lib/auskunft";

// Kundenpreise (Migration 118, v191). Dieselben Regeln prüft die Datenbank (`kunden_preis_pruefen()`,
// `position_kundenpreis()`) – geprüft gegen PG 16 mit /tmp/pgt/t118.sql. Erfundene Daten.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "118_kundenpreise.sql"), "utf8");
const ROLL = readFileSync(join(__dirname, "..", "supabase", "migrations", "rollback", "118_rollback.sql"), "utf8");

const p = (id: string, kunde: string, artikel: string, preis: number, ab: string | null = null, bis: string | null = null): KundenPreis =>
  ({ id, customer_id: kunde, article_id: artikel, net_price: preis, valid_from: ab, valid_to: bis, notiz: null });
const KUNDEN = [
  { id: "h", haupt_kunde_id: null }, { id: "u", haupt_kunde_id: "h" }, { id: "x", haupt_kunde_id: null },
] as Pick<Customer, "id" | "haupt_kunde_id">[];
const ART = [
  { id: "w", short_name: "Wechsel", abrechnungsart: "normal" }, { id: "z", short_name: "Aufziehen", abrechnungsart: "normal" },
  { id: "r", short_name: "Reifen neu", abrechnungsart: "reifenverkauf_neu" },
] as unknown as Article[];

describe("Welcher Kundenpreis gilt", () => {
  const PREISE = [p("1", "h", "w", 20), p("2", "u", "w", 18, "2026-12-01", "2027-01-31"), p("3", "u", "w", 17, "2027-02-01")];
  it("Zeitraum mit offenen Enden", () => {
    expect(gilt({ valid_from: null, valid_to: null }, "2026-01-01")).toBe(true);
    expect(gilt({ valid_from: "2026-12-01", valid_to: "2027-01-31" }, "2027-01-31")).toBe(true);
    expect(gilt({ valid_from: "2026-12-01", valid_to: null }, "2026-11-30")).toBe(false);
  });
  it("eigener vor Hauptkunde, sonst der des Hauptkunden, Datum des Auftrags zählt", () => {
    expect(kundenpreisFuer("u", "w", "2026-12-10", PREISE, KUNDEN)).toMatchObject({ preis: { net_price: 18 }, vomHauptkunden: false });
    expect(kundenpreisFuer("u", "w", "2027-02-10", PREISE, KUNDEN)?.preis.net_price).toBe(17);
    expect(kundenpreisFuer("u", "w", "2026-11-10", PREISE, KUNDEN)).toMatchObject({ preis: { net_price: 20 }, vomHauptkunden: true });
    expect(kundenpreisFuer("x", "w", "2026-12-10", PREISE, KUNDEN)).toBeNull();
    expect(kundenpreisFuer("u", "z", "2026-12-10", PREISE, KUNDEN)).toBeNull();
  });
  it("alle Kundenpreise an einem Tag je Artikel", () => {
    const m = kundenpreiseAm("u", "2026-12-10", [...PREISE, p("4", "h", "z", 9)], KUNDEN);
    expect(m.get("w")?.preis.net_price).toBe(18);
    expect(m.get("z")).toMatchObject({ preis: { net_price: 9 }, vomHauptkunden: true });
    expect(kundenpreiseAm(null, "2026-12-10", PREISE, KUNDEN).size).toBe(0);
  });
  it("Zustand und Zeitraum als Text, Liste je Kunde", () => {
    expect(kundenpreisZustand({ valid_from: null, valid_to: "2026-01-01" }, "2026-11-19")).toBe("vorbei");
    expect(kundenpreisZustand({ valid_from: "2027-01-01", valid_to: null }, "2026-11-19")).toBe("kommt");
    expect(kundenpreisZustand({ valid_from: null, valid_to: null }, "2026-11-19")).toBe("gilt");
    expect(zeitraumText({ valid_from: null, valid_to: null })).toBe("unbefristet");
    expect(zeitraumText({ valid_from: "2027-02-01", valid_to: null })).toBe("ab 1.2.2027");
    expect(preiseVonKunde("u", [p("9", "u", "z", 5), ...PREISE], ART).map((x) => x.id)).toEqual(["9", "2", "3"]);
  });
});

describe("Formular", () => {
  const VOR = [p("1", "u", "w", 18, "2026-12-01", "2027-01-31")];
  const e = (t: Partial<ReturnType<typeof entwurfAus>> = {}) => ({ ...entwurfAus(null), artikelId: "z", preis: "20", ...t });
  it("Preis lesen", () => {
    expect(preisLesen("20")).toBe(20);
    expect(preisLesen("19,5")).toBe(19.5);
    expect(preisLesen("1.234,50 €")).toBe(1234.5);
    expect(preisLesen("12.5")).toBe(12.5);
    expect(preisLesen("abc")).toBeNull();
    expect(preisLesen("")).toBeNull();
    expect(preisLesen("1,234")).toBeNull();
  });
  it("Mängel wie in der Datenbank", () => {
    expect(kundenpreisMaengel(e({ artikelId: "" }), "u", null, VOR, ART)).toContain("Artikel");
    expect(kundenpreisMaengel(e({ artikelId: "r" }), "u", null, VOR, ART)).toContain("Reifenverkauf");
    expect(kundenpreisMaengel(e({ preis: "" }), "u", null, VOR, ART)).toContain("Preis");
    expect(kundenpreisMaengel(e({ ab: "2027-02-01", bis: "2027-01-01" }), "u", null, VOR, ART)).toContain("Ende");
    expect(kundenpreisMaengel(e(), "u", null, VOR, ART)).toBeNull();
  });
  it("Überschneidung nur bei gleichem Kunden und Artikel, nicht mit sich selbst", () => {
    expect(kundenpreisMaengel(e({ artikelId: "w", ab: "2027-01-15" }), "u", null, VOR, ART)).toContain("schon einen Kundenpreis");
    expect(kundenpreisMaengel(e({ artikelId: "w" }), "u", null, VOR, ART)).toContain("schon einen Kundenpreis");
    expect(kundenpreisMaengel(e({ artikelId: "w", ab: "2027-02-01" }), "u", null, VOR, ART)).toBeNull();
    expect(kundenpreisMaengel(e({ artikelId: "w", bis: "2026-11-30" }), "u", null, VOR, ART)).toBeNull();
    expect(kundenpreisMaengel(e({ artikelId: "w" }), "x", null, VOR, ART)).toBeNull();
    expect(kundenpreisMaengel(e({ artikelId: "w" }), "u", "1", VOR, ART)).toBeNull();
  });
  it("Entwurf aus einem Kundenpreis", () => {
    expect(entwurfAus(p("1", "u", "w", 18.5, "2026-12-01"))).toEqual({ artikelId: "w", preis: "18,5", ab: "2026-12-01", bis: "", notiz: "" });
  });
});

describe("Auskunft", () => {
  it("eine Zeile je Kundenpreis", () => {
    const z = kundenpreisZeile({ artikel: "Wechsel", preis_netto: 20, ab: "2026-12-01", bis: null, notiz: "Rahmenvertrag", angelegt: "2026-11-19" });
    expect(z[0]).toBe("Wechsel");
    expect(z[1]).toContain("netto");
    expect(z[1]).toContain("ab ");
    expect(z[1]).toContain("Rahmenvertrag");
  });
});

describe("Migration 118 und Rücknahme", () => {
  it("Tabelle, Prüfung, Preis an der Position, Rechte, Auskunft, Schwärzen", () => {
    expect(MIG).toMatch(/create table if not exists public\.kunden_preise/);
    expect(MIG).toMatch(/function public\.kunden_preis_pruefen\(\)/);
    expect(MIG).toMatch(/create trigger trg_position_kundenpreis before insert on public\.order_articles/);
    expect(MIG).toMatch(/listenpreis_netto/);
    expect(MIG).toMatch(/darf\('auftraege\.preis', 'schreiben'\)/);
    expect(MIG).toMatch(/'kundenpreise'/);
    expect(MIG).toMatch(/'kunden_preise'\n\s*\];/);
  });
  it("die Rücknahme prüft und löscht in EINEM Block und stellt 117 wieder her", () => {
    expect((ROLL.match(/do \$rueck\$/g) ?? []).length).toBe(1);
    expect(ROLL.indexOf("raise exception")).toBeLessThan(ROLL.indexOf("drop table if exists public.kunden_preise"));
    expect(ROLL).toMatch(/'wechselorte'/);
    expect(ROLL).not.toMatch(/'kundenpreise'/);
  });
});

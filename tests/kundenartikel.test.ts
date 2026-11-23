import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Article, Customer } from "@/lib/types";
import { gruppeVonKunde, istKundenartikel, kundenartikelKunden, kundenartikelMaengel, kundenartikelUebersicht, kundenartikelVon, waehlbarFuer } from "@/lib/kundenartikel";
import { kundenartikelZeile } from "@/lib/auskunft";

// Kundenartikel (Migration 119, v192). Dieselben Regeln prüft die Datenbank (`artikel_kunde_pruefen()`,
// `position_kundenartikel_pruefen()`) – gegen PG 16 mit /tmp/pgt/t119.sql. Erfundene Daten.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "119_kundenartikel.sql"), "utf8");
const ROLL = readFileSync(join(__dirname, "..", "supabase", "migrations", "rollback", "119_rollback.sql"), "utf8");

const K = [
  { id: "h", haupt_kunde_id: null, name: "", company: "Kunterbunt Holding", kundennummer: 10001 },
  { id: "u1", haupt_kunde_id: "h", name: "", company: "Kunterbunt Nord", kundennummer: 10002 },
  { id: "u2", haupt_kunde_id: "h", name: "", company: "Kunterbunt Süd", kundennummer: 10003 },
  { id: "x", haupt_kunde_id: null, name: "Erika Beispiel", company: null, kundennummer: 10004 },
] as unknown as Customer[];
const art = (id: string, nr: number, kunde: string | null, name = "Artikel " + id) =>
  ({ id, article_number: nr, short_name: name, long_name: name + " lang", customer_id: kunde, active: true }) as unknown as Article;

describe("Kundenartikel – wer sie wählen kann", () => {
  it("Gruppe und Mitglieder", () => {
    expect(gruppeVonKunde("u1", K)).toBe("h");
    expect(gruppeVonKunde("x", K)).toBe("x");
    expect(kundenartikelKunden("u1", K).sort()).toEqual(["h", "u1", "u2"]);
    expect(kundenartikelKunden("h", K).sort()).toEqual(["h", "u1", "u2"]);
    expect(kundenartikelKunden("x", K)).toEqual(["x"]);
    expect(kundenartikelKunden(null, K)).toEqual([]);
  });
  it("wählbar: Artikel für alle immer, Kundenartikel nur in der Gruppe, ohne Angabe nie", () => {
    expect(waehlbarFuer(art("a", 1, null), undefined)).toBe(true);
    expect(waehlbarFuer(art("b", 2, "h"), ["h", "u1"])).toBe(true);
    expect(waehlbarFuer(art("b", 2, "h"), ["x"])).toBe(false);
    expect(waehlbarFuer(art("b", 2, "h"), undefined)).toBe(false);
    expect(istKundenartikel(art("b", 2, "h"))).toBe(true);
    expect(istKundenartikel(art("a", 1, null))).toBe(false);
  });
  it("Kundenartikel eines Kunden nach Name, Übersicht je Kunde mit Suche", () => {
    const A = [art("a", 1, null), art("b", 602, "x", "Zubringer"), art("c", 601, "x", "Abholung"), art("d", 603, "h", "Flottencheck")];
    expect(kundenartikelVon("x", A).map((a) => a.id)).toEqual(["c", "b"]);
    const u = kundenartikelUebersicht(A, K);
    expect(u.map((g) => g.kundeId)).toEqual(["x", "h"]);
    expect(u[0].artikel.map((a) => a.id)).toEqual(["c", "b"]);
    expect(kundenartikelUebersicht(A, K, "kunterbunt").map((g) => g.kundeId)).toEqual(["h"]);
    expect(kundenartikelUebersicht(A, K, "10004").map((g) => g.kundeId)).toEqual(["x"]);
    expect(kundenartikelUebersicht(A, K, "flotten")[0].artikel.map((a) => a.id)).toEqual(["d"]);
  });
});

describe("Formular", () => {
  const e = { kurz: "Flottencheck", lang: "Flottencheck je Fahrzeug", einheit: "Stück", preis: "40", mwst: "19" };
  it("Pflichtfelder, Preis, Steuersatz, Laufkundschaft", () => {
    expect(kundenartikelMaengel(e, { laufkundschaft: false })).toBeNull();
    expect(kundenartikelMaengel(e, { laufkundschaft: true })).toContain("Laufkundschaft");
    expect(kundenartikelMaengel({ ...e, kurz: " " }, { laufkundschaft: false })).toContain("Kurzbezeichnung");
    expect(kundenartikelMaengel({ ...e, lang: "" }, { laufkundschaft: false })).toContain("Rechnung");
    expect(kundenartikelMaengel({ ...e, preis: "x" }, { laufkundschaft: false })).toContain("Preis");
    expect(kundenartikelMaengel({ ...e, preis: "39,50" }, { laufkundschaft: false })).toBeNull();
    expect(kundenartikelMaengel({ ...e, mwst: "" }, { laufkundschaft: false })).toContain("Steuersatz");
    expect(kundenartikelMaengel({ ...e, mwst: "7" }, { laufkundschaft: false })).toBeNull();
  });
  it("Auskunft", () => {
    expect(kundenartikelZeile({ nummer: 601, artikel: "Flottencheck", bezeichnung: "je Fahrzeug", aktiv: false, angelegt: "" }))
      .toEqual(["601 · Flottencheck", "je Fahrzeug · inaktiv"]);
  });
});

describe("Migration 119 und Rücknahme", () => {
  it("Spalte, Prüfungen, Löschen mit Hülle, Auskunft, Zusammenführen", () => {
    expect(MIG).toMatch(/add column if not exists customer_id uuid references public\.customers \(id\) on delete set null/);
    expect(MIG).toMatch(/create trigger trg_position_kundenartikel_pruefen before insert or update of article_id on public\.order_articles/);
    expect(MIG).toMatch(/public\.kunde_gruppe\(kunde\) is distinct from public\.kunde_gruppe\(besitzer\)/);
    expect(MIG).toMatch(/rename to testkunde_loeschen_grund/);
    expect(MIG).toMatch(/kundenartikel_vor_loeschen\(p_kunde\)/);
    expect(MIG).toMatch(/'kundenartikel'/);
    expect(MIG).toMatch(/update public\.articles a set customer_id = p_behalten/);
    expect(MIG).toMatch(/Kundenartikel hat seinen Preis am Artikel/);
  });
  it("die Rücknahme prüft und löscht in EINEM Block und stellt 118 wieder her", () => {
    expect((ROLL.match(/do \$rueck\$/g) ?? []).length).toBe(1);
    expect(ROLL.indexOf("raise exception")).toBeLessThan(ROLL.indexOf("drop column if exists customer_id"));
    expect(ROLL).toMatch(/rename to testkunde_loeschen/);
    expect(ROLL).toMatch(/'kundenpreise'/);
    expect(ROLL).not.toMatch(/'kundenartikel'/);
  });
});

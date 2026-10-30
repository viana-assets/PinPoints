import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_RECHNUNG_KONTEN, FIN_ZAHLUNGSZIEL_TAGE, offenePosten, rechnungZustand, rechnungenZuErledigen, standLesen, vorgaengeTeilen, zustandText,
  type FinRechnungZeile,
} from "@/lib/finance/rechnungen";

// Finance F3 (Migration 89, v147).
const r = (p: Partial<FinRechnungZeile>): FinRechnungZeile => ({
  rechnung_id: "r", nummer_text: "RE1", datum: "2026-10-01", brutto: 119, order_id: "o", order_number: 1, kunde: "K", storniert: false,
  storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1, ...p,
});

describe("rechnungZustand", () => {
  it("offen, fällig heute, überfällig", () => {
    expect(rechnungZustand(r({}), "2026-10-13")).toEqual({ art: "offen", faellig: "2026-10-15", tage: 2, teil: 0 });
    expect(zustandText(rechnungZustand(r({}), "2026-10-15"))).toBe("fällig heute");
    expect(rechnungZustand(r({}), "2026-10-20")).toEqual({ art: "ueberfaellig", faellig: "2026-10-15", tage: 5, teil: 0 });
    expect(zustandText(rechnungZustand(r({}), "2026-10-16"))).toBe("überfällig seit 1 Tag");
  });
  it("nicht gebucht mit Grund, oder ohne Zeile in Finance", () => {
    expect(rechnungZustand(r({ status: "fehler", fehler: "Monat fest" }), "2026-10-13")).toEqual({ art: "nicht_gebucht", grund: "Monat fest" });
    expect(rechnungZustand(r({ status: "offen" }), "2026-10-13")).toEqual({ art: "nicht_gebucht", grund: null });
  });
  it("bezahlt und storniert", () => {
    expect(zustandText(rechnungZustand(r({ bezahlt_am: "2026-10-02", bezahlt_art: "bar" }), "2026-10-13"))).toBe("bar bezahlt");
    expect(rechnungZustand(r({ status: "storniert" }), "2026-10-13")).toEqual({ art: "storniert", bezahlt: false });
    expect(zustandText(rechnungZustand(r({ storniert: true, bezahlt_am: "2026-10-02", bezahlt_art: "bank" }), "2026-10-13"))).toMatch(/Erstattung/);
  });
});

describe("offenePosten", () => {
  it("nur gebucht und unbezahlt, älteste Fälligkeit zuerst, Summen", () => {
    const op = offenePosten([
      r({ rechnung_id: "a", nummer_text: "RE3", faellig_am: "2026-10-20", brutto: 50 }),
      r({ rechnung_id: "b", nummer_text: "RE1", faellig_am: "2026-10-05", brutto: 100.1 }),
      r({ rechnung_id: "c", bezahlt_am: "2026-10-02", bezahlt_art: "bar" }),
      r({ rechnung_id: "d", status: "fehler" }),
      r({ rechnung_id: "e", storniert: true }),
    ], "2026-10-13");
    expect(op.posten.map((p) => p.rechnung_id)).toEqual(["b", "a"]);
    expect([op.summe, op.ueberfaellig]).toEqual([150.1, 100.1]);
  });
});

describe("Vorgänge und Übersicht", () => {
  const stand = standLesen({
    vorgaenge: [
      { order_id: "1", order_number: 1, datum: "2026-10-01", zeit: null, status: "erledigt", kunde: "A", kundennummer: null, betrag: "140.40" },
      { order_id: "2", order_number: 2, datum: "2026-10-20", zeit: "09:00", status: "offen", kunde: "B", kundennummer: 5, betrag: 0 },
    ],
    rechnungen: [r({ status: "fehler" }), r({ faellig_am: "2026-10-01" })],
  });
  it("teilt nach erledigt / läuft noch", () => {
    const t = vorgaengeTeilen(stand.vorgaenge);
    expect([t.zuErstellen.map((v) => v.order_id), t.vorgemerkt.map((v) => v.order_id)]).toEqual([["1"], ["2"]]);
    expect(t.zuErstellen[0].betrag).toBe(140.4);
  });
  it("zählt, was zu erledigen ist", () => expect(rechnungenZuErledigen(stand, "2026-10-13")).toEqual({ zuErstellen: 1, nichtGebucht: 1, ueberfaellig: 1 }));
  it("leerer Stand", () => expect(standLesen(null)).toEqual({ vorgaenge: [], rechnungen: [], anderswo: [], umfang: "pilot" }));
  it("Umfang (Migration 111)", () => expect(standLesen({ umfang: "alle" }).umfang).toBe("alle"));
});

describe("Wie Migration 89", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "89_finance_rechnungen.sql"), "utf8");
  it("Zahlungsziel", () => expect(sql).toContain(`r.datum + ${FIN_ZAHLUNGSZIEL_TAGE}`));
  it.each(["skr03", "skr04"] as const)("Konten %s", (rahmen) => {
    const block = sql.match(new RegExp(`when '${rahmen}' then case p_zweck ([\\s\\S]*?) end`))?.[1] ?? "";
    const db = Object.fromEntries([...block.matchAll(/when '(\w+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    expect(db).toEqual(FIN_RECHNUNG_KONTEN[rahmen]);
  });
  it("jedes Rechnungskonto gibt es im Kontenrahmen aus Migration 88", () => {
    const k88 = readFileSync(join(__dirname, "..", "supabase", "migrations", "88_finance_buchungen.sql"), "utf8");
    for (const [rahmen, konten] of Object.entries(FIN_RECHNUNG_KONTEN))
      for (const nr of Object.values(konten)) expect(k88.includes(`('${rahmen}', ${nr}, '`), `${rahmen} ${nr}`).toBe(true);
  });
});

describe("Teilzahlungen (Migration 93, v151)", () => {
  it("Rest, Zustandstext und offene Posten mit dem Rest", async () => {
    const { rechnungRest } = await import("@/lib/finance/rechnungen");
    const t = r({ teilbezahlt: 50 });
    expect(rechnungRest(t)).toBe(69);
    expect(rechnungRest({ ...t, bezahlt_am: "2026-10-02" })).toBe(0);
    expect(zustandText(rechnungZustand(t, "2026-10-13"))).toBe("offen · fällig in 2 Tagen · 50,00 € schon beglichen");
    expect(offenePosten([t, r({ rechnung_id: "x", faellig_am: "2026-10-01" })], "2026-10-13")).toMatchObject({ summe: 188, ueberfaellig: 119 });
    expect(standLesen({ rechnungen: [{ ...r({}), brutto: "119.00", teilbezahlt: "50.00" }] }).rechnungen[0].teilbezahlt).toBe(50);
  });
});

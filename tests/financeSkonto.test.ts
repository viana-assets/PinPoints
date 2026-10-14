import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIN_SKONTO_HOECHST, rechnungZustand, skontoMangel, zustandText, type FinRechnungZeile } from "@/lib/finance/rechnungen";
import { belegZustand, belegZustandText } from "@/lib/finance/belege";
import { FIN_DATEV_AUTOMATIK, datevSaetze } from "@/lib/finance/export";
import type { FinBuchung, FinKonto, FinSteuerschluessel } from "@/lib/finance/buchung";

// v156 (Migration 98): Skonto. Grenze, Zustand und DATEV-Satz wie die Datenbank (pgtest/t98.sql).
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "98_finance_skonto.sql"), "utf8");

describe("Skonto", () => {
  it("Grenze 10 % wie fin_skonto_buchen()", () => {
    expect(FIN_SKONTO_HOECHST).toBe(0.1);
    expect(MIG).toMatch(/round\(brutto \* 0\.10, 2\)/);
    expect(skontoMangel(2.81, 2.81, 140.42)).toBeNull();
    expect(skontoMangel(3, 2.81, 140.42)).toMatch(/Höher als der offene Rest/);
    expect(skontoMangel(15, 140.42, 140.42)).toMatch(/Mehr als 10 %/);
    expect(skontoMangel(5, 140.42, 140.42, 10)).toMatch(/Mehr als 10 %/);
    expect(skontoMangel(null, 1, 1)).toMatch(/eintragen/);
    expect(skontoMangel(1.234, 5, 100)).toMatch(/zwei Nachkommastellen/);
  });
  it("mit Skonto ausgeglichen", () => {
    const r = { rechnung_id: "r", nummer_text: "RE1", datum: "2026-09-10", brutto: 140.42, order_id: null, order_number: null, kunde: "K", storniert: false, storno_nummer: null,
      status: "gebucht", fehler: null, faellig_am: null, bezahlt_am: "2026-09-21", bezahlt_art: "skonto", teilbezahlt: 140.42, buchung_nr: 1 } as FinRechnungZeile;
    expect(zustandText(rechnungZustand(r, "2026-10-01"))).toBe("mit Skonto ausgeglichen");
    expect(belegZustandText(belegZustand({ status: "gebucht", faellig_am: null, belegdatum: "2026-09-03", bezahlt_am: "2026-09-23", bezahlt_art: "skonto", teilbezahlt: 595 }, "2026-10-01"))).toBe("mit Skonto ausgeglichen");
  });
  it("Skontokonten wie fin_skonto_konto(); in DATEV Automatikkonten", () => {
    for (const [r, k] of [["skr03", [8736, 8731, 8730, 3736, 3731, 3730]], ["skr04", [4736, 4731, 4730, 5736, 5731, 5730]]] as const) {
      for (const n of k) expect(MIG, `${r} ${n}`).toMatch(new RegExp(`\\('${r}', ${n}, `));
      expect(Object.keys(FIN_DATEV_AUTOMATIK[r]).map(Number)).toEqual(expect.arrayContaining([k[0], k[1], k[3], k[4]]));
    }
  });
  it("Skontobuchung als DATEV-Satz: brutto auf dem Automatikkonto", () => {
    const konten = [{ nummer: 8736, kategorie: "erloes" }, { nummer: 1400, kategorie: "forderung" }, { nummer: 1776, kategorie: "steuer" }] as FinKonto[];
    const schl = [{ kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }] as FinSteuerschluessel[];
    const b = { id: "s", jahr: 2026, nr: 6, datum: "2026-09-21", text: "Skonto RE1", beleg: "RE1", quelle: "skonto", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "x",
      fin_buchungszeilen: [
        { id: 1, posten: 1, seite: "S", konto: 8736, betrag: 2.36, steuerschluessel: "ust19", ist_steuer: false },
        { id: 2, posten: 1, seite: "H", konto: 1400, betrag: 2.81, steuerschluessel: "ust19", ist_steuer: false },
        { id: 3, posten: 1, seite: "S", konto: 1776, betrag: 0.45, steuerschluessel: "ust19", ist_steuer: true },
      ] } as FinBuchung;
    const x = datevSaetze(b, { kat: new Map(konten.map((k) => [k.nummer, k.kategorie])), schl: new Map(schl.map((s) => [s.schluessel, s])), rahmen: "skr03" });
    expect(x.saetze.map((s) => [s.umsatz, s.sh, s.konto, s.gegenkonto, s.bu])).toEqual([[2.81, "H", 1400, 8736, ""]]);
  });
});

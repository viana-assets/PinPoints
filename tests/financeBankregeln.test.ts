import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_BANKREGEL_RICHTUNGEN, FIN_GELDTRANSIT, regelFuer, regelPasst, sammelKandidaten, sammelRest, sammelVerteilen,
  type FinBankregel, type FinBankumsatz,
} from "@/lib/finance/bank";
import type { FinRechnungZeile } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";

// Stufe E Teil 1 (Migration 112, v185): Bankregeln und Sammelzuordnung. Beispieldaten sind erfunden.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "112_finance_bankregeln_sammeln.sql"), "utf8");
const MIG88 = readFileSync(join(__dirname, "..", "supabase", "migrations", "88_finance_buchungen.sql"), "utf8");

const umsatz = (p: Partial<FinBankumsatz>): FinBankumsatz => ({
  id: "u1", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-05", valuta: null, betrag: -49.9, zweck: null, name: null, iban: null, referenz: null,
  status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null, ...p,
});
const regel = (p: Partial<FinBankregel>): FinBankregel => ({
  id: "g1", bezeichnung: "Telefon", richtung: "beide", name_enthaelt: null, zweck_enthaelt: null, iban: null, konto: 4920, steuer: null, text: null,
  kost1: null, kost2: null, aktiv: true, ...p,
});
const rechnung = (p: Partial<FinRechnungZeile>): FinRechnungZeile => ({
  rechnung_id: "r1", nummer_text: "RE-2026-0042", datum: "2026-10-01", brutto: 119, order_id: "o1", order_number: 42, kunde: "Muster GmbH",
  storniert: false, storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 3, ...p,
});
const beleg = (p: Partial<FinBeleg>): FinBeleg => ({
  id: "b1", lieferant_id: "l1", belegdatum: "2026-10-01", belegnummer: "77", text: null, faellig_am: null, posten: [], datei_pfad: null, datei_typ: null,
  datei_name: null, status: "gebucht", brutto: 30, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01T00:00:00Z", ...p,
});
const LIEF: FinLieferant[] = [{ id: "l1", name: "Reifen Nord", ust_id: null, konto: null, steuer: null, aktiv: true }];

describe("Bankregeln", () => {
  it("alle angegebenen Bedingungen müssen stimmen – Schreibweise egal, IBAN genau", () => {
    const u = umsatz({ name: "Telekom Deutschland GmbH", zweck: "Kd-Nr. 123 456 Rechnung Oktober", iban: "DE02120300000000202051" });
    expect(regelPasst(regel({ name_enthaelt: "telekom" }), u)).toBe(true);
    expect(regelPasst(regel({ name_enthaelt: "Telekom", zweck_enthaelt: "kdnr 123456" }), u)).toBe(true);
    expect(regelPasst(regel({ name_enthaelt: "Telekom", zweck_enthaelt: "November" }), u)).toBe(false);
    expect(regelPasst(regel({ iban: "DE02 1203 0000 0000 2020 51" }), u)).toBe(true);
    expect(regelPasst(regel({ iban: "DE89370400440532013000" }), u)).toBe(false);
  });

  it("Richtung, ausgeschaltet und ohne Bedingung", () => {
    const aus = umsatz({ name: "Telekom", betrag: -10 });
    const ein = umsatz({ name: "Telekom", betrag: 10 });
    expect(regelPasst(regel({ name_enthaelt: "Telekom", richtung: "aus" }), aus)).toBe(true);
    expect(regelPasst(regel({ name_enthaelt: "Telekom", richtung: "aus" }), ein)).toBe(false);
    expect(regelPasst(regel({ name_enthaelt: "Telekom", richtung: "ein" }), ein)).toBe(true);
    expect(regelPasst(regel({ name_enthaelt: "Telekom", aktiv: false }), aus)).toBe(false);
    expect(regelPasst(regel({}), aus)).toBe(false);
    expect(regelPasst(regel({ name_enthaelt: " - " }), aus)).toBe(false);
  });

  it("von mehreren passenden gewinnt die genauere", () => {
    const u = umsatz({ name: "Aral Tankstelle", zweck: "Karte 4711 Transporter T2" });
    const allgemein = regel({ id: "a", bezeichnung: "Tanken", name_enthaelt: "Aral", konto: 4530 });
    const genau = regel({ id: "b", bezeichnung: "Tanken T2", name_enthaelt: "Aral", zweck_enthaelt: "T2", konto: 4530, kost1: "T2" });
    expect(regelFuer(u, [allgemein, genau])?.id).toBe("b");
    expect(regelFuer(umsatz({ name: "Aral", zweck: "Karte 4711 T1" }), [allgemein, genau])?.id).toBe("a");
    expect(regelFuer(umsatz({ name: "Shell" }), [allgemein, genau])).toBeNull();
    // Gleich viele Bedingungen: die mit Richtung vor „beide“.
    const nurAus = regel({ id: "c", bezeichnung: "Z", name_enthaelt: "Aral", richtung: "aus" });
    expect(regelFuer(umsatz({ name: "Aral" }), [allgemein, nurAus])?.id).toBe("c");
  });

  it("Richtungen wie in der Prüfregel, Geldtransit wie in den Kontenrahmen", () => {
    const sql = MIG.match(/constraint fin_br_richtung check \(richtung in \(([^)]*)\)\)/)![1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
    expect(FIN_BANKREGEL_RICHTUNGEN.map((r) => r.wert).sort()).toEqual(sql.sort());
    expect(MIG88).toContain(`('skr03', ${FIN_GELDTRANSIT.skr03}, 'Geldtransit', 'geld')`);
    expect(MIG88).toContain(`('skr04', ${FIN_GELDTRANSIT.skr04}, 'Geldtransit', 'geld')`);
  });
});

describe("Sammelzuordnung", () => {
  it("Eingang: offene Rechnungen, Nummer im Zweck zuerst, bezahlte und stornierte fallen weg", () => {
    const k = sammelKandidaten(umsatz({ betrag: 238, name: "Muster GmbH", zweck: "RE-2026-0043" }), [
      rechnung({ rechnung_id: "r1", datum: "2026-09-01" }),
      rechnung({ rechnung_id: "r2", nummer_text: "RE-2026-0043", datum: "2026-10-02" }),
      rechnung({ rechnung_id: "r3", nummer_text: "RE-2026-0044", kunde: "Andere AG", datum: "2026-08-01" }),
      rechnung({ rechnung_id: "r4", bezahlt_am: "2026-10-03" }),
      rechnung({ rechnung_id: "r5", storniert: true }),
    ], [beleg({})], LIEF);
    expect(k.map((x) => x.id)).toEqual(["r2", "r1", "r3"]);
    expect(k[0]).toMatchObject({ art: "rechnung", rest: 119, nummerImZweck: true, namePasst: true });
  });

  it("Abbuchung: offene Belege mit Lieferant", () => {
    const k = sammelKandidaten(umsatz({ betrag: -60, name: "Reifen Nord", zweck: "Belege 77 und 78" }), [rechnung({})], [
      beleg({ id: "b1" }), beleg({ id: "b2", belegnummer: "78", belegdatum: "2026-10-02" }), beleg({ id: "b3", bezahlt_am: "2026-10-01" }),
      beleg({ id: "b4", status: "entwurf" }),
    ], LIEF);
    expect(k.map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(k[0].titel).toBe("Reifen Nord · 77");
  });

  it("verteilt der Reihe nach bis zum offenen Rest, der Rest bleibt fürs Konto", () => {
    const m = sammelVerteilen(-200, [{ id: "a", rest: 119 }, { id: "b", rest: 119 }]);
    expect([...m.entries()]).toEqual([["a", 119], ["b", 81]]);
    expect(sammelRest(250, [{ betrag: 119 }, { betrag: 119 }])).toBe(12);
    expect(sammelRest(-200, [{ betrag: 119 }, { betrag: 119 }])).toBe(-38);
    expect(sammelRest(0.3, [{ betrag: 0.1 }, { betrag: 0.2 }])).toBe(0);
  });
});

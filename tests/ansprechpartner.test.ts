import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Ansprechpartner, Customer, Order, Vehicle } from "@/lib/types";
import {
  abweichenderOrt, apAnzeige, apMaengel, apsDerGruppe, apsVonKunde, apSuchtexte, hatEigeneAdresse, kartenNadeln,
  wechselortAusAuftrag, wechselortGleich, wechselortMangel, wechselortSpalten, wechselortText, wechselortVorschlag,
  type WechselortEingabe,
} from "@/lib/ansprechpartner";
import { kundeFuerAuftrag, kundeZumAuftrag } from "@/lib/laufkunde";
import { bestaetigungText } from "@/lib/terminBestaetigung";
import { ansprechpartnerZeile, wechselortZeile } from "@/lib/auskunft";

// Ansprechpartner je Kunde und Wechselort am Auftrag (Migration 117, v189). Erfundene Daten.
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "117_ansprechpartner_und_wechselort.sql"), "utf8");
const ROLL = readFileSync(join(__dirname, "..", "supabase", "migrations", "rollback", "117_rollback.sql"), "utf8");

const HEUTE = "2026-11-03";
const k = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id, kundennummer: 10000, name: "", company: "Firma " + id, anrede: null, address: "Firmenweg 1, 90402 Nürnberg", email: null, note: null,
  phone_mobile: null, phone_landline: null, lat: 49.45, lng: 11.07, geo_genauigkeit: "exakt", status: "offen", last_contact: HEUTE,
  kontakt_ergebnis: null, wiedervorlage_am: null, haupt_kunde_id: null, laufkundschaft: false, einmalkunde: false, testkunde: false,
  active: true, deleted_at: null, auf_karte: true, ...extra,
}) as unknown as Customer;
const ap = (id: string, kunde: string, extra: Partial<Ansprechpartner> = {}): Ansprechpartner => ({
  id, customer_id: kunde, anrede: "Herr", name: "Person " + id, funktion: null, telefon: null, email: null, address: null,
  lat: null, lng: null, geo_genauigkeit: null, auf_karte: false, notiz: null, sortierung: 1, ...extra,
});
const auftrag = (id: string, kunde: string, extra: Partial<Order> = {}): Order => ({
  id, customer_id: kunde, status: "offen", order_date: "2026-11-10", deleted_at: null, wechselort: null, ansprechpartner_id: null,
  einsatz_name: null, einsatz_adresse: null, einsatz_lat: null, einsatz_lng: null, einsatz_geo_genauigkeit: null, ...extra,
}) as unknown as Order;

const LEER: WechselortEingabe = { art: null, ansprechpartnerId: null, name: "", adresse: "", lat: null, lng: null, geo: null };

describe("Ansprechpartner – Anzeige und Reihenfolge", () => {
  it("Anrede und Name, ohne Anrede nur der Name", () => {
    expect(apAnzeige({ anrede: "Frau", name: "Petra Beispiel" })).toBe("Frau Petra Beispiel");
    expect(apAnzeige({ anrede: null, name: "Fuhrpark" })).toBe("Fuhrpark");
  });
  it("je Kunde nach Sortierung, dann Name", () => {
    const aps = [ap("b", "f1", { sortierung: 2 }), ap("c", "f2"), ap("a", "f1", { sortierung: 1, name: "Zoe" }), ap("d", "f1", { sortierung: 1, name: "Anna" })];
    expect(apsVonKunde("f1", aps).map((a) => a.id)).toEqual(["d", "a", "b"]);
  });
  it("eigene Adresse nur, wenn etwas drinsteht", () => {
    expect(hatEigeneAdresse({ address: "  " })).toBe(false);
    expect(hatEigeneAdresse({ address: null })).toBe(false);
    expect(hatEigeneAdresse({ address: "Weg 2" })).toBe(true);
  });
  it("in einer Gruppe alle Ansprechpartner aller Mitglieder, Hauptkunde zuerst", () => {
    const H = k("h", { company: "Gruppe" });
    const U1 = k("u1", { company: "Beta", haupt_kunde_id: "h" });
    const U2 = k("u2", { company: "Alpha", haupt_kunde_id: "h" });
    const X = k("x");
    const aps = [ap("1", "u1"), ap("2", "h"), ap("3", "u2"), ap("4", "x")];
    expect(apsDerGruppe("u1", [H, U1, U2, X], aps).map((e) => `${e.kunde.id}:${e.ap.id}`)).toEqual(["h:2", "u2:3", "u1:1"]);
    expect(apsDerGruppe("x", [H, U1, U2, X], aps).map((e) => e.ap.id)).toEqual(["4"]);
    expect(apsDerGruppe(null, [H], aps)).toEqual([]);
  });
  it("Suche findet die Firma über den Ansprechpartner", () => {
    const t = apSuchtexte([ap("1", "f1", { name: "Max Muster", telefon: "0911 1" }), ap("2", "f1", { name: "Eva Weg" })]);
    expect(t.get("f1")).toContain("Max Muster");
    expect(t.get("f1")).toContain("Eva Weg");
    expect(t.get("f1")).toContain("0911 1");
  });
  it("Formular: Name Pflicht, Nadel nur mit Adresse", () => {
    const e = { anrede: null, name: " ", funktion: null, telefon: null, email: null, address: null, auf_karte: false, notiz: null };
    expect(apMaengel(e)).toBe("Den Namen eintragen.");
    expect(apMaengel({ ...e, name: "Max", auf_karte: true })).toContain("Adresse");
    expect(apMaengel({ ...e, name: "Max", auf_karte: true, address: "Weg 1" })).toBeNull();
  });
});

describe("Wechselort", () => {
  it("Spalten: einmalig mit Adresse, beim Ansprechpartner nur die Wahl, sonst alles leer", () => {
    expect(wechselortSpalten({ ...LEER, art: "einmalig", name: " Baustelle ", adresse: " Hafen 3 ", lat: 1, lng: 2, geo: "exakt" }))
      .toEqual({ wechselort: "einmalig", ansprechpartner_id: null, einsatz_name: "Baustelle", einsatz_adresse: "Hafen 3", einsatz_lat: 1, einsatz_lng: 2, einsatz_geo_genauigkeit: "exakt" });
    expect(wechselortSpalten({ ...LEER, art: "ansprechpartner", ansprechpartnerId: "a1", adresse: "egal" }))
      .toMatchObject({ wechselort: "ansprechpartner", ansprechpartner_id: "a1", einsatz_adresse: null });
    expect(Object.values(wechselortSpalten(LEER)).every((v) => v === null)).toBe(true);
  });
  it("aus dem Auftrag zurück und Vergleich", () => {
    const e = wechselortAusAuftrag({ wechselort: "einmalig", einsatz_adresse: "Hafen 3", einsatz_lat: 1, einsatz_lng: 2 });
    expect(e.art).toBe("einmalig");
    expect(wechselortGleich(e, { ...e, adresse: " Hafen 3 " })).toBe(true);
    expect(wechselortGleich(e, { ...e, lat: 5 })).toBe(false);
    expect(wechselortGleich({ ...LEER, art: "ansprechpartner", ansprechpartnerId: "a", name: "x" }, { ...LEER, art: "ansprechpartner", ansprechpartnerId: "a" })).toBe(true);
    expect(wechselortGleich(LEER, { ...LEER, art: "einmalig" })).toBe(false);
  });
  it("Mängel", () => {
    expect(wechselortMangel({ ...LEER, art: "ansprechpartner" })).toContain("Ansprechpartner");
    expect(wechselortMangel({ ...LEER, art: "einmalig", adresse: " " })).toContain("Adresse");
    expect(wechselortMangel(LEER)).toBeNull();
  });
  it("abweichender Ort und Text", () => {
    expect(abweichenderOrt({ wechselort: null, einsatz_adresse: "Hafen" })).toBeNull();
    expect(abweichenderOrt({ wechselort: "einmalig", einsatz_adresse: " " })).toBeNull();
    expect(abweichenderOrt({ wechselort: "ansprechpartner", einsatz_adresse: "Nordring 5", einsatz_lat: 3, einsatz_lng: 4 }))
      .toEqual({ address: "Nordring 5", lat: 3, lng: 4, geo_genauigkeit: null });
    expect(wechselortText({ wechselort: "ansprechpartner", einsatz_name: "Herr Max Muster", einsatz_adresse: "Nordring 5" })).toBe("bei Herr Max Muster · Nordring 5");
    expect(wechselortText({ wechselort: "einmalig", einsatz_adresse: "Hafen 3" })).toBe("Hafen 3");
    expect(wechselortText({ wechselort: null })).toBeNull();
  });
  it("Vorschlag nur bei genau einem Ansprechpartner mit Adresse", () => {
    const aps = [ap("a", "f1", { address: "Weg 2" }), ap("b", "f1", { address: "Weg 3" }), ap("c", "f1")];
    const fz = (id: string, apId: string | null) => ({ id, ansprechpartner_id: apId }) as Pick<Vehicle, "id" | "ansprechpartner_id">;
    expect(wechselortVorschlag(["1", "2"], [fz("1", "a"), fz("2", null)], aps)?.id).toBe("a");
    expect(wechselortVorschlag(["1", "2"], [fz("1", "a"), fz("2", "b")], aps)).toBeNull();
    expect(wechselortVorschlag(["1"], [fz("1", "c")], aps)).toBeNull();
    expect(wechselortVorschlag(["9"], [fz("1", "a")], aps)).toBeNull();
  });
});

describe("Auflösung im Auftrag (lib/laufkunde.ts)", () => {
  it("ein Wechselort ersetzt die Adresse und die Koordinaten – Name und Rechnung bleiben beim Kunden", () => {
    const kunde = k("f1");
    const o = auftrag("o1", "f1", { wechselort: "ansprechpartner", einsatz_name: "Herr Max Muster", einsatz_adresse: "Nordring 5", einsatz_lat: 49.5, einsatz_lng: 11.1 });
    const r = kundeFuerAuftrag(o, [kunde])!;
    expect(r.address).toBe("Nordring 5");
    expect(r.lat).toBe(49.5);
    expect(r.company).toBe("Firma f1");
    expect(r.id).toBe("f1");
  });
  it("ohne Wechselort bleibt der Kunde unverändert", () => {
    const kunde = k("f1");
    expect(kundeZumAuftrag({ laufkunde_name: null, laufkunde_telefon: null, laufkunde_ort: null }, kunde)).toBe(kunde);
  });
});

describe("Terminbestätigung an einem anderen Ort", () => {
  it("„in“ statt „bei Ihnen in“", () => {
    const d = { art: "bestaetigung" as const, auftrag: { order_date: "2026-11-10", time: null, end_time: null },
      kunde: { anrede: "Herr" as const, name: "Max Muster", address: "Nordring 5, Nürnberg" }, kennzeichen: [], betrieb: null, heute: HEUTE };
    expect(bestaetigungText(d)).toContain("bei Ihnen in Nordring 5");
    expect(bestaetigungText({ ...d, woAnders: true })).toContain("Termin am Dienstag, 10. November 2026 in Nordring 5");
  });
});

describe("Auskunft", () => {
  it("Zeilen für Ansprechpartner und Wechselorte", () => {
    const z = ansprechpartnerZeile({ anrede: "Frau", name: "Eva Weg", funktion: "Fuhrpark", telefon: "0911 2", email: null, adresse: "Weg 2" } as never);
    expect(z.join(" ")).toContain("Eva Weg");
    expect(z.join(" ")).toContain("Weg 2");
    const w = wechselortZeile({ auftrag: 1042, datum: "2026-11-10", bei: "Frau Eva Weg", adresse: "Weg 2" });
    expect(w.join(" ")).toContain("Weg 2");
  });
});

describe("Karte", () => {
  const F = k("f1");
  const AUS = k("f2", { auf_karte: false, lat: 49.3, lng: 11.2 });
  const A1 = ap("a1", "f1", { address: "Weg 2", lat: 49.6, lng: 11.0, auf_karte: true });
  const A2 = ap("a2", "f1", { address: "Weg 3", lat: 49.7, lng: 11.0, auf_karte: false });

  it("Kunde und Ansprechpartner mit Nadel – beide im Zustand des Kunden", () => {
    const n = kartenNadeln([F], [A1, A2], [], 12, HEUTE);
    expect(n.map((x) => x.key)).toEqual(["f1", "ap:a1"]);
    expect(n[1].kunde.id).toBe("f1");
    expect(n[1].titel).toBe("Firma f1 · Herr Person a1");
    expect(n[1].zustand).toBe(n[0].zustand);
    expect(n[1].zustand).not.toBe("termin");
  });
  it("ein Termin beim Ansprechpartner färbt nur dessen Nadel", () => {
    const o = auftrag("o1", "f1", { wechselort: "ansprechpartner", ansprechpartner_id: "a1", einsatz_adresse: "Weg 2", einsatz_lat: 49.6, einsatz_lng: 11.0 });
    const n = kartenNadeln([F], [A1], [o], 12, HEUTE);
    expect(n.find((x) => x.key === "f1")!.zustand).not.toBe("termin");
    expect(n.find((x) => x.key === "ap:a1")!.zustand).toBe("termin");
    expect(n.find((x) => x.key === "ap:a1")!.termine.map((t) => t.id)).toEqual(["o1"]);
  });
  it("von der Karte genommen: nur solange dort ein Termin ansteht", () => {
    expect(kartenNadeln([AUS], [], [], 12, HEUTE)).toEqual([]);
    const o = auftrag("o2", "f2");
    expect(kartenNadeln([AUS], [], [o], 12, HEUTE).map((x) => [x.key, x.zustand])).toEqual([["f2", "termin"]]);
    // Vergangen oder erledigt zählt nicht.
    expect(kartenNadeln([AUS], [], [auftrag("o3", "f2", { order_date: "2026-11-01" })], 12, HEUTE)).toEqual([]);
    expect(kartenNadeln([AUS], [], [auftrag("o4", "f2", { status: "erledigt" })], 12, HEUTE)).toEqual([]);
  });
  it("Termin woanders (einmalig oder Ansprechpartner ohne Nadel): eigene Nadel am Einsatzort", () => {
    const o1 = auftrag("o1", "f1", { wechselort: "einmalig", einsatz_name: "Baustelle", einsatz_adresse: "Hafen 3", einsatz_lat: 49.2, einsatz_lng: 11.3 });
    const o2 = auftrag("o2", "f1", { wechselort: "ansprechpartner", ansprechpartner_id: "a2", einsatz_name: "Herr Person a2", einsatz_adresse: "Weg 3", einsatz_lat: 49.7, einsatz_lng: 11.0 });
    const n = kartenNadeln([F], [A2], [o1, o2], 12, HEUTE);
    expect(n.map((x) => x.key)).toEqual(["f1", "auftrag:o1", "auftrag:o2"]);
    expect(n[1].titel).toBe("Firma f1 · Baustelle");
    expect(n[1].zustand).toBe("termin");
    // Die Firma selbst hat keinen Termin.
    expect(n[0].zustand).not.toBe("termin");
  });
  it("deaktivierte Kunden zeigen auch ihre Ansprechpartner nicht", () => {
    expect(kartenNadeln([k("f1", { active: false })], [A1], [], 12, HEUTE)).toEqual([]);
  });
});

describe("Migration 117 und Rücknahme", () => {
  it("Wächter, Tabelle, Nachziehen, Schwärzen, Auskunft", () => {
    expect(MIG).toMatch(/create table if not exists public\.kunden_ansprechpartner/);
    expect(MIG).toMatch(/kap_karte/);
    expect(MIG).toMatch(/function public\.auftrag_wechselort\(\)/);
    expect(MIG).toMatch(/function public\.ansprechpartner_nachziehen\(\)/);
    expect(MIG).toMatch(/function public\.fahrzeug_ansprechpartner_pruefen\(\)/);
    expect(MIG).toMatch(/'kunden_ansprechpartner'/);
    expect(MIG).toMatch(/'wechselorte'/);
    expect(MIG).toMatch(/trg_loeschrecht/);
  });
  it("die Rücknahme prüft und löscht in EINEM Block", () => {
    expect((ROLL.match(/do \$rueck\$/g) ?? []).length).toBe(1);
    expect(ROLL.indexOf("raise exception")).toBeLessThan(ROLL.indexOf("drop table if exists public.kunden_ansprechpartner"));
  });
});

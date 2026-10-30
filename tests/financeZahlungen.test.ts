// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_SEPA_FORMAT, FIN_ZAHLUNG_VORLAUF_TAGE, auftragZustand, faelligVorschlag, plusTage, sepaDateiname, sepaText, sepaXml, skontoBis,
  zahlauftragTreffer, zahlungsvorschlag, type FinZahlauftrag, type FinZahlauftragPosten,
} from "@/lib/finance/zahlungen";
import { FIN_SKONTO_HOECHST } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";

// Stufe E Teil 2 (Migration 113, v186): Zahlungsvorschlag und SEPA-Datei. Beispieldaten erfunden (IBANs aus der Norm).
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "113_finance_zahlungsausgang.sql"), "utf8");
const beleg = (p: Partial<FinBeleg>): FinBeleg => ({
  id: "b1", lieferant_id: "l1", belegdatum: "2026-10-01", belegnummer: "LR-1", text: null, faellig_am: null, posten: [], datei_pfad: null, datei_typ: null,
  datei_name: null, status: "gebucht", brutto: 119, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01T00:00:00Z", ...p,
});
const LIEF: FinLieferant[] = [
  { id: "l1", name: "Reifen Nord GmbH", ust_id: null, konto: null, steuer: null, aktiv: true, iban: "DE02120300000000202051", bic: "BYLADEM1001", zahlungsziel_tage: 30, skonto_prozent: 2, skonto_tage: 10 },
  { id: "l2", name: "Ohne Bank", ust_id: null, konto: null, steuer: null, aktiv: true },
];
const posten = (p: Partial<FinZahlauftragPosten>): FinZahlauftragPosten => ({
  id: "p1", auftrag_id: "a1", beleg_id: "b1", lieferant_id: "l1", name: "Reifen Nord GmbH", iban: "DE02120300000000202051", bic: "BYLADEM1001",
  betrag: 116.62, skonto: 2.38, zweck: "Rechnung LR-1 abzgl. Skonto 2,38", e2e: "Bb1", ...p,
});
const auftrag = (p: Partial<FinZahlauftrag>): FinZahlauftrag => ({
  id: "a1", bankkonto_id: "k1", ausfuehrung: "2026-10-08", msg_id: "MR20261007120000000ABCDEF12", anzahl: 1, summe: 116.62, status: "erstellt",
  verworfen_grund: null, erstellt_am: "2026-10-07T12:00:00.000Z", fin_zahlauftrag_posten: [posten({})], ...p,
});

describe("Zahlungsbedingungen", () => {
  it("Fälligkeit und Skontofrist aus dem Lieferanten", () => {
    expect(plusTage("2026-12-20", 30)).toBe("2027-01-19");
    expect(faelligVorschlag(LIEF[0], "2026-10-01")).toBe("2026-10-31");
    expect(faelligVorschlag(LIEF[1], "2026-10-01")).toBeNull();
    expect(skontoBis(LIEF[0], "2026-10-01")).toBe("2026-10-11");
    expect(skontoBis(LIEF[1], "2026-10-01")).toBeNull();
    expect(FIN_ZAHLUNG_VORLAUF_TAGE).toBeGreaterThan(0);
  });

  it("Skonto höchstens 10 % wie in der Prüfregel der Migration und in FIN_SKONTO_HOECHST", () => {
    expect(MIG).toContain("skonto_prozent <= 10");
    expect(MIG).toContain("round(b.brutto * 0.10, 2)");
    expect(FIN_SKONTO_HOECHST).toBe(0.1);
  });
});

describe("Zahlungsvorschlag", () => {
  it("fällig bis zum Stichtag oder mit Skonto; ohne IBAN mit Grund; im offenen Auftrag nicht", () => {
    const belege = [
      beleg({ id: "b1", belegdatum: "2026-10-01" }),                                  // Skonto bis 11.10., fällig 31.10.
      beleg({ id: "b2", belegdatum: "2026-09-01", belegnummer: "LR-0" }),             // fällig 01.10., Skonto vorbei
      beleg({ id: "b3", belegdatum: "2026-10-05", faellig_am: "2026-12-01" }),        // Skonto bis 15.10.
      beleg({ id: "b4", lieferant_id: "l2", belegdatum: "2026-09-01", faellig_am: "2026-09-15" }),
      beleg({ id: "b5", bezahlt_am: "2026-10-02" }),
      beleg({ id: "b6", status: "entwurf" }),
      beleg({ id: "b7", belegdatum: "2026-08-01", teilbezahlt: 19 }),                   // fällig 31.08., Rest 100
      beleg({ id: "b8", belegdatum: "2026-09-01" }),
    ];
    const v = zahlungsvorschlag(belege, LIEF, [auftrag({ fin_zahlauftrag_posten: [posten({ beleg_id: "b8" })] })], "2026-10-15", "2026-10-09");
    expect(v.map((x) => x.beleg.id)).toEqual(["b7", "b4", "b2", "b1", "b3"]);
    const b1 = v.find((x) => x.beleg.id === "b1")!;
    expect(b1).toMatchObject({ skonto: 2.38, betrag: 116.62, skontoBis: "2026-10-11", faellig: "2026-10-31", grund: null });
    expect(v.find((x) => x.beleg.id === "b7")).toMatchObject({ rest: 100, skonto: 0, betrag: 100 });
    expect(v.find((x) => x.beleg.id === "b4")!.grund).toBe("keine IBAN beim Lieferanten");
    // Nach der Skontofrist: nur, was fällig ist.
    expect(zahlungsvorschlag([beleg({})], LIEF, [], "2026-10-15", "2026-10-12")).toEqual([]);
    // Verworfener Auftrag gibt den Beleg frei.
    expect(zahlungsvorschlag([beleg({ id: "b8", belegdatum: "2026-09-01" })], LIEF, [auftrag({ status: "verworfen", fin_zahlauftrag_posten: [posten({ beleg_id: "b8" })] })], "2026-10-15", "2026-10-09")).toHaveLength(1);
  });

  it("Zustand eines Zahlauftrags", () => {
    const a = auftrag({ fin_zahlauftrag_posten: [posten({ beleg_id: "b1" }), posten({ id: "p2", beleg_id: "b2" })] });
    expect(auftragZustand(a, [beleg({ id: "b1" }), beleg({ id: "b2" })])).toBe("offen");
    expect(auftragZustand(a, [beleg({ id: "b1", bezahlt_am: "2026-10-09" }), beleg({ id: "b2" })])).toBe("teilweise");
    expect(auftragZustand(a, [beleg({ id: "b1", bezahlt_am: "2026-10-09" }), beleg({ id: "b2", bezahlt_am: "2026-10-09" })])).toBe("erledigt");
    expect(auftragZustand({ ...a, status: "verworfen" }, [])).toBe("verworfen");
  });

  it("Abbuchung findet ihren Posten – einzeln oder als Sammelbuchung", () => {
    const a = auftrag({ fin_zahlauftrag_posten: [posten({}), posten({ id: "p2", beleg_id: "b2", betrag: 50, iban: "DE89370400440532013000", zweck: "Rechnung X-2", e2e: "Bb2" })] });
    const belege = [beleg({ id: "b1" }), beleg({ id: "b2" })];
    expect(zahlauftragTreffer({ betrag: -116.62, zweck: "Rechnung LR-1 abzgl. Skonto 2,38", name: "Reifen Nord", iban: null }, [a], belege)?.posten.map((p) => p.id)).toEqual(["p1"]);
    expect(zahlauftragTreffer({ betrag: -50, zweck: "x", name: null, iban: "DE89 3704 0044 0532 0130 00" }, [a], belege)?.posten.map((p) => p.id)).toEqual(["p2"]);
    expect(zahlauftragTreffer({ betrag: -166.62, zweck: "Sammler", name: null, iban: null }, [a], belege)?.posten).toHaveLength(2);
    expect(zahlauftragTreffer({ betrag: -116.62, zweck: "andere", name: null, iban: null }, [a], belege)).toBeNull();
    expect(zahlauftragTreffer({ betrag: 116.62, zweck: "Rechnung LR-1", name: null, iban: null }, [a], belege)).toBeNull();
    expect(zahlauftragTreffer({ betrag: -116.62, zweck: "Rechnung LR-1", name: null, iban: null }, [{ ...a, status: "verworfen" }], belege)).toBeNull();
  });
});

describe("SEPA-Datei", () => {
  it("Text im SEPA-Zeichensatz", () => {
    expect(sepaText("Müller & Söhne – Straße „Nord“", 70)).toBe("Mueller + Soehne - Strasse 'Nord'");
    expect(sepaText("Café #1 <x>", 70)).toBe("Cafe 1 x");
    expect(sepaText("   ", 10)).toBe("-");
    expect(sepaText("a".repeat(80), 70)).toHaveLength(70);
  });

  it("pain.001.001.09 mit Summe, Einzelbuchung, BIC oder NOTPROVIDED", () => {
    const a = auftrag({});
    const xml = sepaXml(a, [posten({}), posten({ id: "p2", name: "Öl & Co", bic: null, betrag: 50, iban: "DE89370400440532013000", zweck: "Rechnung 7", e2e: "Bb2" })],
      { name: "Mobiler Reifenservice Müller", iban: "DE12500105170648489890", bic: null });
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.namespaceURI).toBe(`urn:iso:std:iso:20022:tech:xsd:${FIN_SEPA_FORMAT}`);
    const t = (n: string) => Array.from(doc.getElementsByTagName(n)).map((e) => e.textContent);
    expect(t("NbOfTxs")).toEqual(["2", "2"]);
    expect(t("CtrlSum")).toEqual(["166.62", "166.62"]);
    expect(t("BtchBookg")).toEqual(["false"]);
    expect(t("Dt")).toEqual(["2026-10-08"]);
    expect(t("CreDtTm")).toEqual(["2026-10-07T12:00:00"]);
    expect(t("IBAN")).toEqual(["DE12500105170648489890", "DE02120300000000202051", "DE89370400440532013000"]);
    expect(t("BICFI")).toEqual(["BYLADEM1001"]);
    expect(t("Id").filter((x) => x === "NOTPROVIDED")).toHaveLength(1);
    expect(t("Nm")).toEqual(["Mobiler Reifenservice Mueller", "Mobiler Reifenservice Mueller", "Reifen Nord GmbH", "Oel + Co"]);
    expect(t("InstdAmt")).toEqual(["116.62", "50.00"]);
    expect(t("EndToEndId")).toEqual(["Bb1", "Bb2"]);
    expect(t("Ustrd")[0]).toBe("Rechnung LR-1 abzgl. Skonto 2,38");
    expect(sepaDateiname(a)).toBe("SEPA-Ueberweisungen_2026-10-08_ABCDEF12.xml");
  });
});

import { describe, expect, it } from "vitest";
import {
  aktuelleOderLetzteSaison, aktuelleOderNaechsteSaison, ausDemRegal, belegtAm, belegungVerlauf, einsatz,
  erbrachtNichtAbgerechnet, lagerAusblick, lagerBewegung, monatsreihe, neuAngelegteKunden, neuUndBestand, postenFuerPerson,
  rasterHinweis, umsatzJeMonat, umsatzposten, umsatzstaerksteKunden, umsatzSumme, veraenderung, verschiebeJahr, vorigeSaison,
  vorjahr, wiederkehr, zeitraumFuer, zeitraumTitel,
} from "@/lib/auswertungAnsicht";
import type { Customer, Employee, Order, OrderStatus, Rechnung, TireStorage } from "@/lib/types";

// Die Regeln hinter der neuen Auswertungsseite (Entwurf M).

const HEUTE = "2026-09-25";

let n = 0;
const o = (datum: string, status: OrderStatus, extra: Partial<Order> = {}): Order => ({
  id: "o" + ++n, order_number: n, customer_id: "c1", title: "", description: "", status, order_date: datum,
  time: "09:00", end_time: "10:00", rechnung_noetig: false, rechnung_erstellt_am: null, deleted_at: null, ...extra,
}) as unknown as Order;
const r = (datum: string, netto: number, extra: Partial<Rechnung> = {}): Rechnung => ({
  id: "r" + ++n, nummer: n, nummer_text: "RE" + n, art: "rechnung", datum, netto, steuer: netto * 0.19, brutto: netto * 1.19,
  customer_id: "c1", order_id: null, kundennummer: 10001, lieferdatum: null, storniert_durch: null, hebt_auf: null,
  empfaenger: { name: "Max", company: null, anrede: null, address: "", email: null, kundennummer: 10001 }, positionen: [], ...extra,
}) as unknown as Rechnung;
const k = (id: string, extra: Partial<Customer> = {}): Customer => ({ id, name: "Kunde " + id, company: null, laufkundschaft: false, einmalkunde: false, ...extra }) as unknown as Customer;
const satz = (created: string, removed: string | null, extra: Partial<TireStorage> = {}): TireStorage =>
  ({ id: "s" + ++n, customer_id: "c1", saison: "winter", created_at: created + "T10:00:00Z", removed_at: removed ? removed + "T10:00:00Z" : null, ...extra }) as unknown as TireStorage;

describe("Zeiträume", () => {
  it("Monat, Quartal, Jahr bis heute", () => {
    expect(zeitraumFuer("monat", HEUTE)).toEqual({ von: "2026-09-01", bis: HEUTE });
    expect(zeitraumFuer("quartal", HEUTE)).toEqual({ von: "2026-07-01", bis: HEUTE });
    expect(zeitraumFuer("jahr", HEUTE)).toEqual({ von: "2026-01-01", bis: HEUTE });
    expect(zeitraumFuer("l12", HEUTE)).toEqual({ von: "2025-09-26", bis: HEUTE });
  });
  it("Saison: laufende bis heute, zwischen den Saisons die letzte ganz", () => {
    expect(zeitraumFuer("saison", HEUTE)).toEqual({ von: "2026-09-01", bis: HEUTE });
    expect(zeitraumFuer("saison", "2026-07-10")).toEqual({ von: "2026-03-01", bis: "2026-05-31" });
    expect(zeitraumFuer("saison", "2026-01-15")).toEqual({ von: "2025-09-01", bis: "2025-11-30" });
  });
  it("aktuelle, nächste, vorige Saison", () => {
    expect(aktuelleOderNaechsteSaison("2026-07-10").art).toBe("herbst");
    expect(aktuelleOderNaechsteSaison("2026-12-10")).toMatchObject({ art: "fruehjahr", jahr: 2027 });
    expect(aktuelleOderLetzteSaison("2026-12-10")).toMatchObject({ art: "herbst", jahr: 2026 });
    expect(vorigeSaison(aktuelleOderNaechsteSaison(HEUTE))).toMatchObject({ art: "fruehjahr", jahr: 2026, von: "2026-03-01", bis: "2026-05-31" });
  });
  it("Vorjahr bis zum selben Tag, 29. Februar wird 28.", () => {
    expect(vorjahr({ von: "2026-09-01", bis: HEUTE })).toEqual({ von: "2025-09-01", bis: "2025-09-25" });
    expect(verschiebeJahr("2028-02-29", -1)).toBe("2027-02-28");
  });
  it("Titel", () => {
    expect(zeitraumTitel("monat", { von: "2026-09-01", bis: HEUTE })).toBe("September 2026");
    expect(zeitraumTitel("quartal", { von: "2026-07-01", bis: HEUTE })).toBe("3. Quartal 2026");
    expect(zeitraumTitel("saison", { von: "2026-03-01", bis: "2026-05-31" })).toBe("Frühjahrssaison 2026");
    expect(zeitraumTitel("frei", { von: "2026-01-05", bis: "2026-02-10" })).toBe("5.1.2026 – 10.2.2026");
  });
  it("Monatsreihe: mindestens zwölf, bei längerem Zeitraum alle", () => {
    const m = monatsreihe({ von: "2026-09-01", bis: HEUTE });
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-10");
    expect(m[11]).toBe("2026-09");
    expect(monatsreihe({ von: "2024-01-01", bis: "2026-01-31" })).toHaveLength(25);
  });
  it("Veränderung", () => {
    expect(veraenderung(115, 100)).toBe(15);
    expect(veraenderung(80, 100)).toBe(-20);
    expect(veraenderung(5, 0)).toBeNull();
  });
});

describe("Umsatz aus dem Rechnungsbuch", () => {
  const summe = (x: Order) => ({ net: x.id === "ohneA" ? 50 : 100, vat: 0 });
  const auftragMitRechnung = o("2026-09-10", "erledigt", { id: "mit", rechnung_noetig: true, rechnung_erstellt_am: "2026-09-11" } as Partial<Order>);
  const auftragOhne = o("2026-09-12", "erledigt", { id: "ohneA" } as Partial<Order>);
  const offen = o("2026-09-13", "erledigt", { id: "offen", rechnung_noetig: true } as Partial<Order>);
  const rechnung = r("2026-09-11", 200, { order_id: "mit" });
  const storno = r("2026-09-20", -200, { art: "storno", order_id: "mit" } as Partial<Rechnung>);

  it("Rechnungen am Rechnungsdatum, dazu erledigte ohne Rechnung nötig; offene nicht", () => {
    const p = umsatzposten([rechnung], [auftragMitRechnung, auftragOhne, offen], summe, true);
    expect(p.map((x) => x.quelle)).toEqual(["rechnung", "ohne"]);
    const s = umsatzSumme(p, { von: "2026-09-01", bis: HEUTE });
    expect(s).toMatchObject({ netto: 250, mitRechnung: 200, ohneRechnung: 50, rechnungen: 1, ohneAnzahl: 1 });
  });
  it("Storno zieht an seinem Datum ab", () => {
    const p = umsatzposten([rechnung, storno], [], summe, true);
    expect(umsatzSumme(p, { von: "2026-09-01", bis: "2026-09-15" }).netto).toBe(200);
    expect(umsatzSumme(p, { von: "2026-09-01", bis: HEUTE })).toMatchObject({ netto: 0, stornos: 1, rechnungen: 1 });
  });
  it("ohne Rechnungsbuch: alle erledigten Aufträge wie bisher", () => {
    const p = umsatzposten([], [auftragMitRechnung, auftragOhne, offen], summe, false);
    expect(p).toHaveLength(3);
  });
  it("je Monat und je Person", () => {
    const p = umsatzposten([rechnung], [auftragOhne], summe, true);
    expect(umsatzJeMonat(p, ["2026-08", "2026-09"])).toEqual({ "2026-08": 0, "2026-09": 250 });
    expect(postenFuerPerson(p, "e1", { mit: ["e1"] }).map((x) => x.quelle)).toEqual(["rechnung"]);
    expect(postenFuerPerson(p, null, {})).toHaveLength(2);
  });
  it("erbracht, nicht abgerechnet", () => {
    expect(erbrachtNichtAbgerechnet([auftragMitRechnung, auftragOhne, offen]).map((x) => x.id)).toEqual(["offen"]);
  });
  it("umsatzstärkste Kunden ohne Laufkundschaft", () => {
    const p = umsatzposten([r("2026-09-02", 300, { customer_id: "c2" }), r("2026-09-03", 100, { customer_id: "c3" }), r("2026-09-04", 900, { customer_id: "lauf" })], [], summe, true);
    const top = umsatzstaerksteKunden(p, { von: "2026-09-01", bis: HEUTE }, [k("c2", { company: "Hofmann GmbH" }), k("c3"), k("lauf", { laufkundschaft: true })], 5);
    expect(top.map((x) => [x.name, x.netto])).toEqual([["Hofmann GmbH", 300], ["Kunde c3", 100]]);
  });
});

describe("Kunden", () => {
  const kunden = [k("a"), k("b"), k("c"), k("lauf", { laufkundschaft: true })];
  const orders = [
    o("2026-04-02", "erledigt", { customer_id: "a" }), o("2026-04-03", "erledigt", { customer_id: "b" }),
    o("2026-04-04", "erledigt", { customer_id: "c" }), o("2026-04-05", "erledigt", { customer_id: "lauf" }),
    o("2026-09-10", "erledigt", { customer_id: "a" }), o("2026-10-20", "offen", { customer_id: "b" }),
    o("2026-09-11", "storniert", { customer_id: "c" }),
  ];
  it("Wiederkehr: geplante zählen, stornierte nicht, Laufkundschaft nie", () => {
    const w = wiederkehr(orders, kunden, aktuelleOderNaechsteSaison(HEUTE));
    expect(w).toMatchObject({ basis: 3, wieder: 2, quote: 67, ohne: ["c"] });
  });
  it("neu angelegt und Bestand je Monat", () => {
    const kk = [k("a", { created_at: "2026-09-02T08:00:00Z" }), k("b", { created_at: "2025-01-01T08:00:00Z" })];
    const oo = [o("2026-09-10", "erledigt", { customer_id: "a" }), o("2026-09-11", "erledigt", { customer_id: "b" })];
    expect(neuUndBestand(oo, kk, ["2026-08", "2026-09"])).toEqual([{ monat: "2026-08", neu: 0, bestand: 0 }, { monat: "2026-09", neu: 1, bestand: 1 }]);
    expect(neuAngelegteKunden(oo, kk, { von: "2026-09-01", bis: HEUTE })).toBe(1);
  });
  it("aus dem Regal: nur liegende Sätze der Saison, mit/ohne Termin", () => {
    const saetze = [satz("2026-04-01", null, { customer_id: "a" }), satz("2026-04-01", null, { customer_id: "b" }), satz("2026-04-01", null, { customer_id: "c" }),
      satz("2026-04-01", "2026-09-01", { customer_id: "c" }), satz("2026-04-01", null, { customer_id: "d", saison: "sommer" })];
    const x = ausDemRegal(saetze, [o("2026-10-01", "offen", { customer_id: "b" }), o("2026-09-01", "offen", { customer_id: "a" })], "winter", HEUTE, 60);
    expect(x).toEqual({ saetze: 3, mitTermin: 1, ohneTermin: 2, kundenOhneTermin: 2, wertMit: 60, wertOhne: 120 });
    expect(ausDemRegal(saetze, [], "winter", HEUTE, null).wertOhne).toBeNull();
  });
});

describe("Einsatz", () => {
  const emp = [{ id: "e1", name: "Jan" }, { id: "e2", name: "Mira" }] as unknown as Employee[];
  const orders = [
    o("2026-09-21", "erledigt", { id: "x1", time: "09:00", end_time: "10:30" } as Partial<Order>), // Montag
    o("2026-09-21", "erledigt", { id: "x2", time: "13:00", end_time: null } as Partial<Order>),
    o("2026-09-26", "erledigt", { id: "x3", time: "09:30", end_time: "10:00" } as Partial<Order>), // Samstag
    o("2026-09-22", "erledigt", { id: "x4", time: null, end_time: null } as Partial<Order>),
    o("2026-09-22", "offen", { id: "x5" } as Partial<Order>),
  ];
  it("Minuten, Tage, Standarddauer ohne Ende, je Person voll", () => {
    const e = einsatz(orders, { x1: ["e1", "e2"], x2: ["e1"] }, emp, 60, { von: "2026-09-01", bis: "2026-09-30" });
    expect(e).toMatchObject({ minuten: 90 + 60 + 30, termine: 3, tage: 2, ohneEnde: 1, ohneZeit: 1 });
    expect(e.jePerson.map((p) => [p.name, p.minuten, p.termine])).toEqual([["Jan", 150, 2], ["Mira", 90, 1]]);
    // Montag 9–10 und 10–11 (bis 10:30), 13–14; Samstag 9–10
    expect(e.raster[0].slice(2, 4)).toEqual([1, 1]);
    expect(e.raster[0][6]).toBe(1);
    expect(e.raster[5][2]).toBe(1);
  });
  it("Hinweis erst ab genug Terminen", () => {
    const leer = Array.from({ length: 7 }, () => Array(12).fill(0));
    expect(rasterHinweis(leer)).toBeNull();
    const voll = leer.map((z) => z.slice());
    voll[5][2] = 8; voll[0][7] = 3; voll[1][7] = 0; voll[2][6] = 2; voll[3][6] = 1; voll[4][8] = 1;
    expect(rasterHinweis(voll)).toBe("Am vollsten: Samstag 9–10 Uhr. Am meisten Platz: Dienstagnachmittag – dort passen Termine aus der Anrufliste hin.");
  });
});

describe("Lager", () => {
  const s = [satz("2025-10-05", null), satz("2025-10-05", "2026-04-02"), satz("2026-04-02", null), satz("2026-09-10", null)];
  it("belegt am Stichtag", () => {
    expect(belegtAm(s, "2025-10-04")).toBe(0);
    expect(belegtAm(s, "2025-10-31")).toBe(2);
    expect(belegtAm(s, "2026-04-02")).toBe(2);
    expect(belegtAm(s, HEUTE)).toBe(3);
  });
  it("Verlauf je Monatsende, laufender Monat heute", () => {
    expect(belegungVerlauf(s, ["2025-10", "2026-04", "2026-09"], HEUTE)).toEqual([2, 2, 3]);
  });
  it("Bewegung und Liegedauer", () => {
    const b = lagerBewegung(s, { von: "2026-01-01", bis: HEUTE });
    expect(b.ein).toBe(2);
    expect(b.aus).toBe(1);
    expect(b.liegedauerMonate).toBeCloseTo(5.9, 1);
  });
  it("Ausblick aus dem Vorjahr", () => {
    const vj = [satz("2025-08-01", null), satz("2025-10-10", null), satz("2025-10-11", null)];
    expect(lagerAusblick(vj, HEUTE)).toEqual({ monat: "2026-10", zuwachsVorjahr: 2, erwartet: 5 });
    expect(lagerAusblick([satz("2026-09-01", null)], HEUTE)).toBeNull();
  });
});

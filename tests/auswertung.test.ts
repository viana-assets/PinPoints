import { describe, expect, it } from "vitest";
import { artikelDetail, jeArtikel, jeMitarbeiter, jeMonat, kennzahlen, zeitraumVorgabe } from "@/lib/auswertung";
import type { Auswertungsdaten } from "@/lib/auswertung";

// Auswertungen sind die gefährlichste Sorte Code in diesem Projekt: Eine falsche Zahl sieht
// aus wie eine Antwort, und niemand rechnet nach. Deshalb hier für jede Aussage ein Fall, in
// dem man die Zahl im Kopf nachrechnen kann.

const Z = { von: "2026-01-01", bis: "2026-12-31" };

function auftrag(id: string, felder: Record<string, unknown> = {}) {
  return {
    id, order_number: 1, customer_id: "k1", title: "Radwechsel",
    description: null, status: "erledigt", order_date: "2026-03-10", time: "08:00",
    end_time: null, assigned_employee_id: null, techniker_notiz: null,
    firmenfahrzeug_id: null, completed_at: null, completed_by: null, cancelled_at: null,
    cancelled_by: null, cancel_reason: null, reopen_reason: null, rechnung_noetig: true, ...felder,
  } as never;
}
function position(orderId: string, felder: Record<string, unknown> = {}) {
  return {
    id: `p-${orderId}-${Math.random()}`, order_id: orderId, article_id: "a1",
    quantity: 1, net_price: 100, vat_rate: 19, discount_percent: 0, endpreis_netto: null,
    note: null, created_at: "2026-03-10", deleted_at: null, ...felder,
  } as never;
}
function daten(teil: Partial<Auswertungsdaten> = {}): Auswertungsdaten {
  return {
    orders: [], orderArticles: [], orderEmployees: {}, employees: [], articles: [],
    einlagerungen: [], customers: [], vehicles: [], auftragFahrzeuge: [], ...teil,
  } as Auswertungsdaten;
}

// Welches Auto an welchem Auftrag hing, steht seit Migration 44 in `auftrag_fahrzeuge` – und
// seit Migration 51 nur noch dort. Vorher trug der Auftrag selbst ein einzelnes `vehicle_id`.
function amAuftrag(orderId: string, vehicleId: string) {
  return { id: `af-${orderId}-${vehicleId}`, order_id: orderId, vehicle_id: vehicleId,
           kilometerstand: null, created_at: "2026-03-10", created_by: null } as never;
}

describe("kennzahlen", () => {
  it("zählt nur erledigte Aufträge als Umsatz", () => {
    const d = daten({
      orders: [auftrag("a"), auftrag("b", { status: "offen" }), auftrag("c", { status: "storniert" })],
      orderArticles: [position("a"), position("b"), position("c")],
    });
    const k = kennzahlen(d, Z);
    expect(k.auftraegeGesamt).toBe(3);
    expect(k.auftraegeErledigt).toBe(1);
    expect(k.auftraegeStorniert).toBe(1);
    // Nur der erledigte Auftrag: 1 × 100 netto.
    expect(k.umsatzNetto).toBe(100);
  });

  it("rechnet Steuer und Bruttoumsatz aus denselben Zeilen", () => {
    const d = daten({
      orders: [auftrag("a")],
      orderArticles: [position("a", { quantity: 2, net_price: 50, vat_rate: 19 })],
    });
    const k = kennzahlen(d, Z);
    expect(k.umsatzNetto).toBe(100);
    expect(k.umsatzsteuer).toBe(19);
    expect(k.umsatzBrutto).toBe(119);
  });

  it("leitet den gewährten Nachlass aus Listenpreis minus Endpreis ab", () => {
    const d = daten({
      orders: [auftrag("a")],
      orderArticles: [position("a", { quantity: 1, net_price: 100, endpreis_netto: 80 })],
    });
    const k = kennzahlen(d, Z);
    expect(k.umsatzNetto).toBe(80);
    expect(k.nachlass).toBe(20);
  });

  // Ein „negativer Nachlass" wäre ein Aufschlag. Ihn als Rabatt auszuweisen wäre falsch.
  it("weist keinen negativen Nachlass aus, wenn der Endpreis über dem Listenpreis liegt", () => {
    const d = daten({
      orders: [auftrag("a")],
      orderArticles: [position("a", { quantity: 1, net_price: 100, endpreis_netto: 110 })],
    });
    expect(kennzahlen(d, Z).nachlass).toBe(0);
  });

  it("überspringt gelöschte Positionen", () => {
    const d = daten({
      orders: [auftrag("a")],
      orderArticles: [position("a"), position("a", { deleted_at: "2026-03-11" })],
    });
    expect(kennzahlen(d, Z).umsatzNetto).toBe(100);
  });

  it("zählt Kunden und Aufträge je Kunde", () => {
    const d = daten({
      orders: [auftrag("a"), auftrag("b"), auftrag("c", { customer_id: "k2" })],
      orderArticles: [],
    });
    const k = kennzahlen(d, Z);
    expect(k.kundenBedient).toBe(2);
    expect(k.auftraegeJeKunde).toBe(1.5);
  });

  it("teilt nicht durch null, wenn nichts erledigt wurde", () => {
    expect(kennzahlen(daten(), Z).auftraegeJeKunde).toBe(0);
  });

  it("lässt alles außerhalb des Zeitraums draußen", () => {
    const d = daten({
      orders: [auftrag("a", { order_date: "2025-12-31" }), auftrag("b", { order_date: "2027-01-01" })],
      orderArticles: [position("a"), position("b")],
    });
    const k = kennzahlen(d, Z);
    expect(k.auftraegeGesamt).toBe(0);
    expect(k.umsatzNetto).toBe(0);
  });
});

describe("jeMonat", () => {
  // Die Lücken sind bei einem Saisongeschäft die Aussage. Eine Reihe, die nur die Monate mit
  // Umsatz enthält, behauptet einen gleichmäßigen Verlauf.
  it("gibt auch leere Monate aus", () => {
    const reihe = jeMonat(daten({ orders: [auftrag("a", { order_date: "2026-03-10" })] }),
      { von: "2026-01-01", bis: "2026-04-30" });
    expect(reihe.map((m) => m.monat)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(reihe[2].auftraege).toBe(1);
    expect(reihe[0].auftraege).toBe(0);
  });

  it("summiert den Umsatz im richtigen Monat", () => {
    const d = daten({
      orders: [auftrag("a", { order_date: "2026-03-10" }), auftrag("b", { order_date: "2026-04-02" })],
      orderArticles: [position("a", { net_price: 100 }), position("b", { net_price: 250 })],
    });
    const reihe = jeMonat(d, { von: "2026-03-01", bis: "2026-04-30" });
    expect(reihe.map((m) => m.umsatzNetto)).toEqual([100, 250]);
  });
});

describe("jeMitarbeiter", () => {
  // Ein Auftrag mit zwei Technikern zählt bei beiden voll – die Spaltensumme ist dann größer
  // als die Auftragszahl. Das ist Absicht und steht auch so in der Ansicht.
  it("zählt einen gemeinsamen Auftrag bei beiden voll", () => {
    const d = daten({
      orders: [auftrag("a")],
      orderArticles: [position("a", { net_price: 100 })],
      orderEmployees: { a: ["m1", "m2"] },
      employees: [{ id: "m1", name: "Max" }, { id: "m2", name: "Sven" }] as never,
    });
    const r = jeMitarbeiter(d, Z);
    expect(r).toHaveLength(2);
    expect(r.every((m) => m.auftraege === 1 && m.umsatzNetto === 100)).toBe(true);
  });

  it("führt nicht zugeteilte Aufträge als eigene Zeile, am Ende", () => {
    const d = daten({
      orders: [auftrag("a"), auftrag("b")],
      orderArticles: [position("a", { net_price: 100 }), position("b", { net_price: 40 })],
      orderEmployees: { a: ["m1"] },
      employees: [{ id: "m1", name: "Max" }] as never,
    });
    const r = jeMitarbeiter(d, Z);
    expect(r[r.length - 1]).toMatchObject({ name: "niemandem zugeteilt", auftraege: 1, umsatzNetto: 40 });
  });

  it("sortiert nach Umsatz", () => {
    const d = daten({
      orders: [auftrag("a"), auftrag("b")],
      orderArticles: [position("a", { net_price: 50 }), position("b", { net_price: 300 })],
      orderEmployees: { a: ["m1"], b: ["m2"] },
      employees: [{ id: "m1", name: "Max" }, { id: "m2", name: "Sven" }] as never,
    });
    expect(jeMitarbeiter(d, Z).map((m) => m.name)).toEqual(["Sven", "Max"]);
  });
});

describe("jeArtikel", () => {
  it("summiert Menge und Umsatz je Artikel, nur aus erledigten Aufträgen", () => {
    const d = daten({
      orders: [auftrag("a"), auftrag("b", { status: "offen" })],
      orderArticles: [
        position("a", { article_id: "a1", quantity: 4, net_price: 10 }),
        position("a", { article_id: "a1", quantity: 2, net_price: 10 }),
        position("b", { article_id: "a1", quantity: 9, net_price: 10 }),
      ],
      articles: [{ id: "a1", short_name: "Radwechsel" }] as never,
    });
    const r = jeArtikel(d, Z);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "Radwechsel", menge: 6, umsatzNetto: 60 });
  });
});

describe("zeitraumVorgabe", () => {
  const heute = new Date("2026-09-14T12:00:00");

  it("dieses Jahr beginnt am 1. Januar", () => {
    expect(zeitraumVorgabe("jahr", heute)).toEqual({ von: "2026-01-01", bis: "2026-09-14" });
  });

  it("das Quartal beginnt im ersten Monat des Quartals", () => {
    expect(zeitraumVorgabe("quartal", heute).von).toBe("2026-07-01");
  });

  it("die letzten zwölf Monate enden heute", () => {
    expect(zeitraumVorgabe("letzte12", heute)).toEqual({ von: "2025-09-15", bis: "2026-09-14" });
  });
});

describe("artikelDetail", () => {
  const basis = () => daten({
    orders: [
      auftrag("a1", { customer_id: "k1", order_date: "2026-03-10" }),
      auftrag("a2", { customer_id: "k1", order_date: "2026-04-05" }),
      auftrag("a3", { customer_id: "k2", order_date: "2026-04-20" }),
      auftrag("a4", { customer_id: "k3", order_date: "2026-04-21", status: "offen" }),
    ],
    auftragFahrzeuge: [
      amAuftrag("a1", "f1"), amAuftrag("a2", "f1"), amAuftrag("a3", "f2"), amAuftrag("a4", "f3"),
    ],
    orderArticles: [
      position("a1", { article_id: "rad", quantity: 4, net_price: 10 }),
      position("a2", { article_id: "rad", quantity: 2, net_price: 10 }),
      position("a3", { article_id: "rad", quantity: 4, net_price: 10 }),
      position("a3", { article_id: "ventil", quantity: 4, net_price: 2 }),
      position("a4", { article_id: "rad", quantity: 99, net_price: 10 }),
    ],
    customers: [{ id: "k1", name: "Meyer" }, { id: "k2", name: "Schmidt" }] as never,
    vehicles: [
      { id: "f1", license_plate: "N-AB 1", make_model: "Golf" },
      { id: "f2", license_plate: "N-CD 2", make_model: null },
    ] as never,
    articles: [{ id: "rad", short_name: "Radwechsel" }] as never,
  });

  it("zählt Menge, Umsatz, Aufträge, Kunden und Fahrzeuge", () => {
    const d = artikelDetail(basis(), Z, "rad");
    // 4 + 2 + 4 = 10; der offene Auftrag mit 99 zählt nicht.
    expect(d.menge).toBe(10);
    expect(d.umsatzNetto).toBe(100);
    expect(d.auftraege).toBe(3);
    expect(d.kunden).toBe(2);
    expect(d.fahrzeuge).toBe(2);
  });

  it("rechnet die Durchschnitte je Auftrag und je Kunde", () => {
    const d = artikelDetail(basis(), Z, "rad");
    expect(d.mengeJeAuftrag).toBeCloseTo(10 / 3, 6);
    expect(d.mengeJeKunde).toBe(5);
  });

  it("lässt andere Artikel desselben Auftrags außen vor", () => {
    expect(artikelDetail(basis(), Z, "ventil").menge).toBe(4);
  });

  it("verteilt die Mengen auf die richtigen Monate, leere inklusive", () => {
    const d = artikelDetail(basis(), { von: "2026-02-01", bis: "2026-04-30" }, "rad");
    expect(d.jeMonat.map((m) => [m.monat, m.menge]))
      .toEqual([["2026-02", 0], ["2026-03", 4], ["2026-04", 6]]);
  });

  it("fasst je Kunde zusammen und merkt sich den letzten Kauf", () => {
    const d = artikelDetail(basis(), Z, "rad");
    const meyer = d.jeKunde.find((k) => k.name === "Meyer");
    expect(meyer).toMatchObject({ menge: 6, auftraege: 2, zuletzt: "2026-04-05" });
  });

  it("sortiert Kunden nach Menge", () => {
    expect(artikelDetail(basis(), Z, "rad").jeKunde.map((k) => k.name)).toEqual(["Meyer", "Schmidt"]);
  });

  it("benennt Fahrzeuge mit Kennzeichen und Modell", () => {
    const d = artikelDetail(basis(), Z, "rad");
    expect(d.jeFahrzeug.map((f) => f.bezeichnung)).toEqual(["N-AB 1 · Golf", "N-CD 2"]);
  });

  // Ein Auftrag ohne Fahrzeug darf die Fahrzeugauswertung nicht mit einer Sammelzeile
  // verwässern – das wäre eine Auskunft über die Datenpflege, nicht über die Fahrzeuge.
  it("übergeht Aufträge ohne Fahrzeug, statt eine Sammelzeile zu erfinden", () => {
    const d = artikelDetail(daten({
      orders: [auftrag("a1")],
      orderArticles: [position("a1", { article_id: "rad", quantity: 4 })],
    }), Z, "rad");
    expect(d.menge).toBe(4);
    expect(d.jeFahrzeug).toEqual([]);
  });

  // Mehrere Autos an einem Auftrag (Migration 44): Aus den Daten geht nicht hervor, welcher
  // Reifen an welches kam. Die Menge wird deshalb geteilt – die Summe über alle Fahrzeuge
  // bleibt die Menge des Auftrags, und keine Zeile behauptet mehr, als bekannt ist. Der
  // Auftrag selbst zählt bei jedem Auto voll: „an wie vielen Terminen war dieser Wagen dabei"
  // ist eindeutig zu beantworten.
  it("teilt die Menge, wenn mehrere Fahrzeuge am selben Auftrag hängen", () => {
    const d = artikelDetail(daten({
      orders: [auftrag("a1")],
      orderArticles: [position("a1", { article_id: "rad", quantity: 12 })],
      auftragFahrzeuge: [amAuftrag("a1", "f1"), amAuftrag("a1", "f2"), amAuftrag("a1", "f3")],
      vehicles: [
        { id: "f1", license_plate: "N-AB 1", make_model: null },
        { id: "f2", license_plate: "N-AB 2", make_model: null },
        { id: "f3", license_plate: "N-AB 3", make_model: null },
      ] as never,
    }), Z, "rad");
    expect(d.menge).toBe(12);
    expect(d.fahrzeuge).toBe(3);
    expect(d.jeFahrzeug.map((f) => f.menge)).toEqual([4, 4, 4]);
    expect(d.jeFahrzeug.reduce((sum, f) => sum + f.menge, 0)).toBe(12);
    expect(d.jeFahrzeug.every((f) => f.auftraege === 1)).toBe(true);
  });

  it("gibt ohne gewählten Artikel nichts zurück", () => {
    expect(artikelDetail(basis(), Z, "").menge).toBe(0);
  });
});

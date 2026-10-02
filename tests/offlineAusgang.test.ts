import { describe, expect, it } from "vitest";
import {
  aenderungen, AUFTRAG_OFFLINE_FELDER, auftragsdatenAnwenden, ausgangStand, gleich, istNetzfehler,
  konfliktFelder, raederAnwenden, saetzeAnwenden, zusammenlegen, type Absicht,
} from "@/lib/offline/ausgang";
import type { EingelagertesRad, Order, OrderArticle, TireStorage } from "@/lib/types";

const meta = (id: string) => ({ id, erstellt: "2026-10-02T10:00:00Z", titel: "t", zustand: "wartet" as const });

describe("gleich", () => {
  it("leer ist leer, Uhrzeiten auf Minuten, Zahlen als Zahlen", () => {
    expect(gleich(null, "")).toBe(true);
    expect(gleich(undefined, null)).toBe(true);
    expect(gleich("10:00:00", "10:00")).toBe(true);
    expect(gleich("10:00", "10:30")).toBe(false);
    expect(gleich(4, "4")).toBe(true);
    expect(gleich("a", null)).toBe(false);
  });
});

describe("konfliktFelder", () => {
  it("nur, wenn der Server anders ist als die Basis UND anders als die eigene Fassung", () => {
    const felder = { techniker_notiz: "neu", title: "B" };
    const basis = { techniker_notiz: "alt", title: "A" };
    expect(konfliktFelder(felder, basis, { techniker_notiz: "alt", title: "A" })).toEqual([]); // unverändert
    expect(konfliktFelder(felder, basis, { techniker_notiz: "neu", title: "A" })).toEqual([]); // dasselbe gewollt
    expect(konfliktFelder(felder, basis, { techniker_notiz: "Büro", title: "A" }))
      .toEqual([{ feld: "techniker_notiz", meine: "neu", server: "Büro" }]);
  });
  it("ein anderes Feld am Server stört nicht (feldweise)", () => {
    expect(konfliktFelder({ title: "B" }, { title: "A" }, { title: "A", description: "geändert" })).toEqual([]);
  });
});

describe("aenderungen", () => {
  it("nur geänderte, erlaubte Felder, mit Wert vorher", () => {
    const r = aenderungen({ title: "A", time: "10:00:00", status: "offen" } as Record<string, unknown>, { title: "A", time: "11:00", status: "erledigt" } as Record<string, unknown>, AUFTRAG_OFFLINE_FELDER as readonly string[]);
    expect(r).toEqual({ felder: { time: "11:00" }, basis: { time: "10:00:00" } });
  });
  it("nichts geändert: keine Absicht", () => {
    expect(aenderungen({ time: "10:00:00" }, { time: "10:00" }, AUFTRAG_OFFLINE_FELDER)).toBeNull();
  });
});

describe("istNetzfehler", () => {
  it("erkennt die Texte der Browser, nicht die der Datenbank", () => {
    expect(istNetzfehler(new Error("Die Notiz konnte nicht gespeichert werden: TypeError: Failed to fetch"))).toBe(true);
    expect(istNetzfehler(new Error("x: Load failed"))).toBe(true);
    expect(istNetzfehler(new Error("Zum Schreiben fehlt die Berechtigung."))).toBe(false);
  });
});

describe("Vorgreifen im Bestand", () => {
  const auftrag = { id: "o1", title: "A", techniker_notiz: null } as unknown as Order;
  const pos = { id: "p1", order_id: "o1", quantity: 1, deleted_at: null } as unknown as OrderArticle;
  const daten = { orders: [auftrag], orderEmployees: {}, orderArticles: [pos] };

  it("Auftragsfelder, neue und entfernte Positionen", () => {
    const absichten: Absicht[] = [
      { ...meta("1"), art: "auftrag", auftragId: "o1", felder: { techniker_notiz: "neu" }, basis: { techniker_notiz: null } },
      { ...meta("2"), art: "position_neu", auftragId: "o1", zeile: { id: "p2", order_id: "o1", article_id: "a", quantity: 4, net_price: 10, vat_rate: 19, endpreis_netto: null, note: null } },
      { ...meta("3"), art: "position", auftragId: "o1", positionId: "p1", felder: { deleted_at: "x" }, basis: { deleted_at: null } },
    ];
    const neu = auftragsdatenAnwenden(daten, absichten);
    expect(neu.orders[0].techniker_notiz).toBe("neu");
    expect(neu.orderArticles.map((p) => p.id)).toEqual(["p2"]);
  });
  it("abgelehnte Absichten greifen nicht vor; ohne Änderung derselbe Bestand", () => {
    const abgelehnt: Absicht = { ...meta("1"), zustand: "abgelehnt", art: "auftrag", auftragId: "o1", felder: { title: "B" }, basis: { title: "A" } };
    expect(auftragsdatenAnwenden(daten, [abgelehnt])).toBe(daten);
  });
  it("Räder: vorhandenes ändern, neues anlegen; Satz wird umgestellt", () => {
    const rad = { id: "r1", tire_storage_id: "s1", position: "VL", profiltiefe_mm: 5 } as unknown as EingelagertesRad;
    const absichten: Absicht[] = [
      { ...meta("1"), art: "rad", satzId: "s1", position: "VL", radId: "r1", felder: { profiltiefe_mm: 4 }, basis: { profiltiefe_mm: 5 }, umstellen: false },
      { ...meta("2"), art: "rad", satzId: "s2", position: "HR", radId: null, felder: { profiltiefe_mm: 6 }, basis: null, umstellen: true },
    ];
    const r = raederAnwenden([rad], absichten);
    expect(r.find((x) => x.id === "r1")?.profiltiefe_mm).toBe(4);
    expect(r.find((x) => x.tire_storage_id === "s2")?.id).toBe("offline-2");
    const saetze = saetzeAnwenden([{ id: "s2", erfassungsart: "sammel", profiltiefe_mm: 7 } as unknown as TireStorage], absichten);
    expect(saetze[0]).toMatchObject({ erfassungsart: "einzeln", profiltiefe_mm: null });
  });
});

describe("zusammenlegen", () => {
  it("dieselbe Notiz zweimal: eine Absicht, Basis von vor der ersten Änderung", () => {
    const korb: Absicht[] = [{ ...meta("1"), art: "auftrag", auftragId: "o1", felder: { techniker_notiz: "B" }, basis: { techniker_notiz: "A" } }];
    const neu = zusammenlegen(korb, { art: "auftrag", auftragId: "o1", felder: { techniker_notiz: "C", time: "11:00" }, basis: { techniker_notiz: "B", time: "10:00" } });
    expect(neu).toHaveLength(1);
    expect(neu![0]).toMatchObject({ felder: { techniker_notiz: "C", time: "11:00" }, basis: { techniker_notiz: "A", time: "10:00" } });
  });
  it("Änderung an einer offline angelegten Leistung geht in die Anlage; Entfernen streicht sie", () => {
    const korb: Absicht[] = [{ ...meta("1"), art: "position_neu", auftragId: "o1", zeile: { id: "p9", order_id: "o1", article_id: "a", quantity: 1, net_price: 0, vat_rate: 19, endpreis_netto: null, note: null } }];
    const mehr = zusammenlegen(korb, { art: "position", auftragId: "o1", positionId: "p9", felder: { quantity: 4 }, basis: { quantity: 1 } });
    expect(mehr![0]).toMatchObject({ art: "position_neu", zeile: { quantity: 4 } });
    expect(zusammenlegen(korb, { art: "position", auftragId: "o1", positionId: "p9", felder: { deleted_at: "x" }, basis: { deleted_at: null } })).toEqual([]);
  });
  it("anderer Auftrag: neu anhängen", () => {
    const korb: Absicht[] = [{ ...meta("1"), art: "auftrag", auftragId: "o1", felder: { title: "B" }, basis: { title: "A" } }];
    expect(zusammenlegen(korb, { art: "auftrag", auftragId: "o2", felder: { title: "X" }, basis: { title: "Y" } })).toBeNull();
  });
  it("zählt", () => {
    expect(ausgangStand([{ ...meta("1"), art: "auftrag", auftragId: "o", felder: {}, basis: {} }, { ...meta("2"), zustand: "konflikt", art: "auftrag", auftragId: "o", felder: {}, basis: {} }]))
      .toEqual({ wartet: 1, konflikt: 1, abgelehnt: 0 });
  });
});

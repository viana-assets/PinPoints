import { describe, expect, it } from "vitest";
import {
  ausschnittText, buendelGroesse, buendeln, kundenInfoZeile, zustandText, nadelTerminText, ringVerlauf, tagesStationen, tagesWege,
  BUENDEL_ZELLE_PX, type KartenPunkt,
} from "@/lib/karte";

// Die Regeln hinter der neuen Karte (Entwurf W).

const p = (id: string, x: number, y: number, zustand: KartenPunkt["zustand"] = "red"): KartenPunkt => ({ id, x, y, zustand });

describe("buendeln", () => {
  it("fasst Punkte derselben Zelle zusammen, Einzelne bleiben Nadeln", () => {
    const r = buendeln([p("a", 5, 5), p("b", 20, 30, "green"), p("c", 300, 300)]);
    expect(r.einzeln).toEqual(["c"]);
    expect(r.buendel).toHaveLength(1);
    expect(r.buendel[0].ids).toEqual(["a", "b"]);
    expect(r.buendel[0].anteile).toEqual({ red: 1, green: 1 });
    expect(r.buendel[0].x).toBeCloseTo(12.5);
    expect(r.buendel[0].y).toBeCloseTo(17.5);
  });

  it("hängt am Raster, nicht am Abstand – Nachbarn über eine Zellgrenze bleiben getrennt", () => {
    const r = buendeln([p("a", BUENDEL_ZELLE_PX - 1, 10), p("b", BUENDEL_ZELLE_PX + 1, 10)]);
    expect(r.einzeln.sort()).toEqual(["a", "b"]);
    expect(r.buendel).toHaveLength(0);
  });

  it("verliert keinen Punkt", () => {
    const punkte = Array.from({ length: 500 }, (_, i) => p(String(i), (i * 37) % 900, (i * 53) % 700));
    const r = buendeln(punkte);
    const gezaehlt = r.einzeln.length + r.buendel.reduce((s, b) => s + b.ids.length, 0);
    expect(gezaehlt).toBe(500);
  });

  it("negative Pixelkoordinaten landen in eigenen Zellen", () => {
    const r = buendeln([p("a", -5, 5), p("b", 5, 5)]);
    expect(r.buendel).toHaveLength(0);
  });
});

describe("buendelGroesse", () => {
  it("vier Stufen", () => {
    expect(buendelGroesse(2)).toBe(40);
    expect(buendelGroesse(10)).toBe(48);
    expect(buendelGroesse(250)).toBe(56);
    expect(buendelGroesse(1137)).toBe(64);
  });
});

describe("ringVerlauf", () => {
  it("teilt den Kreis nach Anteilen in fester Reihenfolge", () => {
    expect(ringVerlauf({ green: 1, red: 3 })).toBe(
      "conic-gradient(var(--red) 0.0deg 270.0deg, var(--green) 270.0deg 360.0deg)"
    );
  });
  it("ohne Anteile ein ruhiger Ring statt eines Fehlers", () => {
    expect(ringVerlauf({})).toBe("var(--frei-linie)");
  });
});

describe("ausschnittText", () => {
  it("nah: nur die Zahl", () => {
    expect(ausschnittText({ nadeln: 312, gebuendelt: 0, buendel: 0, ausgelassen: 0 })).toBe("312 Kunden in diesem Ausschnitt");
    expect(ausschnittText({ nadeln: 1, gebuendelt: 0, buendel: 0, ausgelassen: 0 })).toBe("1 Kunde in diesem Ausschnitt");
  });
  it("weit: mit Bündeln und Tausenderpunkt", () => {
    expect(ausschnittText({ nadeln: 7, gebuendelt: 1130, buendel: 5, ausgelassen: 0 }))
      .toBe("1.137 Kunden · 5 Bündel – zum Heranzoomen antippen");
  });
  it("zu viele Nadeln: der Hinweis zum Heranzoomen geht vor", () => {
    expect(ausschnittText({ nadeln: 600, gebuendelt: 0, buendel: 0, ausgelassen: 40 }))
      .toBe("40 weitere Kunden in diesem Ausschnitt – zum Anzeigen näher heranzoomen");
  });
  it("leer", () => {
    expect(ausschnittText({ nadeln: 0, gebuendelt: 0, buendel: 0, ausgelassen: 0 })).toBe("Keine Kunden in diesem Ausschnitt");
  });
});

describe("nadelTerminText", () => {
  const HEUTE = "2026-09-26"; // ein Samstag
  it("heute die Uhrzeit, morgen das Wort, sonst der Tag", () => {
    expect(nadelTerminText({ order_date: HEUTE, time: "12:00" }, HEUTE)).toBe("12:00");
    expect(nadelTerminText({ order_date: HEUTE, time: null }, HEUTE)).toBe("heute");
    expect(nadelTerminText({ order_date: "2026-09-27", time: "08:30" }, HEUTE)).toBe("morgen 08:30");
    expect(nadelTerminText({ order_date: "2026-09-27", time: null }, HEUTE)).toBe("morgen");
    expect(nadelTerminText({ order_date: "2026-09-29", time: "08:30" }, HEUTE)).toBe("Di 29.9.");
  });
  it("Uhrzeit mit Sekunden wird gekürzt", () => {
    expect(nadelTerminText({ order_date: HEUTE, time: "12:00:00" }, HEUTE)).toBe("12:00");
  });
});

describe("tagesStationen und tagesWege", () => {
  const zeile = (id: string, lat: number | null, status: "offen" | "storniert" = "offen", time: string | null = "09:00") => ({
    cust: { id: "k" + id, lat, lng: lat == null ? null : 11 },
    order: { id, order_date: "2026-09-26", time, status },
    phase: "kommt" as const,
  });

  it("nummeriert wie die Liste, auch wenn eine Station keine Position hat", () => {
    const r = tagesStationen([zeile("1", 49.1), zeile("2", null), zeile("3", 49.3, "offen", null)], {});
    expect(r.stationen.map((s) => s.nr)).toEqual([1, 3]);
    expect(r.ohnePosition).toBe(1);
    expect(r.stationen[1].zeit).toBe("ohne Uhrzeit");
  });

  it("stornierte fallen heraus und zählen nicht mit", () => {
    const r = tagesStationen([zeile("1", 49.1, "storniert"), zeile("2", 49.2)], {});
    expect(r.stationen.map((s) => s.nr)).toEqual([1]);
    expect(r.stationen[0].orderId).toBe("2");
  });

  it("eine Linie je Mitarbeiter, nur ab zwei Stationen", () => {
    const r = tagesStationen(
      [zeile("1", 49.1), zeile("2", 49.2), zeile("3", 49.3)],
      { "1": ["jan"], "2": ["jan", "mira"], "3": ["jan"] }
    );
    const wege = tagesWege(r.stationen);
    expect(wege).toEqual([{ mitarbeiterId: "jan", punkte: [[49.1, 11], [49.2, 11], [49.3, 11]] }]);
  });
});

describe("kundenInfoZeile", () => {
  const k = (last_contact: string | null, wiedervorlage_am: string | null = null) => ({ last_contact, wiedervorlage_am });
  it("sagt, warum die Nadel diese Farbe hat", () => {
    expect(kundenInfoZeile(k(null), "red")).toBe("Noch nicht kontaktiert");
    expect(kundenInfoZeile(k("2026-03-02"), "red")).toBe("Letzter Kontakt 2.3.2026");
    expect(kundenInfoZeile(k("2026-09-01", "2026-09-20"), "red")).toBe("Wiedervorlage war am 20.9.2026 fällig");
    expect(kundenInfoZeile(k("2026-09-01", "2026-10-06"), "wiedervorlage")).toBe("Wiedervorlage am 6.10.2026");
    expect(kundenInfoZeile(k("2026-09-22"), "green")).toBe("Kontaktiert am 22.9.2026");
    expect(kundenInfoZeile(k("2026-09-02"), "kein-interesse")).toBe("Kein Interesse seit 2.9.2026");
    expect(kundenInfoZeile(k(null), "termin")).toBe("Noch kein Kontakt vermerkt");
  });
});

describe("zustandText", () => {
  it("groß am Anfang, sonst wie in der Liste", () => {
    expect(zustandText("red")).toBe("Offen");
    expect(zustandText("kein-interesse")).toBe("Kein Interesse");
    expect(zustandText("green")).toBe("Kontaktiert");
  });
});

import { describe, expect, it } from "vitest";
import { imZeitraum, lueckeText, naechsterWann, terminPhase, terminTage, terminTagTitel } from "@/lib/terminAnsicht";
import type { OrderStatus } from "@/lib/types";

// Die Regeln hinter der neuen Terminliste (Entwurf L).

const HEUTE = "2026-09-25"; // ein Freitag
const JETZT = 11 * 60 + 20; // 11:20
const STD = 60;

type O = { order_date: string; time: string | null; end_time: string | null; status: OrderStatus };
const o = (order_date: string, time: string | null, end_time: string | null = null, status: OrderStatus = "offen"): O =>
  ({ order_date, time, end_time, status });
const z = (order: O, name = "") => ({ order, name });

describe("imZeitraum", () => {
  it("heute, morgen, 7 Tage in Ortszeit", () => {
    expect(imZeitraum(o(HEUTE, "09:00"), false, "heute", HEUTE)).toBe(true);
    expect(imZeitraum(o("2026-09-26", "09:00"), false, "morgen", HEUTE)).toBe(true);
    expect(imZeitraum(o(HEUTE, "09:00"), false, "morgen", HEUTE)).toBe(false);
    expect(imZeitraum(o("2026-10-02", null), false, "woche", HEUTE)).toBe(true);
    expect(imZeitraum(o("2026-10-03", null), false, "woche", HEUTE)).toBe(false);
    expect(imZeitraum(o("2026-09-24", null), true, "woche", HEUTE)).toBe(false);
  });
  it("Monatswechsel: morgen nach dem 30.9. ist der 1.10.", () => {
    expect(imZeitraum(o("2026-10-01", null), false, "morgen", "2026-09-30")).toBe(true);
  });
  it("anstehend = nicht vorbei, alle = alles", () => {
    expect(imZeitraum(o("2026-09-20", null), true, "anstehend", HEUTE)).toBe(false);
    expect(imZeitraum(o("2026-09-20", null), false, "anstehend", HEUTE)).toBe(true);
    expect(imZeitraum(o("2020-01-01", null), true, "alle", HEUTE)).toBe(true);
  });
});

describe("terminPhase", () => {
  it("nach der Uhr: vorbei, läuft, kommt", () => {
    expect(terminPhase(o(HEUTE, "09:30", "10:30"), HEUTE, JETZT, STD)).toBe("vorbei");
    expect(terminPhase(o(HEUTE, "11:00", "12:00"), HEUTE, JETZT, STD)).toBe("laeuft");
    expect(terminPhase(o(HEUTE, "12:00", "13:00"), HEUTE, JETZT, STD)).toBe("kommt");
  });
  it("ohne Endzeit gilt die Standarddauer", () => {
    expect(terminPhase(o(HEUTE, "10:30"), HEUTE, JETZT, STD)).toBe("laeuft");
    expect(terminPhase(o(HEUTE, "10:00"), HEUTE, JETZT, STD)).toBe("vorbei");
  });
  it("Status geht vor der Uhr", () => {
    expect(terminPhase(o(HEUTE, "15:00", "16:00", "erledigt"), HEUTE, JETZT, STD)).toBe("vorbei");
    expect(terminPhase(o(HEUTE, "15:00", "16:00", "in_arbeit"), HEUTE, JETZT, STD)).toBe("laeuft");
    expect(terminPhase(o("2026-09-26", "09:00", null, "storniert"), HEUTE, JETZT, STD)).toBe("vorbei");
  });
  it("andere Tage und ohne Uhrzeit", () => {
    expect(terminPhase(o("2026-09-24", "15:00"), HEUTE, JETZT, STD)).toBe("vorbei");
    expect(terminPhase(o("2026-09-26", "08:00"), HEUTE, JETZT, STD)).toBe("kommt");
    expect(terminPhase(o(HEUTE, null), HEUTE, JETZT, STD)).toBe("kommt");
  });
});

describe("terminTage", () => {
  const a = z(o(HEUTE, "08:00", "09:00", "erledigt"), "a");
  const b = z(o(HEUTE, "09:30", "10:30", "erledigt"), "b");
  const c = z(o(HEUTE, "12:00", "13:00"), "c");
  const d = z(o(HEUTE, "15:15", "16:15"), "d");
  const ohne = z(o(HEUTE, null), "ohne");
  const morgen1 = z(o("2026-09-26", "09:00", "10:00"), "m1");
  const morgen2 = z(o("2026-09-26", "10:30", "12:00"), "m2");

  it("Tage aufsteigend, im Tag nach Beginn, ohne Uhrzeit ans Ende", () => {
    const t = terminTage([morgen2, ohne, d, morgen1, b, c, a], HEUTE, JETZT, STD);
    expect(t.map((x) => x.datum)).toEqual([HEUTE, "2026-09-26"]);
    expect(t[0].eintraege.map((e) => e.zeile.name)).toEqual(["a", "b", "c", "d", "ohne"]);
    expect(t[1].eintraege.map((e) => e.zeile.name)).toEqual(["m1", "m2"]);
  });
  it("Jetzt-Linie vor dem ersten, der noch kommt – nicht, wenn einer läuft", () => {
    const t = terminTage([a, b, c, d], HEUTE, JETZT, STD);
    expect(t[0].jetztVor).toBe(2);
    const laeuft = z(o(HEUTE, "11:00", "12:00"), "l");
    expect(terminTage([a, laeuft, c], HEUTE, JETZT, STD)[0].jetztVor).toBeNull();
    expect(terminTage([a, b], HEUTE, JETZT, STD)[0].jetztVor).toBe(2);
    expect(terminTage([morgen1], HEUTE, JETZT, STD)[0].jetztVor).toBeNull();
  });
  it("Lücken ab einer Stunde, heute erst ab jetzt", () => {
    const t = terminTage([a, b, c, d], HEUTE, JETZT, STD);
    const l = t[0].eintraege.map((e) => e.luecke);
    // 09:00–09:30 zu kurz; 10:30–12:00 wäre 90 Min., liegt ab jetzt (11:20) aber nur noch 40 Min.
    expect(l[0]).toBeNull();
    expect(l[1]).toBeNull();
    expect(l[2]).toEqual({ start: 13 * 60, ende: 15 * 60 + 15 });
    expect(l[3]).toBeNull();
    expect(lueckeText(l[2]!)).toBe("frei 13:00–15:15 · 2 Std.");
  });
  it("parallele Termine: frei ist erst, wenn keiner mehr unterwegs ist", () => {
    const lang = z(o("2026-09-26", "09:00", "12:00"), "lang");
    const kurz = z(o("2026-09-26", "09:30", "10:00"), "kurz");
    const spaet = z(o("2026-09-26", "12:30", "13:30"), "spaet");
    const t = terminTage([lang, kurz, spaet], HEUTE, JETZT, STD);
    expect(t[0].eintraege.every((e) => e.luecke === null)).toBe(true);
    const t2 = terminTage([lang, kurz, z(o("2026-09-26", "13:00"), "x")], HEUTE, JETZT, STD);
    expect(t2[0].eintraege[1].luecke).toEqual({ start: 12 * 60, ende: 13 * 60 });
    expect(lueckeText(t2[0].eintraege[1].luecke!)).toBe("frei 12:00–13:00 · 60 Min.");
  });
  it("vergangene Tage ohne Lücken", () => {
    const t = terminTage([z(o("2026-09-20", "08:00", "09:00")), z(o("2026-09-20", "14:00", "15:00"))], HEUTE, JETZT, STD);
    expect(t[0].eintraege.every((e) => e.luecke === null)).toBe(true);
    expect(t[0].eintraege.every((e) => e.phase === "vorbei")).toBe(true);
  });
  it("leer bleibt leer", () => {
    expect(terminTage([], HEUTE, JETZT, STD)).toEqual([]);
  });
});

describe("Texte", () => {
  it("Tagesüberschrift", () => {
    expect(terminTagTitel(HEUTE, HEUTE)).toBe("HEUTE · FR 25.9.");
    expect(terminTagTitel("2026-09-26", HEUTE)).toBe("MORGEN · SA 26.9.");
    expect(terminTagTitel("2026-09-24", HEUTE)).toBe("GESTERN · DO 24.9.");
    expect(terminTagTitel("2026-09-28", HEUTE)).toBe("MO 28.9.");
  });
  it("Als Nächstes – wann", () => {
    expect(naechsterWann({ order_date: HEUTE, time: "12:00" }, HEUTE, JETZT)).toBe("IN 40 MIN");
    expect(naechsterWann({ order_date: HEUTE, time: "11:00" }, HEUTE, JETZT)).toBe("LÄUFT GERADE");
    expect(naechsterWann({ order_date: HEUTE, time: "15:15" }, HEUTE, JETZT)).toBe("HEUTE 15:15");
    expect(naechsterWann({ order_date: HEUTE, time: null }, HEUTE, JETZT)).toBe("HEUTE");
    expect(naechsterWann({ order_date: "2026-09-26", time: "09:00" }, HEUTE, JETZT)).toBe("MORGEN 09:00");
    expect(naechsterWann({ order_date: "2026-09-28", time: null }, HEUTE, JETZT)).toBe("MO 28.9.");
  });
});

import { describe, expect, it } from "vitest";
import { istLanglieger, lagermonate } from "@/lib/helpers";

// Die Monatszahl steht als Menge auf der Rechnung. Ein Fehler hier ist bares Geld - in beide
// Richtungen, und der Kunde merkt es am Tresen.

const d = (s: string) => new Date(s + "T10:00:00");

describe("lagermonate", () => {
  it("rechnet den angefangenen Monat voll", () => {
    // 16.02. bis 17.09. = 7 Monate und 1 Tag -> der achte hat angefangen.
    expect(lagermonate(d("2026-02-16"), d("2026-09-17"))).toBe(8);
  });

  it("zaehlt volle Monate als volle Monate", () => {
    expect(lagermonate(d("2026-02-16"), d("2026-09-16"))).toBe(7);
  });

  it("rechnet einen Tag vor dem Monatstag noch nicht als neuen Monat", () => {
    expect(lagermonate(d("2026-02-16"), d("2026-09-15"))).toBe(7);
  });

  it("berechnet mindestens einen Monat", () => {
    expect(lagermonate(d("2026-02-16"), d("2026-02-16"))).toBe(1);
    expect(lagermonate(d("2026-02-16"), d("2026-02-20"))).toBe(1);
  });

  it("kommt ueber den Jahreswechsel", () => {
    expect(lagermonate(d("2025-10-05"), d("2026-04-05"))).toBe(6);
    expect(lagermonate(d("2025-10-05"), d("2026-04-06"))).toBe(7);
  });

  it("rechnet die Saison richtig", () => {
    // Der Normalfall: Winterreifen kommen im April rein, im Oktober raus.
    // 10.04. bis 10.10. sind genau sechs Monate.
    expect(lagermonate(d("2026-04-10"), d("2026-10-10"))).toBe(6);
    // Einen Tag frueher: fuenf Monate und 29 Tage - der sechste hat angefangen.
    expect(lagermonate(d("2026-04-10"), d("2026-10-09"))).toBe(6);
    // Einen Tag spaeter: sechs Monate und ein Tag - der siebte hat angefangen.
    expect(lagermonate(d("2026-04-10"), d("2026-10-11"))).toBe(7);
  });

  it("rechnet den Langlieger", () => {
    // Zwei Jahre sind 24 Monate - bei 8 Euro macht das 192.
    expect(lagermonate(d("2024-09-17"), d("2026-09-17"))).toBe(24);
  });

  it("nimmt auch Zeichenketten", () => {
    expect(lagermonate("2026-02-16T08:00:00Z", "2026-09-17T08:00:00Z")).toBe(8);
  });

  it("faellt bei unbrauchbaren Angaben auf 1 zurueck", () => {
    // Lieber eine Zahl, die jemand korrigiert, als NaN auf der Rechnung.
    expect(lagermonate("quatsch", d("2026-09-17"))).toBe(1);
  });
});

// ---------------------------------------------------------------- Langlieger
//
// Zwei Schwellen, zwei Anlässe: die Monate zeigen einen VERGESSENEN Satz, die Summe eine
// Rechnung, die aus dem Rahmen fällt. Ein Test je Anlass, plus die Grenze selbst – dort
// entscheidet sich, ob „ab 18 Monaten" wirklich 18 einschließt.
describe("istLanglieger", () => {
  it("schlägt bei langer Liegezeit an, auch ohne Preis", () => {
    expect(istLanglieger(18, null)).toBe(true);
    expect(istLanglieger(24, null)).toBe(true);
  });
  it("lässt kurze Liegezeiten durch", () => {
    expect(istLanglieger(17, null)).toBe(false);
    expect(istLanglieger(1, 8)).toBe(false);
  });
  it("schlägt bei hoher Summe an, auch bei wenigen Monaten", () => {
    // Drei Monate zu 60 € – kurz gelegen, trotzdem eine Zahl, die man ansehen sollte.
    expect(istLanglieger(3, 180)).toBe(true);
  });
  it("nimmt die Grenzen mit", () => {
    expect(istLanglieger(18, 0)).toBe(true);
    expect(istLanglieger(2, 150)).toBe(true);
    expect(istLanglieger(2, 149.99)).toBe(false);
  });
});

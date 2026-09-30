import { describe, expect, it } from "vitest";
import { gleicherTermin, terminAenderung, terminAenderungText, terminAusZeile, terminText } from "@/lib/terminAenderung";

describe("terminAusZeile", () => {
  it("liest Datum und kürzt die Uhrzeit aus der Datenbank", () => {
    expect(terminAusZeile({ order_date: "2026-09-29", time: "10:00:00", end_time: "11:30:00" }))
      .toEqual({ datum: "2026-09-29", von: "10:00", bis: "11:30" });
  });
  it("ohne Uhrzeit bleibt von/bis leer", () => {
    expect(terminAusZeile({ order_date: "2026-09-29", time: null, end_time: "" }))
      .toEqual({ datum: "2026-09-29", von: null, bis: null });
  });
  it("ohne Zeile oder Datum kein Termin", () => {
    expect(terminAusZeile(null)).toBeNull();
    expect(terminAusZeile({ title: "x" })).toBeNull();
  });
});

describe("terminText", () => {
  it("mit Beginn und Ende", () => {
    expect(terminText({ datum: "2026-09-29", von: "10:00", bis: "11:00" })).toBe("Di 29.9. 10:00–11:00");
  });
  it("nur Beginn, mit Jahr", () => {
    expect(terminText({ datum: "2026-09-30", von: "14:15", bis: null }, true)).toBe("Mi 30.9.2026 14:15");
  });
  it("ohne Uhrzeit", () => {
    expect(terminText({ datum: "2026-10-01", von: null, bis: null })).toBe("Do 1.10. ohne Uhrzeit");
  });
});

describe("terminAenderung", () => {
  const alt = { order_date: "2026-09-29", time: "10:00:00", end_time: "11:00:00", title: "A" };
  it("erkennt ein Verschieben", () => {
    const a = terminAenderung(alt, { ...alt, order_date: "2026-09-30", time: "14:00:00", end_time: "15:00:00" });
    expect(a).not.toBeNull();
    expect(terminAenderungText(a!)).toBe("Termin Di 29.9.2026 10:00–11:00 → Mi 30.9.2026 14:00–15:00");
  });
  it("nur die Dauer geändert zählt auch", () => {
    expect(terminAenderung(alt, { ...alt, end_time: "12:00:00" })).not.toBeNull();
  });
  it("andere Felder geändert: keine Terminänderung", () => {
    expect(terminAenderung(alt, { ...alt, title: "B" })).toBeNull();
  });
  it("Anlegen zeigt den ersten Termin", () => {
    const a = terminAenderung(null, alt);
    expect(terminAenderungText(a!, false)).toBe("Termin Di 29.9. 10:00–11:00");
  });
  it("Löschen zeigt, wo er stand", () => {
    expect(terminAenderungText(terminAenderung(alt, null)!, false)).toBe("Termin war Di 29.9. 10:00–11:00");
  });
  it("gleicherTermin", () => {
    expect(gleicherTermin(null, null)).toBe(true);
    expect(gleicherTermin({ datum: "2026-09-29", von: null, bis: null }, null)).toBe(false);
  });
});

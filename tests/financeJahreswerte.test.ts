import { describe, expect, it } from "vitest";
import { ustJahreswerte, ustStandLesen } from "@/lib/finance/steuern";

// v156: Jahreswerte zur Umsatzsteuererklärung – alle Zeiträume zusammen gegen das Angemeldete.
describe("ustJahreswerte", () => {
  const stand = ustStandLesen({
    eingerichtet: true, umsatz_vorjahr: null, sondervorauszahlung: 110, umsatz_jahr: 0,
    zeitraeume: [
      { zeitraum: "M01", von: "2026-01-01", bis: "2026-01-31", kennzahlen: { "81": { b: 1000.6, s: 190.11 }, "66": { s: 50 } },
        abgaben: [{ fassung: 1, abgegeben_am: "2026-02-10", kennzahlen: { "81": { b: 1000.6, s: 190.11 }, "66": { s: 50 } }, notiz: null, erstellt_am: "x" }] },
      { zeitraum: "M02", von: "2026-02-01", bis: "2026-02-28", kennzahlen: { "81": { b: 2000.6, s: 380.11 }, "86": { b: 100, s: 7 } }, abgaben: [] },
      { zeitraum: "M12", von: "2026-12-01", bis: "2026-12-31", kennzahlen: { "81": { b: 500 }, "39": { s: 110 } },
        abgaben: [{ fassung: 1, abgegeben_am: "2027-02-10", kennzahlen: { "81": { b: 400 } }, notiz: null, erstellt_am: "x" },
                  { fassung: 2, abgegeben_am: "2027-02-20", kennzahlen: { "81": { b: 500 }, "39": { s: 110 } }, notiz: null, erstellt_am: "x" }] },
    ],
  });
  it("Summe ohne Kz 39, Bemessung je Jahr abgeschnitten; angemeldet = letzte Fassungen; Sondervorauszahlung dazu", () => {
    if (!stand.eingerichtet) throw new Error();
    const w = ustJahreswerte(stand, true);
    // 81: 3501,20 → 3501 × 19 % = 665,19; 86: 100 × 7 % = 7; 66: −50
    expect(w.formular.zahllast).toBe(622.19);
    expect(w.formular.zeilen.some((z) => z.kz === "39")).toBe(false);
    // M01: 1000 × 19 % − 50 = 140; M12 Fassung 2: 95 − 110 = −15
    expect([w.angemeldet, w.abgegeben, w.zeitraeume, w.sondervorauszahlung]).toEqual([125, 2, 3, 110]);
    expect(w.unterschied).toBe(387.19);
    expect(ustJahreswerte(stand, false).unterschied).toBe(497.19);
  });
});

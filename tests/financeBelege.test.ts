import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_BELEG_BUCKET, FIN_BELEG_MAX_BYTES, FIN_BELEG_TYPEN, FIN_VERBINDLICHKEIT_KONTO,
  belegAlsBuchung, belegDateiPfad, belegZustand, belegZustandText, belegeOffen, dateiMangel, kontoVorschlag,
  type FinBeleg, type FinLieferant,
} from "@/lib/finance/belege";

// Finance F2 (Migration 90, v148).
const b = (p: Partial<FinBeleg>): FinBeleg => ({
  id: "b", lieferant_id: "l1", belegdatum: "2026-10-01", belegnummer: "Q1", text: null, faellig_am: "2026-10-10",
  posten: [{ konto: 4530, betrag: 59.5, steuer: "vst19" }], datei_pfad: null, datei_typ: null, datei_name: null,
  status: "gebucht", brutto: 59.5, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01T10:00:00Z", ...p,
});
const L: FinLieferant = { id: "l1", name: "Tankstelle", ust_id: null, konto: null, steuer: null, aktiv: true };

describe("belegZustand", () => {
  it("Entwurf, offen, überfällig, bezahlt, storniert", () => {
    expect(belegZustand(b({ status: "entwurf" }), "2026-10-05").art).toBe("entwurf");
    expect(belegZustand(b({}), "2026-10-05")).toEqual({ art: "offen", faellig: "2026-10-10", tage: 5, teil: 0 });
    expect(belegZustandText(belegZustand(b({}), "2026-10-12"))).toBe("überfällig seit 2 Tagen");
    expect(belegZustandText(belegZustand(b({ bezahlt_am: "2026-10-01", bezahlt_art: "bar" }), "2026-10-12"))).toBe("bar bezahlt");
    expect(belegZustand(b({ status: "storniert" }), "2026-10-12").art).toBe("storniert");
  });
});

describe("kontoVorschlag", () => {
  it("hinterlegtes Konto zuerst", () => expect(kontoVorschlag({ ...L, konto: 4530, steuer: "vst19" }, [])).toEqual({ konto: 4530, steuer: "vst19" }));
  it("sonst der letzte gebuchte Beleg", () => {
    const belege = [b({ belegdatum: "2026-09-01", posten: [{ konto: 4980, betrag: 1, steuer: "vst7" }] }), b({ belegdatum: "2026-10-01" }), b({ belegdatum: "2026-11-01", status: "entwurf", posten: [{ konto: 4900, betrag: 1, steuer: null }] })];
    expect(kontoVorschlag(L, belege)).toEqual({ konto: 4530, steuer: "vst19" });
  });
  it("nichts", () => expect(kontoVorschlag(null, [])).toEqual({ konto: null, steuer: null }));
});

describe("belegeOffen", () => {
  it("nur gebucht und unbezahlt, Summen", () => {
    const op = belegeOffen([b({ id: "1", brutto: 100 }), b({ id: "2", faellig_am: "2026-09-01", brutto: 20.5 }), b({ id: "3", bezahlt_am: "2026-10-02", bezahlt_art: "bank" }), b({ id: "4", status: "entwurf" })], "2026-10-05");
    expect(op.posten.map((p) => p.id)).toEqual(["2", "1"]);
    expect([op.summe, op.ueberfaellig]).toEqual([120.5, 20.5]);
  });
});

describe("Datei", () => {
  it("Pfad mit Beleg-ID vorn, ohne Sonderzeichen", () => {
    expect(belegDateiPfad("abc", "Quittung März (1).jpg", new Date(1_700_000_000_000))).toBe("abc/1700000000000-Quittung_Marz_1_.jpg");
  });
  it("Art und Größe", () => {
    expect(dateiMangel({ type: "image/jpeg", size: 100, name: "a.jpg" })).toBeNull();
    expect(dateiMangel({ type: "", size: 100, name: "rechnung.xml" })).toBeNull();
    expect(dateiMangel({ type: "application/zip", size: 100, name: "a.zip" })).toMatch(/Nur Fotos/);
    expect(dateiMangel({ type: "application/pdf", size: FIN_BELEG_MAX_BYTES + 1, name: "a.pdf" })).toMatch(/zu groß/);
  });
});

describe("Wie Migration 90", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "90_finance_belege.sql"), "utf8");
  it("Bucket, Größe, Dateiarten", () => {
    expect(sql).toContain(`values ('${FIN_BELEG_BUCKET}', '${FIN_BELEG_BUCKET}', false, ${FIN_BELEG_MAX_BYTES},`);
    expect(sql).toContain(`array[${FIN_BELEG_TYPEN.map((t) => `'${t}'`).join(", ")}]`);
  });
  it("Verbindlichkeitskonto", () => {
    expect(sql).toMatch(new RegExp(`when 'skr03'[\\s\\S]*?when 'verbindlichkeit' then ${FIN_VERBINDLICHKEIT_KONTO.skr03}`));
    expect(sql).toMatch(new RegExp(`when 'skr04'[\\s\\S]*?when 'verbindlichkeit' then ${FIN_VERBINDLICHKEIT_KONTO.skr04}`));
  });
  it("Belegposten werden Aufwand an Verbindlichkeit", () => {
    expect(belegAlsBuchung([{ konto: 4530, betrag: 59.5, steuer: "vst19" }], "skr04")).toEqual([{ soll: 4530, haben: 3300, betrag: 59.5, steuer: "vst19" }]);
  });
});

describe("Teilzahlungen (Migration 93, v151)", () => {
  it("Rest und offene Posten mit dem Rest", async () => {
    const { belegRest } = await import("@/lib/finance/belege");
    expect(belegRest(b({ teilbezahlt: 20 }))).toBe(39.5);
    expect(belegZustandText(belegZustand(b({ teilbezahlt: 20 }), "2026-10-05"))).toBe("offen · fällig in 5 Tagen · 20,00 € schon bezahlt");
    expect(belegeOffen([b({ teilbezahlt: 20 })], "2026-10-05").summe).toBe(39.5);
  });
});

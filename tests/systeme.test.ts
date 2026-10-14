// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  SYSTEME, SYSTEM_PARAMETER,
  aktivesSystem, istWechselbar, sichtbareSysteme, systemStartwert,
} from "@/lib/systeme";
import { FINANCE_SEITEN, sichtbareFinanceSeiten } from "@/lib/finance/seiten";
import { RECHTE_KATALOG, RECHTE_VORGABE } from "@/lib/constants";

// Systemwechsel FSM · Finance · CRM (v145, docs/finance.md Abschnitt 1).
const alles = () => true;
const nichts = () => false;
const nurFinance = (r: string) => r === "finance";

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("sichtbareSysteme / istWechselbar", () => {
  it("ohne Finance-Recht: nur FSM, kein Wechsler, kein „bald“", () => {
    expect(sichtbareSysteme(nichts).map((s) => s.key)).toEqual(["fsm"]);
    expect(istWechselbar(nichts)).toBe(false);
  });
  it("mit Finance-Recht: FSM, Finance und CRM als „bald“", () => {
    expect(sichtbareSysteme(nurFinance).map((s) => s.key)).toEqual(["fsm", "finance", "crm"]);
    expect(sichtbareSysteme(nurFinance).find((s) => s.key === "crm")?.bald).toBe(true);
    expect(istWechselbar(nurFinance)).toBe(true);
  });
});

describe("aktivesSystem", () => {
  it("nimmt das gewünschte System, wenn es erlaubt ist", () => {
    expect(aktivesSystem("finance", alles)).toBe("finance");
  });
  it("fällt auf FSM zurück: ohne Recht, unbekannt, leer oder „bald“", () => {
    expect(aktivesSystem("finance", nichts)).toBe("fsm");
    expect(aktivesSystem("buchhaltung", alles)).toBe("fsm");
    expect(aktivesSystem(null, alles)).toBe("fsm");
    expect(aktivesSystem("crm", alles)).toBe("fsm");
  });
});

describe("systemStartwert", () => {
  it("ohne Link: FSM", () => {
    expect(systemStartwert()).toBe("fsm");
  });
  it("ein alter Merker im Gerät öffnet NICHT mehr Finance (v149) – Start ist immer FSM", () => {
    window.localStorage.setItem("mr-system", "finance");
    expect(systemStartwert()).toBe("fsm");
  });
  it("der Link öffnet Finance", () => {
    window.history.replaceState(null, "", `/?${SYSTEM_PARAMETER}=finance`);
    expect(systemStartwert()).toBe("finance");
  });
  it("unbekannter Wert im Link: FSM", () => {
    window.history.replaceState(null, "", `/?${SYSTEM_PARAMETER}=xyz`);
    expect(systemStartwert()).toBe("fsm");
  });
});

describe("Rechte der Systeme und Finance-Seiten", () => {
  it("jedes Recht steht im Katalog und hat eine Vorgabe – leer, also nur Superadmin", () => {
    const rechte = new Set([...SYSTEME.map((s) => s.recht), ...FINANCE_SEITEN.map((s) => s.recht)].filter((r): r is string => !!r));
    for (const r of rechte) {
      expect(RECHTE_KATALOG.some((k) => k.schluessel === r), r).toBe(true);
      const vorgabe = RECHTE_VORGABE[r];
      expect(vorgabe, r).toBeTruthy();
      expect(Object.values(vorgabe).flat(), r).toEqual([]);
    }
  });
  it("Seiten sind eindeutig und Übersicht wie Einstellungen hängen nur an „finance“", () => {
    expect(new Set(FINANCE_SEITEN.map((s) => s.key)).size).toBe(FINANCE_SEITEN.length);
    expect(sichtbareFinanceSeiten(nurFinance).map((s) => s.key)).toEqual(["uebersicht", "einstellungen"]);
    expect(sichtbareFinanceSeiten(alles)).toHaveLength(FINANCE_SEITEN.length);
  });
  it("höchstens vier Hauptseiten – am Handy bleibt Platz für „Weitere“", () => {
    expect(FINANCE_SEITEN.filter((s) => s.primaer).length).toBeLessThanOrEqual(4);
  });
});

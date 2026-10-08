import { describe, expect, it } from "vitest";
import { RECHTE_ABHAENGIGKEITEN, RECHTE_KATALOG, RECHTE_VORGABE, ROLLEN_SONDERREGELN, type Verb } from "@/lib/constants";
import { gruppeZaehlung, hatRecht, rechteGruppen, rechteHinweise, rolleKlartext, type RechteLesen } from "@/lib/rechteAnsicht";

// v124: Gruppen, Zählung, Hinweise und Klartext der Rechtematrix (lib/rechteAnsicht.ts).
const vorgabe: RechteLesen = (b) => RECHTE_VORGABE[b] ?? {};
const mit = (aend: Record<string, Partial<Record<Verb, string[]>>>): RechteLesen => (b) => aend[b] ?? vorgabe(b);

describe("rechteGruppen", () => {
  it("hängt jede eingerückte Zeile an das Modul darüber und verliert keine", () => {
    const g = rechteGruppen();
    expect(g.reduce((n, x) => n + 1 + x.unter.length, 0)).toBe(RECHTE_KATALOG.length);
    expect(g.find((x) => x.modul.schluessel === "lager")?.unter.map((u) => u.schluessel))
      .toEqual(["lager.regale", "lager.einlagerung", "lager.auslagern", "lager.gebuehr", "lager.tausch", "lager.raeder", "lager.verkauf", "lager.verkauf_ek"]);
    g.forEach((x) => expect(x.modul.unter).toBeFalsy());
  });
});

describe("hatRecht und gruppeZaehlung", () => {
  it("Superadmin immer, gesperrte Zeilen immer, fehlende Verben nie", () => {
    expect(hatRecht(vorgabe, "rechnungen", "lesen", "superadmin")).toBe(true);
    expect(hatRecht(vorgabe, "dashboard", "lesen", "techniker")).toBe(true);
    expect(hatRecht(mit({ termine: { schreiben: ["techniker"] } }), "termine", "schreiben", "techniker")).toBe(false);
  });

  it("zählt die Haken der Gruppe für die Rolle", () => {
    const lager = rechteGruppen().find((x) => x.modul.schluessel === "lager")!;
    // Vorgabe Techniker: Lager lesen; Regale lesen; Einlagerung lesen+schreiben; Räder alle drei; Verkauf lesen; Einkauf nichts.
    expect(gruppeZaehlung(lager, vorgabe, "techniker")).toEqual({ an: 11, von: 17 });
    expect(gruppeZaehlung(lager, vorgabe, "admin")).toEqual({ an: 17, von: 17 });
  });
});

describe("rechteHinweise", () => {
  it("meldet in der Vorgabe nichts für Admin und Nutzer", () => {
    expect(rechteHinweise(vorgabe, "admin")).toEqual([]);
    expect(rechteHinweise(vorgabe, "user")).toEqual([]);
  });

  it("meldet Schreiben ohne Lesen in derselben Zeile", () => {
    const h = rechteHinweise(mit({ kunden: { lesen: [], schreiben: ["user"] } }), "user");
    expect(h.some((x) => x.bereich === "kunden" && x.text.includes("ohne „Lesen“"))).toBe(true);
  });

  it("meldet einen ausgeschalteten Reiter mit Haken darunter", () => {
    const h = rechteHinweise(mit({ lager: { lesen: ["admin", "user"] } }), "techniker");
    expect(h.find((x) => x.bereich === "lager")?.text).toContain("Reiter „Lager“ ist aus");
  });

  it("meldet eine fehlende Voraussetzung mit Grund", () => {
    const h = rechteHinweise(mit({ mitarbeiter: { lesen: ["admin"] } }), "user");
    const e = h.find((x) => x.bereich === "auftraege.einteilung");
    expect(e?.text).toContain("Braucht „Mitarbeiter sehen“");
    expect(e?.text).toContain("Liste der Mitarbeiter");
  });

  it("nie für den Superadmin", () => {
    expect(rechteHinweise(mit({ kunden: { lesen: [], schreiben: [] } }), "superadmin")).toEqual([]);
  });

  it("kennt in den Abhängigkeiten nur Bereiche und Verben aus dem Katalog", () => {
    for (const a of RECHTE_ABHAENGIGKEITEN) {
      for (const x of [{ bereich: a.bereich, verb: a.verb }, ...a.braucht]) {
        const b = RECHTE_KATALOG.find((k) => k.schluessel === x.bereich);
        expect(b, x.bereich).toBeTruthy();
        expect(b!.verben, `${x.bereich} ${x.verb}`).toContain(x.verb);
      }
    }
  });
});

describe("rolleKlartext", () => {
  it("teilt jedes Recht genau einmal in kann oder kann nicht", () => {
    const k = rolleKlartext(vorgabe, "techniker");
    const gesamt = RECHTE_KATALOG.reduce((n, b) => n + b.verben.length, 0);
    expect(k.reduce((n, g) => n + g.kann.length + g.kannNicht.length, 0)).toBe(gesamt);
    const lager = k.find((g) => g.titel === "Lager")!;
    expect(lager.kann).toContain("Reifen einlagern und ihre Angaben pflegen");
    expect(lager.kannNicht).toContain("Lager und Plätze entfernen");
  });

  it("hat für jedes Verb jedes Bereichs einen Klartext und für jede Rolle Sonderregeln", () => {
    RECHTE_KATALOG.forEach((b) => b.verben.forEach((v) => expect(b.klartext?.[v], `${b.schluessel} ${v}`).toBeTruthy()));
    (["superadmin", "admin", "techniker", "user"] as const).forEach((r) => expect(ROLLEN_SONDERREGELN[r].length).toBeGreaterThan(0));
  });
});

import { describe, expect, it } from "vitest";
import { MODULE, WEITERE_GRUPPEN } from "@/lib/module";
import {
  navAlleUmschalten, navAlleZu, navAufbau, navSichtbareModule, navUmschalten, navZuAusText, NAV_UNTEN_GRUPPE,
} from "@/lib/navGruppen";

// Seitenleiste in Bereichen (v176): dieselben Gruppen wie „Weitere“ am Handy.

describe("navAufbau", () => {
  it("vier Hauptseiten oben, Bereiche wie „Weitere“, System unten", () => {
    const a = navAufbau(MODULE);
    expect(a.haupt.map((m) => m.tab)).toEqual(["dashboard", "einsatzplanung", "auftraege", "list"]);
    expect(a.gruppen.map((g) => g.titel)).toEqual(WEITERE_GRUPPEN.map((g) => g.titel).filter((t) => t !== NAV_UNTEN_GRUPPE));
    expect(a.unten?.module.map((m) => m.tab)).toEqual(["admin", "settings"]);
    expect(a.gruppen.find((g) => g.titel === "Lager")?.module.map((m) => m.tab)).toEqual(["lager", "bestellungen"]);
  });
  it("jede Seite steht genau einmal in der Leiste", () => {
    const a = navAufbau(MODULE);
    const alle = [...a.haupt, ...a.gruppen.flatMap((g) => g.module), ...(a.unten?.module ?? [])].map((m) => m.tab);
    expect(alle.sort()).toEqual(MODULE.map((m) => m.tab).sort());
  });
  it("ein Bereich ohne sichtbare Seite fällt weg (Techniker ohne Büro und Admin)", () => {
    const a = navAufbau(MODULE.filter((m) => !["rechnungen", "auswertung", "artikel", "admin"].includes(m.tab)));
    expect(a.gruppen.map((g) => g.titel)).not.toContain("Büro");
    expect(a.unten?.module.map((m) => m.tab)).toEqual(["settings"]);
  });
});

describe("Ein- und Ausklappen", () => {
  const g = navAufbau(MODULE).gruppen.find((x) => x.titel === "Unterwegs")!;
  it("offen alles, zu nur die aktive Seite", () => {
    expect(navSichtbareModule(g, new Set(), "dashboard").map((m) => m.tab)).toEqual(["termine", "saison", "packliste"]);
    expect(navSichtbareModule(g, new Set(["Unterwegs"]), "dashboard")).toEqual([]);
    expect(navSichtbareModule(g, new Set(["Unterwegs"]), "packliste").map((m) => m.tab)).toEqual(["packliste"]);
  });
  it("umschalten und alle zu/auf", () => {
    expect([...navUmschalten(new Set(), "Team")]).toEqual(["Team"]);
    expect([...navUmschalten(new Set(["Team"]), "Team")]).toEqual([]);
    const titel = ["Unterwegs", "Team", "System"];
    expect(navAlleZu(new Set(["Unterwegs", "Team"]), titel)).toBe(false);
    expect([...navAlleUmschalten(new Set(["Team"]), titel)].sort()).toEqual(["System", "Team", "Unterwegs"]);
    expect([...navAlleUmschalten(new Set(titel), titel)]).toEqual([]);
    expect(navAlleZu(new Set(), [])).toBe(false);
  });
  it("der Merker lässt nur eine Liste kurzer Texte durch", () => {
    expect([...navZuAusText('["Team","Büro"]')]).toEqual(["Team", "Büro"]);
    expect(navZuAusText("kaputt").size).toBe(0);
    expect(navZuAusText('{"a":1}').size).toBe(0);
    expect([...navZuAusText('["Team",3,""]')]).toEqual(["Team"]);
    expect(navZuAusText(null).size).toBe(0);
  });
});

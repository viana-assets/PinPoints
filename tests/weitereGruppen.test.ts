import { describe, expect, it } from "vitest";
import { weitereGruppen, WEITERE_GRUPPEN, type ModulEintrag, type TabKey } from "@/lib/module";

// Die Gruppen der Seite „Weitere" (Entwurf V, 26.09.2026). Geprüft wird die Regel, nicht die
// Beschriftung: Was eine Rolle nicht sieht, fehlt – und eine Gruppe ohne sichtbares Modul fällt
// ganz weg, statt als leere Überschrift stehen zu bleiben.
const leer = () => null;
function modul(tab: TabKey): ModulEintrag {
  return { tab, label: tab, beschreibung: "", Icon: leer, regel: null } as unknown as ModulEintrag;
}

describe("weitereGruppen", () => {
  it("ordnet nach der festen Reihenfolge und lässt leere Gruppen weg", () => {
    const g = weitereGruppen([modul("settings"), modul("termine"), modul("rechnungen")]);
    expect(g.map((x) => x.titel)).toEqual(["Unterwegs", "Büro", "System"]);
    expect(g[0].module.map((m) => m.tab)).toEqual(["termine"]);
  });

  it("hält die Reihenfolge innerhalb einer Gruppe fest, egal wie die Module hereinkommen", () => {
    const g = weitereGruppen([modul("artikel"), modul("auswertung"), modul("rechnungen")]);
    expect(g[0].module.map((m) => m.tab)).toEqual(["rechnungen", "auswertung", "artikel"]);
  });

  it("legt Module ohne feste Gruppe unter „Sonstiges“ ab, statt sie zu verlieren", () => {
    const g = weitereGruppen([modul("termine"), modul("einsatzplanung")]);
    expect(g.at(-1)?.titel).toBe("Sonstiges");
    expect(g.at(-1)?.module.map((m) => m.tab)).toEqual(["einsatzplanung"]);
  });

  it("vergibt jeden Reiter höchstens einmal", () => {
    const alle = WEITERE_GRUPPEN.flatMap((x) => x.tabs);
    expect(new Set(alle).size).toBe(alle.length);
  });
});

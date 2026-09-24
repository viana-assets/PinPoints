import { describe, expect, it } from "vitest";
import { MODULE, SEKUNDAERE_TABS, START_TAB, START_TAB_ERSATZ } from "@/lib/module";
import { RECHTE_KATALOG, RECHTE_VORGABE, VERBEN, type Verb } from "@/lib/constants";

// Diese Tests prüfen keine Rechenlogik, sondern eine Erfahrung: Am 10.09.2026 fehlten die
// Saisonliste und der Artikelstamm auf dem Handy – wochenlang unbemerkt, weil Seitenleiste
// (Desktop) und Kachelseite „Weitere" (Handy) zwei handgeschriebene Aufzählungen derselben
// Module waren. Seitdem gibt es nur noch eine Liste, und hier steht, was an ihr stimmen muss.

describe("Modulliste", () => {
  it("kennt jeden Reiter nur einmal", () => {
    const tabs = MODULE.map((m) => m.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  it("hat für jedes Modul eine Beschriftung und einen Satz für die Kachel", () => {
    MODULE.forEach((m) => {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.beschreibung.length).toBeGreaterThan(0);
    });
  });

  it("verweist nur auf Bereiche und Verben, die es wirklich gibt", () => {
    // Ein Modul mit einem Schluessel, den der Rechtekatalog nicht kennt, waere fuer alle ausser
    // dem Superadmin unsichtbar - und niemand kaeme auf die Idee, den Grund in einer Tabelle
    // mit Voreinstellungen zu suchen.
    MODULE.forEach((m) => {
      if (m.sichtbar === null || m.sichtbar === "admin") return;
      const [bereich, verb] = m.sichtbar.split(".");
      const eintrag = RECHTE_KATALOG.find((b) => b.schluessel === bereich);
      expect(eintrag, `Bereich "${bereich}" fehlt im RECHTE_KATALOG`).toBeTruthy();
      const gemeint = (verb as Verb) || "lesen";
      expect(VERBEN, `"${gemeint}" ist kein Verb`).toContain(gemeint);
      expect(eintrag!.verben, `Bereich "${bereich}" kennt kein "${gemeint}"`).toContain(gemeint);
      expect(RECHTE_VORGABE, `Vorgabe fuer "${bereich}" fehlt`).toHaveProperty(bereich);
    });
  });

  it("führt genau die nicht-primären Module hinter „Weitere“", () => {
    // Die Kachelseite am Handy zeigt genau diese – wäre die Liste danebengepflegt, leuchtete
    // der Knopf „Weitere" beim falschen Modul.
    expect(SEKUNDAERE_TABS).toEqual(MODULE.filter((m) => !m.primaer).map((m) => m.tab));
    expect(SEKUNDAERE_TABS).toContain("saison");
    expect(SEKUNDAERE_TABS).toContain("artikel");
  });

  it("hält die vier Alltagsmodule in der unteren Leiste – in der Reihenfolge des Tages", () => {
    // Entschieden am 23.09.2026: Dashboard, Einsatzplanung, Aufträge, Kunden, dann „Weitere".
    expect(MODULE.filter((m) => m.primaer).map((m) => m.tab)).toEqual(["dashboard", "einsatzplanung", "auftraege", "list"]);
  });

  it("stellt dieselben vier auch in der Seitenleiste nach vorn", () => {
    expect(MODULE.slice(0, 4).map((m) => m.tab)).toEqual(["dashboard", "einsatzplanung", "auftraege", "list"]);
  });

  it("startet in der Einsatzplanung und fällt auf ein Modul zurück, das jeder sehen darf", () => {
    // Entschieden am 23.09.2026. Der Rückfall muss für ALLE sichtbar sein – sonst bliebe die
    // Seite beim Öffnen für eine Rolle ohne Einsatzplanung leer.
    expect(START_TAB).toBe("einsatzplanung");
    expect(MODULE.find((m) => m.tab === START_TAB_ERSATZ)?.sichtbar).toBeNull();
  });
});

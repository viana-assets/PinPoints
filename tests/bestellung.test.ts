import { describe, expect, it } from "vitest";
import {
  aehnlicheWuensche, bestellFotoPfad, bestellListeText, bestellPushDringend, bestellPushStand, bestellSortierung,
  bestellVorschlaege, bestellZahlen, darfAendern, istMeiner,
} from "@/lib/bestellung";
import type { Bestellwunsch } from "@/lib/types";

// Bestellliste (Migration 104, v173): die reinen Regeln hinter Blatt und Seite.
const w = (id: string, text: string, z: Partial<Bestellwunsch> = {}): Bestellwunsch => ({
  id, text, menge: null, dringend: false, fuer: "allgemein", firmenfahrzeug_id: null, kunde_id: null, auftrag_id: null,
  foto_pfad: null, foto_breite: null, foto_hoehe: null, status: "offen", notiz: null, grund: null,
  erstellt_von: "p1", created_at: "2026-10-28T08:00:00Z", geaendert_am: "2026-10-28T08:00:00Z", status_am: null, status_von: null, plus: [], ...z,
});

describe("aehnlicheWuensche", () => {
  const liste = [
    w("a", "Schlagschrauber-Nuss 17 mm, lang"),
    w("b", "Schlagschrauber-Nuss 19 mm"),
    w("c", "Ventile Snap-In TR414", { status: "da" }),
    w("d", "Handschuhe Nitril Gr. 10", { status: "bestellt" }),
  ];
  it("findet offene und bestellte mit gemeinsamen Wörtern, Zahlen zählen mit", () => {
    expect(aehnlicheWuensche("Nuss 17 mm", liste).map((x) => x.id)).toEqual(["a", "b"]);
    expect(aehnlicheWuensche("Nuss 17", liste).map((x) => x.id)).toEqual(["a"]);
    expect(aehnlicheWuensche("Handschuhe", liste).map((x) => x.id)).toEqual(["d"]);
  });
  it("erledigte und der eigene Eintrag zählen nicht, kurze Eingaben auch nicht", () => {
    expect(aehnlicheWuensche("Ventile TR414", liste)).toEqual([]);
    expect(aehnlicheWuensche("Nuss 17 mm lang", liste, "a").map((x) => x.id)).toEqual(["b"]);
    expect(aehnlicheWuensche("Nu", liste)).toEqual([]);
  });
});

describe("Vorschläge, Reihenfolge, Zahlen", () => {
  it("schlägt frühere Texte vor, jeden nur einmal", () => {
    const liste = [w("a", "Ventilkappen", { created_at: "2026-10-01T00:00:00Z" }), w("b", "ventilkappen", { created_at: "2026-10-02T00:00:00Z" }), w("c", "Ventile Snap-In")];
    expect(bestellVorschlaege("ventil", liste)).toEqual(["Ventile Snap-In", "ventilkappen"]);
    expect(bestellVorschlaege("ve", liste)).toEqual([]);
  });
  it("dringende offene zuerst, dann die neuesten", () => {
    const liste = [w("a", "a", { created_at: "2026-10-03T00:00:00Z" }), w("b", "b", { dringend: true, created_at: "2026-10-01T00:00:00Z" }),
      w("c", "c", { dringend: true, status: "bestellt", created_at: "2026-10-04T00:00:00Z" })];
    expect([...liste].sort(bestellSortierung).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("zählt je Stand", () => {
    expect(bestellZahlen([w("a", "x"), w("b", "y", { status: "da" })])).toEqual({ offen: 1, bestellt: 0, da: 1, nicht_noetig: 0, alle: 2 });
  });
});

describe("Rechte in der Oberfläche (Spiegel von bestellwunsch_pruefen)", () => {
  it("eigener offener: ja; eigener bestellter: nein; Verwalter: immer", () => {
    expect(darfAendern(w("a", "x"), "p1", false)).toBe(true);
    expect(darfAendern(w("a", "x", { status: "bestellt" }), "p1", false)).toBe(false);
    expect(darfAendern(w("a", "x"), "p2", false)).toBe(false);
    expect(darfAendern(w("a", "x", { status: "da" }), "p2", true)).toBe(true);
  });
  it("meine: eingetragen oder +1", () => {
    expect(istMeiner(w("a", "x", { plus: ["p2"] }), "p2")).toBe(true);
    expect(istMeiner(w("a", "x"), "p3")).toBe(false);
    expect(istMeiner(w("a", "x"), null)).toBe(false);
  });
});

describe("Text, Pfad, Meldungen", () => {
  it("Liste für den Lieferanten", () => {
    expect(bestellListeText([w("a", "Nuss  17 mm", { menge: "2 Stück" }), w("b", "Ventile")])).toBe("- Nuss 17 mm (2 Stück)\n- Ventile");
  });
  it("Fotopfad im eigenen Ordner", () => {
    expect(bestellFotoPfad("p1", "ab12", new Date("2026-10-29T10:11:12.345Z"))).toBe("p1/20261029T101112-ab12.jpg");
  });
  it("Push: dringend ans Büro, Stand an den Techniker – mit Sprung auf den Eintrag", () => {
    const d = bestellPushDringend({ id: "a", text: "Nuss 17", menge: "2" }, "Paul");
    expect(d).toMatchObject({ titel: "Dringend bestellen – Paul", text: "Nuss 17 (2)", url: "/?bestellung=a" });
    expect(bestellPushStand({ id: "a", text: "Nuss", status: "da", grund: null, notiz: "im Lager" }).titel).toBe("Bestellung ist da");
    expect(bestellPushStand({ id: "a", text: "Nuss", status: "nicht_noetig", grund: "liegt im Lager", notiz: null }).text).toBe("Nuss · liegt im Lager");
  });
});

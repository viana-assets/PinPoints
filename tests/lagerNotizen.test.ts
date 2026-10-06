import { describe, expect, it } from "vitest";
import { hatNotizen, notizAenderungen, notizenText, radNotiz, radNotizen, satzPositionen } from "@/lib/lagerNotizen";
import { entwurfAlsPosten, type PostenEntwurf } from "@/lib/reifenverkauf";

// Notizen am eingelagerten Satz (Migration 71, v115).

const satz = { note: "  Kunde will Rückruf ", notiz_vl: null, notiz_vr: "Schraube in der Lauffläche", notiz_hl: "  ", notiz_hr: "Flanke" };

describe("Notizen am Satz", () => {
  it("nennt nur gefüllte Räder, in der Reihenfolge des Radbilds", () => {
    expect(radNotizen(satz)).toEqual([{ position: "VR", text: "Schraube in der Lauffläche" }, { position: "HR", text: "Flanke" }]);
    expect(radNotiz(satz, "HL")).toBeNull();
    expect(radNotiz(satz, "VR")).toBe("Schraube in der Lauffläche");
  });
  it("fasst alles in eine Zeile zusammen – Räder zuerst, dann der Satz", () => {
    expect(notizenText(satz)).toBe("VR: Schraube in der Lauffläche · HR: Flanke · Kunde will Rückruf");
    expect(notizenText(satz, false)).toBe("VR: Schraube in der Lauffläche · HR: Flanke");
    expect(notizenText({ note: null })).toBe("");
  });
  it("erkennt, ob überhaupt etwas notiert ist – auch ohne die Spalten (Datenbank vor Migration 71)", () => {
    expect(hatNotizen(satz)).toBe(true);
    expect(hatNotizen({ note: " " })).toBe(false);
    expect(hatNotizen({ note: null, notiz_hl: "x" })).toBe(true);
  });
  it("liefert nur geänderte Felder, leer und null gelten als gleich", () => {
    expect(notizAenderungen({ note: "", notiz_vr: null }, { note: " ", notiz_vr: "" })).toBeNull();
    expect(notizAenderungen({ note: "a", notiz_vr: null }, { note: "a ", notiz_vr: " Schraube " })).toEqual({ notiz_vr: "Schraube" });
    expect(notizAenderungen({ notiz_hl: "alt" }, { notiz_hl: "" })).toEqual({ notiz_hl: null });
  });
  it("Räder je Satz: zwei eingelagerte Räder heißen VL und VR", () => {
    expect(satzPositionen({ anzahl_raeder: 2 })).toEqual(["VL", "VR"]);
    expect(satzPositionen({ anzahl_raeder: 0 })).toEqual(["VL", "VR", "HL", "HR"]);
    expect(satzPositionen({ anzahl_raeder: 6 })).toEqual(["VL", "VR", "HL", "HR"]);
  });
});

describe("Kunde lässt sie da: die Notiz geht an den Posten", () => {
  const e: PostenEntwurf = { groesse: "205/55 R16", hersteller: "Michelin", modell: "", saison: "sommer", dot: "2523", profiltiefe_mm: 5, felge: null, bestand: 4, preis: "40", ek: "" };
  it("mit Notiz", () => expect(entwurfAlsPosten(e, notizenText(satz))).toMatchObject({ notiz: "VR: Schraube in der Lauffläche · HR: Flanke · Kunde will Rückruf" }));
  it("ohne Notiz kein Feld", () => expect("notiz" in entwurfAlsPosten(e, "")).toBe(false));
});

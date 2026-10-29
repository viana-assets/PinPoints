import { describe, expect, it, vi } from "vitest";
import {
  bezugAus, bezugBestellwunsch, bezugGeloescht, bezugPacklisteTag, CHAT_BEZUG_ANSICHT, packlisteKennung, packlisteTagAus,
} from "@/lib/chat";
import { bestellPlusText, bestellWer, meinBestellName } from "@/lib/bestellung";
import { packlisteZielZeitraum } from "@/lib/packlisteAnsicht";
import { auskunftUmfang, bestellZeile, type AuskunftDaten } from "@/lib/auskunft";

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn(), setVapidDetails: vi.fn() } }));
import { bestellFotosAufraeumen } from "@/lib/bestellVersand";

// v174 (Migration 105): Name des Eintragenden, Chat-Karten „Bestellung“ und „Packliste“, Auskunft und
// Fotoaufräumen der Bestellliste. Erfundene Daten.

describe("Wer hat es eingetragen", () => {
  const mitarbeiter = [{ profile_id: "p1", name: "Paul" }, { profile_id: "p2", name: "  " }];
  it("nimmt den Namen am Eintrag (aus der Anmeldung), sonst den Mitarbeiter, sonst „unbekannt“", () => {
    expect(bestellWer({ erstellt_von: "p1", erstellt_name: "buero.frau" }, mitarbeiter)).toBe("buero.frau");
    expect(bestellWer({ erstellt_von: "p1", erstellt_name: null }, mitarbeiter)).toBe("Paul");
    expect(bestellWer({ erstellt_von: "p2" }, mitarbeiter)).toBe("unbekannt");
    expect(bestellWer({ erstellt_von: null, erstellt_name: "" }, mitarbeiter)).toBe("unbekannt");
  });
  it("mein Name für den Hinweis im Blatt: Mitarbeiter, sonst E-Mail vor dem @", () => {
    expect(meinBestellName("p1", mitarbeiter, "x@y.de")).toBe("Paul");
    expect(meinBestellName("p9", mitarbeiter, "vh@beispiel.de")).toBe("vh");
    expect(meinBestellName(null, [], "")).toBeNull();
  });
  it("„+1“ mit Namen; ich heiße „dir“, fehlende Namen werden gezählt", () => {
    expect(bestellPlusText({ plus: [], plus_namen: [] }, "p1")).toBeNull();
    expect(bestellPlusText({ plus: ["p1", "p3"], plus_namen: ["Paul", "Anna"] }, "p1")).toBe("+1 von dir, Anna");
    expect(bestellPlusText({ plus: ["p3", "p4"], plus_namen: ["Anna", ""] }, "p1")).toBe("+1 von Anna und 1 weiteren");
    expect(bestellPlusText({ plus: ["p3", "p4"], plus_namen: ["", ""] }, null)).toBe("+2 weitere");
  });
});

describe("Chat-Karte Bestellung", () => {
  it("Titel mit Menge, darunter wofür, wer, Stand – ohne Kundenname", () => {
    expect(bezugBestellwunsch({ id: "w1", text: "Ventile TR414", menge: "1 Beutel", status: "offen" },
      { fuer: "N-MR 1", von: "Paul", stand: "Offen, dringend" }))
      .toEqual({ art: "bestellung", id: "w1", titel: "Bestellung: Ventile TR414 · 1 Beutel", unter: "N-MR 1 · von Paul · Offen, dringend" });
    expect(bezugBestellwunsch({ id: "w2", text: "Nuss", menge: null, status: "da" }).unter).toBeNull();
  });
  it("hat eine eigene Ansicht und gilt nach dem Löschen als gelöscht", () => {
    expect(CHAT_BEZUG_ANSICHT.bestellung.oeffnen).toBe("In der Bestellliste öffnen ›");
    expect(bezugGeloescht({ art: "bestellung", id: "w1", titel: "Bestellung gelöscht", unter: null })).toBe(true);
  });
});

describe("Chat-Karte Packliste", () => {
  it("der Tag steckt in einer festen Kennung – hin und zurück", () => {
    expect(packlisteKennung("2026-10-30")).toBe("00000000-0000-4000-8000-000020261030");
    expect(packlisteTagAus("00000000-0000-4000-8000-000020261030")).toBe("2026-10-30");
  });
  it("fremde oder unmögliche Kennungen ergeben keinen Tag", () => {
    expect(packlisteTagAus("00000000-0000-4000-8000-000020261332")).toBeNull();
    expect(packlisteTagAus("00000000-0000-4000-8000-000020260230")).toBeNull();
    expect(packlisteTagAus("8f2b1c9e-0000-4000-8000-000020261030")).toBeNull();
    expect(packlisteTagAus("")).toBeNull();
  });
  it("Titel mit Wochentag, darunter nur Zahlen", () => {
    expect(bezugPacklisteTag("2026-10-30", { auftraege: 3, saetze: 2, verkauf: 0 }))
      .toEqual({ art: "packliste", id: "00000000-0000-4000-8000-000020261030", titel: "Packliste Fr 30.10.", unter: "3 Aufträge · 2 Sätze aus dem Lager" });
    expect(bezugPacklisteTag("2026-10-29", { auftraege: 1, saetze: 1, verkauf: 4 }).unter).toBe("1 Auftrag · 1 Satz aus dem Lager · 4 Verkaufsreifen");
  });
  it("kommt aus der Datenbank zurück wie jede Karte", () => {
    expect(bezugAus({ bezug_art: "packliste", bezug_id: "00000000-0000-4000-8000-000020261030", bezug_titel: "Packliste Fr 30.10.", bezug_unter: null }))
      .toEqual({ art: "packliste", id: "00000000-0000-4000-8000-000020261030", titel: "Packliste Fr 30.10.", unter: null });
  });
  it("welcher Zeitraum zeigt den Tag", () => {
    expect(packlisteZielZeitraum("2026-10-20", "2026-10-26")).toEqual({ zeitraum: "14", sichtbar: false });
    expect(packlisteZielZeitraum("2026-10-26", "2026-10-26")).toEqual({ zeitraum: "14", sichtbar: true });
    expect(packlisteZielZeitraum("2026-11-08", "2026-10-26")).toEqual({ zeitraum: "14", sichtbar: true });
    expect(packlisteZielZeitraum("2026-11-09", "2026-10-26")).toEqual({ zeitraum: "alle", sichtbar: true });
    expect(packlisteZielZeitraum("2027-03-01", "2026-10-26")).toEqual({ zeitraum: "alle", sichtbar: false });
  });
});

describe("Auskunft: Bestellwünsche", () => {
  it("eine Zeile je Wunsch, Umfang nur mit Feld", () => {
    expect(bestellZeile({ eingetragen: "2026-10-29T08:00:00Z", text: "Ventile", menge: "4 Stück", status: "bestellt", notiz: "Würth", grund: null, foto: true }))
      .toEqual(["29.10.2026 · Bestellt", "Ventile (4 Stück) · Würth · mit Foto"]);
    expect(bestellZeile({ eingetragen: "2026-10-29T08:00:00Z", text: "Nuss", menge: null, status: "nicht_noetig", notiz: null, grund: "liegt im Lager", foto: false })[1])
      .toBe("Nuss · nicht nötig: liegt im Lager");
    const basis = { kontakte: [], fahrzeuge: [], auftraege: [], reifensaetze: [], rechnungen: [], protokoll: { eintraege: 0, aeltester: null, neuester: null } } as unknown as AuskunftDaten;
    expect(auskunftUmfang(basis).some(([k]) => k.startsWith("Bestellwünsche"))).toBe(false);
    expect(auskunftUmfang({ ...basis, bestellungen: [] }).find(([k]) => k.startsWith("Bestellwünsche"))).toEqual(["Bestellwünsche (Bestellliste)", "0"]);
  });
});

describe("Fotos gelöschter Bestellwünsche (Minutentakt)", () => {
  function supa(liste: string[] | null, fehler: { code: string; message: string } | null = null) {
    const aufrufe: string[] = [];
    const s = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        aufrufe.push(name + ":" + JSON.stringify(args));
        return name === "bestell_fotos_weg_liste" ? { data: liste, error: fehler } : { data: 1, error: null };
      }),
      storage: { from: vi.fn((b: string) => ({ remove: vi.fn(async (p: string[]) => { aufrufe.push(`remove:${b}:${p.join(",")}`); return { error: null }; }) })) },
    };
    return { s: s as unknown as Parameters<typeof bestellFotosAufraeumen>[0], aufrufe };
  }
  it("löscht die vorgemerkten Dateien und hakt sie ab", async () => {
    const { s, aufrufe } = supa(["p1/a.jpg", "p2/b.jpg"]);
    expect(await bestellFotosAufraeumen(s)).toEqual({ entfernt: 2 });
    expect(aufrufe).toEqual([
      'bestell_fotos_weg_liste:{"p_anzahl":200}', "remove:bestell-fotos:p1/a.jpg,p2/b.jpg",
      'bestell_fotos_weg_erledigt:{"p_pfade":["p1/a.jpg","p2/b.jpg"]}',
    ]);
  });
  it("vor Migration 105 (Funktion fehlt) ist das kein Fehler", async () => {
    const { s } = supa(null, { code: "PGRST202", message: "not found" });
    expect(await bestellFotosAufraeumen(s)).toEqual({ entfernt: 0 });
  });
  it("leere Liste: nichts tun", async () => {
    const { s, aufrufe } = supa([]);
    expect(await bestellFotosAufraeumen(s)).toEqual({ entfernt: 0 });
    expect(aufrufe).toHaveLength(1);
  });
});

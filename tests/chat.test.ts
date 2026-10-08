import { describe, expect, it } from "vitest";
import {
  bezugAuftrag, bezugAus, bezugGeloescht, bezugKunde, bezugPlatz, bezugVerkaufsreifen, bezugVorschlaege, chatPushInhalt,
  CHAT_PUSH_TEXT_MAX, erwaehnteIds, erwaehnungEinsetzen, erwaehnungsAnfrage, erwaehnungsVorschlaege, initialen, kuerzen,
  nachTagen, personenFarbe, tagLabel, textTeile, zahlText, type ChatPerson,
  antwortVorschau, chatReaktionPushInhalt, meineReaktion, reaktionenZaehlen, reaktionNachTipp, CHAT_REAKTIONEN,
} from "@/lib/chat";

// Die Regeln hinter dem Team-Chat (lib/chat.ts, Migration 80, v129).

const jan: ChatPerson = { id: "j", name: "Jan Becker", rolle: "techniker" };
const vitali: ChatPerson = { id: "v", name: "Vitali", rolle: "admin" };
const ja: ChatPerson = { id: "ja", name: "Jan", rolle: "user" };

describe("Karten", () => {
  it("Auftrag: Nummer und Titel oben, Kunde · Tag · Uhrzeit darunter", () => {
    const b = bezugAuftrag({ id: "o1", order_number: 114, title: "Räderwechsel", order_date: "2026-10-08", time: "09:45" }, "Uwe Brenner");
    expect(b).toEqual({ art: "auftrag", id: "o1", titel: "Auftrag #114 · Räderwechsel", unter: "Uwe Brenner · Do 8.10. · 09:45" });
    expect(bezugAuftrag({ id: "o2", order_number: 5, title: "", order_date: "2026-10-08", time: null }, null).titel).toBe("Auftrag #5");
  });

  it("Kunde: Firma als Titel, Ansprechpartner und Ort darunter – keine Straße", () => {
    expect(bezugKunde({ id: "c1", name: "Petra Maier", company: "Autohaus Beispiel GmbH", address: "Hauptstr. 3, 90513 Zirndorf" }))
      .toEqual({ art: "kunde", id: "c1", titel: "Kunde Autohaus Beispiel GmbH", unter: "Petra Maier · Zirndorf" });
    expect(bezugKunde({ id: "c2", name: "Uwe Brenner", company: null, address: "ohne PLZ" }).unter).toBeNull();
  });

  it("Lagerplatz und Verkaufsreifen", () => {
    expect(bezugPlatz({ id: "p1", code: "A-11" }, { kundenName: "Uwe Brenner", saison: "sommer", groesse: "205/55 R16" }))
      .toMatchObject({ art: "platz", titel: "Lagerplatz A-11", unter: "Uwe Brenner · Sommer · 205/55 R16" });
    const r = bezugVerkaufsreifen({ id: "r1", breite: 205, querschnitt: 55, zoll: 16, hersteller: "Muster", modell: "Eco", saison: "winter", bestand: 4 });
    expect(r).toMatchObject({ art: "verkaufsreifen", titel: "Verkaufsreifen 205/55 R16", unter: "Muster Eco · Winter · 4 Stk." });
  });

  it("aus der Zeile zurück, und „gelöscht“ öffnet nichts", () => {
    expect(bezugAus({ bezug_art: null, bezug_id: null, bezug_titel: null, bezug_unter: null })).toBeNull();
    const b = bezugAus({ bezug_art: "kunde", bezug_id: "c1", bezug_titel: "Kunde gelöscht", bezug_unter: null })!;
    expect(bezugGeloescht(b)).toBe(true);
    expect(bezugGeloescht({ ...b, titel: "Kunde Muster" })).toBe(false);
  });

  it("Titel werden gekürzt", () => {
    expect(kuerzen("a ".repeat(100), 10)).toBe("a a a a a…");
    expect(kuerzen("  kurz  ", 10)).toBe("kurz");
  });
});

describe("@-Erwähnungen", () => {
  it("erkennt ein angefangenes @ nur am Wortanfang", () => {
    expect(erwaehnungsAnfrage("Danke @Vi")).toBe("Vi");
    expect(erwaehnungsAnfrage("@")).toBe("");
    expect(erwaehnungsAnfrage("mail@firma")).toBeNull();
    expect(erwaehnungsAnfrage("Danke @Vi ")).toBeNull();
  });

  it("schlägt nach jedem Namensteil vor, ohne mich selbst", () => {
    const alle = [jan, vitali, ja];
    expect(erwaehnungsVorschlaege(alle, "be", null).map((p) => p.id)).toEqual(["j"]);
    expect(erwaehnungsVorschlaege(alle, "", "v").map((p) => p.id)).toEqual(["j", "ja"]);
    expect(erwaehnungsVorschlaege(alle, "VI", null).map((p) => p.id)).toEqual(["v"]);
  });

  it("setzt den Namen an die Stelle des Angefangenen", () => {
    expect(erwaehnungEinsetzen("Danke @Vi", 9, "Vitali")).toEqual({ text: "Danke @Vitali ", cursor: 14 });
    expect(erwaehnungEinsetzen("@J bitte", 2, "Jan Becker")).toEqual({ text: "@Jan Becker bitte", cursor: 12 });
  });

  it("erwähnt ist nur, wer beim Absenden noch im Text steht", () => {
    expect(erwaehnteIds("@Vitali hallo", [vitali, jan])).toEqual(["v"]);
    expect(erwaehnteIds("hallo", [vitali])).toEqual([]);
  });

  it("hebt erwähnte Namen hervor – der längere zuerst", () => {
    expect(textTeile("Hallo @Jan Becker und @Jan!", ["Jan", "Jan Becker"])).toEqual([
      { text: "Hallo ", erwaehnung: false },
      { text: "@Jan Becker", erwaehnung: true },
      { text: " und ", erwaehnung: false },
      { text: "@Jan", erwaehnung: true },
      { text: "!", erwaehnung: false },
    ]);
    expect(textTeile("a.b @x", [])).toEqual([{ text: "a.b @x", erwaehnung: false }]);
    expect(textTeile("@A.B", ["A.B"])).toEqual([{ text: "@A.B", erwaehnung: true }]);
  });
});

describe("Anzeige", () => {
  const jetzt = new Date(2026, 9, 8, 12, 0);
  it("Tagestrenner: HEUTE, GESTERN, sonst das Datum", () => {
    expect(tagLabel(new Date(2026, 9, 8, 7, 0).toISOString(), jetzt)).toBe("HEUTE");
    expect(tagLabel(new Date(2026, 9, 7, 23, 0).toISOString(), jetzt)).toBe("GESTERN");
    expect(tagLabel(new Date(2026, 9, 6, 8, 0).toISOString(), jetzt)).toBe("Di 6.10.2026");
  });

  it("gruppiert nach Tagen, älteste zuerst", () => {
    const g = nachTagen([
      { id: "b", created_at: new Date(2026, 9, 8, 9).toISOString() },
      { id: "a", created_at: new Date(2026, 9, 7, 9).toISOString() },
      { id: "c", created_at: new Date(2026, 9, 8, 10).toISOString() },
    ], jetzt);
    expect(g.map((x) => [x.tag, x.nachrichten.map((n) => n.id)])).toEqual([["GESTERN", ["a"]], ["HEUTE", ["b", "c"]]]);
  });

  it("Initialen, feste Farbe, 99+", () => {
    expect(initialen("Vitali")).toBe("VI");
    expect(initialen("Jan Peter Becker")).toBe("JB");
    expect(personenFarbe("abc")).toBe(personenFarbe("abc"));
    expect(zahlText(5)).toBe("5");
    expect(zahlText(120)).toBe("99+");
  });
});

describe("Vorschläge für „+“", () => {
  const kunden = [
    { id: "k1", name: "Uwe Brenner", company: null, address: "x" },
    { id: "k2", name: "Petra Maier", company: "Autohaus Beispiel", address: "y" },
  ];
  const auftraege = [
    { id: "o1", order_number: 114, title: "Räderwechsel", order_date: "2026-10-08", time: "09:45", customer_id: "k1", deleted_at: null },
    { id: "o2", order_number: 90, title: "Einlagerung", order_date: "2026-09-01", time: null, customer_id: "k2", deleted_at: null },
    { id: "o3", order_number: 91, title: "Weg", order_date: "2026-10-09", time: null, customer_id: "k2", deleted_at: "2026-10-01" },
  ];
  it("ohne Suchtext: Aufträge ab heute, keine gelöschten", () => {
    expect(bezugVorschlaege("", auftraege, kunden, "2026-10-08").map((b) => b.id)).toEqual(["o1"]);
  });
  it("nach Nummer, Titel, Kunde – und Kunden nach Name oder Firma", () => {
    expect(bezugVorschlaege("#114", auftraege, kunden, "2026-10-08").map((b) => b.id)).toEqual(["o1"]);
    expect(bezugVorschlaege("autohaus", auftraege, kunden, "2026-10-08").map((b) => `${b.art}:${b.id}`)).toEqual(["auftrag:o2", "kunde:k2"]);
  });
});

describe("Push-Inhalt", () => {
  it("Titel, gekürzter Text mit Karte, Ziel und Zahl", () => {
    const p = chatPushInhalt({ id: "n1", autorName: "Jan", text: "x".repeat(300), bezugTitel: "Auftrag #1", erwaehnt: false, zahl: 3 });
    expect(p.titel).toBe("Jan im Team-Chat");
    expect(p.text.length).toBe(CHAT_PUSH_TEXT_MAX);
    expect(p.url).toBe("/?chat=1");
    expect(p.zahl).toBe(3);
    expect(chatPushInhalt({ id: "n1", autorName: "Jan", text: "hi", bezugTitel: null, erwaehnt: true, zahl: 1 }).titel).toBe("Jan hat dich erwähnt");
  });
});

describe("Reaktionen und Antworten (Migration 81)", () => {
  const name = (id: string) => ({ a: "Jan", b: "Vitali", c: "Mira" } as Record<string, string>)[id] ?? "?";
  it("zählt je Emoji in fester Reihenfolge, mit mir und Namen", () => {
    const r = [{ profile_id: "a", emoji: "✅" }, { profile_id: "b", emoji: "👍" }, { profile_id: "c", emoji: "👍" }];
    expect(reaktionenZaehlen(r, "b", name)).toEqual([
      { emoji: "👍", anzahl: 2, ich: true, namen: ["Vitali", "Mira"] },
      { emoji: "✅", anzahl: 1, ich: false, namen: ["Jan"] },
    ]);
    expect(reaktionenZaehlen(undefined, null, name)).toEqual([]);
    expect(meineReaktion(r, "a")).toBe("✅");
    expect(meineReaktion(r, "x")).toBeNull();
  });
  it("dasselbe Emoji nimmt zurück, ein anderes ersetzt", () => {
    expect(reaktionNachTipp("👍", "👍")).toBeNull();
    expect(reaktionNachTipp("👍", "👎")).toBe("👎");
    expect(reaktionNachTipp(null, "❤️")).toBe("❤️");
  });
  it("die Liste ist die der Datenbank (Migration 81, chat_reaktion_bekannt)", () => {
    expect([...CHAT_REAKTIONEN]).toEqual(["👍", "👎", "❤️", "😂", "😮", "✅"]);
  });
  it("Zitat: wer und Anfang des Textes; fehlt die Nachricht, „frühere Nachricht“", () => {
    expect(antwortVorschau({ autor: "a", text: "x".repeat(200), bezug_titel: null }, name)).toEqual({ wer: "Jan", text: "x".repeat(89) + "…" });
    expect(antwortVorschau({ autor: "a", text: "", bezug_titel: "Auftrag #1" }, name).text).toBe("Auftrag #1");
    expect(antwortVorschau(undefined, name)).toEqual({ wer: "", text: "frühere Nachricht" });
  });
  it("Push: „hat dir geantwortet“ und „hat reagiert“", () => {
    expect(chatPushInhalt({ id: "n", autorName: "Jan", text: "ok", bezugTitel: null, erwaehnt: false, geantwortet: true, zahl: 1 }).titel).toBe("Jan hat dir geantwortet");
    expect(chatPushInhalt({ id: "n", autorName: "Jan", text: "ok", bezugTitel: null, erwaehnt: true, geantwortet: true, zahl: 1 }).titel).toBe("Jan hat dich erwähnt");
    const r = chatReaktionPushInhalt({ nachrichtId: "n1", vonId: "a", vonName: "Jan", emoji: "👍", text: "Bitte mitnehmen", zahl: 0 });
    expect(r).toMatchObject({ titel: "Jan hat reagiert", text: "👍 zu „Bitte mitnehmen“", url: "/?chat=1", kennung: "chat-reaktion-n1-a", zahl: 0 });
  });
});

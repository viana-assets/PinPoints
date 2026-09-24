import { describe, expect, it } from "vitest";
import { terminUeberschneidungen } from "@/lib/ueberschneidung";

// Fahrplan D1: Hinweis auf Doppelbuchung beim Einteilen von Mitarbeiter oder Transporter.

function auftrag(id: string, felder: Record<string, unknown> = {}) {
  return {
    id, order_number: 1, customer_id: "k1", title: "Radwechsel",
    description: null, status: "offen", order_date: "2026-10-12", time: "10:00",
    end_time: "11:00", techniker_notiz: null, firmenfahrzeug_id: null,
    completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null,
    cancel_reason: null, reopen_reason: null, rechnung_noetig: true,
    rechnung_erstellt_am: null, rechnung_erstellt_von: null, rechnung_nummer: null,
    created_at: "", updated_at: "", deleted_at: null, ...felder,
  } as never;
}

const entwurf = { id: "neu", order_date: "2026-10-12", time: "10:30", end_time: "11:30" };

describe("terminUeberschneidungen", () => {
  it("meldet einen Mitarbeiter, der zur selben Zeit schon eingeteilt ist", () => {
    const r = terminUeberschneidungen(entwurf, ["max"], null, [auftrag("a")], { a: ["max"] }, 30);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ art: "mitarbeiter", werId: "max", von: "10:00", bis: "11:00", geschaetzt: false });
  });

  it("meldet den Transporter, wenn er zur selben Zeit schon unterwegs ist", () => {
    const r = terminUeberschneidungen(entwurf, [], "t1", [auftrag("a", { firmenfahrzeug_id: "t1" })], {}, 30);
    expect(r).toEqual([expect.objectContaining({ art: "fahrzeug", werId: "t1" })]);
  });

  it("schweigt bei Berührung ohne Überlappung (11:00–12:00 nach 10:00–11:00)", () => {
    const r = terminUeberschneidungen(
      { ...entwurf, time: "11:00", end_time: "12:00" }, ["max"], null, [auftrag("a")], { a: ["max"] }, 30
    );
    expect(r).toEqual([]);
  });

  it("schweigt bei einem anderen Tag", () => {
    const r = terminUeberschneidungen(entwurf, ["max"], null, [auftrag("a", { order_date: "2026-10-13" })], { a: ["max"] }, 30);
    expect(r).toEqual([]);
  });

  it("zählt stornierte und gelöschte Aufträge nicht mit", () => {
    const andere = [auftrag("a", { status: "storniert" }), auftrag("b", { deleted_at: "2026-10-01" })];
    const r = terminUeberschneidungen(entwurf, ["max"], null, andere, { a: ["max"], b: ["max"] }, 30);
    expect(r).toEqual([]);
  });

  it("vergleicht den Auftrag nicht mit sich selbst", () => {
    const r = terminUeberschneidungen({ ...entwurf, id: "a" }, ["max"], null, [auftrag("a")], { a: ["max"] }, 30);
    expect(r).toEqual([]);
  });

  it("ohne eigene Uhrzeit gibt es keine Überschneidung", () => {
    const r = terminUeberschneidungen({ ...entwurf, time: null, end_time: null }, ["max"], null, [auftrag("a")], { a: ["max"] }, 30);
    expect(r).toEqual([]);
  });

  it("ein fremder Auftrag ohne Uhrzeit zählt nicht", () => {
    const r = terminUeberschneidungen(entwurf, ["max"], null, [auftrag("a", { time: null, end_time: null })], { a: ["max"] }, 30);
    expect(r).toEqual([]);
  });

  it("nimmt ein fehlendes Ende mit der Standarddauer an und sagt das", () => {
    // Fremder Termin 10:00 ohne Ende, Standard 60 Min. → bis 11:00, überlappt 10:30.
    const r = terminUeberschneidungen(entwurf, ["max"], null, [auftrag("a", { end_time: null })], { a: ["max"] }, 60);
    expect(r[0]).toMatchObject({ bis: "11:00", geschaetzt: true });
    // Mit 30 Minuten endet er um 10:30 – Berührung, keine Überschneidung.
    expect(terminUeberschneidungen(entwurf, ["max"], null, [auftrag("a", { end_time: null })], { a: ["max"] }, 30)).toEqual([]);
  });

  it("meldet nur die Mitarbeiter, die tatsächlich doppelt sind", () => {
    const r = terminUeberschneidungen(entwurf, ["max", "eva"], null, [auftrag("a")], { a: ["max", "tom"] }, 30);
    expect(r.map((u) => u.werId)).toEqual(["max"]);
  });

  it("sortiert nach Beginn", () => {
    const andere = [auftrag("spät", { time: "11:00", end_time: "12:00" }), auftrag("früh", { time: "09:00", end_time: "10:45" })];
    const r = terminUeberschneidungen(entwurf, ["max"], null, andere, { "spät": ["max"], "früh": ["max"] }, 30);
    expect(r.map((u) => u.von)).toEqual(["09:00", "11:00"]);
  });
});

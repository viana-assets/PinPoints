import { describe, expect, it } from "vitest";
import { abendhinweisFaellig, folgetag, mitnehmenListe, mitnehmenText } from "@/lib/mitnehmen";

// Abendhinweis „Reifen mitnehmen" (23.09.2026).

function auftrag(id: string, felder: Record<string, unknown> = {}) {
  return {
    id, order_number: 1, customer_id: "k1", title: "Radwechsel", description: null,
    status: "offen", order_date: "2026-10-12", time: "10:00", end_time: null,
    techniker_notiz: null, firmenfahrzeug_id: null, completed_at: null, completed_by: null,
    cancelled_at: null, cancelled_by: null, cancel_reason: null, reopen_reason: null,
    rechnung_noetig: true, rechnung_erstellt_am: null, rechnung_erstellt_von: null,
    rechnung_nummer: null, created_at: "", updated_at: "", deleted_at: null, ...felder,
  } as never;
}
function satz(id: string, felder: Record<string, unknown> = {}) {
  return {
    id, storage_slot_id: `platz-${id}`, customer_id: "k1", vehicle_id: null, saison: "sommer",
    erfassungsart: "sammel", anzahl_raeder: 4, dot_date: null, profiltiefe_mm: null, note: null,
    created_at: "2026-04-01", updated_at: "2026-04-01", removed_at: null,
    entnahme_order_id: null, order_id: null, ...felder,
  } as never;
}
function amAuftrag(orderId: string, vehicleId: string) {
  return { id: `${orderId}-${vehicleId}`, order_id: orderId, vehicle_id: vehicleId, kilometerstand: null, created_at: "", updated_at: "" };
}

const TAG = "2026-10-12";

describe("mitnehmenListe", () => {
  it("findet den Auftrag, dessen Kunde einen Satz im Regal hat", () => {
    const r = mitnehmenListe(TAG, [auftrag("a")], [satz("s1")], []);
    expect(r).toHaveLength(1);
    expect(r[0].saetze.map((s) => s.id)).toEqual(["s1"]);
  });

  it("ignoriert andere Tage, erledigte, stornierte und gelöschte Aufträge", () => {
    const auftraege = [
      auftrag("morgen", { order_date: "2026-10-13" }),
      auftrag("fertig", { status: "erledigt" }),
      auftrag("storno", { status: "storniert" }),
      auftrag("weg", { deleted_at: "2026-10-01" }),
    ];
    expect(mitnehmenListe(TAG, auftraege, [satz("s1")], [])).toEqual([]);
  });

  it("zählt einen begonnenen Auftrag mit", () => {
    expect(mitnehmenListe(TAG, [auftrag("a", { status: "in_arbeit" })], [satz("s1")], [])).toHaveLength(1);
  });

  it("ohne Satz im Regal kein Eintrag – auch nicht mit ausgelagertem", () => {
    expect(mitnehmenListe(TAG, [auftrag("a")], [satz("s1", { removed_at: "2026-09-01" })], [])).toEqual([]);
    expect(mitnehmenListe(TAG, [auftrag("a")], [satz("s1", { customer_id: "k2" })], [])).toEqual([]);
  });

  it("mit Fahrzeugen am Auftrag nur deren Sätze, dazu die ohne Fahrzeug", () => {
    const saetze = [satz("golf", { vehicle_id: "v1" }), satz("polo", { vehicle_id: "v2" }), satz("alt")];
    const r = mitnehmenListe(TAG, [auftrag("a")], saetze, [amAuftrag("a", "v1")]);
    expect(r[0].saetze.map((s) => s.id)).toEqual(["golf", "alt"]);
  });

  it("ohne Fahrzeug am Auftrag alle Sätze des Kunden", () => {
    const saetze = [satz("golf", { vehicle_id: "v1" }), satz("polo", { vehicle_id: "v2" })];
    expect(mitnehmenListe(TAG, [auftrag("a")], saetze, [])[0].saetze).toHaveLength(2);
  });

  it("der an DIESEM Auftrag eingelagerte Satz ist keiner zum Mitnehmen", () => {
    expect(mitnehmenListe(TAG, [auftrag("a")], [satz("neu", { order_id: "a" })], [])).toEqual([]);
  });

  it("ein Satz erscheint nur beim ersten von zwei Terminen des Kunden", () => {
    const r = mitnehmenListe(TAG, [auftrag("spät", { time: "14:00" }), auftrag("früh", { time: "08:00" })], [satz("s1")], []);
    expect(r.map((e) => e.auftrag.id)).toEqual(["früh"]);
  });

  it("sortiert nach Uhrzeit, ohne Uhrzeit ans Ende", () => {
    const auftraege = [
      auftrag("ohne", { time: null, customer_id: "k3" }),
      auftrag("zehn", { time: "10:00", customer_id: "k2" }),
      auftrag("acht", { time: "08:00", customer_id: "k1" }),
    ];
    const saetze = [satz("s1"), satz("s2", { customer_id: "k2" }), satz("s3", { customer_id: "k3" })];
    expect(mitnehmenListe(TAG, auftraege, saetze, []).map((e) => e.auftrag.id)).toEqual(["acht", "zehn", "ohne"]);
  });
});

describe("mitnehmenText", () => {
  it("fasst mehrere Kunden zu einer Meldung zusammen, mit Uhrzeit und Plätzen", () => {
    const eintraege = mitnehmenListe(
      TAG,
      [auftrag("a", { time: "08:00" }), auftrag("b", { time: null, customer_id: "k2" })],
      [satz("s1"), satz("s2"), satz("s3", { customer_id: "k2" })],
      []
    );
    const namen: Record<string, string> = { k1: "Müller", k2: "Weber" };
    const t = mitnehmenText(eintraege, (id) => namen[id], (id) => id.replace("platz-", "P-"));
    expect(t.titel).toBe("Morgen 3 Sätze mitnehmen");
    expect(t.text).toBe("08:00 Müller (P-s1, P-s2) · Weber (P-s3)");
  });
  it("Einzahl bei einem Satz", () => {
    const e = mitnehmenListe(TAG, [auftrag("a")], [satz("s1")], []);
    expect(mitnehmenText(e, () => "X", () => "A-1").titel).toBe("Morgen 1 Satz mitnehmen");
  });
});

describe("folgetag", () => {
  it("rechnet über Monats- und Jahresgrenzen und die Zeitumstellung", () => {
    expect(folgetag("2026-09-30")).toBe("2026-10-01");
    expect(folgetag("2026-12-31")).toBe("2027-01-01");
    expect(folgetag("2026-10-24")).toBe("2026-10-25");
    expect(folgetag("2026-10-25")).toBe("2026-10-26");
    expect(folgetag("2028-02-28")).toBe("2028-02-29");
  });
});

describe("abendhinweisFaellig", () => {
  const um = (hh: number, mm = 0) => hh * 60 + mm;
  it("ohne Einstellung: an, ab 20:00", () => {
    expect(abendhinweisFaellig(undefined, um(19, 59))).toBe(false);
    expect(abendhinweisFaellig(undefined, um(20))).toBe(true);
    expect(abendhinweisFaellig(undefined, um(23, 59))).toBe(true);
  });
  it("folgt der eigenen Uhrzeit", () => {
    expect(abendhinweisFaellig({ abendhinweis_aktiv: true, abendhinweis_uhrzeit: "18:30" }, um(18, 29))).toBe(false);
    expect(abendhinweisFaellig({ abendhinweis_aktiv: true, abendhinweis_uhrzeit: "18:30" }, um(18, 30))).toBe(true);
  });
  it("abgeschaltet heißt nie", () => {
    expect(abendhinweisFaellig({ abendhinweis_aktiv: false, abendhinweis_uhrzeit: "18:30" }, um(22))).toBe(false);
  });
  it("eine unlesbare Uhrzeit fällt auf 20:00 zurück", () => {
    expect(abendhinweisFaellig({ abendhinweis_aktiv: true, abendhinweis_uhrzeit: "abends" }, um(20))).toBe(true);
    expect(abendhinweisFaellig({ abendhinweis_aktiv: true, abendhinweis_uhrzeit: "abends" }, um(19))).toBe(false);
  });
});

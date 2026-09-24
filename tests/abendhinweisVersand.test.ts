import { beforeEach, describe, expect, it, vi } from "vitest";

// Der Versand des Abendhinweises (lib/abendhinweisVersand.ts) gegen eine nachgebaute
// Datenschnittstelle. Geprüft wird, WER WAS bekommt – die fachliche Auswahl selbst steht in
// tests/mitnehmen.test.ts.

vi.mock("server-only", () => ({}));
const gesendet: { endpoint: string; inhalt: { titel: string; text: string; url: string } }[] = [];
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (abo: { endpoint: string }, inhalt: string) => {
      gesendet.push({ endpoint: abo.endpoint, inhalt: JSON.parse(inhalt) });
    },
  },
}));

import { abendhinweiseVersenden } from "@/lib/abendhinweisVersand";

type Zeile = Record<string, unknown>;

// Ein Nachbau genau der Aufrufe, die der Versand macht: select/eq/in/is/not, upsert mit
// ignoreDuplicates, delete. Kein allgemeiner PostgREST – nur so viel, dass der Ablauf echt ist.
function falscheDatenbank(tabellen: Record<string, Zeile[]>, schluessel: Record<string, string[]>) {
  function abfrage(name: string) {
    let filter: ((z: Zeile) => boolean)[] = [];
    let modus: "select" | "upsert" | "delete" = "select";
    let neueZeilen: Zeile[] = [];
    const builder = {
      select() { return builder; },
      eq(f: string, w: unknown) { filter.push((z) => z[f] === w); return builder; },
      in(f: string, w: unknown[]) { filter.push((z) => w.includes(z[f])); return builder; },
      is(f: string, w: unknown) { filter.push((z) => (z[f] ?? null) === w); return builder; },
      not(f: string, _op: string, w: unknown) { filter.push((z) => (z[f] ?? null) !== w); return builder; },
      upsert(zeilen: Zeile[]) {
        modus = "upsert";
        const k = schluessel[name];
        neueZeilen = zeilen.filter((n) => !(tabellen[name] ||= []).some((a) => k.every((f) => a[f] === n[f])));
        tabellen[name].push(...neueZeilen);
        return builder;
      },
      delete() { modus = "delete"; return builder; },
      then(fertig: (a: { data: Zeile[] | null; error: null }) => unknown) {
        const alle = tabellen[name] || [];
        if (modus === "upsert") return Promise.resolve(fertig({ data: neueZeilen, error: null }));
        const treffer = alle.filter((z) => filter.every((f) => f(z)));
        if (modus === "delete") tabellen[name] = alle.filter((z) => !treffer.includes(z));
        filter = [];
        return Promise.resolve(fertig({ data: treffer, error: null }));
      },
    };
    return builder;
  }
  return { from: abfrage } as never;
}

function auftrag(id: string, kunde: string, felder: Zeile = {}) {
  return { id, order_number: 1, customer_id: kunde, status: "offen", order_date: "2026-10-13", time: "09:00", deleted_at: null, ...felder };
}
function satz(id: string, kunde: string, platz: string) {
  return { id, customer_id: kunde, storage_slot_id: platz, vehicle_id: null, removed_at: null, order_id: null };
}

let db: Record<string, Zeile[]>;
const SCHLUESSEL = { push_abendhinweis: ["profile_id", "fuer_datum"] };

beforeEach(() => {
  gesendet.length = 0;
  db = {
    push_geraete: [
      { profile_id: "tech", endpoint: "handy-tech", p256dh: "p", auth: "a" },
      { profile_id: "chef", endpoint: "handy-chef", p256dh: "p", auth: "a" },
    ],
    user_settings: [],
    push_abendhinweis: [],
    orders: [auftrag("a1", "k1"), auftrag("a2", "k2", { time: "11:00" })],
    tire_storage: [satz("s1", "k1", "p1"), satz("s2", "k2", "p2")],
    auftrag_fahrzeuge: [],
    order_employees: [{ order_id: "a1", employee_id: "e-tech" }],
    employees: [{ id: "e-tech", profile_id: "tech" }],
    profiles: [{ id: "chef", role: "admin" }, { id: "tech", role: "techniker" }],
    customers: [{ id: "k1", name: "Müller" }, { id: "k2", name: "Weber" }],
    storage_slots: [{ id: "p1", code: "A-12" }, { id: "p2", code: "B-03" }],
  };
});

const ABENDS = { datum: "2026-10-12", minuten: 20 * 60 };

describe("abendhinweiseVersenden", () => {
  it("vor der eingestellten Uhrzeit passiert nichts", async () => {
    const r = await abendhinweiseVersenden(falscheDatenbank(db, SCHLUESSEL), { datum: "2026-10-12", minuten: 19 * 60 + 59 });
    expect(r).toEqual({ faellig: 0, hinweise: 0, gesendet: 0 });
    expect(gesendet).toEqual([]);
  });

  it("der Techniker bekommt seinen Auftrag, der Admin den ohne Zuteilung", async () => {
    const r = await abendhinweiseVersenden(falscheDatenbank(db, SCHLUESSEL), ABENDS);
    expect(r.gesendet).toBe(2);
    const anTech = gesendet.find((g) => g.endpoint === "handy-tech")!.inhalt;
    const anChef = gesendet.find((g) => g.endpoint === "handy-chef")!.inhalt;
    expect(anTech.titel).toBe("Morgen 1 Satz mitnehmen");
    expect(anTech.text).toBe("09:00 Müller (A-12)");
    expect(anChef.text).toBe("11:00 Weber (B-03)");
    expect(anChef.url).toBe("/?mitnehmen=2026-10-13");
  });

  it("geht an einem Abend nur einmal", async () => {
    const f = falscheDatenbank(db, SCHLUESSEL);
    await abendhinweiseVersenden(f, ABENDS);
    gesendet.length = 0;
    const r = await abendhinweiseVersenden(f, { ...ABENDS, minuten: ABENDS.minuten + 1 });
    expect(r.gesendet).toBe(0);
    expect(gesendet).toEqual([]);
  });

  it("wer ihn abgeschaltet hat, bekommt nichts", async () => {
    db.user_settings = [{ user_id: "tech", abendhinweis_aktiv: false, abendhinweis_uhrzeit: "20:00" }];
    await abendhinweiseVersenden(falscheDatenbank(db, SCHLUESSEL), ABENDS);
    expect(gesendet.map((g) => g.endpoint)).toEqual(["handy-chef"]);
  });

  it("ist der Zugeteilte ohne Konto, geht der Auftrag an die Admins", async () => {
    db.employees = [{ id: "e-tech", profile_id: null }];
    await abendhinweiseVersenden(falscheDatenbank(db, SCHLUESSEL), ABENDS);
    expect(gesendet.map((g) => g.endpoint)).toEqual(["handy-chef"]);
    expect(gesendet[0].inhalt.text).toBe("09:00 Müller (A-12) · 11:00 Weber (B-03)");
  });

  it("ohne etwas zum Mitnehmen keine Meldung und kein Eintrag – ein späterer Auftrag kommt noch", async () => {
    db.tire_storage = [];
    const f = falscheDatenbank(db, SCHLUESSEL);
    await abendhinweiseVersenden(f, ABENDS);
    expect(gesendet).toEqual([]);
    expect(db.push_abendhinweis).toEqual([]);
    db.tire_storage.push(satz("s1", "k1", "p1"));
    await abendhinweiseVersenden(f, { ...ABENDS, minuten: 21 * 60 });
    expect(gesendet.map((g) => g.endpoint)).toEqual(["handy-tech"]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Die Push-Meldung zum Team-Chat (lib/chatVersand.ts, Migration 80) gegen eine nachgebaute
// Datenschnittstelle: wer sie bekommt, was drinsteht, dass nichts doppelt geht.

vi.mock("server-only", () => ({}));
const gesendet: { endpoint: string; inhalt: { titel: string; text: string; url: string; kennung: string; zahl: number } }[] = [];
let weg: Set<string>;
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (abo: { endpoint: string }, inhalt: string) => {
      if (weg.has(abo.endpoint)) throw Object.assign(new Error("weg"), { statusCode: 410 });
      gesendet.push({ endpoint: abo.endpoint, inhalt: JSON.parse(inhalt) });
    },
  },
}));

import { chatNachrichtenVersenden } from "@/lib/chatVersand";

type Zeile = Record<string, unknown>;

function falscheDatenbank(tabellen: Record<string, Zeile[]>) {
  function abfrage(name: string) {
    const filter: ((z: Zeile) => boolean)[] = [];
    let modus: "select" | "update" | "delete" | "zaehlen" = "select";
    let aenderung: Zeile = {};
    let einzeln = false;
    const builder = {
      select(_s?: string, opt?: { head?: boolean }) { if (opt?.head) modus = "zaehlen"; return builder; },
      update(a: Zeile) { modus = "update"; aenderung = a; return builder; },
      delete() { modus = "delete"; return builder; },
      eq(f: string, w: unknown) { filter.push((z) => z[f] === w); return builder; },
      neq(f: string, w: unknown) { filter.push((z) => z[f] !== w); return builder; },
      gt(f: string, w: string) { filter.push((z) => String(z[f]) > w); return builder; },
      in(f: string, w: unknown[]) { filter.push((z) => w.includes(z[f])); return builder; },
      is(f: string, w: unknown) { filter.push((z) => (z[f] ?? null) === w); return builder; },
      order() { return builder; },
      maybeSingle() { einzeln = true; return builder; },
      then(fertig: (a: { data: unknown; error: null; count?: number }) => unknown) {
        const alle = tabellen[name] || [];
        const treffer = alle.filter((z) => filter.every((f) => f(z)));
        if (modus === "update") treffer.forEach((z) => Object.assign(z, aenderung));
        if (modus === "delete") tabellen[name] = alle.filter((z) => !treffer.includes(z));
        if (modus === "zaehlen") return Promise.resolve(fertig({ data: null, error: null, count: treffer.length }));
        return Promise.resolve(fertig({ data: einzeln ? treffer[0] ?? null : treffer, error: null }));
      },
    };
    return builder;
  }
  return { from: abfrage } as never;
}

const vor = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
function nachricht(id: string, autor: string, felder: Zeile = {}) {
  return { id, kanal: "team", autor, text: "Kunde will wuchten", bezug_titel: null, erwaehnt: [], created_at: vor(0), push_gesendet_am: null, ...felder };
}

let db: Record<string, Zeile[]>;
beforeEach(() => {
  gesendet.length = 0;
  weg = new Set();
  db = {
    chat_nachrichten: [],
    chat_gelesen: [],
    module_permissions: [{ module_key: "chat", read_roles: ["admin", "techniker"] }],
    profiles: [
      { id: "jan", email: "jan@firma.example", role: "techniker" },
      { id: "chef", email: "chef@firma.example", role: "admin" },
      { id: "mira", email: "mira@firma.example", role: "user" },
      { id: "super", email: "s@firma.example", role: "superadmin" },
    ],
    employees: [{ profile_id: "jan", name: "Jan", created_at: "2026-01-01" }],
    push_geraete: [
      { profile_id: "jan", endpoint: "handy-jan", p256dh: "p", auth: "a" },
      { profile_id: "chef", endpoint: "handy-chef", p256dh: "p", auth: "a" },
      { profile_id: "mira", endpoint: "handy-mira", p256dh: "p", auth: "a" },
      { profile_id: "super", endpoint: "handy-super", p256dh: "p", auth: "a" },
    ],
  };
});

describe("Team-Chat: Push je Nachricht", () => {
  it("geht an alle mit Leserecht außer dem Schreiber – und nur einmal", async () => {
    db.chat_nachrichten.push(nachricht("n1", "jan", { bezug_titel: "Auftrag #114 · Räderwechsel" }));
    const supabase = falscheDatenbank(db);
    const erg = await chatNachrichtenVersenden(supabase);
    expect(erg).toEqual({ nachrichten: 1, gesendet: 2 });
    expect(gesendet.map((g) => g.endpoint).sort()).toEqual(["handy-chef", "handy-super"]);
    const m = gesendet[0].inhalt;
    expect(m.titel).toBe("Jan im Team-Chat");
    expect(m.text).toBe("Kunde will wuchten · Auftrag #114 · Räderwechsel");
    expect(m.url).toBe("/?chat=1");
    expect(m.kennung).toBe("chat-n1");
    expect(db.chat_nachrichten[0].push_gesendet_am).not.toBeNull();

    gesendet.length = 0;
    expect(await chatNachrichtenVersenden(supabase)).toEqual({ nachrichten: 0, gesendet: 0 });
    expect(gesendet).toHaveLength(0);
  });

  it("Erwähnte bekommen „… hat dich erwähnt“, der Name fällt auf die E-Mail zurück", async () => {
    db.chat_nachrichten.push(nachricht("n2", "chef", { text: "@Jan bitte", erwaehnt: ["jan"] }));
    await chatNachrichtenVersenden(falscheDatenbank(db));
    const anJan = gesendet.find((g) => g.endpoint === "handy-jan")!.inhalt;
    const anSuper = gesendet.find((g) => g.endpoint === "handy-super")!.inhalt;
    expect(anJan.titel).toBe("chef hat dich erwähnt");
    expect(anSuper.titel).toBe("chef im Team-Chat");
  });

  it("die Zahl am Symbol zählt je Empfänger nach seinem Lesestand", async () => {
    db.chat_nachrichten.push(
      nachricht("alt", "chef", { created_at: vor(30), push_gesendet_am: vor(30) }),
      nachricht("n3", "chef"),
    );
    db.chat_gelesen.push({ profile_id: "super", gelesen_bis: vor(10) });
    await chatNachrichtenVersenden(falscheDatenbank(db));
    expect(gesendet.find((g) => g.endpoint === "handy-jan")!.inhalt.zahl).toBe(2);
    expect(gesendet.find((g) => g.endpoint === "handy-super")!.inhalt.zahl).toBe(1);
  });

  it("älter als eine Stunde: abgehakt, aber nicht mehr gemeldet", async () => {
    db.chat_nachrichten.push(nachricht("n4", "chef", { created_at: vor(90) }));
    const erg = await chatNachrichtenVersenden(falscheDatenbank(db));
    expect(erg.gesendet).toBe(0);
    expect(db.chat_nachrichten[0].push_gesendet_am).not.toBeNull();
  });

  it("ohne Zeile in der Rechtematrix gilt die Vorgabe; verwaiste Geräte fliegen raus", async () => {
    db.module_permissions = [];
    weg.add("handy-chef");
    db.chat_nachrichten.push(nachricht("n5", "jan"));
    const erg = await chatNachrichtenVersenden(falscheDatenbank(db));
    expect(gesendet.map((g) => g.endpoint).sort()).toEqual(["handy-mira", "handy-super"]);
    expect(erg.gesendet).toBe(2);
    expect(db.push_geraete.map((g) => g.endpoint)).not.toContain("handy-chef");
  });
});

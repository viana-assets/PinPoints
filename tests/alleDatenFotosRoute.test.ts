import { beforeEach, describe, expect, it, vi } from "vitest";

// app/api/alle-daten/fotos (v142, Migration 86): Chat-Fotos nach „Alle Daten löschen“ sofort weg –
// nur für den Superadmin, und den ganzen Speicher nur, wenn der Chat wirklich leer ist.
const z = vi.hoisted(() => ({
  rolle: "superadmin" as string | null,
  nachrichten: 0,
  belege: 0 as number | null,
  runden: [] as number[],
  ordner: {} as Record<string, { name: string }[]>,
  dateien: {} as Record<string, { name: string; id: string | null }[]>,
  entfernt: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chatVersand", () => ({
  chatFotosAufraeumen: vi.fn(async () => ({ entfernt: z.runden.shift() ?? 0 })),
}));
vi.mock("@/lib/supabaseServer", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: z.rolle ? { id: "u1" } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: z.rolle } }) }) }) }),
  }),
  createAdminClient: () => ({
    from: (t: string) => ({ select: async () => t === "fin_belege"
      ? (z.belege === null ? { count: null, error: { message: "relation does not exist" } } : { count: z.belege, error: null })
      : { count: z.nachrichten, error: null } }),
    storage: {
      from: (bucket: string) => ({
        list: async (pfad: string) => ({ data: pfad === "" ? (z.ordner[bucket] ?? []) : (z.dateien[`${bucket}:${pfad}`] || []).splice(0) }),
        remove: async (pfade: string[]) => { z.entfernt.push(pfade.map((x) => `${bucket}:${x}`)); return { error: null }; },
      }),
    },
  }),
}));

import { POST } from "@/app/api/alle-daten/fotos/route";

beforeEach(() => {
  z.rolle = "superadmin"; z.nachrichten = 0; z.belege = 0; z.runden = []; z.entfernt = [];
  z.ordner = { "chat-fotos": [{ name: "a" }, { name: "b" }], "fin-belege": [{ name: "b1" }] };
  z.dateien = {
    "chat-fotos:a": [{ name: "1.jpg", id: "x" }], "chat-fotos:b": [{ name: "2.jpg", id: "y" }, { name: "unterordner", id: null }],
    "fin-belege:b1": [{ name: "q.pdf", id: "p" }],
  };
});

describe("POST /api/alle-daten/fotos", () => {
  it("lehnt Nicht-Angemeldete und Nicht-Superadmins ab", async () => {
    z.rolle = null;
    expect((await POST()).status).toBe(401);
    z.rolle = "admin";
    expect((await POST()).status).toBe(403);
    expect(z.entfernt).toEqual([]);
  });

  it("arbeitet die Vormerkliste ab und leert bei leerem Chat den ganzen Speicher", async () => {
    z.runden = [200, 37];
    const antwort = await POST();
    expect(antwort.status).toBe(200);
    expect(z.entfernt).toEqual([["chat-fotos:a/1.jpg"], ["chat-fotos:b/2.jpg"], ["fin-belege:b1/q.pdf"]]);
    expect(await antwort.json()).toEqual({ ok: true, entfernt: 240 });
  });

  it("lässt den Speicher in Ruhe, solange noch Nachrichten bzw. Belege da sind", async () => {
    z.nachrichten = 3; z.belege = 2;
    await POST();
    expect(z.entfernt).toEqual([]);
  });

  it("Belegspeicher bleibt, wenn es die Tabelle noch nicht gibt (Migration 90 fehlt)", async () => {
    z.belege = null;
    await POST();
    expect(z.entfernt.flat().some((x) => x.startsWith("fin-belege:"))).toBe(false);
  });
});

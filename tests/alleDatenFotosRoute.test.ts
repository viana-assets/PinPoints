import { beforeEach, describe, expect, it, vi } from "vitest";

// app/api/alle-daten/fotos (v142, Migration 86): Chat-Fotos nach „Alle Daten löschen“ sofort weg –
// nur für den Superadmin, und den ganzen Speicher nur, wenn der Chat wirklich leer ist.
const z = vi.hoisted(() => ({
  rolle: "superadmin" as string | null,
  nachrichten: 0,
  runden: [] as number[],
  ordner: [] as { name: string }[],
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
    from: () => ({ select: async () => ({ count: z.nachrichten, error: null }) }),
    storage: {
      from: () => ({
        list: async (pfad: string) => ({ data: pfad === "" ? z.ordner : (z.dateien[pfad] || []).splice(0) }),
        remove: async (pfade: string[]) => { z.entfernt.push(pfade); return { error: null }; },
      }),
    },
  }),
}));

import { POST } from "@/app/api/alle-daten/fotos/route";

beforeEach(() => {
  z.rolle = "superadmin"; z.nachrichten = 0; z.runden = []; z.entfernt = [];
  z.ordner = [{ name: "a" }, { name: "b" }];
  z.dateien = { a: [{ name: "1.jpg", id: "x" }], b: [{ name: "2.jpg", id: "y" }, { name: "unterordner", id: null }] };
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
    expect(z.entfernt).toEqual([["a/1.jpg"], ["b/2.jpg"]]);
    expect(await antwort.json()).toEqual({ ok: true, entfernt: 239 });
  });

  it("lässt den Speicher in Ruhe, solange noch Nachrichten da sind", async () => {
    z.nachrichten = 3;
    await POST();
    expect(z.entfernt).toEqual([]);
  });
});

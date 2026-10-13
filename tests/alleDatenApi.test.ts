import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alleDatenLoeschen, fetchAppStand } from "@/lib/api/alleDaten";

// „Alle Daten löschen“ ab v142 (Migration 86): mit Fassung für „Was gibt es Neues“, Rückfall auf den
// alten Aufruf, solange Migration 86 nicht gelaufen ist, danach die Chat-Fotos über den Server.

function falscheDb(rpcAntworten: { data: unknown; error: { message: string; code: string } | null }[]) {
  const rpc = vi.fn(async () => rpcAntworten.shift() ?? { data: {}, error: null });
  const kette = { select: () => kette, order: () => kette, range: async () => ({ data: [], error: null }) };
  return { rpc, supabase: { rpc, from: () => kette } as unknown as SupabaseClient };
}

afterEach(() => vi.unstubAllGlobals());

describe("alleDatenLoeschen", () => {
  it("gibt die Fassung mit und räumt danach die Chat-Fotos über den Server ab", async () => {
    const holen = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", holen);
    const { rpc, supabase } = falscheDb([{ data: { neuigkeiten_ab: "v142" }, error: null }]);
    const schritte: string[] = [];
    await alleDatenLoeschen(supabase, "löschen", (t) => schritte.push(t), "v142");
    expect(rpc).toHaveBeenCalledWith("alle_daten_loeschen", { p_bestaetigung: "löschen", p_fassung: "v142" });
    expect(holen).toHaveBeenCalledWith("/api/alle-daten/fotos", { method: "POST" });
    expect(schritte.at(-1)).toMatch(/Chat-Fotos/);
  });

  it("fällt ohne Migration 86 auf den Aufruf mit nur dem Wort zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const { rpc, supabase } = falscheDb([
      { data: null, error: { message: "Could not find the function", code: "PGRST202" } },
      { data: { zugaenge_geloescht: 1 }, error: null },
    ]);
    await alleDatenLoeschen(supabase, "löschen", undefined, "v142");
    expect(rpc).toHaveBeenLastCalledWith("alle_daten_loeschen", { p_bestaetigung: "löschen" });
  });

  it("gibt einen echten Fehler weiter und ruft den Server nicht", async () => {
    const holen = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", holen);
    const { supabase } = falscheDb([{ data: null, error: { message: "Alle Daten löschen darf nur der Superadmin.", code: "P0001" } }]);
    await expect(alleDatenLoeschen(supabase, "löschen", undefined, "v142")).rejects.toThrow(/nur der Superadmin/);
    expect(holen).not.toHaveBeenCalled();
  });

  it("stört sich nicht daran, wenn der Server nicht erreichbar ist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { supabase } = falscheDb([{ data: {}, error: null }]);
    await expect(alleDatenLoeschen(supabase, "löschen", undefined, "v142")).resolves.toEqual({});
  });
});

describe("fetchAppStand", () => {
  const mit = (antwort: unknown) => ({ from: () => ({ select: () => ({ maybeSingle: async () => antwort }) }) }) as unknown as SupabaseClient;
  it("liefert die Zeile, vor Migration 86 null", async () => {
    expect(await fetchAppStand(mit({ data: { neuigkeiten_ab: "v142", alles_geloescht_am: null }, error: null }))).toEqual({ neuigkeiten_ab: "v142", alles_geloescht_am: null });
    expect(await fetchAppStand(mit({ data: null, error: { code: "PGRST205", message: "x" } }))).toBeNull();
    expect(await fetchAppStand(mit({ data: null, error: null }))).toBeNull();
    await expect(fetchAppStand(mit({ data: null, error: { code: "42501", message: "verboten" } }))).rejects.toThrow("verboten");
  });
});

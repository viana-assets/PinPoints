import { describe, expect, it } from "vitest";
import { auftragLoeschPruefung } from "@/lib/auftragLoeschen";

describe("auftragLoeschPruefung", () => {
  it("mit Rechnung: nicht löschbar, mit Begründung", () => {
    const p = auftragLoeschPruefung({ order_number: 12, status: "erledigt", rechnung_nummer: "RE-2026-0007" });
    expect(p.erlaubt).toBe(false);
    if (!p.erlaubt) expect(p.grund).toContain("RE-2026-0007");
  });
  it("erledigt und storniert: löschbar, aber mit eigener Frage", () => {
    const e = auftragLoeschPruefung({ order_number: 12, status: "erledigt", rechnung_nummer: null });
    const s = auftragLoeschPruefung({ order_number: 12, status: "storniert", rechnung_nummer: null });
    expect(e.erlaubt && e.frage).toContain("erledigt");
    expect(s.erlaubt && s.frage).toContain("storniert");
  });
  it("offen: die gewohnte Frage", () => {
    const p = auftragLoeschPruefung({ order_number: 12, status: "offen", rechnung_nummer: null });
    expect(p).toEqual({ erlaubt: true, frage: "Auftrag 12 wirklich löschen?" });
  });
});

import { describe, expect, it } from "vitest";
import { abgeschlossen, auftragsGruppen, ausgeblendet } from "@/lib/auftragsAnsicht";
import type { OrderStatus } from "@/lib/types";

// Die Regeln hinter der neuen Auftragsliste (Entwurf K).

const HEUTE = "2026-09-25";
let nr = 100;
const a = (datum: string, status: OrderStatus, extra: Record<string, unknown> = {}) => ({
  order_number: nr++, order_date: datum, time: "09:00", status, rechnung_noetig: false, rechnung_erstellt_am: null, deleted_at: null,
  kunde: "K" + nr, ...extra,
}) as { order_number: number; order_date: string; time: string | null; status: OrderStatus; rechnung_noetig: boolean; rechnung_erstellt_am: string | null; deleted_at: string | null; kunde: string };

describe("abgeschlossen / ausgeblendet", () => {
  it("erledigt ohne offene Rechnung und storniert sind abgeschlossen", () => {
    expect(abgeschlossen(a(HEUTE, "erledigt"))).toBe(true);
    expect(abgeschlossen(a(HEUTE, "storniert"))).toBe(true);
    expect(abgeschlossen(a(HEUTE, "offen"))).toBe(false);
  });
  it("erledigt mit offener Rechnung ist noch Arbeit", () => {
    expect(abgeschlossen(a(HEUTE, "erledigt", { rechnung_noetig: true }))).toBe(false);
    expect(abgeschlossen(a(HEUTE, "erledigt", { rechnung_noetig: true, rechnung_erstellt_am: "2026-09-25T10:00:00Z" }))).toBe(true);
  });
  it("ausgeblendet wird erst ab gestern – heute bleibt stehen", () => {
    expect(ausgeblendet(a(HEUTE, "erledigt"), HEUTE)).toBe(false);
    expect(ausgeblendet(a("2026-09-24", "erledigt"), HEUTE)).toBe(true);
    expect(ausgeblendet(a("2026-09-24", "offen"), HEUTE)).toBe(false);
  });
});

describe("auftragsGruppen", () => {
  const liegen = a("2026-09-22", "offen", { time: "14:00" });
  const rechnung = a("2026-09-24", "erledigt", { rechnung_noetig: true });
  const heute1 = a(HEUTE, "erledigt", { time: "08:00" });
  const heute2 = a(HEUTE, "offen", { time: "13:00" });
  const morgen = a("2026-09-26", "offen");
  const alt1 = a("2026-09-23", "erledigt");
  const alt2 = a("2026-09-18", "storniert");
  const alle = [morgen, alt2, heute2, rechnung, alt1, liegen, heute1];
  const name = (o: { kunde: string }) => o.kunde;

  it("„Anstehende zuerst“: Liegengebliebenes oben, dann ab heute aufsteigend, Vergangenes unten", () => {
    const g = auftragsGruppen(alle, HEUTE, "anstehend", name);
    expect(g.map((x) => [x.art, x.datum, x.auftraege.length])).toEqual([
      ["liegen", null, 2], ["tag", HEUTE, 2], ["tag", "2026-09-26", 1],
      ["vergangen", "2026-09-23", 1], ["vergangen", "2026-09-18", 1],
    ]);
    expect(g[0].auftraege).toEqual([liegen, rechnung]);
    expect(g[1].auftraege).toEqual([heute1, heute2]);
  });
  it("„Neueste zuerst“: alle Tage absteigend", () => {
    expect(auftragsGruppen(alle, HEUTE, "neu", name).map((x) => x.datum)).toEqual(["2026-09-26", HEUTE, "2026-09-24", "2026-09-23", "2026-09-22", "2026-09-18"]);
  });
  it("nach Kunde oder Nummer eine flache Liste", () => {
    const g = auftragsGruppen(alle, HEUTE, "nr", name);
    expect(g).toHaveLength(1);
    expect(g[0].art).toBe("flach");
    expect(g[0].auftraege.map((o) => o.order_number)).toEqual(alle.map((o) => o.order_number).sort((x, y) => y - x));
  });
  it("leere Eingabe, keine Gruppen", () => {
    expect(auftragsGruppen([], HEUTE, "anstehend", name)).toEqual([]);
    expect(auftragsGruppen([], HEUTE, "kunde", name)).toEqual([]);
  });
});

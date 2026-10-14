import { beforeEach, describe, expect, it, vi } from "vitest";
import { ustErinnerungen, ustErinnerungText, ustZeitraeume } from "@/lib/finance/steuern";

// Erinnerung an die Frist der Voranmeldung (Migration 93, v151): wann, an wen, einmal je Zeitraum und Stufe.
vi.mock("server-only", () => ({}));
const gesendet: { endpoint: string; inhalt: { titel: string; text: string; url: string; kennung: string } }[] = [];
vi.mock("web-push", () => ({
  default: { sendNotification: async (abo: { endpoint: string }, inhalt: string) => { gesendet.push({ endpoint: abo.endpoint, inhalt: JSON.parse(inhalt) }); } },
}));
import { steuerErinnerungenVersenden } from "@/lib/steuerErinnerungVersand";

const e = (p: Partial<{ wirtschaftsjahr: number; voranmeldung: "monat" | "quartal" | "keine"; dauerfrist: boolean; besteuerung: "regel" | "klein"; start_datum: string }> = {}) =>
  ({ wirtschaftsjahr: 2026, voranmeldung: "monat" as const, dauerfrist: false, besteuerung: "regel" as const, start_datum: "2026-08-01", ...p });

describe("Wann erinnert wird", () => {
  it("Zeiträume wie in der Datenbank", () => {
    expect(ustZeitraeume(2026, "monat")[1]).toEqual({ zeitraum: "M02", von: "2026-02-01", bis: "2026-02-28" });
    expect(ustZeitraeume(2026, "quartal").map((z) => z.bis)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"]);
    expect(ustZeitraeume(2026, "keine")).toEqual([{ zeitraum: "J", von: "2026-01-01", bis: "2026-12-31" }]);
  });
  it("drei Tage vorher und am Tag, nicht abgegeben, nicht vor dem Start", () => {
    // September: Frist 12.10.2026 (10.10. ist Samstag).
    expect(ustErinnerungen([e()], [], "2026-10-09")).toEqual([{ jahr: 2026, zeitraum: "M09", frist: "2026-10-12", stufe: "bald", tage: 3 }]);
    expect(ustErinnerungen([e()], [], "2026-10-08")).toEqual([]);
    expect(ustErinnerungen([e()], [], "2026-10-12")[0]).toMatchObject({ zeitraum: "M09", stufe: "heute" });
    expect(ustErinnerungen([e()], [{ jahr: 2026, zeitraum: "M09" }], "2026-10-12")).toEqual([]);
    expect(ustErinnerungen([e({ start_datum: "2026-10-01" })], [], "2026-10-12")).toEqual([]);
  });
  it("nicht für Kleinunternehmer und Befreite; Dezember-Frist im neuen Jahr", () => {
    expect(ustErinnerungen([e({ besteuerung: "klein" })], [], "2026-10-12")).toEqual([]);
    expect(ustErinnerungen([e({ voranmeldung: "keine" })], [], "2026-10-12")).toEqual([]);
    expect(ustErinnerungen([e({ dauerfrist: true })], [], "2027-02-10")[0]).toMatchObject({ zeitraum: "M12", frist: "2027-02-10", stufe: "heute" });
  });
  it("Text ohne Beträge", () => {
    const t = ustErinnerungText({ jahr: 2026, zeitraum: "M09", frist: "2026-10-12", stufe: "bald", tage: 3 });
    expect(t.text).toBe("September 2026: Frist am 12.10.2026 (in 3 Tagen). Probelauf unter Finance › Steuern ansehen – abgegeben wird über den Steuerberater oder ELSTER.");
  });
});

type Zeile = Record<string, unknown>;
function falscheDatenbank(t: Record<string, Zeile[]>) {
  return {
    from(name: string) {
      const filter: ((z: Zeile) => boolean)[] = [];
      let upsert: Zeile[] | null = null;
      let del = false;
      const ergebnis = () => {
        if (upsert) {
          const neu = upsert.filter((z) => !(t[name] ||= []).some((x) => ["profile_id", "jahr", "zeitraum", "stufe"].every((k) => x[k] === z[k])));
          t[name].push(...neu);
          return { data: neu, error: null };
        }
        if (del) { t[name] = (t[name] || []).filter((z) => !filter.every((f) => f(z))); return { data: null, error: null }; }
        return { data: (t[name] || []).filter((z) => filter.every((f) => f(z))), error: null };
      };
      const b = {
        select() { return b; },
        delete() { del = true; return b; },
        upsert(z: Zeile[]) { upsert = z; return b; },
        eq(f: string, w: unknown) { filter.push((z) => z[f] === w); return b; },
        in(f: string, w: unknown[]) { filter.push((z) => w.includes(z[f])); return b; },
        maybeSingle() { const r = ergebnis(); return Promise.resolve({ data: (r.data as Zeile[])[0] ?? null, error: null }); },
        then(ok: (r: unknown) => unknown) { return Promise.resolve(ergebnis()).then(ok); },
      };
      return b;
    },
  } as never;
}

describe("Versand", () => {
  let db: Record<string, Zeile[]>;
  beforeEach(() => {
    gesendet.length = 0;
    db = {
      fin_einstellungen: [e()], fin_voranmeldungen: [], module_permissions: [{ module_key: "finance.steuer", edit_roles: ["admin"] }],
      profiles: [{ id: "su", role: "superadmin" }, { id: "ad", role: "admin" }, { id: "te", role: "techniker" }],
      push_geraete: [{ profile_id: "su", endpoint: "e-su", p256dh: "p", auth: "a" }, { profile_id: "te", endpoint: "e-te", p256dh: "p", auth: "a" }],
      fin_steuer_erinnerungen: [],
    };
  });
  it("an Superadmin und Rollen mit Recht, mit Gerät – einmal", async () => {
    expect(await steuerErinnerungenVersenden(falscheDatenbank(db), { datum: "2026-10-09", minuten: 9 * 60 })).toEqual({ faellig: 1, gesendet: 1 });
    expect(gesendet[0]).toMatchObject({ endpoint: "e-su", inhalt: { titel: "Umsatzsteuer-Voranmeldung", url: "/?system=finance", kennung: "ust-2026-M09" } });
    expect(await steuerErinnerungenVersenden(falscheDatenbank(db), { datum: "2026-10-09", minuten: 9 * 60 + 1 })).toEqual({ faellig: 1, gesendet: 0 });
  });
  it("vor 8 Uhr und nach der Abgabe nichts", async () => {
    expect(await steuerErinnerungenVersenden(falscheDatenbank(db), { datum: "2026-10-09", minuten: 7 * 60 })).toEqual({ faellig: 0, gesendet: 0 });
    db.fin_voranmeldungen.push({ jahr: 2026, zeitraum: "M09" });
    expect(await steuerErinnerungenVersenden(falscheDatenbank(db), { datum: "2026-10-09", minuten: 9 * 60 })).toEqual({ faellig: 0, gesendet: 0 });
    expect(gesendet).toHaveLength(0);
  });
});

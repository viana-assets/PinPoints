import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fensterAbgleichStarten } from "@/lib/fensterAbgleich";

// v167: Zwei Fenster, ein Kanal – was das eine verwirft, verwirft das andere auch, ohne Ping-Pong.
type Kanal = { postMessage: (d: unknown) => void; close: () => void; onmessage: ((e: MessageEvent) => void) | null };
function kanalPaar(): [() => Kanal, () => Kanal, { gesendet: number }] {
  const zaehler = { gesendet: 0 };
  const paar: { a: Kanal | null; b: Kanal | null } = { a: null, b: null };
  const bauen = (an: "a" | "b"): Kanal => ({ onmessage: null, close: () => {}, postMessage: (d) => { zaehler.gesendet++; setTimeout(() => paar[an]?.onmessage?.({ data: structuredClone(d) } as MessageEvent), 0); } });
  const a = bauen("b"); const b = bauen("a");
  paar.a = a; paar.b = b;
  return [() => a, () => b, zaehler];
}
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("fensterAbgleich", () => {
  it("Verwerfen kommt im anderen Fenster an – auch bei anderem Zeitfenster – und läuft nicht zurück", async () => {
    const [ka, kb, z] = kanalPaar();
    const A = new QueryClient(); const B = new QueryClient();
    A.setQueryData(["auftraege", { von: "2026-10-01", bis: "2026-10-31" }], [1]);
    B.setQueryData(["auftraege", { von: "2026-10-19", bis: "2026-10-19" }], [1]);
    B.setQueryData(["kunden"], [1]);
    const stopA = fensterAbgleichStarten(A, ka); const stopB = fensterAbgleichStarten(B, kb);
    await A.invalidateQueries({ queryKey: ["auftraege"] });
    await warte(150);
    expect(B.getQueryState(["auftraege", { von: "2026-10-19", bis: "2026-10-19" }])?.isInvalidated).toBe(true);
    expect(B.getQueryState(["kunden"])?.isInvalidated).toBe(false);
    expect(z.gesendet).toBe(1);
    stopA(); stopB();
  });
  it("ohne BroadcastChannel nichts", () => {
    const stop = fensterAbgleichStarten(new QueryClient(), () => null as unknown as Kanal);
    expect(typeof stop).toBe("function");
    stop();
  });
  it("Abmelden schließt den Kanal", () => {
    const close = vi.fn();
    const stop = fensterAbgleichStarten(new QueryClient(), () => ({ onmessage: null, close, postMessage: () => {} }));
    stop();
    expect(close).toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cspKopf, neueNonce } from "@/lib/csp";

// Content-Security-Policy mit Nonce (B4, v106).

function teil(csp: string, name: string): string {
  return csp.split("; ").find((t) => t.startsWith(name + " ")) ?? "";
}

describe("cspKopf", () => {
  it("Seiten: Nonce und strict-dynamic, kein unsafe-inline für Skripte", () => {
    const csp = cspKopf("abc123");
    const s = teil(csp, "script-src");
    expect(s).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(s).not.toContain("unsafe-inline");
    expect(s).not.toContain("unsafe-eval");
  });
  it("Entwicklung erlaubt eval (Fast Refresh)", () => {
    expect(teil(cspKopf("n", { dev: true }), "script-src")).toContain("'unsafe-eval'");
  });
  it("ohne Nonce (Service Worker, Offline-Seite): nur eigene Skripte", () => {
    expect(teil(cspKopf(null), "script-src")).toBe("script-src 'self'");
  });
  it("die übrigen Regeln sind die von vorher", () => {
    const csp = cspKopf("n");
    expect(teil(csp, "img-src")).toContain("https://*.supabase.co");
    expect(teil(csp, "connect-src")).toContain("wss://*.supabase.co");
    expect(teil(csp, "connect-src")).toContain("https://fonts.gstatic.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // Keine Adresse eines Geodienstes – die Geokodierung läuft über die eigene Route (CLAUDE.md, Abschnitt 5).
    expect(csp).not.toMatch(/nominatim|photon/i);
  });
});

describe("neueNonce", () => {
  it("je Aufruf neu, 16 Byte als Base64", () => {
    const a = neueNonce();
    const b = neueNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("Dateien ohne Nonce haben kein Inline-Skript", () => {
  it("offline.html", () => {
    const html = readFileSync("public/offline.html", "utf8");
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});

describe("next.config.mjs setzt keine zweite CSP", () => {
  it("nur proxy.ts", () => {
    // Zwei CSP-Kopfzeilen wendet der Browser beide an – die alte mit 'unsafe-inline' wäre zwar
    // harmlos, aber eine ohne Nonce bräche die Seite.
    expect(readFileSync("next.config.mjs", "utf8")).not.toMatch(/key:\s*"Content-Security-Policy"/);
    expect(readFileSync("proxy.ts", "utf8")).toContain("cspKopf(");
  });
});

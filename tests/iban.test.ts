import { describe, expect, it } from "vitest";
import { ibanFehler } from "@/lib/rechnung";

// Die Beispiel-IBANs sind die bekannten Musternummern aus der Bankendokumentation, kein echtes Konto.
describe("ibanFehler", () => {
  it("gültige IBANs, mit und ohne Leerzeichen, auch klein geschrieben", () => {
    expect(ibanFehler("DE89 3704 0044 0532 0130 00")).toBeNull();
    expect(ibanFehler("de89370400440532013000")).toBeNull();
    expect(ibanFehler("AT61 1904 3002 3457 3201")).toBeNull();
  });
  it("leer ist erlaubt", () => {
    expect(ibanFehler("  ")).toBeNull();
  });
  it("Zahlendreher fällt auf", () => {
    expect(ibanFehler("DE89 3704 0044 0532 0130 01")).toMatch(/Prüfziffern/);
    expect(ibanFehler("DE89 3704 0044 0523 0130 00")).toMatch(/Prüfziffern/);
  });
  it("falsche Länge je Land", () => {
    expect(ibanFehler("DE89 3704 0044 0532 0130")).toMatch(/22 Zeichen/);
  });
  it("falscher Aufbau", () => {
    expect(ibanFehler("3704 0044 0532 0130 00")).toMatch(/Länderkürzel/);
  });
});

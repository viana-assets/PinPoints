import { describe, expect, it } from "vitest";
import { istHandy } from "@/lib/helpers";

// Die eine Entscheidung, die daran hängt: Bietet der Anrufknopf „Auf dem Handy anrufen" an?
//
// Diese Tests gibt es, weil der erste Versuch – die Medienabfrage nach Maus und Schweben –
// auf dem Arbeitsnotebook `false` lieferte und der Knopf deshalb nie erschien. Ein Fehler,
// den man am Schreibtisch nicht sieht, sondern nur auf dem Gerät, das ihn hat.

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD_NEU = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("istHandy", () => {
  it("erkennt Telefone und Tablets", () => {
    expect(istHandy(IPHONE, 5)).toBe(true);
    expect(istHandy(IPAD, 5)).toBe(true);
    expect(istHandy(ANDROID, 5)).toBe(true);
  });

  // Seit iPadOS 13 meldet sich das iPad im Standardmodus als Mac. Zu unterscheiden ist es nur
  // an den Berührungspunkten.
  it("erkennt das iPad, das sich als Mac ausgibt", () => {
    expect(istHandy(IPAD_NEU, 5)).toBe(true);
  });

  it("hält Rechner für Rechner", () => {
    expect(istHandy(WINDOWS, 0)).toBe(false);
    expect(istHandy(MAC, 0)).toBe(false);
  });

  // DER FALL, DER DEN AUSSCHLAG GAB: ein Windows-Notebook mit Touchscreen. Es meldet
  // Berührungspunkte und wurde von der Medienabfrage als Touchgerät eingestuft – der Knopf
  // erschien nie. Über die Kennung bleibt es ein Rechner.
  it("hält ein Windows-Notebook mit Touchscreen für einen Rechner", () => {
    expect(istHandy(WINDOWS, 10)).toBe(false);
  });

  it("verträgt eine leere Kennung", () => {
    expect(istHandy("", 0)).toBe(false);
    expect(istHandy("", 10)).toBe(false);
  });
});

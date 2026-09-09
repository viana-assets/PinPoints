import { describe, expect, it } from "vitest";
import { erinnerungFaellig, minutenAusUhrzeit } from "@/lib/helpers";
import { VORLAUF_MINUTEN } from "@/lib/constants";

// Die Terminerinnerung hat eine Eigenschaft, die sie schwer prüfbar macht: Wenn sie falsch
// rechnet, passiert nichts Sichtbares – es kommt nur nichts an, oder es kommt zur falschen
// Zeit. Deshalb steht die Fensterlogik in zwei kleinen Funktionen, die hier durchgespielt
// werden, statt mitten in der Versandroute (docs/benachrichtigungen-plan.md).

const FENSTER = VORLAUF_MINUTEN;
const NEUN_UHR = 9 * 60;

function faellig(jetzt: string): boolean {
  const j = minutenAusUhrzeit(jetzt);
  if (j === null) throw new Error("ungültige Testzeit");
  return erinnerungFaellig(NEUN_UHR, j, VORLAUF_MINUTEN, FENSTER);
}

describe("minutenAusUhrzeit", () => {
  it("rechnet HH:MM in Minuten seit Mitternacht um", () => {
    expect(minutenAusUhrzeit("09:00")).toBe(540);
    expect(minutenAusUhrzeit("00:00")).toBe(0);
    expect(minutenAusUhrzeit("23:59")).toBe(1439);
  });

  it("verträgt eine einstellige Stunde und Sekundenanteile", () => {
    expect(minutenAusUhrzeit("9:05")).toBe(545);
    expect(minutenAusUhrzeit("09:05:30")).toBe(545);
  });

  it("gibt null zurück, wo keine Uhrzeit steht", () => {
    expect(minutenAusUhrzeit(null)).toBeNull();
    expect(minutenAusUhrzeit("")).toBeNull();
    expect(minutenAusUhrzeit("vormittags")).toBeNull();
    expect(minutenAusUhrzeit("25:00")).toBeNull();
  });
});

describe("erinnerungFaellig", () => {
  it("schickt genau fünf Minuten vorher", () => {
    expect(faellig("08:55")).toBe(true);
  });

  it("schweigt, solange der Termin noch weiter weg ist", () => {
    expect(faellig("08:54")).toBe(false);
    expect(faellig("07:30")).toBe(false);
  });

  it("holt einen ausgefallenen Lauf im Fenster nach", () => {
    expect(faellig("08:56")).toBe(true);
    expect(faellig("08:59")).toBe(true);
    expect(faellig("09:00")).toBe(true);
  });

  it("schweigt, sobald der Termin läuft", () => {
    expect(faellig("09:01")).toBe(false);
    expect(faellig("10:00")).toBe(false);
  });
});

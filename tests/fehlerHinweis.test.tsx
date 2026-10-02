// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { FehlerHinweis, NETZ_FEHLER_TEXT, fehlerText, useAblehnungenAlsFehler } from "@/components/FehlerHinweis";
import { ApiError } from "@/lib/api/client";

// Komponententest (C6, v106): Kommt die Meldung einer Datenbankregel lesbar beim Nutzer an?
// Nachgestellt wie im Betrieb: Ein Klick-Handler wirft eine ApiError, niemand fängt sie, die
// App zeigt sie oben an. Der Text der Regel ist der aus Migration 44 (`pruefe_rechnungsdaten`).

afterEach(cleanup);

function Seite() {
  const [fehler, setFehler] = useState<string | null>(null);
  useAblehnungenAlsFehler(setFehler);
  return <FehlerHinweis text={fehler} onSchliessen={() => setFehler(null)} />;
}

function ablehnen(grund: unknown) {
  // jsdom kennt PromiseRejectionEvent nicht – ein Ereignis mit demselben Namen und `reason` genügt.
  const e = new Event("unhandledrejection", { cancelable: true }) as Event & { reason: unknown };
  e.reason = grund;
  act(() => { window.dispatchEvent(e); });
  return e;
}

describe("zentrale Fehlermeldung", () => {
  it("Datenbankregel im Klartext, mit dem, was nicht ging, davor", () => {
    render(<Seite />);
    expect(screen.queryByRole("alert")).toBeNull();
    const e = ablehnen(new ApiError("Der Status konnte nicht geändert werden", {
      message: 'Für die Rechnung fehlt noch: Kilometerstand bei FÜ-AB 1. Entweder ergänzen oder den Haken "Rechnung benötigt" entfernen.',
      code: "P0001",
    }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Der Status konnte nicht geändert werden: Für die Rechnung fehlt noch: Kilometerstand bei FÜ-AB 1.");
    // Abgefangen – die Konsole bekommt keinen roten „Uncaught (in promise)"-Eintrag dazu.
    expect(e.defaultPrevented).toBe(true);
  });
  it("lässt sich schließen", () => {
    render(<Seite />);
    ablehnen(new Error("Etwas"));
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("ohne Netz kein „Failed to fetch“", () => {
    render(<Seite />);
    ablehnen(new TypeError("Failed to fetch"));
    expect(screen.getByRole("alert").textContent).toContain(NETZ_FEHLER_TEXT);
  });
});

describe("fehlerText", () => {
  it("ohne Text eine allgemeine Meldung", () => {
    expect(fehlerText(undefined)).toBe("Es ist ein unerwarteter Fehler aufgetreten.");
    expect(fehlerText({ message: "  " })).toBe("Es ist ein unerwarteter Fehler aufgetreten.");
    expect(fehlerText("nur Text")).toBe("Es ist ein unerwarteter Fehler aufgetreten.");
  });
});

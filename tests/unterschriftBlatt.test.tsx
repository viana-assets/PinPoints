// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnterschriftBlatt } from "@/components/auftraege/UnterschriftBlatt";

// Komponententest (C6, v106): Die Unterschrift (E3) lässt sich erst speichern, wenn gezeichnet UND
// ein Name eingetragen ist; gespeichert wird ein PNG. jsdom hat kein Canvas – ersetzt durch einen
// Stift, der nur mitschreibt.

const gezeichnet: string[] = [];
beforeEach(() => {
  gezeichnet.length = 0;
  const ctx = new Proxy({}, {
    get: (_z, name) => (name === "canvas" ? null : typeof name === "string" && /^(font|lineWidth|lineCap|lineJoin|strokeStyle|fillStyle|textAlign|then)$/.test(name) ? undefined : (...a: unknown[]) => { gezeichnet.push(`${String(name)}(${a.filter((x) => typeof x === "string").join(",")})`); }),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (fertig: BlobCallback, typ?: string) { fertig(new Blob(["png"], { type: typ })); });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function zeichnen() {
  const flaeche = screen.getByLabelText("Hier mit dem Finger unterschreiben");
  fireEvent.pointerDown(flaeche, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(flaeche, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(flaeche, { pointerId: 1 });
}

describe("UnterschriftBlatt", () => {
  it("Speichern erst mit Strich und Name; ein PNG mit Satz und Name", async () => {
    const speichern = vi.fn(async () => {});
    const zu = vi.fn();
    render(<UnterschriftBlatt auftragsNr="1042" datum="2026-10-05" vorschlagName="" onSpeichern={speichern} onClose={zu} />);
    const knopf = screen.getByRole("button", { name: "Unterschrift speichern" }) as HTMLButtonElement;
    expect(screen.getByText("Arbeiten zu Auftrag 1042 am 05.10.2026 ausgeführt, Fahrzeug übernommen.")).toBeTruthy();
    expect(knopf.disabled).toBe(true);
    zeichnen();
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name in Druckbuchstaben"), { target: { value: "  Hans Muster " } });
    expect(knopf.disabled).toBe(false);
    fireEvent.click(knopf);
    await waitFor(() => expect(speichern).toHaveBeenCalledTimes(1));
    const [bild, masse, name] = speichern.mock.calls[0] as unknown as [Blob, { breite: number; hoehe: number }, string];
    expect(bild.type).toBe("image/png");
    expect(masse).toEqual({ breite: 960, hoehe: 470 });
    expect(name).toBe("Hans Muster");
    // Satz und Name sind ins Bild gezeichnet, nicht nur daneben gespeichert.
    expect(gezeichnet).toContain("fillText(Arbeiten zu Auftrag 1042 am 05.10.2026 ausgeführt, Fahrzeug übernommen.)");
    expect(gezeichnet).toContain("fillText(Hans Muster)");
    expect(zu).toHaveBeenCalled();
  });

  it("„Leeren“ sperrt wieder", () => {
    render(<UnterschriftBlatt auftragsNr="1" datum="2026-10-05" vorschlagName="Hans" onSpeichern={vi.fn()} onClose={vi.fn()} />);
    zeichnen();
    const knopf = screen.getByRole("button", { name: "Unterschrift speichern" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Leeren" }));
    expect(knopf.disabled).toBe(true);
  });

  it("ohne Netz bleibt das Blatt offen und sagt es", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    const speichern = vi.fn();
    const zu = vi.fn();
    render(<UnterschriftBlatt auftragsNr="1" datum="2026-10-05" vorschlagName="Hans" onSpeichern={speichern} onClose={zu} />);
    zeichnen();
    fireEvent.click(screen.getByRole("button", { name: "Unterschrift speichern" }));
    expect(await screen.findByText(/die Unterschrift geht nur mit Netz/)).toBeTruthy();
    expect(speichern).not.toHaveBeenCalled();
    expect(zu).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FotoBlock, type BelegeImAuftrag } from "@/components/auftraege/FotoBlock";
import type { AuftragBeleg } from "@/lib/types";

// Komponententest (C6, v106): die Karte „Fotos & Unterschrift" (E3). Das Verkleinern braucht ein
// echtes Canvas und ist in lib/belege.ts / im Browser geprüft – hier ersetzt.
vi.mock("@/lib/belegBild", () => ({
  bildVerkleinern: vi.fn(async () => ({ blob: new Blob(["x"], { type: "image/jpeg" }), breite: 1600, hoehe: 1200 })),
}));

const A = "11111111-2222-3333-4444-555555555555";
const beleg = (id: string, art: AuftragBeleg["art"], beschriftung: string | null = null): AuftragBeleg => ({
  id, order_id: A, art, pfad: `${A}/${art}-${id}.jpg`, beschriftung, breite: 1600, hoehe: 1200, bytes: 1, created_at: "2026-10-05T09:00:00Z", created_by: null,
});

function belege(f: Partial<BelegeImAuftrag> = {}): BelegeImAuftrag {
  return {
    liste: [], laedt: false, links: {}, darfHinzufuegen: true, darfLoeschen: false,
    onHochladen: vi.fn(async () => {}), onLoeschen: vi.fn(async () => {}), ...f,
  };
}

function online(wert: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => wert });
}

beforeEach(() => online(true));
afterEach(cleanup);

function foto(container: HTMLElement) {
  const eingabe = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(eingabe, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] } });
}

describe("FotoBlock", () => {
  it("zählt Fotos, gruppiert sie und nennt die Unterschrift", () => {
    render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={() => {}} belege={belege({
      liste: [beleg("1", "nachher"), beleg("2", "vorher", "Felge VL"), beleg("3", "unterschrift", "Hans Muster")],
    })} />);
    expect(screen.getByText("2 Fotos · unterschrieben")).toBeTruthy();
    expect(screen.getByText("Felge VL")).toBeTruthy();
    expect(screen.getByText(/Unterschrieben von Hans Muster/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Neu unterschreiben lassen" })).toBeTruthy();
  });

  it("lädt mit Art und Beschriftung hoch, danach ist die Beschriftung leer", async () => {
    const b = belege();
    const { container } = render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={null} belege={b} />);
    fireEvent.click(screen.getByRole("button", { name: "Schaden" }));
    fireEvent.change(screen.getByLabelText("Beschriftung"), { target: { value: "Kratzer" } });
    foto(container);
    await waitFor(() => expect(b.onHochladen).toHaveBeenCalledTimes(1));
    expect(b.onHochladen).toHaveBeenCalledWith("schaden", expect.any(Blob), { breite: 1600, hoehe: 1200 }, "Kratzer");
    await waitFor(() => expect((screen.getByLabelText("Beschriftung") as HTMLInputElement).value).toBe(""));
  });

  it("zeigt die Ablehnung der Datenbank lesbar an", async () => {
    const b = belege({ onHochladen: vi.fn(async () => { throw new Error("Keine Berechtigung, an diesem Auftrag Fotos abzulegen."); }) });
    const { container } = render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={null} belege={b} />);
    foto(container);
    expect(await screen.findByText("Keine Berechtigung, an diesem Auftrag Fotos abzulegen.")).toBeTruthy();
  });

  it("ohne Netz: Hinweis, kein Hochladen", async () => {
    online(false);
    const b = belege();
    const { container } = render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={null} belege={b} />);
    foto(container);
    expect(await screen.findByText(/Keine Verbindung – Fotos gehen nur mit Netz/)).toBeTruthy();
    expect(b.onHochladen).not.toHaveBeenCalled();
  });

  it("ohne Schreibrecht kein Hinzufügen, ohne Löschrecht kein Löschen", () => {
    render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={() => {}} belege={belege({
      darfHinzufuegen: false, liste: [beleg("1", "vorher")],
    })} />);
    expect(screen.queryByText(/Foto „Vorher“ hinzufügen/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Kunde unterschreiben lassen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Vorher,/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("Löschen fragt nach und ruft erst dann", async () => {
    const b = belege({ darfLoeschen: true, liste: [beleg("1", "vorher")] });
    render(<FotoBlock vorschlagArt="vorher" onUnterschreiben={null} belege={b} />);
    fireEvent.click(screen.getByRole("button", { name: /^Vorher,/ }));
    const frage = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(b.onLoeschen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(b.onLoeschen).toHaveBeenCalledWith(expect.objectContaining({ id: "1" })));
    expect(frage).toHaveBeenCalledTimes(2);
  });
  it("abgeschlossen und unterschrieben: kein neues Unterschreiben, kein Löschen der Unterschrift (Migration 70)", () => {
    render(<FotoBlock vorschlagArt="nachher" unterschriftFest onUnterschreiben={() => {}} belege={belege({
      darfLoeschen: true, liste: [beleg("1", "nachher"), beleg("3", "unterschrift", "Hans Muster")],
    })} />);
    expect(screen.queryByRole("button", { name: "Neu unterschreiben lassen" })).toBeNull();
    expect(screen.getByText(/steht fest, der Auftrag ist abgeschlossen/)).toBeTruthy();
    // Fotos gehen weiter – auch nach dem Abschluss.
    expect(screen.getByText(/Foto „Nachher“ hinzufügen/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Unterschrift: Hans Muster,/ }));
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByRole("button", { name: /^Nachher,/ }));
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("abgeschlossen ohne Unterschrift: Nachholen geht", () => {
    render(<FotoBlock vorschlagArt="nachher" unterschriftFest onUnterschreiben={() => {}} belege={belege()} />);
    expect(screen.getByRole("button", { name: "Kunde unterschreiben lassen" })).toBeTruthy();
  });
});

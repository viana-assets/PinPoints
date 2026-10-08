// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blatt } from "@/components/Blatt";
import { OrderModal } from "@/components/auftraege/OrderModal";
import { AnrufFenster } from "@/components/kunden/AnrufFenster";
import type { Customer } from "@/lib/types";

// Das gemeinsame Fenster (v134, Runde 2 der Designprüfung) und zwei der umgestellten Fenster.

afterEach(cleanup);

const kunde = (id: string, name: string, address: string, mobil: string | null = null) =>
  ({ id, name, address, phone_mobile: mobil, phone_landline: null } as unknown as Customer);

describe("Blatt", () => {
  it("Titel als Überschrift, ✕ und Klick daneben schließen, Fußzeile mit Knöpfen", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Blatt titel="Reifen auslagern" unter="Halle 1" ebene="modal-auslagern" onClose={onClose} fuss={<button type="button">Los</button>}>
        <p>Inhalt</p>
      </Blatt>
    );
    expect(screen.getByRole("dialog", { name: "Reifen auslagern" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reifen auslagern" })).toBeTruthy();
    expect(screen.getByText("Halle 1")).toBeTruthy();
    expect(container.querySelector(".modal-overlay.modal-auslagern")).toBeTruthy();
    expect(container.querySelector(".bl-fuss")?.textContent).toBe("Los");
    fireEvent.click(screen.getByText("Inhalt"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Neuer Auftrag (Kundenauswahl)", () => {
  it("erst mit gewähltem Kunden weiter; Liste erst mit Suchtext", async () => {
    const onWeiter = vi.fn(async () => {});
    render(<OrderModal customers={[kunde("k1", "Petra Maier", "Lindenweg 1"), kunde("k2", "Olaf Seitz", "Hauptstr. 2")]}
      onClose={() => {}} onWeiter={onWeiter} />);
    const weiter = screen.getByRole("button", { name: "Weiter zum Auftrag" }) as HTMLButtonElement;
    expect(weiter.disabled).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(screen.getByLabelText("Kunde suchen"), { target: { value: "seitz" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Olaf SeitzHauptstr. 2"]);
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByText("Olaf Seitz")).toBeTruthy();
    expect(weiter.disabled).toBe(false);
    fireEvent.click(weiter);
    await waitFor(() => expect(onWeiter).toHaveBeenCalledWith("k2"));
  });
});

describe("Anruf-Fenster", () => {
  it("ein Knopf je Rufnummer, Kundenakte unten", () => {
    const onKunde = vi.fn();
    render(<AnrufFenster kunde={kunde("k1", "Petra Maier", "Lindenweg 1", "0170 1234")} onClose={() => {}} onKundeOeffnen={onKunde} />);
    expect(screen.getByRole("link").getAttribute("href")).toMatch(/^tel:/);
    fireEvent.click(screen.getByRole("button", { name: "Kundenakte öffnen" }));
    expect(onKunde).toHaveBeenCalled();
  });
});

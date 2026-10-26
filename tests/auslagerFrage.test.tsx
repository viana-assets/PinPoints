// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuslagerFrage } from "@/components/auftraege/AuslagerFrage";

// v170: Frage vor dem Abschluss – Reifen gehen raus, nichts kommt rein.
afterEach(() => cleanup());
describe("AuslagerFrage", () => {
  it("nennt den Platz und bietet Tausch, anderen Platz und Abschluss", () => {
    const tausch = vi.fn(); const anders = vi.fn(); const fertig = vi.fn();
    render(<AuslagerFrage saetze={[{ id: "t1", platz: "Halle · B7" }]} onTausch={tausch} onAndererPlatz={anders} onAbschliessen={fertig} onClose={vi.fn()} />);
    expect(screen.getByText(/geht ein Satz aus dem Lager/).textContent).toContain("Halle · B7");
    fireEvent.click(screen.getByRole("button", { name: /Tauschen – auf Halle · B7 einlagern/ }));
    expect(tausch).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: "Auf einem anderen Platz einlagern" }));
    expect(anders).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Platz freigeben und abschließen/ }));
    expect(fertig).toHaveBeenCalled();
  });
  it("ohne Tausch-Recht kein Tausch-Knopf; mehrere Sätze", () => {
    render(<AuslagerFrage saetze={[{ id: "a", platz: "A1" }, { id: "b", platz: "A2" }]} onAndererPlatz={vi.fn()} onAbschliessen={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Tauschen/ })).toBeNull();
    expect(screen.getByText(/gehen 2 Sätze aus dem Lager/).textContent).toContain("A1, A2");
    expect(screen.getByRole("button", { name: /Plätze freigeben und abschließen/ })).toBeTruthy();
  });
});

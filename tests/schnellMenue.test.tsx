// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SchnellMenue } from "@/components/SchnellMenue";
import { ChatBlase } from "@/components/chat/ChatBlase";
import { ZeitBlase } from "@/components/zeit/ZeitBlase";

// v159: Stoppuhr und Chat am Handy hinter dem Knopf oben rechts; die Zahl am Knopf summiert die Einträge.
afterEach(() => cleanup());
function zeigen(ungelesen: number, versteckt = false) {
  const zurZeit = vi.fn();
  const zumChat = vi.fn();
  render(<SchnellMenue versteckt={versteckt} eintraege={[
    { key: "zeit", text: "Zeiterfassung", knopf: (zu) => <ZeitBlase schicht={null} versatzMs={0} imMenue onClick={() => { zu(); zurZeit(); }} /> },
    { key: "chat", text: "Team-Chat", zahl: ungelesen, knopf: (zu) => <ChatBlase zahl={ungelesen} imMenue onClick={() => { zu(); zumChat(); }} /> },
  ]} />);
  return { zurZeit, zumChat };
}

describe("SchnellMenue", () => {
  it("zu: nur der Knopf mit der Zahl; auf: beide Einträge mit Beschriftung, ohne Schwebe-Lage", () => {
    zeigen(3);
    const knopf = screen.getByRole("button", { name: "Schnellmenü, 3 neu" });
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    expect(knopf.textContent).toBe("3");
    expect(screen.queryByText("Team-Chat")).toBeNull();
    fireEvent.click(knopf);
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Zeiterfassung")).toBeTruthy();
    const chat = screen.getByRole("button", { name: "Team-Chat, 3 ungelesen" });
    expect(chat.className).toBe("ch-blase im-menue");
    expect(screen.getByRole("button", { name: "Zeiterfassung – einstempeln" }).className).toBe("zt-blase aus im-menue");
  });

  it("ein Eintrag schließt das Menü und führt weiter; Escape und Tipp daneben schließen auch", () => {
    const { zumChat, zurZeit } = zeigen(0);
    const knopf = screen.getByRole("button", { name: "Schnellmenü" });
    fireEvent.click(knopf);
    fireEvent.click(screen.getByRole("button", { name: "Team-Chat" }));
    expect(zumChat).toHaveBeenCalledOnce();
    expect(screen.queryByText("Zeiterfassung")).toBeNull();
    fireEvent.click(knopf);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Zeiterfassung")).toBeNull();
    fireEvent.click(knopf);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Zeiterfassung")).toBeNull();
    fireEvent.click(knopf);
    fireEvent.click(screen.getByRole("button", { name: "Zeiterfassung – einstempeln" }));
    expect(zurZeit).toHaveBeenCalledOnce();
  });

  it("versteckt oder ohne Einträge: nichts", () => {
    zeigen(2, true);
    expect(screen.queryByRole("button", { name: /Schnellmenü/ })).toBeNull();
    cleanup();
    render(<SchnellMenue eintraege={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

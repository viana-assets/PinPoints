// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StempelKarte } from "@/components/zeit/StempelKarte";
import { UhrPille } from "@/components/zeit/UhrPille";
import { ZeitBlase } from "@/components/zeit/ZeitBlase";
import { ZeitTagBlatt } from "@/components/zeit/ZeitPanel";
import type { ZeitSchicht } from "@/lib/zeiterfassung";

// Die Stempeluhr in der Oberfläche (Migration 82, v131).

afterEach(cleanup);
beforeEach(() => { vi.spyOn(window, "confirm").mockReturnValue(true); });

const ort = (tag: string, uhr: string) => new Date(`${tag}T${uhr}:00`).toISOString();
const heute = new Date();
const tag = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-${String(heute.getDate()).padStart(2, "0")}`;
const offen: ZeitSchicht = { id: "s1", profile_id: "ich", beginn: new Date(Date.now() - 3 * 3600_000).toISOString(), ende: null, pausen: [] };

function karte(teil: Partial<Parameters<typeof StempelKarte>[0]> = {}) {
  const onStempeln = vi.fn();
  render(<StempelKarte schicht={null} versatzMs={0} wocheAbgeschlossenMs={0} darfStempeln online laeuft={false} fehler={null} onStempeln={onStempeln} {...teil} />);
  return onStempeln;
}

describe("Stempeluhr", () => {
  it("nicht eingestempelt: Einstempeln", () => {
    const f = karte({ wocheAbgeschlossenMs: (31 * 60 + 20) * 60_000 });
    expect(screen.getByText("Noch nicht eingestempelt")).toBeTruthy();
    expect(screen.getByText("Woche: 31:20 h")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "▶ Einstempeln" }));
    expect(f).toHaveBeenCalledWith("ein");
  });

  it("läuft: Pause und Ausstempeln (mit Rückfrage); in der Pause „Weiter“", () => {
    const f = karte({ schicht: offen });
    expect(screen.getByText(/^3:0\d/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "❚❚ Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "■ Ausstempeln" }));
    expect(f.mock.calls).toEqual([["pause"], ["aus"]]);
    cleanup();
    const g = karte({ schicht: { ...offen, pausen: [{ beginn: new Date(Date.now() - 600_000).toISOString(), ende: null }] } });
    expect(screen.getByText("STEMPELUHR · PAUSE")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "▶ Weiter" }));
    expect(g).toHaveBeenCalledWith("weiter");
  });

  it("ohne Netz gesperrt; ohne Schreibrecht keine Knöpfe", () => {
    karte({ online: false });
    expect((screen.getByRole("button", { name: "▶ Einstempeln" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Stempeln geht nur mit Netz.")).toBeTruthy();
    cleanup();
    karte({ darfStempeln: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("die Anzeige oben rechts nur, solange man eingestempelt ist", () => {
    const { container } = render(<UhrPille schicht={null} versatzMs={0} />);
    expect(container.textContent).toBe("");
    cleanup();
    render(<UhrPille schicht={offen} versatzMs={0} />);
    expect(screen.getByRole("button").textContent).toMatch(/^3:0\d$/);
    cleanup();
    render(<UhrPille schicht={{ ...offen, pausen: [{ beginn: new Date(Date.now() - 6 * 60_000).toISOString(), ende: null }] }} versatzMs={0} />);
    expect(screen.getByRole("button").textContent).toBe("Pause 0:06");
  });
});

describe("Stoppuhr über der Chat-Blase (v132)", () => {
  it("weiß ohne Stempelung, grün mit Zeit, wenn sie läuft; Tipp führt in die Zeiterfassung", () => {
    const onClick = vi.fn();
    render(<ZeitBlase schicht={null} versatzMs={0} onClick={onClick} />);
    const knopf = screen.getByRole("button", { name: "Zeiterfassung – einstempeln" });
    expect(knopf.className).toContain("aus");
    fireEvent.click(knopf);
    expect(onClick).toHaveBeenCalled();
    cleanup();
    render(<ZeitBlase schicht={offen} versatzMs={0} lage="bei-karte" allein onClick={() => {}} />);
    const b = screen.getByRole("button");
    expect(b.className).toBe("zt-blase laeuft bei-karte allein");
    expect(b.textContent).toMatch(/^3:0\d$/);
  });
});

describe("Tag einer Person (Zeiten aller)", () => {
  const s: ZeitSchicht = { id: "s2", profile_id: "mira", beginn: ort(tag, "08:02"), ende: null, pausen: [] };
  function blatt(darfKorrigieren: boolean) {
    const onSpeichern = vi.fn(async () => {});
    const onLoeschen = vi.fn(async () => {});
    render(<ZeitTagBlatt person={{ id: "mira", name: "Mira", rolle: "user" }} tag={tag} schichten={[s]} heute={tag} jetzt={Date.now()}
      darfKorrigieren={darfKorrigieren} onSpeichern={onSpeichern} onLoeschen={onLoeschen} onClose={() => {}} />);
    return { onSpeichern, onLoeschen };
  }

  it("ohne Recht nur ansehen", () => {
    blatt(false);
    expect(screen.getByText("08:02 – jetzt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten ›" })).toBeNull();
    expect(screen.queryByText("+ Schicht nachtragen")).toBeNull();
  });

  it("korrigieren: Ende und Pause eintragen, Grund ist Pflicht", async () => {
    const { onSpeichern } = blatt(true);
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten ›" }));
    fireEvent.change(screen.getByLabelText("Ende"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Pause" }));
    fireEvent.change(screen.getByLabelText("Pause 1 von"), { target: { value: "11:45" } });
    fireEvent.change(screen.getByLabelText("Pause 1 bis"), { target: { value: "12:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Grund/);
    expect(onSpeichern).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "Ausstempeln vergessen" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSpeichern).toHaveBeenCalledWith({
      id: "s2", profileId: "mira", beginn: ort(tag, "08:02"), ende: ort(tag, "14:30"),
      pausen: [{ beginn: ort(tag, "11:45"), ende: ort(tag, "12:15") }], grund: "Ausstempeln vergessen",
    }));
  });

  it("löschen mit Grund", async () => {
    const { onLoeschen } = blatt(true);
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten ›" }));
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "doppelt gestempelt" } });
    fireEvent.click(screen.getByRole("button", { name: "Schicht löschen" }));
    await waitFor(() => expect(onLoeschen).toHaveBeenCalledWith("s2", "doppelt gestempelt"));
  });
});

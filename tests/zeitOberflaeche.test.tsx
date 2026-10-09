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

describe("Urlaub eintragen (v136)", () => {
  it("Grund ist Pflicht; ganzer Tag als Vorgabe; eigene Stunden 6:30 = 390 Minuten", async () => {
    const { UrlaubBlatt } = await import("@/components/zeit/UrlaubBlatt");
    const onSetzen = vi.fn(async () => 3);
    render(<UrlaubBlatt personen={[{ id: "mira", name: "Mira", rolle: "user" }]} vorgabe={{ tag: "2026-10-12" }}
      onSetzen={onSetzen} onLoeschen={vi.fn(async () => 0)} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Grund/);
    fireEvent.change(screen.getByLabelText("bis"), { target: { value: "2026-10-14" } });
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "Urlaubsantrag" } });
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    await waitFor(() => expect(onSetzen).toHaveBeenCalledWith({ profileId: "mira", von: "2026-10-12", bis: "2026-10-14", minuten: 480, grund: "Urlaubsantrag" }));
    expect(await screen.findByText("3 Tage eingetragen.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Eigene Stunden je Tag"), { target: { value: "6:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    await waitFor(() => expect(onSetzen).toHaveBeenLastCalledWith(expect.objectContaining({ minuten: 390 })));
  });

  it("Tag einer Person zeigt Urlaub und die Korrekturen des Tages", () => {
    const k = { id: "k1", schicht_id: null, profile_id: "mira", vorher: null, nachher: { art: "urlaub" as const, tag, minuten: 480 }, grund: "Antrag", von: "jan", am: new Date().toISOString() };
    render(<ZeitTagBlatt person={{ id: "mira", name: "Mira", rolle: "user" }} tag={tag} schichten={[]} urlaubMs={480 * 60_000} korrekturen={[k]}
      nameVon={(id) => (id === "jan" ? "Jan" : "?")} heute={tag} jetzt={Date.now()} darfKorrigieren={false} onSpeichern={async () => {}} onLoeschen={async () => {}} onClose={() => {}} />);
    expect(screen.getByText(/Urlaub 8:00 h$/)).toBeTruthy();
    expect(screen.getByText("Urlaub 8:00 h eingetragen")).toBeTruthy();
    expect(screen.getByText("Grund: Antrag")).toBeTruthy();
    expect(screen.getByText(/· Jan$/)).toBeTruthy();
  });
});

// Feierabend mit Heimfahrt (Migration 85, v138)
import { FeierabendFrage } from "@/components/zeit/FeierabendFrage";

describe("Feierabend und Heimfahrt (v138)", () => {
  it("„Ja, Feierabend“ stempelt aus und schließt; ein Fehler bleibt im Fenster; „Noch nicht“ schließt nur", async () => {
    const onJa = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<FeierabendFrage onJa={onJa} onClose={onClose} />);
    expect(screen.getByText(/0:30 h für die Heimfahrt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ja, Feierabend" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onJa).toHaveBeenCalledTimes(1);
    cleanup();
    const onClose2 = vi.fn();
    render(<FeierabendFrage onJa={async () => { throw new Error("Heute steht noch ein Auftrag an"); }} onClose={onClose2} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja, Feierabend" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/noch ein Auftrag/));
    expect(onClose2).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Noch nicht" }));
    expect(onClose2).toHaveBeenCalled();
  });

  it("Tag zeigt die Heimfahrt; Korrektur kann sie gutschreiben", async () => {
    const zu: ZeitSchicht = { id: "s3", profile_id: "mira", beginn: ort(tag, "07:00"), ende: ort(tag, "08:00"), pausen: [], heimfahrt_minuten: 30 };
    const ohne: ZeitSchicht = { id: "s4", profile_id: "mira", beginn: ort(tag, "09:00"), ende: ort(tag, "10:00"), pausen: [] };
    const onSpeichern = vi.fn(async () => {});
    render(<ZeitTagBlatt person={{ id: "mira", name: "Mira", rolle: "user" }} tag={tag} schichten={[zu, ohne]} heute={tag} jetzt={Date.now()}
      darfKorrigieren onSpeichern={onSpeichern} onLoeschen={vi.fn(async () => {})} onClose={() => {}} />);
    expect(screen.getByText(/0:30 h Heimfahrt gutgeschrieben/)).toBeTruthy();
    expect(screen.getByText(/davon Heimfahrt 0:30 h/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten ›" })[1]);
    fireEvent.click(screen.getByLabelText("Heimfahrt gutschreiben"));
    fireEvent.change(screen.getByLabelText("Grund"), { target: { value: "Rückfahrt vergessen" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSpeichern).toHaveBeenCalledWith(expect.objectContaining({ id: "s4", heimfahrtMinuten: 30, grund: "Rückfahrt vergessen" })));
  });
});

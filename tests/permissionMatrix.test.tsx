// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";

// Komponententest (v124): Rechtematrix mit Einklappen, Zusammenfassung, Hinweisen und „Ansehen als …“.
afterEach(cleanup);

function zeige(modulePermissions = {}) {
  const onUpdate = vi.fn(async () => {});
  render(<PermissionMatrix modulePermissions={modulePermissions} onUpdateModulePermissions={onUpdate} />);
  return onUpdate;
}

describe("PermissionMatrix", () => {
  it("zeigt Module zugeklappt mit Zusammenfassung und klappt auf", () => {
    zeige();
    expect(screen.queryByText("– Räder einzeln messen")).toBeNull();
    expect(screen.getAllByText("11 von 17 erlaubt").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Lager aufklappen" }));
    expect(screen.getByText("– Räder einzeln messen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alle aufklappen" }));
    expect(screen.getByText("– Mitarbeiter einteilen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Alle zuklappen" }));
    expect(screen.queryByText("– Mitarbeiter einteilen")).toBeNull();
  });

  it("speichert einen Haken in einer aufgeklappten Zeile", async () => {
    const onUpdate = zeige();
    fireEvent.click(screen.getByRole("button", { name: "Lager aufklappen" }));
    fireEvent.click(screen.getByRole("button", { name: "– Regale und Plätze verwalten: Schreiben für Techniker" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("lager.regale", "schreiben", ["admin", "techniker"], expect.anything()));
  });

  it("zeigt Hinweise, wenn ein Haken ins Leere läuft", () => {
    zeige({ mitarbeiter: { lesen: ["admin"], schreiben: ["admin"], loeschen: ["admin"] } });
    fireEvent.click(screen.getByRole("button", { name: "Nutzer" }));
    expect(screen.getByText(/1 Hinweis für Nutzer/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aufträge aufklappen" }));
    expect(screen.getByText(/Braucht „Mitarbeiter sehen“/)).toBeTruthy();
  });

  it("„Ansehen als“ zeigt Klartext und die festen Regeln der Rolle", () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: "Ansehen als Techniker" }));
    expect(screen.getByText(/Kann: .*Reifen einlagern und ihre Angaben pflegen/)).toBeTruthy();
    expect(screen.getByText(/Kann nicht: .*den Transporter eines Auftrags einteilen/)).toBeTruthy();
    expect(screen.getByText(/steht er danach selbst darauf/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu den Haken" }));
    expect(screen.getByText("Bereich")).toBeTruthy();
  });
});

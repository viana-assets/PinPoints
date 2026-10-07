// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FahrzeugeBlock } from "@/components/auftraege/FahrzeugeBlock";
import type { AuftragFahrzeug, Vehicle } from "@/lib/types";

// Komponententest (v119): Modell und Reifengröße am Fahrzeug des Auftrags ergänzen
// (Migration 74, `fahrzeug_angaben_ergaenzen()` – auch für den Techniker).
const fahrzeug = { id: "v1", customer_id: "c1", license_plate: "N-AB 1", make_model: null, tire_size: null, note: null } as unknown as Vehicle;
const zeile = { id: "af1", order_id: "o1", vehicle_id: "v1", kilometerstand: null, created_at: "", fahrzeug } as unknown as AuftragFahrzeug & { fahrzeug: Vehicle | null };

function zeige(teil: Partial<Parameters<typeof FahrzeugeBlock>[0]> = {}) {
  const onFahrzeugAngaben = vi.fn(async () => {});
  render(
    <FahrzeugeBlock
      fahrzeuge={[zeile]} alleFahrzeuge={[fahrzeug]}
      onFahrzeugHinzufuegen={async () => {}} onFahrzeugAnlegen={async () => {}}
      onKilometerstand={async () => {}} onFahrzeugEntfernen={async () => {}}
      onFahrzeugAngaben={onFahrzeugAngaben}
      {...teil}
    />
  );
  return onFahrzeugAngaben;
}

describe("FahrzeugeBlock – Modell und Reifengröße", () => {
  afterEach(cleanup);

  it("ergänzt Modell und Reifengröße und schließt die Felder danach", async () => {
    const onFahrzeugAngaben = zeige();
    fireEvent.click(screen.getByRole("button", { name: "Modell / Reifengröße ergänzen" }));
    fireEvent.change(screen.getByLabelText("Marke / Modell"), { target: { value: " VW Golf " } });
    fireEvent.change(screen.getByLabelText("Reifengröße"), { target: { value: "205/55 R16" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onFahrzeugAngaben).toHaveBeenCalledWith("v1", "VW Golf", "205/55 R16"));
    await waitFor(() => expect(screen.queryByLabelText("Reifengröße")).toBeNull());
  });

  it("zeigt den Knopf nicht am abgeschlossenen Auftrag und nicht ohne Handler", () => {
    zeige({ gesperrt: true });
    expect(screen.queryByRole("button", { name: /Modell \/ Reifengröße/ })).toBeNull();
    cleanup();
    zeige({ onFahrzeugAngaben: undefined });
    expect(screen.queryByRole("button", { name: /Modell \/ Reifengröße/ })).toBeNull();
  });

  it("bietet bei vollständigen Angaben „ändern“ an, mit den bisherigen Werten", () => {
    zeige({ fahrzeuge: [{ ...zeile, fahrzeug: { ...fahrzeug, make_model: "Audi A3", tire_size: "225/45 R17" } }] });
    fireEvent.click(screen.getByRole("button", { name: "Modell / Reifengröße ändern" }));
    expect((screen.getByLabelText("Marke / Modell") as HTMLInputElement).value).toBe("Audi A3");
    expect((screen.getByLabelText("Reifengröße") as HTMLInputElement).value).toBe("225/45 R17");
  });
});
